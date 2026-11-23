const {HttpsError} = require('firebase-functions/v2/https');
const {FieldValue} = require('firebase-admin/firestore');
const {validatePrices, verifyRoadRoute} = require('./order-validation');

function couponDiscount(coupon, subtotal) {
  if (!coupon?.active) throw new HttpsError('failed-precondition', 'This coupon is unavailable.');
  if (coupon.expiresAt != null && Date.now() >= coupon.expiresAt) {
    throw new HttpsError('failed-precondition', 'This coupon has expired.');
  }
  if (subtotal < coupon.minimum) {
    throw new HttpsError('failed-precondition', 'This coupon requires an items subtotal of ₹' + coupon.minimum + '.');
  }
  const paise = Math.round(subtotal * 100);
  const discount = coupon.type === 'percent' ? Math.round(paise * coupon.value / 100) : Math.round(coupon.value * 100);
  const savings = Math.min(discount, paise - 1);
  if (!Number.isSafeInteger(savings) || savings <= 0) throw new HttpsError('failed-precondition', 'This coupon gives no discount on this order.');
  return savings / 100;
}

function checkRecipient(coupon, phone) {
  const recipients = coupon?.recipientPhones?.split(',') || (coupon?.recipientPhone ? [coupon.recipientPhone] : []);
  if (recipients.length && !recipients.includes(phone)) {
    throw new HttpsError('failed-precondition', 'This coupon is unavailable for your verified mobile number.');
  }
}

async function checkEligibility(coupon, code, route, history, installation) {
  if (coupon.installedAppOnly && !await installation()) {
    throw new HttpsError('failed-precondition', 'Install Bake & Grill, open it from your app icon, and apply this coupon there.');
  }
  if (coupon.maxRoadKm != null && (!route || route.meters >= coupon.maxRoadKm * 1000)) {
    throw new HttpsError('failed-precondition', 'This coupon is available for delivery under ' + coupon.maxRoadKm + ' km by road.');
  }
  if (coupon.firstOrderOnly || coupon.oncePerCustomer) {
    const orders = (await history()).docs.map(doc => doc.data()).filter(order => order.status !== 'CANCELLED');
    if (coupon.firstOrderOnly && orders.length) {
      throw new HttpsError('failed-precondition', 'This coupon is only for your first order.');
    }
    if (coupon.oncePerCustomer && orders.some(order => order.couponCode === code)) {
      throw new HttpsError('failed-precondition', 'You have already used this coupon.');
    }
  }
}

function orderDetails(order, auth) {
  const {orderId, name, phone, alternatePhone, orderInstructions, address, customerLocation, items, total} = order;
  const {lat, lon} = customerLocation || {};
  if (!/^BG[0-9A-F]{16}$/.test(orderId) || typeof name !== 'string' || !name.trim() || name.length > 80
    || !/^\d{10}$/.test(phone) || auth.token.phone_number !== '+91' + phone
    || (alternatePhone != null && (!/^\d{10}$/.test(alternatePhone) || alternatePhone === phone))
    || typeof address !== 'string' || !address.trim() || address.length > 600
    || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180
    || (lat === 0 && lon === 0) || !Number.isFinite(total) || total <= 0 || total > 100000) {
    throw new HttpsError('invalid-argument', 'Check your contact details and delivery location.');
  }
  const map = 'https://www.google.com/maps?q=' + encodeURIComponent(lat + ',' + lon);
  return {
    orderId, name, phone, ...(alternatePhone ? {alternatePhone} : {}), customerId: auth.uid,
    address, deliveryAddress: address, customerLocation: {lat, lon},
    locationUrl: map, googleMapsUrl: map, mapUrl: map, mapLink: map,
    orderInstructions: String(orderInstructions || '').slice(0, 500),
    distanceKm: Number.isFinite(order.distanceKm) ? order.distanceKm : null,
    routeDurationMin: Number.isFinite(order.routeDurationMin) ? order.routeDurationMin : null,
    distanceType: String(order.distanceType || '').slice(0, 100),
    rule: String(order.rule || '').slice(0, 40),
    minOrder: Number.isFinite(order.minOrder) ? order.minOrder : null,
    total, items
  };
}

async function couponCheckout(db, request) {
  const {auth} = request;
  const {code, order, items, subtotal, expectedDiscount, location, installationId} = request.data || {};
  if (auth?.token.firebase?.sign_in_provider !== 'phone' || !/^\+91\d{10}$/.test(auth.token.phone_number)) {
    throw new HttpsError('unauthenticated', 'Verify your mobile number to apply a coupon.');
  }
  if (typeof code !== 'string' || !/^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'Enter a valid coupon code.');
  }
  const couponRef = db.collection('coupons').doc(code);
  const menuRef = db.collection('menu');
  const phone = auth.token.phone_number.slice(3);
  const history = db.collection('orders').where('phone', '==', phone).select('status', 'couponCode');
  const installation = typeof installationId === 'string' && /^[a-f0-9-]{36}$/.test(installationId)
    ? db.collection('appInstallations').doc(installationId).collection('customers').doc(auth.uid) : null;
  const hasInstallation = async get => Boolean(installation && (await get(installation)).exists);
  if (!order) {
    const [coupon, menu] = await Promise.all([couponRef.get(), menuRef.get()]);
    if (!Number.isFinite(subtotal) || subtotal <= 0 || subtotal > 100000) throw new HttpsError('invalid-argument', 'Add items to your cart.');
    const verified = validatePrices({items, total: subtotal}, new Map(menu.docs.map(doc => [doc.id, doc.data()])));
    const terms = coupon.data();
    checkRecipient(terms, phone);
    const discount = couponDiscount(terms, verified);
    const route = terms.maxRoadKm != null ? await verifyRoadRoute(location) : null;
    await checkEligibility(terms, code, route, () => history.get(), () => hasInstallation(ref => ref.get()));
    return {code, subtotal:verified, discount};
  }
  const details = orderDetails(order, auth);
  const ref = db.collection('orders').doc(details.orderId);
  const previous = (await ref.get()).data();
  if (previous?.customerId === auth.uid && previous.couponCode === code) return {total:previous.total};
  const initialTerms = (await couponRef.get()).data();
  checkRecipient(initialTerms, phone);
  const route = initialTerms?.active && initialTerms.maxRoadKm != null
    ? await verifyRoadRoute(details.customerLocation) : null;
  return db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const data = existing.data();
      if (data.customerId !== auth.uid || data.couponCode !== code) throw new HttpsError('already-exists', 'This order reference is already in use.');
      return {total:data.total};
    }
    const [coupon, menu, delivery] = await Promise.all([
      transaction.get(couponRef), transaction.get(menuRef), transaction.get(db.collection('settings').doc('delivery'))
    ]);
    const settings = delivery.data() || {};
    if (settings.enabled === false || settings.deliveryResumeAt > Date.now()) {
      throw new HttpsError('failed-precondition', 'Delivery is currently paused.');
    }
    const verified = validatePrices(details, new Map(menu.docs.map(doc => [doc.id, doc.data()])));
    const terms = coupon.data();
    checkRecipient(terms, phone);
    const discount = couponDiscount(terms, verified);
    await checkEligibility(terms, code, route, () => transaction.get(history), () => hasInstallation(ref => transaction.get(ref)));
    if (terms.expiresAt != null && Date.now() >= terms.expiresAt) {
      throw new HttpsError('failed-precondition', 'This coupon has expired.');
    }
    if (discount !== expectedDiscount) throw new HttpsError('failed-precondition', 'This coupon changed. Apply it again to see the updated total.');
    const total = (Math.round(verified * 100) - Math.round(discount * 100)) / 100;
    const timestamp = FieldValue.serverTimestamp();
    transaction.create(ref, {...details, subtotal:verified, total, couponCode:code, couponDiscount:discount, status:'NEW', createdAt:timestamp});
    transaction.create(db.collection('publicStatuses').doc(details.orderId), {
      orderId:details.orderId, customerId:auth.uid, status:'NEW', updatedAt:timestamp
    });
    return {total};
  });
}

module.exports = {couponCheckout};

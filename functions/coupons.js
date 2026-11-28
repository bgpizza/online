const {createHash} = require('node:crypto');
const {HttpsError} = require('firebase-functions/v2/https');
const {FieldValue} = require('firebase-admin/firestore');
const {validatePrices, validateStock, verifyRoadRoute, deliveryRule} = require('./order-validation');
const {pickupSlots, pickupAcceptanceDeadline} = require('./pickup-slots');

function couponDiscount(coupon, subtotal) {
  if (!coupon?.active) throw new HttpsError('failed-precondition', 'This coupon is unavailable.');
  if (coupon.startsAt != null && Date.now() < coupon.startsAt) {
    throw new HttpsError('failed-precondition', 'This coupon is not active yet.');
  }
  if (coupon.expiresAt != null && Date.now() >= coupon.expiresAt) {
    throw new HttpsError('failed-precondition', 'This coupon has expired.');
  }
  if (subtotal < coupon.minimum) {
    throw new HttpsError('failed-precondition', 'This coupon requires an items subtotal of ₹' + coupon.minimum + '.');
  }
  const paise = Math.round(subtotal * 100);
  const discount = coupon.type === 'percent' ? Math.round(paise * coupon.value / 100) : Math.round(coupon.value * 100);
  const cap = coupon.type === 'percent' && coupon.maxDiscount != null ? Math.round(coupon.maxDiscount * 100) : Infinity;
  const savings = Math.min(discount, cap, paise - 1);
  if (!Number.isSafeInteger(savings) || savings <= 0) throw new HttpsError('failed-precondition', 'This coupon gives no discount on this order.');
  return savings / 100;
}

function checkRecipient(coupon, phone) {
  const recipients = coupon?.recipientPhones?.split(',') || (coupon?.recipientPhone ? [coupon.recipientPhone] : []);
  if (recipients.length && !recipients.includes(phone)) {
    throw new HttpsError('failed-precondition', 'This coupon is unavailable for your verified mobile number.');
  }
}

function checkOrderScope(coupon, orderType) {
  const scope = coupon.orderScope ?? (coupon.maxRoadKm != null ? 'delivery' : 'both');
  if (scope !== 'both' && scope !== orderType) {
    const method = scope === 'takeaway' ? 'Takeaway' : 'Delivery';
    throw new HttpsError('failed-precondition', 'This coupon is only valid for ' + method + ' orders.');
  }
}

async function checkEligibility(coupon, code, orderType, route, history, installation) {
  if (coupon.installedAppOnly && !await installation()) {
    throw new HttpsError('failed-precondition', 'Install Bake & Grill, open it from your app icon, and apply this coupon there.');
  }
  if (orderType === 'delivery' && coupon.maxRoadKm != null && (!route || route.meters >= coupon.maxRoadKm * 1000)) {
    throw new HttpsError('failed-precondition', 'This coupon is available for delivery under ' + coupon.maxRoadKm + ' km by road.');
  }
  const limit = coupon.oncePerCustomer ? 1 : coupon.maxUsesPerCustomer;
  if (coupon.firstOrderOnly || limit != null) {
    const orders = (await history()).docs.map(doc => doc.data()).filter(order => order.status !== 'CANCELLED');
    if (coupon.firstOrderOnly && orders.length) {
      throw new HttpsError('failed-precondition', 'This coupon is only for your first order.');
    }
    if (limit != null && orders.filter(order => order.couponCode === code).length >= limit) {
      throw new HttpsError('failed-precondition', 'You have reached the usage limit for this coupon.');
    }
  }
}


function orderDetails(order, auth) {
  const {orderId, name, phone, alternatePhone, orderInstructions, address, customerLocation, items, total} = order;
  const {lat, lon} = customerLocation || {};
  const takeaway = order.orderType === 'takeaway';
  const invalidDelivery = typeof address !== 'string' || !address.trim() || address.length > 600
    || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180
    || (lat === 0 && lon === 0);
  if (typeof orderId !== 'string' || !/^BG[0-9A-F]{16}$/.test(orderId) || typeof name !== 'string' || !name.trim() || name.length > 80
    || !/^\d{10}$/.test(phone) || auth.token.phone_number !== '+91' + phone
    || (alternatePhone != null && (!/^\d{10}$/.test(alternatePhone) || alternatePhone === phone))
    || (!takeaway && invalidDelivery) || !Number.isFinite(total) || total <= 0 || total > 100000) {
    throw new HttpsError('invalid-argument', 'Check your contact details and delivery location.');
  }
  if (takeaway) return {
    orderId, name: name.trim(), phone, customerId: auth.uid, orderType: 'takeaway', pickupAt: order.pickupAt,
    orderInstructions: String(orderInstructions || '').slice(0, 500), total, items
  };
  const map = 'https://www.google.com/maps?q=' + encodeURIComponent(lat + ',' + lon);
  return {
    orderId, name, phone, ...(alternatePhone ? {alternatePhone} : {}), customerId: auth.uid,
    orderType: 'delivery', address, deliveryAddress: address, customerLocation: {lat, lon},
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

const DUPLICATE_WINDOW_MS = 60_000;

function checkoutFingerprint(details, code) {
  const items = Array.isArray(details.items) ? details.items : [];
  const quantities = new Map();
  for (const item of items) {
    const extras = Array.isArray(item?.extras) ? item.extras : [];
    const key = JSON.stringify([
      item?.id, item?.size || '',
      extras.map(extra => JSON.stringify([extra?.id, extra?.qty])).sort()
    ]);
    const quantity = Number.isSafeInteger(item?.qty) ? item.qty : 0;
    quantities.set(key, (quantities.get(key) || 0) + quantity);
  }
  const destination = details.orderType === 'takeaway'
    ? details.pickupAt
    : [details.address.trim().replace(/\s+/g, ' ').toLowerCase(),
      details.customerLocation.lat, details.customerLocation.lon];
  return createHash('sha256').update(JSON.stringify([
    details.orderType, destination, details.orderInstructions.trim(), code ?? null,
    Array.from(quantities.entries()).sort()
  ])).digest('hex');
}

async function couponCheckout(db, request) {
  const {auth} = request;
  const {code, order, items, subtotal, expectedDiscount, location, installationId, orderType} = request.data || {};
  if (auth?.token.firebase?.sign_in_provider !== 'phone' || !/^\+91\d{10}$/.test(auth.token.phone_number)) {
    throw new HttpsError('unauthenticated', 'Verify your mobile number to apply a coupon.');
  }
  const hasCoupon = code != null;
  if ((!hasCoupon && !order) || (hasCoupon && (typeof code !== 'string' || !/^[A-Z0-9-][A-Z0-9_-]{0,31}$/.test(code)))) {
    throw new HttpsError('invalid-argument', 'Enter a valid coupon code.');
  }
  const couponRef = hasCoupon ? db.collection('coupons').doc(code) : null;
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
    const method = orderType === 'takeaway' ? 'takeaway' : 'delivery';
    checkOrderScope(terms, method);
    const route = terms.maxRoadKm != null && method === 'delivery' ? await verifyRoadRoute(location) : null;
    await checkEligibility(terms, code, method, route, () => history.get(), () => hasInstallation(ref => ref.get()));
    return {code, subtotal:verified, discount};
  }
  const details = orderDetails(order, auth);
  const ref = db.collection('orders').doc(details.orderId);
  const previous = (await ref.get()).data();
  if (previous?.customerId === auth.uid && (previous.couponCode ?? null) === (code ?? null)) return {total:previous.total, orderId:details.orderId};
  if (previous) throw new HttpsError('already-exists', 'This order reference is already in use.');
  const fingerprint = checkoutFingerprint(details, code);
  const takeaway = details.orderType === 'takeaway';
  const route = takeaway ? null : await verifyRoadRoute(details.customerLocation);
  const rule = route ? deliveryRule(route.meters) : null;
  const submissionLimit = db.collection('orderSubmissionLimits').doc(auth.uid);
  const inventoryGuard = db.collection('orderSubmissionLimits').doc('_inventory');
  const pendingOrders = db.collection('orders').where('status', '==', 'NEW').select('items');
  return db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const data = existing.data();
      if (data.customerId !== auth.uid || (data.couponCode ?? null) !== (code ?? null)) throw new HttpsError('already-exists', 'This order reference is already in use.');
      return {total:data.total, orderId:details.orderId};
    }
    const [coupon, menu, delivery, submissions, stock] = await Promise.all([
      couponRef ? transaction.get(couponRef) : null, transaction.get(menuRef), transaction.get(db.collection('settings').doc('delivery')), transaction.get(submissionLimit), transaction.get(db.collection('stock'))
    ]);
    const now = Date.now();
    const submissionData = submissions.data();
    const recent = (submissionData?.recent || []).filter(time => time > now - 120000);
    const recentCheckouts = (submissionData?.checkouts || [])
      .filter(entry => entry.at > now - DUPLICATE_WINDOW_MS);
    const duplicate = recentCheckouts.find(entry => entry.fingerprint === fingerprint);
    if (duplicate) {
      const original = await transaction.get(db.collection('orders').doc(duplicate.orderId));
      const status = original.data()?.status;
      if (original.data()?.customerId === auth.uid && status && status !== 'CANCELLED') {
        return {total:original.data().total, orderId:original.id};
      }
    }
    if (recent.length >= 3) throw new HttpsError('resource-exhausted', 'Too many orders. Please wait and try again.');
    const settings = delivery.data() || {};
    if (settings.shopEnabled === false) {
      throw new HttpsError('failed-precondition', 'The shop is currently closed.');
    }
    if (route && (settings.enabled === false || settings.deliveryResumeAt > now)) {
      throw new HttpsError('failed-precondition', 'Delivery is currently paused.');
    }
    if (takeaway && !pickupSlots(settings, now).includes(details.pickupAt)) {
      throw new HttpsError('failed-precondition', 'Please select an available pickup time. If it expired, choose a later time.');
    }
    const liveMenu = new Map(menu.docs.map(doc => [doc.id, doc.data()]));
    const verified = validatePrices(details, liveMenu);
    const inventory = new Map(stock.docs.map(doc => [doc.id, doc.data()]));
    const limited = details.items.some(({id, size}) => {
      const entry = inventory.get(id);
      return Number.isSafeInteger(entry?.posOrderLimit) || entry?.posOnlyOne === true
        || Number.isSafeInteger(entry?.posVariantLimits?.[size]);
    });
    let pendingItems = [];
    if (limited) {
      // Serialize checkouts for finite POS stock while orders await acceptance.
      await transaction.get(inventoryGuard);
      const pending = await transaction.get(pendingOrders);
      pendingItems = pending.docs.flatMap(doc => doc.data().items || []);
    }
    validateStock(details.items, inventory, liveMenu, pendingItems);
    if (route && Number.isInteger(settings.maxRoadKm) && settings.maxRoadKm > 0 && route.meters > settings.maxRoadKm * 1000) {
      throw new HttpsError('failed-precondition', 'This address is outside the current delivery area.');
    }
    if (rule && verified < rule.minOrder) {
      throw new HttpsError('failed-precondition', 'The delivery minimum for this address is ₹' + rule.minOrder + '.');
    }
    let discount = 0;
    if (hasCoupon) {
      const terms = coupon.data();
      checkRecipient(terms, phone);
      discount = couponDiscount(terms, verified);
      checkOrderScope(terms, details.orderType);
      await checkEligibility(terms, code, details.orderType, route, () => transaction.get(history), () => hasInstallation(ref => transaction.get(ref)));
      if (terms.expiresAt != null && Date.now() >= terms.expiresAt) {
        throw new HttpsError('failed-precondition', 'This coupon has expired.');
      }
      if (discount !== expectedDiscount) throw new HttpsError('failed-precondition', 'This coupon changed. Apply it again to see the updated total.');
    }
    const total = (Math.round(verified * 100) - Math.round(discount * 100)) / 100;
    const timestamp = FieldValue.serverTimestamp();
    if (limited) transaction.set(inventoryGuard, {updatedAt:timestamp});
    transaction.set(submissionLimit, {
      recent:[...recent, now],
      checkouts:[...recentCheckouts.filter(entry => entry.fingerprint !== fingerprint),
        {fingerprint, orderId:details.orderId, at:now}]
    });
    const acceptBy = takeaway ? pickupAcceptanceDeadline(settings, now, details.pickupAt) : null;
    transaction.create(ref, {
      ...details, ...(acceptBy != null ? {pickupAcceptBy:acceptBy} : {}), subtotal:verified, total, ...(hasCoupon ? {couponCode:code, couponDiscount:discount} : {}),
      ...(route ? {distanceKm:route.meters / 1000, routeDurationMin:route.minutes,
        distanceType:route.source + ' verified road distance', rule:rule.label, minOrder:rule.minOrder} : {}),
      status:'NEW', createdAt:timestamp
    });
    transaction.create(db.collection('publicStatuses').doc(details.orderId), {
      orderId:details.orderId, customerId:auth.uid, orderType:details.orderType, ...(takeaway ? {pickupAt:details.pickupAt} : {}), status:'NEW', updatedAt:timestamp
    });
    return {total, orderId:details.orderId};
  });
}

module.exports = {couponCheckout};

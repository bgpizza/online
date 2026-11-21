const {onDocumentUpdated, onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {getMessaging} = require('firebase-admin/messaging');

initializeApp();
const MASTER_UID = 'f1Gx3tPIigZmqM2ImCzqGQN2xuJ3';
// Deployment refresh: Firestore runtime IAM role updated for Master push token reads.


// Send a high-priority web push to every logged-in Master device when a new order is created.
// Keep burst checks server-side and make delivery of the same event idempotent.
async function checkNewOrderBurst(db, id, uid) {
  if (typeof uid !== 'string' || !uid || uid.includes('/')) return true;
  const orderRef = db.collection('orders').doc(id);
  const counterRef = db.collection('orderBurstLimits').doc(uid);
  return db.runTransaction(async transaction => {
    const [orderSnap, counterSnap] = await Promise.all([
      transaction.get(orderRef), transaction.get(counterRef)
    ]);
    const order = orderSnap.data();
    if (!order || order.status !== 'NEW') return false;
    if (order.burstCheckPassed === true) return true;
    const now = Date.now();
    const recent = (counterSnap.data()?.recent || []).filter(time => time > now - 120000);
    if (recent.length >= 3) {
      const updatedAt = FieldValue.serverTimestamp();
      const cancelReason = 'Too many orders were submitted in a short time. Please wait and try again.';
      transaction.update(orderRef, {status:'CANCELLED', cancelReason, updatedAt});
      transaction.set(db.collection('publicStatuses').doc(id), {status:'CANCELLED', cancelReason, updatedAt}, {merge:true});
      return false;
    }
    transaction.set(counterRef, {recent:[...recent, now]});
    transaction.update(orderRef, {burstCheckPassed:true});
    return true;
  });
}

exports.notifyMasterNewOrderV2 = onDocumentCreated('orders/{orderId}', async (event) => {
  const order = event.data?.data();
  if (!order || String(order.status || 'NEW') !== 'NEW') return;
  const db = getFirestore();
  if (!await checkNewOrderBurst(db, event.params.orderId, order.customerId)) return;
  const snap = await db.collection('masterPushTokens').where('enabled', '==', true).get();
  if (snap.empty) return;
  const tokens = snap.docs.map(d => d.data().token).filter(Boolean);
  if (!tokens.length) return;
  const orderId = event.params.orderId;
  const total = Number(order.total || 0).toLocaleString('en-IN');
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    data: {type:'NEW_ORDER', orderId, orderDocId:event.params.orderId, status:'NEW', title:`🚨 NEW ORDER #${orderId}`, body:`${order.name || 'Customer'} • ₹${total} • ACCEPT NOW`},
    webpush: {
      headers: {Urgency:'high'},
      fcmOptions: {link: `https://bakeandgrill.in/master`}
    }
  });
  const bad=[];
  response.responses.forEach((r,i)=>{if(!r.success && ['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(r.error?.code)) bad.push(tokens[i]);});
  if(bad.length){const batch=db.batch();snap.docs.forEach(d=>{if(bad.includes(d.data().token))batch.delete(d.ref);});await batch.commit();}
});

exports.notifyOrderStatusV2 = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const orderId = event.params.orderId;
  if (!before || !after || before.status === after.status) return;

  const db = getFirestore();
  const snap = await db.collection('pushTokens').where('orderId', '==', orderId).get();
  if (snap.empty) {
    console.info('Customer status push skipped: no token registered for order', orderId);
    return;
  }
  const tokens = snap.docs.map(d => d.data().token).filter(Boolean);
  if (!tokens.length) {
    console.info('Customer status push skipped: no valid FCM tokens for order', orderId);
    return;
  }

  const status = String(after.status || 'UPDATED').toUpperCase();
  const messages = {
    NEW: ['Order received 🍕', 'We received your Bake & Grill order.'],
    CONFIRMED: ['Order confirmed ✅', 'Bake & Grill has accepted your order.'],
    ACCEPTED: ['Order accepted ✅', 'Bake & Grill has accepted your order.'],
    PREPARING: ['Your food is cooking 👨‍🍳', 'Your order is being prepared fresh.'],
    READY: ['Order ready 🔥', 'Your order is ready for pickup/delivery.'],
    OUT_FOR_DELIVERY: ['Out for delivery 🚴', 'Your Bake & Grill order is on the way.'],
    'OUT FOR DELIVERY': ['Out for delivery 🚴', 'Your Bake & Grill order is on the way.'],
    DELIVERED: ['Order delivered 🎉', 'Enjoy your meal from Bake & Grill!'],
    CANCELLED: ['Order cancelled', 'Your Bake & Grill order has been cancelled.']
  };
  const [title, body] = messages[status] || ['Order update 📦', `Your order status is now ${status}.`];

  // Data-only Web Push: the service worker is the single place that displays background notifications.
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    data: {type:'ORDER_STATUS', orderId:String(orderId), status, title, body},
    webpush: {headers: {Urgency:'high', TTL:'86400'}}
  });

  const bad = [];
  response.responses.forEach((r, i) => {
    if (!r.success && ['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(r.error?.code)) bad.push(tokens[i]);
  });
  console.info('Customer status push result', {
    orderId, status, successCount: response.successCount, failureCount: response.failureCount,
    errors: response.responses.filter(r => !r.success).map(r => r.error?.code || 'unknown')
  });
  if (bad.length) {
    const batch = db.batch();
    snap.docs.forEach(d => { if (bad.includes(d.data().token)) batch.delete(d.ref); });
    await batch.commit();
  }
});

// Automatically cancel NEW orders that are not accepted within 2 minutes.
// Check the review deadline again inside the cancellation transaction.
function pendingOrderDeadline(order) {
  const created = order.createdAt?.toMillis?.() ?? new Date(order.createdAt || 0).getTime();
  const started = order.phoneReviewStartedAt?.toMillis?.() ?? 0;
  return Math.max(created + 120000, started ? started + 300000 : 0);
}

exports.autoCancelUnacceptedOrdersV2 = onSchedule({schedule:'every 1 minutes',timeZone:'Asia/Kolkata'}, async () => {
  const db = getFirestore();
  const now = Date.now();
  const snap = await db.collection('orders').where('status','==','NEW').limit(100).get();
  if (snap.empty) return;
  const expired = snap.docs.filter(doc => pendingOrderDeadline(doc.data()) <= now);
  if (!expired.length) return;
  await Promise.all(expired.map(doc => db.runTransaction(async transaction => {
    const current = await transaction.get(doc.ref);
    if (current.data()?.status !== 'NEW' || pendingOrderDeadline(current.data()) > Date.now()) return;
    const updatedAt = FieldValue.serverTimestamp();
    const cancelReason = current.data().phoneReviewStartedAt
      ? 'The restaurant could not confirm the order by phone in time.'
      : 'Restaurant did not accept within 2 minutes';
    transaction.update(doc.ref,{status:'CANCELLED',cancelReason,updatedAt});
    transaction.set(db.collection('publicStatuses').doc(doc.id),{status:'CANCELLED',cancelReason,updatedAt},{merge:true});
  })));
});


// Secure Master-device push test. Only a signed-in email/password Master user can invoke it.
exports.sendMasterPushTestV2 = onCall({region:'us-central1'}, async (request) => {
  let stage = 'authentication';
  try {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in to the Master Site.');
    if (request.auth.uid !== MASTER_UID || request.auth.token.firebase?.sign_in_provider !== 'password') {
      throw new HttpsError('permission-denied', 'Only an authenticated Master account can send a test notification.');
    }

    stage = 'reading enabled Master tokens';
    const db = getFirestore();
    // Use one indexed equality filter only; filter userId in memory to avoid requiring a composite index.
    const snap = await db.collection('masterPushTokens').where('enabled', '==', true).get();
    const ownDocs = snap.docs.filter(doc => doc.data().userId === request.auth.uid);
    const tokenDocs = ownDocs.filter(doc => typeof doc.data().token === 'string' && doc.data().token.length > 20);
    if (!tokenDocs.length) {
      throw new HttpsError('failed-precondition', 'No enabled Master push token was found for this signed-in account. Turn Alerts ON again, then retry.');
    }

    stage = 'sending Firebase Cloud Messaging test';
    const messaging = getMessaging();
    const results = await Promise.all(tokenDocs.map(async doc => {
      try {
        const messageId = await messaging.send({
          token: doc.data().token,
          data: {
            type: 'TEST_PUSH',
            title: 'Bake & Grill — Test Notification',
            body: 'Push notifications are connected on this Master device.'
          },
          webpush: {headers: {Urgency:'high'}}
        });
        return {success:true, messageId};
      } catch (error) {
        return {success:false, code:String(error?.code || 'unknown'), message:String(error?.message || 'FCM send failed').slice(0,240)};
      }
    }));
    const successes = results.filter(x => x.success).length;
    const failures = results.filter(x => !x.success);
    if (!successes) {
      console.error('Master push test: FCM rejected every token', {uid:request.auth.uid, failures});
      throw new HttpsError('internal', 'Firebase FCM rejected the Master token: ' + (failures[0]?.code || 'unknown') + ' — ' + (failures[0]?.message || 'Check Cloud Messaging setup.'));
    }
    return {successCount:successes, failureCount:failures.length};
  } catch (error) {
    console.error('sendMasterPushTestV2 failed at stage:', stage, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Master push test failed while ' + stage + ': ' + String(error?.code || error?.message || 'Unknown server error').slice(0,240));
  }
});

const {validatePrices, deliveryRule, verifyRoadRoute} = require('./order-validation');

exports.acceptVerifiedOrderV2 = onCall({region: 'us-central1'}, async request => {
  if (request.auth?.uid !== MASTER_UID || request.auth.token.firebase?.sign_in_provider !== 'password') {
    throw new HttpsError('permission-denied', 'Sign in with the Master account.');
  }
  const {id, expectedMinutes} = request.data || {};
  if (typeof id !== 'string' || !id || id.includes('/') || !Number.isInteger(expectedMinutes) || expectedMinutes < 15 || expectedMinutes > 240) {
    throw new HttpsError('invalid-argument', 'Select an order and a valid delivery estimate.');
  }
  const db = getFirestore();
  const ref = db.collection('orders').doc(id);
  const pending = await ref.get();
  if (!pending.exists || !await checkNewOrderBurst(db, id, pending.data().customerId)) {
    throw new HttpsError('failed-precondition', 'This order is no longer eligible for acceptance.');
  }
  const initial = await ref.get();
  if (!initial.exists || initial.data().status !== 'NEW') throw new HttpsError('failed-precondition', 'This order is no longer waiting for acceptance.');
  if (pendingOrderDeadline(initial.data()) <= Date.now()) {
    throw new HttpsError('failed-precondition', 'The order acceptance window has expired.');
  }
  const route = await verifyRoadRoute(initial.data().customerLocation);
  const rule = deliveryRule(route.meters);
  return db.runTransaction(async transaction => {
    const [snap, menu, delivery, kitchen] = await Promise.all([
      transaction.get(ref),
      transaction.get(db.collection('menu')),
      transaction.get(db.collection('settings').doc('delivery')),
      transaction.get(db.collection('orders').where('status', 'in', ['ACCEPTED', 'PREPARING']).limit(50))
    ]);
    if (!snap.exists || snap.data().status !== 'NEW' || !snap.updateTime.isEqual(initial.updateTime)) {
      throw new HttpsError('failed-precondition', 'This order changed. Refresh it before accepting.');
    }
    if (delivery.data()?.enabled === false) throw new HttpsError('failed-precondition', 'Delivery is currently paused.');
    const settings = delivery.data() || {};
    if (Number.isInteger(settings.maxRoadKm) && settings.maxRoadKm > 0 && route.meters > settings.maxRoadKm * 1000) {
      throw new HttpsError('failed-precondition', 'This address is outside the current delivery area.');
    }
    if (Number.isInteger(settings.kitchenLimit) && settings.kitchenLimit > 0 && kitchen.size >= settings.kitchenLimit) {
      throw new HttpsError('failed-precondition', 'Kitchen capacity reached. Wait for a kitchen order to become ready.');
    }
    const order = snap.data();
    if (pendingOrderDeadline(order) <= Date.now()) {
      throw new HttpsError('failed-precondition', 'The order acceptance window has expired.');
    }
    const total = validatePrices(order, new Map(menu.docs.map(doc => [doc.id, doc.data()])));
    if (total < rule.minOrder) {
      throw new HttpsError('failed-precondition', `Verified route minimum is ₹${rule.minOrder}. This order is ₹${rule.minOrder - total} short.`);
    }
    const now = Date.now();
    const updatedAt = FieldValue.serverTimestamp();
    const distanceKm = route.meters / 1000;
    transaction.update(ref, {
      status: 'ACCEPTED', acceptedAt: now, expectedDeliveryMinutes: expectedMinutes, updatedAt,
      statusHistory: FieldValue.arrayUnion({status: 'ACCEPTED', at: now, by: request.auth.uid}),
      total, minOrder: rule.minOrder, rule: rule.label, distanceKm,
      distanceType: route.source + ' verified road distance', routeDurationMin: route.minutes
    });
    transaction.set(db.collection('publicStatuses').doc(id), {
      orderId: id, customerId: order.customerId, status: 'ACCEPTED',
      acceptedAt: now, expectedDeliveryMinutes: expectedMinutes, updatedAt
    }, {merge: true});
    return {total, minOrder: rule.minOrder, distanceKm};
  });
});

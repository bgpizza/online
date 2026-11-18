const {onDocumentUpdated, onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const {getMessaging} = require('firebase-admin/messaging');

initializeApp();
// Deployment refresh: Firestore runtime IAM role updated for Master push token reads.


// Send a high-priority web push to every logged-in Master device when a new order is created.
exports.notifyMasterNewOrderV2 = onDocumentCreated('orders/{orderId}', async (event) => {
  const order = event.data?.data();
  if (!order || String(order.status || 'NEW') !== 'NEW') return;
  const db = getFirestore();
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
exports.autoCancelUnacceptedOrdersV2 = onSchedule({schedule:'every 1 minutes',timeZone:'Asia/Kolkata'}, async () => {
  const db = getFirestore();
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);
  const snap = await db.collection('orders').where('status','==','NEW').limit(100).get();
  if (snap.empty) return;
  const expired = snap.docs.filter(doc => { const created = doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : doc.data().createdAt; return created && new Date(created).getTime() <= cutoff.getTime(); });
  if (!expired.length) return;
  const batch = db.batch();
  expired.forEach(doc => {
    batch.update(doc.ref,{status:'CANCELLED',cancelReason:'Restaurant did not accept within 2 minutes',updatedAt:new Date()});
    batch.set(db.collection('publicStatuses').doc(doc.id),{status:'CANCELLED',cancelReason:'Restaurant did not accept within 2 minutes',updatedAt:new Date()},{merge:true});
  });
  await batch.commit();
});


// Secure Master-device push test. Only a signed-in email/password Master user can invoke it.
exports.sendMasterPushTestV2 = onCall({region:'us-central1'}, async (request) => {
  let stage = 'authentication';
  try {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in to the Master Site.');
    if (request.auth.token.firebase?.sign_in_provider !== 'password') {
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

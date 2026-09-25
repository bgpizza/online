const {onDocumentUpdated, onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const {getMessaging} = require('firebase-admin/messaging');

initializeApp();


// Send a high-priority web push to every logged-in Master device when a new order is created.
exports.notifyMasterNewOrder = onDocumentCreated('orders/{orderId}', async (event) => {
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
      fcmOptions: {link: `https://bgpizza.github.io/online/master.html`}
    }
  });
  const bad=[];
  response.responses.forEach((r,i)=>{if(!r.success && ['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(r.error?.code)) bad.push(tokens[i]);});
  if(bad.length){const batch=db.batch();snap.docs.forEach(d=>{if(bad.includes(d.data().token))batch.delete(d.ref);});await batch.commit();}
});

exports.notifyOrderStatus = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const orderId = event.params.orderId;
  if (!before || !after || before.status === after.status) return;

  const db = getFirestore();
  const snap = await db.collection('pushTokens').where('orderId', '==', orderId).get();
  if (snap.empty) return;

  const tokens = snap.docs.map(d => d.data().token).filter(Boolean);
  if (!tokens.length) return;

  const status = String(after.status || 'UPDATED');
  const messages = {
    NEW: ['Order received 🍕', 'We received your Bake & Grill order.'],
    CONFIRMED: ['Order confirmed ✅', 'Your Bake & Grill order is confirmed.'],
    PREPARING: ['Your food is cooking 👨‍🍳', 'Your order is being prepared fresh.'],
    READY: ['Order ready 🔥', 'Your order is ready for pickup/delivery.'],
    OUT_FOR_DELIVERY: ['Out for delivery 🚴', 'Your Bake & Grill order is on the way.'],
    DELIVERED: ['Order delivered 🎉', 'Enjoy your meal from Bake & Grill!'],
    CANCELLED: ['Order cancelled', 'Your Bake & Grill order has been cancelled.']
  };
  const [title, body] = messages[status] || ['Order update 📦', `Your order status is now ${status}.`];

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: {title, body},
    data: {orderId, status},
    webpush: {
      fcmOptions: {link: `https://bgpizza.github.io/online/track.html?order=${encodeURIComponent(orderId)}`},
      notification: {icon: 'https://bgpizza.github.io/online/assets/icon-192.png', badge: 'https://bgpizza.github.io/online/assets/icon-192.png'}
    }
  });

  const bad = [];
  response.responses.forEach((r, i) => {
    if (!r.success && ['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(r.error?.code)) bad.push(tokens[i]);
  });
  if (bad.length) {
    const batch = db.batch();
    snap.docs.forEach(d => { if (bad.includes(d.data().token)) batch.delete(d.ref); });
    await batch.commit();
  }
});


// Automatically cancel NEW orders that are not accepted within 2 minutes.
exports.autoCancelUnacceptedOrders = onSchedule({schedule:'every 1 minutes',timeZone:'Asia/Kolkata'}, async () => {
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

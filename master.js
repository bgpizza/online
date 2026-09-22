const $=s=>document.querySelector(s);
const MASTER_AUTH_KEY="bake_grill_firebase_admin_v1";
const STATUS_LIST=["NEW","ACCEPTED","PREPARING","READY","OUT FOR DELIVERY","DELIVERED","CANCELLED"];
let stock={}; let unsubscribeOrders=null; let unsubscribeStock=null;
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function showMasterApp(){document.getElementById("loginGate").style.display="none";document.getElementById("masterApp").style.display="block";}
function showLogin(){document.getElementById("loginGate").style.display="flex";document.getElementById("masterApp").style.display="none";}
function renderStock(){
  const q=$("#search").value.toLowerCase().trim(), f=$("#filter").value;
  const rows=MENU_ITEMS.filter(x=>(f==="all"||x.category===f)&&(!q||x.name.toLowerCase().includes(q)||x.id.toLowerCase().includes(q)));
  $("#stockTable").innerHTML=rows.map(x=>{const s=stock[x.id]||{qty:"",active:true};const qty=s.qty===""?"":Number(s.qty),cls=s.active?"available":"out";return `<tr><td><b>${esc(x.id)}</b></td><td><b>${esc(x.name)}</b></td><td>${esc(x.category)}</td><td><input class="qty-input" type="number" min="0" value="${qty}" data-id="${esc(x.id)}"></td><td><select class="status ${cls}" data-id="${esc(x.id)}"><option value="on" ${s.active!==false?"selected":""}>Available</option><option value="off" ${s.active===false?"selected":""}>Out of Stock</option></select></td></tr>`}).join("");
  document.querySelectorAll(".qty-input").forEach(el=>el.oninput=()=>{const s=stock[el.dataset.id]||{qty:"",active:true};s.qty=el.value===""?"":Math.max(0,Number(el.value));stock[el.dataset.id]=s});
  document.querySelectorAll(".status").forEach(el=>el.onchange=()=>{const s=stock[el.dataset.id]||{qty:"",active:true};s.active=el.value==="on";stock[el.dataset.id]=s;renderStock();});
  updateSummary();
}
function updateSummary(){const all=MENU_ITEMS.map(x=>stock[x.id]||{qty:"",active:true}),available=all.filter(s=>s.active!==false),out=all.filter(s=>s.active===false),low=all.filter(s=>s.active!==false&&s.qty!==""&&Number(s.qty)<=5);$("#totalItems").textContent=all.length;$("#availableItems").textContent=available.length;$("#outItems").textContent=out.length;$("#lowItems").textContent=low.length;}
async function saveStock(){if(!firebaseReady)return alert("Firebase is not configured.");const batch=db.batch();MENU_ITEMS.forEach(x=>batch.set(db.collection("stock").doc(x.id),stock[x.id]||{qty:"",active:true},{merge:true}));await batch.commit();alert("Stock saved to Firebase. All customer devices will update automatically.")}
async function setAll(active){if(!firebaseReady)return; if(!active&&!confirm("Mark every item as Out of Stock?"))return;const batch=db.batch();MENU_ITEMS.forEach(x=>batch.set(db.collection("stock").doc(x.id),{active,qty:(stock[x.id]?.qty??"")},{merge:true}));await batch.commit();}
function renderOrders(snapshot){
  const f=$("#orderFilter")?.value||"ALL", all=[]; snapshot.forEach(d=>all.push(d.data())); all.sort((a,b)=>String(b.createdAt?.toDate?.()||b.createdAt||"").localeCompare(String(a.createdAt?.toDate?.()||a.createdAt||"")));
  const rows=f==="ALL"?all:all.filter(o=>o.status===f);
  $("#ordersTable").innerHTML=rows.length?rows.map(o=>{const closed=o.status==="DELIVERED"||o.status==="CANCELLED";return `<tr><td><b>${esc(o.orderId)}</b></td><td>${esc(o.name)}<br><small>${esc(o.phone)}</small><br><small>${esc(o.address)}</small></td><td>₹${Number(o.total||0).toLocaleString("en-IN")}</td><td>${Number(o.distanceKm||0).toFixed(1)} KM</td><td><select class="order-status" data-id="${esc(o.orderId)}" ${closed?"disabled":""}>${STATUS_LIST.map(s=>`<option ${o.status===s?"selected":""}>${s}</option>`).join("")}</select>${closed?`<small class="closed-status">🔒 ${esc(o.status)} — closed</small>`:""}</td><td><select class="driver-select" data-id="${esc(o.orderId)}"><option value="">Unassigned</option>${window.deliveryDrivers.map(d=>`<option value="${esc(d.uid)}" ${o.deliveryBoyId===d.uid?'selected':''}>${esc(d.name||d.uid)}</option>`).join('')}</select></td><td><button class="status-wa" data-id="${esc(o.orderId)}" data-phone="${esc(o.phone)}">💬 Send Status</button></td><td>${formatDate(o.createdAt)}</td></tr>`}).join(""):`<tr><td colspan="8">No orders found.</td></tr>`;
  document.querySelectorAll(".order-status").forEach(el=>el.onchange=()=>updateStatus(el.dataset.id,el.value));
  document.querySelectorAll(".status-wa").forEach(el=>el.onclick=()=>sendStatusWhatsApp(el.dataset.id,el.dataset.phone)); document.querySelectorAll(".driver-select").forEach(el=>el.onchange=()=>assignDriver(el.dataset.id,el.value));
}
function formatDate(v){try{return v?.toDate?v.toDate().toLocaleString():new Date(v).toLocaleString()}catch(e){return ""}}
async function updateStatus(id,status){try{const snap=await db.collection("orders").doc(id).get();if(!snap.exists){alert("Order not found.");return}const current=snap.data().status;if(current==="DELIVERED"||current==="CANCELLED"){alert("This order is closed. Delivered/CANCELLED status cannot be changed.");renderOrders(await db.collection("orders").get());return}const order=snap.data(); await db.collection("orders").doc(id).update({status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); await db.collection("publicStatuses").doc(id).set({status,deliveryBoyId:order.deliveryBoyId||null,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});}catch(e){console.error(e);alert("Status update failed.")}}
function sendStatusWhatsApp(id,phone){const status=document.querySelector(`.order-status[data-id="${CSS.escape(id)}"]`)?.value||"UPDATED";const msg=`📦 *BAKE & GRILL ORDER UPDATE*\n\n🆔 Order ID: ${id}\n📌 Status: *${status}*\n\nThank you for ordering from Bake & Grill.`;window.open(`https://wa.me/${String(phone).replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`,"_blank")}
window.deliveryDrivers=[]; let unsubscribeDrivers=null;
function loadDrivers(){ if(!rtdb)return; unsubscribeDrivers?.(); unsubscribeDrivers=rtdb.ref('deliveryBoys').on('value',snap=>{window.deliveryDrivers=[];snap.forEach(c=>window.deliveryDrivers.push({uid:c.key,...c.val()}));renderDrivers(); db.collection('orders').get().then(renderOrders);}); }
function renderDrivers(){const el=document.querySelector('#driversTable'); if(!el)return; el.innerHTML=window.deliveryDrivers.map(d=>`<tr><td>${esc(d.name||'')}</td><td>${esc(d.phone||'')}</td><td>${esc(d.email||'')}</td><td><b>${esc(d.role||'delivery')}</b></td><td><small>${esc(d.uid)}</small></td><td>${d.active===false?'OFF':'ON'}</td><td><button class="danger remove-driver" data-uid="${esc(d.uid)}" data-name="${esc(d.name||d.uid)}">🗑️ Remove</button></td></tr>`).join('')||'<tr><td colspan="7">No delivery partners.</td></tr>'; document.querySelectorAll('.remove-driver').forEach(b=>b.onclick=()=>removeDriver(b.dataset.uid,b.dataset.name));}
async function removeDriver(uid,name){if(!uid)return; if(!confirm(`Remove ${name} from Delivery Partners?

This will remove their delivery profile and prevent the delivery dashboard from recognizing the account. The Firebase Authentication login itself cannot be deleted securely from a browser-only GitHub Pages app.`))return; try{const updates={}; updates['deliveryBoys/'+uid]=null; updates['users/'+uid]=null; await rtdb.ref().update(updates);
    await db.collection('users').doc(uid).delete(); const snap=await db.collection('orders').where('deliveryBoyId','==',uid).get(); const batch=db.batch(); snap.forEach(doc=>batch.update(doc.ref,{deliveryBoyId:null,updatedAt:firebase.firestore.FieldValue.serverTimestamp()})); await batch.commit(); alert('Delivery Boy removed from the active system. The Firebase Authentication account remains; full account deletion requires a server-side Firebase Admin/Cloud Function.');}catch(e){console.error(e);alert('Could not remove Delivery Boy: '+e.message)}}
async function assignDriver(orderId,uid){try{await db.collection('orders').doc(orderId).update({deliveryBoyId:uid||null,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});}catch(e){alert('Assignment failed: '+e.message);}}
let secondaryApp=null, secondaryAuth=null;
function getSecondaryAuth(){
  if(!secondaryApp){ secondaryApp=firebase.initializeApp(window.FIREBASE_CONFIG,'DeliveryAccountCreator'); secondaryAuth=secondaryApp.auth(); }
  return secondaryAuth;
}
async function addDriver(){
  const name=$('#driverName').value.trim(), phone=$('#driverPhone').value.trim(), email=$('#driverEmail').value.trim(), password=$('#driverPassword').value;
  const msg=$('#driverFormMsg');
  if(!name||!email||password.length<6){msg.textContent='Name, email and a password of at least 6 characters are required.';return;}
  if(!firebaseReady||!auth||!db||!rtdb){msg.textContent='❌ Firebase is not ready. Check Firebase configuration.';return;}
  const btn=$('#addDriver'); btn.disabled=true; msg.textContent='Creating Delivery Boy account…';
  let secAuth=null, cred=null, uid=null;
  try{
    // Use a secondary Firebase Auth app so the Master session is not logged out.
    secAuth=getSecondaryAuth();
    cred=await secAuth.createUserWithEmailAndPassword(email,password);
    uid=cred.user.uid;

    // IMPORTANT: create Firestore profile FIRST. This makes the exact failure visible
    // instead of failing earlier on Realtime Database and never reaching Firestore.
    msg.textContent='✅ Authentication account created. Saving Firestore profile…';
    await db.collection('users').doc(uid).set({
      uid, name, phone, email, role:'delivery', active:true,
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});

    msg.textContent='Firestore profile saved. Saving delivery profile…';
    await rtdb.ref('deliveryBoys/'+uid).set({
      name, phone, email, role:'delivery', active:true,
      createdAt:firebase.database.ServerValue.TIMESTAMP
    });

    msg.textContent='Delivery profile saved. Finalizing…';
    await rtdb.ref('users/'+uid).set({
      name, phone, email, role:'delivery', active:true,
      createdAt:firebase.database.ServerValue.TIMESTAMP
    });

    await secAuth.signOut();
    $('#driverName').value='';$('#driverPhone').value='';$('#driverEmail').value='';$('#driverPassword').value='';
    msg.textContent=`✅ Delivery Boy created successfully. UID: ${uid}`;
    loadDrivers();
  }catch(e){
    console.error('Delivery Boy creation failed:',e);
    let m=e?.message||'Could not create account.';
    if(e.code==='auth/email-already-in-use') m='This email is already registered in Firebase Authentication.';
    else if(e.code==='auth/operation-not-allowed') m='Firebase Authentication → Sign-in method → Email/Password is not enabled.';
    else if(e.code==='permission-denied') m='Permission denied. Publish the included Firestore Rules and Realtime Database Rules with the correct Master UID.';
    msg.textContent=`❌ ${m}${uid?' (Auth UID: '+uid+')':''}`;
    // If the Auth account was created but profile setup failed, remove the new Auth
    // account through the still-signed-in secondary user. This prevents orphan users.
    try{ if(secAuth?.currentUser) await secAuth.currentUser.delete(); }catch(cleanErr){
      console.warn('Automatic Auth cleanup failed:',cleanErr);
      if(secAuth) try{await secAuth.signOut()}catch(_e){}
    }
  }finally{btn.disabled=false;}
}
function startRealtime(){
  unsubscribeStock?.(); unsubscribeOrders?.();
  unsubscribeStock=db.collection("stock").onSnapshot(s=>{stock={};s.forEach(d=>stock[d.id]=d.data());renderStock()},e=>console.error(e));
  unsubscribeOrders=db.collection("orders").onSnapshot(renderOrders,e=>{console.error(e);$("#ordersTable").innerHTML='<tr><td colspan="8">Could not load orders.</td></tr>'});
}
async function init(){
  if(!firebaseReady){showLogin();$("#loginError").textContent="Firebase is not configured. Edit firebase-config.js first.";return;}
  $("#filter").innerHTML='<option value="all">All Categories</option>'+[...new Set(MENU_ITEMS.map(x=>x.category))].map(c=>`<option>${esc(c)}</option>`).join("");
  $("#search").oninput=renderStock;$("#filter").onchange=renderStock;$("#orderFilter").onchange=()=>{if(unsubscribeOrders){};db.collection("orders").get().then(renderOrders)};
  $("#addDriver").onclick=addDriver;$("#saveAll").onclick=saveStock;$("#allOn").onclick=()=>setAll(true);$("#allOff").onclick=()=>setAll(false);$("#logoutBtn")?.addEventListener("click",()=>auth.signOut());
  auth.onAuthStateChanged(user=>{if(user){showMasterApp();loadDrivers();startRealtime();}else{unsubscribeOrders?.();unsubscribeStock?.();showLogin();}});
  $("#loginForm").addEventListener("submit",async e=>{e.preventDefault();$("#loginError").textContent="";try{await auth.signInWithEmailAndPassword($("#loginId").value.trim(),$("#loginPassword").value)}catch(err){$("#loginError").textContent=err.message.replace("Firebase: ","")}});
}
init();

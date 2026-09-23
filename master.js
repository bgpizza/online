const $=s=>document.querySelector(s);
const MASTER_AUTH_KEY="bake_grill_firebase_admin_v1";
const STATUS_LIST=["NEW","ACCEPTED","PREPARING","READY","OUT FOR DELIVERY","DELIVERED","CANCELLED"];
let stock={}; let liveMenu={}; let unsubscribeOrders=null; let unsubscribeStock=null; let unsubscribeMenu=null; let unsubscribeDelivery=null; let deliveryEnabled=true;
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
function renderMenuEditor(){
  const list=MENU_ITEMS.map(x=>liveMenu[x.id]?{...x,...liveMenu[x.id]}:x);
  const el=$("#menuEditTable"); if(!el)return;
  el.innerHTML=list.map(x=>`<tr><td><b>${esc(x.id)}</b></td><td><b>${esc(x.name)}</b><br><small>${esc(x.description||"")}</small></td><td>${esc(x.category)}</td><td><button class="primary edit-item" data-id="${esc(x.id)}">✏️ Edit</button></td></tr>`).join("");
  document.querySelectorAll(".edit-item").forEach(b=>b.onclick=()=>openItemEditor(b.dataset.id));
}
function openItemEditor(id){
  const base=MENU_ITEMS.find(x=>x.id===id); if(!base)return;
  const x=liveMenu[id]?{...base,...liveMenu[id]}:base;
  $("#editId").value=x.id; $("#editName").value=x.name||""; $("#editDescription").value=x.description||"";
  const cats=[...new Set(MENU_ITEMS.map(i=>i.category))]; $("#editCategory").innerHTML=cats.map(c=>`<option ${x.category===c?"selected":""}>${esc(c)}</option>`).join("");
  const pizza=x.type==="pizza" || x.prices;
  $("#editPizzaPrices").style.display=pizza?"grid":"none"; $("#editSinglePriceWrap").style.display=pizza?"none":"block";
  if(pizza){$("#editEkla").value=x.prices?.["Ekla Bite"]??"";$("#editBondhu").value=x.prices?.["Bondhu Bite"]??"";$("#editFamily").value=x.prices?.["Family Bite"]??"";} else $("#editPrice").value=x.price??"";
  $("#itemEditMsg").textContent=""; $("#itemEditModal").style.display="flex";
}
function closeItemEditor(){$("#itemEditModal").style.display="none";}
async function saveItemEditor(){
  const id=$("#editId").value, base=MENU_ITEMS.find(x=>x.id===id); if(!base)return;
  const data={name:$("#editName").value.trim(),description:$("#editDescription").value.trim(),category:$("#editCategory").value,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
  if(!data.name){$("#itemEditMsg").textContent="Name is required.";return;}
  if(base.type==="pizza" || base.prices){data.prices={"Ekla Bite":Number($("#editEkla").value||0),"Bondhu Bite":Number($("#editBondhu").value||0),"Family Bite":Number($("#editFamily").value||0)};}else data.price=Number($("#editPrice").value||0);
  try{await db.collection("menu").doc(id).set(data,{merge:true});$("#itemEditMsg").textContent="✅ Saved. Customer site will update automatically.";setTimeout(closeItemEditor,600);}catch(e){console.error(e);$("#itemEditMsg").textContent="❌ Save failed: "+e.message;}
}
async function toggleDelivery(){
  if(!firebaseReady)return;
  const next=!deliveryEnabled;
  try{await db.collection("settings").doc("delivery").set({enabled:next,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:auth.currentUser?.uid||null},{merge:true});}
  catch(e){alert("Delivery setting failed: "+e.message);}
}
function renderDeliveryControl(){const b=$("#deliveryToggle"),t=$("#deliveryStateText");if(!b||!t)return;b.textContent=deliveryEnabled?"⛔ Turn Delivery OFF":"🚚 Turn Delivery ON";b.className=deliveryEnabled?"danger":"primary";t.textContent=deliveryEnabled?"🚚 Delivery is ON":"⛔ Delivery is OFF";}
function renderOrders(snapshot){
  const f=$("#orderFilter")?.value||"ALL", all=[]; snapshot.forEach(d=>all.push(d.data())); all.sort((a,b)=>String(b.createdAt?.toDate?.()||b.createdAt||"").localeCompare(String(a.createdAt?.toDate?.()||a.createdAt||"")));
  const rows=f==="ALL"?all:all.filter(o=>o.status===f);
  $("#ordersTable").innerHTML=rows.length?rows.map(o=>{const closed=o.status==="DELIVERED"||o.status==="CANCELLED";return `<tr><td><b>${esc(o.orderId)}</b></td><td>${esc(o.name)}<br><small>${esc(o.phone)}</small><br><small>${esc(o.address)}</small></td><td>₹${Number(o.total||0).toLocaleString("en-IN")}</td><td>${Number(o.distanceKm||0).toFixed(1)} KM</td><td><select class="order-status" data-id="${esc(o.orderId)}" ${closed?"disabled":""}>${STATUS_LIST.map(s=>`<option ${o.status===s?"selected":""}>${s}</option>`).join("")}</select>${closed?`<small class="closed-status">🔒 ${esc(o.status)} — closed</small>`:""}</td><td><button class="status-wa" data-id="${esc(o.orderId)}" data-phone="${esc(o.phone)}">💬 Send Status</button></td><td>${formatDate(o.createdAt)}</td></tr>`}).join(""):`<tr><td colspan="7">No orders found.</td></tr>`;
  document.querySelectorAll(".order-status").forEach(el=>el.onchange=()=>updateStatus(el.dataset.id,el.value));
  document.querySelectorAll(".status-wa").forEach(el=>el.onclick=()=>sendStatusWhatsApp(el.dataset.id,el.dataset.phone));
}
function formatDate(v){try{return v?.toDate?v.toDate().toLocaleString():new Date(v).toLocaleString()}catch(e){return ""}}
async function updateStatus(id,status){try{const snap=await db.collection("orders").doc(id).get();if(!snap.exists){alert("Order not found.");return}const current=snap.data().status;if(current==="DELIVERED"||current==="CANCELLED"){alert("This order is closed. Delivered/CANCELLED status cannot be changed.");renderOrders(await db.collection("orders").get());return}await db.collection("orders").doc(id).update({status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});await db.collection("publicStatuses").doc(id).set({status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});}catch(e){console.error(e);alert("Status update failed.")}}
function sendStatusWhatsApp(id,phone){const status=document.querySelector(`.order-status[data-id="${CSS.escape(id)}"]`)?.value||"UPDATED";const msg=`📦 *BAKE & GRILL ORDER UPDATE*\n\n🆔 Order ID: ${id}\n📌 Status: *${status}*\n\nThank you for ordering from Bake & Grill.`;window.open(`https://wa.me/${String(phone).replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`,"_blank")}
function startRealtime(){
  unsubscribeStock?.(); unsubscribeOrders?.(); unsubscribeMenu?.(); unsubscribeDelivery?.();
  unsubscribeStock=db.collection("stock").onSnapshot(s=>{stock={};s.forEach(d=>stock[d.id]=d.data());renderStock()},e=>console.error(e));
  unsubscribeMenu=db.collection("menu").onSnapshot(s=>{liveMenu={};s.forEach(d=>liveMenu[d.id]=d.data());renderMenuEditor()},e=>console.error(e));
  unsubscribeDelivery=db.collection("settings").doc("delivery").onSnapshot(d=>{deliveryEnabled=d.exists?d.data().enabled!==false:true;renderDeliveryControl()},e=>console.error(e));
  unsubscribeOrders=db.collection("orders").onSnapshot(renderOrders,e=>{console.error(e);$("#ordersTable").innerHTML='<tr><td colspan="7">Could not load orders.</td></tr>'});
  renderMenuEditor();
}
async function init(){
  if(!firebaseReady){showLogin();$("#loginError").textContent="Firebase is not configured. Edit firebase-config.js first.";return;}
  $("#filter").innerHTML='<option value="all">All Categories</option>'+[...new Set(MENU_ITEMS.map(x=>x.category))].map(c=>`<option>${esc(c)}</option>`).join("");
  $("#search").oninput=renderStock;$("#filter").onchange=renderStock;$("#orderFilter").onchange=()=>{if(unsubscribeOrders){};db.collection("orders").get().then(renderOrders)};
  $("#saveAll").onclick=saveStock;$("#allOn").onclick=()=>setAll(true);$("#allOff").onclick=()=>setAll(false);$("#deliveryToggle").onclick=toggleDelivery;$("#closeItemEdit").onclick=closeItemEditor;$("#saveItemEdit").onclick=saveItemEditor;$("#itemEditModal")?.addEventListener("click",e=>{if(e.target.id==="itemEditModal")closeItemEditor();});$("#logoutBtn")?.addEventListener("click",()=>auth.signOut());
  auth.onAuthStateChanged(user=>{if(user){showMasterApp();startRealtime();}else{unsubscribeOrders?.();unsubscribeStock?.();unsubscribeMenu?.();unsubscribeDelivery?.();showLogin();}});
  $("#loginForm").addEventListener("submit",async e=>{e.preventDefault();$("#loginError").textContent="";try{await auth.signInWithEmailAndPassword($("#loginId").value.trim(),$("#loginPassword").value)}catch(err){$("#loginError").textContent=err.message.replace("Firebase: ","")}});
}
init();

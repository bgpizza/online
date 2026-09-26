const $=s=>document.querySelector(s);
const MASTER_AUTH_KEY="bake_grill_firebase_admin_v1";
const STATUS_LIST=["NEW","ACCEPTED","PREPARING","READY","OUT FOR DELIVERY","DELIVERED","CANCELLED"];
let stock={}; let liveMenu={}; let unsubscribeOrders=null; let unsubscribeStock=null; let unsubscribeMenu=null; let unsubscribeDelivery=null; let deliveryEnabled=true; let currentOrders=[]; let activeOrderTab="ALL"; let initialOrdersLoaded=false; let lastNewOrderId=null; let activeNewOrderId=null; let newOrderTimer=null; let sirenTimer=null; let sirenContext=null; let audioUnlocked=false; const ORIGINAL_TITLE=document.title;
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function showMasterApp(){document.getElementById("loginGate").style.display="none";document.getElementById("masterApp").style.display="block";}
function showLogin(){document.getElementById("loginGate").style.display="flex";document.getElementById("masterApp").style.display="none";}
function renderStock(){
  if(!window.MENU_ITEMS || !Array.isArray(MENU_ITEMS)) return;
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
  el.innerHTML=list.map(x=>`<tr><td><b>${esc(x.id)}</b></td><td><b>${esc(x.name)}</b><br><small>${esc(x.description||"")}</small></td><td>${esc(x.category)}</td><td>${x.bestChoice?`⭐ ${esc(x.badge||"BEST CHOICE")}`:`—`}</td><td>${x.hero?"🏆 ON":"—"}</td><td><button class="primary edit-item" data-id="${esc(x.id)}">✏️ Edit</button></td></tr>`).join("");
  document.querySelectorAll(".edit-item").forEach(b=>b.onclick=()=>openItemEditor(b.dataset.id));
}
function openItemEditor(id){
  const base=MENU_ITEMS.find(x=>x.id===id); if(!base)return;
  const x=liveMenu[id]?{...base,...liveMenu[id]}:base;
  $("#editId").value=x.id; $("#editHero").checked=!!x.hero; $("#editBestChoice").checked=!!x.bestChoice; $("#editBadge").value=x.badge||""; $("#editName").value=x.name||""; $("#editDescription").value=x.description||"";
  const image=x.image||x.imageUrl||x.img||"";
  const preview=$("#editImagePreview"); if(preview){preview.src=image||"assets/logo.png"; preview.dataset.image=image;}
  const imageMsg=$("#imageEditMsg"); if(imageMsg) imageMsg.textContent=image?"Current image loaded.":"No product image set."; 
  const imageFile=$("#editImageFile"); if(imageFile) imageFile.value="";
  const cats=[...new Set(MENU_ITEMS.map(i=>i.category))]; $("#editCategory").innerHTML=cats.map(c=>`<option ${x.category===c?"selected":""}>${esc(c)}</option>`).join("");
  const pizza=x.type==="pizza" || x.prices;
  $("#editPizzaPrices").style.display=pizza?"grid":"none"; $("#editSinglePriceWrap").style.display=pizza?"none":"block";
  if(pizza){$("#editEkla").value=x.prices?.["Ekla Bite"]??"";$("#editBondhu").value=x.prices?.["Bondhu Bite"]??"";$("#editFamily").value=x.prices?.["Family Bite"]??"";} else $("#editPrice").value=x.price??"";
  $("#itemEditMsg").textContent=""; $("#itemEditModal").style.display="flex";
}
async function fileToJpegBlob(file,maxSize=1400,quality=.86){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(reader.error||new Error("Could not read image."));
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const scale=Math.min(1,maxSize/Math.max(img.width,img.height));
        const w=Math.max(1,Math.round(img.width*scale)), h=Math.max(1,Math.round(img.height*scale));
        const c=document.createElement("canvas"); c.width=w;c.height=h;
        const ctx=c.getContext("2d"); ctx.drawImage(img,0,0,w,h);
        c.toBlob(blob=>blob?resolve(blob):reject(new Error("Image conversion failed.")),"image/jpeg",quality);
      };
      img.onerror=()=>reject(new Error("Invalid image file."));
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function uploadItemImage(){
  const id=$("#editId").value, file=$("#editImageFile")?.files?.[0]; if(!id||!file)return;
  const msg=$("#imageEditMsg"), preview=$("#editImagePreview");
  if(msg)msg.textContent="Uploading image…";
  try{
    if(!window.firebaseReady || !window.storage) throw new Error("Firebase Storage is not available. Make sure Storage SDK and rules are enabled.");
    const blob=await fileToJpegBlob(file);
    const ref=window.storage.ref().child("product-images/"+id+".jpg");
    await ref.put(blob,{contentType:"image/jpeg",cacheControl:"public,max-age=3600"});
    const url=await ref.getDownloadURL();
    await db.collection("menu").doc(id).set({image:url,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    if(preview){preview.src=url+"&v="+Date.now();preview.dataset.image=url;}
    if(liveMenu[id]) liveMenu[id].image=url; else liveMenu[id]={image:url};
    if(msg)msg.textContent="✅ Image uploaded and saved.";
    $("#editImageFile").value="";
  }catch(e){console.error(e);if(msg)msg.textContent="❌ Image upload failed: "+e.message;}
}
async function removeItemImage(){
  const id=$("#editId").value;if(!id)return;
  const msg=$("#imageEditMsg"),preview=$("#editImagePreview"); const old=preview?.dataset?.image||"";
  if(!confirm("Remove this product image?"))return;
  if(msg)msg.textContent="Removing image…";
  try{
    await db.collection("menu").doc(id).set({image:"",updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    if(window.storage && old){
      try{
        let ref=null;
        if(old.includes("firebasestorage.googleapis.com")){
          ref=window.storage.refFromURL(old);
        } else if(old.includes("product-images/"+id+".jpg")){
          ref=window.storage.ref().child("product-images/"+id+".jpg");
        }
        if(ref) await ref.delete();
      }catch(delErr){console.warn("Old image delete skipped:",delErr);}
    }
    if(liveMenu[id]) liveMenu[id].image=""; else liveMenu[id]={image:""};
    if(preview){preview.src="assets/logo.png";preview.dataset.image="";}
    if(msg)msg.textContent="✅ Image removed.";
  }catch(e){console.error(e);if(msg)msg.textContent="❌ Remove failed: "+e.message;}
}
function closeItemEditor(){$("#itemEditModal").style.display="none";}
async function saveItemEditor(){
  const id=$("#editId").value, base=MENU_ITEMS.find(x=>x.id===id); if(!base)return;
  const data={name:$("#editName").value.trim(),description:$("#editDescription").value.trim(),category:$("#editCategory").value,bestChoice:$("#editBestChoice").checked,hero:$("#editHero").checked,badge:$("#editBadge").value.trim()||($("#editBestChoice").checked?"BEST CHOICE":""),updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
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
function renderDeliveryControl(){const b=$("#deliveryToggle"),b2=$("#deliveryToggle2"),t=$("#deliveryStateText");if(b){b.textContent=deliveryEnabled?"Delivery ON":"Delivery OFF";b.className=`delivery-btn ${deliveryEnabled?"on":"off"}`;}if(b2)b2.textContent=deliveryEnabled?"Turn OFF":"Turn ON";if(t)t.textContent=deliveryEnabled?"Delivery is ON":"Delivery is OFF";}
function statusKey(s){return String(s||"").replace(/\s+/g,"-").replace(/[^A-Z0-9-]/g,"");}
function nextAction(status){if(status==="NEW")return ["ACCEPTED","Accept Order","accept"];if(status==="ACCEPTED")return ["PREPARING","Start Preparing",""];if(status==="PREPARING")return ["READY","Order Ready","ready"];if(status==="READY")return ["OUT FOR DELIVERY","Out for Delivery","out"];if(status==="OUT FOR DELIVERY")return ["DELIVERED","Mark Delivered",""];return null;}
function orderItemsHtml(o){const items=Array.isArray(o.items)?o.items:[];if(!items.length)return '<div class="order-item"><span>Order items</span><span>—</span></div>';return items.map(it=>{const name=it.name||it.itemName||"Item";const qty=Number(it.qty||it.quantity||1);const price=Number(it.total??it.price??0);const size=it.size||it.selectedSize||"";const extras=Array.isArray(it.extras)?it.extras:(Array.isArray(it.customizations)?it.customizations:[]);return `<div class="order-item"><span>${qty} × ${esc(name)}${size?` <small>(${esc(size)})</small>`:""}</span><span>₹${price.toLocaleString("en-IN")}</span></div>${extras.length?`<div class="order-extra">+ ${extras.map(e=>esc(typeof e==="string"?e:(e.name||e.title||"Extra"))).join(", ")}</div>`:""}`}).join("");}
function renderOrderTabs(){const counts={ALL:currentOrders.length,NEW:0,ACCEPTED:0,PREPARING:0,READY:0,"OUT FOR DELIVERY":0,DELIVERED:0};currentOrders.forEach(o=>{if(counts[o.status]!==undefined)counts[o.status]++});$("#countAll").textContent=counts.ALL;$("#countNEW").textContent=counts.NEW;$("#countACCEPTED").textContent=counts.ACCEPTED;$("#countPREPARING").textContent=counts.PREPARING;$("#countREADY").textContent=counts.READY;$("#countOUT").textContent=counts["OUT FOR DELIVERY"];$("#countDELIVERED").textContent=counts.DELIVERED;document.querySelectorAll(".order-tab").forEach(b=>b.classList.toggle("active",b.dataset.status===activeOrderTab));}
function renderOrders(snapshot){
  const all=[]; snapshot.forEach(d=>all.push({...d.data(),orderId:d.data().orderId||d.id,orderDocId:d.id})); all.sort((a,b)=>{const ad=a.createdAt?.toDate?.()||a.createdAt||0,bd=b.createdAt?.toDate?.()||b.createdAt||0;return new Date(bd)-new Date(ad)}); currentOrders=all; renderOrderTabs();
  if(activeNewOrderId){const active=currentOrders.find(o=>o.orderId===activeNewOrderId);if(!active||active.status!=="NEW") stopNewOrderAlert();}
  const q=($("#orderSearch")?.value||"").trim().toLowerCase(); let rows=activeOrderTab==="ALL"?all:all.filter(o=>o.status===activeOrderTab); if(q)rows=rows.filter(o=>[o.orderId,o.name,o.phone,o.address].some(v=>String(v||"").toLowerCase().includes(q)));
  const labels={ALL:"All Orders",NEW:"New Orders",ACCEPTED:"Accepted Orders",PREPARING:"Preparing",READY:"Ready for Pickup", "OUT FOR DELIVERY":"Out for Delivery",DELIVERED:"Completed"}; $("#boardTitle").textContent=labels[activeOrderTab]||"Orders"; $("#lastUpdated").textContent=`${rows.length} shown • Live`;
  const grid=$("#ordersGrid"); if(!rows.length){grid.innerHTML='<div class="empty-orders"><b>No orders here</b><span>New orders will appear automatically.</span></div>';return;}
  grid.innerHTML=rows.map(o=>{const closed=o.status==="DELIVERED"||o.status==="CANCELLED";const act=nextAction(o.status);const dt=formatDate(o.createdAt);return `<article class="order-card ${o.status==="NEW"?"new":""}" data-order-card="${esc(o.orderId)}"><div class="order-card-head"><div><div class="order-id">#${esc(o.orderId)}</div><div class="order-time">${esc(dt)}</div></div><span class="status-badge ${statusKey(o.status)}">${esc(o.status||"NEW")}</span></div><div class="order-customer"><b>${esc(o.name||"Customer")}</b><small>📞 ${esc(o.phone||"—")}</small><small>📍 ${esc(o.address||"Address not available")}</small></div><div class="order-items">${orderItemsHtml(o)}</div><div class="order-meta"><span>${Number(o.distanceKm||0)>0?`${Number(o.distanceKm).toFixed(1)} km`:(o.orderType||"Order")}</span><span class="order-total">₹${Number(o.total||0).toLocaleString("en-IN")}</span></div><div class="order-actions">${act?`<button class="order-main-btn ${act[2]} advance-order" data-id="${esc(o.orderDocId||o.orderId)}" data-order-id="${esc(o.orderId)}" data-next="${esc(act[0])}">${act[1]}</button>`:`<button class="order-main-btn" disabled>${closed?"Closed":"Completed"}</button>`}<button class="order-more details-toggle" data-id="${esc(o.orderId)}">•••</button></div><div class="order-details" id="details-${esc(o.orderId)}"><p><b>Order details</b></p><select class="order-status-select order-status" data-id="${esc(o.orderDocId||o.orderId)}" data-order-id="${esc(o.orderId)}" ${closed?"disabled":""}>${STATUS_LIST.map(s=>`<option ${o.status===s?"selected":""}>${s}</option>`).join("")}</select><button class="wa-mini status-wa" data-id="${esc(o.orderDocId||o.orderId)}" data-phone="${esc(o.phone||"")}">💬 Send WhatsApp Status</button><button class="wa-mini order-share-wa" data-id="${esc(o.orderDocId||o.orderId)}">📲 Share Order on WhatsApp</button></div></article>`}).join("");
  document.querySelectorAll(".advance-order").forEach(b=>b.onclick=()=>updateStatus(b.dataset.id,b.dataset.next));
  document.querySelectorAll(".details-toggle").forEach(b=>b.onclick=()=>document.getElementById(`details-${b.dataset.id}`)?.classList.toggle("open"));
  document.querySelectorAll(".order-status").forEach(el=>el.onchange=()=>updateStatus(el.dataset.id,el.value));
  document.querySelectorAll(".status-wa").forEach(el=>el.onclick=()=>sendStatusWhatsApp(el.dataset.id,el.dataset.phone));document.querySelectorAll(".order-share-wa").forEach(el=>el.onclick=()=>shareOrderWhatsApp(el.dataset.id));
  if(!initialOrdersLoaded){initialOrdersLoaded=true;}else{const fresh=currentOrders.find(o=>o.status==="NEW"&&o.orderId!==lastNewOrderId);if(fresh){lastNewOrderId=fresh.orderId;showNewOrder(fresh);}}
}
function unlockMasterAudio(){
  try{
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    if(!sirenContext)sirenContext=new C();
    if(sirenContext.state==='suspended')sirenContext.resume().catch(()=>{});
    audioUnlocked=true;
  }catch(e){console.warn('Audio unlock unavailable',e);}
}
function stopSiren(){try{clearInterval(sirenTimer);sirenTimer=null;if(sirenContext){sirenContext.close().catch(()=>{});sirenContext=null;}audioUnlocked=false;}catch(e){}}

function stopNewOrderAlert(){clearInterval(newOrderTimer);newOrderTimer=null;activeNewOrderId=null;stopSiren();document.title=ORIGINAL_TITLE;const ov=$("#newOrderOverlay");if(ov)ov.style.display="none";}
function startLoudSiren(){
  stopSiren();
  try{
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    sirenContext=new C(); const ctx=sirenContext;

    // EXTRA-LOUD NEW ORDER ALERT
    // Browser audio cannot exceed the device's physical master volume,
    // but this uses a near-full digital level and a brighter second tone.
    const play=()=>{
      if(ctx.state==='suspended')ctx.resume().catch(()=>{});

      const now=ctx.currentTime;
      const master=ctx.createGain();
      const comp=ctx.createDynamicsCompressor();
      master.gain.setValueAtTime(0.95,now);
      comp.threshold.setValueAtTime(-6,now);
      comp.knee.setValueAtTime(0,now);
      comp.ratio.setValueAtTime(20,now);
      comp.attack.setValueAtTime(0.003,now);
      comp.release.setValueAtTime(0.08,now);
      master.connect(comp);
      comp.connect(ctx.destination);

      const makeTone=(freq,offset=0)=>{
        const osc=ctx.createOscillator();
        const gain=ctx.createGain();
        osc.type='square';
        osc.frequency.setValueAtTime(freq,now+offset);
        osc.frequency.exponentialRampToValueAtTime(freq*2,now+0.32+offset);
        osc.frequency.exponentialRampToValueAtTime(freq,now+0.64+offset);
        gain.gain.setValueAtTime(0.0001,now+offset);
        gain.gain.exponentialRampToValueAtTime(0.72,now+0.018+offset);
        gain.gain.exponentialRampToValueAtTime(0.0001,now+0.68+offset);
        osc.connect(gain); gain.connect(master);
        osc.start(now+offset); osc.stop(now+0.70+offset);
      };

      makeTone(520,0);
      makeTone(780,0.02);
    };

    play();
    sirenTimer=setInterval(play,820);
  }catch(e){console.warn('Siren unavailable:',e);}
}
function showNewOrder(o){
  const ov=$("#newOrderOverlay");if(!ov)return;
  stopNewOrderAlert();
  unlockMasterAudio();
  document.title=`🚨 NEW ORDER #${o.orderId}`;
  activeNewOrderId=o.orderId;
  $("#newOrderTitle").textContent=`Order #${o.orderId}`;
  $("#newOrderSummary").innerHTML=`<b>${esc(o.name||"Customer")}</b> • ₹${Number(o.total||0).toLocaleString("en-IN")}<br><span>New order must be accepted within 2:00</span>`;
  ov.style.display="flex"; startLoudSiren();
  let remaining=120; const tick=()=>{const t=$("#newOrderTimer");if(t)t.textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;}; tick();
  newOrderTimer=setInterval(async()=>{remaining--;tick();if(remaining<=0){clearInterval(newOrderTimer);newOrderTimer=null;stopSiren();try{await updateStatus(o.orderDocId||o.orderId,"CANCELLED");}finally{stopNewOrderAlert();}}},1000);
  $("#acceptNewOrder").onclick=()=>{stopNewOrderAlert();updateStatus(o.orderDocId||o.orderId,"ACCEPTED")};
  $("#dismissNewOrder").onclick=()=>{stopSiren();ov.style.display="none";};
}
window.showNewOrder=showNewOrder;
window.addEventListener('focus',()=>{if(activeNewOrderId){const o=currentOrders.find(x=>x.orderId===activeNewOrderId);if(o&&o.status==='NEW')startLoudSiren();}});
window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&activeNewOrderId){const o=currentOrders.find(x=>x.orderId===activeNewOrderId);if(o&&o.status==='NEW')startLoudSiren();}});

function formatDate(v){try{return v?.toDate?v.toDate().toLocaleString():new Date(v).toLocaleString()}catch(e){return ""}}
async function updateStatus(id,status){try{const snap=await db.collection("orders").doc(id).get();if(!snap.exists){alert("Order not found.");return}const current=snap.data().status;if(current==="DELIVERED"||current==="CANCELLED"){alert("This order is closed. Delivered/CANCELLED status cannot be changed.");renderOrders(await db.collection("orders").get());return}await db.collection("orders").doc(id).update({status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});await db.collection("publicStatuses").doc(id).set({status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});}catch(e){console.error(e);alert("Status update failed.")}}

function shareOrderWhatsApp(id){
  const o=currentOrders.find(x=>String(x.orderDocId||x.orderId)===String(id)||String(x.orderId)===String(id));
  if(!o){alert("Order not found.");return;}
  const items=Array.isArray(o.items)?o.items:[];
  const lines=items.map(it=>{
    const name=it.name||it.itemName||"Item";
    const qty=Number(it.qty||it.quantity||1);
    const size=it.size||it.selectedSize||"";
    const price=Number(it.total??it.price??0);
    const extras=Array.isArray(it.extras)?it.extras:(Array.isArray(it.customizations)?it.customizations:[]);
    const extraText=extras.length?" + "+extras.map(e=>typeof e==="string"?e:(e.name||e.title||"Extra")).join(", "):"";
    return `• ${qty} × ${name}${size?` (${size})`:""}${extraText} — ₹${price.toLocaleString("en-IN")}`;
  }).join("\n");
  const msg=`🍕 BAKE & GRILL — ORDER DETAILS

🆔 Order ID: ${o.orderId||id}
👤 Customer: ${o.name||"—"}
📞 Phone: ${o.phone||"—"}
📍 Address: ${o.address||"—"}
📌 Status: ${o.status||"NEW"}
🚚 Order Type: ${o.orderType||"Order"}${Number(o.distanceKm||0)>0?`\n📏 Distance: ${Number(o.distanceKm).toFixed(1)} km`:""}

🛒 ITEMS
${lines||"• No item details"}

💰 TOTAL: ₹${Number(o.total||0).toLocaleString("en-IN")}

Thank you — Bake & Grill.`;
  const target="8240266267";
  window.open(`https://wa.me/${target}?text=${encodeURIComponent(msg)}`,"_blank");
}

function sendStatusWhatsApp(id,phone){const status=document.querySelector(`.order-status[data-id="${CSS.escape(id)}"]`)?.value||"UPDATED";const msg=`📦 *BAKE & GRILL ORDER UPDATE*\n\n🆔 Order ID: ${id}\n📌 Status: *${status}*\n\nThank you for ordering from Bake & Grill.`;window.open(`https://wa.me/${String(phone).replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`,"_blank")}
function startRealtime(){
  unsubscribeStock?.(); unsubscribeOrders?.(); unsubscribeMenu?.(); unsubscribeDelivery?.();
  unsubscribeStock=db.collection("stock").onSnapshot(s=>{stock={};s.forEach(d=>stock[d.id]=d.data());renderStock()},e=>{console.error("Stock listener:",e);renderStock();const t=$("#stockTable");if(t && !t.innerHTML.trim()) t.innerHTML=`<tr><td colspan="5">Could not load Firebase inventory. Check Firebase Rules/login.</td></tr>`;});
  unsubscribeMenu=db.collection("menu").onSnapshot(s=>{liveMenu={};s.forEach(d=>liveMenu[d.id]=d.data());renderMenuEditor()},e=>console.error(e));
  unsubscribeDelivery=db.collection("settings").doc("delivery").onSnapshot(d=>{deliveryEnabled=d.exists?d.data().enabled!==false:true;renderDeliveryControl()},e=>console.error(e));
  unsubscribeOrders=db.collection("orders").onSnapshot(renderOrders,e=>{console.error(e);$("#ordersGrid").innerHTML='<div class="empty-orders"><b>Could not load orders</b><span>Check Firebase connection and rules.</span></div>'});
  renderMenuEditor();
}
async function init(){
  document.addEventListener("pointerdown",unlockMasterAudio,{once:true,capture:true});
  document.addEventListener("keydown",unlockMasterAudio,{once:true,capture:true});
  if(!firebaseReady){showLogin();$("#loginError").textContent="Firebase is not configured. Edit firebase-config.js first.";return;}
  $("#filter").innerHTML='<option value="all">All Categories</option>'+[...new Set(MENU_ITEMS.map(x=>x.category))].map(c=>`<option>${esc(c)}</option>`).join("");
  renderStock();

  auth.onAuthStateChanged(user=>{if(user){showMasterApp();startRealtime();if(window.BakeGrillMasterPush?.init) window.BakeGrillMasterPush.init();}else{unsubscribeOrders?.();unsubscribeStock?.();unsubscribeMenu?.();unsubscribeDelivery?.();showLogin();}});
  $("#loginForm").addEventListener("submit",async e=>{e.preventDefault();$("#loginError").textContent="";try{await auth.signInWithEmailAndPassword($("#loginId").value.trim(),$("#loginPassword").value)}catch(err){$("#loginError").textContent=err.message.replace("Firebase: ","")}});
}
init();

document.addEventListener("DOMContentLoaded",()=>{$("#editImageFile")?.addEventListener("change",uploadItemImage);$("#removeItemImage")?.addEventListener("click",removeItemImage);});

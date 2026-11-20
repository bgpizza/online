const $=s=>document.querySelector(s);
const MASTER_AUTH_KEY="bake_grill_firebase_admin_v1";
const MASTER_UID="f1Gx3tPIigZmqM2ImCzqGQN2xuJ3";
const STATUS_LIST=["NEW","ACCEPTED","PREPARING","READY","OUT FOR DELIVERY","DELIVERED","CANCELLED"];
const GOOGLE_REVIEW_URL="https://search.google.com/local/writereview?placeid=ChIJ827xCF1jAjoRURsEjhZtgEo";
const DEFAULT_REVIEW_WHATSAPP_MESSAGE="Hi {name}! Thank you for ordering from Bake & Grill (Order #{orderId}). We would love your honest feedback. Please share your experience on Google: {reviewUrl} Thank you!";
let reviewSettings={googleEnabled:true,feedbackEnabled:true,googleReviewUrl:GOOGLE_REVIEW_URL,whatsappMessage:DEFAULT_REVIEW_WHATSAPP_MESSAGE};
let unsubscribeReviews=null; let unsubscribeCustomerReviews=null; let customerReviewCache=[]; let activeCustomerReviewFilter="ALL";
let stock={}; let liveMenu={}; let unsubscribeOrders=null; let unsubscribeStock=null; let unsubscribeMenu=null; let unsubscribeDelivery=null; let deliveryEnabled=true; let currentOrders=[]; let activeOrderTab="ALL"; let initialOrdersLoaded=false; let knownOrderIds=new Set(); let lastNewOrderId=null; let activeNewOrderId=null; let newOrderTimer=null; let sirenTimer=null; let sirenContext=null; let audioUnlocked=false; const ORIGINAL_TITLE=document.title;
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function showMasterApp(){document.getElementById("loginGate").style.display="none";document.getElementById("masterApp").style.display="block";}
function showLogin(){document.getElementById("loginGate").style.display="flex";document.getElementById("masterApp").style.display="none";}
function allMenuAdminItems(){
  const base=Array.isArray(MENU_ITEMS)?MENU_ITEMS:[];
  const live=liveMenu||{},ids=new Set(base.map(x=>String(x.id)));
  const rows=base.map(x=>live[x.id]?{...x,...live[x.id],id:String(x.id)}:x);
  Object.entries(live).forEach(([id,item])=>{if(!ids.has(String(id))&&item&&item.name&&item.category)rows.push({...item,id:String(id)});});
  return rows;
}
function renderStock(){
  if(!window.MENU_ITEMS || !Array.isArray(MENU_ITEMS)) return;
  const q=$("#search").value.toLowerCase().trim(), f=$("#filter").value;
  const rows=allMenuAdminItems().filter(x=>(f==="all"||x.category===f)&&(!q||x.name.toLowerCase().includes(q)||x.id.toLowerCase().includes(q)));
  $("#stockTable").innerHTML=rows.map(x=>{const s=stock[x.id]||{qty:"",active:true};const qty=s.qty===""?"":Number(s.qty),cls=s.active?"available":"out";return `<tr><td><b>${esc(x.id)}</b></td><td><b>${esc(x.name)}</b></td><td>${esc(x.category)}</td><td><input class="qty-input" type="number" min="0" value="${qty}" data-id="${esc(x.id)}"></td><td><select class="status ${cls}" data-id="${esc(x.id)}"><option value="on" ${s.active!==false?"selected":""}>Available</option><option value="off" ${s.active===false?"selected":""}>Out of Stock</option></select></td></tr>`}).join("");
  document.querySelectorAll(".qty-input").forEach(el=>el.oninput=()=>{const s=stock[el.dataset.id]||{qty:"",active:true};s.qty=el.value===""?"":Math.max(0,Number(el.value));stock[el.dataset.id]=s});
  document.querySelectorAll(".status").forEach(el=>el.onchange=()=>{const s=stock[el.dataset.id]||{qty:"",active:true};s.active=el.value==="on";stock[el.dataset.id]=s;renderStock();});
  updateSummary();
}
function updateSummary(){const all=allMenuAdminItems().map(x=>stock[x.id]||{qty:"",active:true}),available=all.filter(s=>s.active!==false),out=all.filter(s=>s.active===false),low=all.filter(s=>s.active!==false&&s.qty!==""&&Number(s.qty)<=5);$("#totalItems").textContent=all.length;$("#availableItems").textContent=available.length;$("#outItems").textContent=out.length;$("#lowItems").textContent=low.length;}
async function saveStock(){if(!firebaseReady)return alert("Firebase is not configured.");const batch=db.batch();allMenuAdminItems().forEach(x=>batch.set(db.collection("stock").doc(x.id),stock[x.id]||{qty:"",active:true},{merge:true}));await batch.commit();alert("Stock saved to Firebase. All customer devices will update automatically.")}
async function setAll(active){if(!firebaseReady)return; if(!active&&!confirm("Mark every item as Out of Stock?"))return;const batch=db.batch();MENU_ITEMS.forEach(x=>batch.set(db.collection("stock").doc(x.id),{active,qty:(stock[x.id]?.qty??"")},{merge:true}));await batch.commit();}
function renderMenuEditor(){
  const list=allMenuAdminItems();
  const el=$("#menuEditTable"); if(!el)return;
  el.innerHTML=list.map(x=>`<tr><td><b>${esc(x.id)}</b></td><td><b>${esc(x.name)}</b><br><small>${esc(x.description||"")}</small></td><td>${esc(x.category)}</td><td>${x.bestChoice?`⭐ ${esc(x.badge||"BEST CHOICE")}`:`—`}</td><td>${x.hero?"🏆 ON":"—"}</td><td><button class="primary edit-item" data-id="${esc(x.id)}">✏️ Edit</button></td></tr>`).join("");
  document.querySelectorAll(".edit-item").forEach(b=>b.onclick=()=>openItemEditor(b.dataset.id));
}
function openItemEditor(id){
  const base=allMenuAdminItems().find(x=>String(x.id)===String(id)); if(!base)return;
  const x=liveMenu[id]?{...base,...liveMenu[id]}:base;
  $("#editId").value=x.id; $("#editHero").checked=!!x.hero; $("#editBestChoice").checked=!!x.bestChoice; $("#editBadge").value=x.badge||""; $("#editName").value=x.name||""; $("#editDescription").value=x.description||"";
  const image=x.image||x.imageUrl||x.img||"";
  const preview=$("#editImagePreview"); if(preview){preview.src=image||"assets/logo.png"; preview.dataset.image=image;}
  const imageMsg=$("#imageEditMsg"); if(imageMsg) imageMsg.textContent=image?"Current image loaded.":"No product image set."; 
  const imageFile=$("#editImageFile"); if(imageFile) imageFile.value="";
  const cats=[...new Set(allMenuAdminItems().map(i=>i.category).filter(Boolean))]; $("#editCategory").innerHTML=cats.map(c=>`<option ${x.category===c?"selected":""}>${esc(c)}</option>`).join("");
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
  const id=$("#editId").value, base=allMenuAdminItems().find(x=>String(x.id)===String(id)); if(!base)return;
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
function renderDeliveryControl(){const b=$("#deliveryToggle"),b2=$("#deliveryToggle2"),t=$("#deliveryStateText");if(b){b.textContent=deliveryEnabled?"Delivery ON":"Delivery OFF";b.className=`delivery-btn ${deliveryEnabled?"on":"off"}`;b.setAttribute("aria-pressed",String(!!deliveryEnabled));b.setAttribute("aria-label",deliveryEnabled?"Turn delivery off":"Turn delivery on");}if(b2)b2.textContent=deliveryEnabled?"Turn OFF":"Turn ON";if(t)t.textContent=deliveryEnabled?"Delivery is ON":"Delivery is OFF";}
function statusKey(s){return String(s||"").replace(/\s+/g,"-").replace(/[^A-Z0-9-]/g,"");}
function nextAction(status){if(status==="NEW")return ["ACCEPTED","Accept Order","accept"];if(status==="ACCEPTED")return ["PREPARING","Start Preparing",""];if(status==="PREPARING")return ["READY","Order Ready","ready"];if(status==="READY")return ["OUT FOR DELIVERY","Out for Delivery","out"];if(status==="OUT FOR DELIVERY")return ["DELIVERED","Mark Delivered",""];return null;}
function orderMapUrl(o){
  // Firestore customerLocation is the canonical customer-selected location object.
  // Support both the current nested schema and legacy top-level fields.
  const cl=o?.customerLocation;
  const candidates=[
    cl?.googleMapsUrl, cl?.googleMapUrl, cl?.mapsUrl, cl?.mapUrl,
    o?.googleMapsUrl, o?.locationUrl, o?.mapUrl, o?.mapLink,
    o?.location?.googleMapsUrl, o?.deliveryLocation?.googleMapsUrl
  ];
  for(const value of candidates){
    const url=String(value||'').trim();
    if(/^https?:\/\/(www\.)?google\.com\/maps(?:[/?#]|$)/i.test(url)) return url;
  }
  const locations=[cl,o?.location,o?.deliveryLocation,o?.coordinates,o?.location?.coordinates,o?.addressDetails,o];
  for(const c of locations){
    if(!c || typeof c!=='object') continue;
    const rawLat=c.lat??c.latitude??c._latitude;
    const rawLon=c.lon??c.lng??c.longitude??c._longitude;
    if(rawLat===undefined||rawLon===undefined||rawLat===null||rawLon===null) continue;
    const lat=Number(rawLat),lon=Number(rawLon);
    if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&(lat!==0||lon!==0))
      return `https://www.google.com/maps?q=${encodeURIComponent(lat+','+lon)}`;
  }
  const address=String(
    cl?.deliveryAddress||cl?.address||cl?.formattedAddress||cl?.fullAddress||
    o?.deliveryAddress||o?.address||o?.fullAddress||
    o?.addressDetails?.formattedAddress||o?.addressDetails?.address||o?.addressDetails?.area||''
  ).trim();
  if(address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address+', India')}`;
  return '';
}

function orderDistanceKm(o){
  const candidates=[o?.distanceKm,o?.roadDistanceKm,o?.customerLocation?.distanceKm,o?.addressDetails?.distanceKm];
  for(const value of candidates){const n=Number(value);if(Number.isFinite(n)&&n>0)return n;}
  return null;
}
function orderRouteMinutes(o){
  const candidates=[o?.routeDurationMin,o?.estimatedRouteMinutes,o?.customerLocation?.routeDurationMin];
  for(const value of candidates){const n=Number(value);if(Number.isFinite(n)&&n>0)return n;}
  return null;
}
function orderCreatedAtMs(o){
  const value=o?.createdAt;
  try{if(value?.toMillis)return value.toMillis();if(value?.toDate)return value.toDate().getTime();const n=value instanceof Date?value.getTime():new Date(value||0).getTime();return Number.isFinite(n)?n:0;}catch(e){return 0;}
}
function orderItemsHtml(o){const items=Array.isArray(o.items)?o.items:[];if(!items.length)return '<div class="order-item"><span>Order items</span><span>—</span></div>';return items.map(it=>{const name=it.name||it.itemName||"Item";const qty=Number(it.qty||it.quantity||1);const price=Number(it.total??it.price??0);const size=it.size||it.selectedSize||"";const extras=Array.isArray(it.extras)?it.extras:(Array.isArray(it.customizations)?it.customizations:[]);return `<div class="order-item"><span>${qty} × ${esc(name)}${size?` <small>(${esc(size)})</small>`:""}</span><span>₹${price.toLocaleString("en-IN")}</span></div>${extras.length?`<div class="order-extra">+ ${extras.map(e=>esc(typeof e==="string"?e:(e.name||e.title||"Extra"))).join(", ")}</div>`:""}`}).join("");}
function renderOrderTabs(){const counts={ALL:currentOrders.length,NEW:0,ACCEPTED:0,PREPARING:0,READY:0,"OUT FOR DELIVERY":0,DELIVERED:0};currentOrders.forEach(o=>{if(counts[o.status]!==undefined)counts[o.status]++});$("#countAll").textContent=counts.ALL;$("#countNEW").textContent=counts.NEW;$("#countACCEPTED").textContent=counts.ACCEPTED;$("#countPREPARING").textContent=counts.PREPARING;$("#countREADY").textContent=counts.READY;$("#countOUT").textContent=counts["OUT FOR DELIVERY"];$("#countDELIVERED").textContent=counts.DELIVERED;document.querySelectorAll(".order-tab").forEach(b=>b.classList.toggle("active",b.dataset.status===activeOrderTab));}
function renderOrders(snapshot){
  const all=[]; snapshot.forEach(d=>all.push({...d.data(),orderId:d.data().orderId||d.id,orderDocId:d.id})); all.sort((a,b)=>{const ad=a.createdAt?.toDate?.()||a.createdAt||0,bd=b.createdAt?.toDate?.()||b.createdAt||0;return new Date(bd)-new Date(ad)}); currentOrders=all; renderOrderTabs(); window.renderMasterDashboard?.(); window.renderOrderDetails?.();
  if(activeNewOrderId){const active=currentOrders.find(o=>o.orderId===activeNewOrderId);if(!active||active.status!=="NEW") stopNewOrderAlert();}
  // Do not alert for NEW orders that were already present when the Master page first loaded.
  // Alert only when a genuinely new order document appears after the initial snapshot.
  if(!initialOrdersLoaded){
    all.forEach(o=>knownOrderIds.add(o.orderId));
    initialOrdersLoaded=true;
    // Recover any still-actionable new order when Master is refreshed or reopened.
    const pending=all.filter(o=>o.status==="NEW"&&Date.now()-orderCreatedAtMs(o)<120000)
      .sort((a,b)=>orderCreatedAtMs(a)-orderCreatedAtMs(b));
    if(pending.length)showNewOrder(pending[0]);
  }else{
    const fresh=all.filter(o=>o.status==="NEW"&&!knownOrderIds.has(o.orderId));
    all.forEach(o=>knownOrderIds.add(o.orderId));
    if(fresh.length){
      const freshOrder=fresh.sort((a,b)=>{
        const ad=a.createdAt?.toDate?.()?.getTime?.()||new Date(a.createdAt||0).getTime();
        const bd=b.createdAt?.toDate?.()?.getTime?.()||new Date(b.createdAt||0).getTime();
        return bd-ad;
      })[0];
      lastNewOrderId=freshOrder.orderId;
      showNewOrder(freshOrder);
    }
  }
  // Queue the next still-actionable NEW order after the current alert is accepted/cancelled.
  if(!activeNewOrderId){
    const nextPending=all.filter(o=>o.status==="NEW"&&Date.now()-orderCreatedAtMs(o)<120000)
      .sort((a,b)=>orderCreatedAtMs(a)-orderCreatedAtMs(b));
    if(nextPending.length)showNewOrder(nextPending[0]);
  }
  const q=($("#orderSearch")?.value||"").trim().toLowerCase(); let rows=activeOrderTab==="ALL"?all:all.filter(o=>o.status===activeOrderTab); if(q)rows=rows.filter(o=>[o.orderId,o.name,o.phone,o.address].some(v=>String(v||"").toLowerCase().includes(q)));
  const labels={ALL:"All Orders",NEW:"New Orders",ACCEPTED:"Accepted Orders",PREPARING:"Preparing",READY:"Ready for Pickup", "OUT FOR DELIVERY":"Out for Delivery",DELIVERED:"Completed"}; $("#boardTitle").textContent=labels[activeOrderTab]||"Orders"; $("#lastUpdated").textContent=`${rows.length} shown • Live`;
  const grid=$("#ordersGrid"); if(!rows.length){grid.innerHTML='<div class="empty-orders"><b>No orders here</b><span>New orders will appear automatically.</span></div>';return;}
  grid.innerHTML=rows.map(o=>{const closed=o.status==="DELIVERED"||o.status==="CANCELLED";const act=nextAction(o.status);const dt=formatDate(o.createdAt);return `<article class="order-card ${o.status==="NEW"?"new":""}" data-order-card="${esc(o.orderId)}"><div class="order-card-head"><div><div class="order-id">#${esc(o.orderId)}</div><div class="order-time">${esc(dt)}</div></div><span class="status-badge ${statusKey(o.status)}">${esc(o.status||"NEW")}</span></div><div class="order-customer"><b>${esc(o.name||"Customer")}</b><small>📞 ${esc(o.phone||"—")}</small>${orderMapUrl(o)?`<a class="order-address-link" href="${esc(orderMapUrl(o))}" target="_blank" rel="noopener noreferrer" title="Open delivery location in Google Maps">📍 ${esc(orderMapUrl(o))}</a>`:`<small>📍 ${esc(o.address||o.deliveryAddress||"Address not available")}</small><small class="order-map-missing">🗺️ Map link unavailable — address/location missing in this order</small>`}</div><div class="order-items">${orderItemsHtml(o)}</div>${o.orderInstructions?`<div class="order-instructions-note"><b>📝 Customer Instructions</b><p>${esc(o.orderInstructions)}</p></div>`:""}<div class="order-meta"><span>${orderDistanceKm(o)!==null?"📏 Road "+orderDistanceKm(o).toFixed(1)+" km"+(orderRouteMinutes(o)!==null?" · "+Math.round(orderRouteMinutes(o))+" min route":""):(o.orderType==="Pickup"?"Pickup / dine-in":"📏 Road distance not recorded")}</span><span class="order-total">₹${Number(o.total||0).toLocaleString("en-IN")}</span></div><div class="order-actions">${act?`<button class="order-main-btn ${act[2]} advance-order" data-id="${esc(o.orderDocId||o.orderId)}" data-order-id="${esc(o.orderId)}" data-next="${esc(act[0])}">${act[1]}</button>`:`<button class="order-main-btn" disabled>${closed?"Closed":"Completed"}</button>`}${o.status==="NEW"?`<button class="order-cancel-btn cancel-master-order" data-id="${esc(o.orderDocId||o.orderId)}" data-order-id="${esc(o.orderId)}">✖ Cancel Order</button>`:""}<button class="order-more details-toggle" data-id="${esc(o.orderId)}">•••</button></div><div class="order-details" id="details-${esc(o.orderId)}"><p><b>Order details</b></p><select class="order-status-select order-status" data-id="${esc(o.orderDocId||o.orderId)}" data-order-id="${esc(o.orderId)}" ${closed?"disabled":""}>${STATUS_LIST.map(s=>`<option ${o.status===s?"selected":""}>${s}</option>`).join("")}</select><button class="wa-mini status-wa" data-id="${esc(o.orderDocId||o.orderId)}" data-phone="${esc(o.phone||"")}">💬 Send WhatsApp Status</button><button class="wa-mini order-share-wa" data-id="${esc(o.orderDocId||o.orderId)}">📲 Share Order on WhatsApp</button>${o.status==="DELIVERED"&&reviewSettings.googleEnabled?`<button class="wa-mini review-wa" data-id="${esc(o.orderDocId||o.orderId)}">⭐ Request Google Review on WhatsApp</button>`:""}</div></article>`}).join("");
  document.querySelectorAll(".advance-order").forEach(b=>b.onclick=()=>updateStatus(b.dataset.id,b.dataset.next));
  document.querySelectorAll(".cancel-master-order").forEach(b=>b.onclick=()=>cancelMasterOrder(b.dataset.id,b.dataset.orderId));
  document.querySelectorAll(".details-toggle").forEach(b=>b.onclick=()=>document.getElementById(`details-${b.dataset.id}`)?.classList.toggle("open"));
  document.querySelectorAll(".order-status").forEach(el=>el.onchange=()=>updateStatus(el.dataset.id,el.value));
  document.querySelectorAll(".status-wa").forEach(el=>el.onclick=()=>sendStatusWhatsApp(el.dataset.id,el.dataset.phone));document.querySelectorAll(".order-share-wa").forEach(el=>el.onclick=()=>shareOrderWhatsApp(el.dataset.id));document.querySelectorAll(".review-wa").forEach(el=>el.onclick=()=>sendOrderReviewWhatsApp(el.dataset.id));
}
function unlockMasterAudio(){
  try{
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C)return Promise.reject(new Error("This browser does not support Web Audio."));
    if(!sirenContext||sirenContext.state==='closed')sirenContext=new C();
    const ctx=sirenContext;
    const ready=ctx.state==='suspended'?ctx.resume():Promise.resolve();
    return ready.then(()=>{
      audioUnlocked=ctx.state==='running';
      return audioUnlocked;
    }).catch(error=>{
      audioUnlocked=false;
      console.warn('Audio unlock unavailable',error);
      throw error;
    });
  }catch(e){
    audioUnlocked=false;
    console.warn('Audio unlock unavailable',e);
    return Promise.reject(e);
  }
}
async function testMasterSound(){
  const button=$("#masterSoundTestBtn"),status=$("#masterSoundStatus");
  if(button){button.disabled=true;button.textContent="Testing…";}
  try{
    const ok=await unlockMasterAudio();
    if(!ok||!sirenContext||sirenContext.state!=="running")throw new Error("Audio is blocked or unavailable. Check phone media volume and browser sound permission.");
    const ctx=sirenContext,base=ctx.currentTime+0.04;
    [0,0.22,0.44].forEach(offset=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type="sine";
      osc.frequency.setValueAtTime(880,base+offset);
      gain.gain.setValueAtTime(0.0001,base+offset);
      gain.gain.exponentialRampToValueAtTime(0.22,base+offset+0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001,base+offset+0.16);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(base+offset);osc.stop(base+offset+0.18);
    });
    if(button)button.textContent="✓ Sound OK";
    if(status)status.textContent="Sound enabled on this device";
    console.info("Bake & Grill Master sound test: SUCCESS");
    setTimeout(()=>{if(button){button.textContent="🔊 Test Sound";button.disabled=false;}},2500);
  }catch(error){
    console.error("Bake & Grill Master sound test: FAILED",error);
    if(button){button.textContent="⚠ Retry Sound";button.disabled=false;}
    if(status)status.textContent=error.message||"Sound could not start";
  }
}
function stopSiren(){try{clearInterval(sirenTimer);sirenTimer=null;if(sirenContext&&sirenContext.state!=='closed')sirenContext.suspend().catch(()=>{});}catch(e){}}

function stopNewOrderAlert(){clearInterval(newOrderTimer);newOrderTimer=null;activeNewOrderId=null;stopSiren();document.title=ORIGINAL_TITLE;const ov=$("#newOrderOverlay");if(ov)ov.style.display="none";}
async function startLoudSiren(){
  try{
    const C=window.AudioContext||window.webkitAudioContext;if(!C)throw new Error("Web Audio is not supported");
    if(!sirenContext||sirenContext.state==='closed')sirenContext=new C();
    const ctx=sirenContext;
    if(ctx.state==='suspended')await ctx.resume();
    if(ctx.state!=='running')throw new Error("Audio is not unlocked. Tap Test Sound on the Master panel.");
    const play=()=>{
      if(ctx.state!=='running')return;
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='square';
      osc.frequency.setValueAtTime(520,ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1040,ctx.currentTime+0.45);
      osc.frequency.exponentialRampToValueAtTime(520,ctx.currentTime+0.9);
      gain.gain.setValueAtTime(0.0001,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.75,ctx.currentTime+0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.9);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start();osc.stop(ctx.currentTime+0.92);
    };
    clearInterval(sirenTimer);sirenTimer=null;
    play();sirenTimer=setInterval(play,1050);
  }catch(e){
    console.warn('Siren unavailable:',e);
    const status=$("#masterSoundStatus");
    if(status)status.textContent="Tap Test Sound once to enable order alerts";
  }
}
function showNewOrder(o){
  const ov=$("#newOrderOverlay");if(!ov||!o)return;
  const orderId=String(o.orderId||o.orderDocId||"").trim();
  if(!orderId)return;
  if(activeNewOrderId===orderId&&newOrderTimer)return;
  const ageMs=Math.max(0,Date.now()-(orderCreatedAtMs(o)||Date.now()));
  let remaining=Math.max(0,120-Math.floor(ageMs/1000));
  if(remaining<=0)return;
  stopNewOrderAlert();
  unlockMasterAudio();
  document.title="🚨 NEW ORDER #"+orderId;
  activeNewOrderId=orderId;
  $("#newOrderTitle").textContent="Order #"+orderId;
  const distanceKm=orderDistanceKm(o);
  const routeMinutes=orderRouteMinutes(o);
  const routeText=routeMinutes!==null?Math.round(routeMinutes)+" min":(distanceKm!==null?Math.ceil(distanceKm*6)+" min (estimate)":"Not available");
  const mapUrl=orderMapUrl(o);
  const isDelivery=String(o.orderType||"Delivery").toLowerCase().includes("delivery");
  const distanceText=isDelivery?(distanceKm!==null?distanceKm.toFixed(1)+" km":"Not recorded"):"Pickup / dine-in";
  const items=Array.isArray(o.items)?o.items:[];
  $("#newOrderSummary").innerHTML=
    '<div class="new-order-customer-line"><div><b>'+esc(o.name||"Customer")+'</b><small>'+esc(o.phone||"—")+'</small></div><span>₹'+Number(o.total||0).toLocaleString("en-IN")+'</span></div>'+
    '<div class="new-order-route"><div><small>ROAD DISTANCE</small><strong>'+distanceText+'</strong></div><div><small>ROUTE TIME</small><strong>'+(isDelivery?routeText:"—")+'</strong></div><div><small>DELIVERY MINIMUM</small><strong>'+(Number(o.minOrder||0)>0?"₹"+Number(o.minOrder).toLocaleString("en-IN"):"—")+'</strong></div><div><small>ADDRESS</small><strong class="new-order-address">'+esc(o.deliveryAddress||o.address||"Not recorded")+'</strong></div>'+
    (mapUrl?'<a href="'+esc(mapUrl)+'" target="_blank" rel="noopener noreferrer">📍 Open customer location in Google Maps</a>':"")+'</div>'+
    '<div class="new-order-items"><b>🛒 Customer ordered ('+items.length+' line'+(items.length===1?"":"s")+')</b>'+orderItemsHtml(o)+'</div>'+
    (o.orderInstructions?'<div class="new-order-instructions"><b>📝 Customer instructions</b><p>'+esc(o.orderInstructions)+'</p></div>':"")+
    '<div class="new-order-deadline">Accept within the remaining time shown below</div>';
  ov.style.display="flex";startLoudSiren();
  const timer=$("#newOrderTimer");
  const tick=()=>{if(timer)timer.textContent=String(Math.floor(remaining/60)).padStart(2,"0")+":"+String(remaining%60).padStart(2,"0");};
  tick();
  newOrderTimer=setInterval(async()=>{
    remaining--;tick();
    if(remaining<=0){
      clearInterval(newOrderTimer);newOrderTimer=null;stopSiren();
      try{await updateStatus(o.orderDocId||orderId,"CANCELLED");}finally{stopNewOrderAlert();}
    }
  },1000);
  $("#acceptNewOrder").onclick=async()=>{
    stopNewOrderAlert();
    const accepted=await updateStatus(o.orderDocId||orderId,"ACCEPTED");
    if(!accepted)showNewOrder(o);
  };
  $("#dismissNewOrder").onclick=async()=>{
    if(!confirm("Cancel order "+orderId+"? The customer will be notified."))return;
    stopNewOrderAlert();
    const cancelled=await updateStatus(o.orderDocId||orderId,"CANCELLED");
    if(cancelled){ov.style.display="none";stopSiren();}
    else showNewOrder(o);
  };
}
window.showNewOrder=showNewOrder;
window.addEventListener('focus',()=>{if(activeNewOrderId){const o=currentOrders.find(x=>x.orderId===activeNewOrderId);if(o&&o.status==='NEW')startLoudSiren();}});
window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&activeNewOrderId){const o=currentOrders.find(x=>x.orderId===activeNewOrderId);if(o&&o.status==='NEW')startLoudSiren();}});

function formatDate(v){try{return v?.toDate?v.toDate().toLocaleString():new Date(v).toLocaleString()}catch(e){return ""}}
function chooseEstimatedDeliveryMinutes(order={}){
  return new Promise(resolve=>{
    const options=[15,30,45,60,75,90,105,120,150,180,240];
    const km=orderDistanceKm(order)||0;
    const actualRouteMinutes=orderRouteMinutes(order)||0;
    const isDelivery=String(order.orderType||"Delivery").toLowerCase().includes("delivery");
    const travelMinutes=isDelivery?(actualRouteMinutes>0?Math.ceil(actualRouteMinutes):(km>0?Math.ceil(km*6):0)):0;
    const orderKey=String(order.orderDocId||order.orderId||"");
    const hasEarlierActiveOrder=Array.isArray(currentOrders)&&currentOrders.some(item=>
      String(item.orderDocId||item.orderId||"")!==orderKey&&
      !["DELIVERED","CANCELLED"].includes(String(item.status||"").toUpperCase())
    );
    const bufferMinutes=isDelivery&&hasEarlierActiveOrder?20:0;
    const suggestedMinutes=Math.max(15,20+travelMinutes+bufferMinutes);
    const defaultMinutes=options.find(n=>n>=suggestedMinutes)||240;
    const routeBasis=actualRouteMinutes>0?"Google Maps road-route estimate":(km>0?"6 min/km delivery estimate":"route not available");
    const overlay=document.createElement("div");
    overlay.className="eta-select-overlay";
    overlay.innerHTML=`<div class="eta-select-dialog" role="dialog" aria-modal="true" aria-labelledby="etaSelectTitle">
      <h3 id="etaSelectTitle">Choose Estimated Delivery Time</h3>
      <div class="eta-route-summary">
        <div><small>Customer distance</small><strong>${isDelivery&&km>0?km.toFixed(1)+" km":"Not available"}</strong></div>
        <div><small>Travel time</small><strong>${isDelivery&&travelMinutes?travelMinutes+" min":"—"}</strong></div>
      </div>
      <p class="eta-suggested-time">Suggested total time: <b>${isDelivery?defaultMinutes+" minutes":"20 minutes"}</b><br><small>20 min preparation + ${travelMinutes} min travel${bufferMinutes?" + 20 min active-order buffer":""} · ${routeBasis}</small></p>
      <select class="eta-select-value" aria-label="Estimated delivery time">
        ${options.map(n=>`<option value="${n}" ${n===defaultMinutes?"selected":""}>${n} minutes${n===defaultMinutes?" — suggested":""}</option>`).join("")}
      </select>
      <div class="eta-select-actions"><button type="button" class="eta-select-cancel">Cancel</button><button type="button" class="eta-select-confirm">Accept Order</button></div>
    </div>`;
    const finish=value=>{overlay.remove();resolve(value);};
    overlay.querySelector(".eta-select-cancel").onclick=()=>finish(null);
    overlay.querySelector(".eta-select-confirm").onclick=()=>finish(Number(overlay.querySelector("select").value));
    overlay.addEventListener("click",e=>{if(e.target===overlay)finish(null);});
    document.body.appendChild(overlay);
  });
}
async function updateStatus(id,status){
  try{
    const ref=db.collection("orders").doc(id),snap=await ref.get();
    if(!snap.exists){alert("Order not found.");return false;}
    const order=snap.data()||{},current=String(order.status||"NEW").toUpperCase();
    if(current==="DELIVERED"||current==="CANCELLED"){alert("This order is closed. Delivered/CANCELLED status cannot be changed.");renderOrders(await db.collection("orders").get());return false;}
    let expectedMinutes=Number(order.expectedDeliveryMinutes||0);
    if(status==="ACCEPTED"){
      const selected=await chooseEstimatedDeliveryMinutes(order);
      if(!selected)return false;
      expectedMinutes=selected;
    }
    const update={status,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),statusHistory:firebase.firestore.FieldValue.arrayUnion({status,at:Date.now(),by:auth.currentUser?.uid||null})};
    const publicUpdate={orderId:String(order.orderId||id),customerId:order.customerId,status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    if(status==="ACCEPTED"){
      const acceptedAt=Date.now();
      update.acceptedAt=acceptedAt;update.expectedDeliveryMinutes=expectedMinutes;
      publicUpdate.acceptedAt=acceptedAt;publicUpdate.expectedDeliveryMinutes=expectedMinutes;
    }
    if(status==="OUT FOR DELIVERY"){
      const etaStartedAt=Date.now();expectedMinutes=20;
      update.outForDeliveryAt=etaStartedAt;update.estimatedDeliveryMin=20;update.estimatedDeliveryMax=20;update.expectedDeliveryMinutes=20;
      publicUpdate.outForDeliveryAt=etaStartedAt;publicUpdate.estimatedDeliveryMin=20;publicUpdate.estimatedDeliveryMax=20;publicUpdate.expectedDeliveryMinutes=20;
    }
    if(status==="CANCELLED")publicUpdate.cancelReason="Cancelled by restaurant";
    // One atomic commit keeps the Master order and customer Track status aligned.
    const batch=db.batch();
    batch.update(ref,update);
    batch.set(db.collection("publicStatuses").doc(id),publicUpdate,{merge:true});
    await batch.commit();
    return true;
  }catch(e){
    console.error("Atomic order status sync failed:",e);
    alert("Order status and customer tracking could not be synced. No partial update was saved. Please retry. "+(e?.message||""));
    return false;
  }
}
async function cancelMasterOrder(id,orderId){
  if(!confirm("Cancel order "+(orderId||id)+"? The customer will see the order as cancelled."))return;
  await updateStatus(id,"CANCELLED");
}

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
🗺️ Customer Location: ${orderMapUrl(o)||"Please contact customer for location"}
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
function openReviewSettings(){
  if(!firebaseReady){alert("Firebase is not configured.");return;}
  document.getElementById("reviewGoogleEnabled").checked=reviewSettings.googleEnabled!==false;
  document.getElementById("reviewFeedbackEnabled").checked=reviewSettings.feedbackEnabled!==false;
  document.getElementById("reviewGoogleUrl").value=reviewSettings.googleReviewUrl||GOOGLE_REVIEW_URL;
  document.getElementById("reviewWhatsAppMessage").value=reviewSettings.whatsappMessage||DEFAULT_REVIEW_WHATSAPP_MESSAGE;
  document.getElementById("reviewSettingsMessage").textContent="";
  document.getElementById("reviewSettingsModal").classList.add("show");
}
function closeReviewSettings(){document.getElementById("reviewSettingsModal")?.classList.remove("show");}
async function saveReviewSettings(){
  const message=document.getElementById("reviewSettingsMessage");
  const enabled=document.getElementById("reviewGoogleEnabled").checked;
  const url=String(document.getElementById("reviewGoogleUrl").value||"").trim();
  let validUrl="";
  if(enabled){
    try{const parsed=new URL(url);if(parsed.protocol!=="https:")throw new Error("Use a secure https:// Google Review link.");validUrl=parsed.href;}
    catch(e){message.textContent=e.message||"Enter a valid Google Review URL.";return;}
  }else if(url){
    try{const parsed=new URL(url);if(parsed.protocol==="https:")validUrl=parsed.href;}catch(e){}
  }
  const data={
    googleEnabled:enabled,
    feedbackEnabled:document.getElementById("reviewFeedbackEnabled").checked,
    googleReviewUrl:validUrl||GOOGLE_REVIEW_URL,
    whatsappMessage:String(document.getElementById("reviewWhatsAppMessage").value||"").trim()||DEFAULT_REVIEW_WHATSAPP_MESSAGE,
    updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy:auth.currentUser?.uid||null
  };
  try{
    await db.collection("settings").doc("reviews").set(data,{merge:true});
    message.textContent="✅ Review settings saved. Customer site will update automatically.";
    setTimeout(closeReviewSettings,650);
  }catch(e){console.error("Review settings save failed:",e);message.textContent="❌ Save failed: "+e.message;}
}
function renderCustomerReviewInbox(){
  const list=document.getElementById("customerReviewInboxList");
  if(!list)return;
  const counts={
    ALL:customerReviewCache.length,
    FIVE:customerReviewCache.filter(x=>Number(x.rating)===5).length,
    FOUR:customerReviewCache.filter(x=>Number(x.rating)===4).length,
    LOW:customerReviewCache.filter(x=>Number(x.rating)>=1&&Number(x.rating)<=3).length
  };
  document.querySelectorAll("[data-review-filter]").forEach(button=>{
    const key=button.dataset.reviewFilter;
    const count=button.querySelector("[data-review-count]");
    if(count)count.textContent=String(counts[key]??0);
    button.classList.toggle("active",key===activeCustomerReviewFilter);
    button.setAttribute("aria-pressed",key===activeCustomerReviewFilter?"true":"false");
  });
  const rows=activeCustomerReviewFilter==="ALL"?customerReviewCache:customerReviewCache.filter(x=>{
    const rating=Number(x.rating)||0;
    return activeCustomerReviewFilter==="FIVE"?rating===5:activeCustomerReviewFilter==="FOUR"?rating===4:rating>=1&&rating<=3;
  });
  if(!customerReviewCache.length){
    list.innerHTML='<div class="bg-review-empty"><b>No customer feedback yet</b><span>Feedback submitted after delivery will appear here.</span></div>';
    return;
  }
  if(!rows.length){
    list.innerHTML='<div class="bg-review-empty"><b>No reviews in this rating group</b><span>Choose another filter to see more feedback.</span></div>';
    return;
  }
  list.innerHTML=rows.map(item=>{
    const r=item.data||{},rating=Math.max(0,Math.min(5,Number(r.rating)||0));
    const stars="★".repeat(rating)+"☆".repeat(5-rating);
    const date=r.createdAt?formatDate(r.createdAt):"Recently submitted";
    return '<article class="bg-review-entry"><div class="bg-review-entry-head"><b>'+esc("Order #"+(r.orderId||item.id))+'</b><span>'+stars+' <small>'+rating+'/5</small></span></div><p>'+esc(r.comment||"No written comment provided.")+'</p><small>'+esc(date)+'</small></article>';
  }).join("");
}
function openReviewInbox(){
  if(!firebaseReady){alert("Firebase is not configured.");return;}
  document.getElementById("customerReviewInboxModal").classList.add("show");
  const list=document.getElementById("customerReviewInboxList");
  list.innerHTML='<div class="bg-review-empty">Loading customer feedback…</div>';
  activeCustomerReviewFilter="ALL";
  document.querySelectorAll("[data-review-filter]").forEach(button=>button.classList.toggle("active",button.dataset.reviewFilter==="ALL"));
  document.querySelectorAll("[data-review-filter]").forEach(button=>button.onclick=()=>{
    activeCustomerReviewFilter=button.dataset.reviewFilter||"ALL";
    renderCustomerReviewInbox();
  });
  unsubscribeCustomerReviews?.();
  unsubscribeCustomerReviews=db.collection("customerReviews").orderBy("createdAt","desc").limit(100).onSnapshot(snapshot=>{
    customerReviewCache=snapshot.docs.map(doc=>({id:doc.id,data:doc.data()||{},rating:Number(doc.data()?.rating)||0}));
    renderCustomerReviewInbox();
  },error=>{
    console.error("Customer review inbox load failed:",error);
    list.innerHTML='<div class="bg-review-empty">Could not load feedback. Check Firebase rules and login.</div>';
  });
}
function closeReviewInbox(){
  unsubscribeCustomerReviews?.();unsubscribeCustomerReviews=null;
  document.getElementById("customerReviewInboxModal")?.classList.remove("show");
}
function sendOrderReviewWhatsApp(id){
  const order=currentOrders.find(x=>String(x.orderDocId||x.orderId)===String(id)||String(x.orderId)===String(id));
  if(!order){alert("Order not found.");return;}
  if(String(order.status||"").toUpperCase()!=="DELIVERED"){alert("A review request can only be sent after the order is delivered.");return;}
  if(!reviewSettings.googleEnabled||!reviewSettings.googleReviewUrl){alert("Google Review requests are currently disabled in Review Settings.");return;}
  const digits=String(order.phone||"").replace(/\D/g,"");
  const phone=digits.length===10?"91"+digits:(digits.startsWith("91")?digits:(digits.length===11&&digits.startsWith("0")?"91"+digits.slice(1):""));
  if(!phone){alert("This order does not have a valid customer mobile number.");return;}
  const message=String(reviewSettings.whatsappMessage||DEFAULT_REVIEW_WHATSAPP_MESSAGE)
    .split("{name}").join(String(order.name||"there"))
    .split("{orderId}").join(String(order.orderId||id))
    .split("{reviewUrl}").join(String(reviewSettings.googleReviewUrl||GOOGLE_REVIEW_URL));
  window.open("https://wa.me/"+phone+"?text="+encodeURIComponent(message),"_blank","noopener");
}

function startRealtime(){
  unsubscribeStock?.(); unsubscribeOrders?.(); unsubscribeMenu?.(); unsubscribeDelivery?.(); unsubscribeReviews?.(); unsubscribeCustomerReviews?.();
  unsubscribeStock=db.collection("stock").onSnapshot(s=>{stock={};s.forEach(d=>stock[d.id]=d.data());renderStock();window.renderMasterDashboard?.()},e=>{console.error("Stock listener:",e);renderStock();const t=$("#stockTable");if(t && !t.innerHTML.trim()) t.innerHTML=`<tr><td colspan="5">Could not load Firebase inventory. Check Firebase Rules/login.</td></tr>`;});
  unsubscribeMenu=db.collection("menu").onSnapshot(s=>{liveMenu={};s.forEach(d=>liveMenu[d.id]=d.data());renderMenuEditor();renderStock();window.BakeGrillMasterUI?.refresh?.();window.renderMasterDashboard?.()},e=>console.error(e));
  unsubscribeDelivery=db.collection("settings").doc("delivery").onSnapshot(d=>{deliveryEnabled=d.exists?d.data().enabled!==false:true;renderDeliveryControl()},e=>console.error(e));
  unsubscribeReviews=db.collection("settings").doc("reviews").onSnapshot(d=>{const v=d.exists?d.data():{};reviewSettings={googleEnabled:v.googleEnabled!==false,feedbackEnabled:v.feedbackEnabled!==false,googleReviewUrl:String(v.googleReviewUrl||GOOGLE_REVIEW_URL),whatsappMessage:String(v.whatsappMessage||DEFAULT_REVIEW_WHATSAPP_MESSAGE)};db.collection("orders").get().then(renderOrders).catch(()=>{});},e=>console.error("Review settings listener:",e));
  unsubscribeOrders=db.collection("orders").onSnapshot(renderOrders,e=>{console.error(e);$("#ordersGrid").innerHTML='<div class="empty-orders"><b>Could not load orders</b><span>Check Firebase connection and rules.</span></div>'});
  renderMenuEditor();
}
async function init(){
  document.addEventListener("pointerdown",unlockMasterAudio,{once:true,capture:true});
  document.addEventListener("keydown",unlockMasterAudio,{once:true,capture:true});
  $("#masterSoundTestBtn")?.addEventListener("click",testMasterSound);
  if(!firebaseReady){showLogin();$("#loginError").textContent="Firebase is not configured. Edit firebase-config.js first.";return;}
  $("#filter").innerHTML='<option value="all">All Categories</option>'+[...new Set(MENU_ITEMS.map(x=>x.category))].map(c=>`<option>${esc(c)}</option>`).join("");
  renderStock();

  auth.onAuthStateChanged(user=>{
    if(user && !user.isAnonymous && user.uid === MASTER_UID){
      showMasterApp();startRealtime();
      if(window.BakeGrillMasterPush?.init) window.BakeGrillMasterPush.init();
    }else{
      unsubscribeOrders?.();unsubscribeStock?.();unsubscribeMenu?.();unsubscribeDelivery?.();unsubscribeReviews?.();unsubscribeCustomerReviews?.();
      showLogin();
      if(user && !user.isAnonymous){
        $("#loginError").textContent="This account is not authorized for the Bake & Grill Master Site.";
        auth.signOut().catch(()=>{});
      }else if(user?.isAnonymous)auth.signOut().catch(()=>{});
    }
  });
  $("#loginForm").addEventListener("submit",async e=>{e.preventDefault();$("#loginError").textContent="";try{await auth.signInWithEmailAndPassword($("#loginId").value.trim(),$("#loginPassword").value)}catch(err){$("#loginError").textContent=err.message.replace("Firebase: ","")}});
}
init();

document.addEventListener("DOMContentLoaded",()=>{$("#editImageFile")?.addEventListener("change",uploadItemImage);$("#removeItemImage")?.addEventListener("click",removeItemImage);});

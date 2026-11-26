const $=s=>document.querySelector(s);
const MASTER_AUTH_KEY="bake_grill_firebase_admin_v1";
const MASTER_UID="f1Gx3tPIigZmqM2ImCzqGQN2xuJ3";
const STATUS_LIST=["NEW","ACCEPTED","PREPARING","READY","OUT FOR DELIVERY","DELIVERED","CANCELLED"];
const LEGACY_GOOGLE_REVIEW_URL="https://search.google.com/local/writereview?placeid=ChIJ827xCF1jAjoRURsEjhZtgEo";
const GOOGLE_REVIEW_URL="https://g.page/r/CVEbBI4WbYBKEAI/review";
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
  return rows.map(item=>window.applyPizzaImageOverride?.(item,live[item.id]) ?? item);
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
  const x=base;
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
    const ref=window.storage.ref().child("product-images/"+id+"-"+crypto.randomUUID()+".jpg");
    await ref.put(blob,{contentType:"image/jpeg",cacheControl:"public,max-age=3600"});
    const downloadUrl=await ref.getDownloadURL();
    const url=downloadUrl+(downloadUrl.includes("?")?"&":"?")+"v="+Date.now();
    await saveMenuVersion(id,{image:url,imageEdited:true,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    if(preview){preview.src=url;preview.dataset.image=url;}
    if($("#editImageUrl"))$("#editImageUrl").value=url;
    if($("#removeItemImage"))$("#removeItemImage").disabled=false;
    if(liveMenu[id]) liveMenu[id].image=url; else liveMenu[id]={image:url};
    if(msg)msg.textContent="✅ Image uploaded and saved.";
    $("#editImageFile").value="";
  }catch(e){console.error(e);if(msg)msg.textContent="❌ Image upload failed: "+e.message;}
}
async function removeItemImage(){
  const id=$("#editId").value;if(!id)return;
  const msg=$("#imageEditMsg"),preview=$("#editImagePreview");
  if(!confirm("Remove this product image?"))return;
  if(msg)msg.textContent="Removing image…";
  try{
    await saveMenuVersion(id,{image:"",imageEdited:true,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    if(liveMenu[id]) liveMenu[id].image=""; else liveMenu[id]={image:""};
    if(preview){preview.src="assets/logo.png";preview.dataset.image="";}
    if($("#editImageUrl"))$("#editImageUrl").value="";
    if($("#removeItemImage"))$("#removeItemImage").disabled=true;
    if(msg)msg.textContent="✅ Image removed.";
  }catch(e){console.error(e);if(msg)msg.textContent="❌ Remove failed: "+e.message;}
}
async function saveMenuVersion(id, changes, stockChanges){
  const item=db.collection("menu").doc(id);
  const inventory=db.collection("stock").doc(id);
  const backup=db.collection("menuRollback").doc(id);
  await db.runTransaction(async transaction=>{
    const [previous, previousStock]=await Promise.all([transaction.get(item),transaction.get(inventory)]);
    transaction.set(backup,{menu:previous.data()??null,stock:previousStock.data()??null,restoreStock:!!stockChanges});
    transaction.set(item,changes,{mergeFields:Object.keys(changes)});
    if(stockChanges)transaction.set(inventory,stockChanges,{merge:true});
  });
}
async function restoreMenuVersion(id){
  const item=db.collection("menu").doc(id);
  const inventory=db.collection("stock").doc(id);
  const backup=db.collection("menuRollback").doc(id);
  await db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(backup);
    if(!snapshot.exists)throw Error("No previous version saved for this item.");
    const previous=snapshot.data();
    if(previous.menu)transaction.set(item,previous.menu);
    else transaction.delete(item);
    if(previous.restoreStock){
      if(previous.stock)transaction.set(inventory,previous.stock);
      else transaction.delete(inventory);
    }
    transaction.delete(backup);
  });
}
function closeItemEditor(){$("#itemEditModal").style.display="none";$("#menuItemPreview").hidden=true;}
async function saveItemEditor(){
  const id=$("#editId").value, base=allMenuAdminItems().find(x=>String(x.id)===String(id)); if(!base)return;
  const data={name:$("#editName").value.trim(),description:$("#editDescription").value.trim(),category:$("#editCategory").value,bestChoice:$("#editBestChoice").checked,hero:$("#editHero").checked,badge:$("#editBadge").value.trim()||($("#editBestChoice").checked?"BEST CHOICE":""),updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
  if(!data.name){$("#itemEditMsg").textContent="Name is required.";return;}
  if(base.type==="pizza" || base.prices){data.prices={"Ekla Bite":Number($("#editEkla").value||0),"Bondhu Bite":Number($("#editBondhu").value||0),"Family Bite":Number($("#editFamily").value||0)};}else data.price=Number($("#editPrice").value||0);
  try{await db.collection("menu").doc(id).set(data,{merge:true});$("#itemEditMsg").textContent="✅ Saved. Customer site will update automatically.";setTimeout(closeItemEditor,600);}catch(e){console.error(e);$("#itemEditMsg").textContent="❌ Save failed: "+e.message;}
}
const deliverySchedule=window.BGDeliverySchedule;
const pauseDialog=$("#deliveryPauseDialog");
const pauseForm=$("#deliveryPauseForm");
let deliveryResumeAt=0;
let savingDeliverySchedule=false;

async function saveDeliverySchedule(resumeAt){
  if(savingDeliverySchedule)return false;
  savingDeliverySchedule=true;
  try{
    await db.collection("settings").doc("delivery").set({
      enabled:true, deliveryResumeAt:resumeAt,
      updatedAt:firebase.firestore.FieldValue.serverTimestamp(), updatedBy:auth.currentUser?.uid||null
    },{merge:true});
    return true;
  }catch(error){
    console.error("Delivery schedule save:",error);
    return false;
  }finally{savingDeliverySchedule=false;}
}

function openDeliveryPause(){
  const indiaOffset=330*60*1000;
  const now=Date.now();
  const initial=deliveryResumeAt>now?deliveryResumeAt:Math.ceil((now+30*60000)/900000)*900000;
  const local=new Date(initial+indiaOffset).toISOString();
  $("#deliveryResumeDate").min=new Date(now+indiaOffset).toISOString().slice(0,10);
  $("#deliveryResumeDate").value=local.slice(0,10);
  $("#deliveryResumeTime").value=local.slice(11,16);
  $("#deliveryPauseMessage").textContent="";
  $("#deliveryPauseSave").textContent=deliveryEnabled?"Pause delivery":"Update restart time";
  if(!pauseDialog.open)pauseDialog.showModal();
}

async function toggleDelivery(){
  if(!firebaseReady||savingDeliverySchedule)return;
  if(deliveryEnabled){openDeliveryPause();return;}
  if(!await saveDeliverySchedule(null))alert("Could not resume delivery. Please try again.");
}

$("#deliveryPauseCancel").onclick=()=>pauseDialog.close();
$("#changeDeliveryResume").onclick=openDeliveryPause;
pauseForm.onsubmit=async event=>{
  event.preventDefault();
  const resumeAt=Date.parse($("#deliveryResumeDate").value+"T"+$("#deliveryResumeTime").value+":00+05:30");
  const status=$("#deliveryPauseMessage");
  if(!Number.isFinite(resumeAt)||resumeAt<=Date.now()){
    status.textContent="Choose a future date and time.";
    return;
  }
  const button=$("#deliveryPauseSave");
  button.disabled=true;
  status.textContent="Saving…";
  try{
    if(await saveDeliverySchedule(resumeAt)){pauseDialog.close();}
    else status.textContent="Could not save the restart time. Try again.";
  }finally{button.disabled=false;}
};

const applyMasterDeliverySchedule=deliverySchedule.watch((on,resumeAt)=>{
  deliveryEnabled=on;
  deliveryResumeAt=resumeAt;
  const summary=$("#deliveryRestartSummary");
  summary.hidden=!resumeAt||on;
  $("#deliveryRestartLabel").textContent=resumeAt&&!on?"Auto-resumes "+deliverySchedule.format(resumeAt):"";
  renderDeliveryControl();
});
let kitchenLimit = 0;
function renderKitchenLoad(){
  const count=currentOrders.filter(order=>["ACCEPTED","PREPARING"].includes(order.status)).length;
  $("#kitchenLoad").textContent=count+" in kitchen"+(kitchenLimit?" / "+kitchenLimit:" · no cap");
}
$("#operationsForm").onsubmit=async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const button=form.querySelector("button");
  button.disabled=true;
  try{
    await db.collection("settings").doc("delivery").set({
      kitchenLimit:Number($("#kitchenLimit").value),maxRoadKm:Number($("#maxRoadKm").value)
    },{merge:true});
    $("#operationsStatus").textContent="Controls saved.";
  }catch{
    $("#operationsStatus").textContent="Controls could not be saved. Try again.";
  }finally{button.disabled=false;}
};
const shopToggle=$("#shopToggle");
let shopEnabled=true;
function renderShopToggle(settings){
  shopEnabled=settings.shopEnabled!==false;
  shopToggle.textContent=shopEnabled?"Shop OPEN":"Shop OFF";
  shopToggle.className="delivery-btn "+(shopEnabled?"on":"off");
  shopToggle.setAttribute("aria-pressed",String(shopEnabled));
  shopToggle.setAttribute("aria-label",shopEnabled?"Close shop ordering":"Open shop ordering");
  shopToggle.disabled=shopToggle.dataset.saving==="true";
}
shopToggle.addEventListener("click",async ()=>{
  if(shopToggle.disabled)return;
  shopToggle.dataset.saving="true";
  shopToggle.disabled=true;
  try{
    await db.collection("settings").doc("delivery").set({shopEnabled:!shopEnabled},{merge:true});
  }catch(error){
    console.error("Shop availability save:",error);
    alert("Could not update shop availability. Try again.");
  }finally{
    delete shopToggle.dataset.saving;
    shopToggle.disabled=false;
  }
});
const shopHoursForm=$("#shopHoursForm");
shopHoursForm.addEventListener("input",()=>{shopHoursForm.dataset.edited="true";});
shopHoursForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const opensAt=$("#shopOpensAt").value;
  const closesAt=$("#shopClosesAt").value;
  const status=$("#shopHoursStatus");
  if(opensAt===closesAt){
    status.textContent="Opening and closing times must be different.";
    return;
  }
  const button=$("#saveShopHours");
  if(button.disabled)return;
  button.disabled=true;
  shopHoursForm.dataset.saving="true";
  try{
    await db.collection("settings").doc("delivery").set({shopOpensAt:opensAt,shopClosesAt:closesAt},{merge:true});
    if($("#shopOpensAt").value===opensAt&&$("#shopClosesAt").value===closesAt){
      delete shopHoursForm.dataset.edited;
    }
    status.textContent="Shop hours saved.";
  }catch(error){
    console.error("Shop hours save:",error);
    status.textContent="Could not save shop hours. Please try again.";
  }finally{
    delete shopHoursForm.dataset.saving;
    button.disabled=false;
  }
});
function renderShopHoursSettings(settings){
  if(!shopHoursForm.dataset.edited){
    $("#shopOpensAt").value=settings.shopOpensAt||"10:00";
    $("#shopClosesAt").value=settings.shopClosesAt||"22:00";
  }
  $("#saveShopHours").disabled=!!shopHoursForm.dataset.saving;
}
function renderDeliveryControl(){const b=$("#deliveryToggle"),b2=$("#deliveryToggle2"),t=$("#deliveryStateText");if(b){b.textContent=deliveryEnabled?"Delivery ON":"Delivery OFF";b.className=`delivery-btn ${deliveryEnabled?"on":"off"}`;b.setAttribute("aria-pressed",String(!!deliveryEnabled));b.setAttribute("aria-label",deliveryEnabled?"Turn delivery off":"Turn delivery on");}if(b2)b2.textContent=deliveryEnabled?"Turn OFF":"Turn ON";if(t)t.textContent=deliveryEnabled?"Delivery is ON":"Delivery is OFF";}
function statusKey(s){return String(s||"").replace(/\s+/g,"-").replace(/[^A-Z0-9-]/g,"");}
function posReceiptSummary(order){
  const receipt=order.posReceipt;
  if(receipt?.state==="loaded")return '<div class="order-meta"><span>POS</span><b>Loaded into register</b></div>';
  if((receipt?.state==="billed"||receipt?.state==="voided")&&receipt.billNumber){
    const label=receipt.state==="voided"?"POS bill voided":"Receipt in POS";
    return `<div class="order-meta"><span>${label}</span><b>${esc(receipt.billNumber)}</b></div>`;
  }
  return '';
}
function nextAction(status,takeaway=false){if(takeaway&&status==="READY")return ["DELIVERED","Mark collected","ready"];if(status==="NEW")return ["ACCEPTED","Accept Order","accept"];if(status==="ACCEPTED")return ["PREPARING","Start Preparing",""];if(status==="PREPARING")return ["READY","Order Ready","ready"];if(status==="READY")return ["OUT FOR DELIVERY","Out for Delivery","out"];if(status==="OUT FOR DELIVERY")return ["DELIVERED","Mark Delivered",""];return null;}
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

function orderItemsHtml(o){
  const items=Array.isArray(o.items)?o.items:[];
  if(!items.length)return '<div class="order-item"><span>Order items</span><span>—</span></div>';
  return items.map(it=>{
    const name=it.name||it.itemName||"Item",qty=Math.max(1,Number(it.qty||it.quantity||1));
    const unit=Number(it.price||0),lineTotal=Number(it.total??unit*qty),size=it.size||it.selectedSize||"";
    const extras=Array.isArray(it.extras)?it.extras:(Array.isArray(it.customizations)?it.customizations:[]);
    const extraText=extras.length?'<div class="order-extra"><b>Extras:</b> '+extras.map(e=>{
      if(typeof e==="string")return esc(e);
      const extraQty=Math.max(1,Number(e.qty||e.quantity||1));
      const label=(extraQty>1?extraQty+" × ":"")+String(e.name||e.title||"Extra"),amount=Number(e.price||0);
      return esc(label)+(amount>0?" (+₹"+amount.toLocaleString("en-IN")+(extraQty>1?" each":"")+")":"");
    }).join(", ")+'</div>':"";
    return '<div class="order-item"><span>'+qty+' × '+esc(name)+(size?' <small>('+esc(size)+')</small>':"")+'</span><strong>₹'+lineTotal.toLocaleString("en-IN")+'</strong></div>'+extraText;
  }).join("");
}
function orderDistanceKm(o){
  const values=[
    o?.distanceKm,o?.roadDistanceKm,o?.routeDistanceKm,o?.deliveryDistanceKm,
    o?.customerLocation?.distanceKm,o?.location?.distanceKm,
    o?.deliveryLocation?.distanceKm,o?.route?.distanceKm,o?.delivery?.distanceKm
  ];
  for(const value of values){
    if(value===null||value===undefined||value==="")continue;
    const n=Number(value);if(Number.isFinite(n)&&n>0)return n;
  }
  return null;
}
function renderOrderTabs(){const counts={ALL:currentOrders.length,NEW:0,ACCEPTED:0,PREPARING:0,READY:0,"OUT FOR DELIVERY":0,DELIVERED:0};currentOrders.forEach(o=>{if(counts[o.status]!==undefined)counts[o.status]++});$("#countAll").textContent=counts.ALL;$("#countNEW").textContent=counts.NEW;$("#countACCEPTED").textContent=counts.ACCEPTED;$("#countPREPARING").textContent=counts.PREPARING;$("#countREADY").textContent=counts.READY;$("#countOUT").textContent=counts["OUT FOR DELIVERY"];$("#countDELIVERED").textContent=counts.DELIVERED;document.querySelectorAll(".order-tab").forEach(b=>b.classList.toggle("active",b.dataset.status===activeOrderTab));}
const PHONE_REVIEW_TOTAL = 800;
let fraudFlags = new Map();
let lastOrdersSnapshot = null;
let unsubscribeFraudFlags;

function fraudPhone(order) {
  const phone = String(order.phone || "");
  return /^\d{10}$/.test(phone) ? phone : "";
}

function phoneReviewReason(order) {
  const phone = fraudPhone(order);
  if (!phone) return "";
  if (order.phoneReviewStartedAt) return "Phone confirmation pending";
  const flag = fraudFlags.get(phone);
  if (flag) return "Previously marked fake: " + flag.reason;
  const fulfilled = currentOrders.some(item => fraudPhone(item) === phone && item.status === "DELIVERED");
  return !fulfilled && Number(order.total) >= PHONE_REVIEW_TOTAL ? "First delivery at ₹800 or more" : "";
}

async function startPhoneReview(id, button) {
  button.disabled = true;
  try {
    await db.collection("orders").doc(id).update({
      phoneReviewStartedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (activeNewOrderId && currentOrders.some(item => item.orderId === activeNewOrderId && (item.orderDocId || item.orderId) === id)) {
      stopNewOrderAlert();
    }
  } catch (error) {
    console.error("Phone review could not start:", error);
    alert("Could not start phone review. The order may already be closed or past the review window.");
    button.disabled = false;
  }
}
function phoneReviewControls(order) {
  if (order.status !== "NEW" || !fraudPhone(order) || !phoneReviewReason(order)) return "";
  const started = order.phoneReviewStartedAt?.toMillis?.();
  const until = started ? new Date(started + 300000).toLocaleTimeString("en-IN", {timeZone:"Asia/Kolkata",hour:"numeric",minute:"2-digit"}) : "";
  const label = order.phoneReviewStartedAt ? ("Phone review" + (until ? " until " + until : " in progress")) : "Hold for phone review";
  return '<button type="button" class="order-phone-review wa-mini" data-order="' + esc(order.orderDocId || order.orderId) + '"' + (order.phoneReviewStartedAt ? ' disabled' : '') + '>' + esc(label) + '</button>';
}

async function toggleFraudFlag(id) {
  const order = currentOrders.find(item => (item.orderDocId || item.orderId) === id);
  const phone = order && fraudPhone(order);
  if (!phone) return;
  const ref = db.collection("orderFraudFlags").doc(phone);
  try {
    if (fraudFlags.has(phone)) {
      if (confirm("Remove the confirmed-fake flag for this number?")) await ref.delete();
      return;
    }
    const reason = prompt("Why was this order confirmed fake? This note is visible only in Master.")?.trim();
    if (!reason) return;
    await ref.set({orderId: id, reason: reason.slice(0, 240), updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
  } catch (error) {
    console.error("Could not save fraud flag:", error);
    alert("Could not save the fraud flag. Please try again.");
  }
}

const kotPaperSetting = "bake-grill-kot-paper";
const kotPaper = $("#kotPaperWidth");
try { if(localStorage.getItem(kotPaperSetting)==="58")kotPaper.value="58"; } catch {}
kotPaper.onchange=()=>{
  try { localStorage.setItem(kotPaperSetting,kotPaper.value); } catch {}
};

const kotDirectSetting = "bake-grill-kot-direct";
const kotDirect = $("#kotDirectPrint");
if (kotDirect) {
  try { kotDirect.checked = localStorage.getItem(kotDirectSetting) === "1"; } catch {}
  kotDirect.onchange = () => {
    try { localStorage.setItem(kotDirectSetting, kotDirect.checked ? "1" : "0"); } catch {}
  };
}

function kitchenTicketItems(order){
  const items=Array.isArray(order.items)?order.items:[];
  return items.map(item=>{
    const qty=Math.max(1,Number(item.qty||item.quantity)||1);
    const size=item.size||item.selectedSize;
    const extras=Array.isArray(item.extras)?item.extras:(Array.isArray(item.customizations)?item.customizations:[]);
    return `<li><strong class="qty">${qty}×</strong><div><strong>${esc(item.name||item.itemName||"Item")}</strong>
      ${size?`<div>${esc(size)}</div>`:""}
      ${extras.map(extra=>{
        const count=Math.max(1,Number(extra?.qty||extra?.quantity)||1);
        const name=typeof extra==="string"?extra:extra?.name||extra?.title||"Extra";
        return `<div>+ ${count>1?count+"× ":""}${esc(name)}</div>`;
      }).join("")}</div></li>`;
  }).join("")||"<li>No item details available</li>";
}

function printKitchenTicket(id) {
  const order=currentOrders.find(item=>(item.orderDocId||item.orderId)===id);
  if(!order)return;
  const paper=kotPaper.value==="58"?58:80;
  const printableWidth=paper===58?48:72;
  const correction=order.correction?.state==="acknowledged"?order.correction.note:"";
  const markup = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>KOT ${esc(window.BGOrderReference(order.orderId))}</title><style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #000; background: #fff; font: 10pt/1.35 system-ui,sans-serif; }
    main { width: ${printableWidth}mm; padding: 2mm; margin: 0 auto; overflow-wrap: anywhere; }
    header { text-align: center; border-bottom: 1px dashed; padding-bottom: 2mm; }
    h1 { font-size: 15pt; margin: 0 0 1mm; }
    h2 { font-size: 12pt; margin: 0 0 1mm; }
    ul { padding: 0; margin: 0; list-style: none; }
    li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2mm; padding: 2mm 0; border-bottom: 1px dashed; break-inside: avoid; }
    p { margin: 2mm 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .controls { padding: 12px; border-bottom: 1px solid #aaa; text-align: center; font: 13px system-ui,sans-serif; }
    button { padding: 8px 14px; font: inherit; }
    @media print { .controls { display: none; } }
    </style></head><body>
    <div class="controls"><button id="printTicket" type="button">Print KOT</button><p>Select the ${paper} mm roll in your printer settings. Use 100% scale and turn off headers and footers. If the driver feeds extra paper, use its receipt or roll mode.</p></div>
    <main><header><h1>Bake &amp; Grill</h1><h2>Kitchen order ticket</h2><strong>#${esc(window.BGOrderReference(order.orderId))}</strong><br>${esc(formatDate(order.createdAt))}</header>
    ${order.orderType==="takeaway"&&order.pickupAt?`<p><strong>Pickup · ${esc(window.BGPickup.pickupLabel(order.pickupAt,true))}</strong></p>`:""}
    <ul>${kitchenTicketItems(order)}</ul>
    ${order.orderInstructions?`<p><strong>Instructions</strong>
${esc(order.orderInstructions)}</p>`:""}
    ${correction?`<p><strong>Order correction</strong>
${esc(correction)}</p>`:""}
    </main></body></html>`;

  if (kotDirect?.checked) {
    if (document.getElementById("kotPrintFrame")) return;
    const frame = document.createElement("iframe");
    frame.id = "kotPrintFrame";
    frame.title = "Kitchen order ticket";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:100mm;height:1px;border:0";
    frame.addEventListener("load", async () => {
      const page = frame.contentWindow;
      if (page.document.fonts) await page.document.fonts.ready;
      const removeFrame = () => frame.remove();
      page.addEventListener("afterprint", removeFrame, {once:true});
      try {
        printSizedKitchenTicket(page, paper);
      } catch {
        alert("Could not open printing. Check the thermal printer and try again.");
      } finally {
        // Keep the print document alive for browsers that start printing asynchronously.
        setTimeout(removeFrame, 30000);
      }
    }, {once:true});
    frame.srcdoc = markup;
    document.body.append(frame);
    return;
  }

  const page=window.open("","_blank","popup,width=430,height=690");
  if(!page){alert("Allow pop-ups to open the kitchen ticket.");return;}
  page.opener=null;
  page.document.open();
  page.document.write(markup);
  page.document.close();
  const printTicket = () => printSizedKitchenTicket(page, paper);
  page.document.getElementById("printTicket").onclick = printTicket;
  page.focus();
  if(page.document.fonts)page.document.fonts.ready.then(printTicket);
  else printTicket();
}

function printSizedKitchenTicket(page, paper) {
  const doc = page.document;
  const paperStyle = doc.getElementById("kotPageSize") || doc.createElement("style");
  paperStyle.id = "kotPageSize";
  // CSS pixels are defined at 96 per inch. Leave 3 mm for rounding and feed.
  const heightMm = Math.ceil(doc.querySelector("main").getBoundingClientRect().height * 25.4 / 96) + 3;
  paperStyle.textContent = `@page { size: ${paper}mm ${heightMm}mm; margin: 0; }`;
  doc.head.append(paperStyle);
  page.print();
}

function correctionControls(order){
  const request=order.correction;
  if(!request)return "";
  const buttons=request.state==="pending"&&["NEW","ACCEPTED"].includes(order.status)
    ? ["acknowledged","declined"].map(state=>`<button type="button" class="wa-mini" data-correction-order="${esc(order.orderDocId)}" data-correction-state="${state}">${state==="acknowledged"?"Acknowledge":"Decline"}</button>`).join("")
    : "";
  return `<div class="order-instructions-note"><b>Correction request · ${esc(request.state)}</b><p>${esc(request.note)}</p>${buttons}</div>`;
}
async function resolveOrderCorrection(button){
  button.disabled=true;
  try{
    const ref=db.collection("orders").doc(button.dataset.correctionOrder);
    await db.runTransaction(async transaction=>{
      const request=(await transaction.get(ref)).data()?.correction;
      if(request?.state!=="pending")throw Error("This request has already changed.");
      transaction.update(ref,{correction:{
        note:request.note,state:button.dataset.correctionState,updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      }});
    });
  }catch{alert("The request could not be updated. Check the latest order status.");button.disabled=false;}
}
function renderOrders(snapshot){
  lastOrdersSnapshot = snapshot;
  const all=[]; snapshot.forEach(d=>all.push({...d.data(),orderId:d.data().orderId||d.id,orderDocId:d.id})); all.sort((a,b)=>{const ad=a.createdAt?.toDate?.()||a.createdAt||0,bd=b.createdAt?.toDate?.()||b.createdAt||0;return new Date(bd)-new Date(ad)}); currentOrders=all; renderKitchenLoad(); renderOrderTabs(); window.renderMasterDashboard?.(); window.renderOrderDetails?.();
  if(activeNewOrderId){const active=currentOrders.find(o=>o.orderId===activeNewOrderId);if(!active||active.status!=="NEW") stopNewOrderAlert();}
  // Do not alert for NEW orders that were already present when the Master page first loaded.
  // Alert only when a genuinely new order document appears after the initial snapshot.
  if(!initialOrdersLoaded){
    all.forEach(o=>knownOrderIds.add(o.orderId));
    initialOrdersLoaded=true;
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
  renderOrderBoard();
}
const orderDayFormat = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"});
const orderPageSize = 24;
let visibleOrderLimit = orderPageSize;
function filterOrderBoard(orders, tab, status, day, query, sort){
  const needle=query.trim().toLowerCase();
  const matches=orders.filter(order=>{
    if(tab!=="ALL"&&order.status!==tab || tab==="ALL"&&status&&order.status!==status)return false;
    if(day){
      const date=order.createdAt?.toDate?.()||new Date(order.createdAt||NaN);
      if(!Number.isFinite(date.getTime())||orderDayFormat.format(date)!==day)return false;
    }
    return !needle||[order.orderId,window.BGOrderReference(order.orderId),order.name,order.phone,order.alternatePhone,order.address,order.deliveryAddress]
      .some(value=>String(value||"").toLowerCase().includes(needle));
  });
  return sort==="oldest"?matches.reverse():matches;
}
function renderOrderBoard(reset=false){
  if(reset)visibleOrderLimit=orderPageSize;
  const showAll=activeOrderTab==="ALL";
  $("#allStatusControl").hidden=!showAll;
  const rows=filterOrderBoard(currentOrders,activeOrderTab,$("#allOrderStatus").value,$("#orderDay").value,$("#orderSearch").value,$("#orderSort").value);
  const labels={ALL:"All Orders",NEW:"New Orders",ACCEPTED:"Accepted Orders",PREPARING:"Preparing",READY:"Ready for Pickup","OUT FOR DELIVERY":"Out for Delivery",DELIVERED:"Completed"};
  $("#boardTitle").textContent=labels[activeOrderTab]||"Orders";
  $("#lastUpdated").textContent=lastOrdersSnapshot?`${Math.min(rows.length,visibleOrderLimit)} of ${rows.length} shown`:"Loading orders…";
  $("#moreOrders").hidden=rows.length<=visibleOrderLimit;
  const grid=$("#ordersGrid");
  const expanded=new Set([...grid.querySelectorAll(".details-toggle[aria-expanded=true]")].map(button=>button.dataset.id));
  if(!rows.length){grid.innerHTML='<div class="empty-orders"><b>No matching orders</b><span>Try a different date, status or search.</span></div>';return;}
  grid.innerHTML=rows.slice(0,visibleOrderLimit).map(o=>{const closed=o.status==="DELIVERED"||o.status==="CANCELLED";const takeaway=o.orderType==="takeaway";const act=nextAction(o.status,takeaway);const dt=formatDate(o.createdAt);const map=orderMapUrl(o);const address=o.deliveryAddress||o.address||o.customerLocation?.fullAddress;return `<article class="order-card ${o.status==="NEW"?"new":""}" data-order-card="${esc(o.orderId)}"><div class="order-card-head"><div><div class="order-id">#${esc(window.BGOrderReference(o.orderId))}</div><div class="order-time">${esc(dt)}</div><small class="order-fulfilment">${takeaway?"Takeaway":"Delivery"}</small>${takeaway&&o.pickupAt?`<div class="order-time"><strong>Pickup · ${esc(window.BGPickup.pickupLabel(o.pickupAt,true))}</strong></div>`:""}</div><span class="status-badge ${statusKey(o.status)}">${esc(takeaway&&o.status==="DELIVERED"?"COLLECTED":o.status||"NEW")}</span></div><div class="order-customer"><b>${esc(o.name||"Customer")}</b><small>📞 ${esc(o.phone||"—")}</small>${/^\d{10}$/.test(o.alternatePhone || "")?`<small>Backup contact · <a href="tel:+91${o.alternatePhone}">+91 ${o.alternatePhone}</a></small>`:""}${address?`<small class="order-address-text">${esc(address)}</small>`:""}${map?`<a class="order-address-link order-map-button" href="${esc(map)}" target="_blank" rel="noopener noreferrer">Open in Maps ↗</a>`:""}</div><div class="order-items">${orderItemsHtml(o)}</div>${posReceiptSummary(o)}${correctionControls(o)}${o.orderInstructions?`<div class="order-instructions-note"><b>📝 Customer Instructions</b><p>${esc(o.orderInstructions)}</p></div>`:""}<div class="order-meta"><span>${takeaway?"Collect in store":orderDistanceKm(o)!==null?`${orderDistanceKm(o).toFixed(1)} km road distance`:"Road distance not recorded"}</span><span class="order-total">₹${Number(o.total||0).toLocaleString("en-IN")}</span></div>${o.couponCode?'<div class="order-meta"><span>Coupon '+esc(o.couponCode)+'</span><span>−₹'+Number(o.couponDiscount).toLocaleString("en-IN")+'</span></div>':""}${Number(o.minOrder)>0?`<div class="order-meta"><span>${o.status==="NEW"?"Submitted minimum · checked on acceptance":"Delivery minimum"}</span><span>₹${Number(o.minOrder).toLocaleString("en-IN")}</span></div>`:""}<div class="order-actions">${phoneReviewControls(o)}${o.status==="NEW"&&phoneReviewReason(o)?`<strong>Confirm by phone · ${esc(phoneReviewReason(o))}</strong><a class="order-main-btn" href="tel:+91${fraudPhone(o)}">Call customer</a>`:""}${act?`<button class="order-main-btn ${act[2]} advance-order" data-id="${esc(o.orderDocId||o.orderId)}" data-order-id="${esc(o.orderId)}" data-next="${esc(act[0])}">${act[1]}</button>`:""}${o.status==="NEW"?`<button class="order-cancel-btn cancel-master-order" data-id="${esc(o.orderDocId||o.orderId)}" data-order-id="${esc(o.orderId)}">✖ Cancel Order</button>`:""}<button type="button" class="order-more details-toggle master-disclosure" data-id="${esc(o.orderId)}" aria-controls="details-${esc(o.orderId)}" aria-expanded="${expanded.has(o.orderId)}"><span>Details</span><span class="master-disclosure-icon" aria-hidden="true"></span></button></div><div class="order-details ${expanded.has(o.orderId)?"open":""}" id="details-${esc(o.orderId)}"><p><b>Order details</b></p><button type="button" class="wa-mini kitchen-ticket" data-id="${esc(o.orderDocId||o.orderId)}">Print KOT</button>${fraudPhone(o)?`<button type="button" class="wa-mini fraud-flag-toggle" data-id="${esc(o.orderDocId||o.orderId)}">${fraudFlags.has(fraudPhone(o))?"Remove fake-order flag":"Mark confirmed fake"}</button>`:""}<select class="order-status-select order-status" data-id="${esc(o.orderDocId||o.orderId)}" data-order-id="${esc(o.orderId)}" ${closed?"disabled":""}>${STATUS_LIST.filter(s=>!takeaway||s!=="OUT FOR DELIVERY").map(s=>`<option value="${s}" ${o.status===s?"selected":""}>${takeaway&&s==="DELIVERED"?"COLLECTED":s}</option>`).join("")}</select><button class="wa-mini status-wa" data-id="${esc(o.orderDocId||o.orderId)}" data-phone="${esc(o.phone||"")}">💬 Send WhatsApp Status</button><button class="wa-mini order-share-wa" data-id="${esc(o.orderDocId||o.orderId)}">📲 Share Order on WhatsApp</button>${o.status==="DELIVERED"&&reviewSettings.googleEnabled?`<button class="wa-mini review-wa" data-id="${esc(o.orderDocId||o.orderId)}">⭐ Request Google Review on WhatsApp</button>`:""}</div></article>`}).join("");
  document.querySelectorAll("#ordersGrid .order-phone-review").forEach(button => button.onclick = () => startPhoneReview(button.dataset.order, button));
  grid.querySelectorAll("[data-correction-order]").forEach(button=>button.onclick=()=>resolveOrderCorrection(button));
  document.querySelectorAll(".fraud-flag-toggle").forEach(button => button.onclick = () => toggleFraudFlag(button.dataset.id));
  document.querySelectorAll(".kitchen-ticket").forEach(button => button.onclick = () => printKitchenTicket(button.dataset.id));
  document.querySelectorAll(".advance-order").forEach(b=>b.onclick=()=>updateStatus(b.dataset.id,b.dataset.next));
  document.querySelectorAll(".cancel-master-order").forEach(b=>b.onclick=()=>cancelMasterOrder(b.dataset.id,b.dataset.orderId));
  document.querySelectorAll(".details-toggle").forEach(b=>b.onclick=()=>b.setAttribute("aria-expanded", String(document.getElementById(`details-${b.dataset.id}`).classList.toggle("open"))));
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
  const ov=$("#newOrderOverlay");if(!ov)return;
  stopNewOrderAlert();
  unlockMasterAudio();
  document.title=`🚨 NEW ORDER #${window.BGOrderReference(o.orderId)}`;
  activeNewOrderId=o.orderId;
  $("#newOrderTitle").textContent=`Order #${window.BGOrderReference(o.orderId)}`;
  const distanceKm=orderDistanceKm(o);
  const routeMinutes=Number(o.routeDurationMin||o.estimatedDeliveryMinutes||0);
  const routeText=routeMinutes>0?Math.round(routeMinutes)+" min":"Not recorded";
  const mapUrl=orderMapUrl(o);
  const address=String(o.address||o.deliveryAddress||o.addressDetails?.formattedAddress||o.addressDetails?.address||o.addressDetails?.area||"Address not available");
  $("#newOrderSummary").innerHTML=`
    <div class="new-order-customer-line"><b>${esc(o.name||"Customer")}</b><span>₹${Number(o.total||0).toLocaleString("en-IN")}</span></div>
    ${o.orderType==="takeaway"?`<div class="new-order-address"><small>PICKUP TIME</small><b>${esc(window.BGPickup.pickupLabel(o.pickupAt,true)||"Not recorded")}</b></div>`:`<div class="new-order-route new-order-route-prominent">
      <div><small>ROAD DISTANCE</small><strong>${distanceKm!==null?distanceKm.toFixed(1)+" km":"Not recorded"}</strong></div>
      <div><small>ROUTE TIME</small><strong>${routeText}</strong></div>
      ${mapUrl?`<a href="${esc(mapUrl)}" target="_blank" rel="noopener noreferrer">📍 Open customer location in Google Maps</a>`: ""}
    </div>
    <div class="new-order-address"><small>DELIVERY ADDRESS</small><b>${esc(address)}</b></div>`}
    <div class="new-order-items"><b>🛒 Customer ordered · ${(Array.isArray(o.items)?o.items.length:0)} line(s)</b>${orderItemsHtml(o)}</div>
    ${o.orderInstructions?`<div class="new-order-instructions"><b>📝 Customer instructions</b><p>${esc(o.orderInstructions)}</p></div>`: ""}
    <div class="new-order-deadline">${o.pickupAcceptBy?`Accept by ${esc(window.BGPickup.pickupLabel(o.pickupAcceptBy,true))}`:"New order must be accepted within 2:00"}</div>
    ${phoneReviewControls(o)}
    ${phoneReviewReason(o) && fraudPhone(o) ? `<a class="wa-mini" href="tel:+91${fraudPhone(o)}">Call customer</a>` : ""}`;
  ov.style.display="flex"; startLoudSiren();
  const reviewButton = ov.querySelector(".order-phone-review");
  if (reviewButton) reviewButton.onclick = () => startPhoneReview(reviewButton.dataset.order, reviewButton);
  const created = o.createdAt?.toMillis?.() ?? Date.now();
  let remaining = Math.max(0, Math.ceil((created + 120000 - Date.now()) / 1000)); const tick=()=>{const t=$("#newOrderTimer");if(t)t.textContent=`${o.pickupAcceptBy?"Alert closes in ":""}${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;}; tick();
  newOrderTimer=setInterval(()=>{remaining--;tick();if(remaining<=0)stopNewOrderAlert();},1000);
  $("#acceptNewOrder").onclick=()=>{stopNewOrderAlert();updateStatus(o.orderDocId||o.orderId,"ACCEPTED")};
  $("#dismissNewOrder").onclick=async()=>{
    if(!confirm("Cancel this new order? The customer will be notified."))return;
    stopNewOrderAlert();
    try{await updateStatus(o.orderDocId||o.orderId,"CANCELLED");}
    finally{ov.style.display="none";stopSiren();}
  };
}
window.showNewOrder=showNewOrder;
window.addEventListener('focus',()=>{if(activeNewOrderId){const o=currentOrders.find(x=>x.orderId===activeNewOrderId);if(o&&o.status==='NEW')startLoudSiren();}});
window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&activeNewOrderId){const o=currentOrders.find(x=>x.orderId===activeNewOrderId);if(o&&o.status==='NEW')startLoudSiren();}});

function formatDate(v){try{return v?.toDate?v.toDate().toLocaleString():new Date(v).toLocaleString()}catch(e){return ""}}
function chooseEstimatedDeliveryMinutes(order={}){
  return new Promise(resolve=>{
    const options=[15,30,45,60,75,90,105,120,150,180,240];
    const km=Number(order.distanceKm||0);
    const actualRouteMinutes=Number(order.routeDurationMin||0);
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
      <h3 id="etaSelectTitle">${isDelivery?"Choose estimated delivery time":"Choose estimated collection time"}</h3>
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
    if(!snap.exists){alert("Order not found.");return;}
    const order=snap.data()||{},current=String(order.status||"NEW").toUpperCase();
    if(current==="DELIVERED"||current==="CANCELLED"){
      alert("This order is closed. Delivered/CANCELLED status cannot be changed.");
      renderOrders(await db.collection("orders").get());return;
    }
    if(order.orderType==="takeaway"&&status==="OUT FOR DELIVERY"){alert("Takeaway orders are collected in store.");return;}
    const trackingId=String(order.orderId||snap.id);
    if(status==="ACCEPTED"){
      const reason = phoneReviewReason(order);
      if (reason && !confirm(reason + "\n\nPress OK only after confirming the order by phone.")) return;
      if(current!=="NEW"){alert("This order is no longer waiting for acceptance.");return;}
      const selected=await chooseEstimatedDeliveryMinutes(order);
      if(!selected)return;
      const accept=firebase.app().functions("us-central1").httpsCallable("acceptVerifiedOrderV2");
      await accept({id:snap.id,expectedMinutes:selected});
      return;
    }
    const now=Date.now();
    const update={status,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),statusHistory:firebase.firestore.FieldValue.arrayUnion({status,at:now,by:auth.currentUser?.uid||null})};
    const publicUpdate={orderId:trackingId,customerId:order.customerId||null,status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    if(status==="OUT FOR DELIVERY"){
      update.outForDeliveryAt=now;update.estimatedDeliveryMin=20;update.estimatedDeliveryMax=20;update.expectedDeliveryMinutes=20;
      publicUpdate.outForDeliveryAt=now;publicUpdate.estimatedDeliveryMin=20;publicUpdate.estimatedDeliveryMax=20;publicUpdate.expectedDeliveryMinutes=20;
    }
    const batch=db.batch();
    batch.update(ref,update);
    batch.set(db.collection("publicStatuses").doc(trackingId),publicUpdate,{merge:true});
    await batch.commit();
    console.info("Order and live tracking status committed together:",trackingId,status);
  }catch(e){
    console.error("Atomic order/tracking update failed:",e);
    alert("Status update failed: "+(e?.code==="functions/not-found"?"Order verification service is unavailable. Keep the order pending and retry.":e?.message||e?.code||"Check Firebase permissions and try again."));
  }
}
async function cancelMasterOrder(id,orderId){
  if(!confirm("Cancel order "+window.BGOrderReference(orderId||id)+"? The customer will see the order as cancelled."))return;
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

🆔 Order ID: ${window.BGOrderReference(o.orderId||id)}
👤 Customer: ${o.name||"—"}
📞 Phone: ${o.phone||"—"}
📍 Address: ${o.address||"—"}
🗺️ Customer Location: ${orderMapUrl(o)||"Please contact customer for location"}
📌 Status: ${o.status||"NEW"}
🚚 Order Type: ${o.orderType||"Order"}${Number(o.distanceKm||0)>0?`\n📏 Distance: ${Number(o.distanceKm).toFixed(1)} km`:""}

🛒 ITEMS
${lines||"• No item details"}

${o.couponCode?"Coupon "+o.couponCode+" · −₹"+Number(o.couponDiscount).toLocaleString("en-IN")+"\n":""}💰 TOTAL: ₹${Number(o.total||0).toLocaleString("en-IN")}

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
    return '<article class="bg-review-entry"><div class="bg-review-entry-head"><b>'+esc("Order #"+window.BGOrderReference(r.orderId||item.id))+'</b><span>'+stars+' <small>'+rating+'/5</small></span></div><p>'+esc(r.comment||"No written comment provided.")+'</p><small>'+esc(date)+'</small></article>';
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
    .split("{orderId}").join(window.BGOrderReference(order.orderId||id))
    .split("{reviewUrl}").join(String(reviewSettings.googleReviewUrl||GOOGLE_REVIEW_URL));
  window.open("https://wa.me/"+phone+"?text="+encodeURIComponent(message),"_blank","noopener");
}

function startRealtime(){
  unsubscribeStock?.(); unsubscribeOrders?.(); unsubscribeMenu?.(); unsubscribeDelivery?.(); unsubscribeReviews?.(); unsubscribeCustomerReviews?.();
  unsubscribeStock=db.collection("stock").onSnapshot(s=>{stock={};s.forEach(d=>stock[d.id]=d.data());renderStock();window.BakeGrillMasterUI?.refresh?.();window.renderMasterDashboard?.()},e=>{console.error("Stock listener:",e);renderStock();const t=$("#stockTable");if(t && !t.innerHTML.trim()) t.innerHTML=`<tr><td colspan="5">Could not load Firebase inventory. Check Firebase Rules/login.</td></tr>`;});
  unsubscribeMenu=db.collection("menu").onSnapshot(s=>{liveMenu={};s.forEach(d=>liveMenu[d.id]=d.data());renderMenuEditor();renderStock();window.BakeGrillMasterUI?.refresh?.();window.renderMasterDashboard?.()},e=>console.error(e));
  unsubscribeDelivery=db.collection("settings").doc("delivery").onSnapshot(d=>{
    const settings=d.data()||{};
    applyMasterDeliverySchedule(settings);
    renderShopHoursSettings(settings);
    renderShopToggle(settings);
    kitchenLimit=Number(settings.kitchenLimit)||0;
    $("#kitchenLimit").value=kitchenLimit;
    $("#maxRoadKm").value=[1,3,5,8].includes(settings.maxRoadKm)?settings.maxRoadKm:8;
    renderKitchenLoad();
  },e=>console.error(e));
  unsubscribeReviews=db.collection("settings").doc("reviews").onSnapshot(d=>{const v=d.exists?d.data():{};const configuredUrl=String(v.googleReviewUrl||"").trim();reviewSettings={googleEnabled:v.googleEnabled!==false,feedbackEnabled:v.feedbackEnabled!==false,googleReviewUrl:configuredUrl&&configuredUrl!==LEGACY_GOOGLE_REVIEW_URL?configuredUrl:GOOGLE_REVIEW_URL,whatsappMessage:String(v.whatsappMessage||DEFAULT_REVIEW_WHATSAPP_MESSAGE)};db.collection("orders").get().then(renderOrders).catch(()=>{});},e=>console.error("Review settings listener:",e));
  unsubscribeFraudFlags?.();
  unsubscribeFraudFlags = db.collection("orderFraudFlags").onSnapshot(snapshot => {
    fraudFlags = new Map();
    snapshot.forEach(doc => fraudFlags.set(doc.id, doc.data()));
    if (lastOrdersSnapshot) renderOrders(lastOrdersSnapshot);
  }, error => console.error("Fraud flags listener:", error));
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
      unsubscribeOrders?.();unsubscribeStock?.();unsubscribeMenu?.();unsubscribeDelivery?.();unsubscribeReviews?.();unsubscribeCustomerReviews?.();unsubscribeFraudFlags?.();fraudFlags.clear();lastOrdersSnapshot=null;
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

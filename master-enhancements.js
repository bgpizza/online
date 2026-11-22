(function(){
 const $=s=>document.querySelector(s),money=n=>"₹"+Math.round(Number(n||0)).toLocaleString("en-IN");
 const items=()=>typeof allMenuAdminItems==="function"?allMenuAdminItems():(window.MENU_ITEMS||[]);
 const escape=s=>typeof esc==="function"?esc(s):String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
 const originalOpen=window.openItemEditor;
 function fillCategories(selected){
  const list=[...new Set(items().map(x=>String(x.category||"").trim()).filter(Boolean))];
  ["Veg Pizza","Chicken Pizza","Burgers","Veg Sandwich","Chicken Sandwich","Quick Bites","Family Combos","Bondhu Combos","Solo Combos","Add-ons"].forEach(x=>{if(!list.includes(x))list.push(x);});
  const select=$("#editCategory");
  if(select)select.innerHTML=list.map(x=>'<option value="'+escape(x)+'" '+(x===selected?"selected":"")+'>'+escape(x)+'</option>').join("");
 }
 const sizes=["Ekla","Bondhu","Family"];
 function selectedCategory(){return $("#editNewCategory").value.trim()||$("#editCategory").value;}
 function showTypeFields(){
  const category=selectedCategory();
  const addon=category==="Add-ons";
  const pizza=!addon&&$("#editItemType").value==="pizza";
  $("#editItemType").disabled=addon;
  $("#editAddonPrices").style.display=addon?"grid":"none";
  $("#editExtraCheeseWrap").style.display=["Burgers","Veg Sandwich","Chicken Sandwich"].includes(category)&&!pizza?"block":"none";
  if($("#editPizzaPrices"))$("#editPizzaPrices").style.display=pizza?"grid":"none";
  if($("#editSinglePriceWrap"))$("#editSinglePriceWrap").style.display=pizza?"none":"block";
 }
 const editorModal=$("#itemEditModal");
 const editorTabs=Array.from(editorModal.querySelectorAll("[data-editor-tab]"));
 let editorSection="details";
 function selectEditorSection(section, field){
  editorSection=section;
  for(const tab of editorTabs)tab.setAttribute("aria-pressed",String(tab.dataset.editorTab===section));
  for(const panel of editorModal.querySelectorAll("[data-editor-panel]"))panel.hidden=panel.dataset.editorPanel!==section;
  editorModal.querySelector(".menu-editor-body").scrollTop=0;
  if(field)$(field).focus();
 }
 for(const tab of editorTabs)tab.addEventListener("click",()=>selectEditorSection(tab.dataset.editorTab));
 function editorError(section, message, field){
  $("#itemEditMsg").textContent=message;
  selectEditorSection(section,field);
 }

 function setEditorFields(item={}){
  editorTabs.find(tab=>tab.dataset.editorTab==="preview").hidden=true;
  selectEditorSection("details");
  const save=$("#saveItemEdit");
  save.disabled=false;
  save.textContent=$("#editId").value?"Save changes":"Publish item";
  $("#restoreItemEdit").hidden=!$("#editId").value;
  $("#itemEditModal").querySelector(".menu-editor-body").scrollTop=0;
  $("#editSortOrder").value=item.sortOrder??"";
  $("#editExtraCheese").value=item.extraCheesePrice??"";
  for(const size of sizes){
   const label=size+" Bite";
   $("#editAddon"+size).value=item.prices?.[label]??item.sizePrices?.[label]??window.MENU_ADDON_DEFAULT_PRICES?.[item.id]?.[label]??"";
  }
  showTypeFields();
 }
 function setEditorStock(id){
  const state=(typeof stock!=="undefined"&&stock[id])||{active:true,qty:""};
  if($("#editItemActive"))$("#editItemActive").checked=state.active!==false;
  if($("#editItemQty"))$("#editItemQty").value=state.qty??"";
 }
 function resetEditorImage(image){
  const preview=$("#editImagePreview");
  if(preview){preview.src=image||"assets/logo.png";preview.dataset.image=image||"";}
  $("#editImageUrl").value=image||"";
  if($("#editImageFile"))$("#editImageFile").value="";
  if($("#removeItemImage"))$("#removeItemImage").disabled=!image;
  if($("#imageEditMsg"))$("#imageEditMsg").textContent=image?"Current product image loaded.":"No product image set. Image is optional.";
 }
 window.openNewItemEditor=function(){
  $("#itemEditTitle").textContent="Add menu item";
  $("#editId").value="";
  if($("#editIdDisplay"))$("#editIdDisplay").value="Assigned after saving";
  $("#editName").value="";
  $("#editDescription").value="";
  $("#editBestChoice").checked=false;
  $("#editHero").checked=false;
  $("#editBadge").value="";
  $("#editNewCategory").value="";
  fillCategories("Quick Bites");
  $("#editItemType").value="single";
  setEditorFields();
  $("#editPrice").value="";
  $("#editEkla").value="";
  $("#editBondhu").value="";
  $("#editFamily").value="";
  setEditorStock("");
  resetEditorImage("");
  $("#itemEditMsg").textContent="Fill in the details below. The item will appear on the customer site after saving.";
  $("#itemEditModal").style.display="flex";
  $("#editName").focus();
 };
 if(typeof originalOpen==="function"){
  window.openItemEditor=function(id){
   originalOpen(id);
   const item=items().find(x=>String(x.id)===String(id));
   if(!item)return;
   const type=item.type?String(item.type):(item.prices?"pizza":"single");
   $("#itemEditTitle").textContent="Edit menu item";
   if($("#editIdDisplay"))$("#editIdDisplay").value=String(item.id);
   $("#editNewCategory").value="";
   fillCategories(item.category||"");
   $("#editItemType").value=type;
   setEditorFields(item);
   if(type==="pizza"){
    $("#editEkla").value=item.prices?.["Ekla Bite"]??"";
    $("#editBondhu").value=item.prices?.["Bondhu Bite"]??"";
    $("#editFamily").value=item.prices?.["Family Bite"]??"";
   }else{
    $("#editPrice").value=item.price??"";
   }
   setEditorStock(id);
   resetEditorImage(item.image||item.imageUrl||item.img||"");
  };
 }
 for(const id of ["editItemType","editCategory","editNewCategory"]){
  $("#"+id).addEventListener("input",showTypeFields);
 }
 $("#previewItemEdit").onclick=()=>window.saveItemEditor(true);
 $("#restoreItemEdit").onclick=async ()=>{
  const id=$("#editId").value;
  const output=$("#itemEditMsg");
  if(!id){output.textContent="Save an item before restoring a version.";return;}
  if(!confirm("Restore the previous published version of this item?"))return;
  const button=$("#restoreItemEdit");
  button.disabled=true;
  try{await restoreMenuVersion(id);closeItemEditor();}
  catch(error){output.textContent=error.message;}
  finally{button.disabled=false;}
 };
 editorModal.addEventListener("input",()=>{
  editorTabs.find(tab=>tab.dataset.editorTab==="preview").hidden=true;
  if(editorSection==="preview")selectEditorSection("details");
  $("#itemEditMsg").textContent="";
 });
 editorModal.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&!$("#saveItemEdit").disabled){
   event.preventDefault();
   closeItemEditor();
  }
 });
 window.saveItemEditor=async function(previewOnly=false){
  previewOnly=previewOnly===true;
  if(!window.firebaseReady||!window.db){$("#itemEditMsg").textContent="Firebase is not connected. Please refresh and sign in again.";return;}
  const oldId=String($("#editId").value||"").trim();
  const name=String($("#editName").value||"").trim();
  const category=selectedCategory();
  const type=category!=="Add-ons"&&$("#editItemType").value==="pizza"?"pizza":"single";
  const description=String($("#editDescription").value||"").trim().slice(0,700);
  if(name.length<2){editorError("details","Enter an item name with at least 2 characters.", "#editName");return;}
  if(!category){editorError("details","Choose or enter a category.", "#editCategory");return;}
  const data={
   name,description,category,type,
   bestChoice:!!$("#editBestChoice").checked,
   hero:!!$("#editHero").checked,
   badge:String($("#editBadge").value||"").trim().slice(0,24)||($("#editBestChoice").checked?"BEST CHOICE":""),
   updatedAt:firebase.firestore.FieldValue.serverTimestamp()
  };
  if(type==="pizza"){
   data.prices={
    "Ekla Bite":Number($("#editEkla").value),
    "Bondhu Bite":Number($("#editBondhu").value),
    "Family Bite":Number($("#editFamily").value)
   };
   if(Object.values(data.prices).some(v=>!Number.isFinite(v)||v<=0||v>100000)){
    editorError("pricing","Enter prices from ₹0.01 to ₹100,000 for all three pizza sizes.");return;
   }
   // Explicit overrides prevent any older static single price from leaking through.
   data.price=null;
  }else{
   const raw=String($("#editPrice").value||"").trim();
   if(/^ask$/i.test(raw))data.price="Ask";
   else{
    const value=Number(raw);
    if(!raw||!Number.isFinite(value)||value<=0||value>100000){
     editorError("pricing","Enter a price greater than ₹0 and up to ₹100,000, or type Ask.", "#editPrice");return;
    }
    data.price=value;
   }
   data.prices=null;
  }
  const sort=$("#editSortOrder").value.trim();
  const cheese=$("#editExtraCheese").value.trim();
  for(const [value,section,field] of [[sort,"stock","#editSortOrder"],[cheese,"pricing","#editExtraCheese"]]){
   if(value!==""&&(!Number.isSafeInteger(Number(value))||Number(value)<0||Number(value)>100000)){
    editorError(section,"Enter a whole number from 0 to 100,000.",field);
    return;
   }
  }
  data.sortOrder=sort===""?null:Number(sort);
  data.extraCheesePrice=cheese===""?null:Number(cheese);
  if(category==="Add-ons"){
   const prices={};
   for(const size of sizes){
    const raw=$("#editAddon"+size).value.trim();
    if(!raw)continue;
    const price=/^ask$/i.test(raw)?"Ask":Number(raw);
    if(price!=="Ask"&&(!Number.isFinite(price)||price<=0||price>100000)){
     editorError("pricing","Enter a valid add-on price or type Ask.");return;
    }
    prices[size+" Bite"]=price;
   }
   data.sizePrices=prices;
  }else data.sizePrices=null;
  const image=$("#editImageUrl").value.trim();
  if(image!==($("#editImagePreview").dataset.image||"")){
   if(image&&!/^https:\/\/[^\s]+$/i.test(image)){
    editorError("photo","Enter an HTTPS image URL, or clear the field to remove the image.", "#editImageUrl");return;
   }
   data.image=image;
   data.imageEdited=true;
  }
  const qtyRaw=String($("#editItemQty")?.value??"").trim();
  const stockData={
   active:$("#editItemActive")?!!$("#editItemActive").checked:true,
   qty:qtyRaw===""?"":Math.max(0,Number(qtyRaw))
  };
  if(stockData.qty!==""&&!Number.isFinite(stockData.qty)){ editorError("stock","Enter a valid stock quantity.", "#editItemQty");return; }
  if(previewOnly){
   const preview=$("#editor-preview");
   const itemImage=image;
   const prices=data.prices||Object.keys(data.sizePrices||{}).length&&data.sizePrices||{Price:data.price};
   preview.innerHTML=`<article class="menu-item-card"><div class="menu-item-main"><small>${esc(category)}</small><b>${esc(name)}</b><p>${esc(description)}</p>${Object.entries(prices).map(([size,price])=>`<strong>${esc(size)} · ${price==="Ask"?"On request":"₹"+esc(price)}</strong>`).join("")}<small>${stockData.active?"Available":"Out of stock"}</small></div>${itemImage?`<div class="menu-item-image"><img src="${esc(itemImage)}" alt=""></div>`:""}</article>`;
   $("#itemEditMsg").textContent="";
   const previewTab=editorTabs.find(tab=>tab.dataset.editorTab==="preview");
   previewTab.hidden=false;
   selectEditorSection("preview");
   previewTab.focus();
   return;
  }
  const save=$("#saveItemEdit");
  if(save?.disabled)return;
  if(save){save.disabled=true;save.textContent="Saving…";}
  try{
   const id=oldId||("N"+Date.now().toString(36).toUpperCase());
   data.id=id;
   await saveMenuVersion(id,data,stockData);
   if(typeof liveMenu!=="undefined")liveMenu[id]={...(liveMenu[id]||{}),...data};
   if(typeof stock!=="undefined")stock[id]={...(stock[id]||{}),...stockData};
   $("#editId").value=id;
   if($("#editIdDisplay"))$("#editIdDisplay").value=id;
   if(Object.hasOwn(data,"image")){
    if(!oldId&&$("#editImageFile").files?.[0])await window.uploadItemImage();
    else resetEditorImage(data.image);
   }else if(!oldId&&$("#editImageFile").files?.[0]){
    await window.uploadItemImage();
   }
   window.renderMenuEditor?.();
   window.renderStock?.();
   window.BakeGrillMasterUI?.refresh?.();
   window.renderMasterDashboard?.();
   const imageFailed=$("#imageEditMsg").textContent.startsWith("❌");
   $("#restoreItemEdit").hidden=false;
   $("#itemEditMsg").textContent=imageFailed?"Item published. Photo upload failed. You can retry from Product photo.":"Saved. The customer menu will update automatically.";
   if(save){save.textContent=$("#editId").value?"Save changes":"Publish item";save.disabled=false;}
  }catch(error){
   console.error("Menu item save failed:",error);
   $("#itemEditMsg").textContent="❌ Save failed: "+(error?.message||String(error));
   if(save){save.disabled=false;save.textContent=$("#editId").value?"Save changes":"Publish item";}
  }
 };
 function dateOf(value){try{const date=value&&typeof value.toDate==="function"?value.toDate():(value instanceof Date?value:new Date(value));return Number.isFinite(date.getTime())?date:null;}catch(e){return null;}}
 function dateLabel(value){const date=dateOf(value);return date?date.toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"Not recorded";}
 window.renderMasterDashboard=function(){
  const root=$("#masterDashboard");if(!root)return;
  const orders=Array.isArray(currentOrders)?currentOrders:[],now=new Date();
  const isToday=date=>!!date&&date.getFullYear()===now.getFullYear()&&date.getMonth()===now.getMonth()&&date.getDate()===now.getDate();
  const today=orders.filter(o=>isToday(dateOf(o.createdAt)));
  const deliveredToday=orders.filter(o=>String(o.status||"").toUpperCase()==="DELIVERED"&&isToday(dateOf(o.updatedAt||o.createdAt)));
  const cancellationCounts = new Map();
  orders.filter(order => order.status === "CANCELLED" && isToday(dateOf(order.cancelledAt || order.updatedAt || order.createdAt))).forEach(order => {
    const reason = String(order.cancelReason || "");
    const key = order.cancelledBy === "customer" ? "Cancelled by customer"
      : /too many orders/i.test(reason) ? "Rapid repeat submissions"
      : /confirm the order by phone/i.test(reason) ? "Phone verification expired"
      : /did not accept/i.test(reason) ? "Acceptance timed out"
      : (order.statusHistory || []).some(entry => entry.status === "CANCELLED" && entry.by) ? "Cancelled by shop"
      : "Reason not recorded";
    cancellationCounts.set(key, (cancellationCounts.get(key) || 0) + 1);
  });
  const active=orders.filter(o=>!["DELIVERED","CANCELLED"].includes(String(o.status||"").toUpperCase()));
  const sales=deliveredToday.reduce((sum,o)=>sum+Number(o.total||0),0),average=deliveredToday.length?sales/deliveredToday.length:0;
  const catalogue=items(),out=catalogue.filter(x=>stock[x.id]?.active===false).length;
  const days=Array.from({length:7},(_,index)=>{const day=new Date(now);day.setHours(0,0,0,0);day.setDate(day.getDate()-(6-index));const done=orders.filter(o=>String(o.status||"").toUpperCase()==="DELIVERED"&&dateOf(o.updatedAt||o.createdAt)?.toDateString()===day.toDateString());return {date:day,sales:done.reduce((sum,o)=>sum+Number(o.total||0),0)};});
  const peak=Math.max(1,...days.map(x=>x.sales)),popular={};
  today.forEach(o=>(Array.isArray(o.items)?o.items:[]).forEach(item=>{const n=String(item.name||item.itemName||"Item");popular[n]=(popular[n]||0)+Math.max(1,Number(item.qty||item.quantity||1));}));
  const top=Object.entries(popular).sort((a,b)=>b[1]-a[1]).slice(0,4);
  root.innerHTML='<div class="master-dashboard-head"><div><span class="master-dash-kicker">LIVE BUSINESS OVERVIEW</span><h2>Today at a glance</h2><p>'+now.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})+' · Updates with live orders</p></div><div class="master-dash-live"><i></i> Live data</div></div>'+
   '<div class="master-kpi-grid"><article class="master-kpi"><span>Orders today</span><strong>'+today.length+'</strong><small>'+deliveredToday.length+' delivered today</small></article><article class="master-kpi sales"><span>Delivered sales today</span><strong>'+money(sales)+'</strong><small>Only orders marked delivered</small></article><article class="master-kpi active"><span>Active orders</span><strong>'+active.length+'</strong><small>Not delivered or cancelled</small></article><article class="master-kpi"><span>Average delivered order</span><strong>'+money(average)+'</strong><small>'+deliveredToday.length+' completed today</small></article><article class="master-kpi stock"><span>Out of stock</span><strong>'+out+'</strong><small>Across '+catalogue.length+' menu items</small></article></div>'+
   '<div class="master-dash-lower"><section class="master-chart-card"><div class="master-chart-title"><div><b>Delivered sales · Last 7 days</b><small>Grouped by delivery completion date</small></div><strong>'+money(days.reduce((a,b)=>a+b.sales,0))+'</strong></div><div class="master-chart-bars">'+days.map(day=>'<div class="master-chart-day"><div class="master-chart-bar-wrap"><i style="height:'+Math.max(4,Math.round(day.sales/peak*100))+'%"></i></div><span>'+day.date.toLocaleDateString("en-IN",{weekday:"short"})+'</span><b>'+(day.sales?money(day.sales):"—")+'</b></div>').join("")+'</div></section><section class="master-top-items"><div><b>Popular items today</b><small>Quantity across today’s orders</small></div>'+(top.length?top.map((row,i)=>'<div class="master-top-item"><i>'+(i+1)+'</i><span>'+escape(row[0])+'</span><b>'+row[1]+'×</b></div>').join(""):'<p>No items ordered today yet.</p>')+'</section></div>';
  const cancellations = document.createElement("section");
  cancellations.className = "master-top-items";
  const title = document.createElement("b");
  title.textContent = "Cancellations today";
  cancellations.append(title);
  const rows = [...cancellationCounts.entries()];
  if (!rows.length) rows.push(["No cancellations today", 0]);
  rows.forEach(([label, count]) => {
    const row = document.createElement("div");
    row.className = "master-top-item";
    const name = document.createElement("span");
    name.textContent = label;
    const value = document.createElement("b");
    value.textContent = String(count);
    row.append(name, value);
    cancellations.append(row);
  });
  root.append(cancellations);
 };
 window.renderOrderDetails=function(){
  const orders=Array.isArray(currentOrders)?currentOrders:[];
  orders.forEach(order=>{
   const id=String(order.orderId||order.orderDocId||""),box=document.getElementById("details-"+id);
   if(!box||box.querySelector(".order-detail-expanded"))return;
   const d=order.addressDetails&&typeof order.addressDetails==="object"?order.addressDetails:{};
   const parts=[d.area||d.village||d.locality||d.suburb,d.street||d.road,d.landmark,d.postOffice,d.pincode||d.pinCode,d.city,d.district,d.state,order.deliveryAddress||order.address].filter(Boolean).map(String);
   const address=parts.filter((v,i,a)=>a.indexOf(v)===i).join(", ")||"Not recorded",eta=order.expectedDeliveryMinutes||order.estimatedDeliveryMin||order.estimatedDeliveryMax;
   const rows=[["Customer",order.name||"—"],["Phone",order.phone||"—"],["Customer ID",order.customerId||"—"],["Delivery address",address],["Road distance",Number(order.distanceKm||0)>0?Number(order.distanceKm).toFixed(1)+" km":"Not recorded"],["Route estimate",order.routeDurationMin?Math.round(Number(order.routeDurationMin))+" min":"Not recorded"],["Delivery rule",order.rule||"—"],["Minimum order",order.minOrder?money(order.minOrder):"—"],["Expected delivery",eta?Number(eta)+" min":"Not set"],["Payment",order.paymentMethod||order.paymentMode||"Not recorded"],["Placed",dateLabel(order.createdAt)],["Last updated",dateLabel(order.updatedAt)]];
   const grid='<div class="order-detail-expanded"><div class="order-detail-grid">'+rows.map(([k,v])=>'<div class="order-detail-cell"><small>'+escape(k)+'</small><b>'+escape(v)+'</b></div>').join("")+'</div>';
   const lineItems=(Array.isArray(order.items)?order.items:[]).map(item=>{const extras=Array.isArray(item.extras)?item.extras.map(x=>typeof x==="string"?x:x.name).filter(Boolean).join(", "):"";return '<div class="order-detail-line"><span><b>'+escape(item.name||item.itemName||"Item")+'</b><small>'+escape([item.size,extras].filter(Boolean).join(" · "))+'</small></span><strong>'+Number(item.qty||item.quantity||1)+' × '+money(item.price||item.total||0)+'</strong></div>';}).join("");
   const itemHtml=lineItems?'<div class="order-detail-items"><b>Items in this order</b>'+lineItems+'</div>':"";
   const note=order.orderInstructions?'<div class="order-detail-note"><b>Customer instructions</b><p>'+escape(order.orderInstructions)+'</p></div>':"";
   let map="";if(typeof orderMapUrl==="function"){const url=orderMapUrl(order);if(url)map='<a class="order-detail-map" href="'+escape(url)+'" target="_blank" rel="noopener noreferrer">📍 Open delivery location in Google Maps</a>';}
   let history=Array.isArray(order.statusHistory)?order.statusHistory.slice():[];
   if(!history.length){if(order.createdAt)history.push({status:"NEW",at:dateOf(order.createdAt)?.getTime()||0});if(order.acceptedAt)history.push({status:"ACCEPTED",at:Number(order.acceptedAt)||dateOf(order.acceptedAt)?.getTime()||0});if(order.outForDeliveryAt)history.push({status:"OUT FOR DELIVERY",at:Number(order.outForDeliveryAt)||dateOf(order.outForDeliveryAt)?.getTime()||0});if(order.status&&!history.some(x=>x.status===order.status))history.push({status:order.status,at:dateOf(order.updatedAt)?.getTime()||0});}
   const timeline=history.length?'<div class="order-history"><b>Status history</b><ol>'+history.sort((a,b)=>Number(a.at||0)-Number(b.at||0)).map(x=>'<li><span>'+escape(x.status||"Status")+'</span><small>'+escape(x.at?dateLabel(x.at):"Time not recorded")+'</small></li>').join("")+'</ol></div>':"";
   box.insertAdjacentHTML("afterbegin",grid+itemHtml+note+map+timeline+"</div>");
  });
 };
})();
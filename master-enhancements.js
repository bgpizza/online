(function(){
 const $=s=>document.querySelector(s),money=n=>"₹"+Math.round(Number(n||0)).toLocaleString("en-IN");
 const items=()=>typeof allMenuAdminItems==="function"?allMenuAdminItems():(window.MENU_ITEMS||[]);
 const escape=s=>typeof esc==="function"?esc(s):String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
 let creatingNewItem=false;
 const originalSave=window.saveItemEditor,originalOpen=window.openItemEditor;
 function fillCategories(selected){
  const list=[...new Set(items().map(x=>x.category).filter(Boolean))];
  ["Veg Pizza","Chicken Pizza","Burgers","Veg Sandwich","Chicken Sandwich","Quick Bites","Family Combos","Bondhu Combos","Solo Combos","Add-ons"].forEach(x=>{if(!list.includes(x))list.push(x);});
  $("#editCategory").innerHTML=list.map(x=>'<option value="'+escape(x)+'" '+(x===selected?"selected":"")+'>'+escape(x)+'</option>').join("");
 }
 function showTypeFields(type){const pizza=type==="pizza";if($("#editPizzaPrices"))$("#editPizzaPrices").style.display=pizza?"grid":"none";if($("#editSinglePriceWrap"))$("#editSinglePriceWrap").style.display=pizza?"none":"block";}
 window.openNewItemEditor=function(){
  creatingNewItem=true;$("#itemEditTitle").textContent="＋ Add New Menu Item";
  $("#editId").value="";$("#editName").value="";$("#editDescription").value="";
  $("#editBestChoice").checked=false;$("#editHero").checked=false;$("#editBadge").value="";
  fillCategories("Quick Bites");$("#editItemType").value="single";showTypeFields("single");
  $("#editPrice").value="";$("#editEkla").value="";$("#editBondhu").value="";$("#editFamily").value="";
  const preview=$("#editImagePreview");if(preview){preview.src="assets/logo.png";preview.dataset.image="";}
  if($("#editImageFile"))$("#editImageFile").value="";
  if($("#removeItemImage"))$("#removeItemImage").disabled=true;
  $("#imageEditMsg").textContent="Product image is optional. Choose one now or upload it after saving.";
  $("#itemEditMsg").textContent="Enter the item details and price, then save.";
  $("#itemEditModal").style.display="flex";$("#editName").focus();
 };
 if(typeof originalOpen==="function"){
  window.openItemEditor=function(id){
   creatingNewItem=false;originalOpen(id);
   const item=items().find(x=>String(x.id)===String(id)),type=item&&(item.type==="pizza"||item.prices)?"pizza":"single";
   if($("#editItemType"))$("#editItemType").value=type;showTypeFields(type);
   if($("#removeItemImage"))$("#removeItemImage").disabled=!($("#editImagePreview")?.dataset?.image);
  };
 }
 $("#editItemType")?.addEventListener("change",()=>showTypeFields($("#editItemType").value));
 window.saveItemEditor=async function(){
  if(!creatingNewItem){if(typeof originalSave==="function")return originalSave();return;}
  const name=$("#editName").value.trim(),category=$("#editCategory").value,type=$("#editItemType").value||"single";
  if(!name){$("#itemEditMsg").textContent="Please enter an item name.";$("#editName").focus();return;}
  if(!category){$("#itemEditMsg").textContent="Please select a category.";return;}
  const data={name,description:$("#editDescription").value.trim(),category,type,bestChoice:$("#editBestChoice").checked,hero:$("#editHero").checked,badge:$("#editBadge").value.trim()||($("#editBestChoice").checked?"BEST CHOICE":""),image:"",updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
  if(type==="pizza"){
   data.prices={"Ekla Bite":Number($("#editEkla").value||0),"Bondhu Bite":Number($("#editBondhu").value||0),"Family Bite":Number($("#editFamily").value||0)};
   if(Object.values(data.prices).some(v=>!Number.isFinite(v)||v<=0)){ $("#itemEditMsg").textContent="Enter all three pizza prices greater than zero.";return;}
  }else{
   const price=$("#editPrice").value.trim();
   if(!price||!Number.isFinite(Number(price))||Number(price)<=0){$("#itemEditMsg").textContent="Enter a valid price greater than zero.";return;}
   data.price=Number(price);
  }
  const save=$("#saveItemEdit");if(save){save.disabled=true;save.textContent="Saving…";}
  try{
   const id="N"+Date.now().toString(36).toUpperCase();data.id=id;
   await db.collection("menu").doc(id).set(data);
   await db.collection("stock").doc(id).set({active:true,qty:""});
   liveMenu[id]={...data};stock[id]={active:true,qty:""};$("#editId").value=id;
   $("#itemEditMsg").textContent="✅ New item created. Adding it to the menu…";
   const file=$("#editImageFile")?.files?.[0];if(file&&typeof window.uploadItemImage==="function")await window.uploadItemImage();
   creatingNewItem=false;window.renderMenuEditor?.();window.renderStock?.();window.BakeGrillMasterUI?.refresh?.();window.renderMasterDashboard?.();
   if(save){save.disabled=false;save.textContent="Save Item";}
   $("#itemEditMsg").textContent="✅ Item saved and available in the customer menu.";
   setTimeout(()=>window.closeItemEditor?.(),950);
  }catch(error){
   console.error("New menu item save failed:",error);$("#itemEditMsg").textContent="❌ Save failed: "+(error?.message||error);
   if(save){save.disabled=false;save.textContent="Save Item";}
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
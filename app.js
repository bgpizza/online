const WA_NUMBER="918240266267";
const STORE={lat:22.392655,lon:88.224307,label:"Bake & Grill, Sanjua-Bakhrahat"};
const OSRM_URL="https://router.project-osrm.org/route/v1/driving";
function getDeliveryRule(km){
  if(km<=1) return {minOrder:199,charge:0,label:"0–1 KM"};
  if(km<=3) return {minOrder:299,charge:0,label:"1.1–3 KM"};
  if(km<=8) return {minOrder:499,charge:0,label:"3.1–8 KM"};
  return null;
}
let cart=[], customerLocation=null, distanceKm=null, routeDurationMin=null;
const CART_KEY="bake_grill_cart_v3";
const CUSTOMER_KEY="bake_grill_customer_v2";
const LAST_ORDER_KEY="bake_grill_last_order_v1";
let stock={};
const $=s=>document.querySelector(s);
const money=n=>"₹"+Number(n).toLocaleString("en-IN");
const categoryOrder=["Veg Pizza","Chicken Pizza","Burgers","Veg Sandwich","Chicken Sandwich","Quick Bites","Family Combos","Bondhu Combos","Solo Combos","Add-ons"];
const emoji={"Veg Pizza":"🍕","Chicken Pizza":"🍗","Burgers":"🍔","Veg Sandwich":"🥪","Chicken Sandwich":"🥪","Quick Bites":"🍟","Family Combos":"👨‍👩‍👧‍👦","Bondhu Combos":"👥","Solo Combos":"👤","Add-ons":"🧀"};

let activeCategory="all";
let searchQuery="";
const SEARCH_KEY="bake_grill_recent_searches_v1";
const quickCategoryOrder=["Veg Pizza","Chicken Pizza","Burgers","Quick Bites","Veg Sandwich","Chicken Sandwich"];
const curatedPickIds=["101","104","117","123","141","58"];
const searchAliases={
  pizza:["pizza","pizzas"], chicken:["chicken","non veg","nonveg","crispy"], paneer:["paneer","panir"], veg:["veg","vegetarian"], cheese:["cheese","cheesy","cheez"], burger:["burger","burgers"], sandwich:["sandwich","sandwiches"], fries:["fries","french fries","chips"], combo:["combo","combos"], snack:["snack","snacks","quick bites"], mushroom:["mushroom"], corn:["corn","sweet corn"], bbq:["bbq","barbecue"], peri:["peri","periperi","peri peri"], tandoori:["tandoori"], sausage:["sausage"], spicy:["spicy","chilli","chili"]
};
function normalizeSearch(v){return String(v||"").toLowerCase().trim().replace(/[^a-z0-9\s&-]/g," ").replace(/\s+/g," ");}
function expandSearchTerms(q){
  const n=normalizeSearch(q);
  if(!n)return [];
  const out=new Set(n.split(" ").filter(Boolean));
  Object.entries(searchAliases).forEach(([key,vals])=>{ if(vals.some(v=>n.includes(v))) { out.add(key); vals.forEach(v=>out.add(v)); } });
  return [...out];
}
function itemSearchText(x){return normalizeSearch([x.id,x.name,x.category,x.description,x.type].filter(Boolean).join(" "));}
function matchesSearch(x,q){
  const n=normalizeSearch(q); if(!n)return true;
  const hay=itemSearchText(x);
  const terms=expandSearchTerms(n);
  return terms.every(t=>hay.includes(t)) || hay.includes(n);
}
function loadRecentSearches(){try{return JSON.parse(localStorage.getItem(SEARCH_KEY)||"[]").filter(Boolean).slice(0,6)}catch(e){return []}}
function saveRecentSearch(q){const n=normalizeSearch(q);if(n.length<2)return;const arr=[n,...loadRecentSearches().filter(x=>x!==n)].slice(0,6);try{localStorage.setItem(SEARCH_KEY,JSON.stringify(arr))}catch(e){}}
function renderQuickCategories(){
  const el=$("#quickCategories"); if(!el)return;
  el.innerHTML=quickCategoryOrder.map(c=>`<button class="quick-cat" data-cat="${c}" type="button"><span>${emoji[c]}</span><b>${c.replace(" Pizza","")}</b></button>`).join("");
  el.querySelectorAll(".quick-cat").forEach(b=>b.onclick=()=>setCategory(b.dataset.cat,true));
}
function renderSmartPicks(){
  const el=$("#smartPicks"); if(!el)return;
  const picks=curatedPickIds.map(id=>MENU_ITEMS.find(x=>String(x.id)===id)).filter(Boolean).filter(x=>isInStock(x.id)).slice(0,6);
  if(!picks.length){el.innerHTML="";return}
  el.innerHTML=`<div class="smart-picks-head"><b>🔥 Popular Picks</b><span>Quick add from our menu</span></div><div class="smart-pick-grid">${picks.map(x=>miniPickCard(x)).join("")}</div>`;
  el.querySelectorAll(".smart-pick-add").forEach(b=>b.onclick=()=>addItem(b.dataset.id,b.dataset.size||""));
}
function miniPickCard(x){
  const isPizza=x.type==="pizza";
  const size=isPizza?"Ekla Bite":"";
  const price=isPizza?x.prices[size]:x.price;
  return `<button class="smart-pick" type="button" data-id="${x.id}" aria-label="${x.name}"><span class="smart-pick-icon">${emoji[x.category]||"🍽️"}</span><span class="smart-pick-name">${x.name}</span><span class="smart-pick-meta">${isPizza?"From ":""}${price==="Ask"?"Ask":money(price)}</span><span class="smart-pick-add" data-id="${x.id}" data-size="${size}">＋</span></button>`;
}
function setCategory(cat,scroll=true){
  activeCategory=cat;
  document.querySelectorAll(".cat").forEach(x=>x.classList.toggle("active",x.dataset.cat===cat));
  renderMenu(cat,searchQuery);
  if(scroll && cat!=="all" && !searchQuery) document.getElementById("sec-"+slug(cat))?.scrollIntoView({behavior:"smooth",block:"start"});
}
function setSearch(q,remember=false){
  searchQuery=q;
  const input=$("#smartSearch"); if(input && input.value!==q)input.value=q;
  const clear=$("#clearSearch"); if(clear)clear.hidden=!normalizeSearch(q);
  renderMenu(activeCategory,q);
  if(remember)saveRecentSearch(q);
}
function setupSmartSearch(){
  const input=$("#smartSearch"); if(!input)return;
  let timer;
  input.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>setSearch(input.value,false),90)});
  input.addEventListener("keydown",e=>{if(e.key==="Enter"){saveRecentSearch(input.value);setSearch(input.value,true);document.getElementById("menu")?.scrollIntoView({behavior:"smooth",block:"start"})}if(e.key==="Escape")setSearch("")});
  $("#clearSearch")?.addEventListener("click",()=>{setSearch("");input.focus()});
  document.querySelectorAll(".search-hints button").forEach(b=>b.onclick=()=>{setSearch(b.dataset.search,true);document.getElementById("menu")?.scrollIntoView({behavior:"smooth",block:"start"})});
  $("#backHome")?.addEventListener("click",()=>document.getElementById("smartHome")?.scrollIntoView({behavior:"smooth",block:"start"}));
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const voice=$("#voiceSearch");
  if(!SpeechRecognition){voice.style.display="none";return}
  voice.onclick=()=>{const r=new SpeechRecognition();r.lang="en-IN";r.interimResults=false;r.maxAlternatives=1;r.onstart=()=>voice.classList.add("listening");r.onend=()=>voice.classList.remove("listening");r.onresult=e=>{const text=e.results[0][0].transcript;setSearch(text,true);document.getElementById("menu")?.scrollIntoView({behavior:"smooth",block:"start"})};r.start()};
}

function firebaseCheck(){
  if(!window.firebaseReady){
    alert("Firebase connection failed. Open browser console (F12) for the exact error. Config is bundled in this version.");
    return false;
  }
  return true;
}
function init(){
  restoreLocalState();
  const cats=$("#categories");
  cats.innerHTML='<button class="cat active" data-cat="all">✨ All</button>'+categoryOrder.map(c=>`<button class="cat" data-cat="${c}">${emoji[c]} ${c}</button>`).join("");
  cats.addEventListener("click",e=>{const b=e.target.closest(".cat");if(!b)return;setCategory(b.dataset.cat,true)});
  renderQuickCategories();
  renderSmartPicks();
  setupSmartSearch();
  renderMenu("all","");
  restoreCustomerFields();
  setupPwaActions();
  $("#locateBtn").onclick=checkLocation;
  $("#openCart").onclick=openCart; $("#closeCart").onclick=closeCart; $("#overlay").onclick=closeCart; $("#cartLocationBtn").onclick=checkLocation;
  $("#checkoutBtn").onclick=openCheckout; $("#closeModal").onclick=()=>$("#checkoutModal").classList.remove("show");
  $("#sendWhatsApp").onclick=sendWhatsApp;
  $("#trackWhatsApp")?.addEventListener("click",trackOrder);
  $("#trackLive")?.addEventListener("click",trackLiveStatus);
  if(firebaseReady){
    db.collection("stock").onSnapshot(snap=>{
      stock={}; snap.forEach(doc=>stock[doc.id]=doc.data());
      renderMenu(activeCategory,searchQuery);
      renderCart();
      const notice=$("#stockNotice");
      if(notice) notice.textContent="Inventory availability is live and updated by Bake & Grill.";
    },err=>{
      console.error("Stock listener:",err);
      const notice=$("#stockNotice");
      if(notice) notice.textContent="Inventory status could not be loaded. Please refresh the page.";
    });
  }
}
function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,"-")}
function isInStock(id){const s=stock[id]; return !(s && s.active===false)}
function renderMenu(filter="all",query=""){
  const groups={};
  MENU_ITEMS.forEach(x=>{
    if(!isInStock(x.id))return;
    if(filter!=="all"&&x.category!==filter)return;
    if(query&&!matchesSearch(x,query))return;
    (groups[x.category]??=[]).push(x);
  });
  const total=Object.values(groups).reduce((n,a)=>n+a.length,0);
  const count=$("#resultCount");
  if(count)count.textContent=query?`${total} result${total===1?"":"s"} for “${query}”`:filter!=="all"?`${total} item${total===1?"":"s"}`:"";
  if(!total){
    $("#menu").innerHTML=`<div class="no-results"><div>🔎</div><h3>No matching items</h3><p>Try another name, topping or category.</p><button class="primary" id="clearNoResults">Clear Search</button></div>`;
    $("#clearNoResults")?.addEventListener("click",()=>setSearch(""));
    return;
  }
  $("#menu").innerHTML=Object.entries(groups).map(([cat,arr])=>`<section class="section" id="sec-${slug(cat)}"><h2>${emoji[cat]||"🍽️"} ${cat}</h2><div class="grid">${arr.map(card).join("")}</div></section>`).join("");
  document.querySelectorAll(".add").forEach(b=>b.onclick=()=>addItem(b.dataset.id,b.dataset.size||""));
  document.querySelectorAll(".size-add").forEach(b=>b.onclick=()=>addItem(b.dataset.id,b.dataset.size));
}
function card(x){
  if(x.type==="pizza") return `<article class="card"><div class="card-img">${emoji[x.category]||"🍕"}</div><div class="card-body"><div class="code">CODE ${x.id}</div><div class="name">${x.name}</div><div class="desc"><b>Toppings:</b> ${x.description||"Freshly prepared"}</div><div class="size-grid">${Object.entries(x.prices).map(([size,price])=>`<button class="size-add" data-id="${x.id}" data-size="${size}"><span>${size.replace(" Bite","")}</span><b>${money(price)}</b></button>`).join("")}</div></div></article>`;
  return `<article class="card"><div class="card-img">${emoji[x.category]||"🍽️"}</div><div class="card-body"><div class="code">CODE ${x.id}</div><div class="name">${x.name}</div><div class="desc">${x.category}</div><div class="price-row"><span class="price">${x.price==="Ask"?"Ask on WhatsApp":money(x.price)}</span><button class="add" data-id="${x.id}" data-size="">ADD</button></div></div></article>`;
}
function addItem(id,size){
  const x=MENU_ITEMS.find(i=>i.id===id); if(!x)return;
  let price=x.type==="pizza"?Number(x.prices[size||"Ekla Bite"]):x.price;
  if(price==="Ask"){alert("This add-on price will be confirmed on WhatsApp.");price=0;}
  const key=id+"|"+(size||""); const found=cart.find(i=>i.key===key);
  if(found) found.qty++; else cart.push({key,id,name:x.name,size:size||"",price,qty:1});
  renderCart();
}
function saveLocalState(){
  try{ localStorage.setItem(CART_KEY, JSON.stringify(cart)); }catch(e){}
}
function restoreLocalState(){
  try{ const saved=JSON.parse(localStorage.getItem(CART_KEY)||"[]"); if(Array.isArray(saved)) cart=saved; }catch(e){ cart=[]; }
}
function restoreCustomerFields(){
  try{ const c=JSON.parse(localStorage.getItem(CUSTOMER_KEY)||"{}"); if(c.name) $("#customerName").value=c.name; if(c.phone) $("#customerPhone").value=c.phone; if(c.address) $("#address").value=c.address; }catch(e){}
}
function saveCustomerFields(){
  try{ localStorage.setItem(CUSTOMER_KEY, JSON.stringify({name:$("#customerName").value.trim(),phone:$("#customerPhone").value.trim(),address:$("#address").value.trim()})); }catch(e){}
}
function setupPwaActions(){
  ["#customerName","#customerPhone","#address"].forEach(sel=>$(sel)?.addEventListener("input",saveCustomerFields));
  $("#customerName")?.addEventListener("input",saveCustomerFields);
}
function renderCart(){
  $("#cartCount").textContent=cart.reduce((s,i)=>s+i.qty,0);
  $("#cartItems").innerHTML=cart.length?`<div class="cart-list">${cart.map((i,idx)=>`<div class="cart-line"><div><div class="cart-name">${i.name}</div><div class="cart-meta">${i.size?i.size+" • ":""}${i.price?money(i.price):"Price to confirm"}</div></div><div class="qty"><button onclick="changeQty(${idx},-1)">−</button><span>${i.qty}</span><button onclick="changeQty(${idx},1)">+</button></div></div>`).join("")}</div>`:`<p class="muted">Your cart is empty.</p>`;
  saveLocalState();
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0), rule=distanceKm===null?null:getDeliveryRule(distanceKm);
  const info=rule?`📍 ${distanceKm.toFixed(1)} KM • Minimum order ${money(rule.minOrder)} • 🚚 FREE`:(distanceKm!==null?"❌ No delivery above 8 KM":"📍 Check location to see your delivery rule");
  const oldInfo=document.getElementById("cartRuleInfo"); if(oldInfo) oldInfo.textContent=info; $("#cartTotal").textContent=money(total);
}
function changeQty(i,d){cart[i].qty+=d;if(cart[i].qty<=0)cart.splice(i,1);renderCart()}
function openCart(){$("#cartDrawer").classList.add("open");$("#overlay").classList.add("show")}
function closeCart(){$("#cartDrawer").classList.remove("open");$("#overlay").classList.remove("show")}
async function getRoadRoute(lat,lon){
  const url=`${OSRM_URL}/${STORE.lon},${STORE.lat};${lon},${lat}?overview=false&steps=false`;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const res=await fetch(url,{headers:{"Accept":"application/json"},signal:controller.signal});
    if(!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data=await res.json();
    if(data.code!=="Ok" || !data.routes?.length) throw new Error(data.code||"No route found");
    return {distanceKm:data.routes[0].distance/1000,durationMin:data.routes[0].duration/60};
  }finally{clearTimeout(timer)}
}
function checkLocation(){
  if(!navigator.geolocation){setStatus("This browser does not support location sharing.","bad");return}
  setStatus("📍 Getting your GPS location…");
  navigator.geolocation.getCurrentPosition(async pos=>{
    customerLocation={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy};
    setStatus("🚗 Calculating road distance…");
    try{
      const route=await getRoadRoute(customerLocation.lat,customerLocation.lon);
      distanceKm=route.distanceKm;
      routeDurationMin=route.durationMin;
      const rule=getDeliveryRule(distanceKm);
      const eta=` • ~${Math.max(1,Math.round(routeDurationMin))} min drive`;
      if(rule)setStatus(`✅ Road distance ${distanceKm.toFixed(1)} KM${eta} • Minimum order ${money(rule.minOrder)} • Delivery FREE`,"ok");
      else setStatus(`❌ Road distance ${distanceKm.toFixed(1)} KM • No delivery above 8 KM.`,"bad");
      renderCart();
      $("#checkoutLocation").textContent=rule?`✅ Road distance ${distanceKm.toFixed(1)} KM • ~${Math.max(1,Math.round(routeDurationMin))} min • Minimum order ${money(rule.minOrder)} • FREE delivery`:`❌ Road distance ${distanceKm.toFixed(1)} KM • Delivery unavailable`;
    }catch(err){
      console.error("OSRM route error:",err);
      distanceKm=null; routeDurationMin=null; renderCart();
      setStatus("❌ Could not calculate road distance. Please try again.","bad");
      $("#checkoutLocation").textContent="Road distance unavailable. Please try location again.";
    }
  },err=>setStatus("Location permission was not granted. Please allow location access and try again.","bad"),{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}
function setStatus(t,c=""){$("#locationStatus").textContent=t;$("#locationStatus").className="location-status "+c}
function openCheckout(){
  if(!cart.length){alert("Please add at least one item.");return} if(customerLocation===null||distanceKm===null){alert("Please check your delivery location first.");return}
  const rule=getDeliveryRule(distanceKm); if(!rule){alert("Sorry, this address is outside our 8 KM delivery area.");return}
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0); if(total<rule.minOrder){alert(`Minimum order for ${rule.label} is ${money(rule.minOrder)}. Please add ${money(rule.minOrder-total)} more.`);return}
  $("#checkoutModal").classList.add("show"); closeCart();
}
async function sendWhatsApp(){
  if(!firebaseCheck())return;
  const name=$("#customerName").value.trim(),phone=$("#customerPhone").value.trim(),addr=$("#address").value.trim();
  if(!name||!phone||!addr){alert("Please fill in name, phone and delivery address.");return}
  if(!customerLocation||distanceKm===null){alert("Please check your delivery location first.");return}
  const rule=getDeliveryRule(distanceKm); if(!rule){alert("Sorry, this address is outside our 8 KM delivery area.");return}
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0); if(total<rule.minOrder){alert(`Minimum order for ${rule.label} is ${money(rule.minOrder)}. Please add ${money(rule.minOrder-total)} more.`);return}
  const orderId="BG"+Date.now().toString().slice(-8), lines=cart.map((i,n)=>`${n+1}. ${i.name}${i.size?" ("+i.size+")":""} x${i.qty} = ${i.price?money(i.price*i.qty):"price confirm"}`).join("\n"), map=`https://www.google.com/maps?q=${customerLocation.lat},${customerLocation.lon}`;
  const order={orderId,name,phone,address:addr,distanceKm:Number(distanceKm.toFixed(2)),routeDurationMin:routeDurationMin?Number(routeDurationMin.toFixed(1)):null,distanceType:"OSRM road distance",rule:rule.label,minOrder:rule.minOrder,total:Number(total),status:"NEW",createdAt:firebase.firestore.FieldValue.serverTimestamp(),items:cart.map(i=>({name:i.name,size:i.size,qty:i.qty,price:i.price}))};
  try{
    await db.collection("orders").doc(orderId).set(order);
    await db.collection("publicStatuses").doc(orderId).set({status:"NEW",updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    try{ localStorage.setItem(LAST_ORDER_KEY, orderId); }catch(e){}
    if(window.BakeGrillPush?.attachToOrder) await window.BakeGrillPush.attachToOrder(orderId);
  }catch(e){console.error(e);alert("Could not save your order. Please check Firebase setup and try again.");return}
  const msg=`🍕 *BAKE & GRILL — NEW ORDER*\n\n👤 Name: ${name}\n📞 Phone: ${phone}\n📍 Address: ${addr}\n📏 Road Distance: ${distanceKm.toFixed(1)} KM\n🚗 Drive Time: ~${routeDurationMin?Math.max(1,Math.round(routeDurationMin)):"—"} min\n📌 Rule: ${rule.label}\n🛒 Minimum Order: ${money(rule.minOrder)}\n🗺️ Customer Location: ${map}\n🚚 Delivery Charge: FREE\n\n*ORDER ITEMS*\n${lines}\n\n💰 *Order Total: ${money(total)}*\n🆔 Order ID: ${orderId}\n\nPlease confirm my order.`;
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`,"_blank");
  $("#checkoutModal").classList.remove("show");
  $("#trackOrderId").value=orderId;
  alert(`Order saved. Your Order ID is ${orderId}. You can use Track Order to see live status.`);
}
let statusUnsubscribe=null;
function trackLiveStatus(){
  if(!firebaseCheck())return;
  const id=$("#trackOrderId").value.trim(); if(!id){alert("Please enter your Order ID.");return}
  statusUnsubscribe?.();
  $("#liveStatus").textContent="Checking live status…";
  statusUnsubscribe=db.collection("publicStatuses").doc(id).onSnapshot(d=>{
    if(!d.exists){$("#liveStatus").textContent="Order not found.";return}
    const s=d.data();
    $("#liveStatus").textContent=`Order ${id}: ${s.status}`;
  },e=>{console.error(e);$("#liveStatus").textContent="Could not check status.";});
}
function trackOrder(){const id=$("#trackOrderId").value.trim();if(!id){alert("Please enter your Order ID.");return}const msg=`📦 *ORDER STATUS REQUEST*\n\n🆔 Order ID: ${id}\n\nPlease send me the current status of my order.`;window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`,"_blank")}
init();

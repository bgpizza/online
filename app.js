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
let stock={};
let liveMenu={};
let deliveryEnabled=true;
let searchQuery="";
let searchPriceMax=null;
let customerProfile=null;
const CUSTOMER_PROFILE_KEY="bakeGrillCustomerProfile";
const $=s=>document.querySelector(s);
const money=n=>"₹"+Number(n).toLocaleString("en-IN");
const categoryOrder=["Veg Pizza","Chicken Pizza","Burgers","Veg Sandwich","Chicken Sandwich","Quick Bites","Family Combos","Bondhu Combos","Solo Combos","Add-ons"];
const emoji={"Veg Pizza":"🍕","Chicken Pizza":"🍗","Burgers":"🍔","Veg Sandwich":"🥪","Chicken Sandwich":"🥪","Quick Bites":"🍟","Family Combos":"👨‍👩‍👧‍👦","Bondhu Combos":"👥","Solo Combos":"👤","Add-ons":"🧀"};

function escHtml(s){return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]||m))}
function firebaseCheck(){
  if(!window.firebaseReady){
    alert("Firebase connection failed. Open browser console (F12) for the exact error. Config is bundled in this version.");
    return false;
  }
  return true;
}
function init(){
  const cats=$("#categories");
  cats.innerHTML='<button class="cat active" data-cat="all">All</button>'+categoryOrder.map(c=>`<button class="cat" data-cat="${c}">${emoji[c]} ${c}</button>`).join("");
  cats.addEventListener("click",e=>{
    const b=e.target.closest(".cat"); if(!b)return;
    document.querySelectorAll(".cat").forEach(x=>x.classList.remove("active")); b.classList.add("active");
    renderMenu(b.dataset.cat);
    if(b.dataset.cat!=="all") document.getElementById("sec-"+slug(b.dataset.cat))?.scrollIntoView({behavior:"smooth",block:"start"});
  });
  renderHeroPicks();
  renderMenu("all");
  setupSmartSearch();
  updateDeliveryUI();
  $("#locateBtn").onclick=checkLocation;
  $("#openCart").onclick=openCart; $("#floatingCart").onclick=openCart; $("#closeCart").onclick=closeCart; $("#overlay").onclick=closeCart;
  $("#checkoutBtn")?.addEventListener("click",openCheckout);
  $("#confirmProceedOrder")?.addEventListener("click",proceedOrder);
  $("#changeCustomerAccount")?.addEventListener("click",()=>showCustomerForm(true));
  loadCustomerProfile();
  $("#closeCustomize")?.addEventListener("click",closeCustomize);
  $("#customizeBackdrop")?.addEventListener("click",closeCustomize);
  $("#customizeMinus")?.addEventListener("click",()=>{customizeState.qty=Math.max(1,customizeState.qty-1);updateCustomizeTotal()});
  $("#customizePlus")?.addEventListener("click",()=>{customizeState.qty+=1;updateCustomizeTotal()});
  $("#customizeAdd")?.addEventListener("click",commitCustomizedItem);
  // Location is mandatory: request immediately and keep the page locked until it succeeds.
  document.body.classList.add("location-required");
  const gateRetry=document.getElementById("locationGateRetry");
  if(gateRetry) gateRetry.onclick=checkLocation;
  setTimeout(()=>checkLocation(),350);
  $("#trackLive")?.addEventListener("click",trackLiveStatus);
  if(firebaseReady){
    db.collection("stock").onSnapshot(snap=>{
      stock={}; snap.forEach(doc=>stock[doc.id]=doc.data());
      renderHeroPicks();
      renderMenu(document.querySelector(".cat.active")?.dataset.cat||"all");
      renderCart();
    },err=>console.error("Stock listener:",err));
    db.collection("menu").onSnapshot(snap=>{
      liveMenu={}; snap.forEach(doc=>liveMenu[doc.id]=doc.data());
      renderHeroPicks();
      renderMenu(document.querySelector(".cat.active")?.dataset.cat||"all");
    },err=>console.error("Menu listener:",err));
    db.collection("settings").doc("delivery").onSnapshot(doc=>{
      deliveryEnabled=doc.exists ? doc.data().enabled !== false : true;
      updateDeliveryUI();
      renderCart();
    },err=>console.error("Delivery setting listener:",err));
  }
}
function getLiveItem(base){ return liveMenu[base.id] ? {...base,...liveMenu[base.id]} : base; }
function getMenuItems(){ return MENU_ITEMS.map(getLiveItem); }
function updateDeliveryUI(){
  const el=document.getElementById("deliveryBanner");
  if(el){ el.textContent=deliveryEnabled?"🚚 Delivery is ON":"⛔ Delivery is currently OFF"; el.className="delivery-banner "+(deliveryEnabled?"on":"off"); }
  const btn=document.getElementById("checkoutBtn"); if(btn) btn.disabled=false;
}
function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,"-")}
function isInStock(id){const s=stock[id]; return !(s && s.active===false)}
function normalizeSearch(s){return String(s||"").toLowerCase().replace(/₹/g," rs ").replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim()}
function searchTokens(q){
  const n=normalizeSearch(q);
  const aliases={
    "non":"chicken","nonveg":"chicken","non veg":"chicken","meat":"chicken","murgi":"chicken",
    "vegetarian":"veg","cheesy":"cheese","hot":"spicy","mild":"mild",
    "cheap":"under 100","budget":"under 100","ekla":"ekla","solo":"ekla","single":"ekla",
    "buddy":"bondhu","bondhu":"bondhu","family":"family","large":"family","medium":"bondhu","small":"ekla"
  };
  return n.split(" ").filter(Boolean).map(x=>aliases[x]||x);
}
function extractSearchPrice(q){
  const n=normalizeSearch(q);
  const m=n.match(/(?:under|below|less than|upto|up to|within|under rs|below rs)\s*(\d{2,4})/);
  return m?Number(m[1]):null;
}
function levenshtein(a,b){
  if(a===b)return 0;if(!a||!b)return Math.max(a.length,b.length);
  if(Math.abs(a.length-b.length)>2)return 3;
  const prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    let cur=[i];
    for(let j=1;j<=b.length;j++) cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    for(let j=0;j<cur.length;j++) prev[j]=cur[j];
  }
  return prev[b.length];
}
function fuzzyTokenMatch(token,text){
  if(text.includes(token))return true;
  if(token.length<4)return false;
  return text.split(" ").some(w=>w.length>=4 && levenshtein(token,w)<=1);
}
function itemSearchText(x){return normalizeSearch([x.name,x.description,x.category,x.badge,x.id].join(" "));}
function itemMinPrice(x){if(x.type==="pizza")return Math.min(...Object.values(x.prices||{}).map(Number)); return x.price==="Ask"?Infinity:Number(x.price||0);}
function matchesSearch(x){
  if(!searchQuery && searchPriceMax===null)return true;
  const q=normalizeSearch(searchQuery);
  if(q){
    const tokens=searchTokens(q).filter(t=>t!=="under");
    const text=itemSearchText(x);
    const priceToken=tokens.find(t=>/^\d{2,4}$/.test(t));
    const nonPrice=tokens.filter(t=>t!==priceToken);
    if(priceToken && itemMinPrice(x)>Number(priceToken))return false;
    if(nonPrice.some(t=>t==="under")) return false;
    if(!nonPrice.every(t=>fuzzyTokenMatch(t,text)))return false;
  }
  if(searchPriceMax!==null && itemMinPrice(x)>searchPriceMax)return false;
  return true;
}
function setupSmartSearch(){
  const input=$("#smartSearch"), clear=$("#clearSearch"), quick=$("#quickSearch");
  if(!input)return;
  const run=()=>{searchQuery=input.value.trim();searchPriceMax=extractSearchPrice(searchQuery);updateSearchUI();renderMenu(searchQuery?"all":(document.querySelector(".cat.active")?.dataset.cat||"all"));};
  input.addEventListener("input",run);
  clear.onclick=()=>{input.value="";searchQuery="";searchPriceMax=null;updateSearchUI();renderMenu(document.querySelector(".cat.active")?.dataset.cat||"all");input.focus();};
  quick?.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;input.value=b.dataset.search;run();input.focus();window.scrollTo({top:document.querySelector(".smart-search-wrap").offsetTop-8,behavior:"smooth"});});
  $("#seeAllPicks")?.addEventListener("click",()=>{$("#clearSearch")?.click();document.querySelector("#menu")?.scrollIntoView({behavior:"smooth"});});
  updateSearchUI();
}
function updateSearchUI(){
  const clear=$("#clearSearch"), hint=$("#searchHint"), count=$("#searchResultCount");
  if(clear)clear.style.visibility=searchQuery?"visible":"hidden";
  if(hint)hint.textContent=searchQuery?"Searching the full menu — name, toppings, category, badge and price.":"Search the full menu by food name, topping, category, price or size.";
  if(count)count.textContent="";
}
function renderHeroPicks(){
  const wrap=$("#heroPicks"), section=$("#heroPicksSection"); if(!wrap)return;
  const all=getMenuItems().filter(isInStock);
  let picks=all.filter(x=>x.hero===true);
  if(!picks.length)picks=all.filter(x=>x.bestChoice===true);
  if(!picks.length)picks=all.slice(0,4);
  picks=picks.slice(0,3);
  section.style.display=picks.length?"block":"none";
  wrap.innerHTML=picks.map(heroCard).join("");
  wrap.querySelectorAll(".hero-add").forEach(b=>b.onclick=()=>openCustomize(b.dataset.id));
}
function heroCard(x){
  const badge=x.badge||"BEST CHOICE";
  if(x.type==="pizza") { const size="Ekla Bite", price=Number(x.prices?.[size]||0); return `<article class="hero-product"><div class="hero-product-visual">${emoji[x.category]||"🍕"}<span>⭐ ${escHtml(badge)}</span></div><div class="hero-product-body"><small>${escHtml(x.category)}</small><h3>${escHtml(x.name)}</h3><p>${escHtml(x.description||"Freshly prepared for you")}</p><div class="hero-product-foot"><b>From ${money(price)}</b><button class="hero-add" data-id="${escHtml(x.id)}" data-size="${size}">ADD</button></div></div></article>`; }
  return `<article class="hero-product"><div class="hero-product-visual">${emoji[x.category]||"🍽️"}<span>⭐ ${escHtml(badge)}</span></div><div class="hero-product-body"><small>${escHtml(x.category)}</small><h3>${escHtml(x.name)}</h3><p>${escHtml(x.description||"Freshly prepared for you")}</p><div class="hero-product-foot"><b>${x.price==="Ask"?"Ask on WhatsApp":money(x.price)}</b><button class="hero-add" data-id="${escHtml(x.id)}">ADD</button></div></div></article>`;
}
function renderMenu(filter="all"){
  const groups={}; let visible=0;
  getMenuItems().forEach(x=>{
    if(!isInStock(x.id))return;
    if(filter!=="all"&&x.category!==filter)return;
    if(!matchesSearch(x))return;
    (groups[x.category]??=[]).push(x); visible++;
  });
  const menu=$("#menu");
  if(!visible){
    menu.innerHTML=`<section class="no-search-results"><div>🔎</div><h2>No exact match</h2><p>Try another word or one of the quick searches above.</p><button class="primary" id="showAllResults">Show all items</button></section>`;
    $("#showAllResults")?.addEventListener("click",()=>{$("#clearSearch")?.click()});
  } else {
    menu.innerHTML=Object.entries(groups).map(([cat,arr])=>`<section class="section" id="sec-${slug(cat)}"><h2>${emoji[cat]||"🍽️"} ${cat}<span class="result-count">${arr.length}</span></h2><div class="grid">${arr.map(card).join("")}</div></section>`).join("");
  }
  const hint=$("#searchHint");
  if(hint&&searchQuery)hint.textContent=`Found ${visible} matching item${visible===1?"":"s"} for “${searchQuery}”.`;
  document.querySelectorAll(".add").forEach(b=>b.onclick=()=>openCustomize(b.dataset.id));
}
function cartQty(id,size=""){
  const found=cart.find(i=>i.key===id+"|"+size);
  return found?found.qty:0;
}
function qtyControl(id,size="",label="ADD"){
  const qty=cartQty(id,size);
  const safeId=escHtml(id), safeSize=escHtml(size);
  if(!qty) return `<button class="add" data-id="${safeId}" data-size="${safeSize}">${label}</button>`;
  return `<div class="inline-qty" aria-label="Quantity controls">
    <button type="button" class="qty-inline" data-id="${safeId}" data-size="${safeSize}" data-delta="-1" aria-label="Decrease quantity">−</button>
    <span class="inline-qty-number">${qty}</span>
    <button type="button" class="qty-inline" data-id="${safeId}" data-size="${safeSize}" data-delta="1" aria-label="Increase quantity">+</button>
  </div>`;
}
function card(x){
  const badge=x.badge || (x.bestChoice?"BEST CHOICE":"");
  const badgeHtml=badge?`<span class="item-badge">⭐ ${escHtml(badge)}</span>`:"";
  const minPrice=x.type==="pizza"?Math.min(...Object.values(x.prices||{}).map(Number)):(x.price==="Ask"?null:Number(x.price||0));
  const priceText=minPrice===null?"Price on request":`From ${money(minPrice)}`;
  return `<article class="card"><div class="card-img">${x.image?`<img src="${escHtml(x.image)}" alt="${escHtml(x.name)}" loading="lazy">`:(emoji[x.category]||"🍽️")}${badgeHtml}</div><div class="card-body"><div class="code">CODE ${x.id}</div><div class="name">${escHtml(x.name)}</div><div class="desc">${x.description?escHtml(x.description):escHtml(x.category)}</div><div class="price-row"><span class="price">${priceText}</span><button class="add" data-id="${escHtml(x.id)}">ADD</button></div></div></article>`;
}
let customizeState={id:null,qty:1,size:null,extras:[]};
function getAddons(){return getMenuItems().filter(x=>x.category==="Add-ons" && isInStock(x.id));}
function openCustomize(id){
  const x=getMenuItems().find(i=>i.id===id); if(!x)return;
  customizeState={id,qty:1,size:x.type==="pizza"?(Object.keys(x.prices||{})[0]||"Ekla Bite"):null,extras:[]};
  renderCustomizeSheet();
  $("#customizeSheet")?.classList.add("show");
  $("#customizeSheet")?.setAttribute("aria-hidden","false");
}
function closeCustomize(){$("#customizeSheet")?.classList.remove("show");$("#customizeSheet")?.setAttribute("aria-hidden","true");}
function renderCustomizeSheet(){
  const x=getMenuItems().find(i=>i.id===customizeState.id); if(!x)return;
  const img=$("#customizeImage"); if(img){img.src=x.image||"";img.alt=x.name;img.style.display=x.image?"block":"none";}
  $("#customizeName").textContent=x.name;
  const addons=getAddons();
  const sizeBlock=x.type==="pizza"?`<section class="customize-group"><h3>Size</h3><p>Required • Select 1 option</p><div class="customize-options">${Object.entries(x.prices||{}).map(([size,price])=>`<label class="customize-option radio"><span><b>${escHtml(size.replace(" Bite",""))}</b><small>${money(price)}</small></span><input type="radio" name="customSize" value="${escHtml(size)}" ${customizeState.size===size?"checked":""}></label>`).join("")}</div></section>`:"";
  const extrasBlock=addons.length?`<section class="customize-group"><h3>Extra Toppings</h3><p>Select what you want to add</p><div class="customize-options">${addons.map(a=>{const checked=customizeState.extras.includes(a.id);const pr=a.price==="Ask"?"Price on request":money(a.price);return `<label class="customize-option check"><span><b>${escHtml(a.name)}</b><small>${pr}</small></span><input type="checkbox" value="${escHtml(a.id)}" ${checked?"checked":""}></label>`}).join("")}</div></section>`:"";
  $("#customizeBody").innerHTML=sizeBlock+extrasBlock;
  $("#customizeQty").textContent=customizeState.qty;
  document.querySelectorAll('input[name="customSize"]').forEach(el=>el.onchange=()=>{customizeState.size=el.value;updateCustomizeTotal()});
  document.querySelectorAll('#customizeBody input[type="checkbox"]').forEach(el=>el.onchange=()=>{customizeState.extras=[...document.querySelectorAll('#customizeBody input[type="checkbox"]:checked')].map(v=>v.value);updateCustomizeTotal()});
  updateCustomizeTotal();
}
function customizeBasePrice(x){return x.type==="pizza"?Number(x.prices?.[customizeState.size]||0):Number(x.price||0);}
function customizeExtraPrice(id){const a=getAddons().find(x=>x.id===id);return a&&typeof a.price==="number"?Number(a.price):0;}
function updateCustomizeTotal(){const x=getMenuItems().find(i=>i.id===customizeState.id);if(!x)return;const total=(customizeBasePrice(x)+customizeState.extras.reduce((s,id)=>s+customizeExtraPrice(id),0))*customizeState.qty;$("#customizeQty").textContent=customizeState.qty;$("#customizeAdd").textContent=`Add item ${money(total)}`;}
function commitCustomizedItem(){
  const x=getMenuItems().find(i=>i.id===customizeState.id); if(!x)return;
  const size=customizeState.size||"";
  const extras=customizeState.extras.map(id=>{const a=getAddons().find(v=>v.id===id);return {id,name:a?.name||id,price:typeof a?.price==="number"?Number(a.price):0,priceOnRequest:a?.price==="Ask"}});
  const base=customizeBasePrice(x), extra=extras.reduce((s,e)=>s+e.price,0), unit=base+extra;
  const key=x.id+"|"+size+"|"+extras.map(e=>e.id).sort().join(",");
  const found=cart.find(i=>i.key===key);
  if(found) found.qty+=customizeState.qty; else cart.push({key,id:x.id,name:x.name,size,price:unit,qty:customizeState.qty,extras});
  renderCart(); closeCustomize();
}
function addItem(id,size){openCustomize(id);}
function changeMenuQty(id,size,d){openCustomize(id);}

function renderCart(){
  const itemCount=cart.reduce((s,i)=>s+i.qty,0);
  $("#cartCount").textContent=itemCount;
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0), rule=distanceKm===null?null:getDeliveryRule(distanceKm);
  const floating=document.getElementById("floatingCart");
  if(floating){
    floating.classList.toggle("has-items",itemCount>0);
    const meta=document.getElementById("floatingCartMeta");
    const totalEl=document.getElementById("floatingCartTotal");
    if(meta) meta.textContent=itemCount?`${itemCount} item${itemCount===1?"":"s"} • View order`:"Your cart is empty";
    if(totalEl) totalEl.textContent=money(total);
  }
  $("#cartItems").innerHTML=cart.length?`<div class="cart-list">${cart.map((i,idx)=>`<div class="cart-line"><div><div class="cart-name">${i.name}</div><div class="cart-meta">${i.size?i.size+" • ":""}${money(i.price)}${i.extras?.length?`<br>+ ${i.extras.map(e=>escHtml(e.name)).join(", ")}`:""}</div></div><div class="qty"><button onclick="changeQty(${idx},-1)">−</button><span>${i.qty}</span><button onclick="changeQty(${idx},1)">+</button></div></div>`).join("")}</div>`:`<div class="empty-cart"><div class="empty-cart-icon">🛒</div><strong>Your cart is empty</strong><p>Add your favourite items and tap the cart below to place your order.</p></div>`;
  const info=rule?`📍 ${distanceKm.toFixed(1)} KM • Minimum order ${money(rule.minOrder)} • 🚚 FREE`:(distanceKm!==null?"❌ No delivery above 8 KM":"📍 Calculating location…");
  const oldInfo=document.getElementById("cartRuleInfo"); if(oldInfo) oldInfo.textContent=info; $("#cartTotal").textContent=money(total);
}
function changeQty(i,d){cart[i].qty+=d;if(cart[i].qty<=0)cart.splice(i,1);renderCart()}
function openCart(){$("#cartDrawer").classList.add("open");$("#overlay").classList.add("show");document.body.classList.add("cart-open")}
function closeCart(){$("#cartDrawer").classList.remove("open");$("#overlay").classList.remove("show");document.body.classList.remove("cart-open")}
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
  const gate=document.getElementById("locationGate");
  const gateStatus=document.getElementById("locationGateStatus");
  if(gate){gate.classList.add("show");document.body.classList.add("location-required");}
  if(!navigator.geolocation){
    const msg="This browser does not support location. Please use Chrome/Safari with location enabled.";
    if(gateStatus) gateStatus.textContent=msg;
    setStatus(msg,"bad");
    return;
  }
  if(gateStatus) gateStatus.textContent="Requesting your location… Please tap Allow if your browser asks.";
  setStatus("📍 Getting your GPS location…");
  navigator.geolocation.getCurrentPosition(async pos=>{
    customerLocation={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy};
    setStatus("🚗 Calculating road distance…");
    if(gateStatus) gateStatus.textContent="Location received. Calculating delivery distance…";
    try{
      const route=await getRoadRoute(customerLocation.lat,customerLocation.lon);
      distanceKm=route.distanceKm;
      routeDurationMin=route.durationMin;
      const rule=getDeliveryRule(distanceKm);
      const eta=` • ~${Math.max(1,Math.round(routeDurationMin))} min drive`;
      if(rule){
        setStatus(`✅ Road distance ${distanceKm.toFixed(1)} KM${eta} • Minimum order ${money(rule.minOrder)} • Delivery FREE`,"ok");
        if(gateStatus) gateStatus.textContent=`✅ Location enabled • ${distanceKm.toFixed(1)} KM from Bake & Grill • Minimum order ${money(rule.minOrder)}`;
        if(gate){gate.classList.remove("show");document.body.classList.remove("location-required");}
      }else{
        setStatus(`❌ Road distance ${distanceKm.toFixed(1)} KM • No delivery above 8 KM.`,"bad");
        if(gateStatus) gateStatus.textContent="This location is outside our 8 KM delivery area.";
        // Keep the gate open: ordering is not possible without a valid delivery location.
      }
      renderCart();
      const checkout=document.getElementById("checkoutLocation");
      if(checkout) checkout.textContent=rule?`✅ Road distance ${distanceKm.toFixed(1)} KM • ~${Math.max(1,Math.round(routeDurationMin))} min • Minimum order ${money(rule.minOrder)} • FREE delivery`:`❌ Road distance ${distanceKm.toFixed(1)} KM • Delivery unavailable`;
    }catch(err){
      console.error("OSRM route error:",err);
      distanceKm=null; routeDurationMin=null; renderCart();
      const msg="Could not calculate road distance. Please keep Location/GPS ON and tap Retry.";
      setStatus("❌ "+msg,"bad");
      if(gateStatus) gateStatus.textContent=msg;
      const checkout=document.getElementById("checkoutLocation");
      if(checkout) checkout.textContent="Road distance unavailable. Please allow location and try again.";
    }
  },err=>{
    console.warn("Geolocation error",err);
    distanceKm=null; routeDurationMin=null; customerLocation=null;
    let msg="Location is required. Please turn ON Location/GPS and allow this site.";
    if(err && err.code===1) msg="Location permission is blocked. Turn ON Location/GPS and allow this site in browser settings, then tap Retry.";
    if(err && err.code===2) msg="Your device could not get a location. Turn ON Location/GPS and try again.";
    if(err && err.code===3) msg="Location request timed out. Turn ON Location/GPS and try again.";
    if(gateStatus) gateStatus.textContent=msg;
    setStatus("❌ "+msg,"bad");
  },{enableHighAccuracy:true,timeout:12000,maximumAge:0});
}
function setStatus(t,c=""){$("#locationStatus").textContent=t;$("#locationStatus").className="location-status "+c}
function loadCustomerProfile(){
  try{
    const raw=localStorage.getItem(CUSTOMER_PROFILE_KEY);
    customerProfile=raw?JSON.parse(raw):null;
  }catch(e){customerProfile=null;}
}
function validCustomerProfile(p){return p && typeof p.name==="string" && p.name.trim().length>=2 && /^\d{10}$/.test(String(p.phone||""));}
function showCustomerForm(forceEdit=false){
  const form=document.getElementById("customerAccountForm"), saved=document.getElementById("customerAccountSaved"), change=document.getElementById("changeCustomerAccount");
  if(!form||!saved)return;
  if(!forceEdit && validCustomerProfile(customerProfile)){
    form.style.display="none"; saved.style.display="block"; change.style.display="block";
    saved.innerHTML=`👤 ${escHtml(customerProfile.name)}<small>📱 +91 ${escHtml(customerProfile.phone)} • Customer account saved on this device</small>`;
    const n=document.getElementById("checkoutName"), ph=document.getElementById("checkoutPhone"); if(n)n.value=customerProfile.name; if(ph)ph.value=customerProfile.phone;
  }else{
    form.style.display="block"; saved.style.display="none"; change.style.display="none";
    const n=document.getElementById("checkoutName"), ph=document.getElementById("checkoutPhone");
    if(n)n.value=customerProfile?.name||""; if(ph)ph.value=customerProfile?.phone||"";
  }
}
async function ensureCustomerAccount(name,phone){
  const cleanName=String(name||"").trim().replace(/\s+/g," ");
  const cleanPhone=String(phone||"").replace(/\D/g,"");
  if(cleanName.length<2 || !/^\d{10}$/.test(cleanPhone)) throw new Error("Please enter your name and valid 10-digit phone number.");
  await (window.customerAuthReady||Promise.resolve(null));
  const uid=window.auth?.currentUser?.uid||null;
  customerProfile={name:cleanName,phone:cleanPhone,uid};
  localStorage.setItem(CUSTOMER_PROFILE_KEY,JSON.stringify(customerProfile));
  if(uid && window.db){
    await db.collection("customers").doc(uid).set({name:cleanName,phone:cleanPhone,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),createdBy:"customer-web"},{merge:true});
  }
  showCustomerForm(false);
  return customerProfile;
}
function openCheckout(){
  if(!deliveryEnabled){alert("Delivery is currently unavailable. Please try again later.");return}
  if(!cart.length){alert("Please add at least one item.");return} if(customerLocation===null||distanceKm===null){alert("Please check your delivery location first.");return}
  const rule=getDeliveryRule(distanceKm); if(!rule){alert("Sorry, this address is outside our 8 KM delivery area.");return}
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0); if(total<rule.minOrder){alert(`Minimum order for ${rule.label} is ${money(rule.minOrder)}. Please add ${money(rule.minOrder-total)} more.`);return}
  const loc=document.querySelector("#checkoutLocation");
  if(loc) loc.textContent=`📍 ${distanceKm.toFixed(1)} KM • Minimum order ${money(rule.minOrder)} • FREE delivery`;
  showCustomerForm(false);
  $("#checkoutModal")?.classList.add("show");
}
function closeCheckout(){
  $("#checkoutModal")?.classList.remove("show");
}

async function proceedOrder(){
  if(!deliveryEnabled){alert("Delivery is currently unavailable. Please try again later.");return}
  if(!firebaseCheck())return;
  if(!customerLocation||distanceKm===null){alert("Please allow location access so we can calculate delivery distance.");return}
  const nameInput=document.querySelector("#checkoutName"), phoneInput=document.querySelector("#checkoutPhone"), phoneError=document.querySelector("#checkoutPhoneError");
  const name=String(nameInput?.value||customerProfile?.name||"").trim();
  const phone=String(phoneInput?.value||customerProfile?.phone||"").replace(/\D/g,"");
  if(name.length<2 || !/^\d{10}$/.test(phone)){if(phoneError)phoneError.style.display="block";(!name?nameInput:phoneInput)?.focus();return}
  if(phoneError)phoneError.style.display="none";
  try{ await ensureCustomerAccount(name,phone); }catch(e){ if(phoneError){phoneError.textContent=e.message;phoneError.style.display="block";} return; }
  const rule=getDeliveryRule(distanceKm); if(!rule){alert("Sorry, this address is outside our 8 KM delivery area.");return}
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0); if(total<rule.minOrder){alert(`Minimum order for ${rule.label} is ${money(rule.minOrder)}. Please add ${money(rule.minOrder-total)} more.`);return}
  const orderId="BG"+Date.now().toString().slice(-8);
  const locationUrl=`https://www.google.com/maps?q=${customerLocation.lat},${customerLocation.lon}`;
  const items=cart.map(i=>({name:i.name,size:i.size||"",qty:i.qty,price:Number(i.price),extras:Array.isArray(i.extras)?i.extras.map(e=>({id:e.id,name:e.name,price:Number(e.price||0),priceOnRequest:!!e.priceOnRequest})):[]}));
  const order={orderId,name:customerProfile.name,phone,customerId:customerProfile.uid||null,address:locationUrl,customerLocation:{lat:Number(customerLocation.lat),lon:Number(customerLocation.lon),accuracy:customerLocation.accuracy?Number(customerLocation.accuracy):null},locationUrl,distanceKm:Number(distanceKm.toFixed(2)),routeDurationMin:routeDurationMin?Number(routeDurationMin.toFixed(1)):null,distanceType:"OSRM road distance",rule:rule.label,minOrder:rule.minOrder,total:Number(total),status:"NEW",createdAt:firebase.firestore.FieldValue.serverTimestamp(),items};
  try{
    const batch=db.batch(); const orderRef=db.collection("orders").doc(orderId); const statusRef=db.collection("publicStatuses").doc(orderId);
    batch.set(orderRef,order); batch.set(statusRef,{orderId,status:"NEW",customerId:customerProfile.uid||null,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),total:Number(total)});
    await batch.commit();
  }catch(e){console.error("Firebase order save failed:",e);alert("Could not save your order. Please try again.");return}
  // One successful Firestore write = one order. Never send the order to WhatsApp and never run this twice.
  cart=[]; renderCart(); localStorage.setItem("bakeGrillActiveOrder",orderId);
  window.BakeGrillPush?.attachToOrder?.(orderId);
  $("#checkoutModal")?.classList.remove("show"); closeCart();
  $("#trackOrderId").value=orderId; subscribeToOrder(orderId); showOrderComplete(orderId,total);
}
function showOrderComplete(orderId,total){
  const overlay=$("#orderComplete");
  if(!overlay)return;
  $("#completeOrderId").textContent=orderId;
  $("#completeOrderTotal").textContent=money(total);
  overlay.classList.add("show");
  document.body.classList.add("order-complete-open");
}
function closeOrderComplete(){
  $("#orderComplete")?.classList.remove("show");
  document.body.classList.remove("order-complete-open");
}
let statusUnsubscribe=null;
const ORDER_STEPS=["NEW","ACCEPTED","PREPARING","READY","OUT FOR DELIVERY","DELIVERED"];
function statusLabel(s){return ({NEW:"Waiting for restaurant",ACCEPTED:"Order accepted",PREPARING:"Being prepared",READY:"Ready for pickup", "OUT FOR DELIVERY":"Out for delivery",DELIVERED:"Delivered",CANCELLED:"Restaurant not accepting orders"})[s]||s;}
function renderTrackStatus(s){
  const box=$("#liveStatus"); if(!box)return;
  if(s==="CANCELLED"){box.innerHTML=`<div class="track-cancel"><div class="track-status-icon">⛔</div><strong>Restaurant not accepting orders right now</strong><p>This order was not accepted in time. Please try again later.</p></div>`;return;}
  const idx=Math.max(0,ORDER_STEPS.indexOf(s));
  box.innerHTML=`<div class="track-status-top"><div><small>ORDER STATUS</small><strong>${escHtml(statusLabel(s))}</strong></div><span class="track-live-dot">● LIVE</span></div><div class="track-timeline">${ORDER_STEPS.map((step,i)=>`<div class="track-step ${i<=idx?"done":""} ${i===idx?"current":""}"><span>${i<idx?"✓":i===idx?"●":""}</span><b>${escHtml(statusLabel(step))}</b></div>`).join("")}</div>`;
}
function subscribeToOrder(id){
  if(!firebaseCheck())return; const clean=String(id||"").trim(); if(!clean)return; statusUnsubscribe?.();
  localStorage.setItem("bakeGrillActiveOrder",clean); $("#trackOrderId").value=clean; $("#liveStatus").textContent="Connecting to live order status…";
  statusUnsubscribe=db.collection("publicStatuses").doc(clean).onSnapshot(d=>{
    if(!d.exists){$("#liveStatus").textContent="Order not found.";return;}
    const s=d.data(); renderTrackStatus(s.status||"NEW");
    if(s.status==="DELIVERED"){cart=[];renderCart();localStorage.removeItem("bakeGrillActiveOrder");}
  },e=>{console.error(e);$("#liveStatus").textContent="Could not check live status.";});
}
function trackLiveStatus(){const id=$("#trackOrderId").value.trim();if(!id){alert("Please enter your Order ID.");return}subscribeToOrder(id);}
function trackOrder(){const id=$("#trackOrderId").value.trim();if(!id){alert("Please enter your Order ID.");return}subscribeToOrder(id);document.getElementById("trackSection")?.scrollIntoView({behavior:"smooth",block:"start"});}
function formatOrderDate(ts){
  try{
    const d=ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if(!d || Number.isNaN(d.getTime())) return "Date unavailable";
    return d.toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
  }catch(e){return "Date unavailable";}
}
function orderHistoryStatusClass(status){
  return String(status||"NEW").toLowerCase().replace(/\s+/g,"-");
}
function renderCustomerOrders(docs){
  const box=$("#customerOrdersList"); if(!box)return;
  if(!docs.length){
    box.innerHTML=`<div class="customer-orders-empty"><div>🧾</div><strong>No orders yet</strong><p>Your completed and previous orders will appear here.</p></div>`;
    return;
  }
  box.innerHTML=docs.map(o=>{
    const items=Array.isArray(o.items)?o.items:[];
    const itemText=items.map(i=>`${escHtml(i.name||"Item")} ×${Number(i.qty||1)}`).join(", ");
    const status=String(o.status||"NEW");
    return `<article class="customer-order-card">
      <div class="customer-order-top"><div><small>ORDER ID</small><strong>${escHtml(o.orderId||"—")}</strong></div><span class="customer-order-status ${orderHistoryStatusClass(status)}">${escHtml(statusLabel(status))}</span></div>
      <div class="customer-order-date">${formatOrderDate(o.createdAt)}</div>
      <div class="customer-order-items">${itemText||"Items unavailable"}</div>
      <div class="customer-order-bottom"><strong>${money(Number(o.total||0))}</strong><button class="secondary customer-order-track" type="button" data-order-id="${escHtml(o.orderId||"")}">Track Order</button></div>
    </article>`;
  }).join("");
  box.querySelectorAll(".customer-order-track").forEach(btn=>btn.addEventListener("click",()=>{
    const id=btn.dataset.orderId; if(!id)return;
    $("#trackOrderId").value=id; subscribeToOrder(id);
    document.querySelectorAll('.app-nav-item').forEach(x=>x.classList.remove('active'));
    document.querySelector('.app-nav-item[data-nav="track"]')?.classList.add('active');
    document.getElementById("trackSection")?.scrollIntoView({behavior:"smooth",block:"start"});
  }));
}
async function loadCustomerOrderHistory(){
  const box=$("#customerOrdersList"); if(!box)return;
  box.innerHTML=`<div class="customer-orders-loading">Loading your orders…</div>`;
  if(!firebaseCheck()){box.innerHTML=`<div class="customer-orders-empty"><div>⚠️</div><strong>Firebase connection unavailable</strong><p>Please refresh and try again.</p></div>`;return;}
  try{
    await (window.customerAuthReady||Promise.resolve(null));
    const uid=window.auth?.currentUser?.uid;
    if(!uid){
      box.innerHTML=`<div class="customer-orders-empty"><div>👤</div><strong>Customer account not ready</strong><p>Please wait a moment and tap Refresh.</p></div>`;
      return;
    }
    const snap=await db.collection("orders").where("customerId","==",uid).get();
    const docs=[];
    snap.forEach(doc=>docs.push(doc.data()));
    docs.sort((a,b)=>{
      const ad=a.createdAt?.toMillis ? a.createdAt.toMillis() : (new Date(a.createdAt||0).getTime()||0);
      const bd=b.createdAt?.toMillis ? b.createdAt.toMillis() : (new Date(b.createdAt||0).getTime()||0);
      return bd-ad;
    });
    renderCustomerOrders(docs);
  }catch(e){
    console.error("Customer order history failed:",e);
    box.innerHTML=`<div class="customer-orders-empty"><div>⚠️</div><strong>Could not load order history</strong><p>Please refresh and try again.</p></div>`;
  }
}
function openCustomerOrderHistory(){
  const section=$("#customerOrdersSection"); if(!section)return;
  section.style.display="block";
  loadCustomerOrderHistory();
  section.scrollIntoView({behavior:"smooth",block:"start"});
}

init();
setTimeout(()=>{const saved=localStorage.getItem("bakeGrillActiveOrder");if(saved&&window.firebaseReady){$("#trackOrderId").value=saved;subscribeToOrder(saved);}},900);

// Real-app navigation
(function(){
  function setupAppNav(){
    document.querySelectorAll('.app-nav-item[data-nav]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var target=btn.dataset.nav;
        document.querySelectorAll('.app-nav-item').forEach(function(x){x.classList.remove('active');});
        btn.classList.add('active');
        if(target==='home') window.scrollTo({top:0,behavior:'smooth'});
        if(target==='track') document.getElementById('trackSection')?.scrollIntoView({behavior:'smooth',block:'start'});
        if(target==='orders') openCustomerOrderHistory();
        if(target==='cart') window.openCart ? window.openCart() : document.getElementById('openCart')?.click();
      });
    });
    document.getElementById('refreshCustomerOrders')?.addEventListener('click',loadCustomerOrderHistory);
    var originalRender=window.renderCart;
    // Keep the bottom cart badge synced by observing the visible cart count.
    var source=document.getElementById('cartCount'), badge=document.getElementById('bottomCartCount');
    if(source && badge){
      var sync=function(){badge.textContent=source.textContent||'0';};
      new MutationObserver(sync).observe(source,{childList:true,characterData:true,subtree:true});
      sync();
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',setupAppNav); else setupAppNav();
})();

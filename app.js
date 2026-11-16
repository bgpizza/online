const WA_NUMBER="918240266267";
// Bake & Grill fixed shop origin decoded from the supplied short Plus Code 96R9+8H,
// recovered against the previous nearby shop reference coordinate. Full Plus Code: 7MJC96R9+8H.
const STORE={lat:22.3908125,lon:88.2189375,plusCode:"7MJC96R9+8H",label:"Bake & Grill, 96R9+8H, Thakurpukur - Bibirhat - Bakhrahat - Raipur Rd, Bakhrahat, Sajua, Sanjua, West Bengal 743377, India",address:"96R9+8H, Thakurpukur - Bibirhat - Bakhrahat - Raipur Rd, Bakhrahat, Sajua, Sanjua, West Bengal 743377, India"};
const ROUTE_CACHE_PREFIX="bg_google_primary_route_v3_shop_origin_";
function routeCacheKey(lat,lon){return ROUTE_CACHE_PREFIX+Number(STORE.lat).toFixed(6)+"_"+Number(STORE.lon).toFixed(6)+"_"+Number(lat).toFixed(6)+"_"+Number(lon).toFixed(6);}
async function resolveStoreLocation(){return {lat:STORE.lat,lon:STORE.lon};}
const GOOGLE_MAPS_API_KEY="AIzaSyDInncTdHnbBl3jpN9yg5__L9N-nxc2pUc";
let googleMapsLoading=null;
window.gm_authFailure=()=>{
  const hint=document.getElementById("manualLocationHint");
  if(hint) hint.textContent="Google Maps authentication failed. Check API key, billing, Maps JavaScript API enablement and HTTP referrer restrictions.";
  setTimeout(()=>setManualSearchMessage("Google Maps authentication failed. Check the API key, billing, enabled APIs and website restrictions."),0);
};
function loadGoogleMaps(){
  if(window.google?.maps?.places) return Promise.resolve(window.google.maps);
  if(googleMapsLoading) return googleMapsLoading;
  googleMapsLoading=new Promise((resolve,reject)=>{
    const callbackName="__bgGoogleMapsReady";
    window[callbackName]=()=>{delete window[callbackName];resolve(window.google.maps);};
    const script=document.createElement("script");
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places&callback=${callbackName}&v=weekly`;
    script.async=true;script.defer=true;
    script.onerror=()=>{delete window[callbackName];googleMapsLoading=null;reject(new Error("Google Maps failed to load. Check API key, billing, enabled APIs and HTTP referrer restrictions."));};
    document.head.appendChild(script);
  });
  return googleMapsLoading;
}
function routeCacheKey(lat,lon){return ROUTE_CACHE_PREFIX+Number(STORE.lat).toFixed(6)+"_"+Number(STORE.lon).toFixed(6)+"_"+Number(lat).toFixed(6)+"_"+Number(lon).toFixed(6);}
async function resolveStoreLocation(){
  if(STORE.resolved)return {lat:STORE.lat,lon:STORE.lon};
  if(storeLocationPromise)return storeLocationPromise;
  storeLocationPromise=(async()=>{
    await loadGoogleMaps();
    const geocoder=googleGeocoder||new google.maps.Geocoder();
    const response=await geocoder.geocode({address:STORE.address,region:"IN"});
    const results=response?.results||[];
    const exact=results.find(r=>String(r.formatted_address||"").toLowerCase().includes("743377"))||results[0];
    const point=exact?.geometry?.location;
    const lat=typeof point?.lat==="function"?point.lat():Number(point?.lat);
    const lon=typeof point?.lng==="function"?point.lng():Number(point?.lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error("Google could not resolve the configured Bake & Grill shop address");
    STORE.lat=lat;STORE.lon=lon;STORE.resolved=true;
    console.info("Bake & Grill shop origin resolved from configured Plus Code address",{lat,lon,formattedAddress:exact.formatted_address});
    return {lat,lon};
  })().catch(error=>{storeLocationPromise=null;throw error;});
  return storeLocationPromise;
}
function getDeliveryRule(km){
  if(km<=1) return {minOrder:199,charge:0,label:"0–1 KM"};
  if(km<=3) return {minOrder:299,charge:0,label:"1.1–3 KM"};
  if(km<=8) return {minOrder:499,charge:0,label:"3.1–8 KM"};
  return null;
}
let cart=[], customerLocation=null, distanceKm=null, routeDurationMin=null, routeDistanceSource=null;
let stock={};
let liveMenu={};
let deliveryEnabled=true;
let searchQuery="";
let searchPriceMax=null;
let customerProfile=null;
let customerOtpConfirmation=null;
let customerRecaptchaVerifier=null;
let customerOtpVerified=false;
const CUSTOMER_PROFILE_KEY="bakeGrillCustomerProfile";
const $=s=>document.querySelector(s);
const money=n=>"₹"+Number(n).toLocaleString("en-IN");
const categoryOrder=["Veg Pizza","Chicken Pizza","Burgers","Veg Sandwich","Chicken Sandwich","Quick Bites","Family Combos","Bondhu Combos","Solo Combos"];
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
  document.getElementById("headerDeliveryLocation")?.addEventListener("click",()=>checkLocation("gps"));
  updateHeaderLocation();
  $("#closeManualLocation")?.addEventListener("click",()=>{
    if(document.body.classList.contains("location-required") || !customerLocation || !Number.isFinite(distanceKm)){setManualSearchMessage("Please select and confirm a delivery location before viewing the menu.");return;}
    document.getElementById("manualLocationModal")?.classList.remove("show");
  });
  $("#tryGpsAgain")?.addEventListener("click",()=>{document.getElementById("manualLocationModal")?.classList.remove("show");checkLocation("gps");});
  $("#manualSearchBtn")?.addEventListener("click",searchManualLocation);
  $("#manualDetectLocation")?.addEventListener("click",()=>{
    const btn=document.getElementById("manualDetectLocation");
    if(btn){btn.disabled=true;btn.textContent="Finding GPS location…";}
    setStatus("📍 Requesting precise GPS location permission…");
    checkLocation("gps");
  });

  $("#findAddressOnMap")?.addEventListener("click",()=>geocodeAddressToMap());
  ["addrArea","addrStreet","addrLandmark","addrPostOffice","addrPincode"].forEach(id=>{
    const field=document.getElementById(id);
    field?.addEventListener("change",()=>geocodeAddressToMap({silent:true}));
  });
  $("#manualLocationSearch")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();clearTimeout(locationSearchTimer);searchManualLocation();}});
  // Step 1 accepts ONLY a six-digit Indian PIN code. Search after all six digits are entered.
  $("#manualLocationSearch")?.addEventListener("input",e=>{
    e.target.value=(e.target.value||"").replace(/\D/g,"").slice(0,6);
    const value=e.target.value;
    clearTimeout(locationSearchTimer);
    manualSearchRequest++;
    const results=document.getElementById("manualSearchResults");
    const status=document.getElementById("manualSearchStatus");if(status){status.hidden=true;status.textContent="";}
    if(value.length!==6){if(results)results.innerHTML=value.length?'<div class="manual-search-message">Enter all 6 digits to find your delivery area.</div>':"";return;}
    if(results)results.innerHTML='<div class="manual-search-message">Searching delivery areas…</div>';
    locationSearchTimer=setTimeout(()=>searchManualLocation({silent:true}),350);
  });
  $("#manualResetMap")?.addEventListener("click",resetManualMapToShop);
  $("#manualChooseOnMap")?.addEventListener("click",()=>{
    const panel=document.getElementById("manualAddressPanel");if(panel)panel.hidden=false;
    revealManualMapStage();
    initManualMap().then(()=>{if(manualMap){manualMap.setCenter({lat:STORE.lat,lng:STORE.lon});manualMap.setZoom(15);}});
  });
  $("#confirmManualLocation")?.addEventListener("click",confirmManualLocation);
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
  // Request delivery location as soon as the website opens because minimum-order
  // value and delivery eligibility depend on the customer's road distance.
  const gateRetry=document.getElementById("locationGateRetry");
  if(gateRetry) gateRetry.onclick=()=>checkLocation("gps");
  const gateManual=document.getElementById("locationGateManual");
  if(gateManual) gateManual.onclick=()=>showManualLocation("Enter your delivery area or landmark, or move the map pin to your exact location.");
  $("#checkoutCheckLocation")?.addEventListener("click",()=>{
    $("#checkoutModal")?.classList.remove("show");
    showLocationChoice();
  });
  $("#trackLive")?.addEventListener("click",trackLiveStatus);
  // Automatically request GPS first. The browser permission prompt is shown;
  // if the customer denies it or GPS is unavailable, checkLocation opens manual entry.
  // While an order is active, keep the saved delivery location and do not ask for GPS again.
  const hasActiveOrder=!!localStorage.getItem("bakeGrillActiveOrder");
  const gate=document.getElementById("locationGate");
  const gateStatus=document.getElementById("locationGateStatus");
  if(hasActiveOrder){
    gate?.classList.remove("show");
    document.body.classList.remove("location-required");
  }else{
    if(gate){gate.classList.add("show");document.body.classList.add("location-required");}
    if(gateStatus)gateStatus.textContent="📍 Finding your delivery location. Please allow Location / GPS when your browser asks. If you deny, you can enter your PIN and choose the map pin manually.";
    const gateNetwork=document.getElementById("locationGateNetwork"); if(gateNetwork)gateNetwork.hidden=true;
    const gateManualButton=document.getElementById("locationGateManual"); if(gateManualButton)gateManualButton.hidden=true;
    const gateRetryButton=document.getElementById("locationGateRetry"); if(gateRetryButton)gateRetryButton.hidden=true;
    checkLocation("gps");
  }
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
function updateHeaderLocation(){
  const button=document.getElementById("headerDeliveryLocation");
  const label=document.getElementById("headerDeliveryText");
  const distanceLabel=document.getElementById("headerDeliveryDistance");
  if(!button||!label)return;
  if(customerLocation){
    const details=customerLocation.addressDetails||{};
    const area=details.area||customerLocation.fullAddress||customerLocation.label||"Selected delivery location";
    const pin=details.pincode?` • ${details.pincode}`:"";
    label.textContent=(String(area)+pin).slice(0,90);
    if(distanceLabel){
      const rule=Number.isFinite(distanceKm)?getDeliveryRule(distanceKm):null;
      distanceLabel.textContent=Number.isFinite(distanceKm)
        ? `🚚 Road distance ${distanceKm.toFixed(1)} km${rule?` • Min. order ${money(rule.minOrder)}`:" • Outside delivery area"}`
        : "Road distance not verified";
    }
    button.title=(customerLocation.fullAddress||String(area))+(Number.isFinite(distanceKm)?` • Road distance ${distanceKm.toFixed(1)} km`:"");
    button.setAttribute("aria-label","Change delivery location: "+(customerLocation.fullAddress||area)+(Number.isFinite(distanceKm)?`, road distance ${distanceKm.toFixed(1)} kilometres`:""));
  }else{
    label.textContent="Select Delivery Location";
    if(distanceLabel)distanceLabel.textContent="Area • PIN code • Road distance";
    button.title="Select your delivery location to view the menu";
    button.setAttribute("aria-label","Select delivery location");
  }
}
function updateDeliveryUI(){
  updateHeaderLocation();
  const el=document.getElementById("deliveryBanner");
  if(el){ el.textContent=deliveryEnabled?"🚚 Delivery is ON":"⛔ Delivery is currently OFF"; el.className="delivery-banner "+(deliveryEnabled?"on":"off"); }
  const btn=document.getElementById("checkoutBtn"); if(btn){ btn.disabled=!deliveryEnabled; btn.title=deliveryEnabled?"":"Delivery is currently unavailable"; }
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
    if(x.category==="Add-ons")return;
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
  document.querySelectorAll(".add").forEach(b=>b.onclick=e=>{e.stopPropagation();openCustomize(b.dataset.id)});
  document.querySelectorAll(".qty-inline").forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    const id=b.dataset.id, delta=Number(b.dataset.delta||0);
    if(delta<0) removeOneProduct(id); else openCustomize(id);
  });
  document.querySelectorAll(".product-click-card").forEach(card=>{card.onclick=e=>{if(e.target.closest(".qty-inline"))return;openCustomize(card.dataset.id)};card.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openCustomize(card.dataset.id)}}});
}
function cartQty(id,size=""){
  const found=cart.find(i=>i.key===id+"|"+size);
  return found?found.qty:0;
}
function productCartQty(id){
  return cart.filter(i=>i.id===id).reduce((sum,i)=>sum+Number(i.qty||0),0);
}
function productQtyControl(id,label="ADD"){
  const qty=productCartQty(id);
  const safeId=escHtml(id);
  if(!qty) return `<button class="add" data-id="${safeId}">${label}</button>`;
  return `<div class="inline-qty product-inline-qty" data-product-id="${safeId}" aria-label="${qty} item${qty===1?"":"s"} in cart">
    <button type="button" class="qty-inline" data-id="${safeId}" data-delta="-1" aria-label="Remove one ${safeId}">−</button>
    <span class="inline-qty-number">${qty}</span>
    <button type="button" class="qty-inline" data-id="${safeId}" data-delta="1" aria-label="Add one ${safeId}">+</button>
  </div>`;
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
function removeOneProduct(id){
  const index=cart.map(i=>i.id===id).lastIndexOf(true);
  if(index<0)return;
  const item=cart[index];
  item.qty=Number(item.qty||1)-1;
  if(item.qty<=0) cart.splice(index,1);
  renderCart();
}
function card(x){
  const badge=x.badge || (x.bestChoice?"BEST CHOICE":"");
  const badgeHtml=badge?`<span class="item-badge">⭐ ${escHtml(badge)}</span>`:"";
  const minPrice=x.type==="pizza"?Math.min(...Object.values(x.prices||{}).map(Number)):(x.price==="Ask"?null:Number(x.price||0));
  const priceText=minPrice===null?"Price on request":`From ${money(minPrice)}`;
  return `<article class="card product-click-card" data-id="${escHtml(x.id)}" role="button" tabindex="0"><div class="card-img">${x.image?`<img src="${escHtml(x.image)}" alt="${escHtml(x.name)}" loading="lazy" decoding="async" fetchpriority="low">`:(emoji[x.category]||"🍽️")}${badgeHtml}</div><div class="card-body"><div class="code">CODE ${x.id}</div><div class="name">${escHtml(x.name)}</div><div class="desc">${x.description?escHtml(x.description):escHtml(x.category)}</div><div class="price-row"><span class="price">${priceText}</span>${productQtyControl(x.id)}</div></div></article>`;
}
let customizeState={id:null,qty:1,size:null,extras:[]};
const ADDON_SIZE_PRICES={"Black Olive Bondhu":35.0,"Black Olive Ekla":20.0,"Black Olive Family":55.0,"Capsicum Bondhu":30.0,"Capsicum Ekla":15.0,"Capsicum Family":45.0,"Cheese Bondhu":60.0,"Cheese Burst Bondhu":90.0,"Cheese Burst Family":150.0,"Cheese Ekla":30.0,"Cheese Family":90.0,"Chicken Bondhu":50.0,"Chicken Ekla":25.0,"Chicken Family":75.0,"Corn Bondhu":30.0,"Corn Ekla":15.0,"Corn Family":45.0,"Jalapeno Bondhu":35.0,"Jalapeno Ekla":20.0,"Jalapeno Family":55.0,"Mushroom Bondhu":35.0,"Mushroom Ekla":20.0,"Mushroom Family":55.0,"Onion Bondhu":30.0,"Onion Ekla":15.0,"Onion Family":45.0,"Paneer Bondhu":40.0,"Paneer Ekla":20.0,"Paneer Family":60.0,"Sausage Bondhu":50.0,"Sausage Ekla":25.0,"Sausage Family":75.0,"Tomato Bondhu":30.0,"Tomato Ekla":15.0,"Tomato Family":45.0};
function getAddons(){return getMenuItems().filter(x=>x.category==="Add-ons" && isInStock(x.id));}
function isSandwichOrBurger(x){return ["Burgers","Veg Sandwich","Chicken Sandwich"].includes(x?.category);}
function addonBaseName(name){return String(name||"").replace(/\b(Ekla|Bondhu|Family)(?:\s+Bite)?\b/ig,"").replace(/\s+/g," ").trim();}
const ADDON_ID_BASES={
  A1:"Cheese", A2:"Cheese", A3:"Cheese", A4:"Cheese Burst",
  A5:"Paneer", A6:"Chicken", A7:"Sausage", A8:"Capsicum", A9:"Onion",
  A10:"Corn", A11:"Tomato", A12:"Black Olive", A13:"Jalapeno", A14:"Mushroom"
};
function addonCanonicalBase(a){
  const id=String(a?.id||"");
  if(ADDON_ID_BASES[id]) return ADDON_ID_BASES[id];
  let n=String(a?.name||"").trim();
  n=n.replace(/\b(Ekla|Bondhu|Family)(?:\s+Bite)?\b/ig,"").replace(/—/g," ").replace(/\s+/g," ").trim();
  n=n.replace(/^Extra Cheese$/i,"Cheese").replace(/^Sweet Corn$/i,"Corn").replace(/^Black Olives?$/i,"Black Olive").replace(/^Jalape[nñ]os?$/i,"Jalapeno").replace(/^Chicken Chunks$/i,"Chicken").replace(/^Chicken Sausage$/i,"Sausage").replace(/^Paneer Cubes$/i,"Paneer");
  return n;
}
function addonMatchesSize(a,size){
  const n=String(a?.name||"").toLowerCase();
  if(!size) return true;
  // Cheese Burst has no Ekla price in the price list: only Bondhu + Family.
  if(String(a?.id||"")==="A4" || /cheese burst/i.test(n)){
    return size!=="Ekla Bite";
  }
  if(n.includes("ekla")) return size==="Ekla Bite";
  if(n.includes("bondhu")) return size==="Bondhu Bite";
  if(n.includes("family")) return size==="Family Bite";
  const base=addonCanonicalBase(a).toLowerCase();
  return !!base;
}
function addonPriceForSize(a,size){
  if(!a) return "Ask";
  const base=addonCanonicalBase(a);
  const wanted=size?.replace(/ Bite$/i,"");
  if(!wanted) return a?.price;
  // Exact Excel price table lookup by canonical topping + pizza size.
  const key=Object.keys(ADDON_SIZE_PRICES).find(k=>
    addonBaseName(k).toLowerCase()===base.toLowerCase() &&
    k.toLowerCase().includes(String(wanted).toLowerCase())
  );
  if(key) return ADDON_SIZE_PRICES[key];
  if(a?.prices && typeof a.prices==="object") return a.prices[size];
  if(a?.sizePrices && typeof a.sizePrices==="object") return a.sizePrices[size];
  return a?.price;
}
function getCustomizeExtras(x){
  if(x?.type==="pizza" || x?.prices) return getAddons().filter(a=>addonMatchesSize(a,customizeState.size));
  if(isSandwichOrBurger(x)) return [{id:"__extra_cheese_20",name:"Extra Cheese",price:20,type:"special"}];
  return [];
}
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
  const addons=getCustomizeExtras(x);
  const extrasTitle=(x.type==="pizza" || x.prices)?"Extra Toppings":"Extras";
  const extrasHint=(x.type==="pizza" || x.prices)?"Select what you want to add":"Add extra cheese for ₹20";
  const sizeBlock=x.type==="pizza"?`<section class="customize-group"><h3>Size</h3><p>Required • Select 1 option</p><div class="customize-options">${Object.entries(x.prices||{}).map(([size,price])=>`<label class="customize-option radio"><span><b>${escHtml(size.replace(" Bite",""))}</b><small>${money(price)}</small></span><input type="radio" name="customSize" value="${escHtml(size)}" ${customizeState.size===size?"checked":""}></label>`).join("")}</div></section>`:"";
  const extrasBlock=addons.length?`<section class="customize-group"><h3>${extrasTitle}</h3><p>${extrasHint}${x.type==="pizza"&&customizeState.size?` • ${escHtml(customizeState.size)}`:""}</p><div class="customize-options">${addons.map(a=>{const checked=customizeState.extras.includes(a.id);const ap=addonPriceForSize(a,customizeState.size);const pr=ap==="Ask"?"Price on request":(typeof ap==="number"?money(ap):"Price on request");return `<label class="customize-option check"><span><b>${escHtml(a.name)}</b><small>${pr}</small></span><input type="checkbox" value="${escHtml(a.id)}" ${checked?"checked":""}></label>`}).join("")}</div></section>`:"";
  $("#customizeBody").innerHTML=sizeBlock+extrasBlock;
  $("#customizeQty").textContent=customizeState.qty;
  document.querySelectorAll('input[name="customSize"]').forEach(el=>el.onchange=()=>{customizeState.size=el.value;customizeState.extras=customizeState.extras.filter(id=>{if(id==="__extra_cheese_20")return true;const a=getAddons().find(v=>v.id===id);return addonMatchesSize(a,customizeState.size)});renderCustomizeSheet()});
  document.querySelectorAll('#customizeBody input[type="checkbox"]').forEach(el=>el.onchange=()=>{customizeState.extras=[...document.querySelectorAll('#customizeBody input[type="checkbox"]:checked')].map(v=>v.value);updateCustomizeTotal()});
  updateCustomizeTotal();
}
function customizeBasePrice(x){return x.type==="pizza"?Number(x.prices?.[customizeState.size]||0):Number(x.price||0);}
function customizeExtraPrice(id){if(id==="__extra_cheese_20")return 20;const a=getAddons().find(x=>x.id===id);const ap=addonPriceForSize(a,customizeState.size);return a&&typeof ap==="number"?Number(ap):0;}
function updateCustomizeTotal(){const x=getMenuItems().find(i=>i.id===customizeState.id);if(!x)return;const total=(customizeBasePrice(x)+customizeState.extras.reduce((s,id)=>s+customizeExtraPrice(id),0))*customizeState.qty;$("#customizeQty").textContent=customizeState.qty;$("#customizeAdd").textContent=`Add item ${money(total)}`;}
function commitCustomizedItem(){
  const x=getMenuItems().find(i=>i.id===customizeState.id); if(!x)return;
  const size=customizeState.size||"";
  const extras=customizeState.extras.map(id=>{if(id==="__extra_cheese_20")return {id,name:"Extra Cheese",price:20,priceOnRequest:false};const a=getAddons().find(v=>v.id===id);const ap=addonPriceForSize(a,customizeState.size);return {id,name:a?.name||id,price:typeof ap==="number"?Number(ap):0,priceOnRequest:ap==="Ask"}});
  const base=customizeBasePrice(x), extra=extras.reduce((s,e)=>s+e.price,0), unit=base+extra;
  const key=x.id+"|"+size+"|"+extras.map(e=>e.id).sort().join(",");
  const found=cart.find(i=>i.key===key);
  if(found){
    found.qty+=customizeState.qty;
    found.basePrice=base;
  } else {
    cart.push({key,id:x.id,name:x.name,size,basePrice:base,price:unit,qty:customizeState.qty,extras});
  }
  renderCart(); closeCustomize();
}
function addItem(id,size){openCustomize(id);}
function changeMenuQty(id,size,d){openCustomize(id);}

function renderCart(){
  // Keep a permanent base price so removing an add-on can never leave its old price behind.
  cart.forEach(i=>{
    const extras=Array.isArray(i.extras)?i.extras:[];
    const extrasTotal=extras.reduce((sum,e)=>sum+Number(e.price||0)*Math.max(1,Number(e.qty||1)),0);
    if(!Number.isFinite(Number(i.basePrice))) i.basePrice=Math.max(0,Number(i.price||0)-extrasTotal);
    i.price=Number(i.basePrice||0)+extrasTotal;
  });
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
  $("#cartItems").innerHTML=cart.length?`<div class="cart-list">${cart.map((i,idx)=>{const extras=Array.isArray(i.extras)?i.extras:[];extras.forEach(e=>{e.qty=Math.max(1,Number(e.qty||1));});const extrasTotal=extras.reduce((s,e)=>s+Number(e.price||0)*Number(e.qty||1),0);const basePrice=Math.max(0,Number(i.price||0)-extrasTotal);return `<div class="cart-line"><div><div class="cart-name">${escHtml(i.name)}</div><div class="cart-meta">${i.size?escHtml(i.size)+" • ":""}${money(basePrice)} base price</div>${extras.length?`<div class="cart-addons"><div class="cart-addons-title">＋ Add-ons <span>Adjust quantity or remove</span></div>${extras.map((e,ei)=>`<div class="cart-addon-row"><div class="cart-addon-info"><span>${escHtml(e.name)}</span><b>+${money(Number(e.price||0)*Number(e.qty||1))}</b><small>${money(Number(e.price||0))} each</small></div><div class="cart-addon-controls"><button type="button" aria-label="Decrease ${escHtml(e.name)}" onclick="changeAddonQty(${idx},${ei},-1)">−</button><span>${Number(e.qty||1)}</span><button type="button" aria-label="Increase ${escHtml(e.name)}" onclick="changeAddonQty(${idx},${ei},1)">+</button><button type="button" class="cart-addon-remove" aria-label="Remove ${escHtml(e.name)}" onclick="removeAddon(${idx},${ei})">×</button></div></div>`).join("")}</div>`:""}<div class="cart-item-total">Item total: <b>${money(i.price)}</b></div></div><div class="qty"><button onclick="changeQty(${idx},-1)">−</button><span>${i.qty}</span><button onclick="changeQty(${idx},1)">+</button></div></div>`}).join("")}</div>`:`<div class="empty-cart"><div class="empty-cart-icon">🛒</div><strong>Your cart is empty</strong><p>Add your favourite items and tap the cart below to place your order.</p></div>`;
  const info=rule?`📍 ${distanceKm.toFixed(1)} KM • Minimum order ${money(rule.minOrder)} • 🚚 FREE`:(distanceKm!==null?"❌ No delivery above 8 KM":"📍 Calculating location…");
  const oldInfo=document.getElementById("cartRuleInfo"); if(oldInfo) oldInfo.textContent=info; $("#cartTotal").textContent=money(total);
  const activeCat=document.querySelector(".cat.active")?.dataset.cat||"all";
  if(document.getElementById("menu")) renderMenu(activeCat);
}
function recalcCartItemPrice(i){
  const item=cart[i];
  if(!item)return;
  const extras=Array.isArray(item.extras)?item.extras:[];
  extras.forEach(e=>{e.qty=Math.max(1,Number(e.qty||1));});
  const extrasTotal=extras.reduce((s,e)=>s+Number(e.price||0)*Number(e.qty||1),0);
  if(!Number.isFinite(Number(item.basePrice))) item.basePrice=Math.max(0,Number(item.price||0)-extrasTotal);
  item.price=Number(item.basePrice||0)+extrasTotal;
}
function changeQty(i,d){if(!cart[i])return;cart[i].qty+=d;if(cart[i].qty<=0)cart.splice(i,1);renderCart()}
function changeAddonQty(itemIdx,addonIdx,d){
  const item=cart[itemIdx], e=item?.extras?.[addonIdx];
  if(!e)return;
  if(!Number.isFinite(Number(item.basePrice))){
    const oldExtrasTotal=(item.extras||[]).reduce((s,a)=>s+Number(a.price||0)*Math.max(1,Number(a.qty||1)),0);
    item.basePrice=Math.max(0,Number(item.price||0)-oldExtrasTotal);
  }
  e.qty=Math.max(1,Number(e.qty||1)+d);
  recalcCartItemPrice(itemIdx);
  renderCart();
}
function removeAddon(itemIdx,addonIdx){
  const item=cart[itemIdx];
  if(!item?.extras?.[addonIdx])return;
  // Capture the pizza base price before removing the add-on. Example: ₹199 -> ₹169.
  if(!Number.isFinite(Number(item.basePrice))){
    const oldExtrasTotal=(item.extras||[]).reduce((s,a)=>s+Number(a.price||0)*Math.max(1,Number(a.qty||1)),0);
    item.basePrice=Math.max(0,Number(item.price||0)-oldExtrasTotal);
  }
  item.extras.splice(addonIdx,1);
  recalcCartItemPrice(itemIdx);
  renderCart();
}
function openCart(){$("#cartDrawer").classList.add("open");$("#overlay").classList.add("show");document.body.classList.add("cart-open")}
function closeCart(){$("#cartDrawer").classList.remove("open");$("#overlay").classList.remove("show");document.body.classList.remove("cart-open")}
async function getRoadRoute(lat,lon){
  lat=Number(lat);lon=Number(lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new Error("Invalid delivery coordinates");
  // Use the fixed Bake & Grill Plus Code coordinates before distance or cache lookup.
  // Cache key includes both origin and destination so previous 6.4 km results cannot be reused.
  const key=routeCacheKey(lat,lon);
  try{const cached=JSON.parse(sessionStorage.getItem(key)||"null");if(cached&&Date.now()-cached.t<10*60*1000&&Number.isFinite(cached.v?.distanceKm))return cached.v;}catch(e){}
  const R=6371,p1=STORE.lat*Math.PI/180,p2=lat*Math.PI/180,dp=(lat-STORE.lat)*Math.PI/180,dl=(lon-STORE.lon)*Math.PI/180;
  const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  const straight=R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  // Only reject clearly distant pins early. The actual 8 km decision is made from road distance below.
  if(straight>12)return {distanceKm:null,durationMin:null,fastRejected:true,straightKm:straight,outsideArea:true};

  const routeErrors=[];

  // PRIMARY: Google Routes API. Try Google's driving route first as requested.
  // Requires Routes API enabled, billing active, and HTTP-referrer restrictions
  // that allow the deployed GitHub Pages origin.
  try{
    await loadGoogleMaps();
    const routesLib=await google.maps.importLibrary("routes");
    const Route=routesLib?.Route;
    if(!Route?.computeRoutes)throw new Error("Google Routes library is unavailable");
    const response=await Route.computeRoutes({
      origin:{lat:STORE.lat,lng:STORE.lon},
      destination:{lat, lng:lon},
      travelMode:"DRIVING",
      routingPreference:"TRAFFIC_UNAWARE",
      fields:["distanceMeters","durationMillis"]
    });
    const route=response?.routes?.[0];
    const meters=Number(route?.distanceMeters),millis=Number(route?.durationMillis);
    if(!Number.isFinite(meters)||meters<=0)throw new Error("Google Routes returned no drivable route");
    const v={distanceKm:meters/1000,durationMin:Number.isFinite(millis)?millis/60000:0,source:"Google Routes"};
    try{sessionStorage.setItem(key,JSON.stringify({t:Date.now(),v}));}catch(e){}
    return v;
  }catch(e){
    routeErrors.push(`Google Routes (primary): ${e?.message||e}`);
    console.warn("Google road routing failed; trying OpenStreetMap fallback.",e);
  }

  // FALLBACK: public road-routing providers, only when Google cannot return a route.
  const coords=`${STORE.lon},${STORE.lat};${lon},${lat}`;
  const osrmHosts=[
    "https://router.project-osrm.org/route/v1/driving/",
    "https://routing.openstreetmap.de/routed-car/route/v1/driving/"
  ];
  for(const host of osrmHosts){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const url=`${host}${coords}?overview=false&alternatives=false&steps=false`;
      const response=await fetch(url,{method:"GET",mode:"cors",cache:"no-store",headers:{Accept:"application/json"},signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      const route=data?.code==="Ok"?data.routes?.[0]:null;
      const meters=Number(route?.distance),seconds=Number(route?.duration);
      if(!route||!Number.isFinite(meters)||meters<=0)throw new Error(data?.message||"No drivable road route returned");
      const v={distanceKm:meters/1000,durationMin:Number.isFinite(seconds)?seconds/60:0,source:host.includes("project-osrm")?"OSRM fallback":"OSM routing fallback"};
      try{sessionStorage.setItem(key,JSON.stringify({t:Date.now(),v}));}catch(e){}
      return v;
    }catch(e){routeErrors.push(`${host.includes("project-osrm")?"OSRM":"OSM backup"}: ${e?.name==="AbortError"?"timeout":e?.message||e}`);}
    finally{clearTimeout(timeout);}
  }

  console.error("Google and fallback road-distance providers failed",{lat,lon,store:STORE,straightKm:straight,routeErrors});
  throw new Error("Google could not calculate the road route and backup road-routing services also failed. Check Google Routes API, billing, website restrictions and internet connection, then retry.");
}

let manualMap=null, manualMarker=null, manualSelected=null, locationWatch=null, locationSearchTimer=null, gpsFallbackTimer=null, gpsRequestToken=0, googleGeocoder=null;
let manualSearchRequest=0, manualReverseTimer=null, manualPinTouched=false, manualAddressTimer=null;
const MANUAL_SEARCH_RADIUS=0.075; // approx. 8 km around the shop, geographic search box
function hideLocationGate(){
  const gate=document.getElementById("locationGate");
  if(gate) gate.classList.remove("show");
  // Keep the storefront locked until a valid delivery point is confirmed.
}
function releaseLocationGate(){
  if(!customerLocation || !Number.isFinite(distanceKm)) return;
  updateHeaderLocation();
  document.body.classList.remove("location-required");
  const modal=document.getElementById("manualLocationModal");
  if(modal) modal.classList.remove("show");
}
function showManualLocation(reason){
  hideLocationGate();
  const modal=document.getElementById("manualLocationModal");
  if(modal) modal.classList.add("show");
  const message=reason||"Please select your delivery location manually.";
  setStatus("📍 " + message,"bad");
  const input=document.getElementById("manualLocationSearch");
  if(input){setTimeout(()=>input.focus(),80);}
  const hint=document.getElementById("manualLocationHint");
  if(hint) hint.textContent=message+" Search your 6-digit PIN code, choose the matching area, enter your address, then tap or drag the pin to your exact home or delivery gate.";
}
function setManualSearchMessage(message){
  // Keep the status message separate so it never replaces the actual PIN suggestions.
  const el=document.getElementById("manualSearchStatus");
  if(el){el.textContent=String(message||"");el.hidden=!message;}
}
function revealManualMapStage(){
  const stage=document.getElementById("manualMapStage");
  if(stage)stage.hidden=false;
  const fallback=document.getElementById("manualChooseOnMap");
  if(fallback)fallback.hidden=true;
  requestAnimationFrame(()=>stage?.scrollIntoView({behavior:"smooth",block:"nearest"}));
}
function showManualMapFallback(message){
  const el=document.getElementById("manualSearchResults");
  if(!el)return;
  el.innerHTML=`<div class="manual-search-message">${escHtml(message)}</div>`;
  const button=document.createElement("button");
  button.type="button";button.className="manual-map-fallback";button.textContent="Choose your exact location on map";
  button.addEventListener("click",()=>{
    const panel=document.getElementById("manualAddressPanel");if(panel)panel.hidden=false;
    revealManualMapStage();
    initManualMap().then(()=>{if(manualMap){manualMap.setCenter({lat:STORE.lat,lng:STORE.lon});manualMap.setZoom(15);}});
  });
  el.appendChild(button);
}
function setManualPoint(lat,lon,label=""){
  // A newly moved/searched pin invalidates the previous delivery selection until re-confirmed.
  customerLocation=null; distanceKm=null; routeDurationMin=null;
  manualSelected={lat:Number(lat),lon:Number(lon),accuracy:null,label,addressDetails:{}};
  renderCart();
  if(manualMarker) manualMarker.position={lat:manualSelected.lat,lng:manualSelected.lon};
  if(manualMap) { manualMap.setCenter({lat:manualSelected.lat,lng:manualSelected.lon}); manualMap.setZoom(17); }
  const results=document.getElementById("manualSearchResults");
  if(results) results.innerHTML="";
  const panel=document.getElementById("manualAddressPanel"); if(panel)panel.hidden=false;
  const confirmButton=document.getElementById("confirmManualLocation");if(confirmButton)confirmButton.hidden=false;
  updateManualHint(label);
}
async function initManualMap(){
  const hint=document.getElementById("manualLocationHint");
  try{const maps=await loadGoogleMaps();
    const start=manualSelected||customerLocation||{lat:STORE.lat,lon:STORE.lon};
    if(!manualMap){
      manualMap=new maps.Map(document.getElementById("manualMap"),{center:{lat:start.lat,lng:start.lon},zoom:18,minZoom:14,maxZoom:21,mapId:"DEMO_MAP_ID",mapTypeControl:true,mapTypeControlOptions:{style:maps.MapTypeControlStyle.DROPDOWN_MENU,mapTypeIds:["roadmap","satellite","hybrid"]},streetViewControl:false,fullscreenControl:true,clickableIcons:false,gestureHandling:"greedy"});
      const {AdvancedMarkerElement}=await maps.importLibrary("marker");
      manualMarker=new AdvancedMarkerElement({position:{lat:start.lat,lng:start.lon},map:manualMap,title:"Drag this pin to your exact home or delivery gate",gmpDraggable:true});
      manualMarker.gmpDraggable=true;
      googleGeocoder=new maps.Geocoder();
      // AdvancedMarkerElement's current drag event name is gmp-dragend.
      manualMarker.addEventListener("gmp-dragend",()=>{
        const p=manualMarker.position;
        const lat=typeof p.lat==="function"?p.lat():p.lat;
        const lng=typeof p.lng==="function"?p.lng():p.lng;
        if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng)))return;
        manualPinTouched=true;
        setManualPoint(Number(lat),Number(lng));
        const hint=document.getElementById("manualLocationHint");if(hint)hint.textContent="Pin moved to your selected point. Checking the nearest road and address details…";
        reverseGeocodeManualPoint(Number(lat),Number(lng));
      });
      // Tapping anywhere on the map moves the delivery pin to that exact point.
      manualMap.addListener("click",e=>{
        if(!e?.latLng)return;
        const lat=e.latLng.lat(),lng=e.latLng.lng();
        manualPinTouched=true;
        setManualPoint(lat,lng);
        const hint=document.getElementById("manualLocationHint");if(hint)hint.textContent="Map point selected. Checking the nearest road and address details…";
        reverseGeocodeManualPoint(lat,lng);
      });
    }else{manualMap.setCenter({lat:start.lat,lng:start.lon});manualMap.setZoom(manualSelected||customerLocation?17:15);manualMarker.position={lat:start.lat,lng:start.lon};setTimeout(()=>maps.event.trigger(manualMap,"resize"),100);}
    if(manualSelected||customerLocation){manualSelected=manualSelected||{lat:start.lat,lon:start.lon,accuracy:null};updateManualHint(manualSelected.label||"");}
    else if(hint)hint.textContent="Map centred near Bake & Grill. The shop marker is not your delivery address—search or tap/drag to your own location.";
  }catch(e){if(hint)hint.textContent="Google Map could not load. Check the Google Maps API key, billing, enabled APIs and website restrictions. You can still retry.";setManualSearchMessage("Google Maps unavailable. Please check API setup and reload the page.");}
}
function updateManualHint(label=""){
  const h=document.getElementById("manualLocationHint");
  if(!h||!manualSelected)return;
  h.textContent=`📍 Selected: ${label||manualSelected.label||"Map pin location"} • ${manualSelected.lat.toFixed(5)}, ${manualSelected.lon.toFixed(5)}. Drag the pin to fine-tune.`;
}
function fillAddressField(id,value){const el=document.getElementById(id);if(el && value && !el.dataset.edited)el.value=value;}
function markAddressFieldsEdited(){document.querySelectorAll("#manualAddressPanel input, #manualAddressPanel textarea").forEach(el=>el.addEventListener("input",()=>{el.dataset.edited="1";}));}
function addressFromGeocode(address={}){
  const area=address.neighbourhood||address.suburb||address.village||address.hamlet||address.town||address.city_district||address.city||address.county||"";
  return {
    house:address.house_number||"",street:address.road||address.pedestrian||address.residential||"",area,
    landmark:address.amenity||address.building||"",postOffice:address.post_office||address.postal_town||"",
    pincode:address.postcode||""
  };
}
document.addEventListener("input",e=>{if(e.target?.closest?.("#manualAddressPanel"))e.target.dataset.edited="1";});
function collectManualAddress(){
  const value=id=>String(document.getElementById(id)?.value||"").trim();
  const details={area:value("addrArea"),street:value("addrStreet"),landmark:value("addrLandmark"),postOffice:value("addrPostOffice"),pincode:value("addrPincode")};
  details.fullAddress=formatManualAddress(details);
  return details;
}
function formatManualAddress(a={}){
  return [a.area,a.street,a.landmark,a.postOffice].filter(Boolean).join(", ");
}
async function geocodeAddressToMap(options={}){
  clearTimeout(manualAddressTimer);
  if(options.debounce){
    manualAddressTimer=setTimeout(()=>geocodeAddressToMap({silent:true}),900);
    return;
  }
  const a=collectManualAddress();
  if(!a.area || !/^\d{6}$/.test(a.pincode||"")){
    if(!options.silent)setManualSearchMessage("Enter Area / Village and a valid 6-digit PIN code first. Then find the address on the map.");
    return;
  }
  const query=[a.street,a.landmark,a.area,a.postOffice,a.pincode,"India"].filter(Boolean).join(", ");
  const button=document.getElementById("findAddressOnMap");
  if(button){button.disabled=true;button.textContent="Finding address…";}
  const hint=document.getElementById("manualLocationHint");
  if(hint)hint.textContent="Finding the entered address on the map. Please wait…";
  try{
    const maps=await loadGoogleMaps();
    googleGeocoder=googleGeocoder||new maps.Geocoder();
    const response=await googleGeocoder.geocode({address:query,componentRestrictions:{country:"IN"},region:"IN"});
    const results=response.results||[];
    const pinMatch=results.find(r=>{
      const c=(r.address_components||[]).find(x=>x.types.includes("postal_code"));
      return !c || c.long_name.replace(/\D/g,"")===a.pincode;
    })||results[0];
    const point=pinMatch?.geometry?.location;
    if(!point)throw new Error("No matching address found");
    const lat=typeof point.lat==="function"?point.lat():point.lat;
    const lng=typeof point.lng==="function"?point.lng():point.lng;
    if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng)))throw new Error("Invalid map coordinates");
    setManualPoint(Number(lat),Number(lng),pinMatch.formatted_address||query);
    manualPinTouched=false; // Address lookup only finds the neighbourhood; customer must refine exact home pin.
    revealManualMapStage();
    await initManualMap();
    if(manualMap){manualMap.setCenter({lat:Number(lat),lng:Number(lng)});manualMap.setZoom(19);}
    if(manualMarker)manualMarker.position={lat:Number(lat),lng:Number(lng)};
    const mapHint=document.getElementById("manualLocationHint");
    if(mapHint)mapHint.textContent="Address found approximately. Please drag the pin to your exact house or delivery gate, or tap the exact point on the map. The address text will be preserved.";
    const confirm=document.getElementById("confirmManualLocation");if(confirm)confirm.hidden=false;
  }catch(error){
    console.warn("Address-to-map lookup failed:",error);
    if(!options.silent)setManualSearchMessage("Could not find that exact address. Check the area, street and PIN code, or use the map to choose the point manually.");
    if(hint)hint.textContent="Address not found exactly. You can still zoom the map and tap or drag the pin to your home.";
  }finally{
    if(button){button.disabled=false;button.textContent="Find this address on map";}
  }
}

async function reverseGeocodeManualPoint(lat,lon){
  clearTimeout(manualReverseTimer);
  manualReverseTimer=setTimeout(async()=>{
    try{const maps=await loadGoogleMaps();googleGeocoder=googleGeocoder||new maps.Geocoder();
      const response=await googleGeocoder.geocode({location:{lat:Number(lat),lng:Number(lon)}});
      const result=response.results?.[0];if(!result)return;
      if(manualSelected&&Math.abs(manualSelected.lat-lat)<0.00002&&Math.abs(manualSelected.lon-lon)<0.00002){
        manualSelected.label=result.formatted_address||manualSelected.label||"";
        const components=result.address_components||[];const get=(types)=>components.find(c=>types.some(t=>c.types.includes(t)))?.long_name||"";
        const a={house:get(["street_number","premise","subpremise"]),street:get(["route","street_address","intersection"]),area:get(["sublocality_level_1","sublocality","neighborhood","locality","administrative_area_level_3"]),landmark:get(["point_of_interest","establishment","premise"]),postOffice:get(["postal_town","postal_code"]),pincode:get(["postal_code"])};
        manualSelected.addressDetails=a;fillAddressField("addrArea",a.area);fillAddressField("addrStreet",a.street);fillAddressField("addrLandmark",a.landmark);fillAddressField("addrPostOffice",a.postOffice);fillAddressField("addrPincode",a.pincode);
        const panel=document.getElementById("manualAddressPanel");if(panel)panel.hidden=false;updateManualHint(manualSelected.label);
      }
    }catch(e){/* Customer can enter address manually if Google reverse geocoding has no match. */}
  },500);
}

async function searchManualLocation(options={}){
  const input=document.getElementById("manualLocationSearch"),q=(input?.value||"").trim();
  if(!/^\d{6}$/.test(q)){
    if(!options.silent)setManualSearchMessage("Please enter a valid 6-digit Indian PIN code.");
    return;
  }
  const requestId=++manualSearchRequest,btn=document.getElementById("manualSearchBtn"),results=document.getElementById("manualSearchResults");
  if(btn){btn.disabled=true;btn.textContent="Searching…";}
  if(results)results.innerHTML="";
  setManualSearchMessage(`Finding all post offices and nearby localities for PIN code ${q}…`);
  try{
    // A PIN can cover several post offices. Read the full postal-office list first,
    // rather than relying on Google's single postal-code geocoder result.
    let offices=[];
    let postalResponse;
    try{
      const response=await fetch(`https://api.postalpincode.in/pincode/${encodeURIComponent(q)}`,{method:"GET",headers:{Accept:"application/json"}});
      if(!response.ok)throw new Error(`Postal lookup HTTP ${response.status}`);
      postalResponse=await response.json();
      const record=Array.isArray(postalResponse)?postalResponse[0]:postalResponse;
      if(record?.Status==="Success"&&Array.isArray(record.PostOffice)){
        offices=record.PostOffice.filter(o=>o&&o.Name).map(o=>({
          name:String(o.Name).trim(),
          branch:String(o.BranchType||"Post Office"),
          delivery:String(o.DeliveryStatus||""),
          district:String(o.District||""),
          state:String(o.State||""),
          region:String(o.Region||""),
          pincode:q
        }));
      }
    }catch(postalError){
      console.warn("Postal office lookup unavailable; using Google Geocoder fallback:",postalError);
    }
    if(requestId!==manualSearchRequest)return;
    // De-duplicate by office name + district, preserving all distinct delivery areas.
    const officeSeen=new Set();
    offices=offices.filter(o=>{
      const key=`${o.name.toLowerCase()}|${o.district.toLowerCase()}`;
      if(officeSeen.has(key))return false;
      officeSeen.add(key);return true;
    });
    if(!offices.length){
      const maps=await loadGoogleMaps();
      googleGeocoder=googleGeocoder||new maps.Geocoder();
      let response=await googleGeocoder.geocode({componentRestrictions:{country:"IN",postalCode:q},region:"IN"});
      if(requestId!==manualSearchRequest)return;
      let matches=response.results||[];
      if(!matches.length){
        response=await googleGeocoder.geocode({address:`${q}, India`,region:"IN"});
        if(requestId!==manualSearchRequest)return;
        matches=response.results||[];
      }
      offices=matches.map(r=>{
        const c=r.address_components||[];
        const get=types=>c.find(x=>types.some(t=>x.types.includes(t)))?.long_name||"";
        const pin=get(["postal_code"]);
        if(pin&&pin.replace(/\D/g,"")!==q)return null;
        const name=get(["postal_town","sublocality_level_1","sublocality","neighborhood","locality","administrative_area_level_3"])||r.formatted_address||`PIN ${q}`;
        return {name,branch:"Locality",delivery:"",district:get(["administrative_area_level_2"]),state:get(["administrative_area_level_1"]),pincode:q,formattedAddress:r.formatted_address};
      }).filter(Boolean);
    }
    if(requestId!==manualSearchRequest)return;
    if(!offices.length){
      setManualSearchMessage(`No post offices or localities found for PIN ${q}. Please check the PIN code.`);
      return;
    }
    // Show the complete post-office list. Coordinates are resolved only after
    // the customer chooses the locality, avoiding many Geocoding API calls.
    results.innerHTML=offices.map((item,i)=>{
      const sub=[item.branch,item.district,item.state,item.delivery].filter(Boolean).join(" • ");
      return `<button type="button" class="manual-result blinkit-pin-result" data-result-index="${i}"><span class="manual-result-pin">📍</span><span class="manual-result-copy"><b>${escHtml(item.name)}</b><small>${escHtml(sub||`PIN ${q}`)}</small></span><span class="manual-result-arrow">›</span></button>`;
    }).join("");
    setManualSearchMessage(`${offices.length} post office/locality option(s) found for PIN ${q}. Choose the area nearest to your delivery address.`);
    results.querySelectorAll("[data-result-index]").forEach(el=>el.addEventListener("click",async()=>{
      const item=offices[Number(el.dataset.resultIndex)];if(!item)return;
      results.querySelectorAll("button").forEach(b=>b.disabled=true);
      el.classList.add("selected");
      const hint=document.getElementById("manualLocationHint");
      if(hint)hint.textContent=`Locating ${item.name}…`;
      try{
        const maps=await loadGoogleMaps();
        googleGeocoder=googleGeocoder||new maps.Geocoder();
        const address=[item.name,item.district,item.state,q,"India"].filter(Boolean).join(", ");
        const geo=await googleGeocoder.geocode({address,componentRestrictions:{country:"IN"},region:"IN"});
        const match=(geo.results||[]).find(r=>{
          const pc=(r.address_components||[]).find(c=>c.types.includes("postal_code"))?.long_name||"";
          return !pc||pc.replace(/\D/g,"")===q;
        })||(geo.results||[])[0];
        const point=match?.geometry?.location;
        if(!point)throw new Error("Could not locate selected post office");
        const lat=typeof point.lat==="function"?point.lat():point.lat;
        const lng=typeof point.lng==="function"?point.lng():point.lng;
        if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng)))throw new Error("Invalid map coordinates");
        document.querySelectorAll("#manualAddressPanel input, #manualAddressPanel textarea").forEach(field=>{field.value="";delete field.dataset.edited;});
        const label=match.formatted_address||address;
        setManualPoint(Number(lat),Number(lng),label);
        manualPinTouched=false;
        input.value=q;
        fillAddressField("addrArea",item.name);
        fillAddressField("addrStreet","");
        fillAddressField("addrLandmark","");
        fillAddressField("addrPostOffice",item.name);
        fillAddressField("addrPincode",q);
        revealManualMapStage();
        await initManualMap();
        if(manualMap){
          manualMap.setCenter({lat:Number(lat),lng:Number(lng)});
          manualMap.setZoom(18);
          setTimeout(()=>{if(window.google?.maps?.event)google.maps.event.trigger(manualMap,"resize");},120);
        }
        if(manualMarker)manualMarker.position={lat:Number(lat),lng:Number(lng)};
        if(hint)hint.textContent=`${item.name} located approximately. Please drag the pin to your exact house or delivery gate, or tap the exact point on the map.`;
        const confirm=document.getElementById("confirmManualLocation");if(confirm)confirm.hidden=false;
        reverseGeocodeManualPoint(Number(lat),Number(lng));
      }catch(error){
        console.error("Selected PIN locality geocoding failed:",error);
        if(hint)hint.textContent=`Could not locate ${item.name} on the map. Try another nearby post office or enter the address manually.`;
        setManualSearchMessage(`The locality list was found, but map lookup failed for ${item.name}. Check Google Maps Geocoding API and billing, or choose another option.`);
      }finally{
        results.querySelectorAll("button").forEach(b=>b.disabled=false);
      }
    }));
  }catch(error){
    console.error("PIN code location search failed:",error);
    if(requestId===manualSearchRequest)setManualSearchMessage("PIN code search is temporarily unavailable. Please try again or enter the address manually.");
  }finally{if(btn){btn.disabled=false;btn.textContent="Search PIN";}}
}
function resetManualMapToShop(){
  manualSelected=null;manualPinTouched=false;
  const input=document.getElementById("manualLocationSearch"); if(input)input.value="";
  const results=document.getElementById("manualSearchResults"); if(results)results.innerHTML="";
  const panel=document.getElementById("manualAddressPanel");if(panel)panel.hidden=true;
  const confirmButton=document.getElementById("confirmManualLocation");if(confirmButton)confirmButton.hidden=true;
  const stage=document.getElementById("manualMapStage");if(stage)stage.hidden=true;
  const fallback=document.getElementById("manualChooseOnMap");if(fallback)fallback.hidden=false;
  document.querySelectorAll("#manualAddressPanel input, #manualAddressPanel textarea").forEach(el=>{el.value="";delete el.dataset.edited;});
  if(manualMap){manualMap.setCenter({lat:STORE.lat,lng:STORE.lon});manualMap.setZoom(15);manualMarker.position={lat:STORE.lat,lng:STORE.lon};}
  const h=document.getElementById("manualLocationHint");
  if(h)h.textContent="Map centred near Bake & Grill. Now search your nearby area or tap/drag the pin to your exact delivery address.";
}
async function confirmManualLocation(){
  if(!manualSelected){alert("Please search your 6-digit PIN code and select your delivery area first.");return;}
  if(!manualPinTouched){alert("Please drag the red pin onto your exact home or delivery gate, or tap the exact point on the map before confirming.");document.getElementById("manualMapStage")?.scrollIntoView({behavior:"smooth",block:"center"});return;}
  const addressDetails=collectManualAddress();
  if(!addressDetails.area){alert("Please enter your Area / Village.");document.getElementById("addrArea")?.focus();return;}
  if(!/^\d{6}$/.test(addressDetails.pincode)){alert("Please enter a valid 6-digit PIN code.");document.getElementById("addrPincode")?.focus();return;}
  const loc={...manualSelected,addressDetails,fullAddress:formatManualAddress(addressDetails)};
  // Do not leave an older, previously confirmed address active while checking a new pin.
  customerLocation=null; distanceKm=null; routeDurationMin=null; renderCart();
  try{
    const route=await getRoadRoute(loc.lat,loc.lon);
    if(route.outsideArea){distanceKm=null;routeDurationMin=null;setStatus(`❌ This pin is at least ${route.straightKm.toFixed(1)} KM away in a straight line, so it is outside our 8 KM road-delivery limit.`,"bad");alert("This location is outside our delivery area. Please select a closer delivery address.");return;}
    if(!Number.isFinite(route.distanceKm)){throw new Error("Road distance unavailable");}
    distanceKm=route.distanceKm; routeDurationMin=route.durationMin; routeDistanceSource=route.source||"Road routing";
    const rule=getDeliveryRule(distanceKm);
    if(!rule){setStatus(`❌ Road distance ${distanceKm.toFixed(1)} KM • No delivery above 8 KM.`,"bad"); alert("This location is outside our 8 KM delivery area. Please select a closer location."); return;}
    customerLocation={lat:loc.lat,lon:loc.lon,accuracy:null,source:"manual-map",label:loc.label||"",addressDetails:loc.addressDetails,fullAddress:loc.fullAddress};
    setStatus(`✅ Location selected • Road distance ${distanceKm.toFixed(1)} KM • Minimum order ${money(rule.minOrder)} • Delivery FREE`,"ok");
    const checkout=document.getElementById("checkoutLocation"); if(checkout)checkout.textContent=`📍 ${loc.fullAddress} • Road distance ${distanceKm.toFixed(1)} KM • ~${Math.max(1,Math.round(routeDurationMin))} min • Minimum order ${money(rule.minOrder)} • FREE delivery`;
    renderCart();
    releaseLocationGate();
  }catch(e){
    console.error("Delivery road-distance verification failed:",e);
    const message=e?.message||"Road distance could not be verified";
    setStatus("⚠️ " + message + " Your pin is saved in this picker; please retry in a moment.","bad");
    alert("Could not verify the road distance right now. Your selected pin has not been lost. Please check your internet connection and try Confirm again. If this continues, the road-routing service may be blocked or unavailable.");
  }
}
function showLocationChoice(){
  const gate=document.getElementById("locationGate");
  document.body.classList.add("location-required");
  if(gate){
    gate.classList.add("show");
    const status=document.getElementById("locationGateStatus");
    if(status) status.textContent="Choose GPS or enter your delivery address manually.";
    const retry=document.getElementById("locationGateRetry"); if(retry) retry.onclick=()=>checkLocation("gps");
    const network=document.getElementById("locationGateNetwork"); if(network) network.onclick=()=>checkLocation("network");
    const manual=document.getElementById("locationGateManual"); if(manual) manual.onclick=()=>showManualLocation("Search your area or select your exact delivery point on the map.");
  }
}
function checkLocation(mode="auto"){
  const requestId=++gpsRequestToken;
  const gateStatus=document.getElementById("locationGateStatus");
  const detectBtn=document.getElementById("manualDetectLocation");
  if(!window.isSecureContext || !navigator.geolocation){
    showManualLocation("GPS is unavailable in this browser context. Open the website over HTTPS, or use PIN search and map pin selection.");
    return;
  }
  if(gateStatus)gateStatus.textContent=mode==="network"?"📶 Requesting an approximate location using available Wi-Fi / mobile-network signals…":"📍 Requesting your precise GPS location. If it is slow, automatic mode can fall back to network / Wi-Fi.";
  if(detectBtn){detectBtn.disabled=true;detectBtn.textContent="Finding your location…";}
  setStatus(mode==="network"?"📶 Requesting approximate location from available network / Wi-Fi…":"📍 Requesting precise GPS location…");
  if(locationWatch!==null){try{navigator.geolocation.clearWatch(locationWatch);}catch(e){}locationWatch=null;}
  // Keep GPS timers separate from PIN-search debounce timers.
  clearTimeout(gpsFallbackTimer);
  let finished=false, fallbackStarted=false;
  const restoreButton=()=>{if(detectBtn){detectBtn.disabled=false;detectBtn.innerHTML='<span aria-hidden="true">◎</span> Detect my location';}};
  const finishFailure=(message)=>{
    if(finished || requestId!==gpsRequestToken)return;
    finished=true;clearTimeout(gpsFallbackTimer);restoreButton();
    showManualLocation(message);
  };
  const success=pos=>{
    if(finished || requestId!==gpsRequestToken || !pos?.coords)return;
    const c=pos.coords,lat=Number(c.latitude),lon=Number(c.longitude),accuracy=Number(c.accuracy);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat > 90||lon < -180||lon > 180){
      if(!fallbackStarted){startFallback();return;}
      finishFailure("Your device returned an invalid location. Please retry GPS or use PIN search.");
      return;
    }
    finished=true;clearTimeout(gpsFallbackTimer);restoreButton();
    setManualPoint(lat,lon,"GPS detected location");
    manualSelected.accuracy=Number.isFinite(accuracy)&&accuracy>0?accuracy:null;
    manualPinTouched=Number.isFinite(accuracy)&&accuracy>0&&accuracy<=60;
    const panel=document.getElementById("manualAddressPanel");if(panel)panel.hidden=false;
    revealManualMapStage();
    initManualMap().then(()=>{
      if(requestId!==gpsRequestToken)return;
      if(manualMap){manualMap.setCenter({lat,lng:lon});manualMap.setZoom(19);}
      if(manualMarker)manualMarker.position={lat,lng:lon};
      reverseGeocodeManualPoint(lat,lon);
      const confirm=document.getElementById("confirmManualLocation");if(confirm)confirm.hidden=false;
      const acc=Number.isFinite(accuracy)&&accuracy>0?Math.round(accuracy):null;
      const message="GPS location found. Please verify the red pin is on your exact home or delivery gate, then confirm.";
      showManualLocation(message);
      const hint=document.getElementById("manualLocationHint");
      if(hint)hint.textContent=acc!==null
        ? `Current location detected (±${acc} m). Check the pin is on your home or delivery gate, then confirm.`
        : "Current location detected. Please check and move the pin to your exact home or delivery gate.";
      if(gateStatus)gateStatus.textContent="✅ Current location detected. Verify your delivery pin.";
      setStatus("✅ Current device location detected. Verify your delivery pin before confirming.","ok");
    }).catch(err=>{
      console.warn("GPS found, but map initialization failed:",err);
      showManualLocation("Your GPS location was detected, but the map could not load. Check Google Maps API setup, then retry or use manual PIN search.");
    });
  };
  const finalFailure=err=>{
    if(finished || requestId!==gpsRequestToken)return;
    if(err?.code===1){finishFailure("You denied or blocked location access. No problem — you can continue manually. Enter your 6-digit PIN code, choose your area, add your address and move the map pin to your exact home or delivery gate. If you want automatic detection later, allow Location for this website in your browser settings and tap Try GPS Again.");return;}
    if(err?.code===2){finishFailure("📍 Your phone's Location / GPS is OFF or unavailable. Please turn ON Location in your phone Settings and allow this website's browser Location permission. You can retry GPS, or continue without sharing your location: enter your 6-digit PIN code and select your exact delivery point on the map.");const retry=document.getElementById("tryGpsAgain");if(retry)retry.hidden=false;return;}
    if(err?.code===3){finishFailure("📍 GPS could not find your location in time. Turn ON Location in your phone Settings and allow this website's browser permission, then retry. Or continue manually by entering your 6-digit PIN code and selecting your exact delivery point on the map.");const retry=document.getElementById("tryGpsAgain");if(retry)retry.hidden=false;return;}
    finishFailure("GPS could not detect your location. Please use manual PIN search and select your exact point on the map.");
  };
  const startFallback=()=>{
    if(finished || fallbackStarted || requestId!==gpsRequestToken)return;
    fallbackStarted=true;
    if(gateStatus)gateStatus.textContent="📶 GPS is taking longer than expected. Trying approximate network / Wi-Fi location…";
    setStatus("📶 Trying approximate network / Wi-Fi location…");
    try{
      navigator.geolocation.getCurrentPosition(success,finalFailure,{enableHighAccuracy:false,timeout:18000,maximumAge:120000});
      gpsFallbackTimer=setTimeout(()=>finishFailure("Could not detect your current location. Check device Location Services and browser permission, then retry or use PIN search."),19000);
    }catch(e){finalFailure(e);}
  };
  try{
    if(mode==="network"){
      // Ask the browser for a low-power / approximate fix. The browser and OS
      // may use nearby Wi-Fi and mobile-cell signals; availability is device-dependent.
      navigator.geolocation.getCurrentPosition(success,finalFailure,{enableHighAccuracy:false,timeout:20000,maximumAge:120000});
      gpsFallbackTimer=setTimeout(()=>finishFailure("📶 Network / Wi-Fi location was not available. Turn ON device Location Services and Wi-Fi or mobile data, allow this website's location permission, or use PIN search and the map pin."),21000);
    }else if(mode==="gps"){
      navigator.geolocation.getCurrentPosition(success,finalFailure,{enableHighAccuracy:true,timeout:20000,maximumAge:0});
      gpsFallbackTimer=setTimeout(()=>finishFailure("🛰️ GPS did not return a precise fix in time. Try Network / Wi-Fi approximate location, or use PIN search and the map pin."),21000);
    }else{
      // Automatic: try GPS first, then use browser / OS network location as fallback.
      navigator.geolocation.getCurrentPosition(success,err=>{
        if(requestId!==gpsRequestToken || finished)return;
        if(err?.code===1){finalFailure(err);return;}
        startFallback();
      },{enableHighAccuracy:true,timeout:12000,maximumAge:0});
      gpsFallbackTimer=setTimeout(startFallback,12500);
    }
  }catch(e){if(mode==="network")finalFailure(e);else startFallback();}
}
function setStatus(t,c=""){$("#locationStatus").textContent=t;$("#locationStatus").className="location-status "+c}
function loadCustomerProfile(){
  try{
    const raw=localStorage.getItem(CUSTOMER_PROFILE_KEY);
    customerProfile=raw?JSON.parse(raw):null;
  }catch(e){customerProfile=null;}
}
function validCustomerProfile(p){return p && typeof p.name==="string" && p.name.trim().length>=2 && /^\d{10}$/.test(String(p.phone||""));}
function isCustomerPhoneVerified(phone){
  const user=window.auth?.currentUser;
  return !!(user && user.phoneNumber && user.phoneNumber.replace(/^\+91/,"")===String(phone||"").replace(/\D/g,""));
}
function showCustomerForm(forceEdit=false){
  const form=document.getElementById("customerAccountForm"), saved=document.getElementById("customerAccountSaved"), change=document.getElementById("changeCustomerAccount");
  if(!form||!saved)return;
  form.style.display="block"; saved.style.display="none"; if(change)change.style.display="none";
  const n=document.getElementById("checkoutName"), ph=document.getElementById("checkoutPhone");
  if(n)n.value=customerProfile?.name||""; if(ph)ph.value=customerProfile?.phone||"";
  const otp=document.getElementById("customerOtpPanel"); if(otp)otp.style.display="none";
  const send=document.getElementById("sendCustomerOtp"); if(send)send.style.display="none";
  const status=document.getElementById("customerOtpStatus"); if(status)status.style.display="none";
  const recaptcha=document.getElementById("customerRecaptchaContainer"); if(recaptcha)recaptcha.style.display="none";
}
function customerOtpMessage(message,isError=false){
  const el=document.getElementById("customerOtpStatus"); if(el){el.textContent=message;el.style.color=isError?"#b00020":"#167a39";}
}
async function ensureCustomerAccount(name,phone){
  const cleanName=String(name||"").trim().replace(/\s+/g," ");
  const cleanPhone=String(phone||"").replace(/\D/g,"");
  if(cleanName.length<2 || !/^\d{10}$/.test(cleanPhone)) throw new Error("Please enter your name and valid 10-digit phone number.");
  // Use Firebase anonymous authentication in the background; no SMS OTP is sent.
  if(!window.auth) throw new Error("Customer account service is unavailable. Please try again.");
  let user=window.auth.currentUser;
  if(!user){const credential=await window.auth.signInAnonymously(); user=credential.user;}
  customerProfile={name:cleanName,phone:cleanPhone,uid:user.uid,phoneVerified:false};
  localStorage.setItem(CUSTOMER_PROFILE_KEY,JSON.stringify(customerProfile));
  return customerProfile;
}
function openCheckout(){
  if(!deliveryEnabled){alert("Delivery is currently unavailable. Please try again later.");return}
  if(!cart.length){alert("Please add at least one item.");return}
  showCustomerForm(false);
  const loc=document.querySelector("#checkoutLocation");
  const checkBtn=document.getElementById("checkoutCheckLocation");
  if(customerLocation && distanceKm!==null){
    const rule=getDeliveryRule(distanceKm);
    if(loc) loc.textContent=rule?`📍 ${customerLocation.fullAddress||`${distanceKm.toFixed(1)} KM`} • Road distance ${distanceKm.toFixed(1)} KM • Minimum order ${money(rule.minOrder)} • FREE delivery`:`❌ Road distance ${distanceKm.toFixed(1)} KM • Outside 8 KM delivery area. Please change location.`;
    if(checkBtn) checkBtn.textContent="📍 Change / Recheck Delivery Location";
  }else{
    if(loc) loc.textContent="📍 Delivery location not checked. Check or select your location below to calculate road distance, minimum order and delivery availability.";
    if(checkBtn) checkBtn.textContent="📍 Check / Select Delivery Location";
  }
  $("#checkoutModal")?.classList.add("show");
}
function closeCheckout(){
  $("#checkoutModal")?.classList.remove("show");
}

async function proceedOrderCore(){
  if(!deliveryEnabled){alert("Delivery is currently unavailable. Please try again later.");return}
  if(!firebaseCheck())return;
  if(!customerLocation||distanceKm===null){alert("Please confirm your delivery location first. Open Change / Select Delivery Location, place the pin on your home or gate, and tap Confirm This Location.");return}
  const nameInput=document.querySelector("#checkoutName"), phoneInput=document.querySelector("#checkoutPhone"), phoneError=document.querySelector("#checkoutPhoneError");
  const name=String(nameInput?.value||customerProfile?.name||"").trim();
  const phone=String(phoneInput?.value||customerProfile?.phone||"").replace(/\D/g,"");
  if(name.length<2 || !/^\d{10}$/.test(phone)){if(phoneError)phoneError.style.display="block";(!name?nameInput:phoneInput)?.focus();return}
  if(phoneError)phoneError.style.display="none";
  try{ await ensureCustomerAccount(name,phone); }catch(e){ if(phoneError){phoneError.textContent=e.message;phoneError.style.display="block";} else alert(e.message); return; }
  const rule=getDeliveryRule(distanceKm); if(!rule){alert("Sorry, this address is outside our 8 KM delivery area.");return}
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0); if(total<rule.minOrder){alert(`Minimum order for ${rule.label} is ${money(rule.minOrder)}. Please add ${money(rule.minOrder-total)} more.`);return}
  const orderId="BG"+Date.now().toString().slice(-8);
  const lat=Number(customerLocation.lat),lon=Number(customerLocation.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||(lat===0&&lon===0)){
    alert("Your delivery map point is missing. Please reopen location selection, place the pin on your home or delivery gate, and confirm again.");
    return;
  }
  // Coordinates stay in order data for routing and map links; they are never printed as plain text in customer/admin UI.
  // Create one canonical clickable Google Maps URL from the confirmed customer pin.
  // The customer never needs to type or see latitude/longitude.
  const locationUrl=`https://www.google.com/maps?q=${encodeURIComponent(lat+","+lon)}`;
  const items=cart.map(i=>({name:i.name,size:i.size||"",qty:i.qty,price:Number(i.price),extras:Array.isArray(i.extras)?i.extras.map(e=>({id:e.id,name:e.name,price:Number(e.price||0),qty:Math.max(1,Number(e.qty||1)),priceOnRequest:!!e.priceOnRequest})):[]}));
  const orderInstructions=String(document.getElementById("orderInstructions")?.value||"").trim().slice(0,500);
  const order={orderId,name:customerProfile.name,phone,customerId:customerProfile.uid||null,orderInstructions,address:customerLocation.fullAddress||"Delivery address confirmed",deliveryAddress:customerLocation.fullAddress||"",addressDetails:customerLocation.addressDetails||null,customerLocation:{lat,lon,accuracy:customerLocation.accuracy?Number(customerLocation.accuracy):null,source:customerLocation.source||"confirmed-location"},locationUrl,googleMapsUrl:locationUrl,mapUrl:locationUrl,mapLink:locationUrl,distanceKm:Number(distanceKm.toFixed(2)),routeDurationMin:routeDurationMin?Number(routeDurationMin.toFixed(1)):null,distanceType:`${routeDistanceSource||"Road"} road distance`,rule:rule.label,minOrder:rule.minOrder,total:Number(total),status:"NEW",createdAt:firebase.firestore.FieldValue.serverTimestamp(),items};
  try{
    const batch=db.batch(); const orderRef=db.collection("orders").doc(orderId); const statusRef=db.collection("publicStatuses").doc(orderId);
    batch.set(orderRef,order); batch.set(statusRef,{orderId,status:"NEW",customerId:customerProfile.uid||null,locationUrl,googleMapsUrl:locationUrl,mapUrl:locationUrl,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),total:Number(total)});
    await batch.commit();
  }catch(e){console.error("Firebase order save failed:",e);alert("Could not save your order. Please try again.");return}
  // One successful Firestore write = one order. Never send the order to WhatsApp and never run this twice.
  cart=[]; renderCart(); localStorage.setItem("bakeGrillActiveOrder",orderId);
  window.BakeGrillPush?.attachToOrder?.(orderId);
  $("#checkoutModal")?.classList.remove("show"); closeCart();
  // Tracking uses the saved order on this device; no visible Order ID input is required.
  subscribeToOrder(orderId);
  // After a successful order, take the customer directly to live Order Tracking.
  showOrderComplete(orderId,total);
}
let orderSubmitting=false;
async function proceedOrder(){
  if(orderSubmitting)return;
  const button=document.getElementById("confirmProceedOrder");
  orderSubmitting=true;
  if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent="Processing order…";}
  try{
    await proceedOrderCore();
  }catch(error){
    console.error("Proceed order unexpected error:",error);
    alert("Order could not be completed: "+(error?.message||"Please try again."));
  }finally{
    orderSubmitting=false;
    if(button){button.disabled=false;button.textContent=button.dataset.originalText||"Proceed Order →";}
  }
}

function showOrderComplete(orderId,total){
  // Keep the customer on the ordering page while the restaurant reviews the new order.
  // The live tracking view opens automatically as soon as the restaurant accepts it.
  $("#orderComplete")?.classList.remove("show");
  document.body.classList.remove("order-complete-open");
  const pushButton=document.getElementById("enableNotifications");
  if(pushButton){pushButton.textContent="🔔 Get Order Updates on This Phone";pushButton.disabled=false;}
  const pushHelp=document.getElementById("pushHelpText");
  if(pushHelp)pushHelp.textContent="Your order has been sent to Bake & Grill. We’ll open live tracking automatically when the restaurant accepts it.";
  const liveStatus=document.getElementById("liveStatus");
  if(liveStatus)liveStatus.textContent="Your order has been placed. Waiting for Bake & Grill to accept it…";
}
function openTrackingView(){
  const trackSection=document.getElementById("trackSection");
  document.querySelectorAll('.app-nav-item').forEach(function(x){
    x.classList.toggle('active', x.dataset.nav==='track');
  });
  if(trackSection){
    trackSection.classList.add("order-push-prompt-active");
    requestAnimationFrame(()=>trackSection.scrollIntoView({behavior:"smooth",block:"start"}));
  }
}
function closeOrderComplete(){
  $("#orderComplete")?.classList.remove("show");
  document.body.classList.remove("order-complete-open");
}
let statusUnsubscribe=null;
const ORDER_STEPS=["NEW","ACCEPTED","PREPARING","READY","OUT FOR DELIVERY","DELIVERED"];
function statusLabel(s){return ({NEW:"Waiting for restaurant",ACCEPTED:"Order accepted",PREPARING:"Being prepared",READY:"Ready for pickup", "OUT FOR DELIVERY":"Out for delivery",DELIVERED:"Delivered",CANCELLED:"Restaurant not accepting orders"})[s]||s;}
function renderTrackStatus(s, mapUrl=""){
  const box=$("#liveStatus"); if(!box)return;
  if(s==="CANCELLED"){box.innerHTML=`<div class="track-cancel"><div class="track-status-icon">⛔</div><strong>Order cancelled</strong><p>Your order has been cancelled successfully.</p></div>`;return;}
  const idx=Math.max(0,ORDER_STEPS.indexOf(s));
  const cancelBtn=(s==="NEW"||s==="ACCEPTED")?`<button type="button" class="customer-cancel-order" id="customerCancelOrder">❌ Cancel Order</button><small class="cancel-note">You can cancel until the restaurant starts preparing your order.</small>`:"";
  const mapLink=/^https:\/\/www\.google\.com\/maps\//i.test(String(mapUrl||""))?`<a class="order-address-link customer-track-map-link" href="${escHtml(mapUrl)}" target="_blank" rel="noopener noreferrer">📍 Open your delivery location in Google Maps</a>`:"";
  box.innerHTML=`<div class="track-status-top"><div><small>ORDER STATUS</small><strong>${escHtml(statusLabel(s))}</strong></div><span class="track-live-dot">● LIVE</span></div><div class="track-timeline">${ORDER_STEPS.map((step,i)=>`<div class="track-step ${i<=idx?"done":""} ${i===idx?"current":""}"><span>${i<idx?"✓":i===idx?"●":""}</span><b>${escHtml(statusLabel(step))}</b></div>`).join("")}</div>${mapLink}${cancelBtn}`;
  if(cancelBtn) document.getElementById("customerCancelOrder").onclick=cancelActiveOrder;
}
function subscribeToOrder(id){
  if(!firebaseCheck())return;
  const clean=String(id||"").trim(); if(!clean)return;
  statusUnsubscribe?.();
  localStorage.setItem("bakeGrillActiveOrder",clean);
  const liveStatus=document.getElementById("liveStatus");
  if(liveStatus)liveStatus.textContent="Connecting to live order status…";
  statusUnsubscribe=db.collection("publicStatuses").doc(clean).onSnapshot(d=>{
    if(!d.exists){
      const box=document.getElementById("liveStatus");
      if(box)box.textContent="Order status is unavailable. Please contact Bake & Grill.";
      return;
    }
    const data=d.data()||{}, status=String(data.status||"NEW").toUpperCase();
    renderTrackStatus(status,data.googleMapsUrl||data.locationUrl||data.mapUrl||"");
    if(status==="ACCEPTED"){
      const help=document.getElementById("pushHelpText");
      if(help)help.textContent="Your order has been accepted! Follow its live progress here.";
      openTrackingView();
    }
    if(status==="DELIVERED"){
      cart=[];renderCart();
      const box=document.getElementById("liveStatus");
      if(box)box.insertAdjacentHTML("beforeend",'<p class="order-finished-note">Thank you! Your order has been delivered.</p>');
      localStorage.removeItem("bakeGrillActiveOrder");
      statusUnsubscribe?.(); statusUnsubscribe=null;
      document.body.classList.remove("location-required");
      document.getElementById("locationGate")?.classList.remove("show");
    }
    if(status==="CANCELLED"){
      localStorage.removeItem("bakeGrillActiveOrder");
      statusUnsubscribe?.(); statusUnsubscribe=null;
      document.body.classList.remove("location-required");
      document.getElementById("locationGate")?.classList.remove("show");
    }
  },e=>{
    console.error(e);
    const box=document.getElementById("liveStatus");
    if(box)box.textContent="Could not check live status.";
  });
}

async function cancelActiveOrder(){
  const id=String($("#trackOrderId")?.value||localStorage.getItem("bakeGrillActiveOrder")||"").trim();
  if(!id){alert("Order ID not found.");return;}
  if(!firebaseCheck())return;
  const uid=window.auth?.currentUser?.uid||customerProfile?.uid||null;
  if(!uid || !String(uid).startsWith("local_") && !window.auth?.currentUser){
    alert("Please reopen your customer session and try again.");
    return;
  }
  if(!confirm("Cancel this order? You can only cancel before preparation starts.")) return;
  try{
    const ref=db.collection("orders").doc(id);
    const snap=await ref.get();
    if(!snap.exists){alert("Order not found.");return;}
    const o=snap.data()||{};
    if(o.customerId && uid && o.customerId!==uid){alert("This order belongs to another customer account.");return;}
    if(!["NEW","ACCEPTED"].includes(String(o.status||""))){
      alert("This order can no longer be cancelled because preparation has started.");
      return;
    }
    const batch=db.batch();
    batch.update(ref,{status:"CANCELLED",cancelledBy:"customer",cancelledAt:firebase.firestore.FieldValue.serverTimestamp()});
    batch.update(db.collection("publicStatuses").doc(id),{status:"CANCELLED",updatedAt:firebase.firestore.FieldValue.serverTimestamp(),cancelledBy:"customer"});
    await batch.commit();
    renderTrackStatus("CANCELLED");
    localStorage.removeItem("bakeGrillActiveOrder");
  }catch(e){
    console.error("Customer cancellation failed:",e);
    alert("Could not cancel the order. Please try again.");
  }
}
function trackLiveStatus(){const id=String(localStorage.getItem("bakeGrillActiveOrder")||"").trim();if(!id){$("#liveStatus").textContent="No recent order found on this device. Place an order here first to track it automatically.";return}subscribeToOrder(id);}
function trackOrder(){trackLiveStatus();document.getElementById("trackSection")?.scrollIntoView({behavior:"smooth",block:"start"});}

function enablePerformanceHints(){
  document.documentElement.style.setProperty("--app-dvh", "100dvh");
  if("connection" in navigator && navigator.connection?.saveData){ document.documentElement.classList.add("save-data"); }
  document.querySelectorAll("img").forEach(img=>{ if(!img.loading) img.loading="lazy"; if(!img.decoding) img.decoding="async"; });
}
init();
setTimeout(enablePerformanceHints,0);
setTimeout(()=>{
  const saved=localStorage.getItem("bakeGrillActiveOrder");
  if(saved&&window.firebaseReady){
    subscribeToOrder(saved);
    // On refresh/reopen, restore tracking without requesting location again.
    openTrackingView();
  }
},900);

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
        if(target==='cart') window.openCart ? window.openCart() : document.getElementById('openCart')?.click();
      });
    });
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

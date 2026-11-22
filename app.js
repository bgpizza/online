const WA_NUMBER="918240266267";
// Privacy-safe GA4 event helper. Never send customer name, phone, address or GPS coordinates.
function bgTrack(eventName, params={}) {
  try { if (typeof window.bgAnalyticsEvent === "function") window.bgAnalyticsEvent(eventName, params); }
  catch (e) { console.warn("GA4 tracking skipped:", eventName, e); }
}
function analyticsItems(items) {
  return (items||[]).map(i=>({
    item_id:String(i.id||""), item_name:String(i.name||""),
    item_category:String(i.category||""), item_variant:String(i.size||""),
    price:Number(i.price||0), quantity:Number(i.qty||1)
  }));
}

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
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&callback=${callbackName}&v=weekly`;
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
let maxDeliveryRoadKm = 8;
function getDeliveryRule(km){
  km=Number(km);
  if(!Number.isFinite(km)||km<0||km>maxDeliveryRoadKm) return null;
  if(km<=1) return {minOrder:199,charge:0,label:"0–1 KM"};
  if(km<=3) return {minOrder:286,charge:0,label:"1.1–3 KM"};
  if(km<=5) return {minOrder:374,charge:0,label:"3.1–5 KM"};
  if(km<=8) return {minOrder:497,charge:0,label:"5.1–8 KM"};
  return null;
}
function getVerifiedDeliveryState(){
  const lat=Number(customerLocation?.lat),lon=Number(customerLocation?.lon),km=Number(distanceKm??NaN);
  const validPoint=!!customerLocation&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&!(lat===0&&lon===0);
  const source=String(routeDistanceSource||"");
  const verifiedRoadSource=!!source&&!/straight.?line|haversine|approx(?:imate)?/i.test(source);
  const rule=validPoint&&Number.isFinite(km)&&km>0&&verifiedRoadSource?getDeliveryRule(km):null;
  return {verified:!!(validPoint&&Number.isFinite(km)&&verifiedRoadSource&&rule),rule,km,source};
}
const CART_DRAFT_KEY = "bakeGrillCartDraft";
const ORDER_ATTEMPT_KEY = "bakeGrillOrderAttempt";
function readOrderDraft(storage, key) {
  try { return JSON.parse(storage.getItem(key) || "null"); }
  catch { return null; }
}
const recoveredCart = readOrderDraft(sessionStorage, CART_DRAFT_KEY);
let cart=Array.isArray(recoveredCart) ? recoveredCart.filter(item => item && typeof item.id === "string" && Number.isInteger(item.qty) && item.qty > 0) : [], customerLocation=null, distanceKm=null, routeDurationMin=null, routeDistanceSource=null;
let locationWizardStep=1;
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
const CUSTOMER_FAVORITES_KEY="bakeGrillFavoriteItems";

const CUSTOMER_DELIVERY_KEY="bakeGrillVerifiedDeliveryLocation";
function deliveryRecordIsValid(record){
  if(!record)return false;
  const lat=Number(record.lat??record.customerLocation?.lat);
  const lon=Number(record.lon??record.customerLocation?.lon);
  const km=Number(record.distanceKm);
  const source=String(record.routeDistanceSource||record.distanceSource||"");
  return Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lon)&&Math.abs(lon)<=180
    &&!(lat===0&&lon===0)&&Number.isFinite(km)&&km>0
    &&!!source&&!/straight.?line|haversine|approx(?:imate)?/i.test(source)
    &&!!getDeliveryRule(km);
}
function deliveryRecordFromCurrent(){
  const verified=getVerifiedDeliveryState();
  if(!verified.verified||!customerLocation)return null;
  return {
    uid:window.auth?.currentUser?.uid||customerProfile?.uid||null,
    lat:Number(customerLocation.lat),lon:Number(customerLocation.lon),
    accuracy:customerLocation.accuracy||null,locationSource:customerLocation.source||"confirmed-location",
    label:customerLocation.label||"",addressDetails:customerLocation.addressDetails||{},
    fullAddress:customerLocation.fullAddress||"",
    distanceKm:Number(distanceKm),routeDurationMin:routeDurationMin==null?null:Number(routeDurationMin),
    routeDistanceSource:String(routeDistanceSource||""),savedAt:Date.now()
  };
}
function persistDeliveryRecord(record){
  if(!deliveryRecordIsValid(record))return false;
  const user=window.auth?.currentUser;
  const normalized={...record,uid:user?.uid||record.uid||null};
  try{localStorage.setItem(CUSTOMER_DELIVERY_KEY,JSON.stringify(normalized));}catch(e){console.warn("Delivery location local save:",e);}
  if(user?.phoneNumber&&window.db){
    window.db.collection("customers").doc(user.uid).set({
      preferredDelivery:{
        lat:normalized.lat,lon:normalized.lon,accuracy:normalized.accuracy||null,
        locationSource:normalized.locationSource||"saved",label:normalized.label||"",
        addressDetails:normalized.addressDetails||{},fullAddress:normalized.fullAddress||"",
        distanceKm:normalized.distanceKm,routeDurationMin:normalized.routeDurationMin,
        routeDistanceSource:normalized.routeDistanceSource,savedAt:firebase.firestore.FieldValue.serverTimestamp()
      },
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true}).catch(e=>console.warn("Cloud delivery address save:",e));
  }
  return true;
}
function saveCustomerDeliveryPreference(){
  const record=deliveryRecordFromCurrent();
  if(!record)return false;
  return persistDeliveryRecord(record);
}
function applySavedDeliveryRecord(record,uid){
  if(!deliveryRecordIsValid(record))return false;
  const lat=Number(record.lat??record.customerLocation?.lat),lon=Number(record.lon??record.customerLocation?.lon);
  customerLocation={
    lat,lon,accuracy:record.accuracy||null,
    source:record.locationSource||record.customerLocation?.source||"saved-customer-address",
    label:record.label||record.customerLocation?.label||"",
    addressDetails:record.addressDetails||record.customerLocation?.addressDetails||{},
    fullAddress:record.fullAddress||record.customerLocation?.fullAddress||""
  };
  distanceKm=Number(record.distanceKm);
  routeDurationMin=record.routeDurationMin==null?null:Number(record.routeDurationMin);
  routeDistanceSource=String(record.routeDistanceSource||record.distanceSource||"Saved road route");
  if(uid){const current=customerProfile||{};customerProfile={...current,uid,phoneVerified:true};}
  updateHeaderLocation();
  const rule=getDeliveryRule(distanceKm);
  setEligibleLocationStatus("Saved delivery address restored", distanceKm, rule.minOrder);
  releaseLocationGate();
  document.getElementById("locationGate")?.classList.remove("show");
  renderCart();
  return true;
}
async function restoreCustomerDeliveryPreference(){
  try{await Promise.resolve(window.customerAuthReady);}catch(_){}
  const user=window.auth?.currentUser;
  if(!user?.phoneNumber||!window.db)return false;
  const phone=String(user.phoneNumber).replace(/^\+91/,"").replace(/\D/g,"");
  if(!/^\d{10}$/.test(phone))return false;
  try{
    const raw=localStorage.getItem(CUSTOMER_DELIVERY_KEY);
    const local=raw?JSON.parse(raw):null;
    if(local?.uid===user.uid&&applySavedDeliveryRecord(local,user.uid)){
      persistDeliveryRecord(local);return true;
    }
  }catch(e){console.warn("Local saved delivery restore:",e);}
  try{
    const customerSnap=await window.db.collection("customers").doc(user.uid).get();
    const preferred=customerSnap.exists?customerSnap.data()?.preferredDelivery:null;
    if(preferred&&applySavedDeliveryRecord(preferred,user.uid)){
      persistDeliveryRecord({...preferred,uid:user.uid});return true;
    }
  }catch(e){console.warn("Customer preferred address restore:",e);}
  // Backward compatibility: older customers may have order history but no preferredDelivery field yet.
  try{
    const snap=await window.db.collection("orders").where("phone","==",phone).get();
    const latest=snap.docs.map(d=>d.data()||{}).sort((x,y)=>{
      const tx=x.createdAt?.toDate?.()?.getTime?.()||0,ty=y.createdAt?.toDate?.()?.getTime?.()||0;return ty-tx;
    })[0];
    if(latest?.customerLocation&&Number.isFinite(Number(latest.distanceKm))){
      const record={
        uid:user.uid,lat:latest.customerLocation.lat,lon:latest.customerLocation.lon,
        accuracy:latest.customerLocation.accuracy||null,locationSource:latest.customerLocation.source||"previous-order",
        addressDetails:latest.addressDetails||{},fullAddress:latest.deliveryAddress||latest.address||"",
        distanceKm:latest.distanceKm,routeDurationMin:latest.routeDurationMin||null,
        routeDistanceSource:String(latest.distanceType||"Saved road route").replace(/\s+road distance$/i,""),
        label:""
      };
      if(applySavedDeliveryRecord(record,user.uid)){persistDeliveryRecord(record);return true;}
    }
  }catch(e){console.warn("Previous order location restore:",e);}
  return false;
}
window.saveCustomerDeliveryPreference=saveCustomerDeliveryPreference;
window.restoreCustomerDeliveryPreference=restoreCustomerDeliveryPreference;

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
function renderMenuCategories(){
  const cats=$("#categories");
  const selected=cats.querySelector(".cat.active")?.dataset.cat||"all";
  const visible=new Set(getMenuItems().filter(item=>item.category!=="Add-ons").map(item=>item.category));
  const names=["all",...categoryOrder.filter(category=>visible.delete(category)),...visible];
  const active=names.includes(selected)?selected:"all";
  cats.innerHTML=names.map(category=>`<button class="cat${category===active?" active":""}" data-cat="${escHtml(category)}">${category==="all"?"All":(emoji[category]||"🍽️")+" "+escHtml(category)}</button>`).join("");
}
function init(){
  const cats=$("#categories");
  renderMenuCategories();
  cats.addEventListener("click",e=>{
    const b=e.target.closest(".cat"); if(!b)return;
    document.querySelectorAll(".cat").forEach(x=>x.classList.remove("active")); b.classList.add("active");
    renderMenu(b.dataset.cat);
    if(b.dataset.cat!=="all") document.getElementById("sec-"+slug(b.dataset.cat))?.scrollIntoView({behavior:"smooth",block:"start"});
  });
  renderHeroPicks();
  renderHomeFavorites();
  renderHomeOffers();
  document.getElementById("homeOffersFilters")?.addEventListener("click",event=>{
    const button=event.target.closest("[data-offer-filter]");if(!button)return;
    document.querySelectorAll("[data-offer-filter]").forEach(x=>x.classList.toggle("active",x===button));
    renderHomeOffers(button.dataset.offerFilter);
  });
  if(window.auth?.onAuthStateChanged&&!document.documentElement.dataset.favoriteAuthBound){
    window.auth.onAuthStateChanged(user=>{if(user?.phoneNumber)syncCustomerFavorites(user);});
    document.documentElement.dataset.favoriteAuthBound="true";
  }
  document.getElementById("homeFavoritesGrid")?.addEventListener("click",event=>{
    const favourite=event.target.closest("[data-favorite-id]");
    if(favourite){event.preventDefault();event.stopPropagation();toggleFavoriteItem(favourite.dataset.favoriteId);return;}
    const add=event.target.closest(".product-card-action .add");
    if(add){event.preventDefault();event.stopPropagation();openCustomize(add.dataset.id);return;}
    const open=event.target.closest(".product-card-open");
    if(open){event.preventDefault();openCustomize(open.dataset.id);}
  });
  const menuRoot=document.getElementById("menu");
  if(menuRoot&&!menuRoot.dataset.cardClicksBound){
    menuRoot.addEventListener("click",event=>{
      const favourite=event.target.closest("[data-favorite-id]");
      if(favourite){event.preventDefault();event.stopPropagation();toggleFavoriteItem(favourite.dataset.favoriteId);return;}
      const add=event.target.closest(".product-card-action .add");
      if(add){
        event.preventDefault();
        event.stopPropagation();
        openCustomize(add.dataset.id);
        return;
      }
      const qty=event.target.closest(".product-card-action .qty-inline");
      if(qty){
        event.preventDefault();
        event.stopPropagation();
        const id=qty.dataset.id,delta=Number(qty.dataset.delta||0);
        if(delta<0)removeOneProduct(id);else openCustomize(id);
        return;
      }
      const open=event.target.closest(".product-card-open");
      if(open){
        event.preventDefault();
        openCustomize(open.dataset.id);
      }
    });
    menuRoot.dataset.cardClicksBound="true";
  }
  renderMenu("all");
  setupSmartSearch();
  updateDeliveryUI();
  $("#locateBtn").onclick=showLocationChoice;
  document.getElementById("headerDeliveryLocation")?.addEventListener("click",showLocationChoice);
  document.getElementById("locationGateClose")?.addEventListener("click",()=>document.getElementById("locationGate")?.classList.remove("show"));
  updateHeaderLocation();
  $("#closeManualLocation")?.addEventListener("click",()=>{
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

  $("#findAddressOnMap")?.addEventListener("click",()=>geocodeAddressToMap({force:true}));
  ["addrHouseNumber","addrBuilding","addrArea","addrStreet","addrLandmark","addrPostOffice","addrPincode"].forEach(id=>{
    const field=document.getElementById(id);
    field?.addEventListener("input",()=>{
      if(id==="addrPincode")field.value=field.value.replace(/\D/g,"").slice(0,6);
      queueManualAddressMapUpdate();
    });
  });
  document.getElementById("backToLocationStep1")?.addEventListener("click",()=>showLocationWizardStep(1));
  document.getElementById("confirmLocationAndContinue")?.addEventListener("click",()=>{
    if(!getVerifiedDeliveryState().verified){showLocationWizardStep(2);return;}
    document.getElementById("manualLocationModal")?.classList.remove("show");
  });
  document.getElementById("backToLocationStep2")?.addEventListener("click",()=>showLocationWizardStep(2));

  // Address fields are wired to the live map search above; do not geocode on every keystroke.
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
  const cartDrawer=document.getElementById("cartDrawer");
  if(cartDrawer&&!cartDrawer.dataset.recommendationClicksBound){
    cartDrawer.addEventListener("click",event=>{
      const button=event.target.closest("[data-cart-suggestion-id]");
      if(!button)return;
      event.preventDefault();
      addRecommendedItemToCart(String(button.dataset.cartSuggestionId||""));
    });
    cartDrawer.dataset.recommendationClicksBound="true";
  }
  $("#checkoutBtn")?.addEventListener("click",openCheckout);
  $("#confirmProceedOrder")?.addEventListener("click",proceedOrder);
  $("#checkoutModal")?.addEventListener("keydown",event=>{
    if(event.key==="Escape"){event.preventDefault();closeCheckout();$("#checkoutBtn")?.focus();}
  });
  $("#changeCustomerAccount")?.addEventListener("click",()=>showCustomerForm(true));
  loadCustomerProfile();
  $("#closeCustomize")?.addEventListener("click",closeCustomize);
  $("#customizeBackdrop")?.addEventListener("click",closeCustomize);
  $("#customizeMinus")?.addEventListener("click",()=>{customizeState.qty=Math.max(1,customizeState.qty-1);updateCustomizeTotal()});
  $("#customizePlus")?.addEventListener("click",()=>{customizeState.qty+=1;updateCustomizeTotal()});
  $("#customizeAdd")?.addEventListener("click",commitCustomizedItem);
  // Do not request GPS or block browsing when the customer opens the website.
  // Start the delivery check from the cart or an explicit location action.
  const gateRetry=document.getElementById("locationGateRetry");
  if(gateRetry)gateRetry.onclick=()=>checkLocation("gps");
  const gateManual=document.getElementById("locationGateManual");
  if(gateManual)gateManual.onclick=()=>showManualLocation("Enter your 6-digit PIN code, choose your area, then confirm your exact map pin.");
  $("#checkoutCheckLocation")?.addEventListener("click",()=>{
    showLocationChoice();
  });
  $("#trackLive")?.addEventListener("click",trackLiveStatus);
  // Restore a saved address silently, but never request GPS on page load.
  restoreCustomerDeliveryPreference().then(restored=>{
    if(restored){updateHeaderLocation();renderDeliveryEligibilityBar();renderCart();}
  }).catch(error=>console.warn("Saved customer location restore:",error));
  if(firebaseReady){
    db.collection("stock").onSnapshot(snap=>{
      stock={}; snap.forEach(doc=>stock[doc.id]=doc.data());
      renderHeroPicks();
      renderMenu(document.querySelector(".cat.active")?.dataset.cat||"all");
      renderCart();
    },err=>console.error("Stock listener:",err));
    db.collection("menu").onSnapshot(snap=>{
      liveMenu={}; snap.forEach(doc=>liveMenu[doc.id]=doc.data());
      renderMenuCategories();
      renderHomeFavorites();
      renderHomeOffers();
      renderHeroPicks();
      renderMenu(document.querySelector(".cat.active")?.dataset.cat||"all");
    },err=>console.error("Menu listener:",err));
    db.collection("settings").doc("delivery").onSnapshot(doc=>{
      const settings = doc.data() || {};
      deliveryEnabled=settings.enabled !== false;
      maxDeliveryRoadKm=[1,3,5,8].includes(settings.maxRoadKm)?settings.maxRoadKm:8;
      updateDeliveryUI();
      renderDeliveryEligibilityBar();
      renderCart();
    },err=>console.error("Delivery setting listener:",err));
  }
}
const PIZZA_SIZE_ORDER=[
  {label:"Ekla Bite",slices:4,match:/^(ekla(?:\s*bite)?|small|regular)$/i},
  {label:"Bondhu Bite",slices:6,match:/^(bondhu(?:\s*bite)?|medium)$/i},
  {label:"Family Bite",slices:8,match:/^(family(?:\s*bite)?|large)$/i}
];
function normalizePizzaPrices(item,fallback=null){
  if(item?.category==="Add-ons")return item;
  if(item?.type==="single")return {...item,prices:null};
  if(!(item?.type==="pizza"||item?.prices||fallback?.prices))return item;
  const sources=[item?.prices,fallback?.prices].filter(v=>v&&typeof v==="object");
  const ordered={};
  PIZZA_SIZE_ORDER.forEach(size=>{
    for(const source of sources){
      const key=Object.keys(source).find(name=>size.match.test(String(name).trim()));
      const price=key!==undefined?Number(source[key]):NaN;
      if(Number.isFinite(price)&&price>0){ordered[size.label]=price;break;}
    }
  });
  return {...item,prices:ordered};
}
function getLiveItem(base){
  const live=liveMenu[base.id];
  if(!live)return normalizePizzaPrices(base);
  const item={...base,...live};
  if (base.category.endsWith("Combos") && item.category.endsWith("Combos") && !String(item.description||"").trim()){
    item.description=base.description;
  }
  return normalizePizzaPrices(item,base);
}
function getMenuItems(){
  const base=MENU_ITEMS.map(getLiveItem);
  const known=new Set(base.map(item=>String(item.id)));
  const added=Object.entries(liveMenu||{}).filter(([id,item])=>!known.has(String(id))&&item&&item.name&&item.category).map(([id,item])=>normalizePizzaPrices({...item,id:String(id)}));
  const items=base.concat(added).sort((a,b)=>(a.sortOrder??Infinity)-(b.sortOrder??Infinity));
  return window.applyPizzaImageOverride
    ? items.map(item=>window.applyPizzaImageOverride(item,liveMenu[item.id]))
    : items;
}
function getFavoriteItemIds(){
  try{const ids=JSON.parse(localStorage.getItem(CUSTOMER_FAVORITES_KEY)||"[]");return Array.isArray(ids)?[...new Set(ids.map(String))].slice(0,100):[];}catch(_){return [];}
}
function persistFavoriteItemIds(ids){
  const clean=[...new Set((ids||[]).map(String).filter(Boolean))].slice(0,100);
  try{localStorage.setItem(CUSTOMER_FAVORITES_KEY,JSON.stringify(clean));}catch(error){console.warn("Could not save favourites locally:",error);}
  const user=window.auth?.currentUser;
  if(user?.phoneNumber&&window.db)window.db.collection("customers").doc(user.uid).set({favoriteItemIds:clean,favoritesUpdatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}).catch(error=>console.warn("Cloud favourite sync:",error));
  renderHomeFavorites();renderMenu(document.querySelector(".cat.active")?.dataset.cat||"all");return clean;
}
function toggleFavoriteItem(id){
  const itemId=String(id||"");if(!itemId)return;
  const ids=getFavoriteItemIds(),next=ids.includes(itemId)?ids.filter(x=>x!==itemId):[...ids,itemId];
  persistFavoriteItemIds(next);
  const item=getMenuItems().find(x=>String(x.id)===itemId),live=document.getElementById("favoriteFeedback");
  if(live)live.textContent=next.includes(itemId)?(item?.name||"Item")+" saved to favourites":"Removed from favourites";
}
async function syncCustomerFavorites(user){
  if(!user?.phoneNumber||!window.db)return;
  try{
    const ref=window.db.collection("customers").doc(user.uid),snap=await ref.get();
    const cloud=snap.exists&&Array.isArray(snap.data()?.favoriteItemIds)?snap.data().favoriteItemIds.map(String):[];
    const merged=[...new Set([...cloud,...getFavoriteItemIds()])].slice(0,100);
    try{localStorage.setItem(CUSTOMER_FAVORITES_KEY,JSON.stringify(merged));}catch(_){}
    if(merged.join("|")!==cloud.join("|"))await ref.set({favoriteItemIds:merged,favoritesUpdatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    renderHomeFavorites();renderMenu(document.querySelector(".cat.active")?.dataset.cat||"all");
  }catch(error){console.warn("Could not restore customer favourites:",error);}
}
function renderHomeFavorites(){
  const wrap=document.getElementById("homeFavoritesGrid");if(!wrap)return;
  const items=getFavoriteItemIds().map(id=>getMenuItems().find(x=>String(x.id)===id)).filter(x=>x&&isInStock(x.id)&&x.category!=="Add-ons").slice(0,6);
  wrap.innerHTML=items.length?items.map(card).join(""):'<div class="home-favorites-empty"><span>♡</span><div><b>Your favourites will live here</b><small>Tap the heart on any menu item to save it for next time.</small></div></div>';
}
function renderHomeOffers(filter="all"){
  const section=document.getElementById("homeOffersSection"),wrap=document.getElementById("homeOffersGrid");if(!section||!wrap)return;
  const combos=getMenuItems().filter(x=>isInStock(x.id)&&["Family Combos","Bondhu Combos"].includes(x.category));
  const filtered=filter==="all"?combos:combos.filter(x=>x.category===filter);section.style.display=combos.length?"block":"none";
  wrap.innerHTML=filtered.length?filtered.map(x=>{
    const price=x.price==="Ask"?"Price on request":money(Number(x.price||0));
    const image=x.image?'<img src="'+escHtml(x.image)+'" alt="'+escHtml(x.name)+'" loading="lazy" decoding="async">':'<span class="home-offer-fallback">'+(emoji[x.category]||"🎉")+'</span>';
    return '<article class="home-offer-card"><div class="home-offer-image">'+image+'<span>'+escHtml(x.category.replace(" Combos",""))+'</span></div><div class="home-offer-copy"><h3>'+escHtml(x.name)+'</h3><p>From our current menu · Made fresh to order</p><div><b>'+price+'</b><button type="button" data-offer-item="'+escHtml(x.id)+'">View combo <span>→</span></button></div></div></article>';
  }).join(""):'<p class="home-offers-empty">No combos in this category right now. Browse all available combos.</p>';
  wrap.querySelectorAll("[data-offer-item]").forEach(button=>button.addEventListener("click",()=>openCustomize(button.dataset.offerItem)));
}
function updateHeaderLocation(){
  const button=document.getElementById("headerDeliveryLocation");
  const label=document.getElementById("headerDeliveryText");
  const distanceLabel=document.getElementById("headerDeliveryDistance");
  if(!button||!label)return;
  if(customerLocation){
    const details=customerLocation.addressDetails||{};
    const area=details.area||details.village||details.locality||details.suburb||details.city||customerLocation.label||"Selected delivery location";
    const pin=details.pincode||details.pinCode||details.postalCode||"";
    const addressLine=[details.street,details.landmark,details.postOffice,details.city,details.district,details.state].filter(Boolean).join(", ");
    label.textContent=String(area).slice(0,90);
    if(distanceLabel){
      const addressParts=[];
      if(addressLine)addressParts.push(addressLine);
      if(pin)addressParts.push(pin);
      if(!addressParts.length&&customerLocation.fullAddress)addressParts.push(customerLocation.fullAddress);
      const distanceText=Number.isFinite(distanceKm)?`${distanceKm.toFixed(1)} km away`:"";
      if(distanceText)addressParts.push(distanceText);
      distanceLabel.textContent=(addressParts.join(" • ")||"Delivery location selected").slice(0,150);
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
function updateCheckoutDeliveryOffNotice(showAlertFocus=false){
  const off=!deliveryEnabled;
  const cartNotice=document.getElementById("cartDeliveryOffNotice");
  const checkoutNotice=document.getElementById("checkoutDeliveryOffNotice");
  [cartNotice,checkoutNotice].forEach(el=>{
    if(!el)return;
    el.hidden=!off;
    el.setAttribute("aria-hidden",String(!off));
  });
  if(showAlertFocus&&off&&checkoutNotice){
    checkoutNotice.hidden=false;
    checkoutNotice.setAttribute("aria-hidden","false");
    checkoutNotice.scrollIntoView({behavior:"smooth",block:"center"});
    checkoutNotice.focus({preventScroll:true});
  }
}
function updateDeliveryUI(){
  updateHeaderLocation();
  const title=$("#deliveryGuideTitle");
  if(title)title.textContent="Free delivery up to "+maxDeliveryRoadKm+" km";
  const outside=$("#deliveryGuideOutside");
  if(outside)outside.textContent="Over "+maxDeliveryRoadKm+" km";
  document.querySelectorAll("[data-delivery-tier]").forEach(tier=>{
    tier.hidden=Number(tier.dataset.deliveryTier)>maxDeliveryRoadKm;
    tier.style.display=tier.hidden?"none":"";
  });
  const el=document.getElementById("deliveryBanner");
  if(el){
    el.textContent=deliveryEnabled?"🚚 Delivery is ON":"⛔ Delivery is currently OFF";
    el.className="delivery-banner "+(deliveryEnabled?"on":"off");
  }
  const btn=document.getElementById("checkoutBtn");
  if(btn){
    // Keep this button available so a customer can see why delivery is paused.
    btn.disabled=false;
    btn.title=deliveryEnabled?"Proceed to checkout":"Delivery is OFF. Open checkout to view the notice.";
    btn.setAttribute("aria-disabled","false");
  }
  updateCheckoutDeliveryOffNotice();
  // Keep the checkout summary truthful if the shop toggles delivery while checkout is open.
  renderCheckoutOrderSummary();
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
  const visual=x.image
    ? `<img src="${escHtml(x.image)}" alt="${escHtml(x.name)}" loading="lazy" decoding="async" onload="this.classList.add('is-loaded')" onerror="this.remove();this.parentElement.classList.add('no-product-image')">`
    : `<span class="hero-product-emoji">${emoji[x.category]||"🍽️"}</span>`;
  const badgeHtml=`<span class="hero-pick-badge">⭐ ${escHtml(badge)}</span>`;
  if(x.type==="pizza" || x.prices){
    const size="Ekla Bite",price=Number(x.prices?.[size]||Math.min(...Object.values(x.prices||{}).map(Number))||0);
    return `<article class="hero-product"><div class="hero-product-visual">${visual}${badgeHtml}</div><div class="hero-product-body"><small>${escHtml(x.category)}</small><h3>${escHtml(x.name)}</h3><p>${escHtml(x.description||"Freshly prepared for you")}</p><div class="hero-product-foot"><b>From ${money(price)}</b><button class="hero-add" data-id="${escHtml(x.id)}" data-size="${escHtml(size)}">ADD <span aria-hidden="true">＋</span></button></div></div></article>`;
  }
  return `<article class="hero-product"><div class="hero-product-visual">${visual}${badgeHtml}</div><div class="hero-product-body"><small>${escHtml(x.category)}</small><h3>${escHtml(x.name)}</h3><p>${escHtml(x.description||"Freshly prepared for you")}</p><div class="hero-product-foot"><b>${x.price==="Ask"?"Ask on WhatsApp":money(x.price)}</b><button class="hero-add" data-id="${escHtml(x.id)}">ADD <span aria-hidden="true">＋</span></button></div></div></article>`;
}
const FRIES_SIZES={Q1:"Small",Q2:"Medium",Q3:"Large"};
function getFriesOptions(items=getMenuItems()){
  return Object.keys(FRIES_SIZES).map(id=>items.find(item=>item.id===id))
    .filter(item=>item && isInStock(item.id) && Number(item.price)>0);
}
function renderMenu(filter="all"){
  const menu=$("#menu");
  const groups={}; let visible=0;
  const items=getMenuItems(), fries=getFriesOptions(items);
  items.forEach(item=>{
    const isFries=Object.hasOwn(FRIES_SIZES,item.id);
    if(isFries && item.id!==fries[0]?.id)return;
    const x=isFries?{...item,name:"French Fries",friesOptions:fries}:item;
    if(x.category==="Add-ons")return;
    if(!isInStock(x.id))return;
    if(filter!=="all"&&x.category!==filter)return;
    if(!matchesSearch(x))return;
    (groups[x.category]??=[]).push(x); visible++;
  });
  if(!visible){
    menu.innerHTML=`<section class="no-search-results"><div>🔎</div><h2>No exact match</h2><p>Try another word or one of the quick searches above.</p><button class="primary" id="showAllResults">Show all items</button></section>`;
    $("#showAllResults")?.addEventListener("click",()=>{$("#clearSearch")?.click()});
  } else {
    menu.innerHTML=Object.entries(groups).map(([cat,arr])=>`<section class="section" id="sec-${slug(cat)}"><h2>${emoji[cat]||"🍽️"} ${cat}<span class="result-count">${arr.length}</span></h2><div class="grid">${arr.map(card).join("")}</div></section>`).join("");
  }
  const hint=$("#searchHint");
  if(hint&&searchQuery)hint.textContent=`Found ${visible} matching item${visible===1?"":"s"} for “${searchQuery}”.`;
  // Card interactions are delegated from #menu so they survive every menu re-render.

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
  const isPizza=x.type==="pizza"||!!x.prices;
  const badge=x.badge||(x.bestChoice?"BESTSELLER":"");
  const badgeHtml=badge?'<span class="product-bestseller">★ '+escHtml(badge)+'</span>':"";
  const category=String(x.category||"");
  const dietary=/^veg\b/i.test(category)
    ?'<span class="product-dietary veg"><i></i> VEG</span>'
    :(/chicken|non.?veg/i.test(category)?'<span class="product-dietary nonveg"><i></i> NON-VEG</span>':"");
  const priceValues=Object.values(x.prices||{}).map(Number).filter(v=>Number.isFinite(v)&&v>0);
  const minPrice=x.friesOptions?Math.min(...x.friesOptions.map(item=>Number(item.price))):isPizza?(Number(x.prices?.["Ekla Bite"])||Math.min(...priceValues)):(x.price==="Ask"?null:Number(x.price||0));
  const priceText=minPrice===null?"Price on request":(isPizza||x.friesOptions?"From "+money(minPrice):money(minPrice));
  const visual=x.image
    ?'<img src="'+escHtml(x.image)+'" alt="'+escHtml(x.name)+'" loading="lazy" decoding="async" fetchpriority="low" onload="this.classList.add(\'is-loaded\')" onerror="this.remove();this.parentElement.classList.add(\'image-fallback\')">'
    :'<span class="product-image-emoji">'+(emoji[x.category]||"🍽️")+'</span>';
  const sizeTeaser=x.friesOptions
    ?'<div class="product-size-preview" aria-label="French Fries sizes and prices">'+x.friesOptions.map(item=>'<span><b>'+FRIES_SIZES[item.id]+'</b><strong>'+money(item.price)+'</strong></span>').join("")+'</div>'
    :isPizza
    ?'<div class="product-size-preview" aria-label="Pizza sizes and prices">'+PIZZA_SIZE_ORDER.filter(meta=>Number.isFinite(Number(x.prices?.[meta.label]))&&Number(x.prices[meta.label])>0).map(meta=>'<span><b>'+escHtml(meta.label.replace(" Bite",""))+'</b><small>'+meta.slices+' slices</small><strong>'+money(x.prices[meta.label])+'</strong></span>').join("")+'</div>'
    :"";
  const priceMeta=isPizza?"3 sizes · 4 / 6 / 8 slices":(x.price==="Ask"?"Contact us for price":"Ready to order");
  const favourite=getFavoriteItemIds().includes(String(x.id));
  return '<article class="card product-card '+(isPizza?"is-pizza-card":"is-quick-item-card")+(/ Combos$/.test(category)?" is-combo-card":"")+'" data-id="'+escHtml(x.id)+'">'+
    '<button type="button" class="product-favorite-toggle '+(favourite?"is-favourite":"")+'" data-favorite-id="'+escHtml(x.id)+'" aria-label="'+(favourite?"Remove from":"Add to")+' favourites" aria-pressed="'+(favourite?"true":"false")+'">'+(favourite?"♥":"♡")+'</button>'+
    '<button type="button" class="product-card-open" data-id="'+escHtml(x.id)+'" aria-label="View '+escHtml(x.name)+' details">'+
      '<div class="card-img">'+visual+badgeHtml+'<span class="product-category-tag">'+escHtml(category)+'</span><span class="product-image-shade" aria-hidden="true"></span></div>'+
      '<div class="card-body"><div class="product-card-meta">'+dietary+'<span class="product-card-fresh">FRESHLY MADE</span></div>'+
        '<div class="name">'+escHtml(x.name)+'</div>'+
        '<div class="desc">'+(x.description?escHtml(x.description):escHtml(category))+'</div>'+
        '<div class="product-card-price"><span class="price">'+priceText+'</span>'+(isPizza?'<small>Choose your portion</small>':'')+'</div>'+
        sizeTeaser+
        (!isPizza?'<div class="product-card-quick-note">'+(x.price==="Ask"?"Message us for details":"Made fresh to order")+'</div>':"")+
      '</div>'+
    '</button><div class="product-card-action">'+(x.friesOptions?'<button class="add" data-id="'+escHtml(x.id)+'">CHOOSE SIZE</button>':productQtyControl(x.id,isPizza?"CHOOSE SIZE":"CUSTOMIZE & ADD"))+'</div>'+
  '</article>';
}

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
function normalizedAddonSize(size){
  const value=String(size||"").toLowerCase().replace(/\\s+/g," ").trim();
  if(/ekla|small|regular/.test(value))return "Ekla Bite";
  if(/bondhu|medium/.test(value))return "Bondhu Bite";
  if(/family|large/.test(value))return "Family Bite";
  return String(size||"");
}
function addonPriceForSize(a,size){
  if(!a)return "Ask";
  const id=String(a.id||"");
  const table=window.MENU_ADDON_DEFAULT_PRICES?.[id];
  const canonicalSize=normalizedAddonSize(size);
  const sources=[a?.prices,a?.sizePrices].filter(v=>v&&typeof v==="object");
  for(const source of sources){
    if(source[canonicalSize]!==undefined)return source[canonicalSize];
    const alias=Object.keys(source).find(key=>normalizedAddonSize(key)===canonicalSize);
    if(alias&&source[alias]!==undefined)return source[alias];
  }
  if(table&&Object.prototype.hasOwnProperty.call(table,canonicalSize))return Number(table[canonicalSize]);
  // Keep unknown/new add-ons explicitly unpriced rather than inventing a charge.
  const price=a?.price;
  return typeof price==="number"&&Number.isFinite(price)?price:"Ask";
}

function extraCheesePrice(item){return Number(item?.extraCheesePrice??20);}
function getCustomizeExtras(x){
  if(x?.type==="pizza" || x?.prices) return getAddons().filter(a=>addonMatchesSize(a,customizeState.size));
  if(isSandwichOrBurger(x)&&extraCheesePrice(x)>0) return [{id:"__extra_cheese_20",name:"Extra Cheese",price:extraCheesePrice(x),type:"special"}];
  return [];
}
function openCustomize(id){
  const x=getMenuItems().find(i=>i.id===id); if(!x)return;
  bgTrack("view_item",{currency:"INR",value:itemMinPrice(x),items:[{item_id:String(x.id||""),item_name:String(x.name||""),item_category:String(x.category||""),price:itemMinPrice(x),quantity:1}]});
  customizeState={id,qty:1,size:(x.type==="pizza"||x.prices)?(x.prices?.["Ekla Bite"]?"Ekla Bite":Object.keys(x.prices||{})[0]||"Ekla Bite"):null,extras:[]};
  renderCustomizeSheet();
  $("#customizeSheet")?.classList.add("show");
  $("#customizeSheet")?.setAttribute("aria-hidden","false");
}
function closeCustomize(){$("#customizeSheet")?.classList.remove("show");$("#customizeSheet")?.setAttribute("aria-hidden","true");}
function renderCustomizeSheet(){
  const x=getMenuItems().find(i=>i.id===customizeState.id);if(!x)return;
  const fries=Object.hasOwn(FRIES_SIZES,x.id)?getFriesOptions():null;
  const img=$("#customizeImage");
  if(img){img.src=x.image||"";img.alt=x.name;img.style.display=x.image?"block":"none";}
  $("#customizeName").textContent=fries?"French Fries":x.name;
  const isPizza=x.type==="pizza"||!!x.prices;
  const customizeKicker=document.querySelector(".customize-product small");
  if(customizeKicker)customizeKicker.textContent=isPizza?"BUILD YOUR PIZZA":"CUSTOMIZE YOUR ORDER";
  document.getElementById("customizeSheet")?.classList.toggle("customize-pizza-mode",isPizza);
  const basePrice=customizeBasePrice(x);
  const addons=getCustomizeExtras(x);
  const ingredientNames=String(x.description||"").split(/\s*,\s*/).map(v=>v.trim()).filter(Boolean);
  const ingredientBlock=ingredientNames.length
    ?'<div class="customize-ingredients"><div class="customize-ingredients-head"><b>'+(x.category.endsWith("Combos")?"IN THIS COMBO":isPizza?"IN THIS PIZZA":"ABOUT THIS ITEM")+'</b><span>'+(x.category.endsWith("Combos")?"Included items":isPizza?"Included ingredients":"")+'</span></div><div class="customize-ingredient-list">'+ingredientNames.map(name=>'<span class="customize-ingredient-chip">'+escHtml(name)+'</span>').join("")+'</div></div>'
    :"";
  const intro='<div class="customize-intro">'+ingredientBlock+
    '<div class="customize-intro-price"><span>Starting price</span><b>'+money(basePrice)+'</b></div></div>';
  const sizeBlock=fries?'<section class="customize-group customize-size-group">'+
    '<div class="customize-group-heading"><h3>Choose your size</h3></div>'+
    '<div class="customize-options customize-size-options">'+fries.map(item=>
      '<label class="customize-option radio customize-size-option"><input type="radio" name="friesSize" value="'+item.id+'" '+(item.id===x.id?"checked":"")+'>'+
      '<span class="customize-choice-copy"><b>'+FRIES_SIZES[item.id]+'</b><strong>'+money(item.price)+'</strong></span></label>'
    ).join("")+'</div></section>':isPizza&&x.prices?'<section class="customize-group customize-size-group">'+
    '<div class="customize-group-heading"><div><h3>Choose your size</h3><p>Pick the portion that suits you.</p></div><span class="customize-required-tag">REQUIRED</span></div>'+
    '<div class="customize-options customize-size-options">'+
    PIZZA_SIZE_ORDER.filter(meta=>Number.isFinite(Number(x.prices?.[meta.label]))&&Number(x.prices[meta.label])>0).map(meta=>'<label class="customize-option radio customize-size-option"><input type="radio" name="customSize" value="'+escHtml(meta.label)+'" '+(customizeState.size===meta.label?"checked":"")+'><span class="customize-size-icon" aria-hidden="true">🍕</span><span class="customize-choice-copy"><b>'+escHtml(meta.label.replace(" Bite",""))+'</b><small>'+meta.slices+' slices</small><strong>'+money(x.prices[meta.label])+'</strong></span><span class="customize-choice-check" aria-hidden="true">✓</span></label>').join("")+
    '</div></section>':"";
  const extrasBlock=addons.length?'<section class="customize-group customize-extras-group">'+
    '<div class="customize-group-heading"><div><h3>'+(isPizza?"Add Extra Toppings":"Add extras")+'</h3><p>'+(isPizza?"Pick your favourites to make it extra special":"Choose an extra for your order")+'</p></div><span class="customize-optional-tag">OPTIONAL</span></div>'+
    '<div class="customize-extra-summary" id="customizeExtraSummary"><span><b class="customize-extra-count">0</b> toppings added</span><strong>Extra cost '+money(0)+'</strong></div>'+
    '<div class="customize-options customize-extra-options">'+addons.map(a=>{
      const checked=customizeState.extras.includes(a.id),ap=a.id==="__extra_cheese_20"?a.price:addonPriceForSize(a,customizeState.size);
      const price=ap==="Ask"?"Price on request":(typeof ap==="number"?"+"+money(ap):"Price on request");
      const image=a.image?'<img class="customize-extra-image" src="'+escHtml(a.image)+'" alt="" loading="lazy">':'<span class="customize-extra-image-fallback">＋</span>';
      return '<label class="customize-option check customize-extra-option '+(checked?"is-selected":"")+'">'+
        '<input type="checkbox" value="'+escHtml(a.id)+'" '+(checked?"checked":"")+'>'+
        '<span class="customize-extra-check" aria-hidden="true">✓</span>'+image+
        '<span class="customize-choice-copy"><b>'+escHtml(a.name)+'</b><small>'+(ap==="Ask"?price:price)+'</small></span></label>';
    }).join("")+'</div></section>':"";
  $("#customizeBody").innerHTML=intro+sizeBlock+extrasBlock;
  $("#customizeQty").textContent=customizeState.qty;
  document.querySelectorAll('input[name="friesSize"]').forEach(el=>el.onchange=()=>{
    customizeState.id=el.value;
    renderCustomizeSheet();
  });
  document.querySelectorAll('input[name="customSize"]').forEach(el=>el.onchange=()=>{
    customizeState.size=el.value;
    customizeState.extras=customizeState.extras.filter(id=>{
      if(id==="__extra_cheese_20")return true;
      const addon=getAddons().find(v=>v.id===id);
      return addonMatchesSize(addon,customizeState.size);
    });
    renderCustomizeSheet();
  });
  document.querySelectorAll('#customizeBody input[type="checkbox"]').forEach(el=>el.onchange=()=>{
    customizeState.extras=[...document.querySelectorAll('#customizeBody input[type="checkbox"]:checked')].map(v=>v.value);
    el.closest(".customize-extra-option")?.classList.toggle("is-selected",el.checked);
    updateCustomizeTotal();
  });
  updateCustomizeTotal();
}

function customizeBasePrice(x){return (x.type==="pizza"||x.prices)?Number(x.prices?.[customizeState.size]||0):Number(x.price||0);}
function customizeExtraPrice(id,item){if(id==="__extra_cheese_20")return extraCheesePrice(item);const a=getAddons().find(x=>x.id===id);const ap=addonPriceForSize(a,customizeState.size);return a&&typeof ap==="number"?Number(ap):0;}
function updateCustomizeTotal(){
  const x=getMenuItems().find(i=>i.id===customizeState.id);if(!x)return;
  const extrasTotal=customizeState.extras.reduce((sum,id)=>sum+customizeExtraPrice(id,x),0);
  const total=(customizeBasePrice(x)+extrasTotal)*customizeState.qty;
  $("#customizeQty").textContent=customizeState.qty;
  $("#customizeAdd").textContent=(x.type==="pizza"||x.prices?"Add Pizza · ":"Add to Cart · ")+money(total);
  const summary=document.getElementById("customizeExtraSummary");
  if(summary){
    const count=customizeState.extras.length;
    summary.innerHTML='<span><b class="customize-extra-count">'+count+'</b> topping'+(count===1?"":"s")+' added</span><strong>Extra cost '+money(extrasTotal)+'</strong>';
    summary.classList.toggle("has-selection",count>0);
  }
}
function commitCustomizedItem(){
  const x=getMenuItems().find(i=>i.id===customizeState.id); if(!x)return;
  if(Object.hasOwn(FRIES_SIZES,x.id)){
    const available=getFriesOptions();
    if(!available.length){closeCustomize();return;}
    if(!available.some(item=>item.id===x.id)){
      customizeState.id=available[0].id;
      renderCustomizeSheet();
      return;
    }
  }
  const size=customizeState.size||"";
  const extras=customizeState.extras.map(id=>{if(id==="__extra_cheese_20")return {id,name:"Extra Cheese",price:extraCheesePrice(x),priceOnRequest:false};const a=getAddons().find(v=>v.id===id);const ap=addonPriceForSize(a,customizeState.size);return {id,name:a?.name||id,price:typeof ap==="number"?Number(ap):0,priceOnRequest:ap==="Ask"}});
  const base=customizeBasePrice(x), extra=extras.reduce((s,e)=>s+e.price,0), unit=base+extra;
  const key=x.id+"|"+size+"|"+extras.map(e=>e.id).sort().join(",");
  const found=cart.find(i=>i.key===key);
  if(found){
    found.qty+=customizeState.qty;
    found.basePrice=base;
  } else {
    cart.push({key,id:x.id,name:x.name,size,basePrice:base,price:unit,qty:customizeState.qty,extras});
  }
  bgTrack("add_to_cart",{currency:"INR",value:unit*customizeState.qty,items:[{item_id:String(x.id||""),item_name:String(x.name||""),item_category:String(x.category||""),item_variant:String(size),price:unit,quantity:customizeState.qty}]});
  renderCart(); closeCustomize();
}
function addItem(id,size){openCustomize(id);}
function changeMenuQty(id,size,d){openCustomize(id);}

function renderCartSuggestions(total,rule){
  const box=document.getElementById("cartSuggestions");
  if(!box)return;
  if(!deliveryEnabled||!rule||!cart.length||total>=Number(rule.minOrder)){
    box.hidden=true;box.innerHTML="";return;
  }
  const remaining=Math.max(0,Number(rule.minOrder)-Number(total));
  const existing=new Set(cart.map(i=>String(i.id)));
  const candidates=getMenuItems()
    .filter(item=>!existing.has(String(item.id))&&item.category!=="Add-ons"&&isInStock(item.id)&&!item.outOfStock&&!item.isOutOfStock)
    .map(item=>({item,price:Number(itemMinPrice(item))}))
    .filter(row=>Number.isFinite(row.price)&&row.price>0&&row.price<=remaining+80)
    .sort((a,b)=>{
      const aCovers=a.price>=remaining,bCovers=b.price>=remaining;
      if(aCovers!==bCovers)return aCovers?-1:1;
      return aCovers?a.price-b.price:b.price-a.price;
    })
    .slice(0,3);
  if(!candidates.length){box.hidden=true;box.innerHTML="";return;}
  box.hidden=false;
  box.innerHTML=
    '<div class="cart-suggestions-head"><div><b>Complete your order</b><small>Add '+money(remaining)+' more to reach the minimum order.</small></div><span>GOOD PICKS</span></div>'+
    '<div class="cart-suggestions-list">'+candidates.map(({item,price})=>{
      const image=item.image
        ?'<img src="'+escHtml(item.image)+'" alt="" loading="lazy">'
        :'<span class="cart-suggestion-emoji">'+(emoji[item.category]||"🍽️")+'</span>';
      const priceText=item.type==="pizza"||item.prices?"From "+money(price):money(price);
      return '<article class="cart-suggestion">'+image+
        '<div class="cart-suggestion-info"><b>'+escHtml(item.name)+'</b><small>'+priceText+'</small></div>'+
        '<button type="button" data-cart-suggestion-id="'+escHtml(item.id)+'" aria-label="Add '+escHtml(item.name)+' directly to your order">ADD</button></article>';
    }).join("")+'</div>';
}
function addRecommendedItemToCart(id){
  const item=getMenuItems().find(x=>String(x.id)===String(id));
  if(!item||!isInStock(item.id)||item.outOfStock||item.isOutOfStock){
    const feedback=document.getElementById("cartAddFeedback");
    if(feedback)feedback.textContent="Sorry, this item is currently unavailable.";
    renderCart();return;
  }
  let size="",basePrice=0;
  const isPizza=item.type==="pizza"||!!item.prices;
  if(isPizza){
    const variants=Object.entries(item.prices||{}).filter(([,price])=>Number.isFinite(Number(price))&&Number(price)>0);
    if(!variants.length)return;
    const chosen=variants.find(([label])=>/^(ekla bite|small|regular)$/i.test(String(label).trim()))
      ||variants.sort((a,b)=>Number(a[1])-Number(b[1]))[0];
    size=String(chosen[0]);basePrice=Number(chosen[1]);
  }else{
    basePrice=Number(item.price);
    if(!Number.isFinite(basePrice)||basePrice<=0){
      const feedback=document.getElementById("cartAddFeedback");
      if(feedback)feedback.textContent="This item needs price confirmation. Please choose it from the menu.";
      return;
    }
  }
  const key=String(item.id)+"|"+size+"|";
  const existing=cart.find(row=>row.key===key);
  if(existing){existing.qty=Number(existing.qty||1)+1;existing.basePrice=basePrice;existing.price=basePrice;}
  else cart.unshift({key,id:String(item.id),name:item.name,size,basePrice,price:basePrice,qty:1,extras:[]});
  bgTrack("add_to_cart",{currency:"INR",value:basePrice,items:[{item_id:String(item.id),item_name:String(item.name||""),item_category:String(item.category||""),item_variant:size,price:basePrice,quantity:1}]});
  renderCart();
  const feedback=document.getElementById("cartAddFeedback");
  if(feedback)feedback.textContent="✓ "+item.name+" added to your order"+(size?" · "+size:"");
}
function renderCheckoutOrderSummary(){
  const box=document.getElementById("checkoutOrderSummary");
  if(!box)return;
  const total=cart.reduce((sum,item)=>sum+Number(item.price||0)*Number(item.qty||1),0);
  const delivery=getVerifiedDeliveryState();
  $("#checkoutFooterTotal").textContent=money(total);
  const deliveryText=!deliveryEnabled?"Unavailable":(delivery.verified?"Free":"Check location");
  const items=cart.map(item=>{
    const extras=Array.isArray(item.extras)&&item.extras.length
      ?'<small class="checkout-summary-extras">'+item.extras.map(extra=>escHtml(extra.name)).join(", ")+'</small>'
      :"";
    const label=Number(item.qty||1)+" × "+escHtml(item.name)+(item.size?" · "+escHtml(item.size):"");
    return '<div class="checkout-summary-item"><span>'+label+extras+'</span><b>'+money(Number(item.price||0)*Number(item.qty||1))+'</b></div>';
  }).join("");
  const minText=deliveryEnabled&&delivery.verified
    ?(total>=delivery.rule.minOrder
      ?'<div class="checkout-summary-note success">✓ Minimum order reached ('+money(delivery.rule.minOrder)+')</div>'
      :'<div class="checkout-summary-note warning">Add '+money(delivery.rule.minOrder-total)+' more to meet the '+money(delivery.rule.minOrder)+' minimum order.</div>')
    :(deliveryEnabled?'<div class="checkout-summary-note warning">Confirm your delivery location to see the minimum order.</div>':'<div class="checkout-summary-note warning">Delivery is currently OFF. Orders cannot be submitted.</div>');
  const count=cart.reduce((n,item)=>n+Number(item.qty||1),0);
  box.innerHTML='<div class="checkout-summary-heading"><h3>Order summary</h3><span>'+count+(count===1?' item':' items')+'</span></div>'+
    items+
    '<div class="checkout-summary-divider"></div>'+
    '<div class="checkout-summary-item"><span>Items subtotal</span><b>'+money(total)+'</b></div>'+
    '<div class="checkout-summary-item"><span>Delivery</span><b class="'+(deliveryText==="Free"?"is-free":"")+'">'+deliveryText+'</b></div>'+
    '<div class="checkout-summary-total"><span>Total</span><strong>'+money(total)+'</strong></div>'+
    minText;
}
function renderCart(){
  // Keep a permanent base price so removing an add-on can never leave its old price behind.
  cart.forEach(i=>{
    const extras=Array.isArray(i.extras)?i.extras:[];
    const extrasTotal=extras.reduce((sum,e)=>sum+Number(e.price||0)*Math.max(1,Number(e.qty||1)),0);
    if(!Number.isFinite(Number(i.basePrice))) i.basePrice=Math.max(0,Number(i.price||0)-extrasTotal);
    i.price=Number(i.basePrice||0)+extrasTotal;
  });
  try { if (cart.length) sessionStorage.setItem(CART_DRAFT_KEY, JSON.stringify(cart)); else sessionStorage.removeItem(CART_DRAFT_KEY); } catch {}
  const itemCount=cart.reduce((s,i)=>s+i.qty,0);
  $("#cartCount").textContent=itemCount;
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const verifiedDelivery=getVerifiedDeliveryState();
  const rule=verifiedDelivery.verified?verifiedDelivery.rule:null;
  const floating=document.getElementById("floatingCart");
  if(floating){
    floating.classList.toggle("has-items",itemCount>0);
    const meta=document.getElementById("floatingCartMeta");
    const totalEl=document.getElementById("floatingCartTotal");
    if(meta) meta.textContent=itemCount?`${itemCount} item${itemCount===1?"":"s"} • View order`:"Your cart is empty";
    if(totalEl) totalEl.textContent=money(total);
  }
  $("#cartItems").innerHTML=cart.length?`<div class="cart-list">${cart.map((i,idx)=>{const product=getMenuItems().find(x=>String(x.id)===String(i.id));const thumb=product?.image?'<img class="cart-product-thumb" src="'+escHtml(product.image)+'" alt="" loading="lazy">':'<span class="cart-product-thumb cart-product-thumb-fallback">'+(emoji[product?.category]||"🍽️")+'</span>';const extras=Array.isArray(i.extras)?i.extras:[];extras.forEach(e=>{e.qty=Math.max(1,Number(e.qty||1));});const extrasTotal=extras.reduce((s,e)=>s+Number(e.price||0)*Number(e.qty||1),0);const basePrice=Math.max(0,Number(i.price||0)-extrasTotal);return `<div class="cart-line"><div class="cart-line-product">${thumb}<div class="cart-line-copy"><div class="cart-name">${escHtml(i.name)}</div><div class="cart-meta">${i.size?escHtml(i.size)+" • ":""}${money(basePrice)} base price</div>${extras.length?`<div class="cart-addons"><div class="cart-addons-title"><div><strong>YOUR TOPPINGS</strong><small>Adjust quantity or remove a topping</small></div><span>✓ ADDED</span></div>${extras.map((e,ei)=>`<div class="cart-addon-row"><div class="cart-addon-info"><span>${escHtml(e.name)}</span><b>+${money(Number(e.price||0)*Number(e.qty||1))}</b><small>${money(Number(e.price||0))} each</small></div><div class="cart-addon-controls"><button type="button" aria-label="Decrease ${escHtml(e.name)}" onclick="changeAddonQty(${idx},${ei},-1)">−</button><span>${Number(e.qty||1)}</span><button type="button" aria-label="Increase ${escHtml(e.name)}" onclick="changeAddonQty(${idx},${ei},1)">+</button><button type="button" class="cart-addon-remove" aria-label="Remove ${escHtml(e.name)}" onclick="removeAddon(${idx},${ei})">×</button></div></div>`).join("")}</div>`:""}<div class="cart-item-total">Item total: <b>${money(i.price)}</b></div></div></div><div class="qty"><button onclick="changeQty(${idx},-1)">−</button><span>${i.qty}</span><button onclick="changeQty(${idx},1)">+</button></div></div>`}).join("")}</div>`:`<div class="empty-cart"><div class="empty-cart-icon">🛒</div><strong>Your cart is empty</strong><p>Add your favourite items and tap the cart below to place your order.</p></div>`;
  const outOfRange=Number.isFinite(verifiedDelivery.km)&&verifiedDelivery.km>maxDeliveryRoadKm;
  const address=customerLocation?.fullAddress||customerLocation?.label||"";
  const deliveryText=!deliveryEnabled?"Paused":(rule?"Free":(outOfRange?"Unavailable":"Check location"));
  const ruleDistance=rule?`${verifiedDelivery.km.toFixed(1)} km by road`:"";
  const info=!deliveryEnabled?"Delivery is currently paused."
    :rule?(total<rule.minOrder
      ?`${ruleDistance} · Add ${money(rule.minOrder-total)} to reach the ${money(rule.minOrder)} minimum.`
      :`${ruleDistance} · ${money(rule.minOrder)} minimum met`)
    :outOfRange?`This address is outside our current ${maxDeliveryRoadKm} km delivery area.`:"Set your delivery address to check availability.";
  const oldInfo=document.getElementById("cartRuleInfo");
  if(oldInfo){
    oldInfo.innerHTML=`<div class="cart-address-row"><div><strong>Delivery address</strong><span>${escHtml(address||"Address not verified")}</span></div><button type="button" class="cart-address-change">${address?"Change":"Set address"}</button></div><p class="cart-rule-copy">${info}</p>`;
    if(deliveryEnabled&&rule){
      const progress=total>=rule.minOrder?100:Math.max(0,Math.floor(total/rule.minOrder*100));
      oldInfo.insertAdjacentHTML("beforeend",`<div class="cart-minimum-head"><span>Minimum order progress</span><b>${progress}%</b></div><div class="cart-minimum-track" role="progressbar" aria-label="Minimum order progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>`);
    }
    oldInfo.classList.toggle("minimum-reached",!!(deliveryEnabled&&rule&&total>=rule.minOrder));
    oldInfo.querySelector(".cart-address-change").onclick=()=>{
      showLocationChoice();
    };
  }
  $("#cartTotal").textContent=money(total);
  const bill=document.getElementById("cartBillSummary");
  if(bill){
    bill.innerHTML='<div class="cart-bill-row"><span>Items subtotal</span><b>'+money(total)+'</b></div>'+
      '<div class="cart-bill-row"><span>Delivery</span><b class="'+(deliveryText==="Free"?"is-free":"")+'">'+deliveryText+'</b></div>';
  }
  if(document.body.classList.contains("checkout-open")){
    renderCheckoutDeliveryAddress();
    renderCheckoutOrderSummary();
  }
  renderCartSuggestions(total,rule);
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
function openCart(){
  $("#cartDrawer").classList.add("open");
  $("#overlay").classList.add("show");
  document.body.classList.add("cart-open");
  if(deliveryEnabled&&!getVerifiedDeliveryState().verified)showLocationChoice();
}

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
let manualAddressGeocodeRequest=0, lastManualAddressQuery="";
const MANUAL_SEARCH_RADIUS=0.075; // approx. 8 km around the shop, geographic search box
function hideLocationGate(){document.getElementById("locationGate")?.classList.remove("show");}
function releaseLocationGate(closeModal=true){
  if(!customerLocation||!Number.isFinite(distanceKm))return;
  updateHeaderLocation();
  renderDeliveryEligibilityBar();
  if(closeModal)document.getElementById("manualLocationModal")?.classList.remove("show");
}

function showLocationWizardStep(step){
  locationWizardStep=Math.max(1,Math.min(3,Number(step)||1));
  ["manualStep1","manualAddressPanel","manualStep3"].forEach((id,index)=>{
    const panel=document.getElementById(id);
    if(panel)panel.hidden=(index+1)!==locationWizardStep;
  });
  document.querySelectorAll("[data-step-indicator]").forEach(el=>{
    const number=Number(el.dataset.stepIndicator);
    el.classList.toggle("active",number===locationWizardStep);
    el.classList.toggle("complete",number<locationWizardStep);
    const circle=el.querySelector("span");
    if(circle)circle.textContent=number<locationWizardStep?"✓":String(number);
  });
  const card=document.querySelector(".manual-location-card");
  if(card)card.scrollTo({top:0,behavior:"smooth"});
  document.getElementById("deliveryPinRequired").hidden=true;
}

function showManualLocation(reason){
  hideLocationGate();
  const modal=document.getElementById("manualLocationModal");
  if(modal)modal.classList.add("show");
  const message=reason||"Choose GPS or enter your 6-digit PIN code to start.";
  setStatus("📍 "+message,"bad");
  const hint=document.getElementById("manualLocationHint");if(hint)hint.textContent=message;
  showLocationWizardStep(1);
  const input=document.getElementById("manualLocationSearch");if(input)setTimeout(()=>input.focus(),100);
}

function setManualSearchMessage(message){
  // Keep the status message separate so it never replaces the actual PIN suggestions.
  const el=document.getElementById("manualSearchStatus");
  if(el){el.textContent=String(message||"");el.hidden=!message;}
}
function revealManualMapStage(){
  showLocationWizardStep(2);
  requestAnimationFrame(()=>{
    const map=document.getElementById("manualMap");
    if(map)map.scrollIntoView({behavior:"smooth",block:"nearest"});
    if(manualMap&&window.google?.maps?.event)google.maps.event.trigger(manualMap,"resize");
  });
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
  customerLocation=null;distanceKm=null;routeDurationMin=null;routeDistanceSource=null;
  renderDeliveryEligibilityBar();
  manualSelected={lat:Number(lat),lon:Number(lon),accuracy:null,label,addressDetails:{}};
  renderCart();
  if(manualMarker)manualMarker.position={lat:manualSelected.lat,lng:manualSelected.lon};
  if(manualMap){manualMap.setCenter({lat:manualSelected.lat,lng:manualSelected.lon});manualMap.setZoom(17);}
  const results=document.getElementById("manualSearchResults");if(results)results.innerHTML="";
  const confirm=document.getElementById("confirmManualLocation");
  if(confirm){confirm.hidden=false;}
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
        manualAddressGeocodeRequest++;
        clearTimeout(manualAddressTimer);
        manualPinTouched=true;
        updateDeliveryPinState();
        setManualPoint(Number(lat),Number(lng));
        const confirm=document.getElementById("confirmManualLocation");if(confirm){confirm.hidden=false;}
        const hint=document.getElementById("manualLocationHint");if(hint)hint.textContent="Pin moved to your selected point. Checking the nearest road and address details…";
        reverseGeocodeManualPoint(Number(lat),Number(lng));
      });
      // Tapping anywhere on the map moves the delivery pin to that exact point.
      manualMap.addListener("click",e=>{
        if(!e?.latLng)return;
        const lat=e.latLng.lat(),lng=e.latLng.lng();
        manualAddressGeocodeRequest++;
        clearTimeout(manualAddressTimer);
        manualPinTouched=true;
        updateDeliveryPinState();
        setManualPoint(lat,lng);
        const confirm=document.getElementById("confirmManualLocation");if(confirm){confirm.hidden=false;}
        const hint=document.getElementById("manualLocationHint");if(hint)hint.textContent="Map point selected. Checking the nearest road and address details…";
        reverseGeocodeManualPoint(lat,lng);
      });
    }else{manualMap.setCenter({lat:start.lat,lng:start.lon});manualMap.setZoom(manualSelected||customerLocation?17:15);manualMarker.position={lat:start.lat,lng:start.lon};setTimeout(()=>maps.event.trigger(manualMap,"resize"),100);}
    if(manualSelected||customerLocation){manualSelected=manualSelected||{lat:start.lat,lon:start.lon,accuracy:null};updateManualHint(manualSelected.label||"");}
    else if(hint)hint.textContent="Map centred near Bake & Grill. The shop marker is not your delivery address—search or tap/drag to your own location.";
  }catch(e){if(hint)hint.textContent="Google Map could not load. Check the Google Maps API key, billing, enabled APIs and website restrictions. You can still retry.";setManualSearchMessage("Google Maps unavailable. Please check API setup and reload the page.");}
}
function updateDeliveryPinState(){
  const state=document.getElementById("deliveryPinState");
  if(state)state.textContent=manualPinTouched?"✓ Pin set":"";
  if(manualPinTouched){
    const find=document.getElementById("findAddressOnMap");
    if(find){find.disabled=false;find.textContent="Find typed address on map";}
    setManualAddressMapStatus("Pin set. Check delivery availability when your address is complete.","success");
  }
  document.getElementById("deliveryPinNotice")?.classList.toggle("pin-confirmed",manualPinTouched);
  document.getElementById("deliveryPinRequired")?.setAttribute("hidden","");
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
  const details={houseNumber:value("addrHouseNumber"),building:value("addrBuilding"),area:value("addrArea"),street:value("addrStreet"),landmark:value("addrLandmark"),postOffice:value("addrPostOffice"),pincode:value("addrPincode")};
  details.fullAddress=formatManualAddress(details);
  return details;
}

function formatManualAddress(a={}){
  return [a.houseNumber,a.building,a.area,a.street,a.landmark,a.postOffice,a.pincode].filter(Boolean).join(", ");
}

async function setManualAddressMapStatus(message,state="info"){
  const el=document.getElementById("manualAddressMapStatus");
  if(el){el.textContent=message;el.dataset.state=state;}
}
function queueManualAddressMapUpdate(){
  clearTimeout(manualAddressTimer);
  const a=collectManualAddress();
  const requestId=++manualAddressGeocodeRequest;
  // Any address edit invalidates the previous delivery verification immediately.
  manualPinTouched=false;updateDeliveryPinState();
  if(customerLocation||distanceKm!==null||routeDurationMin!==null){
    customerLocation=null;distanceKm=null;routeDurationMin=null;routeDistanceSource=null;
    renderDeliveryEligibilityBar();renderCart();
  }
  const confirm=document.getElementById("confirmManualLocation");
  if(confirm){confirm.hidden=false;}
  if(!a.area||!/^\d{6}$/.test(a.pincode||"")){
    const hasAddress=[a.houseNumber,a.building,a.street,a.landmark,a.area,a.postOffice].some(Boolean);
    setManualAddressMapStatus(hasAddress
      ?"Add a valid 6-digit PIN code and Area / Village to move the map automatically."
      :"Start typing your address. The map will find it automatically.","info");
    return;
  }
  const query=[a.houseNumber,a.building,a.street,a.landmark,a.area,a.postOffice,a.pincode,"India"].filter(Boolean).join(", ");
  if(query===lastManualAddressQuery){
    setManualAddressMapStatus("This address is already shown on the map. Drag the pin to fine-tune the exact entrance.","success");
    return;
  }
  setManualAddressMapStatus("Searching this address… the map will move automatically.","loading");
  manualAddressTimer=setTimeout(()=>geocodeAddressToMap({silent:true,requestId}),950);
}
async function geocodeAddressToMap(options={}){
  clearTimeout(manualAddressTimer);
  const requestId=Number(options.requestId)||++manualAddressGeocodeRequest;
  const a=collectManualAddress();
  if(!a.area||!/^\d{6}$/.test(a.pincode||"")){
    const message="Enter Area / Village and a valid 6-digit PIN code before searching this address.";
    if(!options.silent)setManualAddressMapStatus(message,"error");
    return;
  }
  const query=[a.houseNumber,a.building,a.street,a.landmark,a.area,a.postOffice,a.pincode,"India"].filter(Boolean).join(", ");
  if(query===lastManualAddressQuery&&!options.force){
    setManualAddressMapStatus("This address is already shown on the map. Drag the pin to fine-tune the exact entrance.","success");
    return;
  }
  const button=document.getElementById("findAddressOnMap");
  if(button){button.disabled=true;button.textContent="Finding address…";}
  setManualAddressMapStatus("Searching the address and updating the map…","loading");
  try{
    const maps=await loadGoogleMaps();
    googleGeocoder=googleGeocoder||new maps.Geocoder();
    const response=await googleGeocoder.geocode({
      address:query,
      componentRestrictions:{country:"IN"},
      region:"IN"
    });
    if(requestId!==manualAddressGeocodeRequest)return;
    const results=response.results||[];
    const getPin=result=>(result.address_components||[]).find(c=>c.types.includes("postal_code"))?.long_name?.replace(/\D/g,"")||"";
    const withPin=results.filter(result=>getPin(result));
    const exactPinMatch=withPin.find(result=>getPin(result)===a.pincode);
    const noPinResult=results.find(result=>!getPin(result));
    const pinMatch=exactPinMatch||(!withPin.length?results[0]:noPinResult);
    if(!pinMatch)throw new Error("The address result did not match PIN code "+a.pincode+". Please add a nearby landmark or check the PIN code.");
    const point=pinMatch.geometry?.location;
    if(!point)throw new Error("No map point was returned for this address.");
    const lat=typeof point.lat==="function"?point.lat():point.lat;
    const lng=typeof point.lng==="function"?point.lng():point.lng;
    if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng)))throw new Error("Invalid map coordinates.");
    if(requestId!==manualAddressGeocodeRequest)return;
    manualPinTouched=false;updateDeliveryPinState();
    setManualPoint(Number(lat),Number(lng),pinMatch.formatted_address||query);
    manualSelected.addressDetails=a;
    manualSelected.fullAddress=a.fullAddress||formatManualAddress(a);
    await initManualMap();
    if(requestId!==manualAddressGeocodeRequest)return;
    if(manualMap){
      manualMap.panTo({lat:Number(lat),lng:Number(lng)});
      manualMap.setZoom(19);
      if(window.google?.maps?.event)google.maps.event.trigger(manualMap,"resize");
    }
    if(manualMarker)manualMarker.position={lat:Number(lat),lng:Number(lng)};
    lastManualAddressQuery=query;
    const confirm=document.getElementById("confirmManualLocation");
    if(confirm){confirm.hidden=false;}
    const hint=document.getElementById("manualLocationHint");
    if(hint)hint.textContent="Map moved to the address you entered. Drag the red pin or tap your exact home / delivery gate to fine-tune it.";
    setManualAddressMapStatus("✓ Map updated to: "+(pinMatch.formatted_address||query)+". Move the pin to your exact entrance before checking delivery.","success");
  }catch(error){
    if(requestId!==manualAddressGeocodeRequest)return;
    console.warn("Live address-to-map lookup failed:",error);
    setManualAddressMapStatus(error?.message||"Could not find this address. Add a nearby landmark or check the PIN code.","error");
  }finally{
    if(requestId===manualAddressGeocodeRequest&&button){button.disabled=false;button.textContent="Find typed address on map";}
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
    setManualSearchMessage(offices.length===1?"Opening the map for this PIN…":`${offices.length} areas found for PIN ${q}. Choose the one nearest to your address.`);
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
        if(requestId!==manualSearchRequest || input.value.trim()!==q || locationWizardStep!==1 || !document.getElementById("manualLocationModal")?.classList.contains("show"))return;
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
        manualPinTouched=false;updateDeliveryPinState();
        input.value=q;
        fillAddressField("addrArea",item.name);
        fillAddressField("addrStreet","");
        fillAddressField("addrLandmark","");
        fillAddressField("addrPostOffice",item.name);
        fillAddressField("addrPincode",q);
        const addressPanel=document.getElementById("manualAddressPanel");if(addressPanel)addressPanel.hidden=false;
        showLocationWizardStep(2);
        await initManualMap();
        if(manualMap){manualMap.setCenter({lat:Number(lat),lng:Number(lng)});manualMap.setZoom(18);setTimeout(()=>google.maps.event.trigger(manualMap,"resize"),120);}
        if(manualMarker)manualMarker.position={lat:Number(lat),lng:Number(lng)};
        if(hint)hint.textContent=`${item.name} selected. Set the pin at your delivery entrance.`;
        reverseGeocodeManualPoint(Number(lat),Number(lng));
        if(locationWizardStep===2 && document.getElementById("manualLocationModal")?.classList.contains("show")){
          const details=document.getElementById("deliveryAddressDetails");
          details?.focus({preventScroll:true});
          details?.scrollIntoView({
            block:"start",
            behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"
          });
        }

      }catch(error){
        console.error("Selected PIN locality geocoding failed:",error);
        if(hint)hint.textContent=`Could not locate ${item.name} on the map. Try another nearby post office or enter the address manually.`;
        setManualSearchMessage(`The locality list was found, but map lookup failed for ${item.name}. Check Google Maps Geocoding API and billing, or choose another option.`);
      }finally{
        results.querySelectorAll("button").forEach(b=>b.disabled=false);
      }
    }));
    if(offices.length===1)results.querySelector("[data-result-index]")?.click();
  }catch(error){
    console.error("PIN code location search failed:",error);
    if(requestId===manualSearchRequest)setManualSearchMessage("PIN code search is temporarily unavailable. Please try again or enter the address manually.");
  }finally{if(btn){btn.disabled=false;btn.textContent="Search PIN";}}
}
function resetManualMapToShop(){
  manualSelected=null;manualPinTouched=false;updateDeliveryPinState();lastManualAddressQuery="";manualAddressGeocodeRequest++;clearTimeout(manualAddressTimer);
  const results=document.getElementById("manualSearchResults");if(results)results.innerHTML="";
  const confirm=document.getElementById("confirmManualLocation");if(confirm){confirm.hidden=false;}
  showLocationWizardStep(2);
  if(manualMap){manualMap.setCenter({lat:STORE.lat,lng:STORE.lon});manualMap.setZoom(15);manualMarker.position={lat:STORE.lat,lng:STORE.lon};}
  const h=document.getElementById("manualLocationHint");if(h)h.textContent="Map reset near Bake & Grill. Tap or drag the pin to your exact delivery location.";
}

async function confirmManualLocation(){
  if(locationWizardStep!==2){setManualSearchMessage("Please complete Step 1 and Step 2 before checking delivery.");return;}
  const confirm=document.getElementById("confirmManualLocation");
  if(confirm?.disabled)return;
  if(!manualSelected||!manualPinTouched){
    const notice=document.getElementById("deliveryPinNotice");
    document.getElementById("deliveryPinRequired").hidden=false;
    document.getElementById("deliveryPinTitle")?.focus({preventScroll:true});
    notice?.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
    return;
  }
  const addressDetails=collectManualAddress();
  if(!addressDetails.area){alert("Please enter your Area / Village.");document.getElementById("addrArea")?.focus();return;}
  if(!/^\d{6}$/.test(addressDetails.pincode)){alert("Please enter a valid 6-digit PIN code.");document.getElementById("addrPincode")?.focus();return;}
  const loc={...manualSelected,addressDetails,fullAddress:formatManualAddress(addressDetails)};
  const addressRequest=manualAddressGeocodeRequest;
  if(confirm)confirm.disabled=true;
  // Do not leave an older, previously confirmed address active while checking a new pin.
  customerLocation=null; distanceKm=null; routeDurationMin=null; routeDistanceSource=null; renderCart(); renderDeliveryEligibilityBar();
  try{
    const route=await getRoadRoute(loc.lat,loc.lon);
    if(addressRequest!==manualAddressGeocodeRequest||locationWizardStep!==2||!manualPinTouched)return;
    if(route.outsideArea){distanceKm=null;routeDurationMin=null;setStatus(`❌ This pin is at least ${route.straightKm.toFixed(1)} KM away in a straight line, so it is outside our 8 KM road-delivery limit.`,"bad");showDeliveryNotEligible("We deliver up to 8 km by road. Please choose a nearer address.",route.straightKm);return;}
    if(!Number.isFinite(route.distanceKm)){throw new Error("Road distance unavailable");}
    distanceKm=route.distanceKm; routeDurationMin=route.durationMin; routeDistanceSource=route.source||"Road routing";
    const rule=getDeliveryRule(distanceKm);
    if(!rule){renderCart();setStatus(`❌ Road distance ${distanceKm.toFixed(1)} KM • No delivery above ${maxDeliveryRoadKm} KM.`,"bad");showDeliveryNotEligible(`Bake & Grill currently delivers up to ${maxDeliveryRoadKm} km by road. Please select a closer address.`,distanceKm);return;}
    customerLocation={lat:loc.lat,lon:loc.lon,accuracy:null,source:"manual-map",label:loc.label||"",addressDetails:loc.addressDetails,fullAddress:loc.fullAddress};
    saveCustomerDeliveryPreference();
    setEligibleLocationStatus("Location selected", distanceKm, rule.minOrder);
    renderCart();
    releaseLocationGate(false);
    showDeliveryEligibilityResult(rule,distanceKm,routeDurationMin);
  }catch(e){
    if(addressRequest!==manualAddressGeocodeRequest||locationWizardStep!==2||!manualPinTouched)return;
    console.error("Delivery road-distance verification failed:",e);
    const message=e?.message||"Road distance could not be verified";
    setStatus("⚠️ " + message + " Your pin is saved in this picker; please retry in a moment.","bad");
    alert("Could not verify the road distance right now. Your selected pin has not been lost. Please check your internet connection and try Confirm again. If this continues, the road-routing service may be blocked or unavailable.");
  }finally{
    if(confirm)confirm.disabled=false;
  }
}
let savedAddressRender = 0;
async function showSavedDeliveryAddresses() {
  const panel = document.getElementById("savedDeliveryAddresses");
  const slots = document.getElementById("savedDeliverySlots");
  const message = document.getElementById("savedDeliveryMessage");
  const gate = document.getElementById("locationGate");
  if (!panel || !slots || !message) return;
  const generation = ++savedAddressRender;
  const user = window.auth?.currentUser;
  panel.hidden = true;
  slots.replaceChildren();
  message.textContent = "";
  if (!user?.phoneNumber || !window.db) return;
  const ref = window.db.collection("customers").doc(user.uid);
  const isCurrent = () => generation === savedAddressRender && window.auth?.currentUser?.uid === user.uid && gate?.classList.contains("show");
  const currentAddress = deliveryRecordFromCurrent();
  let data;
  try { data = (await ref.get()).data()?.savedDeliveryAddresses || {}; }
  catch { return; }
  if (!isCurrent()) return;
  panel.hidden = false;
  for (const slot of ["Home", "Work"]) {
    const record = data[slot];
    const valid = deliveryRecordIsValid(record);
    const row = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = slot;
    row.append(title);
    if (valid) {
      const summary = document.createElement("p");
      summary.textContent = record.fullAddress || record.label || "Saved delivery pin";
      row.append(summary);
    }
    const addButton = (label, action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.style.margin = "4px 6px 4px 0";
      button.textContent = label;
      button.onclick = async () => {
        if (!isCurrent()) return;
        const buttons = [...slots.querySelectorAll("button")];
        buttons.forEach(control => { control.disabled = true; });
        try { await action(); }
        catch { if (isCurrent()) message.textContent = "Could not complete this action. Please try again."; }
        finally { buttons.forEach(control => { control.disabled = false; }); }
      };
      row.append(button);
    };
    if (valid) {
      addButton("Use " + slot, async () => {
        if (!deliveryEnabled) { message.textContent = "Delivery is currently paused."; return; }
        message.textContent = "Checking the road distance…";
        const route = await getRoadRoute(record.lat, record.lon);
        if (!isCurrent() || !deliveryEnabled) return;
        if (!Number.isFinite(route.distanceKm) || !getDeliveryRule(route.distanceKm)) {
          message.textContent = "Delivery is unavailable for this saved address.";
          return;
        }
        const updated = {...record, distanceKm:route.distanceKm, routeDurationMin:route.durationMin ?? null, routeDistanceSource:route.source || "Road routing"};
        if (applySavedDeliveryRecord(updated, user.uid)) persistDeliveryRecord(updated);
        else message.textContent = "Could not verify this saved address. Please check its map pin again.";
      });
      addButton("Remove " + slot, async () => {
        await ref.update("savedDeliveryAddresses." + slot, firebase.firestore.FieldValue.delete());
        if (isCurrent()) await showSavedDeliveryAddresses();
      });
    }
    if (currentAddress) {
      addButton((valid ? "Replace " : "Save ") + slot + " with current address", async () => {
        await ref.set({savedDeliveryAddresses:{[slot]:currentAddress}}, {merge:true});
        if (isCurrent()) await showSavedDeliveryAddresses();
      });
    }
    slots.append(row);
  }
  if (!currentAddress && !["Home","Work"].some(slot => deliveryRecordIsValid(data[slot]))) {
    message.textContent = "Confirm a delivery address first, then you can save it as Home or Work.";
  }
}

function showLocationChoice(){
  const gate=document.getElementById("locationGate");if(!gate)return;
  gate.classList.add("show");
  void showSavedDeliveryAddresses();
  const status=document.getElementById("locationGateStatus");
  if(status){status.hidden=false;status.textContent="Choose GPS or PIN / map to check your delivery area.";}
  const result=document.getElementById("locationEligibilityResult");
  if(result){result.hidden=true;result.innerHTML="";}
  const retry=document.getElementById("locationGateRetry");
  if(retry){retry.hidden=false;retry.disabled=false;retry.textContent="📍 Use my current location";}
  const manual=document.getElementById("locationGateManual");
  if(manual){manual.hidden=false;manual.textContent="⌖ Enter PIN code / Choose on map";}
  const close=document.getElementById("locationGateClose");if(close)close.hidden=false;
  const help=document.getElementById("locationGateHelp");if(help)help.hidden=false;
}
function showDeliveryEligibilityResult(rule,km,routeMinutes){
  const result=document.getElementById("manualStep3Result");if(!result)return;
  const travel=Number(routeMinutes)>0?Math.max(1,Math.round(Number(routeMinutes)))+" min drive":"Road distance verified";
  const address=customerLocation?.fullAddress||formatManualAddress(customerLocation?.addressDetails||{});
  result.innerHTML='<div class="eligibility-success-icon">✓</div><span class="eligibility-kicker">DELIVERY AVAILABLE</span><h3>Great news! We deliver to your location.</h3><div class="eligibility-address-summary"><small>DELIVER TO</small><b>'+escHtml(address||"Selected delivery address")+'</b></div><div class="eligibility-distance"><span>Verified road distance</span><strong>'+Number(km).toFixed(1)+' km</strong><small>'+travel+'</small></div><div class="eligibility-minimum"><span>Your minimum order value</span><strong>₹'+Number(rule.minOrder).toLocaleString("en-IN")+'</strong><small>Order at least this amount to place a delivery order</small></div><div class="eligibility-free-delivery">✓ Free delivery for this distance</div><div class="eligibility-tier-note">Minimum order is based on actual road distance, not straight-line distance.</div>';
  result.classList.remove("not-eligible");
  const next=document.getElementById("confirmLocationAndContinue");if(next)next.hidden=false;
  showLocationWizardStep(3);
}

function showDeliveryNotEligible(message,km){
  const result=document.getElementById("manualStep3Result");if(!result)return;
  const dist=Number.isFinite(Number(km))?Number(km).toFixed(1)+" km":"Not verified";
  result.innerHTML='<div class="eligibility-warning-icon">!</div><span class="eligibility-kicker">DELIVERY NOT AVAILABLE</span><h3>This location is outside our delivery area.</h3><div class="eligibility-distance"><span>Checked distance</span><strong>'+dist+'</strong></div><p class="eligibility-warning-copy">'+escHtml(message||"We deliver up to 8 km by road.")+'</p>';
  result.classList.add("not-eligible");
  const next=document.getElementById("confirmLocationAndContinue");if(next)next.hidden=true;
  showLocationWizardStep(3);
}

function renderDeliveryEligibilityBar(){
  const bar=document.getElementById("deliveryEligibilityBar");if(!bar)return;
  const delivery=getVerifiedDeliveryState();
  if(!delivery.verified){bar.hidden=true;return;}
  const area=customerLocation?.addressDetails?.area||customerLocation?.label||"Selected location";
  bar.hidden=false;
  bar.innerHTML='<div class="delivery-eligibility-copy"><span class="delivery-eligibility-check">✓</span><div><b>Delivery available to '+escHtml(area)+'</b><small>'+delivery.km.toFixed(1)+' km by road • Minimum order ₹'+delivery.rule.minOrder+' • Free delivery</small></div></div><button type="button" id="changeDeliveryLocationBar">Change</button>';
  document.getElementById("changeDeliveryLocationBar")?.addEventListener("click",showLocationChoice);
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
    manualPinTouched=false;updateDeliveryPinState();
    const panel=document.getElementById("manualAddressPanel");if(panel)panel.hidden=false;
    showLocationWizardStep(2);
    initManualMap().then(()=>{
      if(requestId!==gpsRequestToken)return;
      if(manualMap){manualMap.setCenter({lat,lng:lon});manualMap.setZoom(18);setTimeout(()=>google.maps.event.trigger(manualMap,"resize"),120);}
      if(manualMarker)manualMarker.position={lat,lng:lon};
    });
    reverseGeocodeManualPoint(lat,lon);
    const acc=Number.isFinite(accuracy)&&accuracy>0?Math.round(accuracy):null;
    const message=acc!==null
      ? `GPS detected (±${acc} m). Check or complete your address in Step 2, then continue to Step 3.`
      : "GPS location detected. Complete your address in Step 2, then continue to Step 3.";
    if(gateStatus)gateStatus.textContent=message;
    setStatus("✅ GPS location detected. Please complete Step 2: address details.","ok");
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
function setEligibleLocationStatus(title, distance, minimum) {
  const status = $("#locationStatus");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const details = document.createElement("dl");
  for (const [label, value] of [
    ["Road distance", distance.toFixed(1) + " km"],
    ["Minimum order", money(minimum)],
    ["Delivery charge", "Free"]
  ]) {
    const item = document.createElement("div");
    const term = document.createElement("dt");
    const amount = document.createElement("dd");
    term.textContent = label;
    amount.textContent = value;
    item.append(term, amount);
    details.append(item);
  }
  status.className = "location-status ok location-summary";
  status.replaceChildren(heading, details);
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
function renderCheckoutDeliveryAddress(){
  const loc=document.querySelector("#checkoutLocation");
  const checkBtn=document.getElementById("checkoutCheckLocation");
  if(customerLocation&&distanceKm!==null){
    const rule=getDeliveryRule(distanceKm);
    if(loc)loc.textContent=rule?((customerLocation.fullAddress||customerLocation.label||"Selected delivery location")+" · "+distanceKm.toFixed(1)+" km by road"):"❌ Road distance "+distanceKm.toFixed(1)+" KM • Outside our current delivery area. Please change location.";
    if(checkBtn)checkBtn.textContent="Change";
  }else{
    if(loc)loc.textContent=deliveryEnabled
      ?"📍 Delivery location not checked. Check or select your location below to calculate road distance, minimum order and delivery availability."
      :"📍 Delivery is currently OFF. Location checking is paused until delivery resumes.";
    if(checkBtn)checkBtn.textContent="Check location";
  }
}

function openCheckout(){
  if(!cart.length){alert("Please add at least one item.");return}
  // When delivery is OFF, still open checkout to show the prominent warning.
  if(deliveryEnabled){
    const delivery=getVerifiedDeliveryState();
    if(!delivery.verified){
      alert("Please verify your driving distance before checkout. Select your exact delivery pin first.");
      showLocationChoice();
      return;
    }
  }
  showCustomerForm(false);
  renderCheckoutDeliveryAddress();
  document.body.classList.add("checkout-open");
  const checkoutModal=$("#checkoutModal");
  checkoutModal?.classList.add("show");
  checkoutModal?.setAttribute("aria-hidden","false");
  updateCheckoutDeliveryOffNotice();
  renderCheckoutOrderSummary();
  checkoutModal.querySelector(".checkout-scroll").scrollTop=0;
  $("#checkoutTitle").focus({preventScroll:true});
  bgTrack("begin_checkout",{currency:"INR",value:cart.reduce((sum,i)=>sum+Number(i.price||0)*Number(i.qty||1),0),items:analyticsItems(cart)});
}

function closeCheckout(){
  const modal=$("#checkoutModal");
  modal?.classList.remove("show");
  modal?.setAttribute("aria-hidden","true");
  document.body.classList.remove("checkout-open");
}

async function proceedOrderCore(){
  if(!deliveryEnabled){updateCheckoutDeliveryOffNotice(true);return}
  if(!firebaseCheck())return;
  const delivery=getVerifiedDeliveryState();
  if(Number.isFinite(delivery.km)&&delivery.km>maxDeliveryRoadKm){alert(`Delivery is currently available within ${maxDeliveryRoadKm} km by road.`);return;}
  if(!delivery.verified){alert("Please confirm your delivery pin and verify the road distance before placing the order.");showLocationChoice();return}
  const instructionsInput=document.getElementById("orderInstructions");
  // Order instructions are optional; keep a customer's note when provided.
  const orderInstructions=String(instructionsInput?.value||"").trim().slice(0,500);
  const nameInput=document.querySelector("#checkoutName"), phoneInput=document.querySelector("#checkoutPhone"), phoneError=document.querySelector("#checkoutPhoneError");
  const name=String(nameInput?.value||customerProfile?.name||"").trim();
  const phone=String(phoneInput?.value||customerProfile?.phone||"").replace(/\D/g,"");
  if(name.length<2 || !/^\d{10}$/.test(phone)){if(phoneError){phoneError.textContent="Please enter your name and valid 10-digit phone number.";phoneError.style.display="block";} (name.length<2?nameInput:phoneInput)?.focus();return}
  if(phoneError)phoneError.style.display="none";
  const alternateInput = document.getElementById("checkoutAlternatePhone");
  const alternateError = document.getElementById("checkoutAlternateError");
  const alternatePhone = (alternateInput?.value || "").trim();
  const alternateInvalid = alternatePhone && (!/^\d{10}$/.test(alternatePhone) || alternatePhone === phone);
  if (alternateError) {
    alternateError.textContent = alternateInvalid ? "Enter a different 10-digit mobile number, or leave this blank." : "";
    alternateError.hidden = !alternateInvalid;
  }
  if (alternateInput) alternateInput.setAttribute("aria-invalid", alternateInvalid ? "true" : "false");
  if (alternateInvalid) { alternateInput.focus(); return; }
  const rule=delivery.rule; if(!rule){alert("Sorry, this address is outside our 8 KM delivery area.");return}
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0); if(total<rule.minOrder){alert(`Minimum order for ${rule.label} is ${money(rule.minOrder)}. Please add ${money(rule.minOrder-total)} more.`);return}
  // Orders are only attached to a phone-verified Firebase customer account.
  try{await window.customerAuthReady;}catch(_){}
  if(!isCustomerPhoneVerified(phone)){
    if(!window.BakeGrillCustomerAccount?.requestCheckoutOtp)throw new Error("Mobile verification is unavailable. Refresh and try again.");
    await window.BakeGrillCustomerAccount.requestCheckoutOtp();
    return;
  }
  const verifiedUser=window.auth.currentUser;
  customerProfile={name,phone,uid:verifiedUser.uid,phoneVerified:true};
  localStorage.setItem(CUSTOMER_PROFILE_KEY,JSON.stringify(customerProfile));
  try{
    await db.collection("customers").doc(verifiedUser.uid).set({
      name,phone,phoneNumber:verifiedUser.phoneNumber,updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
  }catch(e){console.error("Customer profile save:",e);alert("Could not save your customer profile. Please try again.");return;}
  const lat=Number(customerLocation.lat),lon=Number(customerLocation.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||(lat===0&&lon===0)){
    alert("Your delivery map point is missing. Please reopen location selection, place the pin on your home or delivery gate, and confirm again.");
    return;
  }
  // Coordinates stay in order data for routing and map links; they are never printed as plain text in customer/admin UI.
  // Create one canonical clickable Google Maps URL from the confirmed customer pin.
  // The customer never needs to type or see latitude/longitude.
  const locationUrl=`https://www.google.com/maps?q=${encodeURIComponent(lat+","+lon)}`;
  const items=cart.map(i=>({id:String(i.id||""),name:i.name,category:getMenuItems().find(x=>String(x.id)===String(i.id))?.category||"",size:i.size||"",qty:i.qty,price:Number(i.price),extras:Array.isArray(i.extras)?i.extras.map(e=>({id:e.id,name:e.name,price:Number(e.price||0),qty:Math.max(1,Number(e.qty||1)),priceOnRequest:!!e.priceOnRequest})):[]}));
  const fingerprintBytes = new TextEncoder().encode(JSON.stringify([
    verifiedUser.uid, name, phone, alternatePhone, orderInstructions, lat, lon, total, items
  ]));
  const digest = await crypto.subtle.digest("SHA-256", fingerprintBytes);
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const previousAttempt = readOrderDraft(sessionStorage, ORDER_ATTEMPT_KEY);
  const orderId = previousAttempt?.fingerprint === fingerprint && /^BG[0-9A-F]{16}$/.test(previousAttempt.orderId)
    ? previousAttempt.orderId : "BG" + Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  try { sessionStorage.setItem(ORDER_ATTEMPT_KEY, JSON.stringify({ fingerprint, orderId })); } catch {}
  const order={orderId,name:customerProfile.name,phone,...(alternatePhone ? {alternatePhone} : {}),customerId:customerProfile.uid||null,orderInstructions,address:customerLocation.fullAddress||"Delivery address confirmed",deliveryAddress:customerLocation.fullAddress||"",addressDetails:customerLocation.addressDetails||null,customerLocation:{lat,lon,accuracy:customerLocation.accuracy?Number(customerLocation.accuracy):null,source:customerLocation.source||"confirmed-location"},locationUrl,googleMapsUrl:locationUrl,mapUrl:locationUrl,mapLink:locationUrl,distanceKm:Number(distanceKm.toFixed(2)),routeDurationMin:routeDurationMin?Number(routeDurationMin.toFixed(1)):null,distanceType:`${routeDistanceSource||"Road"} road distance`,rule:rule.label,minOrder:rule.minOrder,total:Number(total),status:"NEW",createdAt:firebase.firestore.FieldValue.serverTimestamp(),items};
  const orderRef=db.collection("orders").doc(orderId);
  try{
    const batch=db.batch(); const statusRef=db.collection("publicStatuses").doc(orderId);
    batch.set(orderRef,order); batch.set(statusRef,{orderId,status:"NEW",customerId:customerProfile.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    await batch.commit();
  }catch(e){
    const existing = await orderRef.get({source:"server"}).catch(() => null);
    if (!existing?.exists || existing.data().customerId !== verifiedUser.uid) {
      console.error("Firebase order save failed:",e);
      alert("Could not confirm your order. Retry with the same details so we can check the original submission.");
      return;
    }
  }
  // One successful Firestore write = one order. Never send the order to WhatsApp and never run this twice.
  bgTrack("purchase",{transaction_id:orderId,value:Number(total),currency:"INR",shipping:0,tax:0,items:items.map(i=>({item_id:String(i.id||""),item_name:String(i.name||""),item_variant:String(i.size||""),price:Number(i.price||0),quantity:Number(i.qty||1)}))});
  cart=[]; renderCart(); localStorage.setItem("bakeGrillActiveOrder",orderId);
  try { sessionStorage.removeItem(ORDER_ATTEMPT_KEY); } catch {}
  if(alternateInput)alternateInput.value="";
  const wantsOrderPush=!!document.getElementById('checkoutOrderNotifications')?.checked;
  await window.BakeGrillPush?.attachToOrder?.(orderId,wantsOrderPush);
  closeCheckout(); closeCart();
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
    if(button){button.disabled=false;button.textContent=button.dataset.originalText||"Place order →";}
  }
}

function showOrderComplete(orderId,total){
  // Keep the customer on the ordering page while the restaurant reviews the new order.
  // The live tracking view opens automatically as soon as the restaurant accepts it.
  $("#orderComplete")?.classList.remove("show");
  document.body.classList.remove("order-complete-open");
  const pushReady=!!window.BakeGrillPush?.isEnabled?.();
  if(pushReady)window.BakeGrillPush?.refreshUI?.();
  else{
    const pushButton=document.getElementById("enableNotifications");
    if(pushButton){pushButton.textContent="🔔 Get Order Updates on This Phone";pushButton.disabled=false;pushButton.hidden=false;}
    const pushHelp=document.getElementById("pushHelpText");
    if(pushHelp){pushHelp.hidden=false;pushHelp.textContent="Your order has been sent to Bake & Grill. Enable notifications to receive status updates on this phone.";}
  }
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
let statusUnsubscribe=null, privateOrderUnsubscribe=null, etaRefreshTimer=null, latestTrackData=null, latestTrackMapUrl='', lastObservedTrackStatus=null, lastObservedTrackOrderId=null;
const ORDER_STEPS=["NEW","ACCEPTED","PREPARING","READY","OUT FOR DELIVERY","DELIVERED"];
function statusLabel(s){return ({NEW:"Waiting for restaurant",ACCEPTED:"Order accepted",PREPARING:"Being prepared",READY:"Ready for pickup", "OUT FOR DELIVERY":"Out for delivery",DELIVERED:"Delivered",CANCELLED:"Restaurant not accepting orders"})[s]||s;}
function renderTrackStatus(s, mapUrl="", statusData={}){
  const box=$("#liveStatus"); if(!box)return;
  if(s==="CANCELLED"){box.innerHTML=`<div class="track-cancel"><div class="track-status-icon">⛔</div><strong>Order cancelled</strong><p>${escHtml(statusData.cancelReason || "Your order has been cancelled.")}</p></div>`;return;}
  const idx=Math.max(0,ORDER_STEPS.indexOf(s));
  const cancelBtn=s==="NEW"?`<button type="button" class="customer-cancel-order" id="customerCancelOrder">❌ Cancel Order</button><small class="cancel-note">You can cancel before the restaurant accepts your order.</small>`:"";
  const mapLink=/^https:\/\/www\.google\.com\/maps\//i.test(String(mapUrl||""))?`<a class="order-address-link customer-track-map-link" href="${escHtml(mapUrl)}" target="_blank" rel="noopener noreferrer">📍 Open your delivery location in Google Maps</a>`:"";
  const progress=ORDER_STEPS.length>1?Math.round(idx/(ORDER_STEPS.length-1)*100):0;
  const updatedRaw=statusData.updatedAt||statusData.acceptedAt||statusData.outForDeliveryAt;
  const updatedDate=updatedRaw?.toDate?.()||(typeof updatedRaw==="number"?new Date(updatedRaw):updatedRaw?new Date(updatedRaw):null);
  const updatedText=updatedDate&&!Number.isNaN(updatedDate.getTime())?updatedDate.toLocaleString("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}):"Live status";
  const progressHtml=`<div class="customer-track-progress"><div class="customer-track-progress-head"><span>Order progress</span><b>${progress}%</b></div><div class="customer-track-progress-bar"><span style="width:${progress}%"></span></div><small>Last update: ${escHtml(updatedText)}</small></div>`;
  let etaHtml="";
  if(s==="ACCEPTED"||s==="OUT FOR DELIVERY"){
    const isDelivery=s==="OUT FOR DELIVERY";
    const raw=isDelivery?statusData.outForDeliveryAt:statusData.acceptedAt;
    const started=typeof raw==="number"?raw:(raw?.toMillis?.()||Date.parse(raw)||Date.now());
    const totalMinutes=isDelivery?20:Number(statusData.expectedDeliveryMinutes||0);
    if(totalMinutes>0){
      const elapsed=Math.max(0,Math.floor((Date.now()-started)/60000));
      const remaining=Math.max(0,totalMinutes-elapsed);
      const etaText=remaining===0?"Due any moment":`${remaining} minutes`;
      etaHtml=`<div class="customer-eta"><strong>🛵 Estimated delivery</strong><span>${etaText}</span></div>`;
    }
  }
  box.innerHTML=`<div class="track-status-top"><div><small>ORDER STATUS</small><strong>${escHtml(statusLabel(s))}</strong></div><span class="track-live-dot">● LIVE</span></div>${progressHtml}<div class="track-timeline">${ORDER_STEPS.map((step,i)=>`<div class="track-step ${i<=idx?"done":""} ${i===idx?"current":""}"><span>${i<idx?"✓":i===idx?"●":""}</span><b>${escHtml(statusLabel(step))}</b></div>`).join("")}</div>${etaHtml}${mapLink}${cancelBtn}`;
  if(cancelBtn) document.getElementById("customerCancelOrder").onclick=cancelActiveOrder;
  const correction=statusData.correction;
  if(correction){
    const label={pending:"Awaiting restaurant response",acknowledged:"Restaurant received your request",declined:"Restaurant declined the correction"}[correction.state];
    if(label)box.insertAdjacentHTML("beforeend",`<p class="cancel-note"><strong>${label}</strong> · ${escHtml(correction.note)}</p>`);
  }else if(statusData.canRequestCorrection&&["NEW","ACCEPTED"].includes(s)){
    const button=document.createElement("button");
    button.type="button";button.className="secondary";button.textContent="Request an order correction";
    button.onclick=async()=>{
      const note=prompt("What needs correcting? The restaurant will review your request.")?.trim();
      if(!note)return;
      if(note.length>300){alert("Keep your request within 300 characters.");return;}
      button.disabled=true;
      try{
        await db.collection("orders").doc(statusData.orderId).update({
          correction:{note,state:"pending",updatedAt:firebase.firestore.FieldValue.serverTimestamp()}
        });
      }catch{alert("The correction could not be sent. Check the latest order status.");button.disabled=false;}
    };
    box.append(button);
  }
}
function subscribeToOrder(id){
  if(!firebaseCheck())return;
  const clean=String(id||"").trim();if(!clean)return;
  statusUnsubscribe?.();privateOrderUnsubscribe?.();
  if(etaRefreshTimer){clearInterval(etaRefreshTimer);etaRefreshTimer=null;}
  if(lastObservedTrackOrderId!==clean){lastObservedTrackOrderId=clean;lastObservedTrackStatus=null;latestTrackMapUrl='';latestTrackData=null;}
  localStorage.setItem("bakeGrillActiveOrder",clean);
  const liveStatus=document.getElementById("liveStatus");
  if(liveStatus)liveStatus.textContent="Connecting to live order status…";
  let publicExists=false,publicData=null,privateOrder=null,publicFailed=false;
  const renderBest=()=>{
    const data=publicExists&&publicData?{...publicData}:privateOrder?{...privateOrder}:null;
    if(data&&privateOrder){
      data.orderId=clean;
      data.canRequestCorrection=privateOrder.customerId===window.auth?.currentUser?.uid;
      data.correction=privateOrder.correction;
    }
    if(!data){
      if(publicFailed&&liveStatus)liveStatus.textContent="Live status is unavailable. Reconnecting to your order…";
      return;
    }
    const status=String(data.status||"NEW").toUpperCase();
    if(lastObservedTrackStatus!==null&&lastObservedTrackStatus!==status)window.showCustomerOrderStatusPopup?.(status,clean);
    lastObservedTrackStatus=status;
    latestTrackData=data;
    renderTrackStatus(status,latestTrackMapUrl,data);
    if(window.BGReviews)window.BGReviews.render(document.getElementById("customerReviewPrompt"),clean,status,db);
    if((status==="ACCEPTED"||status==="OUT FOR DELIVERY")&&!etaRefreshTimer){
      etaRefreshTimer=setInterval(()=>{
        if(latestTrackData)renderTrackStatus(String(latestTrackData.status||"").toUpperCase(),latestTrackMapUrl,latestTrackData);
      },60000);
    }else if(status!=="ACCEPTED"&&status!=="OUT FOR DELIVERY"&&etaRefreshTimer){
      clearInterval(etaRefreshTimer);etaRefreshTimer=null;
    }
    if(status==="ACCEPTED"){
      const help=document.getElementById("pushHelpText");
      if(help&&!help.hidden)help.textContent="Your order has been accepted! Follow its live progress here.";
      openTrackingView();
    }
    if(status==="DELIVERED"){
      localStorage.setItem("bakeGrillLastDeliveredOrder",clean);
      cart=[];renderCart();
      const box=document.getElementById("liveStatus");
      if(box&&!box.querySelector(".order-finished-note"))box.insertAdjacentHTML("beforeend",'<p class="order-finished-note">Thank you! Your order has been delivered.</p>');
      localStorage.removeItem("bakeGrillActiveOrder");
      statusUnsubscribe?.();statusUnsubscribe=null;
      privateOrderUnsubscribe?.();privateOrderUnsubscribe=null;
      document.body.classList.remove("location-required");
      document.getElementById("locationGate")?.classList.remove("show");
    }
    if(status==="CANCELLED"){
      localStorage.removeItem("bakeGrillActiveOrder");
      statusUnsubscribe?.();statusUnsubscribe=null;
      privateOrderUnsubscribe?.();privateOrderUnsubscribe=null;
      document.body.classList.remove("location-required");
      document.getElementById("locationGate")?.classList.remove("show");
    }
  };
  statusUnsubscribe=db.collection("publicStatuses").doc(clean).onSnapshot(snapshot=>{
    publicExists=snapshot.exists;publicData=snapshot.exists?(snapshot.data()||{}):null;
    renderBest();
  },error=>{
    console.warn("Public order status listener failed; using private order fallback:",error);
    publicFailed=true;renderBest();
  });
  privateOrderUnsubscribe=db.collection("orders").doc(clean).onSnapshot(snapshot=>{
    privateOrder=snapshot.exists?(snapshot.data()||{}):null;
    if(privateOrder){
      latestTrackMapUrl=privateOrder.googleMapsUrl||privateOrder.locationUrl||privateOrder.mapUrl||privateOrder.mapLink||latestTrackMapUrl||"";
      renderBest();
    }else if(!publicExists&&publicFailed&&liveStatus){
      liveStatus.textContent="Your order could not be found. Please contact Bake & Grill.";
    }
  },error=>console.warn("Private order tracking fallback failed:",error));
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


window.BGReorderOrder=function(order, append=false){
  if(!order||!Array.isArray(order.items)||!order.items.length){alert("This order has no saved item details to reorder.");return false;}
  const catalogue=getMenuItems(),prepared=[],skipped=[];
  for(const line of order.items){
    const lineId=String(line.id||"");
    const wantedName=normalizeSearch(line.name||"");
    const item=catalogue.find(x=>lineId&&String(x.id)===lineId)||catalogue.find(x=>normalizeSearch(x.name)===wantedName);
    if(!item||!isInStock(item.id)){skipped.push(line.name||"An unavailable item");continue;}
    const pizza=item.type==="pizza"||!!item.prices;
    if(pizza&&line.size&&!Object.prototype.hasOwnProperty.call(item.prices||{},line.size)){skipped.push(item.name+" ("+line.size+" unavailable)");continue;}
    const size=pizza?(Object.prototype.hasOwnProperty.call(item.prices||{},line.size)?line.size:(Object.keys(item.prices||{})[0]||"Ekla Bite")):"";
    const base=pizza?Number(item.prices?.[size]||0):(item.price==="Ask"?NaN:Number(item.price||0));
    if(!Number.isFinite(base)||base<=0){skipped.push(item.name+" (price unavailable)");continue;}
    const extras=[];
    for(const oldExtra of (Array.isArray(line.extras)?line.extras:[])){
      let extra=null,price=0;
      if(String(oldExtra.id)==="__extra_cheese_20"){if(extraCheesePrice(item)<=0){skipped.push(item.name+": Extra Cheese");continue;}extra={id:"__extra_cheese_20",name:"Extra Cheese"};price=extraCheesePrice(item);}
      else{
        const addon=getAddons().find(x=>String(x.id)===String(oldExtra.id))||getAddons().find(x=>normalizeSearch(x.name)===normalizeSearch(oldExtra.name));
        if(addon){
          const ap=addonPriceForSize(addon,size);
          if(typeof ap==="number"&&Number.isFinite(ap)){extra=addon;price=ap;}
        }
      }
      if(extra)extras.push({id:extra.id,name:extra.name,price,qty:Math.max(1,Number(oldExtra.qty||1)),priceOnRequest:false});
      else skipped.push(item.name+": "+(oldExtra.name||"unavailable topping"));
    }
    const qty=Math.min(40,Math.max(1,Number(line.qty||1)));
    const extraTotal=extras.reduce((sum,x)=>sum+x.price*x.qty,0);
    const key=item.id+"|"+size+"|"+extras.map(x=>x.id).sort().join(",");
    prepared.push({key,id:item.id,name:item.name,size,basePrice:base,price:base+extraTotal,qty,extras});
  }
  if(!prepared.length){alert("None of these items are currently available. Please choose from the current menu.");return false;}
  const total=prepared.reduce((sum,x)=>sum+x.price*x.qty,0);
  const note=skipped.length?"\nUnavailable/skipped: "+skipped.join(", "):"";
  if(append&&cart.length+prepared.length>40){alert("Your cart can hold up to 40 lines.");return false;}
  if(!confirm((append?"Add ":"Reorder ")+prepared.reduce((n,x)=>n+x.qty,0)+" item(s) for "+money(total)+" using today's prices?"+note))return false;
  cart=append?[...cart,...prepared]:prepared;
  window.BakeGrillCustomerAccount?.close?.();
  renderCart();
  openCart();
  return true;
};

function groupCartUrl(){
  const lines=cart.map(line=>[String(line.id),line.size||"",line.qty,
    (line.extras||[]).map(extra=>[String(extra.id),extra.qty])]);
  const url=new URL(location.pathname,location.origin);
  url.hash="group-cart="+encodeURIComponent(JSON.stringify(lines));
  return url.href;
}
function importGroupCart(link){
  try {
    const url=new URL(link,location.origin);
    if(url.origin!==location.origin||!url.hash.startsWith("#group-cart=")||url.hash.length>14000)throw Error();
    const lines=JSON.parse(decodeURIComponent(url.hash.slice(12)));
    const validId=id=>typeof id==="string"&&/^[\w-]{1,48}$/.test(id);
    const validQty=qty=>Number.isInteger(qty)&&qty>=1&&qty<=40;
    if(!Array.isArray(lines)||!lines.length||lines.length>40)throw Error();
    const items=lines.map(([id,size,qty,extras])=>{
      if(!validId(id)||!["","Ekla Bite","Bondhu Bite","Family Bite"].includes(size)||!validQty(qty)
        ||!Array.isArray(extras)||extras.length>40)throw Error();
      return {id,size,qty,extras:extras.map(([extraId,count])=>{
        if(!validId(extraId)||!validQty(count))throw Error();
        return {id:extraId,qty:count};
      })};
    });
    return window.BGReorderOrder({items},true);
  } catch {
    $("#groupCartStatus").textContent="That cart link could not be read.";
    return false;
  }
}
$("#groupCartShare").onclick=async ()=>{
  if(!cart.length){$("#groupCartStatus").textContent="Add items before sharing.";return;}
  const url=groupCartUrl();
  if(new URL(url).hash.length>14000){$("#groupCartStatus").textContent="Share a smaller selection.";return;}
  try{
    if(navigator.share){await navigator.share({title:"Bake & Grill group cart",url});return;}
    await navigator.clipboard.writeText(url);
    $("#groupCartStatus").textContent="Link copied. Send it to your group.";
  }catch(error){if(error.name!=="AbortError")prompt("Copy this cart link",url);}
};
$("#groupCartImport").onclick=()=>{
  const incoming=location.hash.startsWith("#group-cart=")?location.href:"";
  const link=incoming||prompt("Paste a Bake & Grill group cart link");
  if(link&&importGroupCart(link)){
    if(incoming){
      history.replaceState(null,"",location.pathname+location.search);
      $("#openSharedCart").hidden=true;
      $("#groupCartImport").textContent="Add a friend’s selections";
    }
    $("#groupCartStatus").textContent="Selections added to your cart.";
  }
};
if(location.hash.startsWith("#group-cart=")){
  $("#openSharedCart").hidden=false;
  $("#openSharedCart").onclick=openCart;
  $("#groupCart").open=true;
  $("#groupCartImport").textContent="Add the shared selections";
  $("#groupCartStatus").textContent="Set your delivery address, then open the cart to add these selections.";
}

function enablePerformanceHints(){
  document.documentElement.style.setProperty("--app-dvh", "100dvh");
  if("connection" in navigator && navigator.connection?.saveData){ document.documentElement.classList.add("save-data"); }
  document.querySelectorAll("img").forEach(img=>{
    if(!img.decoding)img.decoding="async";
    const highPriority=img.fetchPriority==="high"||img.closest(".brand")||img.closest(".hero-art");
    if(highPriority){img.loading="eager";return;}
    if(!img.loading)img.loading="lazy";
  });
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
        if(target==='offers') document.getElementById('homeOffersSection')?.scrollIntoView({behavior:'smooth',block:'start'});
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

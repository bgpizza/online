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
let accountMode="login";
let currentUser=null;
let favoriteIds=new Set(JSON.parse(localStorage.getItem("bg_favorites_v1")||"[]"));
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

function bindFavoriteButtons(){document.querySelectorAll(".fav-btn").forEach(b=>b.onclick=e=>{e.stopPropagation();const id=b.dataset.fav;if(favoriteIds.has(id))favoriteIds.delete(id);else favoriteIds.add(id);localStorage.setItem("bg_favorites_v1",JSON.stringify([...favoriteIds]));renderHeroPicks();renderMenu(document.querySelector(".cat.active")?.dataset.cat||"all");if(currentUser)renderAccountFavorites();});}
function setupCustomerAccount(){
  $("#openAccount")?.addEventListener("click",()=>{$("#accountModal").classList.add("show");updateAccountUI();});
  $("#closeAccount")?.addEventListener("click",()=>$("#accountModal").classList.remove("show"));
  $("#showLoginTab")?.addEventListener("click",()=>setAccountMode("login"));
  $("#showSignupTab")?.addEventListener("click",()=>setAccountMode("signup"));
  $("#accountSubmit")?.addEventListener("click",submitAccount);
  $("#forgotPassword")?.addEventListener("click",forgotPassword);
  $("#accountLogout")?.addEventListener("click",()=>auth.signOut());
  $("#saveProfile")?.addEventListener("click",saveProfile);
  setAccountMode("login");
}
function setAccountMode(mode){accountMode=mode;const signup=mode==="signup";$("#showLoginTab")?.classList.toggle("active",!signup);$("#showSignupTab")?.classList.toggle("active",signup);$("#accountName").style.display=signup?"block":"none";$("#accountPhone").style.display=signup?"block":"none";$("#accountAddress").style.display=signup?"block":"none";$("#accountSubmit").textContent=signup?"🆕 Create Free Account":"🔐 Login";$("#forgotPassword").style.display=signup?"none":"block";$("#accountMsg").textContent="";}
async function submitAccount(){if(!firebaseCheck()||!window.auth)return;const email=$("#accountEmail").value.trim(),password=$("#accountPassword").value;try{if(!email||!password)throw new Error("Email and password are required.");if(accountMode==="signup"){if(password.length<6)throw new Error("Password must be at least 6 characters.");const cred=await auth.createUserWithEmailAndPassword(email,password);const profile={name:$("#accountName").value.trim()||"Customer",phone:$("#accountPhone").value.trim(),address:$("#accountAddress").value.trim(),email,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()};await db.collection("users").doc(cred.user.uid).set(profile,{merge:true});$("#accountMsg").textContent="✅ Account created. Welcome to Bake & Grill!";}else{await auth.signInWithEmailAndPassword(email,password);$("#accountMsg").textContent="✅ Logged in.";}}catch(e){$("#accountMsg").textContent="❌ "+(e.message||"Account action failed");}}
async function forgotPassword(){const email=$("#accountEmail").value.trim();if(!email)return $("#accountMsg").textContent="Enter your email first.";try{await auth.sendPasswordResetEmail(email);$("#accountMsg").textContent="✅ Password reset email sent.";}catch(e){$("#accountMsg").textContent="❌ "+e.message;}}
function updateAccountUI(){const guest=$("#accountGuest"),userBox=$("#accountUser"),label=$("#accountLabel");if(!guest||!userBox)return;if(currentUser){guest.style.display="none";userBox.style.display="block";label.textContent="My Account";}else{guest.style.display="block";userBox.style.display="none";label.textContent="Account";}}
async function loadAccountData(){if(!currentUser||!firebaseReady)return;try{const snap=await db.collection("users").doc(currentUser.uid).get();const d=snap.exists?snap.data():{};$("#accountWelcome").textContent=`Welcome back, ${d.name||currentUser.email?.split("@")[0]||"Customer"} 👋`;$("#profileName").value=d.name||"";$("#profilePhone").value=d.phone||"";$("#profileEmail").value=currentUser.email||d.email||"";$("#profileAddress").value=d.address||"";const orders=await db.collection("orders").where("userId","==",currentUser.uid).get();const arr=[];orders.forEach(x=>arr.push(x.data()));arr.sort((a,b)=>String(b.createdAt?.toDate?.()||b.createdAt||"").localeCompare(String(a.createdAt?.toDate?.()||a.createdAt||"")));$("#accountOrderCount").textContent=arr.length;$("#myOrders").innerHTML=arr.length?arr.slice(0,10).map(o=>`<div class="order-mini"><strong>${escHtml(o.orderId)} • ${escHtml(o.status||"NEW")}</strong><small>${money(o.total||0)} • ${formatDate(o.createdAt)}</small><br><button class="secondary small-btn" data-reorder="${escHtml(o.orderId)}">🔄 Order Again</button></div>`).join(""):"<div class=muted>No account orders yet.</div>";document.querySelectorAll("[data-reorder]").forEach(b=>b.onclick=()=>reorderFromOrder(b.dataset.reorder));renderAccountFavorites();}catch(e){console.error("Account load",e);$("#accountUserMsg").textContent="Could not load account data.";}}
function renderAccountFavorites(){const el=$("#myFavorites");if(!el)return;const fav=getMenuItems().filter(x=>favoriteIds.has(x.id)&&isInStock(x.id));el.innerHTML=fav.length?fav.map(x=>`<div class="fav-chip"><b>${escHtml(x.name)}</b><small>${escHtml(x.category)}</small><button data-favadd="${escHtml(x.id)}">Add to cart</button></div>`).join(""):"<div class=muted>No favourites yet. Tap ♡ on any item.</div>";document.querySelectorAll("[data-favadd]").forEach(b=>b.onclick=()=>addItem(b.dataset.favadd,""));}
async function saveProfile(){if(!currentUser||!firebaseReady)return;try{await db.collection("users").doc(currentUser.uid).set({name:$("#profileName").value.trim()||"Customer",phone:$("#profilePhone").value.trim(),address:$("#profileAddress").value.trim(),email:currentUser.email,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});$("#accountUserMsg").textContent="✅ Profile saved.";}catch(e){$("#accountUserMsg").textContent="❌ "+e.message;}}
async function reorderFromOrder(orderId){if(!firebaseCheck())return;try{const s=await db.collection("orders").doc(orderId).get();if(!s.exists)return;cart=[];(s.data().items||[]).forEach(i=>{const x=getMenuItems().find(m=>m.name===i.name);if(x&&isInStock(x.id))for(let n=0;n<Number(i.qty||1);n++)addItem(x.id,i.size||"");});renderCart();$("#accountModal").classList.remove("show");openCart();}catch(e){alert("Could not repeat this order.");}}

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
  $("#openCart").onclick=openCart; $("#closeCart").onclick=closeCart; $("#overlay").onclick=closeCart; $("#cartLocationBtn").onclick=checkLocation;
  $("#checkoutBtn").onclick=openCheckout; $("#closeModal").onclick=()=>$("#checkoutModal").classList.remove("show");
  $("#sendWhatsApp").onclick=sendWhatsApp;
  setupCustomerAccount();
  $("#trackWhatsApp")?.addEventListener("click",trackOrder);
  $("#trackLive")?.addEventListener("click",trackLiveStatus);
  if(firebaseReady){
    if(window.auth) auth.onAuthStateChanged(async user=>{ currentUser=user||null; updateAccountUI(); if(user) await loadAccountData(); });
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
  const btn=document.getElementById("checkoutBtn"); if(btn) btn.disabled=!deliveryEnabled;
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
  wrap.querySelectorAll(".hero-add").forEach(b=>b.onclick=()=>addItem(b.dataset.id,b.dataset.size||""));
  bindFavoriteButtons();
}
function heroCard(x){
  const badge=x.badge||"BEST CHOICE";
  if(x.type==="pizza") { const size="Ekla Bite", price=Number(x.prices?.[size]||0); return `<article class="hero-product"><div class="hero-product-visual">${emoji[x.category]||"🍕"}<span>⭐ ${escHtml(badge)}</span></div><div class="hero-product-body"><button class="fav-btn" data-fav="${escHtml(x.id)}" aria-label="Favourite">${favoriteIds.has(x.id)?"♥":"♡"}</button><small>${escHtml(x.category)}</small><h3>${escHtml(x.name)}</h3><p>${escHtml(x.description||"Freshly prepared for you")}</p><div class="hero-product-foot"><b>From ${money(price)}</b><button class="hero-add" data-id="${escHtml(x.id)}" data-size="${size}">ADD</button></div></div></article>`; }
  return `<article class="hero-product"><div class="hero-product-visual">${emoji[x.category]||"🍽️"}<span>⭐ ${escHtml(badge)}</span></div><div class="hero-product-body"><button class="fav-btn" data-fav="${escHtml(x.id)}" aria-label="Favourite">${favoriteIds.has(x.id)?"♥":"♡"}</button><small>${escHtml(x.category)}</small><h3>${escHtml(x.name)}</h3><p>${escHtml(x.description||"Freshly prepared for you")}</p><div class="hero-product-foot"><b>${x.price==="Ask"?"Ask on WhatsApp":money(x.price)}</b><button class="hero-add" data-id="${escHtml(x.id)}">ADD</button></div></div></article>`;
}
function renderMenu(filter="all"){
  const groups={}; let visible=0;
  getMenuItems().forEach(x=>{if(!isInStock(x.id))return;if(filter!=="all"&&x.category!==filter)return;if(!matchesSearch(x))return;(groups[x.category]??=[]).push(x);visible++;});
  const menu=$("#menu");
  if(!visible){menu.innerHTML=`<section class="no-search-results"><div>🔎</div><h2>No exact match</h2><p>Try another word or one of the quick searches above.</p><button class="primary" id="showAllResults">Show all items</button></section>`;$("#showAllResults")?.addEventListener("click",()=>{$("#clearSearch")?.click()});}
  else menu.innerHTML=Object.entries(groups).map(([cat,arr])=>`<section class="section" id="sec-${slug(cat)}"><h2>${emoji[cat]||"🍽️"} ${cat}<span class="result-count">${arr.length}</span></h2><div class="grid">${arr.map(card).join("")}</div></section>`).join("");
  const hint=$("#searchHint"); if(hint&&searchQuery)hint.textContent=`Found ${visible} matching item${visible===1?"":"s"} for “${searchQuery}”.`;
  document.querySelectorAll(".add").forEach(b=>b.onclick=()=>addItem(b.dataset.id,b.dataset.size||""));
  document.querySelectorAll(".size-add").forEach(b=>b.onclick=()=>addItem(b.dataset.id,b.dataset.size));
  bindFavoriteButtons();
}
function card(x){
  const badge=x.badge || (x.bestChoice?"BEST CHOICE":"");
  const badgeHtml=badge?`<span class="item-badge">⭐ ${escHtml(badge)}</span>`:"";
  if(x.type==="pizza") return `<article class="card"><div class="card-img">${emoji[x.category]||"🍕"}${badgeHtml}<button class="card-fav fav-btn" data-fav="${escHtml(x.id)}" aria-label="Favourite">${favoriteIds.has(x.id)?"♥":"♡"}</button></div><div class="card-body"><div class="code">CODE ${x.id}</div><div class="name">${x.name}</div><div class="desc">${x.description?escHtml(x.description):`Freshly prepared • ${x.category}`}</div><div class="size-grid">${Object.entries(x.prices).map(([size,price])=>`<button class="size-add" data-id="${x.id}" data-size="${size}"><span>${size.replace(" Bite","")}</span><b>${money(price)}</b></button>`).join("")}</div></div></article>`;
  return `<article class="card"><div class="card-img">${emoji[x.category]||"🍽️"}${badgeHtml}</div><div class="card-body"><div class="code">CODE ${x.id}</div><div class="name">${x.name}</div><div class="desc">${x.description?escHtml(x.description):x.category}</div><div class="price-row"><span class="price">${x.price==="Ask"?"Ask on WhatsApp":money(x.price)}</span><button class="add" data-id="${x.id}" data-size="">ADD</button></div></div></article>`;
}
function addItem(id,size){
  const x=getMenuItems().find(i=>i.id===id); if(!x)return;
  let price=x.type==="pizza"?Number(x.prices[size||"Ekla Bite"]):x.price;
  if(price==="Ask"){alert("This add-on price will be confirmed on WhatsApp.");price=0;}
  const key=id+"|"+(size||""); const found=cart.find(i=>i.key===key);
  if(found) found.qty++; else cart.push({key,id,name:x.name,size:size||"",price,qty:1});
  renderCart();
}
function renderCart(){
  $("#cartCount").textContent=cart.reduce((s,i)=>s+i.qty,0);
  $("#cartItems").innerHTML=cart.length?`<div class="cart-list">${cart.map((i,idx)=>`<div class="cart-line"><div><div class="cart-name">${i.name}</div><div class="cart-meta">${i.size?i.size+" • ":""}${i.price?money(i.price):"Price to confirm"}</div></div><div class="qty"><button onclick="changeQty(${idx},-1)">−</button><span>${i.qty}</span><button onclick="changeQty(${idx},1)">+</button></div></div>`).join("")}</div>`:`<p class="muted">Your cart is empty.</p>`;
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
  if(!deliveryEnabled){alert("Delivery is currently unavailable. Please try again later.");return}
  if(!cart.length){alert("Please add at least one item.");return} if(customerLocation===null||distanceKm===null){alert("Please check your delivery location first.");return}
  const rule=getDeliveryRule(distanceKm); if(!rule){alert("Sorry, this address is outside our 8 KM delivery area.");return}
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0); if(total<rule.minOrder){alert(`Minimum order for ${rule.label} is ${money(rule.minOrder)}. Please add ${money(rule.minOrder-total)} more.`);return}
  $("#checkoutModal").classList.add("show"); closeCart();
}
async function sendWhatsApp(){
  if(!deliveryEnabled){alert("Delivery is currently unavailable. Please try again later.");return}
  if(!firebaseCheck())return;
  const name=$("#customerName").value.trim(),phone=$("#customerPhone").value.trim(),addr=$("#address").value.trim();
  if(!name||!phone||!addr){alert("Please fill in name, phone and delivery address.");return}
  if(!customerLocation||distanceKm===null){alert("Please check your delivery location first.");return}
  const rule=getDeliveryRule(distanceKm); if(!rule){alert("Sorry, this address is outside our 8 KM delivery area.");return}
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0); if(total<rule.minOrder){alert(`Minimum order for ${rule.label} is ${money(rule.minOrder)}. Please add ${money(rule.minOrder-total)} more.`);return}
  const orderId="BG"+Date.now().toString().slice(-8), lines=cart.map((i,n)=>`${n+1}. ${i.name}${i.size?" ("+i.size+")":""} x${i.qty} = ${i.price?money(i.price*i.qty):"price confirm"}`).join("\n"), map=`https://www.google.com/maps?q=${customerLocation.lat},${customerLocation.lon}`;
  const order={orderId,name,phone,address:addr,distanceKm:Number(distanceKm.toFixed(2)),routeDurationMin:routeDurationMin?Number(routeDurationMin.toFixed(1)):null,distanceType:"OSRM road distance",rule:rule.label,minOrder:rule.minOrder,total:Number(total),status:"NEW",userId:currentUser?currentUser.uid:null,createdAt:firebase.firestore.FieldValue.serverTimestamp(),items:cart.map(i=>({name:i.name,size:i.size,qty:i.qty,price:i.price}))};
  try{
    await db.collection("orders").doc(orderId).set(order);
    await db.collection("publicStatuses").doc(orderId).set({status:"NEW",updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
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

const WA_NUMBER="918240266267";
const STORE={lat:22.392655,lon:88.224307,label:"Bake & Grill, Sanjua-Bakhrahat"};
const DELIVERY={maxKm:8,charge:0};
function getDeliveryRule(km){
  if(km<=1) return {minOrder:199,charge:0,label:"0–1 KM"};
  if(km<=3) return {minOrder:299,charge:0,label:"1.1–3 KM"};
  if(km<=8) return {minOrder:499,charge:0,label:"3.1–8 KM"};
  return null;
}
let cart=[], customerLocation=null, distanceKm=null;
const STOCK_KEY="bake_grill_stock_v1";
function loadStock(){
  try{return JSON.parse(localStorage.getItem(STOCK_KEY)||"{}")}catch(e){return {}}
}
function isInStock(id){
  const s=loadStock()[id];
  return !(s && s.active===false);
}
function getStock(id){
  const s=loadStock()[id];
  return s || {qty:"",active:true};
}

const $=s=>document.querySelector(s);
const money=n=>"₹"+Number(n).toLocaleString("en-IN");

const categoryOrder=["Veg Pizza","Chicken Pizza","Burgers","Veg Sandwich","Chicken Sandwich","Quick Bites","Family Combos","Bondhu Combos","Solo Combos","Add-ons"];
const emoji={ "Veg Pizza":"🍕","Chicken Pizza":"🍗","Burgers":"🍔","Veg Sandwich":"🥪","Chicken Sandwich":"🥪","Quick Bites":"🍟","Family Combos":"👨‍👩‍👧‍👦","Bondhu Combos":"👥","Solo Combos":"👤","Add-ons":"🧀" };

function init(){
  const cats=$("#categories");
  cats.innerHTML='<button class="cat active" data-cat="all">All</button>'+categoryOrder.map(c=>`<button class="cat" data-cat="${c}">${emoji[c]} ${c}</button>`).join("");
  cats.addEventListener("click",e=>{
    const b=e.target.closest(".cat"); if(!b)return;
    document.querySelectorAll(".cat").forEach(x=>x.classList.remove("active")); b.classList.add("active");
    renderMenu(b.dataset.cat);
    if(b.dataset.cat!=="all") document.getElementById("sec-"+slug(b.dataset.cat))?.scrollIntoView({behavior:"smooth",block:"start"});
  });
  renderMenu("all");
  $("#locateBtn").onclick=checkLocation;
  $("#openCart").onclick=openCart; $("#closeCart").onclick=closeCart; $("#overlay").onclick=closeCart; $("#cartLocationBtn").onclick=checkLocation;
  $("#checkoutBtn").onclick=openCheckout; $("#closeModal").onclick=()=>$("#checkoutModal").classList.remove("show");
  $("#sendWhatsApp").onclick=sendWhatsApp;
}

function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,"-")}
function renderMenu(filter="all"){
  const groups={};
  MENU_ITEMS.forEach(x=>{if(!isInStock(x.id))return;if(filter!=="all"&&x.category!==filter)return;(groups[x.category]??=[]).push(x)});
  $("#menu").innerHTML=Object.entries(groups).map(([cat,arr])=>`
    <section class="section" id="sec-${slug(cat)}"><h2>${emoji[cat]||"🍽️"} ${cat}</h2>
    <div class="grid">${arr.map(card).join("")}</div></section>`).join("");
  document.querySelectorAll(".add").forEach(b=>b.onclick=()=>addItem(b.dataset.id,b.dataset.size||""));
  document.querySelectorAll(".size-select").forEach(s=>s.onchange=e=>{const btn=e.target.parentElement.querySelector(".add");btn.dataset.size=e.target.value;btn.dataset.price=e.target.selectedOptions[0].dataset.price});
}
function card(x){
  if(x.type==="pizza"){
    return `<article class="card"><div class="card-img">${emoji[x.category]||"🍕"}</div><div class="card-body">
      <div class="code">CODE ${x.id}</div><div class="name">${x.name}</div><div class="desc">Freshly prepared • ${x.category}</div>
      <select class="size-select">${Object.entries(x.prices).map(([s,p])=>`<option value="${s}" data-price="${p}">${s} — ${money(p)}</option>`).join("")}</select>
      <div class="price-row"><span class="price">${money(x.prices["Ekla Bite"]) }+</span><button class="add" data-id="${x.id}" data-size="Ekla Bite">ADD</button></div>
    </div></article>`;
  }
  return `<article class="card"><div class="card-img">${emoji[x.category]||"🍽️"}</div><div class="card-body">
    <div class="code">CODE ${x.id}</div><div class="name">${x.name}</div><div class="desc">${x.category}</div>
    <div class="price-row"><span class="price">${x.price==="Ask"?"Ask on WhatsApp":money(x.price)}</span><button class="add" data-id="${x.id}" data-size="">ADD</button></div>
  </div></article>`;
}
function addItem(id,size){
  const x=MENU_ITEMS.find(i=>i.id===id); if(!x)return;
  let price=x.type==="pizza"?Number(x.prices[size||"Ekla Bite"]):x.price;
  if(price==="Ask"){ alert("This add-on price will be confirmed on WhatsApp."); price=0; }
  const key=id+"|"+(size||"");
  const found=cart.find(i=>i.key===key);
  if(found) found.qty++; else cart.push({key,id,name:x.name,size:size||"",price,qty:1});
  renderCart(); openCart();
}
function renderCart(){
  $("#cartCount").textContent=cart.reduce((s,i)=>s+i.qty,0);
  $("#cartItems").innerHTML=cart.length?`<div class="cart-list">${cart.map((i,idx)=>`
    <div class="cart-line"><div><div class="cart-name">${i.name}</div><div class="cart-meta">${i.size?i.size+" • ":""}${i.price?money(i.price):"Price to confirm"}</div></div>
    <div class="qty"><button onclick="changeQty(${idx},-1)">−</button><span>${i.qty}</span><button onclick="changeQty(${idx},1)">+</button></div></div>`).join("")}</div>`:`<p class="muted">Your cart is empty.</p>`;
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const rule=distanceKm===null?null:getDeliveryRule(distanceKm);
  const info=rule
    ? `📍 ${distanceKm.toFixed(1)} KM • Minimum order ${money(rule.minOrder)} • 🚚 FREE`
    : (distanceKm!==null ? "❌ No delivery above 8 KM" : "📍 Check location to see your delivery rule");
  const oldInfo=document.getElementById("cartRuleInfo");
  if(oldInfo) oldInfo.textContent=info;
  $("#cartTotal").textContent=money(total);
}
function changeQty(i,d){cart[i].qty+=d;if(cart[i].qty<=0)cart.splice(i,1);renderCart()}
function openCart(){$("#cartDrawer").classList.add("open");$("#overlay").classList.add("show")}
function closeCart(){$("#cartDrawer").classList.remove("open");$("#overlay").classList.remove("show")}
function checkLocation(){
  if(!navigator.geolocation){setStatus("This browser does not support location sharing.","bad");return}
  setStatus("Checking your location…");
  navigator.geolocation.getCurrentPosition(pos=>{
    customerLocation={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy};
    distanceKm=haversine(STORE.lat,STORE.lon,customerLocation.lat,customerLocation.lon);
    const rule=getDeliveryRule(distanceKm);
    if(rule){
      setStatus(`✅ ${rule.label} • Minimum order ${money(rule.minOrder)} • Delivery FREE`,"ok");
    }else{
      setStatus(`❌ ${distanceKm.toFixed(1)} KM • No delivery above 8 KM.`,"bad");
    }
    renderCart();
    $("#checkoutLocation").textContent=rule?`✅ ${distanceKm.toFixed(1)} KM • Minimum order ${money(rule.minOrder)} • FREE delivery`:`❌ ${distanceKm.toFixed(1)} KM • Delivery unavailable`;
  },err=>setStatus("Location permission was not granted. Please allow location access and try again.","bad"),{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}
function setStatus(t,c=""){$("#locationStatus").textContent=t;$("#locationStatus").className="location-status "+c}
function haversine(a,b,c,d){
  const R=6371, p1=a*Math.PI/180,p2=c*Math.PI/180,dp=(c-a)*Math.PI/180,dl=(d-b)*Math.PI/180;
  const v=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.sqrt(v));
}
function openCheckout(){
  if(!cart.length){alert("Please add at least one item.");return}
  if(customerLocation===null||distanceKm===null){alert("Please check your delivery location first.");return}
  const rule=getDeliveryRule(distanceKm);
  if(!rule){alert("Sorry, this address is outside our 8 KM delivery area.");return}
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0);
  if(total<rule.minOrder){alert(`Minimum order for ${rule.label} is ${money(rule.minOrder)}. Please add ${money(rule.minOrder-total)} more.`);return}
  $("#checkoutModal").classList.add("show"); closeCart();
}
function sendWhatsApp(){
  const name=$("#customerName").value.trim(),phone=$("#customerPhone").value.trim(),addr=$("#address").value.trim();
  if(!name||!phone||!addr){alert("Please fill in name, phone and delivery address.");return}
  if(!customerLocation||distanceKm===null){alert("Please check your delivery location first.");return}
  const rule=getDeliveryRule(distanceKm);
  if(!rule){alert("Sorry, this address is outside our 8 KM delivery area.");return}
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0);
  if(total<rule.minOrder){alert(`Minimum order for ${rule.label} is ${money(rule.minOrder)}. Please add ${money(rule.minOrder-total)} more.`);return}
  const lines=cart.map((i,n)=>`${n+1}. ${i.name}${i.size?" ("+i.size+")":""} x${i.qty} = ${i.price?money(i.price*i.qty):"price confirm"}`).join("\n");
  const map=`https://www.google.com/maps?q=${customerLocation.lat},${customerLocation.lon}`;
  const msg=`🍕 *BAKE & GRILL — NEW ORDER*\n\n👤 Name: ${name}\n📞 Phone: ${phone}\n📍 Address: ${addr}\n📏 Distance: ${distanceKm.toFixed(1)} KM\n📌 Rule: ${rule.label}\n🛒 Minimum Order: ${money(rule.minOrder)}\n🗺️ Customer Location: ${map}\n🚚 Delivery Charge: FREE\n\n*ORDER ITEMS*\n${lines}\n\n💰 *Order Total: ${money(total)}*\n\nPlease confirm my order.`;
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`,"_blank");
}
init();

window.addEventListener("storage",e=>{if(e.key===STOCK_KEY){renderMenu(document.querySelector(".cat.active")?.dataset.cat||"all");}});
window.addEventListener("focus",()=>renderMenu(document.querySelector(".cat.active")?.dataset.cat||"all"));

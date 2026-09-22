
const MASTER_ID="admin";
const MASTER_PASSWORD="BakeGrill@123";
const AUTH_KEY="bake_grill_master_auth_v1";

function showMasterApp(){
  const gate=document.getElementById("loginGate"), app=document.getElementById("masterApp");
  if(gate) gate.style.display="none";
  if(app) app.style.display="block";
}
function showLogin(){
  const gate=document.getElementById("loginGate"), app=document.getElementById("masterApp");
  if(gate) gate.style.display="flex";
  if(app) app.style.display="none";
}
function initLogin(){
  if(sessionStorage.getItem(AUTH_KEY)==="1"){showMasterApp();return;}
  showLogin();
  const form=document.getElementById("loginForm");
  form?.addEventListener("submit",e=>{
    e.preventDefault();
    const id=document.getElementById("loginId").value.trim();
    const pw=document.getElementById("loginPassword").value;
    const err=document.getElementById("loginError");
    if(id===MASTER_ID && pw===MASTER_PASSWORD){
      sessionStorage.setItem(AUTH_KEY,"1");
      showMasterApp();
      render();
      if(typeof renderOrders==="function") renderOrders();
    }else{
      err.textContent="Invalid User ID or Password";
    }
  });
}

const STOCK_KEY="bake_grill_stock_v1";
const ORDER_KEY="bake_grill_orders_v1";
const $=s=>document.querySelector(s);
let stock=load();
function load(){try{return JSON.parse(localStorage.getItem(STOCK_KEY)||"{}")}catch(e){return {}}}
function save(){localStorage.setItem(STOCK_KEY,JSON.stringify(stock))}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
const cats=[...new Set(MENU_ITEMS.map(x=>x.category))];
$("#filter").innerHTML='<option value="all">All Categories</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join("");
function ensure(id){if(!stock[id])stock[id]={qty:"",active:true};return stock[id]}
function render(){
 const q=$("#search").value.toLowerCase().trim(), f=$("#filter").value;
 const rows=MENU_ITEMS.filter(x=>(f==="all"||x.category===f)&&(!q||x.name.toLowerCase().includes(q)||x.id.toLowerCase().includes(q)));
 $("#stockTable").innerHTML=rows.map(x=>{
   const s=ensure(x.id);
   const qty=s.qty===""?"":Number(s.qty);
   const cls=s.active?"available":"out";
   return `<tr>
    <td><b>${esc(x.id)}</b></td><td><b>${esc(x.name)}</b></td><td>${esc(x.category)}</td>
    <td><input class="qty-input" type="number" min="0" value="${qty}" data-id="${esc(x.id)}"></td>
    <td><select class="status ${cls}" data-id="${esc(x.id)}"><option value="on" ${s.active?"selected":""}>Available</option><option value="off" ${!s.active?"selected":""}>Out of Stock</option></select></td>
   </tr>`;
 }).join("");
 document.querySelectorAll(".qty-input").forEach(el=>el.oninput=()=>{ensure(el.dataset.id).qty=el.value===""?"":Math.max(0,Number(el.value))});
 document.querySelectorAll(".status").forEach(el=>el.onchange=()=>{ensure(el.dataset.id).active=el.value==="on";el.className="status "+(el.value==="on"?"available":"out");updateSummary()});
 updateSummary();
}
function updateSummary(){
 const all=MENU_ITEMS.map(x=>ensure(x.id)), available=all.filter(s=>s.active), out=all.filter(s=>!s.active);
 const low=all.filter(s=>s.active&&s.qty!==""&&Number(s.qty)<=5);
 $("#totalItems").textContent=all.length;$("#availableItems").textContent=available.length;$("#outItems").textContent=out.length;$("#lowItems").textContent=low.length;
}
$("#saveAll").onclick=()=>{save();alert("Stock updated. Customer site will use the new availability.");render()};
$("#allOn").onclick=()=>{MENU_ITEMS.forEach(x=>ensure(x.id).active=true);save();render()};
$("#allOff").onclick=()=>{if(confirm("Mark every item as Out of Stock?")){MENU_ITEMS.forEach(x=>ensure(x.id).active=false);save();render()}};
$("#search").oninput=render;$("#filter").onchange=render;
render();

function renderOrders(){
 const all=JSON.parse(localStorage.getItem(ORDER_KEY)||"[]"), f=$("#orderFilter")?.value||"ALL";
 const rows=f==="ALL"?all:all.filter(o=>o.status===f);
 $("#ordersTable").innerHTML=rows.length?rows.map(o=>`<tr><td><b>${esc(o.orderId)}</b></td><td>${esc(o.name)}<br><small>${esc(o.phone)}</small></td><td>₹${Number(o.total||0).toLocaleString("en-IN")}</td><td>${Number(o.distanceKm||0).toFixed(1)} KM</td><td><select class="order-status" data-id="${esc(o.orderId)}">${["NEW","ACCEPTED","PREPARING","READY","OUT FOR DELIVERY","DELIVERED","CANCELLED"].map(s=>`<option ${o.status===s?"selected":""}>${s}</option>`).join("")}</select></td><td>${new Date(o.createdAt).toLocaleString()}</td></tr>`).join(""):`<tr><td colspan="6">No orders on this browser yet.</td></tr>`;
 document.querySelectorAll(".order-status").forEach(el=>el.onchange=()=>{const a=JSON.parse(localStorage.getItem(ORDER_KEY)||"[]"),o=a.find(x=>x.orderId===el.dataset.id);if(o){o.status=el.value;localStorage.setItem(ORDER_KEY,JSON.stringify(a));renderOrders()}});
}
document.addEventListener("DOMContentLoaded",()=>{$("#orderFilter")?.addEventListener("change",renderOrders);renderOrders()});

document.addEventListener("DOMContentLoaded",initLogin);

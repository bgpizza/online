const STOCK_KEY="bake_grill_stock_v1";
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

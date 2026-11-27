(()=>{const panel=document.getElementById('bgAnalytics');if(!panel)return;const q=id=>document.getElementById(id);let busy=false,rows=[];const labels=['Active users','Add to carts','Checkouts','Legacy purchase events','Legacy event value','Sessions'];async function refresh(){if(busy||!document.getElementById('viewAnalytics').classList.contains('active-view')||!firebase.auth().currentUser)return;busy=true;q('bgAnalyticsStatus').textContent='Loading analytics…';try{const result=await firebase.functions().httpsCallable('masterAnalyticsV1')({days:Number(q('bgAnalyticsDays').value),dimension:q('bgAnalyticsDimension').value});const d=result.data;
const funnel=q('bgAnalyticsFunnel'), totals=d.totals?.[0]?.values;
funnel.hidden=!totals||totals.length<6;
const stages=[['Sessions',5],['Add to cart',1],['Checkout',2]];
const largest=Math.max(1,...stages.map(([,i])=>Number(totals?.[i])||0));
funnel.replaceChildren(...stages.map(([label,i])=>{
  const item=document.createElement('div'), name=document.createElement('span'), count=document.createElement('strong'), bar=document.createElement('progress');
  name.textContent=label;count.textContent=totals?.[i]||'0';
  bar.max=largest;bar.value=Number(totals?.[i])||0;bar.setAttribute('aria-label',label);
  item.append(name,count,bar);return item;
})); q('bgAnalyticsLive').textContent=d.live===null?'Unavailable':(d.live[0]?.values[0]||'0');q('bgAnalyticsCards').replaceChildren(...labels.map((label,i)=>{const el=document.createElement('div');const name=document.createElement('small');name.textContent=label;const val=document.createElement('strong');val.textContent=d.totals===null?'—':(i===4?'₹':'')+(d.totals[0]?.values[i]??'—');el.append(name,val);return el;}));rows=d.breakdown||[];q('bgAnalyticsExport').disabled=!rows.length;q('bgAnalyticsRows').replaceChildren(...rows.map(row=>{const tr=document.createElement('tr');[row.label,...labels.map((_,i)=>row.values[i]??'—')].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});return tr;}));q('bgAnalyticsStatus').textContent=(d.live===null||d.totals===null||d.breakdown===null?'Some reports unavailable. Check GA4 service account access. ':'Updated ')+new Date(d.updatedAt).toLocaleTimeString('en-IN');}catch(e){rows=[];q('bgAnalyticsFunnel').hidden=true;q('bgAnalyticsExport').disabled=true;q('bgAnalyticsLive').textContent='Unavailable';q('bgAnalyticsCards').replaceChildren();q('bgAnalyticsRows').replaceChildren();q('bgAnalyticsStatus').textContent='Analytics unavailable. Check deployment and GA4 permissions.';}finally{busy=false;}}window.renderAnalyticsOrderTotals = () => {
  if (!document.getElementById('viewAnalytics').classList.contains('active-view')) return;
  const output = q('bgOrderResults');
  if (typeof lastOrdersSnapshot === 'undefined' || !lastOrdersSnapshot) {
    output.textContent = 'Loading order records…';
    return;
  }
  const day = 86400000, offset = 19800000;
  const today = Math.floor((Date.now() + offset) / day);
  const earliest = today - Number(q('bgAnalyticsDays').value) + 1;
  let placed = 0, cancelled = 0, completed = 0, sales = 0;
  for (const order of currentOrders) {
    const time = order.createdAt?.toMillis?.() ?? new Date(order.createdAt || NaN).getTime();
    const orderDay = Math.floor((time + offset) / day);
    if (!(orderDay >= earliest && orderDay <= today)) continue;
    placed++;
    if (order.status === 'CANCELLED') cancelled++;
    if (order.status === 'DELIVERED') {
      completed++;
      sales += Number(order.total) || 0;
    }
  }
  const money = new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR'});
  output.replaceChildren(...[['Placed',placed],['Cancelled',cancelled],['Delivered / collected',completed],['Completed sales',money.format(sales)]].map(([label,value])=>{
    const card=document.createElement('div'), title=document.createElement('small'), figure=document.createElement('strong');
    title.textContent=label;
    figure.textContent=value;
    card.append(title,figure);
    return card;
  }));
};
window.addEventListener('bgAnalyticsOpen',()=>{window.renderAnalyticsOrderTotals();refresh();});
q('bgAnalyticsDays').addEventListener('change',window.renderAnalyticsOrderTotals);['bgAnalyticsDays','bgAnalyticsDimension'].forEach(id=>q(id).addEventListener('change',refresh));q('bgAnalyticsRefresh').addEventListener('click',refresh);q('bgAnalyticsExport').addEventListener('click',()=>{if(!rows.length)return;const csv=[['Segment',...labels],...rows.map(r=>[r.label,...r.values])].map(r=>r.map(v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"').join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='bake-grill-analytics.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});setInterval(refresh,60000);})();
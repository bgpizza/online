(function(){
  const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  window.switchMasterView=function(view){
    const map={orders:'viewOrders',inventory:'viewInventory',menu:'viewMenu'};
    $$('.master-view').forEach(v=>v.classList.remove('active-view'));
    const el=$('#'+map[view]); if(el)el.classList.add('active-view');
    $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    if(view==='inventory') renderInventoryCards();
    if(view==='menu') renderMenuCards();
    window.scrollTo({top:0,behavior:'instant'});
  };
  function mergedItems(){
    const base=Array.isArray(window.MENU_ITEMS)?window.MENU_ITEMS:[];
    return base.map(x=>window.liveMenu&&liveMenu[x.id]?{...x,...liveMenu[x.id]}:x);
  }
  function itemState(id){return (typeof stock!=='undefined' && stock[id])||{qty:'',active:true};}
  function priceOf(x){
    if(x.prices){const vals=Object.values(x.prices).map(Number).filter(v=>v>0);return vals.length?Math.min(...vals):0}
    return Number(x.price||0)
  }
  function imageOf(x){return x.image||x.imageUrl||x.img||'assets/logo.png'}
  let inventoryFilter='all';
  let inventoryStatusFilter='all';
  let menuFilter='all';
  let menuStatusFilter='all';
  function renderInventoryCards(){
    const root=$('#inventoryCards'); if(!root)return;
    const q=($('#masterInventorySearch')?.value||'').trim().toLowerCase();
    const items=mergedItems().filter(x=>{const st=itemState(x.id); const catOk=inventoryFilter==='all'||(inventoryFilter==='addons'&&x.category==='Add-ons'); const statusOk=inventoryStatusFilter==='all'||(inventoryStatusFilter==='out'&&st.active===false)||(inventoryStatusFilter==='in'&&st.active!==false)||(inventoryStatusFilter==='low'&&st.active!==false&&st.qty!==''&&Number(st.qty)<=5); return catOk&&statusOk&&(!q||String(x.name).toLowerCase().includes(q)||String(x.id).toLowerCase().includes(q));});
    const cats=[...new Set(items.map(x=>x.category||'Other'))];
    const all=mergedItems(), ins=all.filter(x=>itemState(x.id).active!==false), out=all.filter(x=>itemState(x.id).active===false), low=all.filter(x=>itemState(x.id).active!==false&&itemState(x.id).qty!==''&&Number(itemState(x.id).qty)<=5);
    $('#invAllCount').textContent=all.length;$('#invAddonCount').textContent=all.filter(x=>(x.category||'')==='Add-ons').length;$('#invOutCount').textContent=out.length;$('#invInCount').textContent=ins.length;$('#invLowCount').textContent=low.length;
    root.innerHTML=cats.map(cat=>{
      const ci=items.filter(x=>(x.category||'Other')===cat);
      const active=ci.filter(x=>itemState(x.id).active!==false).length;
      return `<section class="inv-category"><header><div><h3>${esc(cat)} <em>${ci.length}</em></h3><span>${active===ci.length?'In stock':active+' in stock'}</span></div><button class="cat-chevron" type="button" aria-expanded="true">⌃</button></header><div class="inv-items">${ci.map(x=>{const s=itemState(x.id);const on=s.active!==false;return `<article class="inv-item"><span class="veg-dot">▣</span><div class="inv-info"><b>${esc(x.name)}</b><small>${on?'All variants are in stock':'Out of stock'}${s.qty!==''?` • Qty ${s.qty}`:''}</small></div><label class="switch"><input type="checkbox" ${on?'checked':''} data-stock-id="${esc(x.id)}"><i></i></label></article>`}).join('')}</div></section>`
    }).join('');
    $$('.switch input[data-stock-id]').forEach(inp=>inp.onchange=async()=>{const id=inp.dataset.stockId;const s={...itemState(id),active:inp.checked};stock[id]=s;renderInventoryCards();if(typeof renderStock==='function')renderStock();try{if(typeof db!=='undefined')await db.collection('stock').doc(id).set(s,{merge:true});}catch(e){console.error('Stock save failed',e);}});
  }
  function renderMenuCards(){
    const root=$('#menuCards');if(!root)return;
    const q=($('#masterMenuSearch')?.value||'').trim().toLowerCase();
    const items=mergedItems().filter(x=>{const st=itemState(x.id); const catOk=menuFilter==='all'||(menuFilter==='addons'&&x.category==='Add-ons'); const statusOk=menuStatusFilter==='all'||(menuStatusFilter==='out'&&st.active===false)||(menuStatusFilter==='in'&&st.active!==false)||(menuStatusFilter==='needs'&&!x.image&&!x.imageUrl&&!x.img); return catOk&&statusOk&&(!q||String(x.name).toLowerCase().includes(q)||String(x.id).toLowerCase().includes(q));});
    const all=mergedItems(), ins=all.filter(x=>itemState(x.id).active!==false), out=all.filter(x=>itemState(x.id).active===false);
    $('#menuOutCount').textContent=out.length;$('#menuInCount').textContent=ins.length;const needs=all.filter(x=>!x.image&&!x.imageUrl&&!x.img).length;const needEl=document.querySelector('.menu-filter-pills button:nth-child(3) b');if(needEl)needEl.textContent=needs;
    const cats=[...new Set(items.map(x=>x.category||'Other'))];
    root.innerHTML=cats.map(cat=>{const ci=items.filter(x=>(x.category||'Other')===cat);return `<section class="menu-category"><div class="menu-cat-title"><h3>${esc(cat)}</h3><span>⋮</span></div><div class="menu-cat-card"><div class="menu-cat-head"><div class="menu-cat-toggle" role="button" tabindex="0"><b>${esc(cat)} (${ci.length})</b><small>All items in stock</small></div><label class="switch"><input type="checkbox" ${ci.every(x=>itemState(x.id).active!==false)?'checked':''} data-category-toggle="${esc(cat)}"><i></i></label><button class="menu-cat-chevron" type="button" aria-expanded="true">⌃</button></div>${ci.map(x=>{const s=itemState(x.id);const p=priceOf(x);return `<article class="menu-item-card"><span class="veg-dot">▣</span><div class="menu-item-main"><b>${esc(x.name)}</b><strong>${p?'₹'+p:'Price on request'}</strong><p>${esc(x.description||'Freshly prepared to order')}</p><div class="variants">${x.prices?'3 Variants':'1 Variant'} <span>⌄</span></div><small class="stock-green">${s.active!==false?'All items in stock':'Out of stock'}</small></div><div class="menu-item-image"><img src="${esc(imageOf(x))}" onerror="this.src='assets/logo.png'"><button class="image-edit" data-edit-id="${esc(x.id)}">✎</button></div><div class="menu-item-footer"><button class="details-btn view-details" type="button" data-detail-id="${esc(x.id)}">◉ &nbsp;View details</button><button class="details-btn edit-menu-item" data-edit-id="${esc(x.id)}">✎ &nbsp;Edit</button></div></article>`}).join('')}</div></section>`}).join('');
    $$('.edit-menu-item,.image-edit').forEach(b=>b.onclick=()=>typeof openItemEditor==='function'&&openItemEditor(b.dataset.editId));
    $$('[data-category-toggle]').forEach(inp=>inp.onchange=async()=>{const cat=inp.dataset.categoryToggle;const ids=mergedItems().filter(x=>(x.category||'Other')===cat).map(x=>x.id);ids.forEach(id=>{stock[id]={...itemState(id),active:inp.checked};});renderMenuCards();renderInventoryCards();try{if(typeof db!=='undefined'){const batch=db.batch();ids.forEach(id=>batch.set(db.collection('stock').doc(id),stock[id],{merge:true}));await batch.commit();}}catch(e){console.error('Category stock save failed',e);}});
    $$('.inv-category .cat-chevron').forEach(btn=>btn.onclick=()=>{const sec=btn.closest('.inv-category');const body=sec?.querySelector('.inv-items');if(!body)return;const open=!body.classList.contains('collapsed');body.classList.toggle('collapsed',open);btn.textContent=open?'⌄':'⌃';btn.setAttribute('aria-expanded',String(!open));});
    $$('.menu-category .menu-cat-chevron').forEach(btn=>btn.onclick=()=>{const card=btn.closest('.menu-cat-card');const items=card?.querySelector('.menu-item-card');if(!card||!items)return;const allItems=card.querySelectorAll('.menu-item-card');const open=!card.classList.contains('collapsed');card.classList.toggle('collapsed',open);allItems.forEach(el=>el.style.display=open?'none':'');btn.textContent=open?'⌄':'⌃';btn.setAttribute('aria-expanded',String(!open));});
    $$('.menu-category .menu-cat-toggle').forEach(el=>{el.onclick=()=>el.closest('.menu-cat-card')?.querySelector('.menu-cat-chevron')?.click();el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}}});
    $$('.view-details').forEach(btn=>btn.onclick=()=>{const x=mergedItems().find(i=>i.id===btn.dataset.detailId);if(!x)return;openItemEditor?.(x.id);});

  }
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function bind(){
    // Navigation / order tabs
    $$('#orderTabs .order-tab').forEach(b=>b.onclick=()=>{
      activeOrderTab=b.dataset.status;
      if(typeof renderOrderTabs==='function')renderOrderTabs();
      if(typeof db!=='undefined')db.collection('orders').get().then(renderOrders).catch(console.error);
    });
    $('#orderSearch')?.addEventListener('input',()=>{
      if(typeof db!=='undefined')db.collection('orders').get().then(renderOrders).catch(console.error);
    });

    // Legacy controls kept for compatibility with the existing master.js.
    $('#saveAll')?.addEventListener('click',()=>typeof saveStock==='function'&&saveStock());
    $('#allOn')?.addEventListener('click',()=>typeof setAll==='function'&&setAll(true));
    $('#allOff')?.addEventListener('click',()=>typeof setAll==='function'&&setAll(false));
    $('#closeItemEdit')?.addEventListener('click',()=>typeof closeItemEditor==='function'&&closeItemEditor());
    $('#saveItemEdit')?.addEventListener('click',()=>typeof saveItemEditor==='function'&&saveItemEditor());
    $('#deliveryToggle')?.addEventListener('click',()=>typeof toggleDelivery==='function'&&toggleDelivery());
    $('#deliveryToggle2')?.addEventListener('click',()=>typeof toggleDelivery==='function'&&toggleDelivery());
    $('#masterOnlineBtn')?.addEventListener('click',()=>typeof toggleDelivery==='function'&&toggleDelivery());
    $('#masterMenuBtn')?.addEventListener('click',()=>switchMasterView('inventory'));
    $$('.nav-item').forEach(b=>b.onclick=()=>switchMasterView(b.dataset.view));

    // Search fields
    $('#masterInventorySearch')?.addEventListener('input',renderInventoryCards);
    $('#masterMenuSearch')?.addEventListener('input',renderMenuCards);

    // Inventory tabs and status filters
    $$('.inventory-head-tabs .iv-tab').forEach((b,i)=>b.onclick=()=>{
      inventoryFilter=i===0?'all':'addons';
      $$('.inventory-head-tabs .iv-tab').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); renderInventoryCards();
    });
    $$('#viewInventory .inventory-summary span').forEach((b,i)=>b.onclick=()=>{
      inventoryStatusFilter=['out','in','low'][i]||'all';
      $$('#viewInventory .inventory-summary span').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); renderInventoryCards();
    });

    // Menu tabs and status filters
    $$('.menu-tabs button').forEach((b,i)=>b.onclick=()=>{
      menuFilter=i===0?'all':'addons';
      $$('.menu-tabs button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); renderMenuCards();
    });
    $$('#viewMenu .menu-filter-pills button').forEach((b,i)=>b.onclick=()=>{
      menuStatusFilter=['out','in','needs'][i]||'all';
      $$('#viewMenu .menu-filter-pills button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); renderMenuCards();
    });

    // Filter icon buttons: cycle through the relevant status filters instead of being dead buttons.
    $$('#viewInventory .filter-btn').forEach(btn=>btn.onclick=()=>{
      const order=['all','out','in','low'];
      const next=order[(order.indexOf(inventoryStatusFilter)+1)%order.length];
      inventoryStatusFilter=next;
      $$('#viewInventory .inventory-summary span').forEach((x,i)=>x.classList.toggle('active', ['out','in','low'][i]===next));
      renderInventoryCards();
    });
    $$('#viewMenu .filter-btn').forEach(btn=>btn.onclick=()=>{
      const order=['all','out','in','needs'];
      const next=order[(order.indexOf(menuStatusFilter)+1)%order.length];
      menuStatusFilter=next;
      $$('#viewMenu .menu-filter-pills button').forEach((x,i)=>x.classList.toggle('active', ['out','in','needs'][i]===next));
      renderMenuCards();
    });

    // Global event delegation makes dynamically-rendered stock/detail/edit buttons reliable.
    document.addEventListener('click', e=>{
      const detail=e.target.closest('.view-details');
      if(detail){ e.preventDefault(); const x=mergedItems().find(i=>i.id===detail.dataset.detailId); if(x && typeof openItemEditor==='function') openItemEditor(x.id); return; }
      const edit=e.target.closest('.edit-menu-item,.image-edit');
      if(edit){ e.preventDefault(); if(typeof openItemEditor==='function') openItemEditor(edit.dataset.editId); return; }
      const invChevron=e.target.closest('.inv-category .cat-chevron');
      if(invChevron){
        e.preventDefault(); const sec=invChevron.closest('.inv-category'), body=sec?.querySelector('.inv-items'); if(!body)return;
        const collapsed=body.classList.toggle('collapsed'); invChevron.textContent=collapsed?'⌄':'⌃'; invChevron.setAttribute('aria-expanded',String(!collapsed)); return;
      }
      const menuChevron=e.target.closest('.menu-category .menu-cat-chevron');
      if(menuChevron){
        e.preventDefault(); const card=menuChevron.closest('.menu-cat-card'); if(!card)return;
        const collapsed=card.classList.toggle('collapsed'); card.querySelectorAll('.menu-item-card').forEach(el=>el.style.display=collapsed?'none':'');
        menuChevron.textContent=collapsed?'⌄':'⌃'; menuChevron.setAttribute('aria-expanded',String(!collapsed)); return;
      }
      const menuToggle=e.target.closest('.menu-category .menu-cat-toggle');
      if(menuToggle){ menuToggle.closest('.menu-cat-card')?.querySelector('.menu-cat-chevron')?.click(); return; }
    });

    document.addEventListener('change', async e=>{
      const inp=e.target.closest('input[data-stock-id]');
      if(inp){
        const id=inp.dataset.stockId; const s={...itemState(id),active:inp.checked}; stock[id]=s;
        renderInventoryCards(); renderMenuCards();
        try{ if(typeof db!=='undefined') await db.collection('stock').doc(id).set(s,{merge:true}); }
        catch(err){ console.error('Stock save failed',err); alert('Stock update failed. Check Firebase Rules/login.'); }
        return;
      }
      const cat=e.target.closest('input[data-category-toggle]');
      if(cat){
        const category=cat.dataset.categoryToggle;
        const ids=mergedItems().filter(x=>(x.category||'Other')===category).map(x=>x.id);
        ids.forEach(id=>stock[id]={...itemState(id),active:cat.checked});
        renderMenuCards(); renderInventoryCards();
        try{
          if(typeof db!=='undefined'){const batch=db.batch(); ids.forEach(id=>batch.set(db.collection('stock').doc(id),stock[id],{merge:true})); await batch.commit();}
        }catch(err){ console.error('Category stock save failed',err); alert('Category stock update failed. Check Firebase Rules/login.'); }
      }
    });
  }

  window.addEventListener('load',()=>{bind(); activeOrderTab='NEW'; setTimeout(()=>{renderInventoryCards();renderMenuCards(); if(typeof db!=='undefined' && window.firebase && firebase.auth && firebase.auth().currentUser){db.collection('orders').get().then(renderOrders).catch(()=>{});}},900);});
})();

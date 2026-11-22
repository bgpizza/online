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
  function mergedItems(){return allMenuAdminItems();}
  function itemState(id){return (typeof stock!=='undefined' && stock[id])||{qty:'',active:true};}
  function priceOf(x){
    if(x.type==="pizza"&&x.prices){const vals=Object.values(x.prices).map(Number).filter(v=>v>0);return vals.length?Math.min(...vals):0}
    return Number(x.price||0)
  }
  function imageOf(x){return x.image||x.imageUrl||x.img||'assets/logo.png'}
  let inventoryFilter='all';
  let inventoryStatusFilter='all';
  let menuStatusFilter='all';
  function renderInventoryCards(){
    const root=$('#inventoryCards'); if(!root)return;
    const q=($('#masterInventorySearch')?.value||'').trim().toLowerCase();
    const items=mergedItems().filter(x=>{const st=itemState(x.id); const catOk=inventoryFilter==='all'||(inventoryFilter==='addons'&&x.category==='Add-ons'); const statusOk=inventoryStatusFilter==='all'||(inventoryStatusFilter==='out'&&st.active===false)||(inventoryStatusFilter==='in'&&st.active!==false)||(inventoryStatusFilter==='low'&&st.active!==false&&st.qty!==''&&Number(st.qty)<=5); return catOk&&statusOk&&(!q||String(x.name).toLowerCase().includes(q)||String(x.id).toLowerCase().includes(q));});
    const cats=[...new Set(items.map(x=>x.category||'Other'))];
    const all=mergedItems(), ins=all.filter(x=>itemState(x.id).active!==false), out=all.filter(x=>itemState(x.id).active===false), low=all.filter(x=>itemState(x.id).active!==false&&itemState(x.id).qty!==''&&Number(itemState(x.id).qty)<=5);
    $('#invAllCount').textContent=all.length;$('#invAddonCount').textContent=all.filter(x=>(x.category||'')==='Add-ons').length;$('#invOutCount').textContent=out.length;$('#invInCount').textContent=ins.length;$('#invLowCount').textContent=low.length;
    const alerts=$('#stockAlerts');
    alerts.hidden=!low.length&&!out.length;
    alerts.innerHTML=`<strong>Stock alerts</strong>
      ${low.length?`<p>Low stock: ${low.map(x=>esc(x.name)+" ("+Number(itemState(x.id).qty)+")").join(", ")}</p>`:""}
      ${out.length?`<p>Out of stock: ${out.map(x=>esc(x.name)).join(", ")}</p>`:""}`;
    root.innerHTML=cats.map(cat=>{
      const ci=items.filter(x=>(x.category||'Other')===cat);
      const active=ci.filter(x=>itemState(x.id).active!==false).length;
      return `<section class="inv-category"><header><div><h3>${esc(cat)} <em>${ci.length}</em></h3><span>${active===ci.length?'In stock':active+' in stock'}</span></div><button class="cat-chevron" type="button" aria-expanded="true">⌃</button></header><div class="inv-items">${ci.map(x=>{const s=itemState(x.id);const on=s.active!==false;return `<article class="inv-item"><span class="veg-dot">▣</span><div class="inv-info"><b>${esc(x.name)}</b><small>${on?'All variants are in stock':'Out of stock'}${s.qty!==''?` • Qty ${s.qty}`:''}</small></div><label class="switch"><input type="checkbox" ${on?'checked':''} data-stock-id="${esc(x.id)}"><i></i></label></article>`}).join('')}</div></section>`
    }).join('');
    $$('.switch input[data-stock-id]').forEach(inp=>inp.onchange=async()=>{const id=inp.dataset.stockId;const s={...itemState(id),active:inp.checked};stock[id]=s;renderInventoryCards();if(typeof renderStock==='function')renderStock();try{if(typeof db!=='undefined')await db.collection('stock').doc(id).set(s,{merge:true});}catch(e){console.error('Stock save failed',e);}});
  }
  const closedMenuGroups=new Set(), openMenuDetails=new Set(), savingMenuGroups=new Set();
  const categoryOf=item=>item.category||'Other';
  const hasMenuImage=item=>Boolean(item.image||item.imageUrl||item.img);
  const menuMoney=value=>value==='Ask'?'Price on request':'₹'+Number(value).toLocaleString('en-IN');
  function menuVariants(item){
    const bySize=item.category==='Add-ons'
      ? (item.sizePrices ?? item.prices ?? window.MENU_ADDON_DEFAULT_PRICES?.[item.id])
      : item.prices;
    return Object.entries(bySize||{}).filter(([,amount])=>amount==='Ask'||(Number.isFinite(Number(amount))&&Number(amount)>0));
  }
  function menuCard(item){
    const state=itemState(item.id), available=state.active!==false, variants=menuVariants(item);
    const prices=variants.map(([,amount])=>Number(amount)).filter(amount=>Number.isFinite(amount)&&amount>0);
    const base=Number(item.price);
    const price=prices.length?(variants.length>1?'From ':'')+menuMoney(Math.min(...prices))
      :Number.isFinite(base)&&base>0?menuMoney(base):'Price on request';
    return `<article class="catalogue-item">
      <img class="catalogue-photo" src="${esc(imageOf(item))}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='assets/logo.png'">
      <div class="catalogue-item-copy">
        <div class="catalogue-item-title"><h3>${esc(item.name)}</h3><span class="catalogue-code">#${esc(item.id)}</span></div>
        <p class="catalogue-price">${esc(price)}</p>
        ${item.description?`<p class="catalogue-description">${esc(item.description)}</p>`:''}
        <div class="catalogue-item-meta"><span class="catalogue-stock ${available?'is-available':'is-out'}">${available?'In stock':'Out of stock'}</span>
          ${state.qty!==''&&state.qty!=null?`<span>Qty ${esc(state.qty)}</span>`:''}</div>
        ${variants.length?`<details class="catalogue-variants" data-menu-variant="${esc(item.id)}" ${openMenuDetails.has(item.id)?'open':''}><summary>${variants.length} size ${variants.length===1?'price':'prices'}</summary><dl>${variants.map(([size,amount])=>`<div><dt>${esc(size)}</dt><dd>${esc(menuMoney(amount))}</dd></div>`).join('')}</dl></details>`:''}
      </div>
      <button class="catalogue-edit" type="button" data-catalogue-edit="${esc(item.id)}" aria-label="Edit ${esc(item.name)}">Edit item</button>
    </article>`;
  }
  function renderMenuCards(){
    const root=$('#menuCards'), categoryField=$('#masterMenuCategory'); if(!root||!categoryField)return;
    const all=mergedItems(), categories=[...new Set(all.map(categoryOf))];
    const previous=categoryField.value;
    categoryField.innerHTML='<option value="">All categories</option>'+categories.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
    if(categories.includes(previous))categoryField.value=previous;
    const selected=categoryField.value, q=($('#masterMenuSearch')?.value||'').trim().toLowerCase();
    const inStock=all.filter(item=>itemState(item.id).active!==false).length;
    $('#menuAllCount').textContent=all.length;
    $('#menuInCount').textContent=inStock;
    $('#menuOutCount').textContent=all.length-inStock;
    $('#menuPhotoCount').textContent=all.filter(item=>!hasMenuImage(item)).length;
    const filtered=all.filter(item=>{
      const available=itemState(item.id).active!==false;
      const statusOk=menuStatusFilter==='all'||(menuStatusFilter==='in'&&available)||(menuStatusFilter==='out'&&!available)||(menuStatusFilter==='needs'&&!hasMenuImage(item));
      return (!selected||categoryOf(item)===selected)&&statusOk&&
        (!q||[item.name,item.id,item.description].some(value=>String(value??'').toLowerCase().includes(q)));
    });
    $('#menuResultCount').textContent=`${filtered.length} of ${all.length} items`;
    root.innerHTML=categories.map(category=>{
      const visible=filtered.filter(item=>categoryOf(item)===category); if(!visible.length)return '';
      const group=all.filter(item=>categoryOf(item)===category);
      const count=group.filter(item=>itemState(item.id).active!==false).length;
      const collapsed=closedMenuGroups.has(category);
      return `<section class="catalogue-group">
        <header class="catalogue-group-head">
          <button class="catalogue-group-toggle" type="button" data-catalogue-group="${esc(category)}" aria-expanded="${!collapsed}">
            <span><strong>${esc(category)}</strong><small>${count} of ${group.length} in stock</small></span>
            <span class="catalogue-chevron" aria-hidden="true"></span>
          </button>
          <label class="catalogue-bulk-label"><input type="checkbox" data-catalogue-stock="${esc(category)}" ${count===group.length?'checked':''} ${count>0&&count<group.length?'data-mixed':''} ${savingMenuGroups.has(category)?'disabled':''}> All available</label>
        </header>
        <div class="catalogue-items" ${collapsed?'hidden':''}>${visible.map(menuCard).join('')}</div>
      </section>`;
    }).join('')||'<p class="catalogue-empty">No items match these filters.</p>';
    root.querySelectorAll('[data-mixed]').forEach(input=>{input.indeterminate=true;});
  }
  function bindCatalogue(){
    const root=$('#menuCards'); if(!root)return;
    $('#masterMenuCategory').addEventListener('change',renderMenuCards);
    $$('#viewMenu [data-menu-filter]').forEach(button=>button.onclick=()=>{
      menuStatusFilter=button.dataset.menuFilter;
      $$('#viewMenu [data-menu-filter]').forEach(control=>control.setAttribute('aria-pressed',String(control===button)));
      renderMenuCards();
    });
    root.addEventListener('click',event=>{
      const edit=event.target.closest('[data-catalogue-edit]');
      if(edit){openItemEditor(edit.dataset.catalogueEdit);return;}
      const group=event.target.closest('[data-catalogue-group]');
      if(!group)return;
      const name=group.dataset.catalogueGroup, closed=group.getAttribute('aria-expanded')==='true';
      if(closed)closedMenuGroups.add(name);else closedMenuGroups.delete(name);
      group.setAttribute('aria-expanded',String(!closed));
      group.closest('.catalogue-group').querySelector('.catalogue-items').hidden=closed;
    });
    root.addEventListener('toggle',event=>{
      const detail=event.target, id=detail.dataset?.menuVariant;
      if(!id||!detail.isConnected)return;
      if(detail.open)openMenuDetails.add(id);else openMenuDetails.delete(id);
    },true);
    root.addEventListener('change',async event=>{
      const input=event.target.closest('[data-catalogue-stock]'); if(!input)return;
      const category=input.dataset.catalogueStock, active=input.checked;
      if(savingMenuGroups.has(category))return;
      savingMenuGroups.add(category); input.disabled=true;
      const feedback=$('#menuStockFeedback');
      feedback.hidden=false;feedback.textContent='Saving '+category+' availability…';
      try{
        const changes=mergedItems().filter(item=>categoryOf(item)===category&&((itemState(item.id).active!==false)!==active));
        const batch=db.batch();
        changes.forEach(item=>batch.set(db.collection('stock').doc(item.id),{active},{merge:true}));
        if(changes.length)await batch.commit();
        changes.forEach(item=>{stock[item.id]={...itemState(item.id),active};});
        feedback.textContent=category+' availability updated.';
        renderInventoryCards();
      }catch(error){
        console.error('Category availability update failed',error);
        feedback.textContent='Could not update '+category+'. Try again.';
      }finally{
        savingMenuGroups.delete(category);
        renderMenuCards();
      }
    });
  }
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function bind(){
    // Navigation / order tabs
    $$('#orderTabs .order-tab').forEach(b=>b.onclick=()=>{
      activeOrderTab=b.dataset.status;
      if(typeof renderOrderTabs==='function')renderOrderTabs();
      renderOrderBoard(true);
    });
    $('#orderSearch').addEventListener('input',()=>renderOrderBoard(true));
    ['#allOrderStatus','#orderDay','#orderSort'].forEach(id=>$(id).addEventListener('change',()=>renderOrderBoard(true)));
    $('#resetOrderFilters').onclick=()=>{
      ['#orderSearch','#allOrderStatus','#orderDay'].forEach(id=>$(id).value='');
      $('#orderSort').value='newest';
      renderOrderBoard(true);
    };
    $('#moreOrders').onclick=()=>{
      visibleOrderLimit+=orderPageSize;
      renderOrderBoard();
    };

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

    bindCatalogue();

    // Filter icon buttons: cycle through the relevant status filters instead of being dead buttons.
    $$('#viewInventory .filter-btn').forEach(btn=>btn.onclick=()=>{
      const order=['all','out','in','low'];
      const next=order[(order.indexOf(inventoryStatusFilter)+1)%order.length];
      inventoryStatusFilter=next;
      $$('#viewInventory .inventory-summary span').forEach((x,i)=>x.classList.toggle('active', ['out','in','low'][i]===next));
      renderInventoryCards();
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

    });
  }

  window.BakeGrillMasterUI={refresh(){renderInventoryCards();renderMenuCards();}};
  window.addEventListener('load',()=>{bind(); activeOrderTab='NEW'; setTimeout(()=>{renderInventoryCards();renderMenuCards(); if(typeof db!=='undefined' && window.firebase && firebase.auth && firebase.auth().currentUser){db.collection('orders').get().then(renderOrders).catch(()=>{});}},900);});
})();

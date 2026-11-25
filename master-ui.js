(function(){
  const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  window.switchMasterView=function(view){
    const map={orders:'viewOrders',inventory:'viewInventory',menu:'viewMenu',analytics:'viewAnalytics'};
    $$('.master-view').forEach(v=>v.classList.remove('active-view'));
    const el=$('#'+map[view]); if(el)el.classList.add('active-view');
    $$('.nav-item').forEach(b=>{
      const active=b.dataset.view===view;
      b.classList.toggle('active',active);
      if(active)b.setAttribute('aria-current','page');
      else b.removeAttribute('aria-current');
    });
    if(view==='inventory') renderInventoryCards();
    if(view==='menu') renderMenuCards();
    if(view==='analytics') window.dispatchEvent(new Event('bgAnalyticsOpen'));
    window.scrollTo({top:0,behavior:'instant'});
  };
  function mergedItems(){return allMenuAdminItems();}
  function itemState(id){return (typeof stock!=='undefined' && stock[id])||{qty:'',active:true};}
  function priceOf(x){
    if(x.type==="pizza"&&x.prices){const vals=Object.values(x.prices).map(Number).filter(v=>v>0);return vals.length?Math.min(...vals):0}
    return Number(x.price||0)
  }
  function imageOf(x){return x.image||x.imageUrl||x.img||'assets/logo.png'}
  const collapsedInventory=new Set(), pendingInventory=new Set();
  let inventoryStatusFilter='all';
  let menuStatusFilter='all';
  function inventoryState(item){
    const {active,qty}=itemState(item.id);
    if(active===false)return 'out';
    return qty!==''&&qty!=null&&Number(qty)<=5?'low':'in';
  }
  function renderInventoryCards(){
    const root=$('#inventoryCards'), category=$('#inventoryCategory');
    if(!root||!category)return;
    const all=mergedItems(), categories=[...new Set(all.map(categoryOf))];
    const selected=categories.includes(category.value)?category.value:'';
    category.innerHTML='<option value="">All categories</option>'+categories.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
    category.value=selected;
    const query=$('#masterInventorySearch').value.trim().toLowerCase();
    const counts={in:0,out:0,low:0};
    const items=all.filter(item=>{
      const status=inventoryState(item);
      counts[status]++;
      return (!selected||categoryOf(item)===selected)
        &&(inventoryStatusFilter==='all'||inventoryStatusFilter===status||(inventoryStatusFilter==='in'&&status==='low'))
        &&[item.name,item.id].some(value=>String(value).toLowerCase().includes(query));
    });
    $('#invAllCount').textContent=all.length;
    $('#invInCount').textContent=counts.in+counts.low;
    $('#invOutCount').textContent=counts.out;
    $('#invLowCount').textContent=counts.low;
    const sort=$('#inventorySort').value;
    const priority={out:0,low:1,in:2};
    if(sort==='name')items.sort((a,b)=>a.name.localeCompare(b.name));
    if(sort==='stock')items.sort((a,b)=>priority[inventoryState(a)]-priority[inventoryState(b)]||a.name.localeCompare(b.name));
    const groups=[...new Set(items.map(categoryOf))];
    $('#inventoryResultCount').textContent=`${items.length} of ${all.length} items`;
    $('#toggleInventoryGroups').hidden=!groups.length;
    $('#toggleInventoryGroups').textContent=groups.every(cat=>collapsedInventory.has(cat))?'Expand all':'Collapse all';
    root.innerHTML=groups.map(cat=>{
      const rows=items.filter(item=>categoryOf(item)===cat);
      const available=rows.filter(item=>inventoryState(item)!=='out').length;
      const collapsed=collapsedInventory.has(cat);
      return `<section class="inv-category" data-inv-group="${esc(cat)}"><header><div><h3>${esc(cat)} <em>${rows.length}</em></h3><span>${available} available</span></div><button class="cat-chevron master-disclosure" type="button" aria-label="${collapsed?'Expand':'Collapse'} ${esc(cat)}" aria-expanded="${!collapsed}"><span class="master-disclosure-icon" aria-hidden="true"></span></button></header><div class="inv-items" ${collapsed?'hidden':''}>${rows.map(inventoryRow).join('')}</div></section>`;
    }).join('')||'<p class="inventory-empty">No items match these filters.</p>';
  }
  function inventoryRow(item){
    const status=inventoryState(item), {qty}=itemState(item.id), label={in:'In stock',out:'Out of stock',low:'Low stock'}[status];
    return `<article class="inv-item"><img class="inv-photo" src="${esc(imageOf(item))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/logo.png'"><div class="inv-info"><b>${esc(item.name)}</b><small>#${esc(item.id)} <span class="inv-status inv-${status}">${label}</span>${qty!==''&&qty!=null?` · Qty ${esc(qty)}`:''}</small></div><button class="inv-edit" type="button" data-inv-edit="${esc(item.id)}" aria-label="Edit stock for ${esc(item.name)}">Edit</button><label class="switch"><input type="checkbox" aria-label="Available to order: ${esc(item.name)}" ${status!=='out'?'checked':''} ${pendingInventory.has(item.id)?'disabled':''} data-stock-id="${esc(item.id)}"><i></i></label></article>`;
  }
  function setInventoryStatus(status){
    inventoryStatusFilter=status;
    $$('[data-inv-status]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.invStatus===status)));
    renderInventoryCards();
  }
  function bindInventory(){
    $$('[data-inv-status]').forEach(button=>button.onclick=()=>setInventoryStatus(button.dataset.invStatus));
    for(const id of ['inventoryCategory','inventorySort'])$('#'+id).onchange=renderInventoryCards;
    $('#resetInventory').onclick=()=>{
      $('#masterInventorySearch').value='';
      $('#inventoryCategory').value='';
      $('#inventorySort').value='menu';
      collapsedInventory.clear();
      setInventoryStatus('all');
    };
    $('#toggleInventoryGroups').onclick=()=>{
      const groups=$$('[data-inv-group]').map(group=>group.dataset.invGroup);
      const expand=groups.every(cat=>collapsedInventory.has(cat));
      for(const cat of groups)expand?collapsedInventory.delete(cat):collapsedInventory.add(cat);
      renderInventoryCards();
    };
    $('#inventoryCards').addEventListener('click',event=>{
      const edit=event.target.closest('[data-inv-edit]');
      if(edit){window.openItemEditor(edit.dataset.invEdit);$('#itemEditModal [data-editor-tab="stock"]').click();return;}
      const chevron=event.target.closest('.cat-chevron');
      if(!chevron)return;
      const cat=chevron.closest('[data-inv-group]').dataset.invGroup;
      collapsedInventory.has(cat)?collapsedInventory.delete(cat):collapsedInventory.add(cat);
      renderInventoryCards();
      $$('[data-inv-group]').find(group=>group.dataset.invGroup===cat)?.querySelector('.cat-chevron').focus();
    });
    $('#inventoryCards').addEventListener('change',async event=>{
      const input=event.target.closest('input[data-stock-id]');
      if(!input)return;
      const id=input.dataset.stockId, active=input.checked, feedback=$('#stockFeedback');
      pendingInventory.add(id);
      input.disabled=true;
      const focused=document.activeElement===input;
      feedback.hidden=false;
      feedback.textContent='Saving stock status…';
      try{
        if(typeof db==='undefined'||!db)throw new Error('Firebase unavailable');
        await db.collection('stock').doc(id).set({active},{merge:true});
        stock[id]={...itemState(id),active};
        feedback.textContent=active?'Item is now available to order.':'Item marked out of stock.';
        renderStock();
        renderMenuCards();
      }catch(error){
        console.error('Stock update failed',error);
        feedback.textContent='Stock update failed. Try again after checking your connection.';
      }finally{
        pendingInventory.delete(id);
        renderInventoryCards();
        if(focused&&document.activeElement===document.body)$('#inventoryCards input[data-stock-id]').find(control=>control.dataset.stockId===id)?.focus({preventScroll:true});
      }
    });
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
        ${variants.length?`<details class="catalogue-variants" data-menu-variant="${esc(item.id)}" ${openMenuDetails.has(item.id)?'open':''}><summary class="master-disclosure"><span>${variants.length} size ${variants.length===1?'price':'prices'}</span><span class="master-disclosure-icon" aria-hidden="true"></span></summary><dl>${variants.map(([size,amount])=>`<div><dt>${esc(size)}</dt><dd>${esc(menuMoney(amount))}</dd></div>`).join('')}</dl></details>`:''}
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
          <button class="catalogue-group-toggle master-disclosure" type="button" data-catalogue-group="${esc(category)}" aria-expanded="${!collapsed}">
            <span><strong>${esc(category)}</strong><small>${count} of ${group.length} in stock</small></span>
            <span class="master-disclosure-icon" aria-hidden="true"></span>
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

    bindInventory();
    bindCatalogue();

    // Global event delegation makes dynamically-rendered stock/detail/edit buttons reliable.
    document.addEventListener('click', e=>{
      const detail=e.target.closest('.view-details');
      if(detail){ e.preventDefault(); const x=mergedItems().find(i=>i.id===detail.dataset.detailId); if(x && typeof openItemEditor==='function') openItemEditor(x.id); return; }
      const edit=e.target.closest('.edit-menu-item,.image-edit');
      if(edit){ e.preventDefault(); if(typeof openItemEditor==='function') openItemEditor(edit.dataset.editId); return; }
    });
  }

  window.BakeGrillMasterUI={refresh(){renderInventoryCards();renderMenuCards();}};
  window.addEventListener('load',()=>{bind(); activeOrderTab='NEW'; setTimeout(()=>{renderInventoryCards();renderMenuCards(); if(typeof db!=='undefined' && window.firebase && firebase.auth && firebase.auth().currentUser){db.collection('orders').get().then(renderOrders).catch(()=>{});}},900);});
})();

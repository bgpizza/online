(function(){
  const TOKEN_KEY='bake_grill_fcm_token_v1';
  const LAST_ORDER_KEY='bake_grill_last_order_v1';
  const OPTIN_KEY='bake_grill_checkout_push_optin';
  const VAPID_KEY='BD8gsCB9m77XRsjC1n0sgdTCZM_s6a6pjXJhbuP3iYV0euXIiwmni9-duvE5snYKB_cmfUieX9FmgiF5oNxFABo';
  let messaging=null;
  let initPromise=null;

  function setButton(text,disabled=false){
    const b=document.getElementById('enableNotifications');
    if(b){b.textContent=text;b.disabled=disabled;}
  }
  function setHelp(text){
    const el=document.getElementById('pushHelpText');
    if(el)el.textContent=text;
  }
  function setPushStatus(state,title,detail){
    const card=document.getElementById('pushStatusCard');
    if(!card)return;
    card.dataset.state=state;
    const icon=document.getElementById('pushStatusIcon');
    const heading=document.getElementById('pushStatusTitle');
    const copy=document.getElementById('pushStatusDetail');
    if(icon)icon.textContent=state==='on'?'✓':state==='checking'?'…':state==='blocked'?'!':state==='error'?'×':'○';
    if(heading)heading.textContent=title;
    if(copy)copy.textContent=detail||'';
  }
  function setCheckoutPushStatus(text,state='info'){
    let el=document.getElementById('checkoutPushOptinStatus');
    if(!el){
      const box=document.getElementById('checkoutOrderNotifications');
      const label=box?.closest('.checkout-push-optin');
      if(label){
        el=document.createElement('p');
        el.id='checkoutPushOptinStatus';
        el.className='checkout-push-optin-status';
        el.setAttribute('role','status');
        el.setAttribute('aria-live','polite');
        label.insertAdjacentElement('afterend',el);
      }
    }
    if(el){el.textContent=text;el.dataset.state=state;}
  }
  function getStoredOptIn(){
    try{return localStorage.getItem(OPTIN_KEY);}catch(e){return null;}
  }
  function setStoredOptIn(enabled){
    try{localStorage.setItem(OPTIN_KEY,enabled?'1':'0');}catch(e){}
  }
  function syncCheckoutPushOptIn(){
    const box=document.getElementById('checkoutOrderNotifications');
    if(!box)return;
    const label=box.closest('.checkout-push-optin');
    let token='';
    try{token=localStorage.getItem(TOKEN_KEY)||'';}catch(e){}
    const permissionGranted=('Notification' in window)&&Notification.permission==='granted';
    const remembered=getStoredOptIn();
    const active=permissionGranted&&!!token&&remembered!=='0';
    if(active){
      box.checked=true;
      label?.setAttribute('hidden','');
      setCheckoutPushStatus('✓ Order notifications are already enabled on this phone. No need to turn them on again.','on');
    }else{
      if(remembered==='0')box.checked=false;
      else if(remembered==='1')box.checked=permissionGranted;
      else box.checked=false;
      label?.removeAttribute('hidden');
      if(remembered==='0')setCheckoutPushStatus('Order notifications are turned off for future orders on this phone.','off');
      else if(permissionGranted&&!token)setCheckoutPushStatus('Browser permission is on. Finish linking notifications by enabling the order update option.','checking');
      else setCheckoutPushStatus('Optional: enable this once to receive order updates on this phone.','info');
    }
  }
  function bindCheckoutPushOptIn(){
    const box=document.getElementById('checkoutOrderNotifications');
    if(!box||box.dataset.bound==='1')return;
    box.dataset.bound='1';
    const remembered=getStoredOptIn();
    try{
      box.checked=remembered==='1'&&Notification.permission==='granted';
    }catch(e){box.checked=false;}
    syncCheckoutPushOptIn();
    box.addEventListener('change',async()=>{
      if(!box.checked){
        setStoredOptIn(false);
        try{localStorage.removeItem(LAST_ORDER_KEY);}catch(e){}
        syncCheckoutPushOptIn();
        setCheckoutPushStatus('Order updates are off for future orders on this phone.','off');
        return;
      }
      setCheckoutPushStatus('⏳ Enabling notifications… Please choose Allow if your phone asks.','checking');
      const ok=await enable();
      if(ok){
        setStoredOptIn(true);
        box.checked=true;
        syncCheckoutPushOptIn();
        setCheckoutPushStatus('✓ Notifications are on. Future orders on this phone will receive status updates.','on');
      }else{
        setStoredOptIn(false);
        box.checked=false;
        syncCheckoutPushOptIn();
        setCheckoutPushStatus('Notifications could not be enabled. Check browser site settings and try again.','error');
      }
    });
  }
  function toast(title,body){
    let el=document.getElementById('pushToast');
    if(!el){
      el=document.createElement('div');el.id='pushToast';el.className='push-toast';
      document.body.appendChild(el);
    }
    el.innerHTML='<b>'+String(title||'Bake & Grill').replace(/[<>]/g,'')+'</b><span>'+String(body||'').replace(/[<>]/g,'')+'</span>';
    el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),7000);
  }
  async function supported(){
    if(!window.isSecureContext)throw new Error('Notifications require HTTPS. Open the secure https:// website first.');
    if(!('Notification' in window))throw new Error('This browser does not support web notifications. Please use Chrome or Edge.');
    if(!('serviceWorker' in navigator))throw new Error('This browser does not support service workers. Please use Chrome or Edge.');
    if(!('PushManager' in window))throw new Error('This browser does not support push notifications. Please use Chrome or Edge.');
    if(!(window.firebase&&firebase.messaging&&firebase.messaging.isSupported))throw new Error('Firebase Messaging did not load. Refresh the website and try again.');
    let ok=false;
    try{ok=await firebase.messaging.isSupported();}catch(e){throw new Error('This browser cannot use Firebase push notifications. Try Chrome or Edge, and turn off Brave Shields for this site.');}
    if(!ok)throw new Error('Push notifications are not supported in this browser profile. Try Google Chrome or Microsoft Edge, or turn off Brave Shields for this site.');
    return true;
  }
  async function getServiceWorkerRegistration(){
    if(!('serviceWorker' in navigator))throw new Error('Service Worker is unavailable in this browser.');
    const registration=await navigator.serviceWorker.register('./sw.js?v=20261120-phase4-unified-app-shell-v1');
    await navigator.serviceWorker.ready;
    if(!registration.active && !registration.waiting && !registration.installing){
      throw new Error('The notification service worker could not start. Refresh the page and try again.');
    }
    return registration;
  }
  async function getMessaging(){
    await supported();
    if(!messaging)messaging=firebase.messaging();
    return messaging;
  }
  async function getToken(){
    const m=await getMessaging();
    const reg=await getServiceWorkerRegistration();
    const token=await m.getToken({serviceWorkerRegistration:reg,vapidKey:VAPID_KEY});
    if(token){
      try{localStorage.setItem(TOKEN_KEY,token);}catch(e){}
    }
    return token;
  }
  async function saveTokenForOrder(orderId){
    if(!orderId||!window.db||!window.firebaseReady)return false;
    let token='';
    try{token=localStorage.getItem(TOKEN_KEY)||'';}catch(e){}
    if(!token)return false;
    const savedKey='bake_grill_push_saved_'+String(orderId);
    try{if(localStorage.getItem(savedKey)===token)return true;}catch(e){}
    try{
      await db.collection('pushTokens').add({
        token,orderId:String(orderId),customerId:auth?.currentUser?.uid||null,
        createdAt:firebase.firestore.FieldValue.serverTimestamp(),
        platform:'web-pwa'
      });
      try{localStorage.setItem(savedKey,token);}catch(e){}
      return true;
    }catch(e){console.error('Push token save failed:',e);throw new Error('Notifications were allowed, but this order could not be linked in Firebase. Please refresh and try again.');}
  }
  async function enable(){
    const button=document.getElementById('enableNotifications');
    if(button){button.dataset.oldText=button.textContent;button.setAttribute('aria-pressed','false');setButton('⏳ Enabling…',true);}
    setPushStatus('checking','Checking notification setup…','Checking browser permission and creating a secure push subscription.');
    setHelp('Checking browser support and preparing secure notifications…');
    try{
      // Request permission synchronously during the real click/change gesture.
      // Awaiting the async support checks first can lose the browser's transient user activation.
      const permissionTask = ('Notification' in window && Notification.permission==='default')
        ? Notification.requestPermission()
        : Promise.resolve(('Notification' in window)?Notification.permission:'denied');
      await supported();
      if(Notification.permission==='denied'){
        throw new Error('Notifications are blocked in your browser settings. Click the site icon beside the address bar, open Site settings, and change Notifications to Allow.');
      }
      const permission=Notification.permission==='granted'?'granted':await permissionTask;
      if(permission!=='granted')throw new Error('You selected Block or did not allow notifications. Set this website’s Notifications permission to Allow, then try again.');
      const token=await getToken();
      if(!token)throw new Error('Firebase did not return a push token. Check the Firebase Cloud Messaging Web Push certificate (VAPID key) and try again.');
      setStoredOptIn(true);
      const box=document.getElementById('checkoutOrderNotifications');
      if(box)box.checked=true;
      syncCheckoutPushOptIn();
      const orderId=localStorage.getItem(LAST_ORDER_KEY)||localStorage.getItem('bakeGrillActiveOrder')||'';
      const linked=orderId?await saveTokenForOrder(orderId):false;
      setButton('✓ Notifications ON',true);
      if(button)button.setAttribute('aria-pressed','true');
      setPushStatus('on','NOTIFICATIONS ARE ON',linked?'This phone is subscribed and linked to the selected order.':'This phone is subscribed. Future orders will be linked automatically while order notifications remain enabled.');
      setHelp(linked?'✅ Push is active on this phone and linked to your order.':'✅ Push is active on this phone.');
      syncCheckoutPushOptIn();
      toast('Notifications are ON','This phone has a valid Bake & Grill push subscription.');
      return true;
    }catch(e){
      console.error('Bake & Grill push setup failed:',e);
      const denied=('Notification' in window&&Notification.permission==='denied');
      setButton(denied?'⚠ Notifications blocked':'🔔 Enable Notifications',false);
      if(button)button.setAttribute('aria-pressed','false');
      setPushStatus(denied?'blocked':'error',denied?'NOTIFICATIONS ARE BLOCKED':'NOTIFICATIONS NOT ENABLED',e.message||'Could not create a push subscription. Please retry.');
      setHelp(e.message||'Could not enable notifications. Please check browser permission and try again.');
      toast('Notifications not enabled',e.message||'Please try again.');
      return false;
    }
  }
  async function attachToOrder(orderId,enabled=true){
    try{
      if(!enabled){
        setStoredOptIn(false);
        try{if(localStorage.getItem(LAST_ORDER_KEY)===String(orderId))localStorage.removeItem(LAST_ORDER_KEY);}catch(e){}
        syncCheckoutPushOptIn();
        setHelp('Order updates are turned off for this order on this phone.');
        return false;
      }
      if(Notification.permission!=='granted')return false;
      const token=await getToken();
      if(!token)return false;
      const linked=await saveTokenForOrder(orderId);
      if(linked){
        setStoredOptIn(true);
        localStorage.setItem(LAST_ORDER_KEY,String(orderId));
        syncCheckoutPushOptIn();
        return true;
      }
      return false;
    }catch(e){console.warn('Push order attach:',e);setHelp(e.message||'Could not link notifications to this order.');return false;}
  }
  async function init(){
    bindCheckoutPushOptIn();
    const btn=document.getElementById('enableNotifications');
    if(!btn)return;
    // Always attach the click handler first so a support-check failure is visible,
    // rather than leaving a dead/disabled button.
    btn.addEventListener('click',enable);
    if(!window.isSecureContext){
      setHelp('Notifications need HTTPS. Use the GitHub Pages https:// address until your custom domain HTTPS is active.');
      return;
    }
    try{
      await supported();
      if(Notification.permission==='granted'){
        const token=await getToken();
        if(token){
          const preference=getStoredOptIn();
          const optedIn=preference!=='0';
          if(optedIn){
            setStoredOptIn(true);
            const selectedOrder=localStorage.getItem(LAST_ORDER_KEY)||'';
            if(selectedOrder)await saveTokenForOrder(selectedOrder);
          }
          syncCheckoutPushOptIn();
          setButton('✓ Notifications ON',true);
          btn.setAttribute('aria-pressed','true');
          setPushStatus('on','NOTIFICATIONS ARE ON',optedIn?'This phone is subscribed. Saved order opt-in will be applied automatically.':'Browser permission is on, but order notifications are currently opted out.');
          setHelp(optedIn?'✅ Notifications are already enabled on this phone.':'Browser notification permission is on; turn on order updates at checkout to opt in again.');
        }else{
          syncCheckoutPushOptIn();
          setButton('🔔 Retry Notifications',false);
          setPushStatus('error','NOTIFICATION SETUP INCOMPLETE','Browser permission is allowed, but Firebase did not return a push token. Tap to retry.');
        }
      }else if(Notification.permission==='default'){
        setButton('🔔 Enable Notifications',false);
        setPushStatus('off','NOTIFICATIONS ARE OFF','Tap the green button and choose Allow when your browser asks.');
      }else{
        setButton('⚠ Notifications blocked',false);
        setPushStatus('blocked','NOTIFICATIONS ARE BLOCKED','Open the browser site settings for bakeandgrill.in and change Notifications to Allow.');
        setHelp('Notifications are blocked for this website. Allow them in your browser site settings, then tap this button again.');
      }
      const m=await getMessaging();
      m.onMessage(payload=>{
        const n=payload.notification||{},d=payload.data||{};
        const status=String(d.status||'').toUpperCase();
        if(status&&d.orderId&&typeof window.showCustomerOrderStatusPopup==='function'){
          const shown=window.showCustomerOrderStatusPopup(status,d.orderId);
          if(!shown&&!document.getElementById('bgOrderUpdatePopup')?.classList.contains('show'))toast(n.title||d.title||'Bake & Grill',n.body||d.body||'Your order has an update.');
        }else toast(n.title||d.title||'Bake & Grill',n.body||d.body||'Your order has an update.');
      });
    }catch(e){
      console.warn('Push notifications setup check:',e);
      setButton('🔔 Retry Notifications',false);
      setPushStatus('error','NOTIFICATION CHECK FAILED',e.message||'Notifications are unavailable in this browser.');
      setHelp(e.message||'Notifications are unavailable. Try Chrome or Edge over HTTPS.');
    }
  }
  window.BakeGrillPush={enable,attachToOrder,init};
  // index.html loads this deferred script after checkout markup; bind now.
  bindCheckoutPushOptIn();
  window.addEventListener('load',()=>setTimeout(()=>{initPromise=init();},250));
})();

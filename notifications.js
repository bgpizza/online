(function(){
  const TOKEN_KEY='bake_grill_fcm_token_v1';
  const LAST_ORDER_KEY='bake_grill_last_order_v1';
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
  function setCheckoutPushStatus(text){
    const el=document.getElementById('checkoutPushOptinStatus');
    if(el)el.textContent=text;
  }
  function bindCheckoutPushOptIn(){
    const box=document.getElementById('checkoutOrderNotifications');
    if(!box||box.dataset.bound==='1')return;
    box.dataset.bound='1';
    box.addEventListener('change',async()=>{
      if(!box.checked){try{localStorage.setItem('bake_grill_checkout_push_optin','0');}catch(e){} setCheckoutPushStatus('Order updates are off for this order on this phone.');return;}
      setCheckoutPushStatus('Enabling notifications… Please choose Allow if your phone asks.');
      const ok=await enable();
      if(ok){try{localStorage.setItem('bake_grill_checkout_push_optin','1');}catch(e){} setCheckoutPushStatus('✅ Notifications enabled. This phone will be linked to your order when you place it.');}
      else{try{localStorage.setItem('bake_grill_checkout_push_optin','0');}catch(e){} box.checked=false;setCheckoutPushStatus('Notifications were not enabled. Allow them in browser/site settings and try again.');}
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
    const registration=await navigator.serviceWorker.register('./sw.js?v=20261118-master-push-v9');
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
    if(button){button.dataset.oldText=button.textContent;setButton('Enabling notifications…',true);}
    setHelp('Checking browser support and preparing secure notifications…');
    try{
      await supported();
      if(Notification.permission==='denied'){
        throw new Error('Notifications are blocked in your browser settings. Click the site icon beside the address bar, open Site settings, and change Notifications to Allow.');
      }
      const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
      if(permission!=='granted')throw new Error('You selected Block or did not allow notifications. Set this website’s Notifications permission to Allow, then try again.');
      const token=await getToken();
      if(!token)throw new Error('Firebase did not return a push token. Check the Firebase Cloud Messaging Web Push certificate (VAPID key) and try again.');
      const orderId=localStorage.getItem(LAST_ORDER_KEY)||localStorage.getItem('bakeGrillActiveOrder')||'';
      if(orderId)await saveTokenForOrder(orderId);
      setButton('🔔 Notifications ON',true);
      setHelp(orderId?'Notifications are enabled for this order. We will send updates when its status changes.':'Notifications are enabled on this phone. Your next order will be linked automatically.');
      toast('Notifications enabled','Bake & Grill can now send order updates to this device.');
      return true;
    }catch(e){
      console.error('Bake & Grill push setup failed:',e);
      setButton('🔔 Enable Notifications',false);
      setHelp(e.message||'Could not enable notifications. Please check browser permission and try again.');
      toast('Could not enable notifications',e.message||'Please try again.');
      return false;
    }
  }
  async function attachToOrder(orderId,enabled=true){
    try{
      localStorage.setItem(LAST_ORDER_KEY,String(orderId));
      if(!enabled){setHelp('Order updates are turned off for this order on this phone.');return false;}
      if(Notification.permission==='granted'){
        await getToken();
        await saveTokenForOrder(orderId);
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
          const activeOrder=localStorage.getItem(LAST_ORDER_KEY)||localStorage.getItem('bakeGrillActiveOrder')||'';
          if(activeOrder)await saveTokenForOrder(activeOrder);
          setButton('🔔 Notifications ON',true);
          setHelp('Notifications are already enabled on this phone.');
        }
      }else if(Notification.permission==='default'){
        setButton('🔔 Get Order Updates on This Phone',false);
      }else{
        setButton('🔔 Enable Notifications',false);
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
      setButton('🔔 Enable Notifications',false);
      setHelp(e.message||'Notifications are unavailable. Try Chrome or Edge over HTTPS.');
    }
  }
  window.BakeGrillPush={enable,attachToOrder,init};
  window.addEventListener('load',()=>setTimeout(()=>{initPromise=init();},500));
})();

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
  function setNotificationPromptVisible(visible){
    ['enableNotifications','pushStatusCard','pushHelpText'].forEach(id=>{
      const el=document.getElementById(id);if(!el)return;
      el.hidden=!visible;
      el.setAttribute('aria-hidden',visible?'false':'true');
    });
    document.body.classList.toggle('notifications-ready',!visible);
  }
  function hasValidPushPermission(){
    try{return 'Notification' in window&&Notification.permission==='granted'&&!!localStorage.getItem(TOKEN_KEY);}catch(e){return false;}
  }
  function setCheckoutPushStatus(text){
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
    if(el)el.textContent=text;
  }
  function bindCheckoutPushOptIn(){
    const box=document.getElementById('checkoutOrderNotifications');
    if(!box||box.dataset.bound==='1')return;
    box.dataset.bound='1';
    try{
      const remembered=localStorage.getItem('bake_grill_checkout_push_optin');
      const granted=('Notification' in window&&Notification.permission==='granted');
      box.checked=granted&&remembered!=='0';
      if(box.checked)setCheckoutPushStatus('✅ Notifications are already enabled on this phone. They will be linked to this order unless you turn them off.');
    }catch(e){}
    box.addEventListener('change',async()=>{
      if(!box.checked){
        try{localStorage.setItem('bake_grill_checkout_push_optin','0');}catch(e){}
        setCheckoutPushStatus('Order notifications are OFF for this order on this phone.');
        return;
      }
      setCheckoutPushStatus('⏳ Enabling notifications… Please choose Allow if your phone asks.');
      const ok=await enable();
      if(ok){
        try{localStorage.setItem('bake_grill_checkout_push_optin','1');}catch(e){}
        setCheckoutPushStatus('✅ Notifications are ON on this phone. This order will be linked when you place it.');
      }else{
        try{localStorage.setItem('bake_grill_checkout_push_optin','0');}catch(e){}
        box.checked=false;
        setCheckoutPushStatus('❌ NOT ON. Allow notifications in browser/site settings, then select this checkbox again.');
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
      const orderId=localStorage.getItem(LAST_ORDER_KEY)||localStorage.getItem('bakeGrillActiveOrder')||'';
      if(orderId)await saveTokenForOrder(orderId);
      setButton('✓ Notifications ON',true);
      if(button)button.setAttribute('aria-pressed','true');
      try{localStorage.setItem('bake_grill_checkout_push_optin','1');}catch(e){}
      setNotificationPromptVisible(false);
      const linked=!!orderId;
      setPushStatus('on','NOTIFICATIONS ARE ON',linked?'This phone is subscribed and linked to your latest order.':'This phone is subscribed. Select “Get order updates” at checkout to link your next order.');
      setHelp(linked?'✅ Push is active on this phone and linked to your latest order.':'✅ Push is active on this phone. Remember to select order notifications at checkout.');
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
      localStorage.setItem(LAST_ORDER_KEY,String(orderId));
      if(!enabled){setHelp('Order updates are turned off for this order on this phone.');return false;}
      if(Notification.permission==='granted'){
        const token=await getToken();
        if(!token)throw new Error('Notifications are allowed, but Firebase did not return a push token.');
        const linked=await saveTokenForOrder(orderId);
        if(!linked)throw new Error('The push subscription could not be linked to this order.');
        setNotificationPromptVisible(false);
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
    if('Notification' in window&&Notification.permission==='granted')setNotificationPromptVisible(false);
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
          setButton('✓ Notifications ON',true);
          btn.setAttribute('aria-pressed','true');
          setPushStatus('on','NOTIFICATIONS ARE ON','This browser has a valid push subscription. New orders can be linked at checkout.');
          setHelp('✅ Notifications are already enabled on this phone.');
          setNotificationPromptVisible(false);
        }else{
          setNotificationPromptVisible(true);
          setButton('🔔 Retry Notifications',false);
          setPushStatus('error','NOTIFICATION SETUP INCOMPLETE','Browser permission is allowed, but Firebase did not return a push token. Tap to retry.');
        }
      }else if(Notification.permission==='default'){
        setNotificationPromptVisible(true);
        setButton('🔔 Enable Notifications',false);
        setPushStatus('off','NOTIFICATIONS ARE OFF','Tap the green button and choose Allow when your browser asks.');
      }else{
        setNotificationPromptVisible(true);
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
  window.BakeGrillPush={enable,attachToOrder,init,isEnabled:hasValidPushPermission,refreshUI:function(){setNotificationPromptVisible(!hasValidPushPermission());}};
  // Deferred script runs after the document is parsed; initialise immediately rather than waiting for all images to load.
  bindCheckoutPushOptIn();
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{initPromise=init();},{once:true});
  }else{
    initPromise=init();
  }
})();

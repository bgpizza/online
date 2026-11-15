(function(){
  const TOKEN_KEY='bake_grill_fcm_token_v1';
  const LAST_ORDER_KEY='bake_grill_last_order_v1';
  let messaging=null;

  async function supported(){
    if(!(window.firebase && firebase.messaging && firebase.messaging.isSupported)) return false;
    try { return await firebase.messaging.isSupported(); } catch(e) { return false; }
  }

  function setButton(text, disabled=false){
    const b=document.getElementById('enableNotifications');
    if(b){b.textContent=text;b.disabled=disabled;}
  }

  function toast(title, body){
    let el=document.getElementById('pushToast');
    if(!el){
      el=document.createElement('div');el.id='pushToast';el.className='push-toast';
      document.body.appendChild(el);
    }
    el.innerHTML='<b>'+String(title||'Bake & Grill').replace(/[<>]/g,'')+'</b><span>'+String(body||'').replace(/[<>]/g,'')+'</span>';
    el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),5000);
  }

  async function getMessaging(){
    if(!(await supported())) throw new Error('Push notifications are not supported in this browser.');
    if(!messaging) messaging=firebase.messaging();
    return messaging;
  }

  async function getToken(){
    const m=await getMessaging();
    const reg=await navigator.serviceWorker.ready;
    // Firebase can use its default Web Push key. A custom VAPID key can be added later.
    const token=await m.getToken({serviceWorkerRegistration:reg, vapidKey:'BD8gsCB9m77XRsjC1n0sgdTCZM_s6a6pjXJhbuP3iYV0euXIiwmni9-duvE5snYKB_cmfUieX9FmgiF5oNxFABo'});
    if(token){
      try{localStorage.setItem(TOKEN_KEY,token);}catch(e){}
    }
    return token;
  }

  async function saveTokenForOrder(orderId){
    if(!orderId || !window.db || !window.firebaseReady) return false;
    const token=localStorage.getItem(TOKEN_KEY);
    if(!token) return false;
    const savedKey='bake_grill_push_saved_'+String(orderId);
    try{if(localStorage.getItem(savedKey)===token)return true;}catch(e){}
    try{
      await db.collection('pushTokens').add({
        token,
        orderId:String(orderId),
        createdAt:firebase.firestore.FieldValue.serverTimestamp(),
        platform:'web-pwa'
      });
      try{localStorage.setItem(savedKey,token);}catch(e){}
      return true;
    }catch(e){console.warn('Push token save failed:',e);return false;}
  }

  async function enable(){
    if(!(await supported())){
      toast('Notifications unavailable','Please use Chrome, Edge or Android Chrome over HTTPS.');
      return;
    }
    if(!('Notification' in window)) return;
    setButton('Enabling…',true);
    try{
      const permission=Notification.permission==='granted' ? 'granted' : await Notification.requestPermission();
      if(permission!=='granted') throw new Error('Notification permission was not granted.');
      const token=await getToken();
      if(!token) throw new Error('Could not create a notification token.');
      const orderId=localStorage.getItem(LAST_ORDER_KEY)||localStorage.getItem('bakeGrillActiveOrder')||'';
      if(orderId) await saveTokenForOrder(orderId);
      setButton('🔔 Notifications ON',true);
      toast('Notifications enabled','We will notify you when your order status changes.');
    }catch(e){
      console.error('Push setup:',e);
      setButton('🔔 Enable Notifications',false);
      toast('Could not enable notifications',e.message||'Please try again.');
    }
  }

  async function attachToOrder(orderId){
    try{
      localStorage.setItem(LAST_ORDER_KEY,String(orderId));
      if(Notification.permission==='granted'){
        await getToken();
        await saveTokenForOrder(orderId);
      }
    }catch(e){console.warn('Push order attach:',e)}
  }


  function showStartupPermissionPopup(){
    if(!('Notification' in window) || Notification.permission!=='default') return;
    if(sessionStorage.getItem('bake_grill_push_popup_dismissed')==='1') return;
    if(document.getElementById('bgPushStartupModal')) return;
    const wrap=document.createElement('div');wrap.id='bgPushStartupModal';
    wrap.innerHTML=`<div class="bg-push-backdrop"><section class="bg-push-dialog" role="dialog" aria-modal="true" aria-labelledby="bgPushTitle"><div class="bg-push-icon">🔔</div><h2 id="bgPushTitle">Order updates from Bake &amp; Grill</h2><p>Allow notifications to get live updates when your order is accepted, being prepared and out for delivery.</p><button type="button" id="bgPushAllow">Enable Notifications</button><button type="button" id="bgPushLater">Maybe later</button><small>You can change this permission anytime in your browser settings.</small></section></div>`;
    const style=document.createElement('style');style.textContent=`#bgPushStartupModal{position:fixed;inset:0;z-index:100500;font-family:inherit}.bg-push-backdrop{position:absolute;inset:0;background:rgba(10,18,15,.64);display:flex;align-items:center;justify-content:center;padding:20px}.bg-push-dialog{width:min(100%,390px);background:#fff;color:#18231d;border-radius:22px;padding:26px 22px 20px;text-align:center;box-shadow:0 24px 80px #0005}.bg-push-icon{font-size:38px;margin-bottom:8px}.bg-push-dialog h2{font-size:22px;margin:5px 0 10px}.bg-push-dialog p{font-size:14px;line-height:1.55;color:#59645e;margin:0 0 18px}.bg-push-dialog #bgPushAllow{display:block;width:100%;border:0;border-radius:12px;padding:14px;background:#168a45;color:#fff;font-weight:800;font-size:15px}.bg-push-dialog #bgPushLater{display:block;width:100%;border:0;background:transparent;padding:12px;color:#536158;font-weight:650}.bg-push-dialog small{display:block;color:#87918a;font-size:11px;line-height:1.4}`;document.head.appendChild(style);document.body.appendChild(wrap);
    wrap.querySelector('#bgPushAllow').addEventListener('click',async()=>{wrap.querySelector('#bgPushAllow').disabled=true;try{await enable();if(Notification.permission==='granted')wrap.remove();}finally{if(wrap.isConnected)wrap.querySelector('#bgPushAllow').disabled=false;}});
    wrap.querySelector('#bgPushLater').addEventListener('click',()=>{sessionStorage.setItem('bake_grill_push_popup_dismissed','1');wrap.remove();});
  }

  async function init(){
    const btn=document.getElementById('enableNotifications');
    if(!btn) return;
    if(!(await supported())){
      btn.textContent='🔔 Notifications unavailable';btn.disabled=true;return;
    }
    btn.addEventListener('click',enable);
    if(Notification.permission==='default') showStartupPermissionPopup();
    if(Notification.permission==='granted'){
      try{await getToken();const activeOrder=localStorage.getItem(LAST_ORDER_KEY)||localStorage.getItem('bakeGrillActiveOrder')||'';if(activeOrder)await saveTokenForOrder(activeOrder);setButton('🔔 Notifications ON',true);}catch(e){console.warn(e)}
    }
    try{
      const m=await getMessaging();
      m.onMessage(payload=>{
        const n=payload.notification||{};
        const d=payload.data||{};
        toast(n.title||d.title||'Bake & Grill',n.body||d.body||'Your order has an update.');
      });
    }catch(e){console.warn('Foreground messaging:',e)}
  }

  window.BakeGrillPush={enable,attachToOrder,init};
  window.addEventListener('load',()=>setTimeout(init,800));
})();

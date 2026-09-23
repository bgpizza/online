(function(){
  const TOKEN_KEY='bake_grill_fcm_token_v1';
  const LAST_ORDER_KEY='bake_grill_last_order_v1';
  let messaging=null;

  function supported(){
    return !!(window.firebase && firebase.messaging && firebase.messaging.isSupported && firebase.messaging.isSupported());
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
    if(!supported()) throw new Error('Push notifications are not supported in this browser.');
    if(!messaging) messaging=firebase.messaging();
    return messaging;
  }

  async function getToken(){
    const m=await getMessaging();
    const reg=await navigator.serviceWorker.ready;
    // Firebase can use its default Web Push key. A custom VAPID key can be added later.
    const token=await m.getToken({serviceWorkerRegistration:reg});
    if(token){
      try{localStorage.setItem(TOKEN_KEY,token);}catch(e){}
    }
    return token;
  }

  async function saveTokenForOrder(orderId){
    if(!orderId || !window.db || !window.firebaseReady) return false;
    const token=localStorage.getItem(TOKEN_KEY);
    if(!token) return false;
    try{
      await db.collection('pushTokens').add({
        token,
        orderId:String(orderId),
        createdAt:firebase.firestore.FieldValue.serverTimestamp(),
        platform:'web-pwa'
      });
      return true;
    }catch(e){console.warn('Push token save failed:',e);return false;}
  }

  async function enable(){
    if(!supported()){
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
      const orderId=localStorage.getItem(LAST_ORDER_KEY)||'';
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

  async function init(){
    const btn=document.getElementById('enableNotifications');
    if(!btn) return;
    if(!supported()){
      btn.textContent='🔔 Notifications unavailable';btn.disabled=true;return;
    }
    btn.addEventListener('click',enable);
    if(Notification.permission==='granted'){
      try{await getToken();setButton('🔔 Notifications ON',true);}catch(e){console.warn(e)}
    }
    try{
      const m=await getMessaging();
      m.onMessage(payload=>{
        const n=payload.notification||{};
        toast(n.title||'Bake & Grill',n.body||'Your order has an update.');
      });
    }catch(e){console.warn('Foreground messaging:',e)}
  }

  window.BakeGrillPush={enable,attachToOrder,init};
  window.addEventListener('load',()=>setTimeout(init,800));
})();

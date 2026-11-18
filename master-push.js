(function(){
  const VAPID_KEY='BD8gsCB9m77XRsjC1n0sgdTCZM_s6a6pjXJhbuP3iYV0euXIiwmni9-duvE5snYKB_cmfUieX9FmgiF5oNxFABo';
  let messaging=null;
  let initPromise=null;
  let enablePromise=null;
  let foregroundHandlerBound=false;
  let clickHandlerBound=false;

  async function supported(){
    if(!window.isSecureContext) throw new Error('Push notifications require HTTPS. Open https://bakeandgrill.in.');
    if(!('Notification' in window)) throw new Error('This browser does not support notifications.');
    if(!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser does not support service-worker push notifications. Use Chrome or Edge.');
    if(!window.firebase || !firebase.messaging || typeof firebase.messaging.isSupported!=='function') throw new Error('Firebase Messaging SDK did not load. Refresh the Master page.');
    let ok=false;
    try{ok=await firebase.messaging.isSupported();}catch(e){throw new Error('Firebase Messaging support check failed: '+(e.message||e));}
    if(!ok) throw new Error('Push is not supported in this browser profile. Try current Chrome or Edge and allow notifications for bakeandgrill.in.');
    return true;
  }

  function updateButton(state,message){
    const b=document.getElementById('masterPushBtn');
    if(!b)return;
    b.disabled=false;
    if(state==='on'){
      b.textContent='🔔 Alerts ON';
      b.classList.add('push-on');
      b.title='Master push notifications are enabled on this browser.';
    }else if(state==='error'){
      b.textContent='⚠ Retry Order Alerts';
      b.classList.remove('push-on');
      b.title=message||'Push setup failed. Click to retry.';
    }else{
      b.textContent='🔔 Enable Order Alerts';
      b.classList.remove('push-on');
      b.title='Enable notifications for new Bake & Grill orders.';
    }
  }

  async function getMasterToken(){
    if(!window.db || !window.firebaseReady || !window.auth) throw new Error('Firebase is not initialized. Refresh the Master page.');
    const user=auth.currentUser;
    if(!user || user.isAnonymous) throw new Error('Please sign in to the Master Site first.');
    await supported();
    if(Notification.permission==='denied') throw new Error('Notifications are blocked for this site. Open Site Settings → Notifications → Allow, then retry.');
    if(Notification.permission!=='granted'){
      const permission=await Notification.requestPermission();
      if(permission!=='granted') throw new Error('Notification permission was not granted. Allow notifications for bakeandgrill.in and retry.');
    }

    const registration=await navigator.serviceWorker.register('./sw.js?v=20261118-master-push-v2',{scope:'./'});
    await navigator.serviceWorker.ready;
    if(!registration.active && !registration.waiting) throw new Error('Bake & Grill service worker did not become active. Refresh and retry.');

    if(!messaging) messaging=firebase.messaging();
    const token=await messaging.getToken({serviceWorkerRegistration:registration,vapidKey:VAPID_KEY});
    if(!token) throw new Error('Firebase did not return a push token. Check Firebase Console → Project settings → Cloud Messaging → Web Push certificates; the key must match the VAPID key in master-push.js.');

    const safeId=btoa(unescape(encodeURIComponent(token))).split('+').join('-').split('/').join('_').replace(/=+$/,'');
    await db.collection('masterPushTokens').doc(safeId).set({
      token,role:'master',enabled:true,
      updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
      userId:user.uid
    },{merge:true});
    try{localStorage.setItem('bake_grill_master_push_enabled','1');}catch(e){}
    updateButton('on');
    return token;
  }

  async function enableMasterPush(){
    if(enablePromise)return enablePromise;
    const b=document.getElementById('masterPushBtn');
    if(b){b.disabled=true;b.textContent='Connecting…';}
    enablePromise=(async()=>{
      try{
        const token=await getMasterToken();
        const id=btoa(unescape(encodeURIComponent(token))).split('+').join('-').split('/').join('_').replace(/=+$/,'');
        const snap=await db.collection('masterPushTokens').doc(id).get();
        if(!snap.exists || snap.data()?.enabled!==true) throw new Error('Push token could not be confirmed in Firestore. Check Firestore Rules for masterPushTokens.');
        updateButton('on');
        return token;
      }catch(e){
        console.error('Bake & Grill Master push setup failed:',e);
        updateButton('error',e.message);
        throw e;
      }finally{
        enablePromise=null;
      }
    })();
    return enablePromise;
  }

  function bindForegroundHandler(){
    if(foregroundHandlerBound || !messaging)return;
    foregroundHandlerBound=true;
    messaging.onMessage(async payload=>{
      const id=payload.data?.orderId||payload.data?.orderDocId;
      if(!id)return;
      try{
        const snap=await db.collection('orders').doc(id).get();
        if(snap.exists && snap.data().status==='NEW' && typeof window.showNewOrder==='function') window.showNewOrder(snap.data()||{});
      }catch(e){console.warn('Master foreground push handler:',e);}
    });
  }

  async function init(){
    if(initPromise)return initPromise;
    initPromise=(async()=>{
      const b=document.getElementById('masterPushBtn');
      if(b && !clickHandlerBound){
        clickHandlerBound=true;
        b.addEventListener('click',async()=>{
          try{await enableMasterPush();}
          catch(e){alert(e.message||'Could not enable Master order alerts.');}
        });
      }
      if(!window.db || !window.firebaseReady || !window.auth)return;
      const user=auth.currentUser;
      if(!user || user.isAnonymous){updateButton('off');return;}
      try{
        await supported();
        if(!messaging)messaging=firebase.messaging();
        bindForegroundHandler();
        if(Notification.permission==='granted'){
          await getMasterToken();
        }else{
          updateButton('off');
        }
      }catch(e){
        console.warn('Master push initial setup:',e);
        updateButton('error',e.message);
      }
    })().finally(()=>{initPromise=null;});
    return initPromise;
  }

  window.BakeGrillMasterPush={enable:enableMasterPush,init};
  window.addEventListener('load',()=>setTimeout(()=>init().catch(e=>console.warn(e)),800));
})();
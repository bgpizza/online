(function(){
  const VAPID_KEY='BD8gsCB9m77XRsjC1n0sgdTCZM_s6a6pjXJhbuP3iYV0euXIiwmni9-duvE5snYKB_cmfUieX9FmgiF5oNxFABo';
  let messaging=null;
  let initPromise=null;
  let enablePromise=null;
  let foregroundHandlerBound=false;
  let clickHandlerBound=false;

  function withTimeout(promise,ms,label){
    return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+' timed out. Refresh the Master page and retry.')),ms))]);
  }

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
    const testButton=document.getElementById('masterPushTestBtn');
    if(testButton)testButton.disabled=state!=='on';
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

    const registration=await withTimeout(navigator.serviceWorker.register('./sw.js?v=20261120-order-sync-fix-v1',{scope:'./'}),10000,'Service worker registration');
    const readyRegistration=await withTimeout(navigator.serviceWorker.ready,10000,'Service worker activation');
    if(!registration.active && !registration.waiting && !registration.installing && !readyRegistration.active) throw new Error('Bake & Grill service worker did not become active. Open browser Site settings and retry.');

    if(!messaging) messaging=firebase.messaging();
    const token=await withTimeout(messaging.getToken({serviceWorkerRegistration:registration,vapidKey:VAPID_KEY}),15000,'Firebase push token request');
    if(!token) throw new Error('Firebase did not return a push token. Check Firebase Console → Project settings → Cloud Messaging → Web Push certificates; the key must match the VAPID key in master-push.js.');

    const safeId=btoa(unescape(encodeURIComponent(token))).split('+').join('-').split('/').join('_').replace(/=+$/,'');
    await withTimeout(db.collection('masterPushTokens').doc(safeId).set({
      token,role:'master',enabled:true,
      updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
      userId:user.uid
    },{merge:true}),10000,'Saving the Master push token to Firestore');
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
        // Token was saved successfully by getMasterToken(). Do not read it back:
        // Firestore Rules intentionally deny client reads of masterPushTokens.
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

  async function sendTestPush(){
    const button=document.getElementById('masterPushTestBtn');
    if(!auth?.currentUser || auth.currentUser.isAnonymous)throw new Error('Please sign in to the Master Site first.');
    if(Notification.permission!=='granted')throw new Error('Allow browser notifications for bakeandgrill.in first.');
    if(!firebase.functions)throw new Error('Firebase Functions SDK did not load. Refresh Master.');
    if(button){button.disabled=true;button.textContent='Sending test…';}
    try{
      const call=firebase.app().functions('us-central1').httpsCallable('sendMasterPushTestV2');
      const result=await withTimeout(call(),20000,'Test notification request');
      const sent=Number(result?.data?.successCount||0);
      const failed=Number(result?.data?.failureCount||0);
      if(sent<1)throw new Error('Firebase did not accept the test notification. Failed tokens: '+failed);
      if(button)button.textContent='✅ Test sent';
      return {sent,failed};
    }finally{
      if(button){button.disabled=false;button.textContent='🧪 Send Test Push';}
    }
  }

  function bindForegroundHandler(){
    if(foregroundHandlerBound || !messaging)return;
    foregroundHandlerBound=true;
    messaging.onMessage(async payload=>{
      const data=payload.data||{};
      if(data.type==='TEST_PUSH'){
        try{
          const registration=await navigator.serviceWorker.ready;
          await registration.showNotification(data.title||'Bake & Grill — Test Notification',{
            body:data.body||'Push notifications are connected.',
            icon:'./assets/icon-192.png',badge:'./assets/icon-192.png',
            tag:'bake-grill-push-test',data:{url:'./master.html'}
          });
        }catch(e){console.warn('Test notification display failed:',e);}
        return;
      }
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
      const testButton=document.getElementById('masterPushTestBtn');
      if(testButton && !testButton.dataset.bound){
        testButton.dataset.bound='1';
        testButton.addEventListener('click',async()=>{
          try{
            const result=await sendTestPush();
            alert('Test push sent by Firebase. Success: '+result.sent+', failed: '+result.failed+'. Check your Windows notification area.');
          }catch(e){
            console.error('Bake & Grill test push failed:',e);
            alert(e.message||'Could not send a test notification.');
          }
        });
      }
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

  window.BakeGrillMasterPush={enable:enableMasterPush,init,test:sendTestPush};
  window.addEventListener('load',()=>setTimeout(()=>init().catch(e=>console.warn(e)),800));
})();
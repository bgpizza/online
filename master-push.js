(function(){
  const VAPID_KEY='BD8gsCB9m77XRsjC1n0sgdTCZM_s6a6pjXJhbuP3iYV0euXIiwmni9-duvE5snYKB_cmfUieX9FmgiF5oNxFABo';
  let messaging=null;
  function supported(){return !!(window.firebase&&firebase.messaging&&firebase.messaging.isSupported&&firebase.messaging.isSupported());}
  async function enableMasterPush(){
    if(!supported()) throw new Error('Push notifications are not supported in this browser. Use Chrome or Edge over HTTPS.');
    if(!('Notification' in window)) throw new Error('Browser notifications are not available.');
    const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
    if(permission!=='granted') throw new Error('Notification permission was not granted.');
    if(!messaging) messaging=firebase.messaging();
    const reg=await navigator.serviceWorker.ready;
    const token=await messaging.getToken({serviceWorkerRegistration:reg,vapidKey:VAPID_KEY});
    if(!token) throw new Error('Could not create a push token.');
    const safeId=btoa(unescape(encodeURIComponent(token))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    await db.collection('masterPushTokens').doc(safeId).set({token,role:'master',enabled:true,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),userId:auth.currentUser?.uid||null},{merge:true});
    localStorage.setItem('bake_grill_master_push_enabled','1');
    updateButton(true);
    return token;
  }
  function updateButton(on){const b=document.getElementById('masterPushBtn');if(b){b.textContent=on?'🔔 Alerts ON':'🔔 Enable Order Alerts';b.classList.toggle('push-on',!!on);}}
  async function init(){
    if(!window.db||!window.firebaseReady||!window.auth)return;
    const b=document.getElementById('masterPushBtn');
    if(b)b.onclick=async()=>{try{b.disabled=true;await enableMasterPush();}catch(e){console.error(e);alert(e.message||'Could not enable order alerts.');}finally{b.disabled=false;}};
    if(Notification.permission==='granted'){
      try{await enableMasterPush();}catch(e){console.warn('Master push auto setup:',e);}
    } else updateButton(false);
    if(supported()){
      try{
        if(!messaging) messaging=firebase.messaging();
        messaging.onMessage(async payload=>{
          const id=payload.data?.orderId||payload.data?.orderDocId;
          if(!id)return;
          try{
            const snap=await db.collection('orders').doc(id).get();
            if(snap.exists && snap.data().status==='NEW') window.showNewOrder(snap.data()||{});
          }catch(e){console.warn('Master foreground push:',e);}
        });
      }catch(e){console.warn('Master foreground messaging:',e);}
    }
  }
  window.BakeGrillMasterPush={enable:enableMasterPush,init};
  window.addEventListener('load',()=>setTimeout(init,1200));
})();

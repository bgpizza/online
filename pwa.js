(function(){
  let deferredInstallPrompt = null;
  let waitingWorker = null;

  function addMeta(){
    if(!document.querySelector('meta[name="mobile-web-app-capable"]')){
      const m=document.createElement('meta');m.name='mobile-web-app-capable';m.content='yes';document.head.appendChild(m);
    }
    if(!document.querySelector('meta[name="apple-mobile-web-app-capable"]')){
      const m=document.createElement('meta');m.name='apple-mobile-web-app-capable';m.content='yes';document.head.appendChild(m);
    }
  }

  function ensureUi(){
    if(document.getElementById('pwaNetworkBar')) return;
    const bar=document.createElement('div');
    bar.id='pwaNetworkBar';bar.className='pwa-network';bar.setAttribute('role','status');
    bar.innerHTML='<span id="pwaNetworkText">Online</span>';
    document.body.appendChild(bar);

    const install=document.createElement('button');
    install.id='pwaInstallBtn';install.className='pwa-fab';install.type='button';install.textContent='📲 Install App';
    install.hidden=true;document.body.appendChild(install);

    const update=document.createElement('div');
    update.id='pwaUpdate';update.className='pwa-update';update.hidden=true;
    update.innerHTML='<span>✨ New version available</span><button id="pwaUpdateBtn" type="button">Update</button><button id="pwaUpdateClose" type="button" aria-label="Close">×</button>';
    document.body.appendChild(update);

    install.addEventListener('click',async()=>{
      if(!deferredInstallPrompt)return;
      deferredInstallPrompt.prompt();
      try{await deferredInstallPrompt.userChoice}catch(e){}
      deferredInstallPrompt=null;install.hidden=true;
    });
    document.getElementById('pwaUpdateBtn').onclick=()=>waitingWorker?.postMessage({type:'SKIP_WAITING'});
    document.getElementById('pwaUpdateClose').onclick=()=>update.hidden=true;

    updateNetwork();
    window.addEventListener('online',updateNetwork);
    window.addEventListener('offline',updateNetwork);
  }

  function updateNetwork(){
    const bar=document.getElementById('pwaNetworkBar');
    const text=document.getElementById('pwaNetworkText');
    if(!bar||!text)return;
    if(navigator.onLine){bar.classList.remove('offline');text.textContent='🟢 Online';setTimeout(()=>bar.classList.remove('show'),1200);}
    else{bar.classList.add('offline','show');text.textContent='🔴 Offline — saved cart is still available';}
  }

  function register(){
    if(!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js?v=20260923-advanced').then(reg=>{
      if(reg.waiting){waitingWorker=reg;showUpdate();}
      reg.addEventListener('updatefound',()=>{
        const worker=reg.installing;if(!worker)return;
        worker.addEventListener('statechange',()=>{
          if(worker.state==='installed' && navigator.serviceWorker.controller){waitingWorker=worker;showUpdate();}
        });
      });
      setInterval(()=>reg.update().catch(()=>{}), 30*60*1000);
    }).catch(err=>console.warn('PWA service worker:',err));
    navigator.serviceWorker.addEventListener('controllerchange',()=>window.location.reload());
  }
  function showUpdate(){const el=document.getElementById('pwaUpdate');if(el)el.hidden=false;}

  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();deferredInstallPrompt=e;
    const btn=document.getElementById('pwaInstallBtn');if(btn)btn.hidden=false;
  });
  window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;const btn=document.getElementById('pwaInstallBtn');if(btn)btn.hidden=true;});

  window.addEventListener('load',()=>{addMeta();ensureUi();register();});
})();

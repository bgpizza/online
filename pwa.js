(function(){
  var deferredPrompt = null;
  var installBtn = null;

  function isStandalone(){
    return !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true ||
      document.referrer.indexOf('android-app://') === 0);
  }

  function isIOS(){
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  }

  function refreshInstallButton(){
    if(!installBtn) return;
    installBtn.style.display = isStandalone() ? 'none' : 'flex';
  }

  async function installApp(){
    if(isStandalone()) return;
    if(deferredPrompt){
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch(e) {}
      deferredPrompt = null;
      refreshInstallButton();
      return;
    }
    if(isIOS()){
      alert('Install Bake & Grill: tap the Share button in Safari, then choose “Add to Home Screen”.');
      return;
    }
    alert('Open your browser menu and choose “Install Bake & Grill” or “Add to Home screen”.');
  }

  function setup(){
    installBtn=document.getElementById('installNowBtn');
    if(installBtn) installBtn.addEventListener('click',installApp);
    refreshInstallButton();
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('./sw.js').catch(function(err){console.warn('PWA service worker:',err);});
    }
  }

  window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();
    deferredPrompt=e;
    refreshInstallButton();
  });

  window.addEventListener('appinstalled',function(){
    deferredPrompt=null;
    refreshInstallButton();
  });

  window.addEventListener('DOMContentLoaded',setup);
})();

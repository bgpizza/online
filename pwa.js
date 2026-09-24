(function(){
  var deferredPrompt = null;
  var installBtn = null;
  var banner = null;
  var closeBtn = null;

  function isStandalone(){
    return !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true ||
      document.referrer.indexOf('android-app://') === 0);
  }

  function isIOS(){
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  }

  function showBanner(){
    if(!banner || isStandalone()) return;
    banner.classList.add('show');
  }

  function hideBanner(){
    if(!banner) return;
    banner.classList.remove('show');
  }

  async function installApp(){
    if(isStandalone()) return;
    if(deferredPrompt){
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch(e) {}
      deferredPrompt = null;
      hideBanner();
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
    banner=document.getElementById('pwaInstallBanner');
    closeBtn=document.getElementById('closeInstallBanner');
    if(installBtn) installBtn.addEventListener('click',installApp);
    if(closeBtn) closeBtn.addEventListener('click',hideBanner);
    if(!isStandalone()) showBanner();
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('./sw.js?v=20260924-2').catch(function(err){console.warn('PWA service worker:',err);});
    }
  }

  window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();
    deferredPrompt=e;
    showBanner();
  });

  window.addEventListener('appinstalled',function(){
    deferredPrompt=null;
    hideBanner();
  });

  window.addEventListener('DOMContentLoaded',setup);
})();

(function(){
  var deferredPrompt = null;
  var banner = null;
  var installBtn = null;
  var closeBtn = null;
  var help = null;

  function isStandalone(){
    return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.indexOf('android-app://') === 0;
  }

  function isIOS(){
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  }

  function hideBanner(){
    if (banner) banner.classList.remove('show');
  }

  function showBanner(){
    if (!banner || isStandalone()) return;
    banner.classList.add('show');
  }

  function setupInstallUI(){
    banner = document.getElementById('pwaInstallBanner');
    installBtn = document.getElementById('pwaInstallBtn');
    closeBtn = document.getElementById('pwaInstallClose');
    help = document.getElementById('pwaInstallHelp');
    if (!banner || !installBtn) return;

    if (isStandalone()) { hideBanner(); return; }

    if (isIOS()) {
      installBtn.textContent = '📲 How to Install';
      help.textContent = 'Tap Share ↗ and choose “Add to Home Screen”.';
      showBanner();
    }

    installBtn.addEventListener('click', async function(){
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try {
          var choice = await deferredPrompt.userChoice;
          if (choice && choice.outcome === 'accepted') hideBanner();
        } catch(e) {}
        deferredPrompt = null;
        return;
      }
      if (isIOS()) {
        alert('To install Bake & Grill: tap the Share button in your browser, then choose “Add to Home Screen”.');
        return;
      }
      alert('If your browser supports installation, open the browser menu and choose “Install Bake & Grill” or “Add to Home screen”.');
    });

    if (closeBtn) closeBtn.addEventListener('click', function(){ hideBanner(); });
  }

  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    showBanner();
  });

  window.addEventListener('appinstalled', function(){
    deferredPrompt = null;
    hideBanner();
  });

  window.addEventListener('load', function(){
    setupInstallUI();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(function(err){
        console.warn('PWA service worker:', err);
      });
    }
  });

  window.addEventListener('DOMContentLoaded', setupInstallUI);
})();

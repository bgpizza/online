(function(){
  'use strict';
  var deferredPrompt=null,installBtn=null,banner=null,closeBtn=null;
  var DISMISS_KEY='bg_pwa_install_dismissed_until_v2';
  var INSTALLED_KEY='bg_pwa_installed_v2';
  var SW_URL='./sw.js?v=20261119-app-shell-v3';

  function isStandalone(){
    return !!((window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||
      (window.matchMedia&&window.matchMedia('(display-mode: fullscreen)').matches)||
      window.navigator.standalone===true||
      document.referrer.indexOf('android-app://')===0);
  }
  function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.MSStream;}
  function isAndroid(){return /android/i.test(navigator.userAgent);}
  function isInAppBrowser(){return /FBAN|FBAV|Instagram|Line\/|; wv\)/i.test(navigator.userAgent);}
  function setAppMode(){
    var standalone=isStandalone();
    document.documentElement.classList.toggle('pwa-standalone',standalone);
    if(document.body)document.body.classList.toggle('pwa-standalone',standalone);
    if(standalone){document.title='Bake & Grill';hideBanner();}
  }
  function dismissed(){
    try{return Number(localStorage.getItem(DISMISS_KEY)||0)>Date.now();}catch(e){return false;}
  }
  function showBanner(){
    if(!banner||isStandalone()||dismissed())return;
    banner.classList.add('show');
    banner.setAttribute('aria-hidden','false');
  }
  function hideBanner(remember){
    if(!banner)return;
    banner.classList.remove('show');
    banner.setAttribute('aria-hidden','true');
    if(remember){try{localStorage.setItem(DISMISS_KEY,String(Date.now()+7*24*60*60*1000));}catch(e){}}
  }
  function closeGuide(){
    var guide=document.getElementById('pwaInstallGuide');
    if(guide){guide.classList.remove('show');guide.setAttribute('aria-hidden','true');}
  }
  function showGuide(){
    var ios=isIOS(),inApp=isInAppBrowser();
    var title=ios?'Add Bake & Grill to your iPhone':isAndroid()?'Install Bake & Grill on Android':'Install Bake & Grill';
    var steps=ios?[
      'Open this page in Safari (not inside Google or another app).',
      'Tap the Share icon at the bottom of Safari.',
      'Choose “Add to Home Screen”.',
      'Turn on “Open as Web App”, then tap Add.'
    ]:inApp?[
      'Open the browser menu in this app.',
      'Choose “Open in Chrome” or “Open in browser”.',
      'In Chrome, tap ⋮ and choose “Install app” or “Add to Home screen”.'
    ]:[
      'Open the browser menu (⋮) in Chrome.',
      'Choose “Install app” or “Add to Home screen”.',
      'Confirm Install. Bake & Grill will appear on your home screen.'
    ];
    var guide=document.getElementById('pwaInstallGuide');
    if(!guide){
      guide=document.createElement('div');guide.id='pwaInstallGuide';guide.className='pwa-install-guide';
      guide.setAttribute('aria-hidden','true');
      guide.innerHTML='<div class="pwa-install-guide-backdrop" data-close-install></div><section class="pwa-install-guide-card" role="dialog" aria-modal="true" aria-labelledby="pwaInstallGuideTitle"><button type="button" class="pwa-guide-close" aria-label="Close" data-close-install>×</button><div class="pwa-guide-app-icon"><img src="./assets/icon-192.png" alt=""></div><div class="pwa-guide-kicker">BAKE &amp; GRILL APP</div><h2 id="pwaInstallGuideTitle"></h2><p class="pwa-guide-intro">Get one-tap access to the menu, your account and live order tracking.</p><ol class="pwa-guide-steps"></ol><button type="button" class="pwa-guide-done" data-close-install>Got it</button></section>';
      document.body.appendChild(guide);
      guide.querySelectorAll('[data-close-install]').forEach(function(btn){btn.addEventListener('click',closeGuide);});
      document.addEventListener('keydown',function(e){if(e.key==='Escape')closeGuide();});
    }
    guide.querySelector('#pwaInstallGuideTitle').textContent=title;
    guide.querySelector('.pwa-guide-steps').innerHTML=steps.map(function(step){var li=document.createElement('li');li.textContent=step;return li.outerHTML;}).join('');
    guide.classList.add('show');guide.setAttribute('aria-hidden','false');
  }
  async function installApp(){
    if(isStandalone())return;
    if(deferredPrompt){
      installBtn&&(installBtn.disabled=true);
      try{
        await deferredPrompt.prompt();
        var choice=await deferredPrompt.userChoice;
        if(choice&&choice.outcome==='accepted'){
          hideBanner(true);
          try{localStorage.setItem(INSTALLED_KEY,'1');}catch(e){}
        }else if(choice&&choice.outcome==='dismissed'){
          if(installBtn)installBtn.disabled=false;
        }
      }catch(e){console.warn('PWA install prompt:',e);showGuide();if(installBtn)installBtn.disabled=false;}
      deferredPrompt=null;
      return;
    }
    showGuide();
  }
  function setup(){
    installBtn=document.getElementById('installNowBtn');
    banner=document.getElementById('pwaInstallBanner');
    closeBtn=document.getElementById('closeInstallBanner');
    if(installBtn)installBtn.addEventListener('click',installApp);
    if(closeBtn)closeBtn.addEventListener('click',function(){hideBanner(true);});
    setAppMode();
    if(!isStandalone())showBanner();
    if(window.matchMedia){
      var display=window.matchMedia('(display-mode: standalone)');
      display.addEventListener?.('change',setAppMode);
    }
    window.addEventListener('pageshow',setAppMode);
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register(SW_URL).then(function(reg){
        reg.update().catch(function(){});
      }).catch(function(err){console.warn('PWA service worker:',err);});
    }
  }
  window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();deferredPrompt=e;showBanner();
  });
  window.addEventListener('appinstalled',function(){
    deferredPrompt=null;try{localStorage.setItem(INSTALLED_KEY,'1');}catch(e){}
    hideBanner();setAppMode();
  });
  window.BakeGrillPWA={isStandalone:isStandalone,install:installApp,showInstallGuide:showGuide};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();

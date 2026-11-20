(function(){
  'use strict';
  var deferredPrompt=null,installBtn=null,banner=null,closeBtn=null,lastGuideTrigger=null;
  var DISMISS_KEY='bg_pwa_install_dismissed_until_v2';
  var INSTALLED_KEY='bg_pwa_installed_v2';
  var SW_URL='./sw.js?v=20261120-phase4-unified-app-shell-v1';

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
    if(lastGuideTrigger&&typeof lastGuideTrigger.focus==='function'){
      try{lastGuideTrigger.focus({preventScroll:true});}catch(e){lastGuideTrigger.focus();}
    }
    lastGuideTrigger=null;
  }
  function showGuide(){
    lastGuideTrigger=document.activeElement;
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
      document.addEventListener('keydown',function(e){
        var g=document.getElementById('pwaInstallGuide');
        if(!g||!g.classList.contains('show'))return;
        if(e.key==='Escape'){e.preventDefault();closeGuide();return;}
        if(e.key!=='Tab')return;
        var nodes=[].slice.call(g.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function(x){return !!(x.offsetWidth||x.offsetHeight||x.getClientRects().length);});
        if(!nodes.length){e.preventDefault();return;}
        var first=nodes[0],last=nodes[nodes.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      });
    }
    guide.querySelector('#pwaInstallGuideTitle').textContent=title;
    guide.querySelector('.pwa-guide-steps').innerHTML=steps.map(function(step){var li=document.createElement('li');li.textContent=step;return li.outerHTML;}).join('');
    guide.classList.add('show');guide.setAttribute('aria-hidden','false');
    guide.querySelector('.pwa-guide-close')?.focus({preventScroll:true});
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

  // Fallback for mobile WebViews where a single-finger vertical pan is
  // intercepted by nested touch-action/overflow rules.
  function installSingleFingerScrollFallback(){
    if(window.__bgSingleFingerScrollInstalled)return;
    window.__bgSingleFingerScrollInstalled=true;
    var sx=0,sy=0,lastY=0,active=false,manual=false,startTarget=null,scrollTarget=null;
    var ignore='input,textarea,select,option,button,a,[contenteditable="true"],.manual-map,.gm-style,.gm-control-active,.pwa-install-guide-card';
    function canScroll(el,delta){
      if(!el||el===document.body||el===document.documentElement)return false;
      var style=getComputedStyle(el);
      if(!/(auto|scroll)/.test(style.overflowY))return false;
      return delta>0?el.scrollTop+el.clientHeight<el.scrollHeight-1:el.scrollTop>1;
    }
    function getTarget(el,delta){
      for(var node=el;node&&node!==document.body&&node!==document.documentElement;node=node.parentElement){
        if(node.matches&&node.matches('.manual-map,.gm-style,.categories,.quick-search,.hero-picks-grid'))return null;
        if(canScroll(node,delta))return node;
      }
      return document.scrollingElement||document.documentElement;
    }
    document.addEventListener('touchstart',function(e){
      if(e.touches.length!==1){active=false;manual=false;return;}
      var t=e.touches[0],target=e.target;
      if(target&&target.closest&&target.closest(ignore)){active=false;manual=false;return;}
      sx=t.clientX;sy=lastY=t.clientY;startTarget=target;scrollTarget=null;active=true;manual=false;
    },{capture:true,passive:true});
    document.addEventListener('touchmove',function(e){
      if(!active||e.touches.length!==1)return;
      var t=e.touches[0],dx=t.clientX-sx,dy=t.clientY-sy;
      if(!manual){
        if(Math.abs(dx)+Math.abs(dy)<8)return;
        if(Math.abs(dx)>Math.abs(dy)*1.1){active=false;return;}
        if(startTarget&&startTarget.closest&&startTarget.closest(ignore)){active=false;return;}
        scrollTarget=getTarget(startTarget,dy);
        manual=true;
      }
      if(!e.cancelable)return;
      e.preventDefault();
      var delta=lastY-t.clientY;
      if(scrollTarget&&scrollTarget!==document.body&&scrollTarget!==document.documentElement){
        var before=scrollTarget.scrollTop;
        scrollTarget.scrollTop+=delta;
        if(scrollTarget.scrollTop===before){
          var root=document.scrollingElement||document.documentElement;
          root.scrollTop+=delta;
        }
      }else{
        var root=document.scrollingElement||document.documentElement;
        root.scrollTop+=delta;
        if(document.body&&document.body!==root)document.body.scrollTop=root.scrollTop;
      }
      lastY=t.clientY;
    },{capture:true,passive:false});
    ['touchend','touchcancel'].forEach(function(name){
      document.addEventListener(name,function(){active=false;manual=false;startTarget=null;scrollTarget=null;},{capture:true,passive:true});
    });
  }

  function setupConnectionStatus(){
    var box=document.getElementById('connectionStatus');
    if(!box)return;
    function sync(){
      var offline=!navigator.onLine;
      box.hidden=!offline;
      document.documentElement.classList.toggle('is-offline',offline);
      if(offline){
        var copy=box.querySelector('[data-connection-copy]');
        if(copy)copy.textContent='You are offline. Reconnect to place or update an order.';
      }
    }
    window.addEventListener('online',sync);
    window.addEventListener('offline',sync);
    sync();
  }
  function setupAppUpdateNotice(){
    var box=document.getElementById('appUpdateNotice');
    var button=document.getElementById('applyAppUpdate');
    if(button)button.addEventListener('click',function(){button.disabled=true;button.textContent='Refreshing…';window.location.reload();});
    if(!('serviceWorker' in navigator))return;
    var hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange',function(){
      if(!hadController){hadController=true;return;}
      if(box){box.hidden=false;box.setAttribute('aria-hidden','false');}
    });
  }
  function setup(){
    installBtn=document.getElementById('installNowBtn');
    banner=document.getElementById('pwaInstallBanner');
    closeBtn=document.getElementById('closeInstallBanner');
    setupConnectionStatus();
    setupAppUpdateNotice();
    if(installBtn)installBtn.addEventListener('click',installApp);
    if(closeBtn)closeBtn.addEventListener('click',function(){hideBanner(true);});
    setAppMode();
    // Native browser scrolling is the single source of truth.
    // Do not install a touchmove/preventDefault shim here: it can suppress Android's pan gesture.
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

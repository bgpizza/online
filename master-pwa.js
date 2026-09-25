(function(){
  let deferredPrompt = null;
  function standalone(){
    return !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true);
  }
  function setButton(){
    const b=document.getElementById('masterInstallBtn');
    if(!b) return;
    if(standalone()){ b.textContent='✓ Master App'; b.disabled=true; b.title='Master is installed'; return; }
    b.disabled=false;
    b.textContent='⬇ Install Master';
  }
  async function install(){
    if(standalone()) return;
    if(deferredPrompt){
      deferredPrompt.prompt();
      try{ await deferredPrompt.userChoice; }catch(e){}
      deferredPrompt=null;
      setButton();
      return;
    }
    if(/iphone|ipad|ipod/i.test(navigator.userAgent)){
      alert('Safari: tap Share → Add to Home Screen to install Bake & Grill Master.');
    }else{
      alert('Chrome/Edge: open the browser menu and choose “Install Bake & Grill Master” or use the install icon in the address bar.');
    }
  }
  window.addEventListener('beforeinstallprompt',function(e){ e.preventDefault(); deferredPrompt=e; setButton(); });
  window.addEventListener('appinstalled',function(){ deferredPrompt=null; setButton(); });
  window.addEventListener('DOMContentLoaded',function(){
    const b=document.getElementById('masterInstallBtn');
    if(b) b.addEventListener('click',install);
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('./sw.js?v=20260925-master3').catch(e=>console.warn('Master PWA service worker:',e));
    }
    setButton();
  });
})();

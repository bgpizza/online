(function(){
  window.firebaseReady=false;
  if(!window.FIREBASE_CONFIG || String(window.FIREBASE_CONFIG.projectId).startsWith('PASTE_')){
    console.warn('Firebase config is not set. Edit firebase-config.js first.');
    return;
  }
  firebase.initializeApp(window.FIREBASE_CONFIG);
  window.db = firebase.firestore();
  window.auth = firebase.auth();
  window.firebaseReady = true;
})();

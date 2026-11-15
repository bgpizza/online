(function(){
  window.firebaseReady = false;
  window.firebaseError = null;
  const config = window.FIREBASE_CONFIG;
  try {
    if (!config || !config.apiKey || !config.projectId || !config.appId) throw new Error("Firebase Web App config is missing.");
    if (typeof firebase === "undefined") throw new Error("Firebase SDK did not load.");
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(config);
    if (typeof firebase.firestore !== "function") throw new Error("Firestore SDK did not load.");
    window.db = firebase.firestore();
    if (typeof firebase.storage === "function") {
      window.storage = firebase.storage();
    }
    if (typeof firebase.auth === "function") {
      window.auth = firebase.auth();
      // Passwordless customer account: Firebase Anonymous Auth keeps the customer
      // signed in on the same browser/PWA, so name + phone are entered only once.
      window.customerAuthReady = window.auth.signInAnonymously()
        .then(function(){ console.log("Customer account session ready:", window.auth.currentUser && window.auth.currentUser.uid); return window.auth.currentUser; })
        .catch(function(err){ console.warn("Anonymous customer auth unavailable:", err); return null; });
    } else {
      window.customerAuthReady = Promise.resolve(null);
    }
    window.firebaseReady = true;
    console.log("Bake & Grill Firebase connected:", config.projectId);
  } catch (e) {
    window.firebaseError = e;
    window.firebaseReady = false;
    console.error("Bake & Grill Firebase initialization failed:", e);
  }
})();

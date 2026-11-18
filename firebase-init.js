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
      // Keep the phone-authenticated customer session on this browser/device.
      window.auth = firebase.auth();
      window.customerAuthReady = window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => new Promise(resolve => {
          let done = false;
          const timer = setTimeout(() => { if (!done) { done = true; resolve(window.auth.currentUser || null); } }, 5000);
          const unsubscribe = window.auth.onAuthStateChanged(user => {
            if (!done) { done = true; clearTimeout(timer); unsubscribe(); resolve(user || null); }
          }, error => {
            console.warn("Customer auth state restore:", error);
            if (!done) { done = true; clearTimeout(timer); resolve(null); }
          });
        }))
        .catch(error => {
          console.warn("Local auth persistence unavailable:", error);
          return window.auth.currentUser || null;
        });
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

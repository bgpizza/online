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
    if (typeof firebase.auth === "function") window.auth = firebase.auth();
    window.firebaseReady = true;
    console.log("Bake & Grill Firebase connected:", config.projectId);
  } catch (e) {
    window.firebaseError = e;
    window.firebaseReady = false;
    console.error("Bake & Grill Firebase initialization failed:", e);
  }
})();

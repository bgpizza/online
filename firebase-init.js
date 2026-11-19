(function(){
  window.firebaseReady = false;
  window.firebaseError = null;
  const config = window.FIREBASE_CONFIG;
  try {
    if (!config || !config.apiKey || !config.projectId || !config.appId) throw new Error("Firebase Web App config is missing.");
    if (typeof firebase === "undefined") throw new Error("Firebase SDK did not load.");
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(config);
    // Optional until the matching reCAPTCHA Enterprise site key is configured in Firebase Console.
    // App Check must initialize before Firestore, Auth, Storage or Messaging is used.
    if (window.BG_APPCHECK_ENTERPRISE_SITE_KEY && typeof firebase.appCheck === "function") {
      const appCheck = firebase.appCheck();
      const EnterpriseProvider = firebase.appCheck.ReCaptchaEnterpriseProvider;
      if (typeof EnterpriseProvider !== "function") {
        throw new Error("Firebase App Check Enterprise provider did not load.");
      }
      appCheck.activate(new EnterpriseProvider(window.BG_APPCHECK_ENTERPRISE_SITE_KEY), true);
      window.bakeGrillAppCheckReady = true;
      console.info("Bake & Grill App Check (reCAPTCHA Enterprise) initialized.");

      // Safe diagnostics: request one App Check token, but never log or expose the token value.
      // This distinguishes successful client initialization from successful attestation.
      window.bakeGrillAppCheckDiagnostics = appCheck.getToken(false).then(result => {
        const expiresAt = result && Number.isFinite(Number(result.expireTimeMillis))
          ? new Date(Number(result.expireTimeMillis)).toISOString()
          : null;
        if (!result || typeof result.token !== "string" || !result.token.length) {
          throw new Error("App Check returned an empty token.");
        }
        const report = { ok: true, provider: "reCAPTCHA Enterprise", expiresAt };
        console.info("Bake & Grill App Check token check: SUCCESS", report);
        return report;
      }).catch(error => {
        const report = {
          ok: false,
          code: String(error && error.code || "app-check-token-error"),
          message: String(error && error.message || "Unable to obtain an App Check token").slice(0, 240)
        };
        console.error("Bake & Grill App Check token check: FAILED", report);
        return report;
      });
    } else {
      window.bakeGrillAppCheckReady = false;
      console.warn("Firebase App Check is not active yet: register the Web-type reCAPTCHA Enterprise key and set BG_APPCHECK_ENTERPRISE_SITE_KEY.");
    }
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

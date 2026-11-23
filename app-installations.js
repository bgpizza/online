(() => {
  const key = 'bg-customer-web-app-install-id';
  const standalone = () => navigator.standalone === true
    || ['standalone', 'fullscreen', 'minimal-ui'].some(mode => matchMedia('(display-mode: ' + mode + ')').matches);
  let id;
  let registration;
  const stamp = () => ({recordedAt:firebase.firestore.FieldValue.serverTimestamp()});
  function registerDevice() {
    if (registration) return registration;
    if (!id) {
      id = localStorage.getItem(key) || crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    const ref = window.db.collection('appInstallations').doc(id);
    const recorded = key + '-recorded';
    registration = (async () => {
      if (localStorage.getItem(recorded) !== id) {
        try { await ref.set(stamp()); }
        catch (error) {
          // An existing create-only record can be encountered after a lost acknowledgment.
          if (error.code !== 'permission-denied') throw error;
        }
        localStorage.setItem(recorded, id);
      }
      return ref;
    })().catch(error => {
      registration = undefined;
      throw error;
    });
    return registration;
  }
  async function forCheckout() {
    if (!standalone() || !window.auth?.currentUser?.phoneNumber) return null;
    const uid = window.auth.currentUser.uid;
    try {
      const app = await registerDevice();
      const link = app.collection('customers').doc(uid);
      await window.db.runTransaction(async transaction => {
        if (!(await transaction.get(link)).exists) transaction.set(link, stamp());
      });
      return id;
    } catch (error) {
      console.warn('Web app registration:', error.code || error.message);
      return null;
    }
  }
  const report = async () => {
    try { await registerDevice(); }
    catch (error) { console.warn('Install report:', error.code || error.message); }
  };
  window.addEventListener('appinstalled', report);
  if (standalone()) report();
  window.BGAppInstallation = {forCheckout};
})();

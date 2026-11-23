(() => {
  const panel = document.getElementById('masterPromotions');
  const couponForm = document.getElementById('masterCouponForm');
  const mediaForm = document.getElementById('masterMediaForm');
  const list = document.getElementById('masterCouponList');
  const output = document.getElementById('masterPromotionStatus');
  const codePattern = /^[A-Z0-9][A-Z0-9_-]{2,23}$/;
  const setting = window.db?.collection('settings').doc('storefront');
  const coupons = window.db?.collection('coupons');
  const allowedImages = ['image/jpeg', 'image/png', 'image/webp'];
  let unsubscribe = [];
  let editing = null;
  let media = {};
  let previewUrl;

  function refreshPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
    const file = mediaForm.image.files[0];
    const saved = media[mediaForm.slot.value];
    const preview = document.getElementById('masterMediaPreview');
    const src = file && allowedImages.includes(file.type) ? (previewUrl = URL.createObjectURL(file)) : saved?.url;
    preview.hidden = !src;
    if (src) preview.src = src;
    else preview.removeAttribute('src');
  }

  function selectSlot() {
    const slot = mediaForm.slot.value;
    const saved = media[slot];
    mediaForm.title.value = saved?.title || '';
    mediaForm.code.value = saved?.code || '';
    mediaForm.code.closest('label').hidden = slot !== 'coupon';
    mediaForm.image.value = '';
    refreshPreview();
  }

  function resetCoupon() {
    couponForm.reset();
    editing = null;
    couponForm.code.readOnly = false;
    document.getElementById('masterCouponSave').textContent = 'Create coupon';
  }

  window.auth?.onAuthStateChanged(user => {
    unsubscribe.forEach(stop => stop());
    unsubscribe = [];
    panel.hidden = true;
    list.replaceChildren();
    resetCoupon();
    if (!user || !setting || !coupons || !user.providerData.some(provider => provider.providerId === 'password')) return;
    unsubscribe.push(coupons.onSnapshot(snap => {
      panel.hidden = false;
      list.replaceChildren();
      for (const doc of snap.docs) {
        const data = doc.data();
        const row = document.createElement('li');
        const info = document.createElement('span');
        const value = data.type === 'percent' ? data.value + '%' : '₹' + data.value;
        info.textContent = doc.id + ' · ' + value + ' off · Min ₹' + data.minimum + (data.active ? ' · Active' : ' · Paused');
        const eligibility = [
          data.firstOrderOnly ? 'First order only' : '',
          data.maxRoadKm != null ? 'Under ' + data.maxRoadKm + ' km by road' : ''
        ].filter(Boolean);
        info.textContent += ' · ' + (eligibility.join(' + ') || 'All customers');
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = 'Edit';
        edit.addEventListener('click', () => {
          editing = doc.id;
          couponForm.code.value = doc.id;
          couponForm.code.readOnly = true;
          couponForm.kind.value = data.type;
          couponForm.amount.value = data.value;
          couponForm.minimum.value = data.minimum;
          couponForm.enabled.checked = data.active;
          couponForm.firstOrderOnly.checked = data.firstOrderOnly === true;
          couponForm.maxRoadKm.value = data.maxRoadKm ?? '';
          document.getElementById('masterCouponSave').textContent = 'Save coupon';
          couponForm.amount.focus();
        });
        row.append(info, edit);
        list.append(row);
      }
    }, error => { output.textContent = error.message; }));
    unsubscribe.push(setting.onSnapshot(snap => {
      media = snap.data() || {};
      selectSlot();
    }, error => { output.textContent = error.message; }));
  });

  document.getElementById('masterCouponGenerate').addEventListener('click', () => {
    resetCoupon();
    const random = crypto.getRandomValues(new Uint8Array(5));
    couponForm.code.value = 'BG-' + Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    couponForm.amount.focus();
  });
  document.getElementById('masterCouponNew').addEventListener('click', resetCoupon);
  couponForm.addEventListener('submit', async event => {
    event.preventDefault();
    const code = couponForm.code.value.trim().toUpperCase();
    const data = {
      type:couponForm.kind.value, value:Number(couponForm.amount.value),
      minimum:Number(couponForm.minimum.value), active:couponForm.enabled.checked,
      firstOrderOnly:couponForm.firstOrderOnly.checked,
      maxRoadKm:couponForm.maxRoadKm.value === '' ? null : Number(couponForm.maxRoadKm.value)
    };
    if (!codePattern.test(code) || data.value <= 0 || data.value > (data.type === 'percent' ? 100 : 100000)) {
      output.textContent = 'Enter a 3–24 character code and a valid discount.';
      return;
    }
    const save = event.submitter;
    const isEditing = editing;
    save.disabled = true;
    try {
      const ref = coupons.doc(code);
      await window.db.runTransaction(async transaction => {
        const existing = await transaction.get(ref);
        if (existing.exists !== Boolean(isEditing)) throw new Error('Coupon already exists. Select Edit to update it.');
        transaction.set(ref, data);
      });
      output.textContent = code + ' saved.';
      resetCoupon();
    } catch (error) {
      output.textContent = error.message;
    } finally {
      save.disabled = false;
    }
  });

  mediaForm.slot.addEventListener('change', selectSlot);
  mediaForm.image.addEventListener('change', refreshPreview);
  mediaForm.addEventListener('submit', async event => {
    event.preventDefault();
    const slot = mediaForm.slot.value;
    const button = event.submitter;
    const removing = button.value === 'remove';
    const title = mediaForm.title.value.trim();
    const code = slot === 'coupon' ? mediaForm.code.value.trim().toUpperCase() : '';
    const file = mediaForm.image.files[0];
    button.disabled = true;
    output.textContent = removing ? 'Removing image…' : 'Publishing image…';
    try {
      if (removing) {
        await setting.set({[slot]:firebase.firestore.FieldValue.delete()}, {merge:true});
      } else {
        if (!title) throw new Error('Enter a title for this image.');
        if (code && (!codePattern.test(code) || !(await coupons.doc(code).get()).data()?.active)) {
          throw new Error('Use an active Master coupon code.');
        }
        let url = media[slot]?.url;
        if (file) {
          if (!allowedImages.includes(file.type) || file.size >= 5 * 1024 * 1024) {
            throw new Error('Choose a JPG, PNG or WebP image under 5 MB.');
          }
          const uploaded = window.storage.ref('product-images/storefront-' + crypto.randomUUID());
          await uploaded.put(file, {contentType:file.type});
          url = await uploaded.getDownloadURL();
        }
        if (!url) throw new Error('Choose an image to publish.');
        await setting.set({[slot]:{url, title, code}}, {merge:true});
      }
      output.textContent = removing ? 'Image removed from the customer site.' : 'Image published on the customer site.';
    } catch (error) {
      output.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
})();

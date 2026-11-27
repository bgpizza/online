(() => {
  const panel = document.getElementById('masterPromotions');
  const couponForm = document.getElementById('masterCouponForm');
  const couponScope = data => data.orderScope ?? (data.maxRoadKm != null ? 'delivery' : 'both');
  const scopeLabel = {both:'Delivery & Takeaway', delivery:'Delivery only', takeaway:'Takeaway only'};
  function updateCouponDistance() {
    couponForm.maxRoadKm.disabled = couponForm.orderScope.value === 'takeaway';
  }
  couponForm.orderScope.addEventListener('change', updateCouponDistance);
  const mediaForm = document.getElementById('masterMediaForm');
  const deleteMedia = document.getElementById('masterDeleteMedia');
  const mediaLabels = {header: 'homepage header', offer: 'offer card', coupon: 'coupon card'};
  const list = document.getElementById('masterCouponList');
  const output = document.getElementById('masterPromotionStatus');
  const codePattern = /^[A-Z0-9-][A-Z0-9_-]{0,31}$/;
  const setting = window.db?.collection('settings').doc('storefront');
  const coupons = window.db?.collection('coupons');
  const allowedImages = ['image/jpeg', 'image/png', 'image/webp'];
  let unsubscribe = [];
  let stopCouponUsage;
  let couponUsage = new Map();
  let couponUsageStatus = "Loading…";
  const formatCount = new Intl.NumberFormat("en-IN");
  let editing = null;
  let media = {};
  let previewUrl;
  const indiaOffset = 330 * 60_000;
  const expiryFormat = new Intl.DateTimeFormat('en-IN', {
    timeZone:'Asia/Kolkata', dateStyle:'medium', timeStyle:'short'
  });
  const installCount = document.getElementById('appInstallCount');
  async function loadInstallCount() {
    if (panel.hidden) return;
    installCount.textContent = 'Loading…';
    try {
      const snapshot = await window.db.collection('appInstallations').get({source:'server'});
      installCount.textContent = snapshot.size.toLocaleString('en-IN') + ' recorded installs';
    } catch {
      installCount.textContent = 'Install count unavailable';
    }
  }
  document.getElementById('refreshAppInstalls').addEventListener('click', loadInstallCount);
  function renderCouponUsage() {
    list.querySelectorAll('[data-coupon-usage]').forEach(metric => {
      metric.textContent = couponUsageStatus || formatCount.format(couponUsage.get(metric.dataset.couponUsage)?.size ?? 0);
    });
  }

  function watchCouponUsage() {
    if (!panel.open || panel.hidden || stopCouponUsage) return;
    stopCouponUsage = window.db.collection('orders').where('couponCode', '>=', '')
      .onSnapshot({includeMetadataChanges:true}, snapshot => {
        if (snapshot.metadata.fromCache) return;
        couponUsage = new Map();
        for (const order of snapshot.docs) {
          const {couponCode, phone, customerId, status} = order.data();
          const customer = phone ? 'phone:' + phone : customerId && 'account:' + customerId;
          if (!couponCode || !customer || status === 'CANCELLED') continue;
          if (!couponUsage.has(couponCode)) couponUsage.set(couponCode, new Set());
          couponUsage.get(couponCode).add(customer);
        }
        couponUsageStatus = '';
        renderCouponUsage();
      }, () => {
        stopCouponUsage = undefined;
        couponUsageStatus = 'Unavailable';
        renderCouponUsage();
      });
  }

  panel.addEventListener('toggle', () => {
    if (panel.open) {
      loadInstallCount();
      watchCouponUsage();
    } else {
      stopCouponUsage?.();
      stopCouponUsage = undefined;
    }
  });

  function couponMetric(label, value) {
    const entry = document.createElement('div');
    const title = document.createElement('dt');
    const count = document.createElement('dd');
    title.textContent = label;
    count.textContent = value;
    entry.append(title, count);
    return entry;
  }

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
    deleteMedia.textContent = 'Delete ' + mediaLabels[slot];
    deleteMedia.hidden = !saved?.url;
    mediaForm.title.value = saved?.title || '';
    mediaForm.code.value = saved?.code || '';
    mediaForm.code.closest('label').hidden = slot !== 'coupon';
    mediaForm.image.value = '';
    refreshPreview();
  }

  function resetCoupon() {
    couponForm.reset();
    updateCouponDistance();
    editing = null;
    couponForm.code.readOnly = false;
    document.getElementById('masterCouponSave').textContent = 'Create coupon';
  }

  window.auth?.onAuthStateChanged(user => {
    unsubscribe.forEach(stop => stop());
    unsubscribe = [];
    stopCouponUsage?.();
    stopCouponUsage = undefined;
    couponUsage.clear();
    couponUsageStatus = 'Loading…';
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
        info.className = 'promotion-coupon-info';
        const heading = document.createElement('strong');
        heading.textContent = doc.id;
        const badge = document.createElement('span');
        badge.className = 'promotion-coupon-state';
        const updateState = () => {
          const state = data.expiresAt != null && Date.now() >= data.expiresAt ? 'Expired' : data.active ? 'Active' : 'Paused';
          badge.textContent = state;
          badge.dataset.state = state.toLowerCase();
        };
        updateState();
        badge.refreshCouponState = updateState;
        const pricing = document.createElement('small');
        pricing.textContent = value + ' off · Min ₹' + data.minimum + (data.maxDiscount != null ? ' · Max ₹' + data.maxDiscount : '');
        const recipients = new Set((data.recipientPhones || data.recipientPhone || '').split(',').filter(Boolean));
        const eligibility = [
          scopeLabel[couponScope(data)],
          data.firstOrderOnly ? 'First order only' : '',
          data.maxRoadKm != null ? 'Under ' + data.maxRoadKm + ' km by road' : '',
          recipients.size ? 'Selected customers only' : '',
          data.oncePerCustomer ? 'One use per customer' : data.maxUsesPerCustomer ? data.maxUsesPerCustomer + ' website uses per customer' : '',
          data.installedAppOnly ? 'Installed app only' : ''
        ].filter(Boolean);
        const terms = document.createElement('small');
        terms.textContent = eligibility.join(' · ') || 'All eligible customers';
        const validity = document.createElement('small');
        validity.textContent = data.expiresAt == null ? 'No expiry' : 'Expires ' + expiryFormat.format(data.expiresAt) + ' IST';
        info.append(heading, badge, pricing, terms, validity);
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = 'Edit';
        edit.hidden = data.maxUsesPerCustomer != null;
        edit.addEventListener('click', () => {
          editing = doc.id;
          couponForm.code.value = doc.id;
          couponForm.code.readOnly = true;
          couponForm.kind.value = data.type;
          couponForm.amount.value = data.value;
          couponForm.minimum.value = data.minimum;
          couponForm.enabled.checked = data.active;
          couponForm.firstOrderOnly.checked = data.firstOrderOnly === true;
          couponForm.orderScope.value = couponScope(data);
          couponForm.maxRoadKm.value = data.maxRoadKm ?? '';
          updateCouponDistance();
          couponForm.recipientPhones.value = (data.recipientPhones || data.recipientPhone || '').replaceAll(',', '\n');
          couponForm.oncePerCustomer.checked = data.oncePerCustomer === true;
          couponForm.installedAppOnly.checked = data.installedAppOnly === true;
          couponForm.expiry.value = data.expiresAt == null ? '' : new Date(data.expiresAt + indiaOffset).toISOString().slice(0,16);
          document.getElementById('masterCouponSave').textContent = 'Save coupon';
          couponForm.amount.focus();
        });
        const actions = document.createElement('div');
        actions.className = 'promo-actions';
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.textContent = 'Copy code';
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(doc.id);
            output.textContent = doc.id + ' copied.';
          } catch {
            output.textContent = 'Copy this code: ' + doc.id;
          }
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Delete coupon';
        remove.className = 'promotion-delete';
        remove.setAttribute('aria-label', 'Delete coupon ' + doc.id);
        remove.addEventListener('click', async () => {
          if (!window.confirm('Delete coupon ' + doc.id + '? Customers will no longer be able to apply it.')) return;
          remove.disabled = true;
          try {
            await window.db.runTransaction(async transaction => {
              const settings = (await transaction.get(setting)).data();
              transaction.delete(doc.ref);
              if (settings?.coupon?.code === doc.id) {
                transaction.update(setting, {coupon:firebase.firestore.FieldValue.delete()});
              }
            });
            if (editing === doc.id) resetCoupon();
            output.textContent = doc.id + ' deleted.';
          } catch (error) {
            output.textContent = error.message;
          } finally {
            remove.disabled = false;
          }
        });
        actions.append(edit, copy, remove);
        const metrics = document.createElement('dl');
        metrics.className = 'promotion-coupon-metrics';
        const assigned = couponMetric('Assigned customers', recipients.size ? formatCount.format(recipients.size) : 'Untracked');
        const used = couponMetric('Customers who used it', couponUsageStatus);
        used.lastElementChild.dataset.couponUsage = doc.id;
        metrics.append(assigned, used);
        row.append(info, metrics, actions);
        list.append(row);
      }
      renderCouponUsage();
      watchCouponUsage();
    }, error => { output.textContent = error.message; }));
    unsubscribe.push(setting.onSnapshot(snap => {
      media = snap.data() || {};
      selectSlot();
    }, error => { output.textContent = error.message; }));
  });

  window.setInterval(() => {
    if (panel.open && !panel.hidden) list.querySelectorAll('.promotion-coupon-state').forEach(badge => badge.refreshCouponState());
  }, 15000);

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
    const expiry = couponForm.expiry.value;
    const expiresAt = expiry ? Date.parse(expiry + ':00+05:30') : null;
    if (expiry && !Number.isSafeInteger(expiresAt)) {
      output.textContent = 'Choose a valid expiry date and time (IST).';
      return;
    }
    const phones = [...new Set(couponForm.recipientPhones.value.split(/[\s,]+/).filter(Boolean))];
    if (phones.length > 50 || phones.some(phone => !/^\d{10}$/.test(phone))) {
      output.textContent = 'Enter up to 50 valid 10-digit mobile numbers.';
      return;
    }
    const data = {
      type:couponForm.kind.value, value:Number(couponForm.amount.value),
      minimum:Number(couponForm.minimum.value), active:couponForm.enabled.checked,
      firstOrderOnly:couponForm.firstOrderOnly.checked,
      orderScope:couponForm.orderScope.value,
      maxRoadKm:couponForm.maxRoadKm.disabled || couponForm.maxRoadKm.value === '' ? null : Number(couponForm.maxRoadKm.value),
      recipientPhones:phones.length ? phones.join(',') : null,
      oncePerCustomer:couponForm.oncePerCustomer.checked,
      installedAppOnly:couponForm.installedAppOnly.checked, expiresAt
    };
    if (!codePattern.test(code) || data.value <= 0 || data.value > (data.type === 'percent' ? 100 : 100000)) {
      output.textContent = 'Enter a 1–32 character code and a valid discount.';
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
        if (data.recipientPhones) {
          const settings = (await transaction.get(setting)).data();
          if (settings?.coupon?.code === code) {
            transaction.update(setting, {coupon:firebase.firestore.FieldValue.delete()});
          }
        }
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
  deleteMedia.addEventListener('click', async () => {
    const slot = mediaForm.slot.value;
    const saved = media[slot];
    if (!saved?.url) return;
    const label = mediaLabels[slot];
    if (!window.confirm('Delete the ' + label + ' from the customer site?')) return;
    deleteMedia.disabled = true;
    output.textContent = 'Deleting ' + label + '…';
    try {
      await window.db.runTransaction(async transaction => {
        const current = (await transaction.get(setting)).data()?.[slot];
        if (!current) return;
        if (current.url !== saved.url || current.title !== saved.title || current.code !== saved.code) {
          throw new Error('This card changed. Review the latest version before deleting it.');
        }
        transaction.update(setting, {[slot]:firebase.firestore.FieldValue.delete()});
      });
      output.textContent = 'Deleted the ' + label + ' from the customer site.';
    } catch (error) {
      output.textContent = error.message;
    } finally {
      deleteMedia.disabled = false;
    }
  });
  mediaForm.addEventListener('submit', async event => {
    event.preventDefault();
    const slot = mediaForm.slot.value;
    const button = event.submitter;
    const title = mediaForm.title.value.trim();
    const code = slot === 'coupon' ? mediaForm.code.value.trim().toUpperCase() : '';
    const file = mediaForm.image.files[0];
    button.disabled = true;
    output.textContent = 'Publishing image…';
    try {
      if (!title) throw new Error('Enter a title for this image.');
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
      await window.db.runTransaction(async transaction => {
        if (code) {
          const coupon = codePattern.test(code) ? (await transaction.get(coupons.doc(code))).data() : null;
          if (!coupon?.active || coupon.recipientPhone || coupon.recipientPhones || (coupon.expiresAt != null && Date.now() >= coupon.expiresAt)) throw new Error('Use an active shareable coupon code for a public card.');
        }
        transaction.set(setting, {[slot]:{url, title, code}}, {merge:true});
      });
      output.textContent = 'Image published on the customer site.';
    } catch (error) {
      output.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
})();

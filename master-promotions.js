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
  const heroForm = document.getElementById('masterHeroForm');
  const heroSlot = heroForm.elements.heroSlot;
  const heroTitle = heroForm.elements.heroTitle;
  const heroImage = heroForm.elements.heroImage;
  const heroSave = heroForm.querySelector('button[type=submit]');
  const heroStatus = heroForm.querySelector('output');
  const heroEarlier = document.getElementById('masterHeroEarlier');
  const heroLater = document.getElementById('masterHeroLater');
  const defaultSlides = [
    {
      "id": "tandoori-chicken",
      "url": "hero-images/tandoori-chicken.webp",
      "title": "Tandoori Chicken Pizza"
    },
    {
      "id": "veggie-foursome",
      "url": "hero-images/veggie-foursome.webp",
      "title": "Veggie Foursome"
    },
    {
      "id": "chicken-paradise",
      "url": "hero-images/chicken-paradise.webp",
      "title": "Chicken Paradise Pizza"
    },
    {
      "id": "classic-paneer",
      "url": "hero-images/classic-paneer.webp",
      "title": "Classic Paneer"
    },
    {
      "id": "chicken-keema",
      "url": "hero-images/chicken-keema.webp",
      "title": "Chicken Keema Pizza"
    },
    {
      "id": "corn-capsicum",
      "url": "hero-images/corn-capsicum.webp",
      "title": "Corn Capsicum"
    }
  ];
  const maxSlides = 20;
  let savedSlides = [];
  let heroBusy = false;
  let heroReady = false;

  function slideList(data) {
    return Array.isArray(data?.heroSlides) && data.heroSlides.length ? data.heroSlides : defaultSlides;
  }

  function updateHeroButtons() {
    const index = savedSlides.findIndex(slide => slide.id === heroSlot.value);
    const disabled = heroBusy || !heroReady;
    heroSlot.disabled = heroSave.disabled = disabled;
    heroEarlier.disabled = disabled || index <= 0;
    heroLater.disabled = disabled || index < 0 || index >= savedSlides.length - 1;
  }

  function refreshHeroSelection() {
    updateHeroButtons();
    const selected = savedSlides.find(slide => slide.id === heroSlot.value);
    heroTitle.value = selected?.title || '';
    heroImage.value = '';
  }

  function renderHeroSlides() {
    const selected = heroSlot.value;
    heroSlot.replaceChildren(...savedSlides.map((slide, index) =>
      new Option((index + 1) + '. ' + slide.title, slide.id)));
    if (savedSlides.length < maxSlides) heroSlot.add(new Option('Add a new slide', '__new__'));
    if ([...heroSlot.options].some(option => option.value === selected)) heroSlot.value = selected;
    updateHeroButtons();
  }

  async function moveHeroSlide(offset) {
    if (heroBusy || !heroReady) return;
    const id = heroSlot.value;
    const index = savedSlides.findIndex(slide => slide.id === id);
    const neighbor = savedSlides[index + offset];
    if (index < 0 || !neighbor) return;

    heroBusy = true;
    updateHeroButtons();
    heroStatus.textContent = 'Saving slider order…';
    try {
      await window.db.runTransaction(async transaction => {
        const slides = slideList((await transaction.get(setting)).data());
        const currentIndex = slides.findIndex(slide => slide.id === id);
        const target = currentIndex + offset;
        if (currentIndex < 0 || slides[target]?.id !== neighbor.id) {
          throw new Error('The slider order changed. Review the current positions and try again.');
        }
        const reordered = [...slides];
        [reordered[currentIndex], reordered[target]] = [reordered[target], reordered[currentIndex]];
        transaction.set(setting, {heroSlides:reordered}, {merge:true});
      });
      heroStatus.textContent = 'Slider order saved.';
    } catch (error) {
      heroStatus.textContent = error.message;
    } finally {
      heroBusy = false;
      updateHeroButtons();
    }
  }

  heroEarlier.addEventListener('click', () => moveHeroSlide(-1));
  heroLater.addEventListener('click', () => moveHeroSlide(1));
  heroSlot.addEventListener('change', refreshHeroSelection);
  heroForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (heroBusy || !heroReady) return;
    const uid = window.auth.currentUser?.uid;
    const id = heroSlot.value === '__new__' ? crypto.randomUUID() : heroSlot.value;
    const previous = savedSlides.find(slide => slide.id === id);
    const title = heroTitle.value.trim();
    const file = heroImage.files[0];
    if (!title || !file || !allowedImages.includes(file.type) || file.size >= 5 * 1024 * 1024) {
      heroStatus.textContent = 'Enter a description and choose a JPG, PNG or WebP under 5 MB.';
      return;
    }

    heroBusy = true;
    updateHeroButtons();
    heroStatus.textContent = 'Publishing slide…';
    let published = false;
    try {
      if (!window.storage) throw new Error('Image upload is unavailable. Reload Master and try again.');
      const uploaded = window.storage.ref('product-images/hero-' + crypto.randomUUID());
      await uploaded.put(file, {contentType:file.type});
      const url = await uploaded.getDownloadURL();
      if (window.auth.currentUser?.uid !== uid) throw new Error('Sign in again before publishing.');
      await window.db.runTransaction(async transaction => {
        const slides = slideList((await transaction.get(setting)).data());
        const current = slides.find(slide => slide.id === id);
        if (previous && (!current || current.url !== previous.url || current.title !== previous.title)) {
          throw new Error('This slide changed. Re-select it and try again.');
        }
        if (!previous && slides.length >= maxSlides) throw new Error('The slider already has 20 slides.');
        const next = {id, title, url};
        const heroSlides = previous ? slides.map(slide => slide.id === id ? next : slide) : [...slides, next];
        transaction.set(setting, {heroSlides}, {merge:true});
      });
      published = true;
      heroImage.value = '';
      heroStatus.textContent = 'Slide published on the customer site.';
    } catch (error) {
      heroStatus.textContent = error.message;
    } finally {
      // Keep the uploaded image if a commit result is uncertain. A live slide may already point to it.
      heroBusy = false;
      renderHeroSlides();
      if (published && [...heroSlot.options].some(option => option.value === id)) {
        heroSlot.value = id;
        refreshHeroSelection();
      }
    }
  });

  const pushPanel = document.getElementById('masterCustomerPush');
  const pushList = document.getElementById('masterCustomerPushList');
  const pushStatus = document.getElementById('masterCustomerPushStatus');
  let stopPushList;
  function watchCustomerPush() {
    stopPushList?.();
    stopPushList = undefined;
    if (!pushPanel.open || !panel.open || panel.hidden) return;
    pushStatus.textContent = 'Loading notification status…';
    stopPushList = window.db.collection('customerPushDevices').where('enabled', '==', true)
      .onSnapshot(snapshot => {
        const customers = new Map();
        snapshot.forEach(doc => {
          const {phone, checkedAt} = doc.data();
          if (!phone) return;
          const row = customers.get(phone) || {phone, count:0, latest:0};
          row.count++;
          row.latest = Math.max(row.latest, checkedAt?.toMillis() || 0);
          customers.set(phone, row);
        });
        const rows = [...customers.values()].sort((a, b) => b.latest - a.latest);
        const format = new Intl.DateTimeFormat('en-IN', {timeZone:'Asia/Kolkata', dateStyle:'medium', timeStyle:'short'});
        pushList.replaceChildren(...rows.map(row => {
          const item = document.createElement('li');
          item.textContent = row.phone + ' · ' + row.count + (row.count === 1 ? ' device' : ' devices') +
            (row.latest ? ' · Last reported ' + format.format(row.latest) + ' IST' : '');
          return item;
        }));
        pushStatus.textContent = rows.length ? rows.length + (rows.length === 1 ? ' customer reported enabled' : ' customers reported enabled') : 'No customers have reported an enabled device yet.';
      }, () => {
        pushList.replaceChildren();
        pushStatus.textContent = 'Notification status could not load. Reopen this section to retry.';
      });
  }
  pushPanel.addEventListener('toggle', watchCustomerPush);
  panel.addEventListener('toggle', watchCustomerPush);

  const offerPanel = document.getElementById('masterOfferPush');
  const offerForm = offerPanel.querySelector('form');
  const offerOutput = offerForm.querySelector('output');
  const offerHistory = offerPanel.querySelector('ul');
  const offers = window.db?.collection('scheduledOfferPushes');
  let stopOfferHistory;
  function watchOfferHistory() {
    stopOfferHistory?.();
    stopOfferHistory = undefined;
    if (!panel.open || panel.hidden || !offerPanel.open || !offers) return;
    stopOfferHistory = offers.orderBy('sendAt', 'desc').limit(10).onSnapshot(snapshot => {
      offerHistory.replaceChildren(...snapshot.docs.map(doc => {
        const item = document.createElement('li');
        const data = doc.data();
        const time = new Date(data.sendAt).toLocaleString('en-IN', {timeZone:'Asia/Kolkata'});
        item.textContent = time + ' IST · ' + data.title + ' · ' + data.status +
          (Number.isInteger(data.sent) ? ' · ' + data.sent + ' accepted by push service' : '');
        return item;
      }));
    }, () => { offerOutput.textContent = 'Could not load scheduled offers.'; });
  }

  offerPanel.addEventListener('toggle', watchOfferHistory);
  panel.addEventListener('toggle', watchOfferHistory);
  offerForm.addEventListener('submit', async event => {
    event.preventDefault();
    const title = offerForm.elements.pushTitle.value.trim();
    const body = offerForm.elements.pushBody.value.trim();
    const sendAt = Date.parse(offerForm.elements.sendAt.value + ':00+05:30');
    if (!title || !body || !Number.isFinite(sendAt) || sendAt <= Date.now()) {
      offerOutput.textContent = 'Enter a title, a message and a future time in IST.';
      return;
    }
    event.submitter.disabled = true;
    try {
      await offers.add({title, body, sendAt, dueAt:sendAt, status:'scheduled'});
      offerForm.reset();
      offerOutput.textContent = 'Offer scheduled for customers who enabled offer alerts.';
    } catch {
      offerOutput.textContent = 'Could not schedule the offer. Check the recent list before trying again.';
    } finally {
      event.submitter.disabled = false;
    }
  });

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
    stopOfferHistory?.();
    stopOfferHistory = undefined;
    offerHistory.replaceChildren();
    offerForm.reset();
    offerOutput.textContent = '';
    stopPushList?.();
    stopPushList = undefined;
    pushList.replaceChildren();
    pushStatus.textContent = '';
    heroReady = false;
    savedSlides = [];
    heroSlot.replaceChildren();
    updateHeroButtons();
    heroImage.value = '';
    heroTitle.value = '';
    list.replaceChildren();
    resetCoupon();
    if (!user || !setting || !coupons || !user.providerData.some(provider => provider.providerId === 'password')) return;
    unsubscribe.push(coupons.onSnapshot(snap => {
      panel.hidden = false;
      if (!stopPushList) watchCustomerPush();
      if (!stopOfferHistory) watchOfferHistory();
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
      const firstLoad = !heroReady;
      savedSlides = slideList(media);
      heroReady = true;
      renderHeroSlides();
      if (firstLoad) {
        refreshHeroSelection();
        heroStatus.textContent = '';
      }
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

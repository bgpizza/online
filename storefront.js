(() => {
  const input = document.getElementById('promoCode');
  const apply = document.getElementById('promoApply');
  const remove = document.getElementById('promoRemove');
  const status = document.getElementById('promoStatus');
  let applied = null;
  let revision = 0;

  const refresh = () => renderCheckoutOrderSummary();
  const setCode = code => {
    revision++;
    applied = null;
    input.value = code;
    status.textContent = '';
    remove.hidden = !input.value.trim();
    refresh();
  };
  const callable = () => firebase.app().functions('us-central1').httpsCallable('couponCheckoutV1');
  window.BGCheckoutCoupon = {
    current(key) {
      if (applied && applied.key !== key) {
        applied = null;
        remove.hidden = !input.value.trim();
        status.textContent = 'Cart or delivery location changed. Apply your code again.';
      }
      return applied;
    },
    hasCode: () => Boolean(input.value.trim()),
    reset: () => setCode(''),
    submit: async (coupon, order) => (await callable()({
      code:coupon.code, order, expectedDiscount:coupon.discount, installationId:coupon.installationId ?? null
    })).data
  };
  input.addEventListener('input', () => setCode(input.value.toUpperCase()));
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      apply.click();
    }
  });
  remove.addEventListener('click', () => setCode(''));
  apply.addEventListener('click', async () => {
    const code = input.value.trim().toUpperCase();
    setCode(code);
    if (!/^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(code)) {
      status.textContent = 'Enter a valid coupon code.';
      return;
    }
    const {items, subtotal, location, orderType, key} = checkoutCouponCart();
    if (!items.length) {
      status.textContent = 'Add items to your cart first.';
      return;
    }
    const attempt = revision;
    apply.disabled = true;
    status.textContent = 'Checking coupon…';
    try {
      await window.customerAuthReady;
      if (!window.auth?.currentUser?.phoneNumber) {
        status.textContent = 'Verify your mobile number, then apply your coupon.';
        await window.BakeGrillCustomerAccount?.requestCheckoutOtp?.();
        return;
      }
      const installationId = await window.BGAppInstallation?.forCheckout() ?? null;
      const {data} = await callable()({code, items, subtotal, location, orderType, installationId});
      if (attempt !== revision) return;
      applied = {...data, key, installationId};
      remove.hidden = false;
      status.textContent = code + ' applied · You save ' + money(data.discount);
      refresh();
    } catch (error) {
      if (attempt === revision) status.textContent = ['functions/failed-precondition', 'functions/unavailable'].includes(error.code)
        ? error.message : 'Coupon verification is unavailable. Try again.';
    } finally {
      apply.disabled = false;
    }
  });

  const hero = document.getElementById('storefrontHero');
  const carousel = document.querySelector('.hero-carousel');
  const section = document.getElementById('storefrontOffers');
  const cards = document.getElementById('storefrontCards');
  function safeImage(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && parsed.hostname === 'firebasestorage.googleapis.com' ? parsed.href : '';
    } catch { return ''; }
  }
  function imageFor(media) {
    const image = new Image();
    image.alt = media.title || '';
    image.decoding = 'async';
    return image;
  }
  let heroVersion = 0;
  window.db?.collection('settings').doc('storefront').onSnapshot(snap => {
    const media = snap.data() || {};
    const version = ++heroVersion;
    const header = safeImage(media.header?.url);
    if (header) {
      const image = imageFor(media.header);
      image.onload = () => {
        if (version !== heroVersion) return;
        hero.replaceChildren(image);
        hero.hidden = false;
        carousel.hidden = true;
      };
      image.onerror = () => {
        if (version !== heroVersion) return;
        hero.hidden = true;
        carousel.hidden = false;
      };
      image.src = header;
    } else {
      hero.hidden = true;
      carousel.hidden = false;
    }
    cards.replaceChildren();
    for (const slot of ['offer', 'coupon']) {
      const item = media[slot];
      const url = safeImage(item?.url);
      if (!url) continue;
      const card = document.createElement('article');
      const image = imageFor(item);
      image.loading = 'lazy';
      image.src = url;
      card.append(image);
      const title = document.createElement('strong');
      title.textContent = item.title;
      card.append(title);
      if (slot === 'coupon' && /^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(item.code)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Use code ' + item.code;
        button.addEventListener('click', async () => {
          setCode(item.code);
          await openCheckout();
          if (document.getElementById('checkoutModal').getAttribute('aria-hidden') === 'false') input.focus();
        });
        card.append(button);
      }
      cards.append(card);
    }
    section.hidden = !cards.childElementCount;
  }, error => console.warn('Storefront settings:', error));
})();

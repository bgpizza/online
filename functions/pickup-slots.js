(function () {
  const minute = 60000;
  const day = 1440 * minute;
  const indiaOffset = 330 * minute;
  const interval = 15 * minute;
  const format = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true
  });

  const dateFormat = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric'
  });
  const midnightInIndia = time => Math.floor((time + indiaOffset) / day) * day - indiaOffset;
  const prepTime = 30 * minute;
  const deliveryOn = (settings, now) => settings.enabled !== false
    && !(Number.isSafeInteger(settings.deliveryResumeAt) && settings.deliveryResumeAt > now);

  function shopHours(settings) {
    const asMinutes = (value, fallback) => {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return fallback;
      const [hours, minutes] = value.split(':').map(Number);
      return hours * 60 + minutes;
    };
    return {
      opens: asMinutes(settings.shopOpensAt, 600),
      closes: asMinutes(settings.shopClosesAt, 1320)
    };
  }

  function shopIsOpen({opens, closes}, now) {
    const time = (now - midnightInIndia(now)) / minute;
    return closes < opens ? time >= opens || time < closes : time >= opens && time < closes;
  }

  function pickupSlots(settings, now) {
    const hours = shopHours(settings);
    const midnight = midnightInIndia(now);
    const {opens, closes} = hours;
    const firstMinute = Math.max(opens, 660);
    const lastMinute = Math.min(closes < opens ? 1440 : closes, 1320);
    const slots = [];
    const addDay = start => {
      const earliest = Math.max(now + prepTime, start + firstMinute * minute);
      const first = Math.ceil(earliest / interval) * interval;
      const last = start + lastMinute * minute;
      for (let slot = first; slot <= last; slot += interval) slots.push(slot);
    };
    addDay(midnight);
    if (!deliveryOn(settings, now) || !shopIsOpen(hours, now) || !slots.length) addDay(midnight + day);
    return slots;
  }

  function pickupAcceptanceDeadline(settings, now, slot) {
    if (deliveryOn(settings, now) && shopIsOpen(shopHours(settings), now) && midnightInIndia(slot) === midnightInIndia(now)) {
      return null;
    }
    return slot - prepTime + 2 * minute;
  }

  function pickupLabel(slot, includeDate = false) {
    if (!Number.isSafeInteger(slot) || slot <= 0 || slot > 8640000000000000) return '';
    return (includeDate ? dateFormat.format(slot) + ' · ' : '') + format.format(slot) + ' IST';
  }

  const api = {pickupSlots, pickupLabel, pickupAcceptanceDeadline};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.BGPickup = api;
})();

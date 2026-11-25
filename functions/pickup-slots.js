(function () {
  const minute = 60000;
  const day = 1440 * minute;
  const indiaOffset = 330 * minute;
  const interval = 15 * minute;
  const format = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true
  });

  function pickupSlots(settings, now) {
    const asMinutes = (value, fallback) => {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return fallback;
      const [hours, minutes] = value.split(':').map(Number);
      return hours * 60 + minutes;
    };
    const opens = asMinutes(settings.shopOpensAt, 600);
    const closes = asMinutes(settings.shopClosesAt, 1320);
    const midnight = Math.floor((now + indiaOffset) / day) * day - indiaOffset;
    const overnight = closes < opens;
    const startedYesterday = overnight && now < midnight + closes * minute;
    const opening = midnight + opens * minute - (startedYesterday ? day : 0);
    const closing = midnight + closes * minute + (overnight && !startedYesterday ? day : 0);
    if (now < opening || now >= closing) return [];
    const slots = [];
    const first = Math.ceil((now + 30 * minute) / interval) * interval;
    for (let slot = first; slot < closing; slot += interval) slots.push(slot);
    return slots;
  }

  function pickupLabel(slot) {
    return Number.isSafeInteger(slot) && slot > 0 && slot <= 8640000000000000
      ? format.format(slot) + ' IST'
      : '';
  }

  const api = {pickupSlots, pickupLabel};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.BGPickup = api;
})();

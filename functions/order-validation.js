const {HttpsError} = require('firebase-functions/v2/https');
const {MENU_ITEMS, MENU_ADDON_DEFAULT_PRICES} = require('./menu-data.js');

const defaultMenu = new Map(MENU_ITEMS.map(item => [item.id, item]));
const sizeAliases = {
  'Ekla Bite': /^(ekla(?:\s*bite)?|small|regular)$/i,
  'Bondhu Bite': /^(bondhu(?:\s*bite)?|medium)$/i,
  'Family Bite': /^(family(?:\s*bite)?|large)$/i
};
const sandwichOrBurger = new Set(['Burgers', 'Veg Sandwich', 'Chicken Sandwich']);

function matchingPrice(prices, size) {
  if (!Object.hasOwn(sizeAliases, size)) return undefined;
  const alias = sizeAliases[size];
  const key = Object.keys(prices || {}).find(name => alias.test(name.trim()));
  return prices?.[key];
}

function amount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

function quantity(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= 100;
}

function invalid(message) {
  throw new HttpsError('failed-precondition', message);
}

function addonPrice(addon, size) {
  return matchingPrice(addon.prices, size) ?? matchingPrice(addon.sizePrices, size)
    ?? MENU_ADDON_DEFAULT_PRICES[addon.id]?.[size] ?? addon.price;
}

function validatePrices(order, liveMenu) {
  if (!Array.isArray(order.items) || !order.items.length || order.items.length > 40) invalid('Order items are missing or invalid.');
  const getItem = id => {
    if (typeof id !== 'string' || !id || id.includes('/')) invalid('An order item has an invalid ID.');
    const base = defaultMenu.get(id);
    const live = liveMenu.get(id);
    if (!base && !live) invalid('A menu item no longer exists.');
    return {...base, ...live, id};
  };
  let total = 0;
  for (const line of order.items) {
    const item = getItem(line?.id);
    if (!quantity(line.qty) || item.category === 'Add-ons') invalid('An item has an invalid quantity or category.');
    const pizza = item.type !== 'single' && (item.type === 'pizza' || !!item.prices || !!defaultMenu.get(item.id)?.prices);
    const livePrice = Number(matchingPrice(item.prices, line.size));
    const base = pizza
      ? (livePrice > 0 && Number.isFinite(livePrice) ? livePrice : Number(matchingPrice(defaultMenu.get(item.id)?.prices, line.size)))
      : item.price;
    let unit = amount(base);
    if (!(unit > 0)) invalid('An item has no valid menu price. Ask the customer to place a fresh order.');
    const extras = line.extras ?? [];
    if (!Array.isArray(extras) || extras.length > 40) invalid('An item has invalid add-ons.');
    const seen = new Set();
    for (const extra of extras) {
      if (!quantity(extra?.qty) || seen.has(extra.id)) invalid('An add-on has an invalid quantity.');
      seen.add(extra.id);
      let price;
      if (extra.id === '__extra_cheese_20' && !pizza && sandwichOrBurger.has(item.category)) {
        price = Number(item.extraCheesePrice ?? 20);
      } else {
        const addon = getItem(extra.id);
        const name = String(addon.name || '').toLowerCase();
        const size = Object.keys(sizeAliases).find(label => name.includes(label.split(' ')[0].toLowerCase()));
        const burst = addon.id === 'A4' || /cheese burst/i.test(addon.name || '');
        if (!pizza || addon.category !== 'Add-ons' || (burst ? line.size === 'Ekla Bite' : size && size !== line.size)) {
          invalid('An add-on is unavailable for the selected item or size.');
        }
        price = addonPrice(addon, line.size);
      }
      const paise = amount(price);
      if (!Number.isFinite(paise) || paise < 0 || amount(extra.price) !== paise || extra.priceOnRequest) {
        invalid('An add-on price differs from the current menu. Ask the customer to place a fresh order.');
      }
      unit += paise * extra.qty;
    }
    if (amount(line.price) !== unit) invalid('An item price differs from the current menu. Ask the customer to place a fresh order.');
    total += unit * line.qty;
  }
  if (total !== amount(order.total)) invalid('Order total differs from the current menu. Ask the customer to place a fresh order.');
  return total / 100;
}

function deliveryRule(meters) {
  if (meters <= 1000) return {minOrder: 199, label: '0–1 KM'};
  if (meters <= 3000) return {minOrder: 286, label: '1.1–3 KM'};
  if (meters <= 5000) return {minOrder: 374, label: '3.1–5 KM'};
  if (meters <= 8000) return {minOrder: 497, label: '5.1–8 KM'};
  invalid('The verified route is outside the 8 km delivery area.');
}

async function verifyRoadRoute(location) {
  const {lat, lon} = location || {};
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
    invalid('This order has no valid delivery pin.');
  }
  const coordinates = `88.2189375,22.3908125;${lon},${lat}`;
  const providers = [
    ['https://router.project-osrm.org/route/v1/driving/', 'OSRM'],
    ['https://routing.openstreetmap.de/routed-car/route/v1/driving/', 'OpenStreetMap routing']
  ];
  for (const [url, source] of providers) {
    try {
      const response = await fetch(url + coordinates + '?overview=false&alternatives=false&steps=false', {signal: AbortSignal.timeout(3500)});
      if (!response.ok) continue;
      const data = await response.json();
      const route = data?.code === 'Ok' ? data.routes?.[0] : null;
      if (Number.isFinite(route?.distance) && route.distance > 0) {
        return {meters: route.distance, minutes: Number.isFinite(route.duration) ? route.duration / 60 : null, source};
      }
    } catch (_) {
      // Try the backup provider without logging the customer's coordinates.
    }
  }
  throw new HttpsError('unavailable', 'Road distance could not be verified. Try again.');
}

function validateStock(items, stock, liveMenu) {
  const fail = (id, message) => {
    const name = liveMenu.get(id)?.name || defaultMenu.get(id)?.name || 'Selected item';
    throw new HttpsError('failed-precondition', name + ': ' + message + '. Update your cart to continue.');
  };
  const totals = new Map();
  const variants = new Map();
  for (const line of items) {
    const id = line.id;
    const entry = stock.get(id);
    if (entry?.active === false) fail(id, 'out of stock');
    const total = (totals.get(id) || 0) + line.qty;
    totals.set(id, total);
    const limit = Number.isSafeInteger(entry?.posOrderLimit) ? entry.posOrderLimit
      : entry?.posOnlyOne === true ? 1 : Infinity;
    if (total > limit) fail(id, limit <= 0 ? 'out of stock' : 'not enough stock');
    const size = line.size || '';
    const sizeLimits = entry?.posVariantLimits;
    const variantLimit = sizeLimits && Object.hasOwn(sizeLimits, size) ? sizeLimits[size] : undefined;
    if (Number.isSafeInteger(variantLimit)) {
      const key = JSON.stringify([id, size]);
      const quantity = (variants.get(key) || 0) + line.qty;
      variants.set(key, quantity);
      if (quantity > variantLimit) fail(id, variantLimit <= 0 ? 'out of stock for this size' : 'not enough stock for this size');
    }
    for (const extra of line.extras || []) {
      if (stock.get(extra.id)?.active === false) fail(extra.id, 'out of stock');
    }
  }
}
module.exports = {validatePrices, validateStock, deliveryRule, verifyRoadRoute};

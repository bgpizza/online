(function (root) {
  const etaStatuses = ['ACCEPTED', 'PREPARING', 'READY', 'OUT FOR DELIVERY'];
  const toMillis = value => {
    const time = typeof value === 'number' ? value : value?.toMillis?.() ?? Date.parse(value);
    return Number.isFinite(time) && time > 0 ? time : 0;
  };
  const isActive = status => etaStatuses.includes(status);
  const timeFormat = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'
  });
  const formatTime = value => {
    const time = toMillis(value);
    return time ? timeFormat.format(time) + ' IST' : '';
  };
  function estimate(order) {
    if (!isActive(order.status) || (order.orderType === 'takeaway' && order.status === 'READY')) return 0;
    const revised = toMillis(order.eta?.at);
    if (revised) return revised;
    if (order.orderType === 'takeaway' && toMillis(order.pickupAt)) return toMillis(order.pickupAt);
    const dispatch = order.status === 'OUT FOR DELIVERY';
    const since = toMillis(dispatch ? order.outForDeliveryAt : order.acceptedAt);
    const minutes = Number(order.expectedDeliveryMinutes || (dispatch ? 20 : 0));
    return since && minutes > 0 ? since + minutes * 60000 : 0;
  }
  function milestoneTimes(order) {
    const times = {NEW: order.createdAt, ACCEPTED: order.acceptedAt, 'OUT FOR DELIVERY': order.outForDeliveryAt};
    for (const event of Array.isArray(order.statusHistory) ? order.statusHistory : []) {
      if (event?.status && toMillis(event.at)) times[event.status] = event.at;
    }
    return times;
  }
  function appendEstimate(container, order) {
    const at = estimate(order);
    if (!at) return;
    const card = root.document.createElement('div');
    card.className = 'customer-eta tracking-estimate';
    const title = root.document.createElement('strong');
    title.textContent = order.orderType === 'takeaway' ? 'Estimated pickup' : 'Estimated delivery';
    const time = root.document.createElement('span');
    time.textContent = formatTime(at);
    card.append(title, time);
    if (order.eta?.reason) {
      const reason = root.document.createElement('small');
      reason.textContent = 'Time updated · ' + order.eta.reason;
      card.append(reason);
    }
    container.append(card);
  }
  function appendSummary(container, order) {
    if (!Array.isArray(order.items) || !order.items.length) return;
    const details = root.document.createElement('details');
    details.className = 'tracking-summary';
    const heading = root.document.createElement('summary');
    heading.textContent = 'Order summary';
    const list = root.document.createElement('ul');
    for (const item of order.items) {
      const row = root.document.createElement('li');
      row.textContent = (item.qty || item.quantity || 1) + ' × ' + (item.name || item.itemName || 'Item')
        + (item.size ? ' · ' + item.size : '');
      list.append(row);
    }
    details.append(heading, list);
    if (Number.isFinite(order.total)) {
      const total = root.document.createElement('strong');
      total.textContent = 'Total · ' + new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(order.total);
      details.append(total);
    }
    container.append(details);
  }
  const api = {isActive, toMillis, formatTime, estimate, milestoneTimes, appendEstimate, appendSummary};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BGOrderTracking = api;
})(typeof window !== 'undefined' ? window : null);

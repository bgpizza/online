(() => {
  const byId = id => document.getElementById(id);
  const panel = byId('viewCustomers');
  if (!panel) return;
  const metrics = byId('masterCustomerMetrics');
  const demandRows = byId('masterDemandRows');
  const customerRows = byId('masterCustomerRows');
  const search = byId('masterInsightSearch');
  const filter = byId('masterInsightFilter');
  const status = byId('masterInsightStatus');
  const more = byId('masterInsightMore');
  const DAY = 86400000;
  const INDIA_OFFSET = 19800000;
  const excluded = new Set(['9874866964', '8240266267']);
  const currency = new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR', maximumFractionDigits:2});
  const dateLabel = new Intl.DateTimeFormat('en-IN', {timeZone:'UTC', day:'numeric', month:'short', year:'numeric'});
  const dayLabel = new Intl.DateTimeFormat('en-IN', {timeZone:'UTC', weekday:'short', day:'numeric', month:'short'});
  let limit = 30;

  const dayNumber = time => Math.floor((time + INDIA_OFFSET) / DAY);
  const dateFor = day => new Date(day * DAY);
  const phoneFor = order => String(order.phone || '').replace(/\D/g, '').slice(-10);

  function summarize(orders, today) {
    const customers = new Map();
    const daily = new Map();
    let firstDay = Infinity;
    let completed = 0;
    let revenue = 0;

    for (const order of orders) {
      const phone = phoneFor(order);
      if (order.status !== 'DELIVERED' || excluded.has(phone)) continue;
      const millis = order.createdAt?.toMillis?.() ?? new Date(order.createdAt || NaN).getTime();
      if (!Number.isFinite(millis) || millis <= 0) continue;
      const day = dayNumber(millis);
      if (day > today) continue;
      completed++;
      const total = Number.isFinite(Number(order.total)) ? Number(order.total) : 0;
      revenue += total;
      firstDay = Math.min(firstDay, day);
      daily.set(day, (daily.get(day) || 0) + 1);

      const id = phone.length === 10 ? phone : order.customerId;
      if (!id) continue;
      let row = customers.get(id);
      if (!row) {
        row = {lastTime:0, count:0, total:0, days:new Set(), items:new Map()};
        customers.set(id, row);
      }
      if (millis > row.lastTime) {
        row.lastTime = millis;
        row.name = order.name || 'Customer';
        row.phone = phone.length === 10 ? phone : '';
      }
      row.count++;
      row.total += total;
      row.days.add(day);
      for (const item of Array.isArray(order.items) ? order.items : []) {
        const name = typeof item?.name === 'string' ? item.name.trim() : '';
        if (name) row.items.set(name, (row.items.get(name) || 0) + (Number(item.qty) || 1));
      }
    }

    const rows = [...customers.values()].map(row => {
      const dates = [...row.days].sort((a, b) => a - b);
      const gaps = dates.slice(1).map((day, index) => day - dates[index]).sort((a, b) => a - b);
      const middle = Math.floor(gaps.length / 2);
      const gap = gaps.length >= 2 ? (gaps[middle] + gaps[Math.floor((gaps.length - 1) / 2)]) / 2 : null;
      const favourite = [...row.items].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
      const last = dates[dates.length - 1];
      return {...row, favourite, last, gap, due:gap === null ? null : last + Math.round(gap)};
    });
    return {rows, daily, firstDay, completed, revenue};
  }

  function forecast(day, today, summary) {
    const observations = [];
    for (let sample = day - 7; sample >= Math.max(today - 56, summary.firstDay); sample -= 7) {
      if (sample < today) observations.push(summary.daily.get(sample) || 0);
    }
    if (observations.length < 3) return ['Not enough history', '—', observations.length];
    const average = observations.reduce((total, count) => total + count, 0) / observations.length;
    const low = Math.min(...observations);
    const high = Math.max(...observations);
    return [Math.round(average), low === high ? String(low) : low + '–' + high, observations.length];
  }

  function tableRow(values) {
    const row = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      if (typeof value === 'object') cell.append(value);
      else cell.textContent = value;
      row.append(cell);
    }
    return row;
  }

  function metric(label, value) {
    const card = document.createElement('div');
    const title = document.createElement('small');
    const number = document.createElement('strong');
    title.textContent = label;
    number.textContent = value;
    card.append(title, number);
    return card;
  }

  window.clearCustomerInsights = () => {
    metrics.replaceChildren();
    demandRows.replaceChildren();
    customerRows.replaceChildren();
    search.value = '';
    filter.value = 'all';
    status.textContent = '';
    more.hidden = true;
    limit = 30;
  };

  window.renderCustomerInsights = () => {
    if (!panel.classList.contains('active-view')) return;
    if (typeof lastOrdersSnapshot === 'undefined' || !lastOrdersSnapshot) {
      status.textContent = 'Loading website order history…';
      return;
    }
    const today = dayNumber(Date.now());
    const summary = summarize(currentOrders, today);
    const repeat = summary.rows.filter(row => row.count > 1).length;
    const due = summary.rows.filter(row => row.due !== null && row.due <= today).length;
    metrics.replaceChildren(metric('Customers with completed orders', summary.rows.length),
      metric('Repeat customers', repeat), metric('Usually due to reorder', due),
      metric('Average completed order', summary.completed
        ? currency.format(summary.revenue / summary.completed) : '—'));
    demandRows.replaceChildren(...Array.from({length:7}, (_, index) => {
      const day = today + index + 1;
      return tableRow([dayLabel.format(dateFor(day)), ...forecast(day, today, summary)]);
    }));

    const needle = search.value.trim().toLowerCase();
    const rows = summary.rows.filter(row => {
      if (filter.value === 'repeat' && row.count < 2) return false;
      if (filter.value === 'due' && (row.due === null || row.due > today)) return false;
      if (filter.value === 'new' && row.count !== 1) return false;
      return !needle || row.name.toLowerCase().includes(needle) || row.phone.includes(needle);
    }).sort((a, b) => filter.value === 'due' ? a.due - b.due : b.lastTime - a.lastTime);
    customerRows.replaceChildren(...rows.slice(0, limit).map(row => {
      const identity = document.createElement('div');
      identity.textContent = row.name;
      if (row.phone) {
        const mobile = document.createElement('small');
        mobile.textContent = '+91 ' + row.phone;
        identity.append(mobile);
      }
      const typical = row.due === null ? 'Not enough history' :
        dateLabel.format(dateFor(row.due)) + ' · every ' + row.gap + ' days';
      return tableRow([identity, row.count, currency.format(row.total), row.favourite || '—',
        dateLabel.format(dateFor(row.last)), typical]);
    }));
    status.textContent = rows.length ? Math.min(rows.length, limit) + ' of ' + rows.length + ' customers' : 'No customers match this view.';
    more.hidden = rows.length <= limit;
  };

  for (const control of [search, filter]) {
    control.addEventListener(control === search ? 'input' : 'change', () => {
      limit = 30;
      window.renderCustomerInsights();
    });
  }
  more.addEventListener('click', () => {
    limit += 30;
    window.renderCustomerInsights();
  });
})();

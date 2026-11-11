// Sales KPIs: reads the "sales" data source through WallCast (the API key stays on the
// server), refreshes on a timer, keeps the last numbers when the network drops.
const $ = (id) => document.getElementById(id);
let timer = null;
let last = null;

const money = (value, currency, locale) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
const count = (value, locale) => new Intl.NumberFormat(locale).format(value);

function summarize(body) {
  const carts = Array.isArray(body?.carts) ? body.carts : [];
  const revenue = carts.reduce((sum, cart) => sum + (cart.discountedTotal ?? cart.total ?? 0), 0);
  const items = carts.reduce((sum, cart) => sum + (cart.totalQuantity ?? 0), 0);
  const products = new Map();
  for (const cart of carts) {
    for (const product of cart.products || []) {
      const entry = products.get(product.title) || { title: product.title, quantity: 0, revenue: 0 };
      entry.quantity += product.quantity || 0;
      entry.revenue += product.discountedTotal ?? product.total ?? 0;
      products.set(product.title, entry);
    }
  }
  const best = [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  return { revenue, orders: carts.length, average: carts.length ? revenue / carts.length : 0, items, best };
}

function render() {
  const config = wallcast.config;
  const locale = wallcast.screen.locale || 'en';
  document.documentElement.style.setProperty('--accent', config.accent || '#22d3ee');
  $('title').textContent = config.title || "Today's sales";
  $('branch').textContent = config.branch || '';
  if (!last) return;
  const { data, fetchedAt, stale } = last;
  const currency = config.currency || 'USD';
  $('revenue').textContent = money(data.revenue, currency, locale);
  $('orders').textContent = count(data.orders, locale);
  $('average').textContent = money(data.average, currency, locale);
  $('items').textContent = count(data.items, locale);
  $('orders-note').textContent = `${count(Math.round(data.items / Math.max(1, data.orders)), locale)} items per order`;
  const goal = Number(config.goal) || 0;
  const pct = goal ? Math.min(100, Math.round((data.revenue / goal) * 100)) : 0;
  $('goal-pct').textContent = `${pct}%`;
  $('goal-of').textContent = goal ? `of ${money(goal, currency, locale)}` : 'No goal set';
  const circumference = 2 * Math.PI * 50;
  $('ring').style.strokeDasharray = `${(circumference * pct) / 100} ${circumference}`;
  const max = Math.max(1, ...data.best.map((item) => item.revenue));
  $('best').innerHTML = '';
  for (const item of data.best) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="name"></span><span class="bar"><i></i></span><span class="value"></span>';
    li.querySelector('.name').textContent = item.title;
    li.querySelector('.bar i').style.width = `${(item.revenue / max) * 100}%`;
    li.querySelector('.value').textContent = money(item.revenue, currency, locale);
    $('best').append(li);
  }
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: wallcast.screen.timezone }).format(new Date(fetchedAt));
  $('updated').textContent = stale ? `Offline · numbers from ${time}` : `Updated ${time}`;
  $('dot').className = stale ? 'dot stale' : 'dot';
}

async function load() {
  try {
    const result = await wallcast.data.fetch('sales');
    if (result.status >= 400) throw new Error(`The store API answered ${result.status}`);
    last = { data: summarize(result.body), fetchedAt: result.fetchedAt, stale: result.stale };
    await wallcast.storage.set('last', last);
  } catch (error) {
    wallcast.log.warn('Sales data unavailable:', error.message);
    if (last) last = { ...last, stale: true };
  }
  render();
}

function schedule() {
  clearInterval(timer);
  const seconds = Math.max(15, Number(wallcast.config.refreshSeconds) || 60);
  timer = setInterval(() => { if (wallcast.playback.visible) load(); }, seconds * 1000);
}

wallcast.playback.deferReady();
wallcast.ready().then(async ({ screen }) => {
  document.documentElement.dir = ['he', 'ar'].includes(screen.locale) ? 'rtl' : 'ltr';
  // Lay out by the app's own box: in a zone it can be portrait on a landscape screen.
  const fit = () => document.body.classList.toggle('portrait', wallcast.frame.orientation === 'portrait');
  fit();
  window.addEventListener('resize', fit);
  // Show the last numbers at once (a screen restarting offline), then fresh ones.
  last = await wallcast.storage.get('last').catch(() => null);
  render();
  await load();
  wallcast.playback.ready();
  schedule();
});

wallcast.on('config', () => { render(); schedule(); load(); });
wallcast.on('visible', load);

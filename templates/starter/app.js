// window.wallcast is the WallCast SDK. Docs: https://wallcast.io/developers
const $ = (id) => document.getElementById(id);

function render(config) {
  $('title').textContent = config.title || '';
  $('message').textContent = config.message || '';
  document.documentElement.style.setProperty('--accent', config.accent || '#38bdf8');
  $('clock').hidden = !config.showClock;
}

function tick() {
  const { locale, timezone } = wallcast.screen;
  $('clock').textContent = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(new Date());
}

wallcast.ready().then(({ config, screen }) => {
  document.documentElement.dir = ['he', 'ar'].includes(screen.locale) ? 'rtl' : 'ltr';
  render(config);
  tick();
  setInterval(tick, 1000);
});

// Settings saved in the dashboard arrive here without a reload.
wallcast.on('config', render);

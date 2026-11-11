// Now serving: a message { ticket, counter } (sent with POST /v1/apps/now-serving/messages)
// shows the new ticket on every screen at once. The latest state is also kept in the
// app's shared storage ("queue"), so a screen that restarts shows it straight away.
const $ = (id) => document.getElementById(id);
let state = { current: null, history: [] };

const LABELS = {
  en: { recent: 'Recently called' },
  he: { recent: 'נקראו לאחרונה' },
  ar: { recent: 'تم استدعاؤهم مؤخرًا' },
};

function forThisScreen(call) {
  const counters = wallcast.config.counters || [];
  return !counters.length || counters.includes(Number(call.counter));
}

function chime() {
  if (!wallcast.config.chime) return;
  try {
    const audio = new AudioContext();
    [880, 1320].forEach((frequency, index) => {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, audio.currentTime + index * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + index * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + index * 0.18 + 0.5);
      tone.connect(gain).connect(audio.destination);
      tone.start(audio.currentTime + index * 0.18);
      tone.stop(audio.currentTime + index * 0.18 + 0.55);
    });
  } catch { /* no audio on this screen */ }
}

function render(animate) {
  const config = wallcast.config;
  const lang = (wallcast.screen.locale || 'en').slice(0, 2);
  document.documentElement.style.setProperty('--accent', config.accent || '#facc15');
  $('title').textContent = config.title || 'Now serving';
  $('recent-title').textContent = (LABELS[lang] || LABELS.en).recent;
  const current = state.current;
  $('ticket').textContent = current ? current.ticket : '—';
  $('ticket').classList.toggle('empty', !current);
  $('counter').textContent = current?.counter ? `${config.counterLabel || 'Counter'} ${current.counter}` : '';
  const limit = Number(config.history ?? 5);
  $('recent-wrap').hidden = limit === 0;
  $('recent').innerHTML = '';
  for (const call of state.history.slice(0, limit)) {
    const li = document.createElement('li');
    li.innerHTML = '<b></b><span></span>';
    li.querySelector('b').textContent = call.ticket;
    li.querySelector('span').textContent = call.counter ? `${config.counterLabel || 'Counter'} ${call.counter}` : '';
    $('recent').append(li);
  }
  if (animate) {
    $('ticket').classList.remove('flash');
    void $('ticket').offsetWidth;
    $('ticket').classList.add('flash');
  }
}

function apply(call, animate) {
  if (!call || !call.ticket || !forThisScreen(call)) return;
  if (state.current && state.current.ticket !== call.ticket) {
    state.history = [state.current, ...state.history.filter((item) => item.ticket !== call.ticket)].slice(0, 8);
  }
  state.current = { ticket: String(call.ticket).slice(0, 8), counter: call.counter ?? null, at: call.at || new Date().toISOString() };
  render(animate);
  if (animate) chime();
  wallcast.storage.set('queue', state).catch(() => {});
}

function tick() {
  $('clock').textContent = new Intl.DateTimeFormat(wallcast.screen.locale, { hour: '2-digit', minute: '2-digit', timeZone: wallcast.screen.timezone }).format(new Date());
}

wallcast.ready().then(async ({ screen }) => {
  document.documentElement.dir = ['he', 'ar'].includes(screen.locale) ? 'rtl' : 'ltr';
  document.body.classList.toggle('portrait', screen.orientation === 'portrait');
  // This screen's last state, then the queue the staff system saved for every screen.
  state = (await wallcast.storage.get('queue').catch(() => null)) || state;
  const shared = await wallcast.storage.shared.get('queue').catch(() => null);
  if (shared?.current && shared.current.ticket !== state.current?.ticket) {
    state = { current: shared.current, history: shared.history || state.history };
  }
  render(false);
  tick();
  setInterval(tick, 1000);
});

wallcast.on('message', (data) => {
  if (data && data.reset) {
    state = { current: null, history: [] };
    render(false);
    return;
  }
  apply(data, true);
});
wallcast.on('config', () => render(false));

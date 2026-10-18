// Curio frontend: passcode → endless, varied Shorts feed → topics & creators.
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};

const state = {
  queue: [],        // items rendered in the feed, in order
  activeIndex: -1,
  loading: false,
  caughtUp: false,
  muted: true,
  pendingSeen: new Set(),
  ratings: new Map(),
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && path !== '/api/login') { show('login'); throw new Error('locked'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
  return data;
}

function show(screen) {
  for (const id of ['login', 'feed-screen', 'menu']) $(`#${id}`).hidden = id !== screen && !(screen === 'menu' && id === 'feed-screen');
  if (screen === 'login') $('#passcode').focus();
}

// ---------- Login ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    await api('/api/login', { method: 'POST', body: { passcode: $('#passcode').value } });
    $('#passcode').value = '';
    startFeed();
  } catch (err) {
    $('#login-error').textContent = err.status === 401 ? 'Wrong passcode' : 'Could not reach Curio';
  }
});

// ---------- YouTube player (one, reused) ----------
let player, playerReady = false, wantId = null;
window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player('player', {
    host: 'https://www.youtube-nocookie.com',
    playerVars: { playsinline: 1, controls: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, fs: 0, disablekb: 1, mute: 1 },
    events: {
      onReady: () => { playerReady = true; if (wantId) play(wantId); },
      onStateChange: (e) => {
        const slide = state.queue[state.activeIndex]?.node;
        if (e.data === YT.PlayerState.PLAYING) { $('#player-wrap').classList.add('on'); slide?.classList.add('playing'); }
        if (e.data === YT.PlayerState.ENDED) { player.seekTo(0); player.playVideo(); } // loop like Reels
      },
    },
  });
};
function loadYouTubeApi() {
  if (document.querySelector('#yt-api')) return;
  document.head.append(el('script', { id: 'yt-api', src: 'https://www.youtube.com/iframe_api', async: true }));
}
function play(id) {
  wantId = id;
  if (!playerReady) return;
  state.muted ? player.mute() : player.unMute();
  player.loadVideoById(id);
}

// ---------- Feed ----------
const feed = $('#feed');
const observer = new IntersectionObserver((entries) => {
  for (const en of entries) if (en.isIntersecting) activate(Number(en.target.dataset.index));
}, { root: feed, threshold: 0.6 });

function slideFor(item, index) {
  const up = el('button', { className: 'rate up', textContent: '👍', ariaLabel: 'More of this' });
  const down = el('button', { className: 'rate down', textContent: '👎', ariaLabel: 'Less of this' });
  up.setAttribute('aria-pressed', 'false');
  down.setAttribute('aria-pressed', 'false');
  up.onclick = () => rate(item, 1, up, down);
  down.onclick = () => rate(item, -1, up, down);
  const tap = el('div', { className: 'tap' });
  tap.onclick = onTap;
  const node = el('article', { className: 'slide' },
    el('div', { className: 'thumb', style: `background-image:url(https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/hq720.jpg), url(https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/hqdefault.jpg)` }),
    tap,
    el('div', { className: 'shade' }),
    el('div', { className: 'meta' },
      el('span', { className: 'chip', textContent: item.topicName }),
      el('h2', { textContent: item.title }),
      el('div', { className: 'by', textContent: `${item.channelTitle} · ${ago(item.publishedAt)}` })),
    el('div', { className: 'rail' }, up, down));
  node.dataset.index = String(index);
  return node;
}

function endSlide() {
  const again = el('button', { className: 'ghost', textContent: 'Check again' });
  again.onclick = async () => { state.caughtUp = false; node.remove(); await loadMore(); };
  const node = el('article', { className: 'slide end', id: 'end-slide' },
    el('div', { className: 'big-emoji', textContent: '✨' }),
    el('h2', { textContent: "You're caught up" }),
    el('p', { className: 'muted', textContent: "That's everything new for now. Fresh videos arrive through the day." }),
    again);
  return node;
}

async function loadMore() {
  if (state.loading || state.caughtUp) return;
  state.loading = true;
  try {
    const last = state.queue[state.queue.length - 1];
    const qs = new URLSearchParams({
      limit: '8',
      exclude: state.queue.map((q) => q.id).join(','),
      lastTopic: last?.topicId ?? '',
      lastChannel: last?.channelId ?? '',
    });
    const { items, caughtUp } = await api(`/api/feed?${qs}`);
    for (const item of items) {
      const index = state.queue.length;
      const node = slideFor(item, index);
      state.queue.push({ ...item, node });
      feed.append(node);
      observer.observe(node);
    }
    if (caughtUp || !items.length) {
      state.caughtUp = true;
      if (!$('#end-slide')) feed.append(endSlide());
    }
  } finally {
    state.loading = false;
  }
}

function activate(index) {
  if (index === state.activeIndex) return;
  const prev = state.queue[state.activeIndex]?.node;
  prev?.classList.remove('playing');
  $('#player-wrap').classList.remove('on');
  state.activeIndex = index;
  const item = state.queue[index];
  if (!item) return;
  play(item.id);
  state.pendingSeen.add(item.id);
  if (state.queue.length - index <= 3) loadMore();
}

function onTap() {
  if (state.muted) {
    state.muted = false;
    $('#sound-hint').hidden = true;
    if (playerReady) player.unMute();
    return;
  }
  if (!playerReady) return;
  player.getPlayerState() === YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo();
}

async function rate(item, rating, up, down) {
  const current = state.ratings.get(item.id);
  if (current === rating) return;
  state.ratings.set(item.id, rating);
  up.setAttribute('aria-pressed', String(rating === 1));
  down.setAttribute('aria-pressed', String(rating === -1));
  api('/api/feedback', { method: 'POST', body: { videoId: item.id, channelId: item.channelId, topicId: item.topicId, rating } }).catch(() => {});
  if (rating === -1) setTimeout(() => down.closest('.slide')?.nextElementSibling?.scrollIntoView({ behavior: 'smooth' }), 250);
}

function flushSeen() {
  if (!state.pendingSeen.size) return;
  const ids = [...state.pendingSeen];
  state.pendingSeen.clear();
  const body = JSON.stringify({ ids });
  // sendBeacon survives the app being closed mid-swipe.
  if (!navigator.sendBeacon?.('/api/seen', new Blob([body], { type: 'application/json' }))) {
    fetch('/api/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  }
}
setInterval(flushSeen, 4000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { flushSeen(); if (playerReady) player.pauseVideo(); }
  else if (playerReady && state.activeIndex >= 0) player.playVideo();
});

function ago(ms) {
  const h = Math.round((Date.now() - ms) / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

async function startFeed() {
  show('feed-screen');
  $('#sound-hint').hidden = !state.muted;
  setTimeout(() => ($('#sound-hint').hidden = true), 5000);
  loadYouTubeApi();
  if (!state.queue.length && !state.caughtUp) await loadMore();
}

// ---------- Topics & creators ----------
const MODE_LABEL = { catchup: 'Catch up', learn: 'Learn', unwind: 'Unwind' };
let topicsCache = [];

$('#open-menu').onclick = async () => {
  if (playerReady) player.pauseVideo();
  show('menu');
  await renderTopics();
};
$('#close-menu').onclick = () => {
  show('feed-screen');
  if (playerReady && state.activeIndex >= 0) player.playVideo();
};
for (const tab of document.querySelectorAll('[role=tab]')) {
  tab.onclick = async () => {
    for (const t of document.querySelectorAll('[role=tab]')) t.setAttribute('aria-selected', String(t === tab));
    $('#tab-topics').hidden = tab.dataset.tab !== 'topics';
    $('#tab-creators').hidden = tab.dataset.tab !== 'creators';
    tab.dataset.tab === 'topics' ? renderTopics() : renderCreators();
  };
}

async function renderTopics() {
  topicsCache = await api('/api/topics');
  $('#topic-list').replaceChildren(...topicsCache.map((t) => {
    const toggle = el('input', { type: 'checkbox', className: 'toggle', checked: !!t.active, ariaLabel: `Show ${t.name}` });
    toggle.onchange = () => api(`/api/topics/${t.id}`, { method: 'PATCH', body: { active: toggle.checked } }).catch(() => (toggle.checked = !toggle.checked));
    return el('li', {}, el('div', { className: 'grow' }, el('div', { textContent: t.name }), el('div', { className: 'sub', textContent: MODE_LABEL[t.mode] })), toggle);
  }));
}

$('#add-topic').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/topics', { method: 'POST', body: { name: $('#topic-name').value, mode: $('#topic-mode').value } });
    $('#topic-name').value = '';
    await renderTopics();
  } catch (err) {
    alert(err.message);
  }
});

async function renderCreators() {
  const [creators, topics] = await Promise.all([api('/api/channels'), topicsCache.length ? topicsCache : api('/api/topics')]);
  const box = $('#creator-list');
  if (!creators.length) {
    box.replaceChildren(el('p', { className: 'muted', textContent: 'No creators yet. Curio finds them in the background; check back in an hour.' }));
    return;
  }
  const byTopic = new Map();
  for (const c of creators) (byTopic.get(c.topicId) ?? byTopic.set(c.topicId, []).get(c.topicId)).push(c);
  box.replaceChildren(...topics.filter((t) => byTopic.has(t.id)).flatMap((t) => [
    el('h3', { className: 'group-title', textContent: t.name }),
    el('ul', { className: 'list' }, ...byTopic.get(t.id).map((c) => {
      const remove = el('button', { className: 'remove', textContent: 'Remove', ariaLabel: `Remove ${c.title}` });
      const li = el('li', {},
        c.thumb ? el('img', { className: 'avatar', src: c.thumb, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }) : el('div', { className: 'avatar' }),
        el('div', { className: 'grow' },
          el('div', { className: 'truncate', textContent: c.title }),
          el('div', { className: 'sub truncate', textContent: c.reason || '' })),
        remove);
      remove.onclick = async () => {
        if (!confirm(`Stop showing ${c.title}?`)) return;
        await api(`/api/channels/${encodeURIComponent(c.id)}`, { method: 'DELETE' });
        li.remove();
      };
      return li;
    })),
  ]));
}

// ---------- Boot ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
api('/api/topics').then(startFeed).catch(() => {});

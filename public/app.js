// Curio frontend: accounts → onboarding → feed (videos + reads) · library · insights · profile.
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'aria' || k === 'data') for (const [a, av] of Object.entries(v)) n.setAttribute(`${k}-${a}`, av);
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
// Lucide icon from the /icons.svg sprite.
const icon = (name, cls = '') => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `ic ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `/icons.svg#${name}`);
  svg.append(use);
  return svg;
};
const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();

const LANGS = [['en', 'English'], ['hi', 'हिन्दी Hindi'], ['hinglish', 'Hinglish']];
const MODE_LABEL = { catchup: 'News', learn: 'Learn', unwind: 'Unwind' };
const SOURCE_LABEL = { youtube: 'YouTube', bsky: 'Bluesky', hn: 'Hacker News', rss: 'Article' };

const state = {
  me: null,
  queue: [], activeIndex: -1, loading: false, caughtUp: false, muted: true,
  ratings: new Map(), lists: { saved: new Set(), later: new Set() },
  watchStart: 0, pendingViews: new Map(),
  session: { items: 0, ms: 0, saved: 0, thoughts: 0, liked: 0 },
};

// ---------- Interests kept on this device ----------
// Topics and languages live in localStorage too, so if the session cookie is cleared
// the app quietly recreates a guest account with the same interests.
const INTERESTS_KEY = 'curio.interests';
function loadInterests() {
  try { return JSON.parse(localStorage.getItem(INTERESTS_KEY)) || {}; } catch { return {}; }
}
function saveInterests(patch) {
  try { localStorage.setItem(INTERESTS_KEY, JSON.stringify({ ...loadInterests(), ...patch })); } catch {}
}
function clearInterests() {
  try { localStorage.removeItem(INTERESTS_KEY); } catch {}
}
async function syncTopicsToDevice() {
  const topics = await api('/api/topics').catch(() => null);
  if (topics) saveInterests({ topicIds: topics.filter((t) => t.following).map((t) => t.id) });
}

// ---------- API ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { status: res.status });
  return data;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

function showOnly(id) {
  for (const s of ['install-gate', 'auth', 'onboarding', 'app', 'summary']) $(`#${s}`).hidden = s !== id;
}

// ---------- Install (PWA) ----------
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $$('.install-btn').forEach((b) => (b.hidden = false));
});
window.addEventListener('appinstalled', () => {
  $$('.install-btn').forEach((b) => (b.hidden = true));
  $('#gate-steps').textContent = 'Installed. Open Curio from your home screen.';
});
// Always offer it outside the installed app: iOS and in-app browsers never fire beforeinstallprompt.
const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (!installed) $$('.install-btn').forEach((b) => (b.hidden = false));
function installSteps() {
  const ua = navigator.userAgent;
  if (/Instagram|FBAN|FBAV|WhatsApp|Line\//i.test(ua)) return 'Open this page in Chrome (or Safari on iPhone) first: tap ⋮ or the share icon, then "Open in browser". Then tap Install again.';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'In Safari, tap the Share button, then "Add to Home Screen".';
  if (/Android/i.test(ua)) return 'In Chrome, tap ⋮ (top right), then "Install app" or "Add to Home screen".';
  return 'In Chrome or Edge, click the install icon at the right end of the address bar, or open the ⋮ menu and choose "Install Curio".';
}
$$('.install-btn').forEach((b) => (b.onclick = async () => {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    return;
  }
  $('#install-steps').textContent = installSteps();
  openSheet('#install-sheet');
}));

// ---------- Auth ----------
// Signing in is optional: people start as guests. 'claim' saves a guest account with a login.
let authMode = 'login';
function showAuth(mode = 'login') {
  stopPlayback();
  setAuthMode(mode);
  showOnly('auth');
}
function setAuthMode(mode) {
  authMode = mode;
  const naming = mode !== 'login';
  $('#auth-name').hidden = !naming;
  $('#auth-submit').textContent = { login: 'Sign in', signup: 'Create account', claim: 'Save my account' }[mode];
  $('#auth-switch').textContent = naming ? 'Already have an account? Sign in' : (state.me?.guest ? 'Save this account instead' : 'New here? Create an account');
  $('#auth-password').autocomplete = naming ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
}
$('#auth-switch').onclick = () => setAuthMode(authMode === 'login' ? (state.me?.guest ? 'claim' : 'signup') : 'login');
$('#auth-skip').onclick = () => boot();
$('#ob-signin').onclick = () => showAuth('login');
$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#auth-submit');
  btn.disabled = true;
  $('#auth-error').textContent = '';
  try {
    const body = { email: $('#auth-email').value, password: $('#auth-password').value };
    if (authMode !== 'login') Object.assign(body, { name: $('#auth-name').value, tzOffset: -new Date().getTimezoneOffset() });
    await api({ login: '/api/auth/login', signup: '/api/auth/signup', claim: '/api/me/claim' }[authMode], { method: 'POST', body });
    $('#auth-password').value = '';
    if (authMode === 'claim') toast('Account saved. Sign in with it on any device.');
    await boot();
  } catch (err) {
    $('#auth-error').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- Onboarding ----------
async function runOnboarding() {
  showOnly('onboarding');
  const topics = await api('/api/topics');
  const picked = new Set(topics.filter((t) => t.following).map((t) => t.id)); // tap to pick
  const langs = new Set(state.me.languages);
  const chip = (label, on, toggle) => {
    const b = el('button', { className: 'chip-toggle', textContent: label, aria: { pressed: String(on) } });
    b.onclick = () => b.setAttribute('aria-pressed', String(toggle()));
    return b;
  };
  const flip = (set, key) => (set.has(key) ? (set.delete(key), false) : (set.add(key), true));
  $('#ob-topic-chips').replaceChildren(...topics.map((t) => chip(t.name, picked.has(t.id), () => flip(picked, t.id))));
  $('#ob-lang-chips').replaceChildren(...LANGS.map(([code, label]) => chip(label, langs.has(code), () => flip(langs, code))));
  let step = 1;
  $('#ob-topics').hidden = false; $('#ob-langs').hidden = true; $('#ob-step').textContent = '1';
  $('#ob-next').textContent = 'Continue';
  $('#ob-next').onclick = async () => {
    $('#ob-error').textContent = '';
    try {
      if (step === 1) {
        if (!picked.size) throw new Error('Pick at least one topic');
        await api('/api/topics/follow', { method: 'PUT', body: { topicIds: [...picked] } });
        saveInterests({ topicIds: [...picked] });
        step = 2;
        $('#ob-topics').hidden = true; $('#ob-langs').hidden = false; $('#ob-step').textContent = '2';
        $('#ob-next').textContent = 'Start exploring';
      } else {
        if (!langs.size) throw new Error('Pick at least one language');
        await api('/api/me', { method: 'PATCH', body: { languages: [...langs], onboarded: true, tzOffset: -new Date().getTimezoneOffset() } });
        state.me.languages = [...langs];
        saveInterests({ languages: [...langs] });
        saveInterests({ languages: [...langs] });
        enterApp();
      }
    } catch (err) {
      $('#ob-error').textContent = err.message;
    }
  };
}

// ---------- Tabs ----------
function enterApp() {
  showOnly('app');
  switchView('feed');
  refreshInboxBadge();
  state.inboxTimer ??= setInterval(refreshInboxBadge, 60_000);
}
for (const b of $$('#tabbar button')) b.onclick = () => switchView(b.dataset.view);
function switchView(view) {
  for (const b of $$('#tabbar button')) {
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  for (const v of ['feed', 'library', 'insights', 'profile']) $(`#view-${v}`).hidden = v !== view;
  if (view === 'feed') startFeed(); else { flushViews(); stopPlayback(); }
  if (view === 'library') renderLibrary();
  if (view === 'insights') renderInsights();
  if (view === 'profile') renderProfile();
}

// ---------- YouTube player (one, reused) ----------
let player, playerReady = false, wantId = null;
window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player('player', {
    host: 'https://www.youtube-nocookie.com',
    playerVars: { playsinline: 1, controls: 0, rel: 0, iv_load_policy: 3, fs: 0, disablekb: 1, mute: 1 },
    events: {
      onReady: () => { playerReady = true; if (wantId) play(wantId); },
      onStateChange: (e) => {
        const slide = state.queue[state.activeIndex]?.node;
        if (e.data === YT.PlayerState.PLAYING) { $('#player-wrap').classList.add('on'); slide?.classList.add('playing'); }
        if (e.data === YT.PlayerState.ENDED) { slide?.classList.add('ended'); player.seekTo(0); player.playVideo(); } // offer the full video, keep looping like Reels
      },
    },
  });
};
function loadYouTubeApi() {
  if ($('#yt-api')) return;
  document.head.append(el('script', { id: 'yt-api', src: 'https://www.youtube.com/iframe_api', async: true }));
}
function play(id) {
  wantId = id;
  if (!playerReady) return;
  state.muted ? player.mute() : player.unMute();
  player.loadVideoById(id);
}
function stopPlayback() {
  wantId = null;
  if (sheetOpen()) closeSheets();
  if (playerReady) player.pauseVideo();
  $('#player-wrap').classList.remove('on');
}

// ---------- Feed ----------
const feed = $('#feed');
const observer = new IntersectionObserver((entries) => {
  for (const en of entries) if (en.isIntersecting) activate(Number(en.target.dataset.index));
}, { root: feed, threshold: 0.6 });

function snapshotOf(item) {
  return {
    kind: item.kind, title: item.title || item.text?.slice(0, 120) || '', url: item.url, source: item.source, topicName: item.topicName,
    text: item.text, vertical: item.vertical, image: item.kind === 'video' ? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg` : item.image,
  };
}

function actionRail(item) {
  const btn = (cls, name, label, onClick, pressed) => {
    const b = el('button', { className: `act ${cls}`, aria: { label, ...(pressed !== undefined ? { pressed: String(pressed) } : {}) } }, icon(name), el('small', { textContent: label }));
    b.onclick = (e) => { e.stopPropagation(); onClick(b); };
    return b;
  };
  const up = btn('up', 'heart', 'Like', () => rate(item, 1, up, down), false);
  const down = btn('down', 'thumbs-down', 'Less', () => rate(item, -1, up, down), false);
  const think = btn('think', 'message-circle', 'Thought', () => openThought(item));
  const share = btn('share', 'send', 'Share', () => shareItem(item));
  const save = btn('save', 'bookmark', 'Save', (b) => toggleList(item, 'saved', b), state.lists.saved.has(item.id));
  const later = btn('later', 'clock', 'Later', (b) => toggleList(item, 'later', b), state.lists.later.has(item.id));
  return el('div', { className: 'rail' }, up, down, think, share, save, later);
}

function videoSlide(item) {
  const tap = el('div', { className: 'tap' });
  tap.onclick = onTap;
  const id = encodeURIComponent(item.id);
  return el('article', { className: `slide video${item.vertical === false ? ' wide' : ''}` },
    el('div', { className: 'thumb', style: `background-image:url(https://i.ytimg.com/vi/${id}/hq720.jpg), url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)` }),
    tap,
    el('div', { className: 'shade' }),
    el('div', { className: 'meta' },
      el('div', { className: 'who', role: 'button', tabIndex: 0, onclick: () => openProfile(item.sourceId) },
        el('span', { className: 'ava', textContent: initial(item.source) }),
        el('strong', { className: 'truncate', textContent: item.source }),
        el('span', { className: 'chip', textContent: item.topicName })),
      el('h2', { textContent: item.title }),
      el('div', { className: 'by', textContent: `${item.vertical === false ? 'Video' : 'Short'} · ${ago(item.publishedAt)}` }),
      item.fullUrl && el('a', { className: 'full-btn', href: item.fullUrl, target: '_blank', rel: 'noopener' },
        item.hasFull || item.vertical === false ? 'View full video' : 'Watch on YouTube', icon('arrow-right', 'sm'))),
    actionRail(item));
}

function readSlide(item) {
  const card = el('div', { className: 'card' },
    el('div', { className: 'who', role: 'button', tabIndex: 0, onclick: (e) => { e.stopPropagation(); openProfile(item.sourceId); } },
      el('span', { className: 'ava', textContent: initial(item.source) }),
      el('div', { className: 'grow' },
        el('strong', { className: 'truncate', textContent: item.source }),
        el('div', { className: 'sub truncate', textContent: `${item.author && item.author !== item.source ? `${item.author} · ` : ''}${SOURCE_LABEL[item.sourceKind] || 'Read'} · ${ago(item.publishedAt)}` })),
      el('span', { className: 'chip', textContent: item.topicName })),
    item.image ? el('img', { className: 'hero', src: item.image, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', onerror() { this.remove(); } }) : null,
    item.title ? el('h2', { textContent: item.title }) : null,
    item.text ? el('div', { className: 'body', textContent: item.text }) : null,
    item.hook ? el('p', { className: 'hook', textContent: `Why read: ${item.hook}` }) : null,
    el('a', { className: 'open ghost', href: item.url, target: '_blank', rel: 'noopener' }, 'Read full', icon('external-link', 'sm')));
  return el('article', { className: 'slide read' }, card, actionRail(item));
}

function endSlide() {
  const again = el('button', { className: 'ghost', textContent: 'Check again' });
  const node = el('article', { className: 'slide end', id: 'end-slide' },
    el('div', { className: 'big-icon' }, icon('sparkles')),
    el('h2', { textContent: "You're all caught up" }),
    el('p', { className: 'muted', textContent: 'That’s everything new for now. Fresh videos and reads arrive through the day.' }),
    again);
  again.onclick = async () => { state.caughtUp = false; node.remove(); await loadMore(); };
  return node;
}

async function loadMore() {
  if (state.loading || state.caughtUp) return;
  state.loading = true;
  try {
    const last = state.queue[state.queue.length - 1];
    const qs = new URLSearchParams({ limit: '8', exclude: state.queue.map((q) => q.id).join(','), lastTopic: last?.topicId ?? '', lastSource: last?.sourceId ?? '' });
    const { items, caughtUp } = await api(`/api/feed?${qs}`);
    for (const item of items) {
      const index = state.queue.length;
      const node = item.kind === 'post' ? readSlide(item) : videoSlide(item);
      node.dataset.index = String(index);
      state.queue.push({ ...item, node });
      feed.append(node);
      observer.observe(node);
    }
    if (caughtUp || !items.length) {
      state.caughtUp = true;
      if (!$('#end-slide')) feed.append(endSlide());
    }
  } catch (err) {
    if (err.status !== 401) toast('Could not load the feed. Check your connection.');
  } finally {
    state.loading = false;
  }
}

function activate(index) {
  if (index === state.activeIndex) return;
  endWatch();
  state.queue[state.activeIndex]?.node.classList.remove('playing');
  $('#player-wrap').classList.remove('on');
  state.activeIndex = index;
  const item = state.queue[index];
  if (!item) return;
  state.watchStart = Date.now();
  state.session.items++;
  $('#player-wrap').classList.toggle('wide', item.vertical === false);
  if (item.kind === 'video') play(item.id);
  else if (playerReady) { wantId = null; player.pauseVideo(); }
  $('#mute-btn').hidden = item.kind !== 'video';
  $('#sound-hint').hidden = !(item.kind === 'video' && state.muted && !state.hintShown);
  if (item.kind === 'video' && state.muted && !state.hintShown) setTimeout(() => { state.hintShown = true; $('#sound-hint').hidden = true; }, 4000);
  if (state.queue.length - index <= 3) loadMore();
}

// Time on the current item becomes a "view" (which also marks it seen).
function endWatch() {
  const item = state.queue[state.activeIndex];
  if (!item || !state.watchStart) return;
  const ms = Date.now() - state.watchStart;
  state.watchStart = 0;
  state.session.ms += ms;
  const prev = state.pendingViews.get(item.id);
  state.pendingViews.set(item.id, { itemId: item.id, topicId: item.topicId, kind: item.kind, ms: (prev?.ms ?? 0) + ms });
}
function flushViews() {
  if (state.activeIndex >= 0 && state.watchStart) { endWatch(); state.watchStart = Date.now(); }
  if (!state.pendingViews.size) return;
  const body = JSON.stringify({ views: [...state.pendingViews.values()] });
  state.pendingViews.clear();
  if (!navigator.sendBeacon?.('/api/views', new Blob([body], { type: 'application/json' }))) {
    fetch('/api/views', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  }
}
setInterval(() => { if (!$('#app').hidden && !$('#view-feed').hidden) flushViews(); }, 5000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { flushViews(); if (playerReady) player.pauseVideo(); }
  else if (state.watchStart === 0 && state.activeIndex >= 0 && !$('#view-feed').hidden && !$('#app').hidden) {
    state.watchStart = Date.now();
    if (playerReady && state.queue[state.activeIndex]?.kind === 'video' && !sheetOpen()) player.playVideo();
  }
});

function setMuted(m) {
  state.muted = m;
  $('#sound-hint').hidden = true;
  if (playerReady) m ? player.mute() : player.unMute();
  $('#mute-btn use').setAttribute('href', `/icons.svg#${m ? 'volume-x' : 'volume-2'}`);
  $('#mute-btn').setAttribute('aria-label', m ? 'Turn sound on' : 'Mute');
}
$('#mute-btn').onclick = () => setMuted(!state.muted);

function onTap() {
  if (state.muted) return setMuted(false);
  if (!playerReady) return;
  player.getPlayerState() === YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo();
}

async function startFeed() {
  loadYouTubeApi();
  if (!state.queue.length && !state.caughtUp) {
    await loadMore();
  } else if (state.activeIndex >= 0) {
    state.watchStart = Date.now();
    if (state.queue[state.activeIndex]?.kind === 'video') play(state.queue[state.activeIndex].id);
  }
}

// ---------- Actions ----------
async function rate(item, rating, up, down) {
  if (state.ratings.get(item.id) === rating) return;
  if (rating === 1) state.session.liked++;
  state.ratings.set(item.id, rating);
  up.setAttribute('aria-pressed', String(rating === 1));
  down.setAttribute('aria-pressed', String(rating === -1));
  api('/api/feedback', { method: 'POST', body: { itemId: item.id, sourceId: item.sourceId, topicId: item.topicId, rating } }).catch(() => {});
  if (rating === -1) {
    toast('Got it, less like this');
    setTimeout(() => down.closest('.slide')?.nextElementSibling?.scrollIntoView({ behavior: 'smooth' }), 300);
  }
}

async function toggleList(item, list, btn) {
  const on = !state.lists[list].has(item.id);
  try {
    if (on) await api(`/api/library/${list}`, { method: 'POST', body: { itemId: item.id, item: snapshotOf(item) } });
    else await api(`/api/library/${list}?itemId=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    on ? state.lists[list].add(item.id) : state.lists[list].delete(item.id);
    btn.setAttribute('aria-pressed', String(on));
    if (list === 'saved' && on) state.session.saved++;
    toast(on ? (list === 'saved' ? 'Saved to your library' : 'Added to Later') : 'Removed');
  } catch (err) {
    toast(err.message);
  }
}

async function shareItem(item) {
  const title = item.title || item.text?.slice(0, 100) || 'From Curio';
  if (navigator.share) {
    try { await navigator.share({ title, text: title, url: item.url }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  const msg = encodeURIComponent(`${title} ${item.url}`);
  $('#share-context').textContent = title;
  $('#share-wa').href = `https://wa.me/?text=${msg}`;
  $('#share-tg').href = `https://t.me/share/url?url=${encodeURIComponent(item.url)}&text=${encodeURIComponent(title)}`;
  $('#share-x').href = `https://x.com/intent/post?text=${msg}`;
  $('#share-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(item.url); toast('Link copied'); } catch { toast(item.url); }
    closeSheets();
  };
  openSheet('#share-sheet');
}

// ---------- Sent to you (Instagram DMs) ----------
// Meta forwards every reel or post someone sends you on Instagram; this shows them full screen with who sent it.
async function refreshInboxBadge() {
  const { unread } = await api('/api/inbox?count').catch(() => ({ unread: 0 }));
  $('#inbox-badge').hidden = !unread;
  $('#inbox-badge').textContent = unread > 9 ? '9+' : String(unread);
}
const inboxSeen = new IntersectionObserver((entries) => {
  for (const en of entries) {
    const v = en.target.querySelector('video');
    if (en.isIntersecting) {
      v?.play().catch(() => {});
      if (en.target.dataset.seen === '0') {
        en.target.dataset.seen = '1';
        api('/api/inbox/seen', { method: 'POST', body: { ids: [en.target.dataset.id] } }).then(refreshInboxBadge).catch(() => {});
      }
    } else v?.pause();
  }
}, { threshold: 0.6 });

function dmMedia(it) {
  const embed = () => (it.embed ? el('iframe', { src: it.embed, title: it.title || 'Instagram reel', allow: 'autoplay; encrypted-media', loading: 'lazy' }) : fallback());
  const fallback = () => el('div', { className: 'fallback' },
    el('p', { className: 'muted', textContent: 'This one can only be opened on Instagram.' }),
    it.link ? el('a', { className: 'primary with-icon', href: it.link, target: '_blank', rel: 'noopener' }, icon('instagram', 'sm'), 'Open in Instagram') : null);
  if (!it.mediaUrl) return embed();
  // Instagram's own CDN links expire after a few days; fall back to the official embed.
  if (it.kind === 'post') return el('img', { className: 'media', src: it.mediaUrl, alt: it.title || '', referrerPolicy: 'no-referrer', onerror() { this.replaceWith(embed()); } });
  const v = el('video', { src: it.mediaUrl, loop: true, muted: true, playsInline: true, preload: 'metadata', onerror() { this.replaceWith(embed()); } });
  v.onclick = () => { v.muted = !v.muted; toast(v.muted ? 'Muted' : 'Sound on'); };
  return v;
}

function dmSlide(it) {
  const who = it.sender.username ? `@${it.sender.username}` : 'Someone on Instagram';
  const pic = it.sender.pic
    ? el('img', { src: it.sender.pic, alt: '', referrerPolicy: 'no-referrer', onerror() { this.replaceWith(el('span', { className: 'ava', textContent: initial(who.replace('@', '')) })); } })
    : el('span', { className: 'ava', textContent: initial(it.sender.name || it.sender.username || '?') });
  const open = el('button', { className: 'act', aria: { label: 'Open in Instagram' } }, icon('instagram'), el('small', { textContent: 'Instagram' }));
  open.onclick = () => it.link && window.open(it.link, '_blank', 'noopener');
  const share = el('button', { className: 'act', aria: { label: 'Share' } }, icon('send'), el('small', { textContent: 'Share' }));
  share.onclick = () => shareItem({ title: it.title || `Reel from ${who}`, url: it.link || it.mediaUrl });
  const node = el('article', { className: 'dm', data: { id: it.id, seen: it.seen ? '1' : '0' } },
    dmMedia(it),
    el('div', { className: 'sent-by' }, pic,
      el('div', { className: 'grow' },
        el('strong', { className: 'truncate', textContent: `Sent by ${it.sender.name || who}` }),
        el('span', { className: 'sub truncate', textContent: `${it.sender.name ? `${who} · ` : ''}${it.kind === 'reel' ? 'Reel' : 'Post'} · ${ago(it.at)}` }))),
    it.text || it.title ? el('p', { className: 'note', textContent: it.text || it.title }) : null,
    it.link ? el('div', { className: 'rail' }, open, share) : null);
  inboxSeen.observe(node);
  return node;
}

async function openInbox() {
  stopPlayback();
  $('#inbox').hidden = false;
  const box = $('#inbox-feed');
  box.replaceChildren(el('div', { className: 'empty', textContent: 'Loading…' }));
  try {
    const [items, ig] = await Promise.all([api('/api/inbox'), api('/api/ig')]);
    if (items.length) return box.replaceChildren(...items.map(dmSlide));
    box.replaceChildren(el('div', { className: 'empty' }, el('div', { className: 'big-icon' }, icon('send')),
      el('h2', { textContent: ig.connected ? 'Nothing yet' : 'Connect Instagram' }),
      el('p', { textContent: ig.connected
        ? `Reels and posts people send @${ig.username} on Instagram will show up here, with who sent them.`
        : 'Reels and posts people send you on Instagram can land here automatically. Set it up in the You tab.' })));
  } catch (err) { box.replaceChildren(el('div', { className: 'empty', textContent: err.message })); }
}
$('#inbox-btn').onclick = openInbox;
$('#inbox-back').onclick = () => {
  for (const v of $$('#inbox video')) v.pause();
  $('#inbox').hidden = true;
  switchView('feed');
};

async function renderInstagram() {
  const box = $('#ig-box');
  const ig = await api('/api/ig').catch(() => null);
  if (!ig) return box.replaceChildren();
  if (ig.connected) {
    const off = el('button', { className: 'small-btn', textContent: 'Disconnect' });
    off.onclick = async () => { await api('/api/ig', { method: 'DELETE' }); renderInstagram(); };
    return box.replaceChildren(el('ul', { className: 'list' }, el('li', {},
      el('span', { className: 'ava', textContent: initial(ig.username) }),
      el('div', { className: 'grow' }, el('div', { textContent: `@${ig.username}` }), el('div', { className: 'sub', textContent: 'Reels sent to you here appear under the paper-plane icon' })),
      off)));
  }
  const input = el('input', { type: 'password', placeholder: 'Paste Instagram access token', autocomplete: 'off', aria: { label: 'Instagram access token' } });
  const go = el('button', { className: 'primary', textContent: 'Connect' });
  const err = el('p', { className: 'error', role: 'alert' });
  go.onclick = async () => {
    err.textContent = '';
    try { const r = await api('/api/ig', { method: 'POST', body: { token: input.value } }); toast(`Connected @${r.username}`); renderInstagram(); }
    catch (e) { err.textContent = e.message; }
  };
  box.replaceChildren(
    el('p', { className: 'muted small', textContent: 'Get reels people send you on Instagram here automatically, with who sent them. Needs an Instagram professional (Creator) account.' }),
    el('ol', { className: 'ig-steps' },
      el('li', { textContent: 'In the Meta developer app, open Instagram → API setup with Instagram login.' }),
      el('li', {}, 'Webhook callback URL: ', el('code', { textContent: ig.webhook }), ', then subscribe to messages.'),
      el('li', { textContent: 'Generate an access token for your account and paste it below.' })),
    el('form', { className: 'row', onsubmit(e) { e.preventDefault(); go.click(); } }, input, go), err);
}

// ---------- Sheets ----------
function sheetOpen() { return $$('.sheet').some((s) => !s.hidden); }
function openSheet(sel) {
  if (playerReady) player.pauseVideo();
  $('#scrim').hidden = false;
  $(sel).hidden = false;
  $(sel).querySelector('textarea, button, a')?.focus();
}
function closeSheets() {
  stopListening();
  $$('.sheet').forEach((s) => (s.hidden = true));
  $('#scrim').hidden = true;
  $('#viewer-body').replaceChildren();
  if (!$('#app').hidden && !$('#view-feed').hidden && state.queue[state.activeIndex]?.kind === 'video' && playerReady) player.playVideo();
}
$('#scrim').onclick = closeSheets;
$$('.close-sheet').forEach((b) => (b.onclick = closeSheets));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen()) closeSheets(); });

// ---------- Thoughts (type or speak) ----------
let thoughtItem = null;
function openThought(item = null) {
  thoughtItem = item;
  $('#thought-text').value = '';
  $('#thought-context').textContent = item ? `On: ${item.title || item.text?.slice(0, 80) || item.source}` : 'A thought of your own';
  $('#mic-status').textContent = '';
  openSheet('#thought-sheet');
}
$('#new-thought').onclick = () => openThought(null);
$('#thought-save').onclick = async () => {
  const text = $('#thought-text').value.trim();
  if (!text) { $('#mic-status').textContent = 'Write or say something first.'; return; }
  try {
    await api('/api/notes', { method: 'POST', body: { text, itemId: thoughtItem?.id, item: thoughtItem ? { ...snapshotOf(thoughtItem), sourceId: thoughtItem.sourceId, topicId: thoughtItem.topicId } : undefined } });
    state.session.thoughts++;
    closeSheets();
    toast('Saved. Curio will tune your feed to it');
    if (!$('#view-library').hidden) renderLibrary();
  } catch (err) {
    $('#mic-status').textContent = err.message;
  }
};

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null, speakLang = 'en-IN';
if (!Recognition) $('#voice-controls').hidden = true;
for (const b of $$('[data-lang]')) b.onclick = () => {
  speakLang = b.dataset.lang;
  $$('[data-lang]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  if (recog) { stopListening(); startListening(); }
};
$('#mic').onclick = () => (recog ? stopListening() : startListening());
function startListening() {
  if (!Recognition) return;
  recog = new Recognition();
  recog.lang = speakLang;
  recog.continuous = true;
  recog.interimResults = true;
  const base = $('#thought-text').value;
  let finalText = '';
  recog.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    $('#thought-text').value = `${base}${base && !base.endsWith(' ') ? ' ' : ''}${finalText}${interim}`;
  };
  recog.onerror = (e) => {
    stopListening();
    $('#mic-status').textContent = e.error === 'not-allowed' ? 'Microphone permission was denied. You can still type.' : 'Didn’t catch that. Try again or type.';
  };
  recog.onend = () => { if (recog) stopListening(); };
  try {
    recog.start();
    $('#mic').setAttribute('aria-pressed', 'true');
    $('#mic-status').textContent = speakLang === 'hi-IN' ? 'सुन रहे हैं… बोलिए' : 'Listening… speak now';
  } catch { stopListening(); }
}
function stopListening() {
  const r = recog;
  recog = null;
  try { r?.stop(); } catch { /* already stopped */ }
  $('#mic').setAttribute('aria-pressed', 'false');
  const s = $('#mic-status').textContent;
  if (s.startsWith('Listening') || s.startsWith('सुन')) $('#mic-status').textContent = '';
}

// ---------- Done for now ----------
$('#done-btn').onclick = () => {
  flushViews();
  stopPlayback();
  const s = state.session;
  const stat = (v, l) => el('div', { className: 'tile' }, el('div', { className: 'value', textContent: String(v) }), el('div', { className: 'label', textContent: l }));
  $('#summary-stats').replaceChildren(
    stat(fmtMin(s.ms / 60000), 'minutes'), stat(s.items, 'things seen'),
    stat(s.saved, 'saved'), stat(s.thoughts, 'thoughts'));
  showOnly('summary');
};
$('#summary-continue').onclick = () => { showOnly('app'); switchView('feed'); };
$('#summary-close').onclick = () => {
  state.session = { items: 0, ms: 0, saved: 0, thoughts: 0, liked: 0 };
  showOnly('app');
  switchView('library');
  toast('See you later');
};

// ---------- Library ----------
let libTab = 'saved';
for (const b of $$('[data-lib]')) b.onclick = () => {
  libTab = b.dataset.lib;
  $$('[data-lib]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  renderLibrary();
};
async function renderLibrary() {
  const box = $('#library-list');
  let lib;
  try { lib = await api('/api/library'); } catch { return; }
  state.lists.saved = new Set(lib.saved.map((s) => s.itemId));
  state.lists.later = new Set(lib.later.map((s) => s.itemId));
  if (libTab === 'thoughts') {
    if (!lib.thoughts.length) return box.replaceChildren(empty('message-circle', 'No thoughts yet', 'Tap the speech bubble on anything that sparks an idea or a question.'));
    box.replaceChildren(...lib.thoughts.map((t) => {
      const del = el('button', { className: 'small-btn', textContent: 'Delete' });
      del.onclick = async () => { if (!confirm('Delete this thought?')) return; await api(`/api/notes/${t.id}`, { method: 'DELETE' }); renderLibrary(); };
      const ref = t.item ? el('button', { className: 'ref truncate', textContent: `On: ${t.item.title || t.item.source}` }) : null;
      if (ref) ref.onclick = () => openViewer(t.item, t.itemId);
      return el('div', { className: 'thought' }, el('p', { textContent: t.text }), ref,
        el('div', { className: 'row between', style: 'margin-top:8px' }, el('span', { className: 'muted small', textContent: ago(t.at) }), del));
    }));
    return;
  }
  const items = lib[libTab];
  if (!items.length) {
    return box.replaceChildren(libTab === 'saved'
      ? empty('bookmark', 'Nothing saved yet', 'Tap the bookmark on videos and reads you want to keep.')
      : empty('clock', 'Nothing for later', 'Tap the clock when you’re short on time.'));
  }
  box.replaceChildren(...items.map(({ itemId, item, at }) => {
    const thumb = el('div', { className: 'lib-thumb' }, item.image ? null : icon(item.kind === 'video' ? 'play' : 'library'));
    if (item.image) thumb.style.backgroundImage = `url("${encodeURI(item.image)}")`;
    const open = el('button', { className: 'open-item' }, thumb,
      el('div', { style: 'min-width:0' },
        el('div', { className: 'lib-title', textContent: item.title || item.text?.slice(0, 100) || 'Untitled' }),
        el('div', { className: 'muted small truncate', textContent: `${item.source} · ${item.topicName} · ${ago(at)}` })));
    open.onclick = () => openViewer(item, itemId);
    const remove = el('button', { className: 'small-btn', textContent: 'Remove', aria: { label: `Remove ${item.title}` } });
    remove.onclick = async () => { await api(`/api/library/${libTab}?itemId=${encodeURIComponent(itemId)}`, { method: 'DELETE' }); renderLibrary(); };
    return el('div', { className: 'lib-item' }, open, remove);
  }));
}
function empty(name, title, text) {
  return el('div', { className: 'empty' }, el('div', { className: 'big-icon' }, icon(name)), el('h2', { textContent: title }), el('p', { textContent: text }));
}
// ---------- Creator / site profile (like an Instagram profile) ----------
async function openProfile(sourceId) {
  if (!sourceId) return;
  $('#profile-body').replaceChildren(el('p', { className: 'muted', textContent: 'Loading…' }));
  openSheet('#profile-sheet');
  let p;
  try { p = await api(`/api/source/${encodeURIComponent(sourceId)}`); }
  catch { return $('#profile-body').replaceChildren(el('p', { className: 'muted', textContent: 'Couldn’t load this profile.' })); }
  const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
  const avatar = p.thumb
    ? el('img', { className: 'ava big', src: p.thumb, alt: '', referrerPolicy: 'no-referrer', onerror() { this.replaceWith(el('span', { className: 'ava big', textContent: initial(p.title) })); } })
    : el('span', { className: 'ava big', textContent: initial(p.title) });
  const stats = [`${p.items.length} ${p.kind === 'channel' ? 'videos' : 'posts'} on Curio`, p.subscribers ? `${fmt(p.subscribers)} subscribers` : null].filter(Boolean).join(' · ');
  const tile = (it) => {
    const b = el('button', { className: `tile ${it.kind}`, aria: { label: it.title } });
    if (it.kind === 'video') b.style.backgroundImage = `url(https://i.ytimg.com/vi/${encodeURIComponent(it.id)}/hqdefault.jpg)`;
    else if (it.image) b.style.backgroundImage = `url("${it.image.replace(/"/g, '%22')}")`;
    else b.append(el('span', { textContent: it.title || (it.text || '').slice(0, 80) }));
    if (it.kind === 'video') b.append(icon('play', 'sm'));
    b.onclick = () => openViewer(it, it.id);
    return b;
  };
  $('#profile-body').replaceChildren(
    el('div', { className: 'profile-head' }, avatar,
      el('div', { className: 'grow' },
        el('h2', { id: 'profile-name', className: 'truncate', textContent: p.title }),
        el('div', { className: 'muted small', textContent: p.topicName }),
        el('div', { className: 'muted small', textContent: stats }))),
    el('a', { className: 'primary wide follow-btn', href: p.url, target: '_blank', rel: 'noopener' },
      p.kind === 'channel' ? 'Open channel on YouTube' : 'Visit site', icon('external-link', 'sm')),
    p.items.length ? el('div', { className: 'tile-grid' }, ...p.items.map(tile)) : el('p', { className: 'muted', textContent: 'Nothing here yet.' }));
}

function openViewer(item, itemId) {
  $('#viewer-title').textContent = item.title || item.source;
  const share = el('button', { className: 'ghost with-icon' }, icon('send', 'sm'), 'Share');
  share.onclick = () => { closeSheets(); shareItem({ ...item, id: itemId }); };
  const think = el('button', { className: 'ghost with-icon' }, icon('message-circle', 'sm'), 'Thought');
  think.onclick = () => { closeSheets(); openThought({ ...item, id: itemId }); };
  const body = item.kind === 'video'
    ? el('iframe', { className: item.vertical === false ? 'wide' : '', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(itemId)}?autoplay=1&playsinline=1&rel=0`, allow: 'autoplay; encrypted-media; picture-in-picture', allowFullscreen: true, title: item.title })
    : el('div', {},
        item.image ? el('img', { src: item.image, alt: '', style: 'width:100%;border-radius:14px;margin-bottom:12px', referrerPolicy: 'no-referrer' }) : null,
        el('p', { className: 'full-text', textContent: item.text || '' }));
  $('#viewer-body').replaceChildren(body,
    el('div', { className: 'row', style: 'margin-top:12px;flex-wrap:wrap' },
      el('a', { className: 'primary', href: item.url, target: '_blank', rel: 'noopener', textContent: item.kind === 'video' ? 'Open in YouTube' : 'Read full', style: 'text-decoration:none' }),
      share, think));
  openSheet('#viewer-sheet');
}

// ---------- Insights ----------
async function renderInsights() {
  const box = $('#insights');
  let d;
  try { d = await api('/api/insights'); } catch { return; }
  const tile = (value, label) => el('div', { className: 'tile' }, el('div', { className: 'value', textContent: value }), el('div', { className: 'label', textContent: label }));
  const dayNames = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 86400000).toLocaleDateString(undefined, { weekday: 'narrow' }));
  const max = Math.max(1, ...d.topics.map((t) => t.minutes));
  box.replaceChildren(
    el('div', { className: 'tiles' },
      tile(fmtMin(d.today.minutes), 'min today'),
      tile(fmtMin(d.week.minutes), 'min this week'),
      tile(String(d.streak), 'day streak')),
    el('div', { className: 'card-block' },
      el('h2', { textContent: 'Last 7 days' }),
      el('div', { className: 'days', role: 'img', aria: { label: `Active on ${d.last7.filter(Boolean).length} of the last 7 days` } },
        ...d.last7.map((on, i) => el('div', { className: 'day' }, el('span', { className: `dot${on ? ' on' : ''}` }), el('span', { textContent: dayNames[i] }))))),
    el('div', { className: 'card-block' },
      el('h2', { textContent: 'What you explored this week' }),
      d.topics.length
        ? el('div', { className: 'bars' }, ...d.topics.slice(0, 8).map((t) => el('div', { className: 'bar-row', title: `${t.topic}: ${t.minutes} min, ${t.items} items` },
            el('span', { className: 'name', textContent: t.topic }),
            el('span', { className: 'val', textContent: `${fmtMin(t.minutes)} min · ${t.items}` }),
            el('div', { className: 'bar-track' }, el('div', { className: 'bar-fill', style: `width:${(t.minutes / max) * 100}%` })))))
        : el('p', { className: 'muted', textContent: 'Watch or read something and it will show up here.' })),
    el('div', { className: 'card-block' },
      el('h2', { textContent: 'This week' }),
      el('div', { className: 'totals' }, tile(String(d.week.videos), 'videos'), tile(String(d.week.reads), 'reads'))),
    el('div', { className: 'card-block' },
      el('h2', { textContent: 'All time' }),
      el('div', { className: 'totals' },
        tile(String(d.totals.allTime), 'things seen'), tile(String(d.totals.likes), 'liked'),
        tile(String(d.totals.saved), 'saved'), tile(String(d.totals.thoughts), 'thoughts'))),
    el('p', { className: 'muted small center-text', textContent: 'Only you can see this.' }));
}

// ---------- Profile ----------
async function renderProfile() {
  $('#profile-name').textContent = state.me.name;
  $('#profile-email').textContent = state.me.guest ? 'Guest on this device' : state.me.email;
  $('#guest-card').hidden = !state.me.guest;
  $('#logout').hidden = state.me.guest;
  const langs = new Set(state.me.languages);
  $('#lang-chips').replaceChildren(...LANGS.map(([code, label]) => {
    const b = el('button', { className: 'chip-toggle', textContent: label, aria: { pressed: String(langs.has(code)) } });
    b.onclick = async () => {
      const next = new Set(langs);
      next.has(code) ? next.delete(code) : next.add(code);
      try {
        await api('/api/me', { method: 'PATCH', body: { languages: [...next] } });
        next.has(code) ? langs.add(code) : langs.delete(code);
        state.me.languages = [...langs];
        b.setAttribute('aria-pressed', String(langs.has(code)));
        resetFeed();
      } catch (err) { toast(err.message); }
    };
    return b;
  }));
  await Promise.all([renderTopics(), renderCreators(), renderInstagram()]);
}

async function renderTopics() {
  const topics = await api('/api/topics');
  $('#topic-list').replaceChildren(...topics.map((t) => {
    const toggle = el('input', { type: 'checkbox', className: 'toggle', checked: t.following, aria: { label: `Follow ${t.name}` } });
    toggle.onchange = () => api(`/api/topics/${t.id}`, { method: 'PATCH', body: { following: toggle.checked } }).then(() => { syncTopicsToDevice(); resetFeed(); }).catch(() => (toggle.checked = !toggle.checked));
    return el('li', {}, el('div', { className: 'grow' }, el('div', { textContent: t.name }), el('div', { className: 'sub', textContent: MODE_LABEL[t.mode] + (t.custom ? ' · added by you' : '') })), toggle);
  }));
}
$('#add-topic').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#topic-error').textContent = '';
  try {
    await api('/api/topics', { method: 'POST', body: { name: $('#topic-name').value, mode: $('#topic-mode').value } });
    $('#topic-name').value = '';
    toast('Topic added. Curio will find creators for it within the hour.');
    await renderTopics();
    resetFeed();
  } catch (err) {
    $('#topic-error').textContent = err.message;
  }
});

async function renderCreators() {
  const [creators, topics] = await Promise.all([api('/api/creators'), api('/api/topics')]);
  const box = $('#creator-list');
  if (!creators.length) return box.replaceChildren(el('p', { className: 'muted', textContent: 'Curio is still finding creators for your topics. Check back soon.' }));
  const byTopic = new Map();
  for (const c of creators) (byTopic.get(c.topicId) ?? byTopic.set(c.topicId, []).get(c.topicId)).push(c);
  box.replaceChildren(...topics.filter((t) => byTopic.has(t.id)).flatMap((t) => [
    el('h3', { className: 'group-title', textContent: t.name }),
    el('ul', { className: 'list' }, ...byTopic.get(t.id).map((c) => {
      const hide = el('button', { className: 'small-btn', textContent: 'Hide', aria: { label: `Hide ${c.title}` } });
      const li = el('li', {},
        c.thumb ? el('img', { className: 'avatar', src: c.thumb, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }) : el('div', { className: 'avatar' }),
        el('div', { className: 'grow' },
          el('div', { className: 'truncate', textContent: c.title }),
          el('div', { className: 'sub truncate', textContent: `${SOURCE_LABEL[c.kind] || c.kind}${c.reason && c.reason !== 'Curated' ? ` · ${c.reason}` : ''}` })),
        hide);
      hide.onclick = async () => {
        await api('/api/creators/hide', { method: 'POST', body: { id: c.id } });
        li.remove();
        toast(`You won't see ${c.title} anymore`);
        resetFeed();
      };
      return li;
    })),
  ]));
}

$('#save-account').onclick = () => showAuth('claim');
$('#guest-signin').onclick = () => showAuth('login');
$('#logout').onclick = async () => {
  flushViews();
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  clearInterests();
  location.reload();
};
$('#delete-account').onclick = async () => {
  const warning = 'This permanently deletes your account, history, saves and thoughts.';
  let pw = '';
  if (state.me.guest) { if (!confirm(warning)) return; }
  else { pw = prompt(`${warning}\nEnter your password to confirm:`); if (!pw) return; }
  try {
    await api('/api/me', { method: 'DELETE', body: { password: pw } });
    clearInterests();
    location.reload();
  } catch (err) { toast(err.message); }
};

// Topic/language/creator changes take effect from a fresh feed.
function resetFeed() {
  for (const q of state.queue) observer.unobserve(q.node);
  feed.replaceChildren();
  state.queue = [];
  state.activeIndex = -1;
  state.watchStart = 0;
  state.caughtUp = false;
}

// ---------- Utils ----------
function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return m <= 1 ? 'just now' : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}
function fmtMin(m) { return m < 1 ? (m > 0 ? '<1' : '0') : m < 10 ? String(Math.round(m * 10) / 10) : String(Math.round(m)); }

// ---------- Boot ----------
async function boot(retried = false) {
  try {
    state.me = await api('/api/me');
  } catch (err) {
    if (err.status !== 401 || retried) return toast(err.message);
    // No session: start as a guest, restoring interests saved on this device.
    const { topicIds, languages } = loadInterests();
    await api('/api/auth/guest', { method: 'POST', body: { topicIds, languages, tzOffset: -new Date().getTimezoneOffset() } }).catch(() => {});
    return boot(true);
  }
  if (!state.me.onboarded) return runOnboarding();
  saveInterests({ languages: state.me.languages });
  syncTopicsToDevice();
  api('/api/library').then((lib) => {
    state.lists.saved = new Set(lib.saved.map((s) => s.itemId));
    state.lists.later = new Set(lib.later.map((s) => s.itemId));
  }).catch(() => {});
  enterApp();
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
// The front screen asks people to install. Local development skips it.
const devHost = ['localhost', '127.0.0.1'].includes(location.hostname);
// Shown once per browser visit; "Continue in browser" lets people try it first.
const gateSkipped = () => { try { return sessionStorage.getItem('curio.browser') === '1'; } catch { return false; } };
$('#gate-browser').onclick = () => { try { sessionStorage.setItem('curio.browser', '1'); } catch {} boot(); };
if (installed || devHost || gateSkipped()) boot();
else {
  showOnly('install-gate');
  $('#gate-steps').textContent = installSteps();
}

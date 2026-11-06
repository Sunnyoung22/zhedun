/** 这顿 · 应用入口：路由、本地存储、饭历与全局对话框。 */

import { TONES } from './data.js';
import {
  DEFAULT_PREFS,
  formatMoney,
  formatTimeCN,
  relativeDayLabel,
  summarizeHistory
} from './engine.js';
import {
  $,
  $$,
  closeDialog,
  escapeHtml,
  openDialog,
  storageGet,
  storageSet,
  toast
} from './ui.js';
import { createGroup } from './group.js';
import { createSolo } from './solo.js';

const KEYS = {
  prefs: 'zhedun.prefs.v1',
  history: 'zhedun.history.v1',
  custom: 'zhedun.custom.v1'
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizePrefs(value) {
  const prefs = { ...DEFAULT_PREFS, ...(value && typeof value === 'object' ? value : {}) };
  prefs.people = [1, 2, 4, 8].includes(Number(prefs.people)) ? Number(prefs.people) : DEFAULT_PREFS.people;
  prefs.budget = [30, 60, 100, 999].includes(Number(prefs.budget)) ? Number(prefs.budget) : DEFAULT_PREFS.budget;
  prefs.mood = ['warm', 'light', 'spicy', 'any'].includes(prefs.mood) ? prefs.mood : DEFAULT_PREFS.mood;
  prefs.distance = [5, 15, 30].includes(Number(prefs.distance)) ? Number(prefs.distance) : DEFAULT_PREFS.distance;
  prefs.avoidRecent = prefs.avoidRecent !== false;
  return prefs;
}

function sanitizeHistory(value) {
  const cleaned = asArray(value)
    .filter((entry) => entry && typeof entry.name === 'string' && entry.name.trim())
    .slice(0, 120)
    .map((entry) => ({
      ...entry,
      name: String(entry.name).slice(0, 40),
      at: Number.isFinite(new Date(entry.at).getTime()) ? entry.at : new Date().toISOString()
    }));
  const seen = new Set();
  return cleaned.filter((entry) => {
    const key = historyKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function historyKey(entry) {
  if (entry?.roomCode && entry.round != null) return `room:${entry.roomCode}:${entry.round}`;
  return entry?.id || `${entry?.name || ''}:${entry?.at || ''}`;
}

function sanitizeCustomOptions(value) {
  return asArray(value)
    .filter((option) => option && typeof option.name === 'string' && option.name.trim())
    .slice(0, 24)
    .map((option) => ({
      ...option,
      id: typeof option.id === 'string' ? option.id : `custom-${Math.random().toString(36).slice(2)}`,
      name: String(option.name).slice(0, 24),
      custom: true
    }));
}

const prefs = sanitizePrefs(storageGet(KEYS.prefs, null));
let history = sanitizeHistory(storageGet(KEYS.history, []));
let customOptions = sanitizeCustomOptions(storageGet(KEYS.custom, []));

const store = {
  get prefs() { return prefs; },
  get history() { return history; },
  get customOptions() { return customOptions; },
  updatePrefs(patch) {
    Object.assign(prefs, patch);
    storageSet(KEYS.prefs, prefs);
  },
  addCustom(option) {
    customOptions.push(option);
    if (customOptions.length > 24) customOptions = customOptions.slice(-24);
    storageSet(KEYS.custom, customOptions);
  },
  commit(entry) {
    if (!entry?.id) return;
    const stored = sanitizeHistory(storageGet(KEYS.history, []));
    const seen = new Set();
    history = [entry, ...history, ...stored].filter((item) => {
      const key = historyKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 120);
    storageSet(KEYS.history, history);
    renderHistory();
  },
  clearHistory() {
    history = [];
    storageSet(KEYS.history, history);
    renderHistory();
  }
};

let historyFilter = 'all';
let currentRoute = 'solo';

const solo = createSolo({ store });
const group = createGroup({ store, openAbout });

function openAbout() {
  openDialog('aboutDialog');
}

function renderHistory() {
  const stats = summarizeHistory(history);
  $('#statTotal').textContent = String(stats.total);
  $('#statMinutes').textContent = String(stats.savedMinutes);
  $('#statTop').textContent = stats.topName || '—';
  $('#statTopCount').textContent = stats.topName ? `吃过 ${stats.topCount} 次` : '还没有记录';
  $('#clearHistoryBtn').disabled = history.length === 0;
  for (const button of $$('[data-history-filter]')) {
    const active = button.dataset.historyFilter === historyFilter;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }

  const filtered = historyFilter === 'all'
    ? history
    : history.filter((entry) => entry.mode === historyFilter);

  const container = $('#historyList');
  if (filtered.length === 0) {
    const emptyCopy = history.length === 0
      ? '还没有决定过一顿。去摇一次，或者开个饭局。'
      : historyFilter === 'group'
        ? '还没有饭局记录。下次人多的时候，别再让「随便」主持会议。'
        : '还没有一人食记录。一个人的饭，也值得好好决定。';
    container.innerHTML = `
      <div class="history-empty">
        <span class="history-empty-mark">${history.length === 0 ? '顿' : '空'}</span>
        <h3>${history.length === 0 ? '饭历还是空的' : '这一栏还没有记录'}</h3>
        <p>${emptyCopy}</p>
        <button type="button" class="btn btn-primary" data-route="solo">去决定一顿</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((entry) => {
    const tone = TONES[entry.tone] || TONES.tomato;
    const meta = [];
    if (entry.price != null) meta.push(formatMoney(entry.price));
    if (entry.distance != null) meta.push(`步行 ${entry.distance} 分钟`);
    if (entry.cuisine) meta.push(entry.cuisine);
    const modeLabel = entry.mode === 'group' ? '饭局' : '一人食';
    const reason = entry.mode === 'group' && entry.reason
      ? `<span>${escapeHtml(entry.reason)}</span>`
      : '';
    return `
      <article class="history-item">
        <span class="history-mark" style="--mark-bg:${tone.bg};--mark-fg:${tone.fg}">${escapeHtml(entry.mark || Array.from(entry.name)[0] || '饭')}</span>
        <div class="history-main">
          <div class="history-title-line">
            <h3>${escapeHtml(entry.name)}</h3>
            <span class="history-mode">${modeLabel}</span>
          </div>
          <div class="history-meta">${meta.map(escapeHtml).join(' · ')}${reason}</div>
        </div>
        <div class="history-when">
          <b>${escapeHtml(relativeDayLabel(entry.at))}</b>
          ${escapeHtml(formatTimeCN(new Date(entry.at)))}
        </div>
      </article>
    `;
  }).join('');
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, '');
  if (raw === 'group' || raw.startsWith('group/')) {
    return { name: 'group', code: raw.split('/')[1] || '' };
  }
  if (raw === 'history') return { name: 'history', code: '' };
  return { name: 'solo', code: '' };
}

function updateNav(name) {
  for (const button of $$('[data-route]')) {
    const active = button.dataset.route === name;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

function showView(name) {
  for (const view of $$('.view')) {
    const active = view.dataset.view === name;
    view.hidden = !active;
    view.classList.toggle('is-active', active);
  }
}

function route() {
  const parsed = parseRoute();
  currentRoute = parsed.name;
  showView(parsed.name);
  updateNav(parsed.name);

  if (parsed.name === 'group') {
    group.show({ code: parsed.code });
    document.title = '饭局 · 这顿';
  } else if (parsed.name === 'history') {
    renderHistory();
    document.title = '饭历 · 这顿';
  } else {
    solo.show();
    document.title = '这顿 · 吃什么，定了';
  }

  if (!location.hash) {
    history.replaceState(null, '', '#solo');
  }
}

function navigate(name) {
  const next = `#${name}`;
  if (location.hash === next) {
    route();
    return;
  }
  location.hash = next;
}

function bindGlobalEvents() {
  document.addEventListener('click', (event) => {
    const routeTarget = event.target.closest('[data-route]');
    if (routeTarget) {
      event.preventDefault();
      navigate(routeTarget.dataset.route);
      return;
    }

    const closeTarget = event.target.closest('[data-close-dialog]');
    if (closeTarget) {
      closeDialog(closeTarget.dataset.closeDialog);
    }
  });

  for (const id of ['aboutBtn', 'footerAboutBtn', 'principlesMore']) {
    document.getElementById(id)?.addEventListener('click', openAbout);
  }

  $('#clearHistoryBtn').addEventListener('click', () => {
    if (history.length === 0) return;
    openDialog('confirmDialog');
  });

  $('#confirmOk').addEventListener('click', () => {
    store.clearHistory();
    closeDialog('confirmDialog');
    toast('饭历已清空。下一顿重新开始。');
  });

  $('.history-toolbar').addEventListener('click', (event) => {
    const target = event.target.closest('[data-history-filter]');
    if (!target) return;
    historyFilter = target.dataset.historyFilter;
    renderHistory();
  });

  // 点击对话框外的遮罩关闭。结果饭票除外，避免误触丢掉刚转出来的结果。
  for (const dialog of $$('dialog')) {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      if (dialog.id === 'resultDialog') return;
      closeDialog(dialog);
    });
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('storage', (event) => {
    if (event.key === KEYS.history) {
      history = sanitizeHistory(storageGet(KEYS.history, []));
      renderHistory();
    }
  });
}

function init() {
  solo.init();
  group.init();
  bindGlobalEvents();
  renderHistory();
  if (!location.hash) {
    history.replaceState(null, '', '#solo');
  }
  route();
}

init();

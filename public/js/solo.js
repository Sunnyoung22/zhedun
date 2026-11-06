/** 一人食：筛选、转盘、结果饭票、自定义选项。 */

import { BUDGETS, DISTANCES, MEALS, MOODS, OPTIONS, PEOPLE, TONE_KEYS, TONES } from './data.js';
import {
  DEFAULT_PREFS,
  buildShortlist,
  formatClock,
  formatMoney,
  formatWeekday,
  getMealPeriod,
  isNonOption,
  makeTicketNumber,
  mapSearchUrl,
  normalizeText,
  personLabel,
  reasonFor,
  shareText
} from './engine.js';
import {
  $,
  $$,
  burstConfetti,
  closeDialog,
  copyText,
  escapeHtml,
  openDialog,
  pad2,
  toast,
  uid
} from './ui.js';
import { Wheel } from './wheel.js';
import { saveMealTicket } from './share.js';

const TAG_LABELS = {
  warm: '热乎',
  soup: '带汤',
  noodle: '面',
  fast: '快',
  solo: '一人友好',
  meaty: '有肉',
  veg: '有菜',
  spicy: '辣',
  light: '清爽',
  healthy: '轻负担',
  share: '适合分享',
  group: '适合多人',
  slow: '慢慢吃',
  comfort: '舒服',
  fish: '鱼',
  grill: '烤',
  cheesy: '芝士',
  baked: '烤',
  handheld: '拿着吃',
  breakfast: '早餐',
  late: '夜宵',
  mild: '温和',
  strong: '重口',
  'all-day': '全天',
  emergency: '救急',
  festive: '有仪式感'
};

const LABEL_MAP = {
  people: Object.fromEntries(PEOPLE.map((item) => [item.value, item.label])),
  budget: Object.fromEntries(BUDGETS.map((item) => [item.value, item.label])),
  mood: Object.fromEntries(MOODS.map((item) => [item.value, item.label])),
  distance: Object.fromEntries(DISTANCES.map((item) => [item.value, item.label]))
};

function recentIdsFromHistory(history, days = 7) {
  const cutoff = Date.now() - days * 86400000;
  const ids = new Set();
  for (const entry of history) {
    const when = new Date(entry.at).getTime();
    if (Number.isFinite(when) && when >= cutoff && entry.optionId) {
      ids.add(entry.optionId);
    }
  }
  return [...ids];
}

function dayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  return String(Math.floor((date - start) / 86400000)).padStart(3, '0');
}

function tagsFor(option) {
  const tags = [];
  for (const tag of option.tags || []) {
    const label = TAG_LABELS[tag];
    if (label && !tags.includes(label)) tags.push(label);
    if (tags.length >= 4) break;
  }
  return tags;
}

export function createSolo({ store }) {
  const els = {
    view: $('#view-solo'),
    mealContext: $('#mealContext'),
    headerMeal: $('#headerMeal'),
    issueNo: $('#issueNo'),
    brief: $('.brief-card'),
    spinBtn: $('#spinBtn'),
    wheelCenter: $('#wheelCenter'),
    shuffleBtn: $('#shuffleBtn'),
    resetPrefs: $('#resetPrefs'),
    avoidNote: $('#avoidNote'),
    addOptionBtn: $('#addOptionBtn'),
    stage: $('#wheelStage'),
    wheel: $('#wheel'),
    wheelLegend: $('#wheelLegend'),
    stageQuote: $('#stageQuote'),
    stageStamp: $('#stageStamp'),
    roundNo: $('#roundNo'),
    candidateCount: $('#candidateCount'),
    poolNote: $('#poolNote'),
    resultDialog: $('#resultDialog'),
    resultTicket: $('#resultTicket'),
    resultActions: $('#resultActions'),
    acceptedActions: $('#acceptedActions'),
    ticketNo: $('#ticketNo'),
    ticketKicker: $('#ticketKicker'),
    ticketStamp: $('#ticketStamp'),
    resultHeadline: $('#resultHeadline'),
    ticketName: $('#ticketName'),
    ticketDesc: $('#ticketDesc'),
    ticketTags: $('#ticketTags'),
    ticketReason: $('#ticketReason'),
    ticketPlace: $('#ticketPlace'),
    ticketFoot: $('#ticketFoot'),
    acceptBtn: $('#acceptBtn'),
    againBtn: $('#againBtn'),
    resultCloseX: $('#resultCloseX'),
    resultCloseBtn: $('#resultCloseBtn'),
    acceptedCloseBtn: $('#acceptedCloseBtn'),
    mapBtn: $('#mapBtn'),
    ticketBtn: $('#ticketBtn'),
    copyResultBtn: $('#copyResultBtn'),
    addDialog: $('#addOptionDialog'),
    customForm: $('#customOptionForm'),
    customName: $('#customName'),
    customPrice: $('#customPrice'),
    customDistance: $('#customDistance'),
    customError: $('#customError')
  };

  const wheel = new Wheel(els.wheel);
  let prefs = { ...DEFAULT_PREFS, ...store.prefs };
  let meal = getMealPeriod();
  let pool = [];
  let round = 1;
  let spinCount = 0;
  let rerolls = 0;
  let spinning = false;
  let accepted = false;
  let currentResult = null;
  let clockTimer = 0;

  function currentBudgetLabel() {
    return prefs.budget >= 999 ? '不限预算' : `¥${prefs.budget} 内`;
  }

  function syncPrefsUI() {
    for (const button of $$('[data-pref]')) {
      const key = button.dataset.pref;
      const raw = button.dataset.value;
      const value = key === 'mood' ? raw : Number(raw);
      const active = String(prefs[key]) === String(value);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function updateTimeContext({ rebuildOnMealChange = false } = {}) {
    const now = new Date();
    const nextMeal = getMealPeriod(now);
    const meta = MEALS[nextMeal] || MEALS.dinner;
    els.mealContext.textContent = `${formatWeekday(now)} · ${formatClock(now)} · ${meta.label}`;
    els.headerMeal.textContent = meta.label;
    els.issueNo.textContent = dayOfYear(now);
    if (els.stageStamp) {
      els.stageStamp.innerHTML = `<span>${meta.en}</span><b>DECIDED</b>`;
    }
    if (nextMeal !== meal) {
      meal = nextMeal;
      if (rebuildOnMealChange && !spinning) buildPool();
    }
  }

  function updateStageText() {
    els.roundNo.textContent = pad2(round);
    els.candidateCount.textContent = pad2(pool.length);
    els.poolNote.textContent = [
      LABEL_MAP.people[prefs.people] || '2 人',
      currentBudgetLabel(),
      LABEL_MAP.distance[prefs.distance] || '15 分钟',
      LABEL_MAP.mood[prefs.mood] || '都行'
    ].join(' · ');
    if (!accepted) {
      els.stageQuote.textContent = '“指针停在哪，就吃哪个。”';
    }
    updateAvoidNote();
  }

  function updateAvoidNote() {
    if (!prefs.avoidRecent) {
      els.avoidNote.textContent = '允许重复最近吃过的';
      return;
    }
    const recent = recentIdsFromHistory(store.history);
    els.avoidNote.textContent = recent.length
      ? `已避开最近 7 天吃过的 ${recent.length} 顿`
      : '最近 7 天没有饭历，今天从零开始';
  }

  function renderLegend() {
    els.wheelLegend.innerHTML = pool.map((option) => {
      const tone = { bg: getToneColor(option.tone) };
      return `
        <div class="legend-item" data-option-id="${escapeHtml(option.id)}" title="${escapeHtml(option.desc || option.name)}">
          <span class="legend-dot" style="--legend-color:${tone.bg}"></span>
          <span class="legend-name">${escapeHtml(option.name)}</span>
          <span class="legend-price">${escapeHtml(formatMoney(option.price))}</span>
        </div>
      `;
    }).join('');

    for (const item of $$('.legend-item', els.wheelLegend)) {
      const id = item.dataset.optionId;
      item.addEventListener('pointerenter', () => wheel.highlight(id));
      item.addEventListener('pointerleave', () => wheel.highlight(null));
    }
  }

  function getToneColor(toneKey) {
    const map = {
      tomato: '#D94E35',
      mustard: '#E7B04A',
      olive: '#687550',
      blue: '#385A66',
      plum: '#7A4B49',
      cream: '#EFE1C0',
      charcoal: '#332E26'
    };
    return map[toneKey] || map.tomato;
  }

  function buildPool({ excludeIds = [] } = {}) {
    const allOptions = [...OPTIONS, ...store.customOptions];
    const recentIds = prefs.avoidRecent ? recentIdsFromHistory(store.history) : [];
    let next = buildShortlist({
      options: allOptions,
      prefs,
      meal,
      recentIds,
      count: 5,
      excludeIds
    });

    if (next.length < 3) {
      next = buildShortlist({
        options: allOptions,
        prefs,
        meal,
        recentIds: [],
        count: 5,
        excludeIds
      });
    }

    if (next.length < 3) {
      next = buildShortlist({
        options: allOptions,
        prefs: { ...prefs, budget: 999, distance: 30 },
        meal,
        recentIds: [],
        count: 5,
        excludeIds: []
      });
    }

    pool = next;
    wheel.setOptions(pool);
    renderLegend();
    updateStageText();
  }

  function setBusy(busy) {
    spinning = busy;
    els.stage.classList.toggle('is-spinning', busy);
    els.spinBtn.disabled = busy;
    els.wheelCenter.disabled = busy;
    els.shuffleBtn.disabled = busy;
    for (const chip of $$('.pref-chip')) chip.disabled = busy;
  }

  async function spin() {
    if (spinning) return;
    if (els.resultDialog.open) return;
    if (accepted) {
      accepted = false;
      buildPool();
    }
    if (pool.length === 0) {
      buildPool();
      if (pool.length === 0) {
        toast('这一轮没有候选，试试放宽预算或距离。', { error: true });
        return;
      }
    }

    const winner = pool[Math.floor(Math.random() * pool.length)];
    spinCount += 1;
    setBusy(true);
    els.stageQuote.textContent = '正在把选择交给命运…';
    try {
      await wheel.spinTo(winner);
      setBusy(false);
      showResult(winner, { mode: 'fate' });
    } catch (error) {
      console.error(error);
      setBusy(false);
      toast('转盘卡住了，再试一次。', { error: true });
    }
  }

  function showResult(option, { mode = 'fate' } = {}) {
    const toneData = TONES[option.tone] || TONES.tomato;
    const tone = toneData.bg;
    const accentInk = toneData.fg;
    const ticketNo = makeTicketNumber(new Date());
    const meta = MEALS[meal] || MEALS.dinner;
    const peopleText = prefs.people === 1 ? 'SOLO' : `${prefs.people} PEOPLE`;

    currentResult = {
      option,
      mode,
      accepted: false,
      ticketNo,
      meal,
      prefs: { ...prefs }
    };

    els.resultDialog.style.setProperty('--ticket-accent', tone);
    els.resultTicket.style.setProperty('--ticket-accent', tone);
    els.resultTicket.style.setProperty('--ticket-accent-ink', accentInk);
    els.resultTicket.style.setProperty('--ticket-strong', toneData.ink || tone);
    els.resultTicket.classList.remove('is-accepted');
    els.resultActions.hidden = false;
    els.acceptedActions.hidden = true;
    els.acceptBtn.disabled = false;

    els.ticketNo.textContent = `NO. ${ticketNo}`;
    els.ticketKicker.textContent = `${meta.en} · ${peopleText} · ${formatMoney(option.price)}`;
    els.ticketStamp.textContent = option.mark || Array.from(option.name)[0] || '饭';
    els.resultHeadline.innerHTML = mode === 'fate'
      ? '命运说，<br>就它了。'
      : '你选的，<br>也可以。';
    els.ticketName.textContent = option.name;
    els.ticketDesc.textContent = option.desc || '这一顿，先吃了再说。';
    els.ticketTags.innerHTML = tagsFor(option)
      .map((tag) => `<span class="ticket-tag">${escapeHtml(tag)}</span>`)
      .join('');
    els.ticketReason.textContent = reasonFor(option, prefs, meal);
    els.ticketPlace.textContent = option.custom
      ? '你加进来的选项 · 去地图搜搜看'
      : `附近搜「${option.name}」`;
    els.ticketFoot.textContent = mode === 'fate' ? 'FATE, SERVED.' : 'YOU, DECIDED.';
    els.ticketBtn.disabled = false;
    els.ticketBtn.querySelector('span').textContent = '保存饭票';
    els.stageQuote.textContent = '“命运已经选好了。”';

    openDialog(els.resultDialog);
    burstConfetti($('#resultConfetti'));
    els.acceptBtn.focus({ preventScroll: true });
    window.setTimeout(() => {
      if (els.resultDialog.open) els.acceptBtn.focus({ preventScroll: true });
    }, 0);
  }

  function acceptResult() {
    if (!currentResult || currentResult.accepted) return;
    currentResult.accepted = true;
    accepted = true;
    els.resultTicket.classList.add('is-accepted');
    els.resultActions.hidden = true;
    els.acceptedActions.hidden = false;

    const option = currentResult.option;
    const entry = {
      id: uid(),
      optionId: option.id,
      name: option.name,
      mark: option.mark || Array.from(option.name)[0] || '饭',
      tone: option.tone || 'tomato',
      price: option.price,
      distance: option.distance,
      cuisine: option.cuisine || '自定义',
      desc: option.desc || '',
      at: new Date().toISOString(),
      meal,
      people: prefs.people,
      mood: prefs.mood,
      mode: 'solo',
      spins: spinCount || 1,
      reason: reasonFor(option, prefs, meal)
    };
    store.commit(entry);

    els.mapBtn.href = mapSearchUrl(option);
    els.mapBtn.dataset.optionName = option.name;
    els.stageQuote.textContent = `“${option.name}，就它了。”`;
    wheel.highlight(option.id);
    toast('已记入饭历。别再改了。');
  }

  function closeResult() {
    closeDialog(els.resultDialog);
  }

  function rerollFromResult() {
    if (!currentResult) return;
    const excluded = currentResult.option.id;
    const previous = currentResult;
    closeDialog(els.resultDialog);
    if (previous.accepted) return;
    rerolls += 1;
    if (rerolls >= 2) {
      toast('已经排除两个了。答案正在变小。');
    } else {
      toast('不喜欢？那它至少帮你排除了一个答案。');
    }
    round += 1;
    accepted = false;
    buildPool({ excludeIds: [excluded] });
    window.setTimeout(() => spin(), 260);
  }

  function shuffle() {
    if (spinning) return;
    accepted = false;
    rerolls = 0;
    round += 1;
    const currentIds = pool.map((option) => option.id);
    buildPool({ excludeIds: currentIds });
    els.stageQuote.textContent = '“换了一批。选项少了，决定会变快。”';
    toast('换了一批候选。');
  }

  function setPref(key, rawValue) {
    if (spinning) {
      toast('等转盘停稳再改条件。');
      return;
    }
    const value = key === 'mood' ? rawValue : Number(rawValue);
    if (prefs[key] === value) return;
    prefs = { ...prefs, [key]: value };
    store.updatePrefs({ [key]: value });
    accepted = false;
    syncPrefsUI();
    round += 1;
    buildPool();
  }

  function resetPrefs() {
    if (spinning) return;
    prefs = { ...DEFAULT_PREFS };
    store.updatePrefs(prefs);
    accepted = false;
    syncPrefsUI();
    round = 1;
    buildPool();
    toast('条件已恢复默认。');
  }

  function openAddDialog() {
    els.customError.textContent = '';
    els.customName.value = '';
    els.customPrice.value = '50';
    els.customDistance.value = '10';
    openDialog(els.addDialog);
    window.setTimeout(() => els.customName.focus(), 30);
  }

  function addCustomOption(event) {
    event.preventDefault();
    const name = normalizeText(els.customName.value, 24);
    els.customError.textContent = '';

    if (!name) {
      els.customError.textContent = '总得写点什么，哪怕只是一家店的名字。';
      return;
    }
    if (isNonOption(name)) {
      els.customError.textContent = '「随便」不是一道菜。试试写：火锅、面、或者楼下那家。';
      return;
    }
    if (store.customOptions.some((option) => option.name === name)) {
      els.customError.textContent = '这个已经在你的转盘里了。';
      return;
    }

    const price = Number(els.customPrice.value);
    const distance = Number(els.customDistance.value);
    const option = {
      id: `custom-${uid()}`,
      name,
      mark: Array.from(name)[0],
      tone: TONE_KEYS[store.customOptions.length % TONE_KEYS.length],
      cuisine: '自定义',
      price: Number.isFinite(price) ? Math.max(0, Math.min(999, price)) : 50,
      distance: Number.isFinite(distance) ? Math.max(0, Math.min(120, distance)) : 10,
      queue: 0,
      meals: ['breakfast', 'lunch', 'tea', 'dinner', 'late'],
      tags: ['solo', 'fast', 'comfort'],
      custom: true,
      desc: '你亲手放进来的选项。既然已经想到它，就别再为难自己。',
      mapQuery: name
    };

    store.addCustom(option);
    closeDialog(els.addDialog);
    accepted = false;
    round += 1;
    buildPool();
    toast(`「${name}」已放进转盘。`);
  }

  function copyResult() {
    if (!currentResult) return;
    copyText(`${shareText(currentResult.option, prefs)}\n${location.origin}/#solo`)
      .then((ok) => toast(ok ? '文案已复制，发到群里吧。' : '复制失败，请手动选择文字。', { error: !ok }));
  }

  async function saveTicket() {
    if (!currentResult) return;
    els.ticketBtn.disabled = true;
    const span = els.ticketBtn.querySelector('span');
    if (span) span.textContent = '生成中…';
    try {
      await saveMealTicket({
        option: currentResult.option,
        ticketNo: currentResult.ticketNo,
        meal: currentResult.meal,
        prefs: currentResult.prefs,
        mode: currentResult.mode
      });
      toast('饭票已保存。');
    } catch (error) {
      console.error(error);
      toast('饭票没生成出来，再试一次。', { error: true });
    } finally {
      els.ticketBtn.disabled = false;
      if (span) span.textContent = '保存饭票';
    }
  }

  function handleKeydown(event) {
    if (event.code !== 'Space' || event.repeat) return;
    if (els.view.hidden || document.querySelector('dialog[open]')) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select, button, [contenteditable="true"]')) {
      return;
    }
    event.preventDefault();
    spin();
  }

  function bindEvents() {
    els.spinBtn.addEventListener('click', spin);
    els.wheelCenter.addEventListener('click', spin);
    els.shuffleBtn.addEventListener('click', shuffle);
    els.resetPrefs.addEventListener('click', resetPrefs);
    els.addOptionBtn.addEventListener('click', openAddDialog);
    els.customForm.addEventListener('submit', addCustomOption);
    els.customName.addEventListener('input', () => {
      els.customError.textContent = '';
    });

    els.brief.addEventListener('click', (event) => {
      const button = event.target.closest('[data-pref]');
      if (!button) return;
      setPref(button.dataset.pref, button.dataset.value);
    });

    els.resultCloseX.addEventListener('click', closeResult);
    els.resultCloseBtn.addEventListener('click', closeResult);
    els.acceptedCloseBtn.addEventListener('click', closeResult);
    els.acceptBtn.addEventListener('click', acceptResult);
    els.againBtn.addEventListener('click', rerollFromResult);
    els.ticketBtn.addEventListener('click', saveTicket);
    els.copyResultBtn.addEventListener('click', copyResult);

    els.resultDialog.addEventListener('close', () => {
      if (currentResult?.accepted) {
        els.stageQuote.textContent = `“${currentResult.option.name}，就它了。”`;
      } else {
        wheel.highlight(null);
        els.stageQuote.textContent = '“指针停在哪，就吃哪个。”';
      }
      updateAvoidNote();
    });

    document.addEventListener('keydown', handleKeydown);
  }

  function init() {
    syncPrefsUI();
    updateTimeContext();
    buildPool();
    bindEvents();
    clockTimer = window.setInterval(() => updateTimeContext({ rebuildOnMealChange: true }), 30000);
    return () => window.clearInterval(clockTimer);
  }

  function refresh() {
    prefs = { ...DEFAULT_PREFS, ...store.prefs };
    syncPrefsUI();
    updateTimeContext();
    updateAvoidNote();
    if (!spinning) buildPool();
  }

  return {
    init,
    refresh,
    show: refresh,
    spin
  };
}

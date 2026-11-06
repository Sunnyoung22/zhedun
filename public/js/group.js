/** 饭局：建房、加入、投票、否决、SSE 同步与最终裁决。 */

import { TONES } from './data.js';
import {
  formatMoney,
  getMealPeriod,
  isNonOption,
  makeTicketNumber,
  mapSearchUrl,
  normalizeText
} from './engine.js';
import {
  $,
  avatarColors,
  copyText,
  escapeHtml,
  initialOf,
  sessionGet,
  sessionRemove,
  sessionSet,
  setButtonLoading,
  toast,
  uid
} from './ui.js';
import { saveMealTicket } from './share.js';

// GitHub Pages 版由构建脚本注入该标记。静态托管没有 Node API，
// 因此饭局入口会切换成一段说明，而不是向不存在的 /api 发请求。
const STATIC_ONLY = window.__ZHEDUN_STATIC__ === true;

const PHASE_META = {

  lobby: {
    kicker: 'LOBBY / 01',
    title: '先往桌上放点吃的',
    desc: '每人加一个选项。别写「随便」，这里只收具体的店或菜。',
    step: '01 / 03'
  },
  voting: {
    kicker: 'VOTING / 02',
    title: '想吃就说，不想吃就否决',
    desc: '每人一票「想吃」、一票「绝对不行」。被否决的选项直接出局，剩下的按人气加权，交给命运。',
    step: '02 / 03'
  },
  result: {
    kicker: 'DECIDED / 03',
    title: '这顿，定了',
    desc: '转盘停了就开饭，不翻旧账。',
    step: '03 / 03'
  }
};

const SUGGESTIONS = [
  '潮汕牛肉火锅',
  '炭火烧烤',
  '寿司拼盘',
  '兰州牛肉面',
  '川味小炒',
  '沙拉能量碗',
  '东北饺子',
  '港式茶餐厅'
];

const identityKey = (code) => `zhedun.room.${code}`;
const savedKey = (code) => `zhedun.group.saved.${code}`;

function readIdentity(code) {
  const value = sessionGet(identityKey(code), null);
  return value && typeof value.playerId === 'string' ? value : null;
}

export function createGroup({ store, openAbout }) {
  const els = {
    view: $('#view-group'),
    entry: $('#groupEntry'),
    roomShell: $('#groupRoom'),
    createForm: $('#createRoomForm'),
    createName: $('#createName'),
    createTitle: $('#createTitle'),
    joinForm: $('#joinRoomForm'),
    joinCode: $('#joinCode'),
    joinName: $('#joinName'),
    roomTitle: $('#roomTitle'),
    roomMeta: $('#roomMeta'),
    playerCount: $('#playerCount'),
    playerList: $('#playerList'),
    phaseKicker: $('#phaseKicker'),
    phaseTitle: $('#phaseTitle'),
    phaseDesc: $('#phaseDesc'),
    phaseStep: $('#phaseStep'),
    optionCount: $('#optionCount'),
    roomOptions: $('#roomOptions'),
    roomActions: $('#roomActions'),
    roomGrid: $('.room-grid', $('#groupRoom')),
    roomCodeBtn: $('#roomCodeBtn'),
    copyLinkBtn: $('#copyLinkBtn'),
    roomConn: $('#roomConn'),
    leaveRoomBtn: $('#leaveRoomBtn'),
    toggleAddOption: $('#toggleAddOption'),
    addForm: $('#roomAddOptionForm'),
    addInput: $('#roomOptionName'),
    addCancel: $('#cancelAddOption'),
    suggestions: $('#roomSuggestions'),
    groupResult: $('#groupResult'),
    groupAboutBtn: $('#groupAboutBtn')
  };

  let room = null;
  let activeCode = '';
  let playerId = '';
  let eventSource = null;
  let pollTimer = 0;
  let streamErrors = 0;
  let busy = false;
  let restoring = false;
  let promptedCode = '';

  function api(path, { method = 'GET', body, signal } = {}) {
    return fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal
    }).then(async (response) => {
      let data = null;
      try {
        data = await response.json();
      } catch {
        // 保留空数据，交给状态码处理。
      }
      if (!response.ok) {
        const error = new Error(data?.error || `请求失败（${response.status}）`);
        error.status = response.status;
        throw error;
      }
      return data;
    });
  }

  function setConn(state, label) {
    if (!els.roomConn) return;
    els.roomConn.className = `room-conn${state ? ` is-${state}` : ''}`;
    els.roomConn.innerHTML = `<i></i>${escapeHtml(label)}`;
  }

  function setRoomUrl(code) {
    const nextHash = code ? `#group/${code}` : '#group';
    if (location.hash !== nextHash) {
      history.replaceState(null, '', nextHash);
    }
  }

  function showEntry(prefillCode = '') {
    if (!els.view) return;
    els.view.classList.remove('in-room');
    els.entry.hidden = false;
    els.roomShell.hidden = true;
    els.groupResult.hidden = true;
    if (prefillCode) {
      els.joinCode.value = prefillCode.toUpperCase();
      if (promptedCode !== prefillCode) {
        promptedCode = prefillCode;
        toast(`输入名字，加入房间 ${prefillCode.toUpperCase()}。`);
      }
    }
  }

  function showRoomShell() {
    els.view.classList.add('in-room');
    els.entry.hidden = true;
    els.roomShell.hidden = false;
  }

  function showStaticNotice() {
    if (!els.view) return;
    els.view.classList.add('is-static');
    els.view.classList.remove('in-room');
    els.entry.hidden = true;
    els.roomShell.hidden = true;
    els.groupResult.hidden = true;

    let notice = document.getElementById('staticGroupNotice');
    if (!notice) {
      notice = document.createElement('section');
      notice.id = 'staticGroupNotice';
      notice.className = 'static-notice';
      notice.innerHTML = `
        <div class="static-notice-card">
          <p class="eyebrow"><i class="live-dot"></i>STATIC EDITION · GITHUB PAGES</p>
          <h1 class="static-title">GitHub Pages<br><span>只装得下一个人吃饭。</span></h1>
          <p class="static-lede">一人食、结果饭票、地图找店和饭历都正常。联机饭局需要运行项目里的 Node 服务——静态托管没有 API 和 SSE。</p>
          <div class="static-grid">
            <div><span>在 Pages 上可用</span><p>五选一转盘、结果饭票、地图找店、饭历、设计手记。</p></div>
            <div><span>需要 Node 服务</span><p>房间码、多人投票、否决权、实时同步、房主移交。</p></div>
          </div>
          <div class="static-command"><code>npm start</code><span>然后打开 http://localhost:4173 体验完整版</span></div>
          <div class="static-actions">
            <a class="btn btn-primary" href="#solo" data-route="solo">先去摇一顿</a>
            <a class="text-btn" href="#history" data-route="history">看看饭历</a>
          </div>
        </div>
      `;
      els.view.append(notice);
    }
    notice.hidden = false;
  }

  function closeStream() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    window.clearInterval(pollTimer);
    pollTimer = 0;
    streamErrors = 0;
  }

  function detachRoom() {
    closeStream();
    room = null;
    activeCode = '';
    playerId = '';
    setConn('offline', '未连接');
    els.view?.classList.remove('in-room');
    if (els.roomShell) els.roomShell.hidden = true;
    if (els.entry) els.entry.hidden = false;
  }

  function enterRoom(nextRoom, nextPlayerId) {
    room = nextRoom;
    activeCode = nextRoom.code;
    playerId = nextPlayerId;
    sessionSet(identityKey(activeCode), { playerId });
    setRoomUrl(activeCode);
    showRoomShell();
    render();
    connectStream();
    if (room.phase === 'result') saveGroupResult();
    requestAnimationFrame(() => {
      els.view.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  async function restoreRoom(code, storedPlayerId) {
    if (restoring) return;
    restoring = true;
    setConn('connecting', '载入中');
    try {
      const data = await api(`/api/rooms/${encodeURIComponent(code)}?playerId=${encodeURIComponent(storedPlayerId)}`);
      if (!data.room?.you) throw new Error('你已经不在这个房间里了。');
      enterRoom(data.room, storedPlayerId);
    } catch (error) {
      sessionRemove(identityKey(code));
      activeCode = '';
      room = null;
      playerId = '';
      showEntry(code);
      toast(error.message || '房间不在了。', { error: true });
    } finally {
      restoring = false;
    }
  }

  function connectStream() {
    closeStream();
    if (!room || !playerId) return;
    if (!window.EventSource) {
      startPolling();
      return;
    }
    setConn('connecting', '连接中');
    try {
      const es = new EventSource(
        `/api/rooms/${encodeURIComponent(activeCode)}/events?playerId=${encodeURIComponent(playerId)}`
      );
      eventSource = es;
      es.onopen = () => {
        streamErrors = 0;
        setConn('online', '已同步');
      };
      es.onerror = () => {
        setConn('offline', '重连中');
        streamErrors += 1;
        if (streamErrors === 3) {
          refreshRoom().catch(() => {});
        }
      };
      es.addEventListener('room', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.code) applyRoom(data);
        } catch {
          // 忽略损坏的事件。
        }
      });
    } catch {
      startPolling();
    }
  }

  function startPolling() {
    window.clearInterval(pollTimer);
    setConn('offline', '轮询同步');
    pollTimer = window.setInterval(() => {
      refreshRoom().catch(() => {});
    }, 4000);
  }

  async function refreshRoom() {
    if (!activeCode || !playerId) return;
    try {
      const data = await api(
        `/api/rooms/${encodeURIComponent(activeCode)}?playerId=${encodeURIComponent(playerId)}`
      );
      applyRoom(data.room);
      setConn('online', '已同步');
    } catch (error) {
      if (error.status === 404 || error.status === 403) {
        const code = activeCode;
        sessionRemove(identityKey(code));
        detachRoom();
        showEntry(code);
        toast(error.message || '房间不在了。', { error: true });
      }
      throw error;
    }
  }

  function applyRoom(nextRoom) {
    if (!nextRoom) return;
    const previousPhase = room?.phase;
    room = nextRoom;
    render();
    if (room.phase === 'result' && room.result) {
      if (previousPhase !== 'result') {
        saveGroupResult();
      }
    }
  }

  function render() {
    if (!room) return;
    const meta = PHASE_META[room.phase] || PHASE_META.lobby;
    const me = room.you;
    const isHost = Boolean(me?.isHost);

    els.roomTitle.textContent = room.title;
    els.roomCodeBtn.textContent = room.code;
    els.roomCodeBtn.title = `复制房间码 ${room.code}`;
    els.roomMeta.textContent = `第 ${room.round} 轮 · ${room.stats.playerCount} 人 · ${room.stats.optionCount} 个选项`;
    els.playerCount.textContent = String(room.stats.playerCount);
    els.optionCount.textContent = `${room.stats.optionCount} 个`;
    els.phaseKicker.textContent = meta.kicker;
    els.phaseTitle.textContent = meta.title;
    els.phaseDesc.textContent = meta.desc;
    els.phaseStep.textContent = meta.step;

    renderPlayers();
    renderOptions();
    renderActions();

    const isResult = room.phase === 'result';
    if (els.roomGrid) els.roomGrid.hidden = isResult;
    els.groupResult.hidden = !isResult;
    if (isResult) renderResult();
  }

  function renderPlayers() {
    if (!room) return;
    els.playerList.innerHTML = room.players.map((player) => {
      const [bg, fg] = avatarColors(player.name);
      const badges = [];
      if (player.isHost) badges.push('<span class="player-badge">房主</span>');
      if (player.isYou) badges.push('<span class="player-badge">你</span>');
      const stateClass = player.hasActed && room.phase !== 'lobby'
        ? 'is-ready'
        : player.connected ? 'is-online' : '';
      const stateTitle = player.hasActed && room.phase !== 'lobby'
        ? '已表态'
        : player.connected ? '在线' : '离线';
      return `
        <div class="player-item" title="${escapeHtml(stateTitle)}">
          <span class="player-avatar" style="--avatar-bg:${bg};--avatar-fg:${fg}">${escapeHtml(initialOf(player.name))}</span>
          <span class="player-name">${escapeHtml(player.name)}</span>
          ${badges.join('')}
          <span class="player-state ${stateClass}" title="${escapeHtml(stateTitle)}"></span>
        </div>
      `;
    }).join('');
  }

  function renderOptions() {
    if (!room) return;
    if (room.options.length === 0) {
      els.roomOptions.innerHTML = `
        <div class="room-empty">
          <strong>桌上还是空的</strong>
          先放一个具体的选项。别写「随便」。
        </div>
      `;
      return;
    }

    const maxVotes = Math.max(1, ...room.options.map((option) => option.votes || 0));
    const myVote = room.myVote || {};
    const canVote = room.phase === 'voting';
    const isHost = Boolean(room.you?.isHost);
    const viewerId = room.you?.id || '';

    els.roomOptions.innerHTML = room.options.map((option) => {
      const tone = TONES[option.tone] || TONES.tomato;
      const voted = myVote.optionId === option.id;
      const vetoed = myVote.vetoId === option.id;
      const metaBits = [];
      if (option.price != null) metaBits.push(formatMoney(option.price));
      if (option.distance != null) metaBits.push(`步行 ${option.distance} 分钟`);
      metaBits.push(`${option.votes || 0} 票想吃`);
      if (option.vetoes) metaBits.push(`${option.vetoes} 票否决`);
      const width = Math.round(((option.votes || 0) / maxVotes) * 100);
      const addedBy = option.addedBy ? `${option.addedBy} 放的` : '';
      const canDelete = room.options.length > 1
        && room.phase !== 'result'
        && (isHost || option.addedById === viewerId);
      const actions = canVote ? `
        <div class="option-actions">
          <button type="button" class="vote-btn${voted ? ' is-on' : ''}" data-action="vote" data-option-id="${escapeHtml(option.id)}" aria-pressed="${voted}" title="投一票想吃">
            想吃 <span>${option.votes || 0}</span>
          </button>
          <button type="button" class="veto-btn${vetoed ? ' is-on' : ''}" data-action="veto" data-option-id="${escapeHtml(option.id)}" aria-pressed="${vetoed}" title="否决这个选项">
            ${vetoed ? '已否决' : '不行'}
          </button>
        </div>
      ` : '';

      return `
        <article class="option-card${voted ? ' is-voted' : ''}${vetoed ? ' is-vetoed' : ''}" data-card-id="${escapeHtml(option.id)}">
          <div class="option-mark" style="--mark-bg:${tone.bg};--mark-fg:${tone.fg}">${escapeHtml(option.mark || '饭')}</div>
          <div class="option-main">
            <div class="option-title-line">
              <h4>${escapeHtml(option.name)}</h4>
              ${addedBy ? `<span class="added-by">${escapeHtml(addedBy)}</span>` : ''}
              ${canDelete ? `<button type="button" class="option-remove" data-action="remove" data-option-id="${escapeHtml(option.id)}" title="从桌上移除" aria-label="从桌上移除${escapeHtml(option.name)}">移除</button>` : ''}
            </div>
            <p class="option-meta">${metaBits.map(escapeHtml).join('<span class="dot"></span>')}</p>
            ${canVote ? `<div class="vote-bar" aria-hidden="true"><span style="width:${width}%"></span></div>` : ''}
          </div>
          ${actions}
        </article>
      `;
    }).join('');
  }

  function renderActions() {
    if (!room) return;
    const isHost = Boolean(room.you?.isHost);
    const options = room.stats.optionCount;
    const acted = room.stats.actingPlayers;
    const total = room.stats.playerCount;

    if (room.phase === 'lobby') {
      const copy = options < 2
        ? '先往桌上放两个选项，才值得纠结。'
        : isHost
          ? '人齐了吗？开始后每个人可以投一票、否决一个。'
          : '桌上的菜在变多。等房主开始表态。';
      els.roomActions.innerHTML = `
        <p class="room-actions-copy">${copy}</p>
        ${isHost
          ? `<button type="button" class="btn btn-primary" data-room-action="start" ${options < 2 ? 'disabled' : ''}>开始表态</button>`
          : '<span class="room-actions-copy">等房主开始。</span>'}
      `;
      return;
    }

    if (room.phase === 'voting') {
      const remaining = Math.max(0, total - acted);
      const delegate = Boolean(room.myVote?.delegate);
      const copy = remaining > 0
        ? `已表态 <b>${acted}/${total}</b> · 还有 ${remaining} 人没表态，将视为「听大家的」。`
        : `已表态 <b>${acted}/${total}</b> · 所有人都表态了。`;
      els.roomActions.innerHTML = `
        <p class="room-actions-copy">${copy}</p>
        <div class="room-action-buttons">
          <button type="button" class="btn btn-quiet${delegate ? ' is-selected' : ''}" data-room-action="delegate" aria-pressed="${delegate}">
            ${delegate ? '取消「听大家的」' : '我都行，听大家的'}
          </button>
          ${isHost
            ? `<button type="button" class="btn btn-primary" data-room-action="draw" ${options < 1 ? 'disabled' : ''}>交给命运</button>`
            : '<span class="room-actions-copy">等房主开转。</span>'}
        </div>
      `;
      return;
    }

    els.roomActions.innerHTML = '';
  }

  function renderResult() {
    if (!room?.result?.option) {
      els.groupResult.innerHTML = '';
      return;
    }
    const result = room.result;
    const option = result.option;
    const tone = TONES[option.tone] || TONES.tomato;
    const isHost = Boolean(room.you?.isHost);
    const votes = result.votes?.[option.id] || 0;
    const vetoes = result.vetoes?.[option.id] || 0;

    els.groupResult.innerHTML = `
      <div class="group-result-inner">
        <p class="eyebrow">THE TABLE HAS DECIDED · 第 ${result.round} 轮</p>
        <div class="result-mark" style="--mark-bg:${tone.bg};--mark-fg:${tone.fg}">${escapeHtml(option.mark || '饭')}</div>
        <h2>这顿，定了。</h2>
        <p class="result-name">${escapeHtml(option.name)}</p>
        <p class="result-reason">${escapeHtml(option.desc || '转盘已经停了。现在，去吃饭。')}</p>
        <div class="group-result-stats">
          <span class="result-stat">${votes} 票想吃</span>
          <span class="result-stat">${vetoes} 票否决</span>
          <span class="result-stat">${room.stats.playerCount} 人饭局</span>
          ${result.allVetoed ? '<span class="result-stat">全员否决 · 命运兜底</span>' : ''}
        </div>
        <div class="group-result-actions">
          ${isHost ? '<button type="button" class="btn btn-cream" data-group-result="again">再来一轮</button>' : ''}
          <a class="btn btn-quiet" href="${escapeHtml(mapSearchUrl(option))}" target="_blank" rel="noopener">地图找店</a>
          <button type="button" class="btn btn-quiet" data-group-result="copy">复制结果</button>
          <button type="button" class="btn btn-quiet" data-group-result="ticket">保存饭票</button>
        </div>
        <p class="group-result-note">
          ${isHost ? '房主可以再开一轮。' : '等房主决定下一轮。'} · 未表态的人被视为「听大家的」。
        </p>
      </div>
    `;
  }

  function saveGroupResult() {
    if (!room?.result?.option) return;
    const result = room.result;
    const already = store.history.some(
      (entry) => entry.roomCode === activeCode && Number(entry.round) === Number(result.round)
    );
    if (already) return;
    const lastSaved = Number(sessionGet(savedKey(activeCode), 0)) || 0;
    if (lastSaved >= Number(result.round)) return;

    const option = result.option;
    const votes = result.votes?.[option.id] || 0;
    const vetoes = result.vetoes?.[option.id] || 0;
    const entry = {
      id: uid(),
      optionId: option.id,
      name: option.name,
      mark: option.mark || Array.from(option.name)[0] || '饭',
      tone: option.tone || 'tomato',
      price: option.price ?? null,
      distance: option.distance ?? null,
      cuisine: option.cuisine || '自定义',
      desc: option.desc || '',
      at: new Date(result.drawAt || Date.now()).toISOString(),
      meal: getMealPeriod(new Date(result.drawAt || Date.now())),
      people: room.stats.playerCount,
      mode: 'group',
      spins: 1,
      reason: `${votes} 票想吃 · ${vetoes} 票否决 · 房间 ${activeCode}`,
      roomCode: activeCode,
      round: result.round
    };
    sessionSet(savedKey(activeCode), result.round);
    store.commit(entry);
    toast('饭局结果已记入饭历。');
  }

  async function postAction(action, body = {}, button = null, loadingLabel = '处理中…') {
    if (busy || !activeCode || !playerId) return;
    busy = true;
    if (button) setButtonLoading(button, true, loadingLabel);
    try {
      const data = await api(`/api/rooms/${encodeURIComponent(activeCode)}/${action}`, {
        method: 'POST',
        body: { playerId, ...body }
      });
      if (data?.room) applyRoom(data.room);
    } catch (error) {
      toast(error.message || '操作失败了，再试一次。', { error: true });
    } finally {
      busy = false;
      if (button) setButtonLoading(button, false);
    }
  }

  function handleOptionAction(event) {
    if (!room || room.phase === 'result' || busy) return;
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const optionId = button.dataset.optionId;

    if (action === 'remove') {
      const option = room.options.find((entry) => entry.id === optionId);
      if (!option) return;
      if (option.votes || option.vetoes) {
        const ok = window.confirm(`「${option.name}」已有 ${option.votes || 0} 票想吃、${option.vetoes || 0} 票否决，确定移除？`);
        if (!ok) return;
      }
      postAction('remove-option', { optionId }, button, '移除中…');
      return;
    }

    if (room.phase !== 'voting') return;
    const current = room.myVote || {};
    const next = {
      optionId: current.optionId || null,
      vetoId: current.vetoId || null,
      delegate: false
    };

    if (action === 'vote') {
      if (next.optionId === optionId) next.optionId = null;
      else {
        next.optionId = optionId;
        if (next.vetoId === optionId) next.vetoId = null;
      }
    } else if (action === 'veto') {
      if (next.vetoId === optionId) next.vetoId = null;
      else {
        next.vetoId = optionId;
        if (next.optionId === optionId) next.optionId = null;
      }
    }
    postAction('vote', next, button, action === 'vote' ? '记下…' : '记下…');
  }

  function handleRoomAction(event) {
    const button = event.target.closest('[data-room-action]');
    if (!button || !room) return;
    const action = button.dataset.roomAction;

    if (action === 'start') {
      postAction('start', {}, button, '开始中…');
      return;
    }

    if (action === 'delegate') {
      const next = !room.myVote?.delegate;
      postAction('vote', { delegate: next }, button, '记下…');
      return;
    }

    if (action === 'draw') {
      const remaining = Math.max(0, room.stats.playerCount - room.stats.actingPlayers);
      if (remaining > 0) {
        const ok = window.confirm(`还有 ${remaining} 人没表态，未表态将视为「听大家的」。现在交给命运？`);
        if (!ok) return;
      }
      postAction('draw', {}, button, '开转…');
    }
  }

  async function handleResultAction(event) {
    const button = event.target.closest('[data-group-result]');
    if (!button || !room?.result) return;
    const action = button.dataset.groupResult;

    if (action === 'again') {
      postAction('again', {}, button, '重开…');
      return;
    }

    if (action === 'copy') {
      const option = room.result.option;
      const votes = room.result.votes?.[option.id] || 0;
      const text = [
        `这顿定了：${option.name}`,
        `${votes} 票想吃 · ${room.stats.playerCount} 人饭局 · 房间 ${activeCode}`,
        '—— 来自「这顿」，一个不让你在饭点做选择题的小工具。'
      ].join('\n');
      const ok = await copyText(text);
      toast(ok ? '结果已复制，发到群里吧。' : '复制失败，请手动选择文字。', { error: !ok });
      return;
    }

    if (action === 'ticket') {
      button.disabled = true;
      try {
        await saveMealTicket({
          option: room.result.option,
          ticketNo: makeTicketNumber(new Date(room.result.drawAt || Date.now())),
          meal: getMealPeriod(new Date(room.result.drawAt || Date.now())),
          prefs: { people: room.stats.playerCount },
          mode: 'fate'
        });
        toast('饭票已保存。');
      } catch (error) {
        console.error(error);
        toast('饭票没生成出来，再试一次。', { error: true });
      } finally {
        button.disabled = false;
      }
    }
  }

  async function addOption(rawName, button = null) {
    const name = normalizeText(rawName, 24);
    if (!name) {
      toast('写一个具体的店或菜。');
      return false;
    }
    if (isNonOption(name)) {
      toast('「随便」不是一道菜。写一个具体的选项吧。', { error: true });
      return false;
    }
    if (busy) return false;
    busy = true;
    if (button) setButtonLoading(button, true, '放上桌…');
    try {
      const data = await api(`/api/rooms/${encodeURIComponent(activeCode)}/options`, {
        method: 'POST',
        body: { playerId, name }
      });
      if (data?.room) applyRoom(data.room);
      els.addInput.value = '';
      els.addForm.hidden = true;
      toast(`「${name}」已放上桌。`);
      return true;
    } catch (error) {
      toast(error.message || '没放上去，再试一次。', { error: true });
      return false;
    } finally {
      busy = false;
      if (button) setButtonLoading(button, false);
    }
  }

  function renderSuggestions() {
    els.suggestions.innerHTML = SUGGESTIONS
      .map((name) => `<button type="button" class="suggestion-chip" data-suggestion="${escapeHtml(name)}">＋ ${escapeHtml(name)}</button>`)
      .join('');
  }

  async function leaveRoom() {
    if (!activeCode) return;
    const code = activeCode;
    try {
      await api(`/api/rooms/${encodeURIComponent(code)}/leave`, {
        method: 'POST',
        body: { playerId }
      });
    } catch {
      // 本地仍然退出；服务端会在房间过期时清理。
    }
    sessionRemove(identityKey(code));
    closeStream();
    room = null;
    activeCode = '';
    playerId = '';
    setRoomUrl('');
    showEntry();
    toast('已离开房间。');
  }

  function bind() {
    els.createForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = normalizeText(els.createName.value, 12);
      if (!name) {
        els.createName.focus();
        return;
      }
      const button = els.createForm.querySelector('button[type="submit"]');
      setButtonLoading(button, true, '开门中…');
      try {
        const data = await api('/api/rooms', {
          method: 'POST',
          body: { name, title: normalizeText(els.createTitle.value, 20) }
        });
        enterRoom(data.room, data.playerId);
        toast('房间开好了。把邀请链接发进群里。');
      } catch (error) {
        toast(error.message || '房间没开成，再试一次。', { error: true });
      } finally {
        setButtonLoading(button, false);
      }
    });

    els.joinForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const code = normalizeText(els.joinCode.value, 4).toUpperCase();
      const name = normalizeText(els.joinName.value, 12);
      if (code.length !== 4) {
        toast('房间码是四位，例如 A7K2。', { error: true });
        els.joinCode.focus();
        return;
      }
      if (!name) {
        els.joinName.focus();
        return;
      }
      const button = els.joinForm.querySelector('button[type="submit"]');
      setButtonLoading(button, true, '进桌中…');
      try {
        const data = await api(`/api/rooms/${encodeURIComponent(code)}/join`, {
          method: 'POST',
          body: { name }
        });
        enterRoom(data.room, data.playerId);
        toast('入座了。先看看桌上有什么。');
      } catch (error) {
        toast(error.message || '没进去，再试一次。', { error: true });
      } finally {
        setButtonLoading(button, false);
      }
    });

    els.joinCode.addEventListener('input', () => {
      els.joinCode.value = els.joinCode.value
        .toUpperCase()
        .replace(/[^A-Z2-9]/g, '')
        .slice(0, 4);
    });

    els.roomCodeBtn.addEventListener('click', async () => {
      const ok = await copyText(activeCode);
      toast(ok ? `房间码 ${activeCode} 已复制。` : '复制失败。', { error: !ok });
    });

    els.copyLinkBtn.addEventListener('click', async () => {
      const link = `${location.origin}${location.pathname}#group/${activeCode}`;
      const ok = await copyText(link);
      toast(ok ? '邀请链接已复制。' : '复制失败。', { error: !ok });
    });

    els.leaveRoomBtn.addEventListener('click', leaveRoom);
    els.groupAboutBtn?.addEventListener('click', () => openAbout?.());

    els.toggleAddOption.addEventListener('click', () => {
      els.addForm.hidden = !els.addForm.hidden;
      if (!els.addForm.hidden) els.addInput.focus();
    });
    els.addCancel.addEventListener('click', () => {
      els.addForm.hidden = true;
      els.addInput.value = '';
    });
    els.addForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = els.addForm.querySelector('button[type="submit"]');
      await addOption(els.addInput.value, button);
    });
    els.suggestions.addEventListener('click', (event) => {
      const button = event.target.closest('[data-suggestion]');
      if (!button) return;
      addOption(button.dataset.suggestion);
    });
    els.roomOptions.addEventListener('click', handleOptionAction);
    els.roomActions.addEventListener('click', handleRoomAction);
    els.groupResult.addEventListener('click', handleResultAction);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && activeCode) {
        refreshRoom().catch(() => {});
      }
    });
    window.addEventListener('online', () => {
      if (activeCode) connectStream();
    });
    window.addEventListener('offline', () => setConn('offline', '网络离线'));
  }

  function init() {
    renderSuggestions();
    bind();
    if (STATIC_ONLY) {
      showStaticNotice();
    } else {
      showEntry();
    }
  }

  function show({ code } = {}) {
    if (!els.view) return;
    if (STATIC_ONLY) {
      showStaticNotice();
      return;
    }
    const target = String(code || '').toUpperCase();

    if (target) {
      if (room && activeCode === target) {
        showRoomShell();
        return;
      }
      const identity = readIdentity(target);
      if (identity?.playerId) {
        restoreRoom(target, identity.playerId);
        return;
      }
      if (room && activeCode !== target) {
        detachRoom();
      }
      showEntry(target);
      return;
    }

    if (room) {
      showRoomShell();
      return;
    }
    showEntry();
  }

  return {
    init,
    show,
    refresh: () => {
      if (activeCode) refreshRoom().catch(() => {});
    }
  };
}

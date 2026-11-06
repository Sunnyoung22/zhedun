const base = 'http://127.0.0.1:4173';

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const health = await request('/api/health');
assert(health.status === 200 && health.data.ok, 'health failed');

const page = await request('/');
assert(page.status === 200 && String(page.data).includes('这顿'), 'index failed');

const created = await request('/api/rooms', {
  method: 'POST',
  body: { name: '测试甲', title: '冒烟测试' }
});
assert(created.status === 201 && created.data.room.code.length === 4, 'create failed');
const code = created.data.room.code;
const hostId = created.data.playerId;

const invalid = await request(`/api/rooms/${code}/options`, {
  method: 'POST',
  body: { playerId: hostId, name: '随便' }
});
assert(invalid.status === 400, 'non-option should be rejected');

for (const name of ['潮汕牛肉火锅', '兰州牛肉面']) {
  const added = await request(`/api/rooms/${code}/options`, {
    method: 'POST',
    body: { playerId: hostId, name }
  });
  assert(added.status === 200, `add ${name} failed`);
}

const duplicate = await request(`/api/rooms/${code}/options`, {
  method: 'POST',
  body: { playerId: hostId, name: '兰州牛肉面' }
});
assert(duplicate.status === 409, 'duplicate should fail');

const joined = await request(`/api/rooms/${code}/join`, {
  method: 'POST',
  body: { name: '测试乙' }
});
assert(joined.status === 201, 'join failed');
const guestId = joined.data.playerId;

const started = await request(`/api/rooms/${code}/start`, {
  method: 'POST',
  body: { playerId: hostId }
});
assert(started.status === 200 && started.data.room.phase === 'voting', 'start failed');

const room = started.data.room;
const hotpot = room.options.find((option) => option.name === '潮汕牛肉火锅');
const noodles = room.options.find((option) => option.name === '兰州牛肉面');

const hostVote = await request(`/api/rooms/${code}/vote`, {
  method: 'POST',
  body: { playerId: hostId, optionId: hotpot.id, vetoId: null, delegate: false }
});
assert(hostVote.status === 200, 'host vote failed');

const guestVote = await request(`/api/rooms/${code}/vote`, {
  method: 'POST',
  body: { playerId: guestId, optionId: noodles.id, vetoId: hotpot.id, delegate: false }
});
assert(guestVote.status === 200, 'guest vote failed');

const drawn = await request(`/api/rooms/${code}/draw`, {
  method: 'POST',
  body: { playerId: hostId }
});
assert(drawn.status === 200 && drawn.data.room.phase === 'result', 'draw failed');
assert(drawn.data.room.result.option.id === noodles.id, 'vetoed option should not win');

const publicRoom = await request(`/api/rooms/${code}?playerId=${guestId}`);
assert(publicRoom.status === 200 && publicRoom.data.room.you.isYou, 'room query failed');

const again = await request(`/api/rooms/${code}/again`, {
  method: 'POST',
  body: { playerId: hostId }
});
assert(again.status === 200 && again.data.room.phase === 'voting' && again.data.room.round === 2, 'again failed');

const badJoin = await request(`/api/rooms/ZZZZ/join`, {
  method: 'POST',
  body: { name: '无房间' }
});
assert(badJoin.status === 404, 'missing room should 404');

await request(`/api/rooms/${code}/leave`, {
  method: 'POST',
  body: { playerId: guestId }
});
await request(`/api/rooms/${code}/leave`, {
  method: 'POST',
  body: { playerId: hostId }
});

console.log(JSON.stringify({
  ok: true,
  code,
  phases: [started.data.room.phase, drawn.data.room.phase, again.data.room.phase],
  winner: drawn.data.room.result.option.name,
  health: health.data
}, null, 2));

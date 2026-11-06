/**
 * 这顿 · Web 服务
 *
 * 零依赖：静态文件 + 一个内存里的饭局 API + SSE 实时同步。
 * 房间只活在内存里，服务重启即消失；这对一个饭点小工具刚好。
 */

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import os from 'node:os';

import { OPTIONS, TONE_KEYS } from './public/js/data.js';
import { isNonOption, normalizeText, pickGroupWinner } from './public/js/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY = 64 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();
const streams = new Map();

function addSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
  );
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  addSecurityHeaders(res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function apiError(res, status, message) {
  sendJson(res, status, { error: message });
}

function generateCode() {
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function now() {
  return Date.now();
}

function touch(room) {
  room.updatedAt = now();
}

function cleanName(value) {
  return normalizeText(value, 12);
}

function cleanTitle(value) {
  return normalizeText(value, 20) || '这顿';
}

function newPlayer(name) {
  return {
    id: crypto.randomUUID(),
    name,
    joinedAt: now(),
    lastSeen: now(),
    connected: false
  };
}

function roomExpired(room) {
  return now() - room.createdAt > ROOM_TTL_MS;
}

function getRoom(code) {
  const room = rooms.get(code);
  if (!room) return null;
  if (roomExpired(room)) {
    clearHostAwayTimer(room);
    rooms.delete(code);
    closeRoomStreams(code);
    return null;
  }
  return room;
}

function findPlayer(room, playerId) {
  return room.players.find((player) => player.id === playerId) || null;
}

function countsFor(room) {
  const votes = {};
  const vetoes = {};
  for (const option of room.options) {
    votes[option.id] = 0;
    vetoes[option.id] = 0;
  }
  for (const vote of Object.values(room.votes)) {
    if (vote.optionId && votes[vote.optionId] != null) votes[vote.optionId] += 1;
    if (vote.vetoId && vetoes[vote.vetoId] != null) vetoes[vote.vetoId] += 1;
  }
  return { votes, vetoes };
}

function publicRoom(room, viewerId) {
  const { votes, vetoes } = countsFor(room);
  const players = room.players.map((player) => {
    const vote = room.votes[player.id];
    return {
      id: player.id,
      name: player.name,
      isHost: player.id === room.hostId,
      connected: Boolean(player.connected),
      isYou: player.id === viewerId,
      hasActed: Boolean(vote && (vote.optionId || vote.vetoId || vote.delegate))
    };
  });
  const actingPlayers = players.filter((player) => player.hasActed).length;
  const myVote = room.votes[viewerId] || null;
  const me = players.find((player) => player.isYou);

  return {
    code: room.code,
    title: room.title,
    phase: room.phase,
    round: room.round,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    hostId: room.hostId,
    you: me || null,
    options: room.options.map((option) => ({
      ...option,
      votes: votes[option.id] || 0,
      vetoes: vetoes[option.id] || 0
    })),
    players,
    myVote: myVote ? { ...myVote } : null,
    stats: {
      playerCount: players.length,
      connectedCount: players.filter((player) => player.connected).length,
      optionCount: room.options.length,
      actingPlayers,
      allActed: players.length > 0 && actingPlayers === players.length
    },
    result: room.result ? { ...room.result } : null
  };
}

function broadcast(room) {
  const clients = streams.get(room.code);
  if (!clients || clients.size === 0) return;
  for (const client of [...clients]) {
    try {
      client.res.write(`event: room\ndata: ${JSON.stringify(publicRoom(room, client.playerId))}\n\n`);
    } catch {
      // 连接已断，由 close 事件清理。
    }
  }
}

function closeRoomStreams(code) {
  const clients = streams.get(code);
  if (!clients) return;
  for (const client of clients) {
    try { client.res.end(); } catch { /* 忽略。 */ }
  }
  streams.delete(code);
}

function clearHostAwayTimer(room) {
  if (room?.hostAwayTimer) {
    clearTimeout(room.hostAwayTimer);
    room.hostAwayTimer = null;
  }
}

function setPresence(room, playerId, connected) {
  const player = findPlayer(room, playerId);
  if (!player) return;
  player.connected = connected;
  player.lastSeen = now();
  touch(room);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let tooLarge = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      if (tooLarge) return;
      raw += chunk;
      if (raw.length > MAX_BODY) {
        tooLarge = true;
        reject(Object.assign(new Error('请求体太大'), { status: 413 }));
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('请求格式不正确'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function requireRoom(res, code) {
  const room = getRoom(code);
  if (!room) {
    apiError(res, 404, '房间不存在，或已经过期了。');
    return null;
  }
  return room;
}

function requirePlayer(res, room, playerId) {
  const player = findPlayer(room, playerId);
  if (!player) {
    apiError(res, 403, '你不在这个房间里。刷新链接再试一次。');
    return null;
  }
  return player;
}

function requireHost(res, room, player) {
  if (player.id !== room.hostId) {
    apiError(res, 403, '只有房主可以这样做。');
    return false;
  }
  return true;
}

function addRoomOption(room, player, rawName) {
  const name = normalizeText(rawName, 24);
  if (!name) throw Object.assign(new Error('总得写一个具体的店或菜。'), { status: 400 });
  if (isNonOption(name)) {
    throw Object.assign(new Error('「随便」不是一道菜。写一个具体的选项吧。'), { status: 400 });
  }
  if (room.options.some((option) => option.name.toLowerCase() === name.toLowerCase())) {
    throw Object.assign(new Error('这个选项已经在桌上了。'), { status: 409 });
  }
  if (room.options.length >= 12) {
    throw Object.assign(new Error('桌上的选项够多了，先吃吧。'), { status: 409 });
  }

  const template = OPTIONS.find((option) => option.name === name);
  const tone = template?.tone || TONE_KEYS[room.options.length % TONE_KEYS.length];
  const option = {
    id: crypto.randomUUID(),
    name,
    mark: template?.mark || Array.from(name)[0],
    tone,
    price: template?.price ?? null,
    distance: template?.distance ?? null,
    desc: template?.desc || '',
    cuisine: template?.cuisine || '自定义',
    tags: template?.tags ? [...template.tags] : [],
    addedBy: player.name,
    createdAt: now()
  };
  room.options.push(option);
  if (room.phase === 'voting') {
    // 新选项不打断已经投过的票，但所有人重新拥有一次否决的机会。
    for (const vote of Object.values(room.votes)) {
      if (vote.vetoId === option.id) vote.vetoId = null;
    }
  }
  touch(room);
  return option;
}

async function handleRooms(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const code = (parts[2] || '').toUpperCase();

  // 创建房间
  if (!code && req.method === 'POST') {
    const body = await readJson(req);
    const name = cleanName(body.name);
    if (!name) {
      apiError(res, 400, '先告诉我们怎么称呼你。');
      return;
    }
    const host = newPlayer(name);
    const room = {
      code: generateCode(),
      title: cleanTitle(body.title),
      hostId: host.id,
      phase: 'lobby',
      round: 1,
      players: [host],
      options: [],
      votes: {},
      result: null,
      hostAwayTimer: null,
      createdAt: now(),
      updatedAt: now()
    };
    rooms.set(room.code, room);
    sendJson(res, 201, { playerId: host.id, room: publicRoom(room, host.id) });
    return;
  }

  if (!code) {
    apiError(res, 404, '没有找到这个接口。');
    return;
  }

  if (!/^[A-Z2-9]{4}$/.test(code)) {
    apiError(res, 404, '房间码格式不对。');
    return;
  }

  const room = requireRoom(res, code);
  if (!room) return;

  // 实时事件流
  if (parts[3] === 'events' && req.method === 'GET') {
    const playerId = url.searchParams.get('playerId') || '';
    const player = requirePlayer(res, room, playerId);
    if (!player) return;
    openStream(req, res, room, player);
    return;
  }

  // 查询房间
  if (!parts[3] && req.method === 'GET') {
    const playerId = url.searchParams.get('playerId') || '';
    sendJson(res, 200, { room: publicRoom(room, playerId) });
    return;
  }

  const action = parts[3] || '';
  let body = {};
  if (req.method !== 'GET') {
    body = await readJson(req);
  }

  // 加入
  if (action === 'join' && req.method === 'POST') {
    const name = cleanName(body.name);
    if (!name) {
      apiError(res, 400, '先告诉我们怎么称呼你。');
      return;
    }
    if (room.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
      apiError(res, 409, '这个名字已经有人用了，换一个吧。');
      return;
    }
    if (room.players.length >= 24) {
      apiError(res, 409, '这张桌子坐不下了。');
      return;
    }
    const player = newPlayer(name);
    room.players.push(player);
    touch(room);
    broadcast(room);
    sendJson(res, 201, { playerId: player.id, room: publicRoom(room, player.id) });
    return;
  }

  const playerId = String(body.playerId || url.searchParams.get('playerId') || '');
  const player = requirePlayer(res, room, playerId);
  if (!player) return;

  // 加选项
  if (action === 'options' && req.method === 'POST') {
    if (room.phase === 'result') {
      apiError(res, 409, '这轮已经定了，先开下一轮吧。');
      return;
    }
    try {
      addRoomOption(room, player, body.name);
    } catch (error) {
      apiError(res, error.status || 400, error.message);
      return;
    }
    broadcast(room);
    sendJson(res, 200, { room: publicRoom(room, player.id) });
    return;
  }

  // 开始表态
  if (action === 'start' && req.method === 'POST') {
    if (!requireHost(res, room, player)) return;
    if (room.phase !== 'lobby') {
      apiError(res, 409, '饭局已经开始了。');
      return;
    }
    if (room.options.length < 2) {
      apiError(res, 400, '至少要有两个选项，才值得纠结。');
      return;
    }
    room.phase = 'voting';
    room.votes = {};
    room.round = 1;
    touch(room);
    broadcast(room);
    sendJson(res, 200, { room: publicRoom(room, player.id) });
    return;
  }

  // 投票 / 否决 / 听大家的
  if (action === 'vote' && req.method === 'POST') {
    if (room.phase !== 'voting') {
      apiError(res, 409, '现在还不能投票。');
      return;
    }
    const optionIds = new Set(room.options.map((option) => option.id));
    const optionId = body.optionId || null;
    const vetoId = body.vetoId || null;
    const delegate = Boolean(body.delegate);

    if (optionId && !optionIds.has(optionId)) {
      apiError(res, 400, '没有这个选项。');
      return;
    }
    if (vetoId && !optionIds.has(vetoId)) {
      apiError(res, 400, '没有这个否决对象。');
      return;
    }
    if (optionId && vetoId && optionId === vetoId) {
      apiError(res, 400, '不能一边想吃、一边否决。');
      return;
    }

    room.votes[player.id] = delegate
      ? { optionId: null, vetoId: null, delegate: true, updatedAt: now() }
      : { optionId, vetoId, delegate: false, updatedAt: now() };
    touch(room);
    broadcast(room);
    sendJson(res, 200, { room: publicRoom(room, player.id) });
    return;
  }

  // 交给命运
  if (action === 'draw' && req.method === 'POST') {
    if (!requireHost(res, room, player)) return;
    if (room.phase !== 'voting') {
      apiError(res, 409, '现在还不能开转。');
      return;
    }
    const { votes, vetoes } = countsFor(room);
    const outcome = pickGroupWinner(room.options, votes, vetoes);
    if (!outcome.winner) {
      apiError(res, 400, '桌上还没有可以选的选项。');
      return;
    }
    room.phase = 'result';
    room.result = {
      option: { ...outcome.winner },
      optionId: outcome.winner.id,
      votes,
      vetoes,
      allVetoed: outcome.allVetoed,
      round: room.round,
      drawAt: now(),
      drawBy: player.name
    };
    touch(room);
    broadcast(room);
    sendJson(res, 200, { room: publicRoom(room, player.id) });
    return;
  }

  // 再来一轮
  if (action === 'again' && req.method === 'POST') {
    if (!requireHost(res, room, player)) return;
    if (room.phase !== 'result') {
      apiError(res, 409, '还没有结果可以重开。');
      return;
    }
    room.phase = 'voting';
    room.round += 1;
    room.result = null;
    room.votes = {};
    touch(room);
    broadcast(room);
    sendJson(res, 200, { room: publicRoom(room, player.id) });
    return;
  }

  // 离开
  if (action === 'leave' && req.method === 'POST') {
    const index = room.players.findIndex((entry) => entry.id === player.id);
    if (index >= 0) room.players.splice(index, 1);
    delete room.votes[player.id];
    if (room.players.length === 0) {
      clearHostAwayTimer(room);
      rooms.delete(room.code);
      closeRoomStreams(room.code);
    } else {
      if (room.hostId === player.id) {
        clearHostAwayTimer(room);
        room.hostId = room.players[0].id;
      }
      touch(room);
      broadcast(room);
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  apiError(res, 404, '没有找到这个操作。');
}

function openStream(req, res, room, player) {
  addSecurityHeaders(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 2000\n\n');

  if (!streams.has(room.code)) streams.set(room.code, new Set());
  const client = { res, playerId: player.id };
  streams.get(room.code).add(client);

  setPresence(room, player.id, true);
  if (player.id === room.hostId) clearHostAwayTimer(room);
  res.write(`event: room\ndata: ${JSON.stringify(publicRoom(room, player.id))}\n\n`);
  broadcast(room);

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      // 忽略，close 会清理。
    }
  }, 20000);

  const cleanup = () => {
    clearInterval(ping);
    const clients = streams.get(room.code);
    if (clients) {
      clients.delete(client);
      if (clients.size === 0) streams.delete(room.code);
    }
    const stillConnected = streams.get(room.code)
      ? [...streams.get(room.code)].some((entry) => entry.playerId === player.id)
      : false;
    if (!stillConnected) {
      setPresence(room, player.id, false);
      broadcast(room);
      if (player.id === room.hostId && room.players.length > 1) {
        clearHostAwayTimer(room);
        room.hostAwayTimer = setTimeout(() => {
          if (room.hostId !== player.id) return;
          const successor = room.players.find((entry) => entry.id !== player.id && entry.connected)
            || room.players.find((entry) => entry.id !== player.id);
          if (!successor) return;
          room.hostId = successor.id;
          room.hostAwayTimer = null;
          touch(room);
          broadcast(room);
        }, 30000);
        room.hostAwayTimer.unref?.();
      }
    }
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('error', cleanup);
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  let decoded = '/';
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (decoded === '/') decoded = '/index.html';
  if (decoded === '/favicon.ico') {
    res.writeHead(302, { Location: '/assets/icon.svg' });
    res.end();
    return;
  }

  let filePath = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== PUBLIC_DIR) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, 'index.html');
    const content = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const noCache = ['.html', '.css', '.js', '.mjs', '.webmanifest'].includes(ext);
    addSecurityHeaders(res);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': content.length,
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') res.end();
    else res.end(content);
  } catch {
    // 单页应用回退。
    if (!path.extname(decoded)) {
      try {
        const html = await readFile(path.join(PUBLIC_DIR, 'index.html'));
        addSecurityHeaders(res);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': html.length,
          'Cache-Control': 'no-cache'
        });
        if (req.method === 'HEAD') res.end();
        else res.end(html);
        return;
      } catch {
        // 继续 404。
      }
    }
    addSecurityHeaders(res);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 · 没有找到');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) });
      return;
    }
    if (url.pathname === '/api/rooms' || url.pathname.startsWith('/api/rooms/')) {
      await handleRooms(req, res, url);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    if (res.headersSent) {
      try { res.end(); } catch { /* 忽略。 */ }
      return;
    }
    apiError(res, error.status || 500, error.status ? error.message : '服务器有点忙，稍后再试。');
  }
});

server.on('clientError', (error, socket) => {
  if (!socket.writable) return;
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

setInterval(() => {
  const cutoff = now() - ROOM_TTL_MS;
  for (const [code, room] of rooms) {
    if (room.createdAt < cutoff) {
      clearHostAwayTimer(room);
      rooms.delete(code);
      closeRoomStreams(code);
      continue;
    }
    // 所有人离线超过 3 小时，也清掉。
    const everyoneAway = room.players.every((player) => !player.connected);
    if (everyoneAway && room.updatedAt < now() - 3 * 60 * 60 * 1000) {
      clearHostAwayTimer(room);
      rooms.delete(code);
      closeRoomStreams(code);
    }
  }
}, 20 * 60 * 1000).unref();

function lanAddresses() {
  const addresses = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (info.family === 'IPv4' && !info.internal) addresses.push(info.address);
    }
  }
  return [...new Set(addresses)];
}

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  这顿 · THE MEAL, DECIDED');
  console.log('  ─────────────────────────────');
  console.log(`  Local   http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') {
    for (const address of lanAddresses()) {
      console.log(`  LAN     http://${address}:${PORT}`);
    }
  }
  console.log('');
  console.log('  房间保存在内存里，服务重启即清空。');
  console.log('  Ctrl+C 停止。');
  console.log('');
});

function shutdown() {
  console.log('\n正在收盘…');
  for (const clients of streams.values()) {
    for (const client of clients) {
      try { client.res.end(); } catch { /* 忽略。 */ }
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/**
 * 这顿 · 决策引擎
 *
 * 这里只放纯函数，既能被浏览器直接 import，也能被 Node 的 API
 * 服务与测试复用。核心原则：
 *   1. 先做减法（预算、距离、人数、状态）；
 *   2. 只留 3–5 个真正不同的选择；
 *   3. 最后交给加权随机，降低“选错”的心理负担。
 */

import { MEALS, OPTIONS, TONES } from './data.js';

export const DEFAULT_PREFS = Object.freeze({
  people: 2,
  budget: 60,
  mood: 'any',
  distance: 15,
  avoidRecent: true
});

const NON_OPTION_RE =
  /^(随便|随便吧|随便点|随便吃点|都行|都行吧|都可以|都可以吧|无所谓|不知道|你定|你看着办|听你的|啥都行|什么都行|random|anything)[\s!！。,.，?？~～]*$/i;

export function getMealPeriod(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 10.5) return 'breakfast';
  if (hour >= 10.5 && hour < 14.5) return 'lunch';
  if (hour >= 14.5 && hour < 17.5) return 'tea';
  if (hour >= 17.5 && hour < 21.5) return 'dinner';
  return 'late';
}

export function getMealMeta(meal = 'dinner') {
  return MEALS[meal] || MEALS.dinner;
}

export function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

export function formatWeekday(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(date);
}

export function formatDateCN(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric'
  }).format(date);
}

export function formatTimeCN(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

export function relativeDayLabel(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((start - target) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  return formatDateCN(date);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeText(value, maxLength = 24) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function isNonOption(value) {
  return NON_OPTION_RE.test(normalizeText(value, 32));
}

export function getTone(key) {
  return TONES[key] || TONES.tomato;
}

export function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `¥${number % 1 === 0 ? number : number.toFixed(1)}`;
}

export function personLabel(people) {
  if (people <= 1) return '一个人';
  if (people === 2) return '两个人';
  if (people <= 4) return '三四个人';
  return '一群人';
}

/**
 * 给单个选项打分。硬性排除只在“完全不合理”时发生：
 * 错餐段、一个人却只适合多人、价格/距离超过可接受上限。
 */
export function scoreOption(option, prefs = DEFAULT_PREFS, context = {}) {
  const { meal = getMealPeriod(), recentIds = [] } = context;
  const tags = new Set(option.tags || []);
  const people = Number(prefs.people) || 2;
  const budget = Number(prefs.budget) || 60;
  const distance = Number(prefs.distance) || 15;
  const price = Number(option.price) || 0;
  const walk = Number(option.distance) || 0;
  const queue = Number(option.queue) || 0;

  if (!option.custom && !option.meals?.includes(meal)) {
    // 下午茶时段允许用“轻一点”的午餐选项兜底，但不喧宾夺主。
    if (!(meal === 'tea' && (tags.has('light') || tags.has('sweet')))) {
      return -Infinity;
    }
  }

  if (!option.custom && people === 1 && option.groupOnly) {
    return -Infinity;
  }

  if (!option.custom && budget < 999 && price > budget * 1.35) {
    return -Infinity;
  }

  if (!option.custom && distance < 30 && walk > Math.max(distance * 1.8, distance + 12)) {
    return -Infinity;
  }

  let score = 50;

  // 预算：越接近上限越“值得”，但超支会明显扣分。
  if (option.custom) {
    score += 3;
  } else if (price <= budget) {
    score += 8 - Math.abs(budget - price) * 0.035;
  } else {
    score -= 10 + (price - budget) * 0.45;
  }

  // 距离与排队：决策成本也是成本。
  score -= walk * 0.42;
  score -= queue * 0.28;

  if (walk <= 6) score += 5;
  if (queue <= 5) score += 3;

  // 人数匹配。
  if (people === 1) {
    if (tags.has('solo')) score += 8;
    if (tags.has('fast')) score += 4;
    if (tags.has('share') || tags.has('group')) score -= 6;
  } else if (people === 2) {
    if (tags.has('share')) score += 3;
    if (tags.has('solo')) score += 1;
  } else {
    if (tags.has('group')) score += 8;
    if (tags.has('share')) score += 5;
    if (tags.has('solo')) score -= 3;
    if (tags.has('slow')) score += 2;
  }

  // 今天想要什么。
  if (prefs.mood === 'warm' && tags.has('warm')) score += 10;
  if (prefs.mood === 'light' && (tags.has('light') || tags.has('healthy'))) score += 10;
  if (prefs.mood === 'spicy' && tags.has('spicy')) score += 11;
  if (prefs.mood === 'any') {
    if (tags.has('fast') && walk <= 10) score += 4;
    if (tags.has('comfort')) score += 2;
  }

  // 餐段的小偏好。
  if (meal === 'breakfast' && tags.has('breakfast')) score += 5;
  if (meal === 'late' && tags.has('late')) score += 5;
  if (meal === 'tea' && tags.has('light')) score += 4;

  // 最近吃过：软约束，避免连续两顿一样。
  if (prefs.avoidRecent && recentIds.includes(option.id)) {
    score -= 24;
  }

  return score;
}

/**
 * 生成一轮候选。先做餐段硬过滤，再用分数与轻微随机抖动排序，
 * 并尽量保证菜系、色块不重复，避免五个选项看起来像一家店。
 */
export function buildShortlist({
  options = OPTIONS,
  prefs = DEFAULT_PREFS,
  meal = getMealPeriod(),
  recentIds = [],
  count = 5,
  excludeIds = [],
  rng = Math.random
} = {}) {
  const scored = options
    .map((option) => ({
      option,
      score: scoreOption(option, prefs, { meal, recentIds }),
      jitter: rng() * 7
    }))
    .filter((item) => Number.isFinite(item.score) && !excludeIds.includes(item.option.id))
    .sort((a, b) => b.score + b.jitter - (a.score + a.jitter));

  const selected = [];
  const cuisines = new Set();
  const tones = new Set();

  const push = (item) => {
    if (!item || selected.some((entry) => entry.option.id === item.option.id)) return;
    selected.push(item);
    cuisines.add(item.option.cuisine);
    tones.add(item.option.tone);
  };

  // 自己亲手加的选项永远优先上盘。用户已经替自己做了决定，
  // 引擎不应该再把它“优化”掉。
  for (const item of scored.filter((entry) => entry.option.custom)) {
    if (selected.length >= count) break;
    push(item);
  }

  // 第一遍：优先不同菜系、不同色块。
  for (const item of scored) {
    if (selected.length >= count) break;
    const sameCuisine = cuisines.has(item.option.cuisine);
    const sameTone = tones.has(item.option.tone);
    if (!sameCuisine && !sameTone) push(item);
  }

  // 第二遍：只避开重复菜系。
  for (const item of scored) {
    if (selected.length >= count) break;
    if (!cuisines.has(item.option.cuisine)) push(item);
  }

  // 第三遍：补满。
  for (const item of scored) {
    if (selected.length >= count) break;
    push(item);
  }

  return selected.map((item) => item.option);
}

/**
 * 无放回加权抽样。权重为 0 的条目不会被选中。
 */
export function pickWeighted(items, weightFn = () => 1, rng = Math.random) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const weighted = items
    .map((item) => ({ item, weight: Math.max(0, Number(weightFn(item)) || 0) }))
    .filter((entry) => entry.weight > 0);
  if (weighted.length === 0) return items[Math.floor(rng() * items.length)] ?? null;
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = rng() * total;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item;
  }
  return weighted[weighted.length - 1].item;
}

/**
 * 饭局最终裁决：被否决的选项直接出局；幸存者按“人气”加权，
 * 但人气只改变概率，不直接钦定，保留一点命运的公平感。
 */
export function pickGroupWinner(options, voteCounts = {}, vetoCounts = {}, rng = Math.random) {
  if (!Array.isArray(options) || options.length === 0) {
    return { winner: null, pool: [], weights: {}, allVetoed: false };
  }

  const survivors = options.filter((option) => !(Number(vetoCounts[option.id]) > 0));
  const pool = survivors.length > 0 ? survivors : options;
  const weights = {};
  for (const option of pool) {
    weights[option.id] = 1 + (Number(voteCounts[option.id]) || 0) * 2;
  }
  const winner = pickWeighted(pool, (option) => weights[option.id], rng);
  return {
    winner,
    pool,
    weights,
    allVetoed: survivors.length === 0
  };
}

export function reasonFor(option, prefs = DEFAULT_PREFS, meal = getMealPeriod()) {
  if (!option) return '';
  if (option.custom) {
    return '你亲手放进来的选项。既然已经想到它，就别再为难自己。';
  }

  const tags = new Set(option.tags || []);
  const bits = [];
  if (option.distance <= 8) bits.push(`步行 ${option.distance} 分钟`);
  else bits.push(`${option.distance} 分钟能到`);
  if (option.price <= prefs.budget) bits.push(`人均 ${formatMoney(option.price)}`);
  else bits.push(`人均 ${formatMoney(option.price)}，略微超预算`);

  if (prefs.mood === 'warm' && tags.has('warm')) bits.push('热乎');
  else if (prefs.mood === 'light' && (tags.has('light') || tags.has('healthy'))) bits.push('清爽');
  else if (prefs.mood === 'spicy' && tags.has('spicy')) bits.push('够味');
  else if (prefs.mood === 'any') bits.push('不用再挑');

  if (option.queue <= 5) bits.push('通常不用排太久');
  else if (option.queue >= 18) bits.push('可能要排队');

  if (prefs.people >= 3 && tags.has('share')) bits.push('适合分着吃');
  if (prefs.people === 1 && tags.has('solo')) bits.push('一个人也不尴尬');

  return bits.slice(0, 3).join(' · ');
}

export function mapSearchUrl(option) {
  const keyword = encodeURIComponent(option?.mapQuery || option?.name || '餐厅');
  return `https://uri.amap.com/search?keyword=${keyword}&callnative=1`;
}

export function shareText(option, prefs = DEFAULT_PREFS) {
  if (!option) return '';
  return [
    `这顿定了：${option.name}`,
    `人均 ${formatMoney(option.price)} · 步行约 ${option.distance} 分钟 · ${personLabel(prefs.people)}`,
    '—— 来自「这顿」，一个不让你在饭点做选择题的小工具。'
  ].join('\n');
}

export function summarizeHistory(entries = []) {
  const valid = entries.filter((entry) => entry && entry.name);
  const total = valid.length;
  const savedMinutes = total * 3;
  const counts = new Map();
  for (const entry of valid) {
    const key = entry.name;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let topName = '';
  let topCount = 0;
  for (const [name, count] of counts) {
    if (count > topCount) {
      topName = name;
      topCount = count;
    }
  }
  const days = new Set(
    valid
      .map((entry) => new Date(entry.at))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`)
  );
  return {
    total,
    savedMinutes,
    topName,
    topCount,
    days: days.size,
    last: valid[0] || null
  };
}

export function makeTicketNumber(date = new Date()) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}-${minute}`;
}

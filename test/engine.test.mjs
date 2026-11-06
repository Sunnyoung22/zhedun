import test from 'node:test';
import assert from 'node:assert/strict';

import { OPTIONS } from '../public/js/data.js';
import {
  DEFAULT_PREFS,
  buildShortlist,
  getMealPeriod,
  isNonOption,
  normalizeText,
  pickGroupWinner,
  pickWeighted,
  scoreOption,
  summarizeHistory
} from '../public/js/engine.js';

test('getMealPeriod 按饭点切换', () => {
  assert.equal(getMealPeriod(new Date(2026, 10, 6, 8, 0)), 'breakfast');
  assert.equal(getMealPeriod(new Date(2026, 10, 6, 12, 0)), 'lunch');
  assert.equal(getMealPeriod(new Date(2026, 10, 6, 16, 0)), 'tea');
  assert.equal(getMealPeriod(new Date(2026, 10, 6, 19, 0)), 'dinner');
  assert.equal(getMealPeriod(new Date(2026, 10, 6, 23, 30)), 'late');
});

test('isNonOption 识别各种“随便”', () => {
  for (const text of ['随便', '随便吧', '都行', '都可以！', '无所谓', '你看着办', '听你的', '随便吃点', ' random ']) {
    assert.equal(isNonOption(text), true, text);
  }
  assert.equal(isNonOption('火锅'), false);
  assert.equal(isNonOption('楼下那家越南粉'), false);
});

test('normalizeText 清理空白与控制字符', () => {
  assert.equal(normalizeText('  楼下\u0000那家   越南粉  ', 24), '楼下那家 越南粉');
  assert.equal(normalizeText('abcdef', 3), 'abc');
});

test('一个人不会得到只适合多人的选项', () => {
  const hotpot = OPTIONS.find((option) => option.id === 'chaoshan-hotpot');
  assert.ok(hotpot);
  const score = scoreOption(hotpot, { ...DEFAULT_PREFS, people: 1 }, { meal: 'dinner' });
  assert.equal(score, -Infinity);
});

test('预算和餐段是硬约束', () => {
  const teppanyaki = OPTIONS.find((option) => option.id === 'teppanyaki');
  const congee = OPTIONS.find((option) => option.id === 'congee');
  assert.equal(scoreOption(teppanyaki, { ...DEFAULT_PREFS, budget: 30 }, { meal: 'dinner' }), -Infinity);
  assert.equal(scoreOption(congee, DEFAULT_PREFS, { meal: 'lunch' }), -Infinity);
});

test('buildShortlist 返回五个不重复、尽量不同菜系的选项', () => {
  const result = buildShortlist({
    options: OPTIONS,
    prefs: DEFAULT_PREFS,
    meal: 'dinner',
    rng: () => 0.5
  });
  assert.equal(result.length, 5);
  assert.equal(new Set(result.map((option) => option.id)).size, 5);
  assert.ok(result.every((option) => option.meals.includes('dinner')));
});

test('自定义选项优先上盘', () => {
  const custom = {
    id: 'custom-test',
    name: '我的秘密食堂',
    mark: '秘',
    tone: 'plum',
    cuisine: '自定义',
    price: 50,
    distance: 10,
    meals: ['dinner'],
    tags: ['solo'],
    custom: true
  };
  const result = buildShortlist({
    options: [...OPTIONS, custom],
    prefs: DEFAULT_PREFS,
    meal: 'dinner',
    rng: () => 0.5
  });
  assert.ok(result.some((option) => option.id === custom.id));
});

test('pickWeighted 遵守权重并处理空池', () => {
  const items = ['a', 'b', 'c'];
  assert.equal(pickWeighted(items, (item) => (item === 'b' ? 1 : 0), () => 0.99), 'b');
  assert.equal(pickWeighted([], () => 1, () => 0.5), null);
});

test('饭局：被否决的选项出局', () => {
  const options = [
    { id: 'a', name: '火锅' },
    { id: 'b', name: '面馆' }
  ];
  const outcome = pickGroupWinner(options, { a: 10, b: 1 }, { a: 1, b: 0 }, () => 0.1);
  assert.equal(outcome.winner.id, 'b');
  assert.equal(outcome.allVetoed, false);
});

test('饭局：全员否决时由命运兜底', () => {
  const options = [
    { id: 'a', name: '火锅' },
    { id: 'b', name: '面馆' }
  ];
  const outcome = pickGroupWinner(options, { a: 10, b: 1 }, { a: 1, b: 1 }, () => 0.1);
  assert.equal(outcome.allVetoed, true);
  assert.ok(['a', 'b'].includes(outcome.winner.id));
});

test('summarizeHistory 统计顿数、最常吃和省下的时间', () => {
  const entries = [
    { name: '牛肉面', at: '2026-11-06T12:00:00.000Z' },
    { name: '牛肉面', at: '2026-11-05T12:00:00.000Z' },
    { name: '火锅', at: '2026-11-04T12:00:00.000Z' }
  ];
  const stats = summarizeHistory(entries);
  assert.equal(stats.total, 3);
  assert.equal(stats.topName, '牛肉面');
  assert.equal(stats.topCount, 2);
  assert.equal(stats.savedMinutes, 9);
  assert.equal(stats.days, 3);
});

/** 把结果做成一张可以保存、转发的饭票（Canvas）。 */

import { TONES } from './data.js';
import { formatMoney, getMealMeta, personLabel } from './engine.js';

const WIDTH = 1080;
const HEIGHT = 1350;
const SERIF = '"Noto Serif SC", "Songti SC", "STSong", "SimSun", serif';
const SANS = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const MONO = '"Cascadia Mono", "SFMono-Regular", Consolas, monospace';

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth, maxLines = 4) {
  const chars = Array.from(String(text || ''));
  const lines = [];
  let line = '';
  for (const char of chars) {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = char;
      if (lines.length >= maxLines) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function drawDotTexture(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(30,26,20,.055)';
  for (let index = 0; index < 900; index += 1) {
    const x = Math.random() * WIDTH;
    const y = Math.random() * HEIGHT;
    const size = Math.random() * 1.6 + 0.3;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

function drawBarcode(ctx, x, y, width, height) {
  ctx.save();
  ctx.fillStyle = '#1E1A14';
  let cursor = x;
  while (cursor < x + width) {
    const bar = Math.random() > 0.5 ? 3 : 1.5;
    ctx.fillRect(cursor, y, bar, height);
    cursor += bar + 2.5 + Math.random() * 3.5;
  }
  ctx.restore();
}

export async function createMealTicketBlob({
  option,
  ticketNo = '0000',
  meal = 'dinner',
  prefs = { people: 2 },
  mode = 'fate'
}) {
  if (!option) throw new Error('缺少结果');
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* 字体不可用时继续。 */ }
  }

  const tone = TONES[option.tone] || TONES.tomato;
  const meta = getMealMeta(meal);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');

  // 纸张底色与一层非常轻的暖色渐变。
  ctx.fillStyle = '#F3EBDD';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(WIDTH * 0.82, HEIGHT * 0.08, 20, WIDTH * 0.82, HEIGHT * 0.08, 700);
  glow.addColorStop(0, 'rgba(231,176,74,.18)');
  glow.addColorStop(1, 'rgba(231,176,74,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawDotTexture(ctx);

  // 外框。
  ctx.strokeStyle = 'rgba(30,26,20,.28)';
  ctx.lineWidth = 2;
  roundRect(ctx, 38, 38, WIDTH - 76, HEIGHT - 76, 28);
  ctx.stroke();

  // 顶部品牌。
  ctx.fillStyle = tone.bg;
  roundRect(ctx, 74, 78, 66, 66, 16);
  ctx.fill();
  ctx.fillStyle = tone.fg;
  ctx.font = `700 36px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText('顿', 107, 124);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#1E1A14';
  ctx.font = `700 36px ${SERIF}`;
  ctx.fillText('这顿', 158, 112);
  ctx.fillStyle = '#7B6E5D';
  ctx.font = `600 12px ${MONO}`;
  ctx.fillText('THE MEAL, DECIDED', 159, 130);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#9B8D79';
  ctx.font = `600 13px ${MONO}`;
  ctx.fillText(`NO. ${ticketNo}`, WIDTH - 76, 106);
  ctx.fillText('MEAL TICKET / 01', WIDTH - 76, 128);

  // 主标题。
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7B6E5D';
  ctx.font = `600 15px ${MONO}`;
  ctx.fillText(`${meta.en} · ${String(personLabel(prefs.people)).toUpperCase()}`, 76, 228);

  ctx.fillStyle = '#1E1A14';
  ctx.font = `700 72px ${SERIF}`;
  ctx.fillText(mode === 'fate' ? '命运说，' : '你选的，', 72, 316);
  ctx.fillText(mode === 'fate' ? '就它了。' : '也可以。', 72, 397);

  // 结果印章。
  const mark = option.mark || Array.from(option.name || '饭')[0];
  ctx.fillStyle = tone.bg;
  ctx.beginPath();
  ctx.arc(870, 306, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(870, 306, 92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = tone.fg;
  ctx.textAlign = 'center';
  ctx.font = `700 96px ${SERIF}`;
  ctx.fillText(mark, 870, 341);

  // 菜名。
  ctx.textAlign = 'left';
  ctx.fillStyle = tone.ink || tone.bg;
  ctx.font = `700 58px ${SERIF}`;
  const nameLines = wrapText(ctx, option.name, 750, 2);
  nameLines.forEach((line, index) => {
    ctx.fillText(line, 74, 493 + index * 68);
  });

  const nameBottom = 493 + (nameLines.length - 1) * 68;

  // 描述。
  ctx.fillStyle = '#5D5244';
  ctx.font = `400 25px ${SANS}`;
  const descLines = wrapText(ctx, option.desc || '这一顿，先吃了再说。', 860, 3);
  descLines.forEach((line, index) => {
    ctx.fillText(line, 76, nameBottom + 58 + index * 39);
  });

  // 标签。
  let tagX = 76;
  const tagY = nameBottom + 80 + descLines.length * 39;
  ctx.font = `500 17px ${SANS}`;
  for (const tag of (option.tags || []).slice(0, 4)) {
    const labels = {
      warm: '热乎', soup: '带汤', noodle: '面', fast: '快', solo: '一人友好',
      meaty: '有肉', veg: '有菜', spicy: '辣', light: '清爽', healthy: '轻负担',
      share: '适合分享', group: '适合多人', slow: '慢慢吃', comfort: '舒服',
      fish: '鱼', grill: '烤', cheesy: '芝士', baked: '烤', handheld: '拿着吃',
      breakfast: '早餐', late: '夜宵', mild: '温和', strong: '重口',
      'all-day': '全天', emergency: '救急', festive: '有仪式感'
    };
    const label = labels[tag];
    if (!label) continue;
    const width = ctx.measureText(label).width + 30;
    ctx.strokeStyle = 'rgba(30,26,20,.22)';
    ctx.lineWidth = 1;
    roundRect(ctx, tagX, tagY - 22, width, 34, 7);
    ctx.stroke();
    ctx.fillStyle = '#6B5E4E';
    ctx.fillText(label, tagX + 15, tagY + 1);
    tagX += width + 9;
  }

  // 理由。
  const reasonY = tagY + 62;
  ctx.strokeStyle = 'rgba(30,26,20,.18)';
  ctx.setLineDash([7, 8]);
  ctx.beginPath();
  ctx.moveTo(76, reasonY);
  ctx.lineTo(WIDTH - 76, reasonY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#9B8D79';
  ctx.font = `600 12px ${MONO}`;
  ctx.fillText('WHY THIS ONE / 为什么是它', 76, reasonY + 32);

  const reason = option.custom
    ? '你亲手放进来的选项。既然已经想到它，就别再为难自己。'
    : `${formatMoney(option.price)} · 步行约 ${option.distance} 分钟 · ${Array.from(option.tags || []).includes('warm') ? '热乎，适合现在' : '够近，够快，适合现在'}`;
  ctx.fillStyle = '#3D352B';
  ctx.font = `500 21px ${SANS}`;
  wrapText(ctx, reason, 880, 2).forEach((line, index) => {
    ctx.fillText(line, 76, reasonY + 66 + index * 32);
  });

  // 底部票根。
  const stubY = 1112;
  ctx.strokeStyle = 'rgba(30,26,20,.3)';
  ctx.setLineDash([10, 9]);
  ctx.beginPath();
  ctx.moveTo(58, stubY);
  ctx.lineTo(WIDTH - 58, stubY);
  ctx.stroke();
  ctx.setLineDash([]);

  // 票根两侧的半圆缺口。
  ctx.fillStyle = '#F3EBDD';
  ctx.beginPath();
  ctx.arc(38, stubY, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(WIDTH - 38, stubY, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,26,20,.28)';
  ctx.beginPath();
  ctx.arc(38, stubY, 26, Math.PI * 1.5, Math.PI * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(WIDTH - 38, stubY, 26, Math.PI * 0.5, Math.PI * 1.5);
  ctx.stroke();

  drawBarcode(ctx, 76, 1160, 220, 54);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#7B6E5D';
  ctx.font = `600 14px ${MONO}`;
  ctx.fillText(mode === 'fate' ? 'FATE, SERVED.' : 'YOU, DECIDED.', WIDTH - 76, 1174);
  ctx.fillStyle = '#9B8D79';
  ctx.font = `500 13px ${SANS}`;
  ctx.fillText('这顿 · 一个不让你在饭点做选择题的小工具', WIDTH - 76, 1204);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#9B8D79';
  ctx.font = `600 11px ${MONO}`;
  ctx.fillText('NO REFUNDS. NO REGRETS.', 76, 1244);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('饭票导出失败'));
    }, 'image/png');
  });
}

export async function saveMealTicket(payload) {
  const blob = await createMealTicketBlob(payload);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = String(payload.option?.name || '这顿').replace(/[\\/:*?"<>|]/g, '');
  anchor.href = url;
  anchor.download = `这顿-${safeName}.png`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return blob;
}

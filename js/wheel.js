/**
 * 转盘：用 SVG 画出扇区，再用 CSS transform 旋转整个盘面。
 * 选中的扇区中心会停在正上方，因此它的文字最终是水平的。
 */

import { getTone } from './engine.js';
import { prefersReducedMotion, wait } from './ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function polar(radius, angleDegrees) {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: Math.cos(radians) * radius,
    y: Math.sin(radians) * radius
  };
}

function sectorPath(startAngle, endAngle, radius = 98) {
  const start = polar(radius, startAngle);
  const end = polar(radius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    'M 0 0',
    `L ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
    'Z'
  ].join(' ');
}

function svgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

export class Wheel {
  constructor(root, { onSettle } = {}) {
    this.root = root;
    this.onSettle = onSettle;
    this.options = [];
    this.rotation = 0;
    this.spinning = false;
    this.svg = null;
    this.sectors = [];
  }

  setOptions(options = []) {
    this.options = options.slice();
    this.render();
  }

  render() {
    if (!this.root) return;
    this.root.replaceChildren();
    this.sectors = [];

    const svg = svgElement('svg', {
      viewBox: '-100 -100 200 200',
      class: 'wheel-svg',
      'aria-hidden': 'true',
      focusable: 'false'
    });
    svg.append(svgElement('circle', { cx: 0, cy: 0, r: 100, fill: '#191610' }));

    const count = this.options.length;
    if (count === 0) {
      this.root.append(svg);
      this.svg = svg;
      return;
    }

    const segment = 360 / count;
    const radius = 98;

    this.options.forEach((option, index) => {
      const tone = getTone(option.tone);
      const start = -90 + index * segment;
      const end = start + segment;
      const mid = start + segment / 2;
      const group = svgElement('g', {
        class: 'wheel-sector',
        'data-option-id': option.id || `option-${index}`,
        'data-index': index
      });

      const path = svgElement('path', {
        d: sectorPath(start, end, radius),
        fill: tone.bg,
        stroke: 'rgba(25,22,16,.28)',
        'stroke-width': '0.7'
      });
      group.append(path);

      const labelRadius = count >= 6 ? 62 : 64;
      const position = polar(labelRadius, mid);
      const label = svgElement('g', {
        transform: `translate(${position.x.toFixed(2)} ${position.y.toFixed(2)}) rotate(${mid.toFixed(2)})`
      });

      const title = svgElement('title');
      title.textContent = option.name || '这一顿';
      group.append(title);

      const mark = svgElement('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        class: 'wheel-mark',
        fill: tone.fg
      });
      mark.textContent = option.mark || Array.from(option.name || '饭')[0];
      label.append(mark);
      group.append(label);
      svg.append(group);
      this.sectors.push(group);
    });

    // 扇区之间的细线，让切分更利落。
    for (let index = 0; index < count; index += 1) {
      const angle = -90 + index * segment;
      const edge = polar(radius - 0.5, angle);
      svg.append(svgElement('line', {
        x1: 0,
        y1: 0,
        x2: edge.x.toFixed(2),
        y2: edge.y.toFixed(2),
        stroke: 'rgba(255,247,232,.14)',
        'stroke-width': '0.55'
      }));
    }

    svg.append(svgElement('circle', {
      cx: 0,
      cy: 0,
      r: 97.8,
      fill: 'none',
      stroke: 'rgba(255,247,232,.24)',
      'stroke-width': '0.8'
    }));
    svg.append(svgElement('circle', {
      cx: 0,
      cy: 0,
      r: 25,
      fill: '#231F18',
      stroke: 'rgba(255,247,232,.12)',
      'stroke-width': '0.8'
    }));

    this.root.append(svg);
    this.svg = svg;

    // 重置到一个轻微偏移的角度，避免初始画面过于机械。
    this.rotation = 0;
    this.root.style.transition = 'none';
    this.root.style.transform = 'rotate(0deg)';
  }

  highlight(optionId) {
    for (const sector of this.sectors) {
      const active = sector.getAttribute('data-option-id') === optionId;
      sector.classList.toggle('is-lit', Boolean(optionId) && active);
      sector.classList.toggle('is-dim', Boolean(optionId) && !active);
    }
  }

  async spinTo(option, { duration } = {}) {
    if (!option || this.spinning || this.options.length === 0) return null;
    const index = this.options.findIndex((item) => item.id === option.id);
    if (index < 0) return null;

    this.spinning = true;
    const count = this.options.length;
    const segment = 360 / count;
    const mid = index * segment + segment / 2;
    const currentNormalized = ((this.rotation % 360) + 360) % 360;
    const targetNormalized = (360 - mid) % 360;
    const delta = (targetNormalized - currentNormalized + 360) % 360;
    const reduced = prefersReducedMotion();
    const turns = reduced ? 1 : 5 + Math.floor(Math.random() * 2);
    const targetRotation = this.rotation + turns * 360 + delta;
    const spinDuration = duration ?? (reduced ? 500 : 4100);

    this.rotation = targetRotation;
    this.root.classList.add('is-spinning');
    // 先把当前角度固定住，强制一次重排，再开始过渡。
    // 不依赖 requestAnimationFrame：无头浏览器或后台标签页里它可能被节流。
    this.root.style.transition = 'none';
    this.root.style.transform = `rotate(${currentNormalized}deg)`;
    void this.root.offsetWidth;
    this.root.style.transition = `transform ${spinDuration}ms cubic-bezier(.12,.72,.12,1)`;
    this.root.style.transform = `rotate(${targetRotation}deg)`;

    await wait(spinDuration + 90);
    this.root.classList.remove('is-spinning');
    this.spinning = false;
    this.onSettle?.(option);
    return option;
  }
}

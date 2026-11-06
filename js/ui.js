/** 共享 UI 小工具：不依赖任何框架。 */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return character;
    }
  });
}

export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

const TOAST_LIMIT = 2800;
let toastTimer = 0;

export function toast(message, { error = false, duration = TOAST_LIMIT } = {}) {
  const element = $('#toast');
  if (!element) return;
  window.clearTimeout(toastTimer);
  element.textContent = message;
  element.classList.toggle('is-error', error);
  element.classList.remove('is-visible');
  // 强制一次重排，让连续 toast 也能重新播放进入动画。
  void element.offsetWidth;
  element.classList.add('is-visible');
  toastTimer = window.setTimeout(() => {
    element.classList.remove('is-visible');
  }, duration);
}

export async function copyText(text) {
  const value = String(text ?? '');
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // 回退到 execCommand。
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.append(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

export function openDialog(target) {
  const dialog = typeof target === 'string' ? document.getElementById(target) : target;
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

export function closeDialog(target) {
  const dialog = typeof target === 'string' ? document.getElementById(target) : target;
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
  }
}

export function burstConfetti(container, {
  colors = ['#D94E35', '#E7B04A', '#687550', '#FFF7E8', '#385A66'],
  count = 46
} = {}) {
  if (!container || prefersReducedMotion()) return;
  container.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < count; index += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty('--fall-duration', `${1.7 + Math.random() * 1.7}s`);
    piece.style.setProperty('--fall-delay', `${Math.random() * 0.45}s`);
    piece.style.setProperty('--drift', `${-120 + Math.random() * 240}px`);
    piece.style.setProperty('--spin', `${360 + Math.random() * 900}deg`);
    piece.style.width = `${4 + Math.random() * 6}px`;
    piece.style.height = `${7 + Math.random() * 9}px`;
    fragment.append(piece);
  }
  container.append(fragment);
  window.setTimeout(() => container.replaceChildren(), 3800);
}

export function debounce(fn, delay = 160) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

export function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 忽略隐私模式下的存储错误。
  }
}

export function sessionGet(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function sessionSet(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function sessionRemove(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // 忽略。
  }
}

export function initialOf(name) {
  const chars = Array.from(String(name || '').trim());
  return chars[0] || '饭';
}

const AVATAR_COLORS = [
  ['#D94E35', '#FFF7E8'],
  ['#687550', '#FFF8E9'],
  ['#385A66', '#F8F0DF'],
  ['#E7B04A', '#2A2115'],
  ['#7A4B49', '#FFF6E7'],
  ['#332E26', '#FFF6E7']
];

export function avatarColors(name) {
  const text = String(name || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function setButtonLoading(button, loading, label = '处理中') {
  if (!button) return;
  if (loading) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span>${escapeHtml(label)}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

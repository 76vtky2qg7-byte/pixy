/** Tiny DOM helpers. Enough structure to keep screens readable, no framework. */

type Attrs = Record<string, string | number | boolean | undefined | null>;
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Attrs = {}, ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k === 'style') node.setAttribute('style', String(v));
    else if (k.startsWith('data-') || k.startsWith('aria-')) node.setAttribute(k, String(v));
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/**
 * A button that fires once per activation.
 *
 * Buttons here spend currency and grant rewards, so a fast double tap must not
 * run the handler twice. The button disables itself for the duration of the
 * handler — including an async one — and re-enables only afterwards.
 */
export function button(
  label: string | Node,
  onClick: () => void | Promise<void>,
  opts: { class?: string; disabled?: boolean; title?: string } = {},
): HTMLButtonElement {
  const b = el('button', {
    class: `btn ${opts.class ?? ''}`.trim(),
    type: 'button',
    disabled: opts.disabled,
    title: opts.title,
  });
  if (typeof label === 'string') b.textContent = label;
  else b.append(label);

  let busy = false;
  b.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy || b.disabled) return;
    busy = true;
    const wasDisabled = b.disabled;
    b.disabled = true;
    try {
      await onClick();
    } finally {
      busy = false;
      // Do not re-enable a button the handler itself intentionally disabled,
      // and do nothing at all if the handler removed it from the document.
      if (b.isConnected && !wasDisabled && b.dataset.keepDisabled !== '1') b.disabled = false;
    }
  });
  return b;
}

export const clear = (node: Element): void => { node.replaceChildren(); };

/** Sprite-sheet icon frame; `cols` is the sheet's column count. */
export function iconEl(frame: number, cols = 7, cls = ''): HTMLElement {
  const i = el('i', { class: `ico ${cls}`.trim(), 'aria-hidden': 'true' });
  const col = frame % cols;
  const row = Math.floor(frame / cols);
  // Background size is set in CSS at 2x; positions follow the same scale.
  i.style.backgroundPosition = `${-col * 40}px ${-row * 40}px`;
  if (cls.includes('sm')) i.style.backgroundPosition = `${-col * 24}px ${-row * 24}px`;
  return i;
}

/** Icon sized for a panel cell (44px frames). */
export function cellIconEl(frame: number, cols = 7): HTMLElement {
  const i = el('i', { class: 'ico', 'aria-hidden': 'true' });
  const col = frame % cols;
  const row = Math.floor(frame / cols);
  i.style.backgroundPosition = `${-col * 44}px ${-row * 44}px`;
  i.style.backgroundSize = '308px 88px';
  return i;
}

export const currency = (kind: 'scrap' | 'credit' | 'hp'): HTMLElement =>
  el('i', { class: `cur ${kind}`, 'aria-hidden': 'true' });

export function priceTag(amount: number, kind: 'scrap' | 'credit', affordable = true): HTMLElement {
  return el('span', { class: `price ${affordable ? '' : 'cant'}`.trim() },
    currency(kind), String(amount));
}

/** Screen scaffold: fixed header, scrolling body, fixed footer. */
export function screen(opts: {
  title?: string;
  onBack?: () => void;
  backLabel?: string;
  headExtra?: Node[];
  overlay?: boolean;
}): { root: HTMLElement; head: HTMLElement; body: HTMLElement; foot: HTMLElement } {
  const head = el('div', { class: 'screen-head' });
  if (opts.onBack) head.append(button(opts.backLabel ?? '‹', opts.onBack, { class: 'ghost sm' }));
  if (opts.title) head.append(el('h1', { text: opts.title }));
  head.append(el('div', { class: 'spacer' }));
  for (const n of opts.headExtra ?? []) head.append(n);

  const body = el('div', { class: 'screen-body' });
  const foot = el('div', { class: 'screen-foot' });
  const root = el('div', { class: `screen ${opts.overlay ? 'overlay' : ''}`.trim() }, head, body, foot);
  return { root, head, body, foot };
}

/** Transient message. Reuses one node so messages cannot stack up. */
let toastNode: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string, ms = 1900): void {
  const root = document.getElementById('ui-root');
  if (!root) return;
  // The node is dropped whenever a screen change clears #ui-root, so a stale
  // reference must be replaced rather than reused invisibly.
  if (toastNode && !toastNode.isConnected) toastNode = null;
  if (!toastNode) {
    toastNode = el('div', { class: 'toast' });
    root.append(toastNode);
  }
  toastNode.textContent = message;
  toastNode.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode?.classList.remove('show'), ms);
}

export function clearToast(): void {
  if (toastTimer) clearTimeout(toastTimer);
  toastNode?.classList.remove('show');
}

/** Modal confirm. Resolves false on backdrop tap, so it is always escapable. */
export function confirmDialog(
  message: string, confirmLabel: string, cancelLabel: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const root = document.getElementById('ui-root')!;
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      wrap.remove();
      resolve(v);
    };
    const card = el('div', { class: 'card', style: 'max-width:min(420px,92vw);margin:auto;' },
      el('p', { text: message, style: 'margin:0 0 14px;font-size:15px;line-height:1.4' }),
      el('div', { class: 'row', style: 'gap:8px' },
        button(cancelLabel, () => finish(false), { class: 'ghost' }),
        button(confirmLabel, () => finish(true), { class: 'primary' }),
      ),
    );
    const wrap = el('div', {
      class: 'screen overlay',
      style: 'z-index:90;justify-content:center;align-items:center',
    }, card);
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) finish(false); });
    root.append(wrap);
  });
}

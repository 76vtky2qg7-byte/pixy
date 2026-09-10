import { audio } from '../../audio/audio';
import type { AppContext } from '../app';
import { button, confirmDialog, el, screen } from '../dom';
import { defaultSave } from '../../save/schema';
import { setLang, t, type Lang } from '../i18n';

const VERSION = __APP_VERSION__;

/** Settings. Every change is applied live and written immediately. */
export function mountSettings(ctx: AppContext): () => void {
  const { app, save, ui } = ctx;

  const s = screen({
    title: t('settings'),
    // Coming from a paused wave, back must return to the wave, not the menu.
    onBack: () => app.show(app.run && app.world ? 'game' : 'menu'),
  });

  const body = el('div', { class: 'col', style: 'max-width:520px;width:100%;margin:0 auto' });

  /* ---- language ---- */
  body.append(setting(t('language'), segmented(
    [['ru', 'Русский'], ['en', 'English']],
    save.get().settings.lang,
    (v) => {
      save.update((d) => { d.settings.lang = v as Lang; });
      setLang(v as Lang);
      audio.play('select');
      // Rebuild so every label picks up the new language immediately.
      app.show('settings');
    },
  )));

  /* ---- volumes ---- */
  body.append(setting(t('music'), slider(save.get().settings.music, (v) => {
    save.update((d) => { d.settings.music = v; });
    audio.setVolumes(v, save.get().settings.sfx);
  })));

  body.append(setting(t('soundEffects'), slider(save.get().settings.sfx, (v) => {
    save.update((d) => { d.settings.sfx = v; });
    audio.setVolumes(save.get().settings.music, v);
    audio.play('select');
  })));

  /* ---- accessibility / comfort ---- */
  body.append(setting(t('screenShake'), toggle(save.get().settings.screenShake, (v) => {
    save.update((d) => { d.settings.screenShake = v; });
    app.scene.setOptions({ screenShake: v });
  })));

  body.append(setting(t('showDamage'), toggle(save.get().settings.showDamage, (v) => {
    save.update((d) => { d.settings.showDamage = v; });
    app.scene.setOptions({ showDamage: v });
  })));

  body.append(setting(t('stickSide'), segmented(
    [['left', t('stickLeft')], ['right', t('stickRight')]],
    save.get().settings.stickSide,
    (v) => {
      save.update((d) => { d.settings.stickSide = v as 'left' | 'right'; });
      app.input.setStickSide(v as 'left' | 'right');
    },
  )));

  /* ---- danger zone ---- */
  body.append(el('div', { style: 'height:16px' }));
  body.append(button(t('resetProgress'), async () => {
    const ok = await confirmDialog(t('resetConfirm'), t('confirm'), t('cancel'));
    if (!ok) return;
    const lang = save.get().settings.lang;
    save.update((d) => {
      const fresh = defaultSave(lang);
      d.progress = fresh.progress;
      d.activeRun = null;
      d.finishedContracts = 0;
      d.lastInterstitialAt = 0;
    });
    app.abandonRun();
    app.show('menu');
  }, { class: 'danger wide' }));

  body.append(el('div', {
    class: 'muted tiny',
    style: 'text-align:center;margin-top:14px',
    text: `${t('version')} ${VERSION} · ${app.platform.info.name}`,
  }));

  s.body.append(body);
  ui.append(s.root);
  return () => s.root.remove();
}

/* ---------------- widgets ---------------- */

function setting(label: string, control: Node): HTMLElement {
  return el('div', { class: 'setting' }, el('label', { text: label }), control as HTMLElement);
}

function segmented(
  options: [string, string][], value: string, onChange: (v: string) => void,
): HTMLElement {
  const wrap = el('div', { class: 'seg', role: 'radiogroup' });
  for (const [v, label] of options) {
    const b = el('button', {
      type: 'button', class: v === value ? 'on' : '', role: 'radio',
      'aria-checked': String(v === value), text: label,
    });
    b.addEventListener('click', () => onChange(v));
    wrap.append(b);
  }
  return wrap;
}

function slider(value: number, onInput: (v: number) => void): HTMLElement {
  const input = el('input', {
    type: 'range', min: '0', max: '1', step: '0.05', value: String(value),
    'aria-label': 'volume',
  });
  input.addEventListener('input', () => onInput(Number(input.value)));
  return input;
}

function toggle(value: boolean, onChange: (v: boolean) => void): HTMLElement {
  let cur = value;
  const wrap = segmented([['on', t('on')], ['off', t('off')]], cur ? 'on' : 'off', (v) => {
    cur = v === 'on';
    onChange(cur);
    // Repaint the segment states in place.
    for (const b of Array.from(wrap.querySelectorAll('button'))) {
      const on = (b.textContent === t('on')) === cur;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
  });
  return wrap;
}

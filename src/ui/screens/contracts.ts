import { CONTRACTS, contractEffects, type ContractDef } from '../../config/contracts';
import { ROBOTS, ROBOT_IDS, type RobotId } from '../../config/robots';
import type { AppContext } from '../app';
import { button, currency, el, screen, toast } from '../dom';
import { t, tk, type StringKey } from '../i18n';

/** Contract picker plus frame picker. Both choices are made on one screen so
 *  starting a run is two taps, not two screens. */
export function mountContracts(ctx: AppContext): () => void {
  const { app, save, ui } = ctx;
  const d = save.get();

  let chosenContract: string | null = null;
  let chosenRobot: RobotId = d.progress.unlockedRobots.includes('volt9') ? 'scrap14' : 'scrap14';

  const s = screen({
    title: t('chooseContract'),
    onBack: () => app.show('menu'),
    headExtra: [el('span', { class: 'pill arc' }, currency('credit'), String(d.progress.credits))],
  });

  const contractList = el('div', { class: 'col' });
  const robotList = el('div', { class: 'col' });
  const startBtn = button(t('startContract'), () => {
    if (!chosenContract) { toast(t('chooseContract')); return; }
    app.startRun(chosenContract, chosenRobot);
  }, { class: 'primary wide', disabled: true });

  function isUnlocked(c: ContractDef): boolean {
    return !c.requires || d.progress.wonContracts.includes(c.requires);
  }

  function renderContracts(): void {
    contractList.replaceChildren();
    for (const c of CONTRACTS) {
      const unlocked = isUnlocked(c);
      const eff = contractEffects(c);
      const best = d.progress.bestWave[c.id] ?? 0;
      const won = d.progress.wonContracts.includes(c.id);

      const card = el('div', {
        class: `card ${chosenContract === c.id ? 'sel' : ''} ${unlocked ? '' : 'locked'}`.trim(),
        role: 'button',
        tabindex: unlocked ? '0' : '-1',
      });

      card.append(
        el('div', { class: 'row' },
          el('h2', { text: tk('contract', c.id), style: 'flex:1' }),
          won ? el('span', { class: 'pill', text: '✔' }) : null,
          el('span', { class: 'pill', text: '★'.repeat(c.tier + 1) }),
        ),
        el('div', { class: 'muted tiny', text: tk('contract', `${c.id}_desc`) }),
        el('div', { class: 'row', style: 'margin-top:6px;flex-wrap:wrap;gap:6px' },
          el('span', { class: 'pill tiny', text: `${t('arena')}: ${t(`arena_${c.arena}` as StringKey)}` }),
          el('span', { class: 'pill tiny', text: `${t('waves')}: ${c.waves.length}` }),
          best > 0 ? el('span', { class: 'pill tiny', text: `${t('bestResult')}: ${best}` }) : null,
        ),
      );

      // Special terms are stated up front, in one sentence each.
      const rules = el('div', { style: 'margin-top:6px' },
        el('h3', { text: t('contractRules') }),
        c.modifiers.length
          ? el('div', { class: 'tiny', style: 'color:var(--amber-lt)' },
              c.modifiers.map((m) => tk('mod', m.id)).join(' · '))
          : el('div', { class: 'muted tiny', text: t('noRules') }),
      );
      card.append(rules);
      void eff;

      if (!unlocked) {
        card.append(el('div', { class: 'tiny', style: 'color:var(--danger);margin-top:6px', text: `${t('locked')} — ${t('lockedHint')}` }));
      } else {
        const pick = () => { chosenContract = c.id; renderContracts(); startBtn.disabled = false; };
        card.addEventListener('click', pick);
        card.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter') pick();
        });
      }
      contractList.append(card);
    }
  }

  function renderRobots(): void {
    robotList.replaceChildren();
    robotList.append(el('h3', { text: t('chooseRobot') }));
    for (const id of ROBOT_IDS) {
      const def = ROBOTS[id];
      const owned = d.progress.unlockedRobots.includes(id);
      const canAfford = d.progress.credits >= def.unlockCost;

      const card = el('div', {
        class: `card ${chosenRobot === id && owned ? 'sel' : ''} ${owned ? '' : 'locked'}`.trim(),
      });
      card.append(
        el('div', { class: 'row' },
          el('h2', { text: tk('robot', id), style: 'flex:1' }),
          el('span', { class: 'pill tiny' }, currency('hp'), String(def.maxHp)),
        ),
        el('div', { class: 'muted tiny', text: tk('robot', `${id}_desc`) }),
      );

      if (owned) {
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        const pick = () => { chosenRobot = id; renderRobots(); };
        card.addEventListener('click', pick);
        card.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') pick(); });
      } else {
        card.append(el('div', { class: 'row', style: 'margin-top:8px' },
          button(
            `${t('unlockFor')} ${def.unlockCost}`,
            () => {
              const cur = save.get();
              if (cur.progress.credits < def.unlockCost) { toast(t('notEnoughScrap')); return; }
              save.update((x) => {
                // Re-check inside the write: two fast taps must not both pass.
                if (x.progress.credits < def.unlockCost) return;
                if (x.progress.unlockedRobots.includes(id)) return;
                x.progress.credits -= def.unlockCost;
                x.progress.unlockedRobots.push(id);
              });
              app.show('contracts');
            },
            { class: 'primary sm', disabled: !canAfford },
          ),
        ));
      }
      robotList.append(card);
    }
  }

  renderContracts();
  renderRobots();

  // Wide screens put the frame picker beside the contract list instead of
  // below it, so nothing needs scrolling to be found.
  const cols = el('div', { class: 'two-col' }, robotList, contractList);
  s.body.append(cols);
  s.foot.append(startBtn);
  ui.append(s.root);

  return () => s.root.remove();
}

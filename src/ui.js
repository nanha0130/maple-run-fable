// DOM overlay: boot, title + character select, HUD, pause, game over.
import { mapleOutline } from './art.js';
import { ROSTER } from './actors.js';
import * as pinoc from './pinoc.js';

const LEAF_PATH = 'M' + mapleOutline().map(([x, y]) => `${(50 + x * 48).toFixed(1)} ${(58 - y * 48).toFixed(1)}`).join('L') + 'Z';
export const leafSvg = `<svg class="leaf-ico" viewBox="0 0 100 100" aria-hidden="true"><path d="${LEAF_PATH}"/><rect x="48.6" y="62" width="2.8" height="30" rx="1.4"/></svg>`;
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const POWER_LABEL = { wind: ['風', 'WIND RIDE'], magnet: ['寄', 'LEAF MAGNET'], x2: ['倍', 'DOUBLE'], shield: ['守', 'CHARM'] };
const TOUCH = matchMedia('(pointer:coarse)').matches;

export function createUI(root, h) {
  root.innerHTML = `
  <div id="boot"><div class="box">${leafSvg}<h1>MAPLE RUN</h1><p id="boot-msg">Raking the leaves…</p></div></div>
  <section id="title" class="out">
    <header class="brand">
      <div class="seal">紅葉</div>
      <div>
        <h1>MAPLE <span>RUN</span></h1>
        <p class="sub">紅葉ラン · a railway runner in peak maple season</p>
      </div>
    </header>
    <div class="title-bottom">
      <div class="roster" role="listbox" aria-label="Choose your runner">
        ${ROSTER.map((c) => `
        <button class="card" data-id="${c.id}" role="option" aria-label="${c.name}">
          ${c.portrait ? `<img class="pic" src="${c.portrait}" alt="" draggable="false">` : `<span class="pic none">${leafSvg}</span>`}
          <span class="jp">${c.jp}</span>
          <span class="meta"><b>${c.name}</b><small>${c.tag}</small></span>
        </button>`).join('')}
        <button class="card mine" data-id="mine" role="option" aria-label="Run as yourself">
          <span class="pic none" id="mine-pic"><svg class="plus" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="14" r="6.5"/><path d="M7.5 34c1.2-7.6 6-11.5 12.5-11.5S31.3 26.4 32.5 34z"/><path d="M31 4v9M26.5 8.5h9" stroke-linecap="round"/></svg></span>
          <span class="meta"><b>YOU</b><small id="mine-tag">Upload a photo</small></span>
        </button>
      </div>
      <div class="go">
        <div class="best">Best<b id="best">0</b></div>
        <button id="start"><i>出発</i>START</button>
        <div class="keys">${TOUCH ? 'Swipe to switch track, jump and roll' : '<kbd>←</kbd><kbd>→</kbd> track · <kbd>↑</kbd> jump · <kbd>↓</kbd> roll · <kbd>P</kbd> pause · <kbd>M</kbd> mute'}</div>
      </div>
    </div>
  </section>
  <section id="hud" class="out">
    <div class="tools">
      <button id="pause" aria-label="Pause"><svg viewBox="0 0 20 20"><rect x="4" y="3" width="4.4" height="14" rx="1"/><rect x="11.6" y="3" width="4.4" height="14" rx="1"/></svg></button>
      <button id="mute" aria-label="Mute"></button>
    </div>
    <div class="powers" id="powers"></div>
    <div class="score">
      <div class="n" id="score">0</div>
      <div class="row"><span class="lv" id="lv">${leafSvg}<span id="leaves">0</span></span><span class="mult" id="mult">×1</span></div>
    </div>
    <div id="toast"></div>
    <div id="hint" class="out"></div>
  </section>
  <div class="veil" id="paused"><div class="panel"><div class="kicker">一時停止</div><h2>Paused</h2>
    <div class="btns" style="margin-top:20px"><button class="btn pri" id="resume">RESUME</button><button class="btn sec" id="quit">RUNNERS</button></div></div></div>
  <div class="veil" id="over"><div class="panel">
    <div class="kicker" id="over-k"></div><h2 id="over-h"></h2>
    <div class="big" id="over-score">0</div><div class="rec hidden" id="over-rec">NEW BEST</div>
    <div class="stats"><div>Distance<b id="over-dist">0 m</b></div><div>Leaves<b id="over-leaves">0</b></div><div>Best<b id="over-best">0</b></div></div>
    <div class="btns"><button class="btn pri" id="retry">TRY AGAIN</button><button class="btn sec" id="menu">RUNNERS</button></div>
  </div></div>
  <div class="veil" id="make"><div class="panel wide" role="dialog" aria-modal="true" aria-label="Run as yourself">
    <button class="x" id="make-x" aria-label="Close"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button>
    <form id="make-form" autocomplete="off">
      <label class="drop" id="make-drop"><input type="file" class="vh" id="make-file" accept="image/png,image/jpeg,image/webp">
        <img id="make-prev" alt="" hidden><span id="make-drop-t"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><b>Add a photo</b><small>One person, full body</small></span></label>
      <div class="side">
        <h2 id="make-h">Run as yourself</h2>
        <p class="lede">One photo becomes your 3D runner. New Viggle accounts get <b>100 free credits</b>, enough for 3 runners.</p>
        <div class="resume" id="make-resume" hidden><b>Your runner is already paid for.</b> Enter the same key to pick it up at no extra cost. <button type="button" id="make-discard">Discard it and start over</button></div>
        <div class="field"><input type="password" id="make-key" aria-label="Viggle API key" placeholder="Viggle API key" spellcheck="false" autocomplete="off" autocapitalize="off"><a href="${pinoc.KEYS_URL}" target="_blank" rel="noopener">Get a free key</a></div>
        <div class="row"><label class="check"><input type="checkbox" id="make-keep"> Remember on this device</label><span class="bal" id="make-bal"></span></div>
        <p class="err" id="make-err" role="alert" hidden></p>
        <button class="btn pri" id="make-go" type="submit" disabled>Create runner</button>
        <p class="fine" id="make-cost">${pinoc.COST} credits per runner, from your own Viggle account.</p>
      </div>
      <p class="alt"><label><input type="file" class="vh" id="make-vsplat" accept=".vsplat"><u>Load a .vsplat</u></label><button type="button" id="make-forget" hidden>Forget my key</button><button type="button" id="make-remove" hidden>Remove my runner</button></p>
    </form>
    <div id="make-busy" hidden>
      ${leafSvg}
      <p class="stage" id="make-stage" aria-live="polite">Uploading your photo…</p>
      <div class="meter"><u id="make-bar"></u></div>
      <p class="fine">Usually a few minutes. You can close this panel; it carries on in the background.</p>
    </div>
  </div></div>`;
  const $ = (id) => root.querySelector('#' + id);
  const el = { boot: $('boot'), bootMsg: $('boot-msg'), title: $('title'), hud: $('hud'), score: $('score'), leaves: $('leaves'), lv: $('lv'), mult: $('mult'),
    powers: $('powers'), toast: $('toast'), hint: $('hint'), paused: $('paused'), over: $('over'), start: $('start'), mute: $('mute'), best: $('best') };
  const cards = [...root.querySelectorAll('.card')];
  cards.forEach((c) => c.addEventListener('click', () => {
    if (c.dataset.id !== 'mine') return h.onSelect(c.dataset.id);
    c.blur(); // or Enter during a run would press this card again
    if (hasMine && !c.classList.contains('on')) h.onSelect('mine'); else openMake(); // tap the selected card again to change it
  }));

  // ---- "run as yourself": photo -> PINOC character with the player's own API key
  const mk = { veil: $('make'), form: $('make-form'), busy: $('make-busy'), file: $('make-file'), prev: $('make-prev'), dropT: $('make-drop-t'), drop: $('make-drop'),
    key: $('make-key'), bal: $('make-bal'), err: $('make-err'), go: $('make-go'), stage: $('make-stage'), bar: $('make-bar'), forget: $('make-forget'), remove: $('make-remove'), resume: $('make-resume'), cost: $('make-cost'), keep: $('make-keep') };
  let hasMine = false, photo = null, working = false, sending = false, balT = 0, pvUrl = null, picUrl = null, armed = 0;
  const shown = () => mk.veil.classList.contains('show');
  const fail = (msg) => { mk.err.textContent = msg; mk.err.hidden = !msg; };
  const view = (busy) => { working = busy; mk.form.hidden = busy; mk.busy.hidden = !busy; };
  /** The form has two modes: make a new runner, or pick up one that is already paid for. */
  function ready() {
    const p = pinoc.pending(), k = mk.key.value.trim();
    mk.resume.hidden = !p; mk.drop.hidden = mk.cost.hidden = !!p; mk.form.classList.toggle('solo', !!p);
    mk.go.textContent = p ? 'Pick up my runner' : 'Create runner';
    mk.go.disabled = p ? !k : !(photo && k);
    mk.forget.hidden = !pinoc.getKey(); mk.remove.hidden = !hasMine;
    mk.remove.textContent = 'Remove my runner'; armed = 0;
  }
  const progress = (p) => {
    mk.stage.textContent = p.stage === 'upload' ? 'Uploading your photo…' : p.stage === 'download' ? 'Bringing your runner to the platform…' : `Building your runner… ${p.progress ? p.progress + '%' : ''}`;
    mk.bar.style.width = (p.stage === 'upload' ? 4 : Math.max(6, p.progress || 0)) + '%';
  };
  function checkBalance() {
    clearTimeout(balT);
    const k = mk.key.value.trim();
    if (!k) { mk.bal.textContent = ''; return; }
    balT = setTimeout(async () => {
      try { const b = await pinoc.balance(k); if (mk.key.value.trim() !== k) return; mk.bal.textContent = `${Math.floor(b)} credits` + (b < pinoc.COST && !pinoc.pending() ? ` · need ${pinoc.COST}` : ''); }
      catch (e) { if (mk.key.value.trim() === k) mk.bal.textContent = e.message; }
    }, 500);
  }
  function setPhoto(f) {
    if (!f || working) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return fail('Please choose a PNG, JPG or WebP image.');
    fail(''); photo = f;
    if (pvUrl) URL.revokeObjectURL(pvUrl);
    mk.prev.src = pvUrl = URL.createObjectURL(f); mk.prev.hidden = false; mk.dropT.hidden = true; ready();
  }
  function clearPhoto() { photo = null; mk.file.value = ''; if (pvUrl) URL.revokeObjectURL(pvUrl); pvUrl = null; mk.prev.hidden = true; mk.prev.removeAttribute('src'); mk.dropT.hidden = false; }
  /** Run a job that ends in a .vsplat Blob; the game must accept it before it replaces the stored runner. */
  async function run(job, pic) {
    view(true); fail(''); progress({ stage: 'upload' });
    try {
      const blob = await job();
      if (!(await h.onRunner(blob))) throw new Error('That file could not be loaded as a runner.');
      await pinoc.saveRunner({ vsplat: blob, photo: pic, at: Date.now() }).catch(() => {}); // storage full / private mode: still playable this session
      pinoc.savePendingPhoto(null); clearPhoto(); ui.mine(pic); view(false); closeMake();
    } catch (e) { console.error(e); view(false); fail(e.message || 'Something went wrong.'); }
    ready();
  }
  function openMake() {
    if (!h.canMake()) return;
    mk.veil.classList.add('show'); mk.key.value = pinoc.getKey(); mk.keep.checked = pinoc.remembered(); checkBalance(); ready();
    if (!working) mk.key.value ? mk.go.focus() : mk.key.focus();
  }
  function closeMake() { mk.veil.classList.remove('show'); } // a running job carries on in the background
  mk.file.addEventListener('change', () => setPhoto(mk.file.files[0]));
  ['dragenter', 'dragover'].forEach((t) => mk.drop.addEventListener(t, () => mk.drop.classList.add('over')));
  ['dragleave', 'drop'].forEach((t) => mk.drop.addEventListener(t, () => mk.drop.classList.remove('over')));
  mk.drop.addEventListener('drop', (e) => setPhoto(e.dataTransfer.files[0]));
  ['dragover', 'drop'].forEach((t) => addEventListener(t, (e) => e.preventDefault())); // a missed drop must not navigate away from the game
  mk.key.addEventListener('input', () => { ready(); checkBalance(); });
  mk.form.addEventListener('submit', async (e) => {
    e.preventDefault(); if (working || mk.go.disabled) return;
    const k = mk.key.value.trim(), f = photo, p = pinoc.pending();
    working = true; pinoc.setKey(k, mk.keep.checked); // set before any await: a double click must not pay twice
    if (p) return run(() => pinoc.finish(k, p.id, progress), await pinoc.loadPendingPhoto());
    view(true); progress({ stage: 'upload' });
    const pic = await pinoc.thumbnail(f); await pinoc.savePendingPhoto(pic);
    sending = true;
    run(() => pinoc.create(k, f, (s) => { if (s.stage !== 'upload') sending = false; progress(s); }).then((r) => r.blob).finally(() => { sending = false; }), pic);
  });
  addEventListener('beforeunload', (e) => { if (sending) e.preventDefault(); }); // leaving mid-upload could lose a paid job
  $('make-vsplat').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f && !working) run(async () => f, null); });
  $('make-discard').addEventListener('click', () => { pinoc.discardPending(); pinoc.savePendingPhoto(null); fail(''); ready(); checkBalance(); });
  mk.keep.addEventListener('change', () => { if (pinoc.getKey()) pinoc.setKey(pinoc.getKey(), mk.keep.checked); });
  mk.forget.addEventListener('click', () => { pinoc.setKey(''); mk.key.value = ''; mk.keep.checked = false; checkBalance(); ready(); });
  mk.remove.addEventListener('click', async () => {
    if (Date.now() - armed > 6000) { armed = Date.now(); mk.remove.textContent = 'Really remove? It cannot be restored'; return; }
    await pinoc.clearRunner().catch(() => {}); ui.mine(null, true); closeMake(); h.onRunner(null); ready();
  });
  $('make-x').addEventListener('click', () => closeMake());
  mk.veil.addEventListener('pointerdown', (e) => { if (e.target === mk.veil) closeMake(); });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && shown()) closeMake(); });
  el.start.addEventListener('click', () => h.onStart());
  $('pause').addEventListener('click', () => h.onPause());
  $('resume').addEventListener('click', () => h.onPause());
  $('quit').addEventListener('click', () => h.onMenu());
  $('retry').addEventListener('click', () => h.onRetry());
  $('menu').addEventListener('click', () => h.onMenu());
  el.mute.addEventListener('click', () => h.onMute());

  let lastScore = -1, lastLeaves = -1, lastMult = '', lastPw = '', hintT = 0;
  const ui = {
    /** True while the upload panel is open: the game ignores its keys. */
    modal() { return shown(); },
    /** Show the player's own runner on the last card (pic: Blob or null). */
    mine(pic, gone = false) {
      hasMine = !gone;
      if (picUrl) URL.revokeObjectURL(picUrl); picUrl = pic ? URL.createObjectURL(pic) : null;
      const box = $('mine-pic');
      box.style.backgroundImage = picUrl ? `url(${picUrl})` : ''; box.classList.toggle('photo', !!picUrl); box.classList.toggle('made', hasMine);
      $('mine-tag').textContent = hasMine ? 'Tap again to change' : 'Upload a photo';
    },
    boot(msg) { el.bootMsg.textContent = msg; },
    bootError(msg) { el.bootMsg.className = 'err'; el.bootMsg.textContent = msg; },
    ready() { el.boot.classList.add('done'); },
    title(best) { el.best.textContent = fmt(best); el.title.classList.remove('out'); el.hud.classList.add('out'); el.over.classList.remove('show'); el.paused.classList.remove('show'); },
    select(id, busy) { cards.forEach((c) => { c.classList.toggle('on', c.dataset.id === id); c.classList.toggle('busy', c.dataset.id === id && busy); c.setAttribute('aria-selected', c.dataset.id === id); }); el.start.disabled = !!busy; },
    run() { el.title.classList.add('out'); el.hud.classList.remove('out'); el.over.classList.remove('show'); el.paused.classList.remove('show'); lastScore = lastLeaves = -1; lastMult = lastPw = ''; el.powers.innerHTML = ''; },
    score(score, leaves, mult, hot) {
      const s = Math.floor(score);
      if (s !== lastScore) { el.score.textContent = fmt(s); lastScore = s; }
      if (leaves !== lastLeaves) { el.leaves.textContent = fmt(leaves); if (lastLeaves >= 0) { el.lv.classList.remove('pop'); void el.lv.offsetWidth; el.lv.classList.add('pop'); } lastLeaves = leaves; }
      const m = '×' + mult + (hot ? '!' : '');
      if (m !== lastMult) { el.mult.textContent = '×' + mult; el.mult.classList.toggle('hot', !!hot); lastMult = m; }
    },
    powers(list) { // [{kind, left, total}]
      const key = list.map((p) => p.kind).join();
      if (key !== lastPw) {
        el.powers.innerHTML = list.map((p) => `<div class="pw ${p.kind}"><i>${POWER_LABEL[p.kind][0]}</i><span>${POWER_LABEL[p.kind][1]}</span>${p.total ? '<span class="bar"><u></u></span>' : ''}</div>`).join('');
        lastPw = key;
      }
      list.forEach((p, i) => { const u = el.powers.children[i]?.querySelector('u'); if (u) u.style.width = Math.max(0, (p.left / p.total) * 100) + '%'; });
    },
    toast(big, small = '') { el.toast.innerHTML = big + (small ? `<small>${small}</small>` : ''); el.toast.classList.remove('show'); void el.toast.offsetWidth; el.toast.classList.add('show'); },
    hint(html, secs = 4) { el.hint.innerHTML = html; el.hint.classList.remove('out'); clearTimeout(hintT); hintT = setTimeout(() => el.hint.classList.add('out'), secs * 1000); },
    paused(on) { el.paused.classList.toggle('show', on); },
    over(o) {
      $('over-k').textContent = o.caught ? 'つかまった！' : '衝突！';
      $('over-h').textContent = o.caught ? 'Caught by the station master' : o.cause === 'train' ? 'Hit a train' : o.cause === 'gate' ? 'Clipped the gate' : 'Tripped on the barrier';
      $('over-score').textContent = fmt(o.score); $('over-dist').textContent = fmt(o.dist) + ' m'; $('over-leaves').textContent = fmt(o.leaves); $('over-best').textContent = fmt(o.best);
      $('over-rec').classList.toggle('hidden', !o.record);
      el.over.classList.add('show'); el.hud.classList.add('out');
    },
    mute(m) {
      el.mute.innerHTML = m
        ? '<svg viewBox="0 0 20 20"><path d="M3 7.5h3l4-3.5v12l-4-3.5H3z"/><path d="M13 7.6l4.4 4.8M17.4 7.6L13 12.4" stroke="#fbf3e4" stroke-width="1.7" stroke-linecap="round" fill="none"/></svg>'
        : '<svg viewBox="0 0 20 20"><path d="M3 7.5h3l4-3.5v12l-4-3.5H3z"/><path d="M13 7a4.2 4.2 0 010 6M15.2 4.8a7.4 7.4 0 010 10.4" stroke="#fbf3e4" stroke-width="1.7" stroke-linecap="round" fill="none"/></svg>';
      el.mute.setAttribute('aria-label', m ? 'Unmute' : 'Mute');
    },
    touch: TOUCH,
  };
  return ui;
}

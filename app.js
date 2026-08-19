// ===== PLAYER: AWAKENED =====

const STORAGE_KEY = 'awakened-state-v1';
const OLD_STORAGE_KEY = 'arise-state-v1'; // pre-rename saves migrate from here

const STATS = [
  { abbr: 'STR', name: 'Strength',     def: 'Physical effort — lifting, workouts, yard work, carrying the heavy thing.',
    keywords: ['workout','lift','gym','weight','push','pull','squat','bench','curl','deadlift','press','carry','mow','yard','shovel','chop','clean','pushup','push-up','situp','sit-up','plank'] },
  { abbr: 'VIT', name: 'Vitality',     def: 'Health & recovery — sleep, hydration, eating well, rest days, doctor visits.',
    keywords: ['sleep','slept','water','hydrate','eat','meal','veggie','vegetable','fruit','vitamin','doctor','dentist','rest','nap','cook','protein','bed early','no soda','no sugar','fast'] },
  { abbr: 'AGI', name: 'Agility',      def: 'Movement & endurance — running, cardio, sports, stretching, taking the stairs.',
    keywords: ['run','ran','walk','jog','bike','cardio','swim','swam','sprint','hike','stretch','yoga','sport','basketball','soccer','tennis','stairs','miles','steps'] },
  { abbr: 'INT', name: 'Intelligence', def: 'Learning — reading, studying, courses, practicing a skill, building this app.',
    keywords: ['read','study','studied','learn','course','code','coded','build','built','write','wrote','practice','chess','book','pages','class','homework','research','duolingo','language','tutorial'] },
  { abbr: 'PER', name: 'Perception',   def: 'Awareness — meditation, journaling, prayer, reflection, catching a bad habit in the act.',
    keywords: ['meditate','meditation','journal','pray','prayer','reflect','reflection','gratitude','mindful','breathe','breathing','devotional','bible','quiet time','no phone','no scroll','unplug'] },
];

const EFFORTS = [
  { key: 'easy',   label: 'EASY',   xp: 10 },
  { key: 'medium', label: 'MEDIUM', xp: 25 },
  { key: 'hard',   label: 'HARD',   xp: 50 },
];

// single source of truth for frequencies: picker label, task-card chip label,
// and recurring-list group title all derive from here
const FREQS = [
  { key: 'once',    label: 'ONE-TIME' },
  { key: 'daily',   label: 'DAILY QUEST', chip: 'DAILY',   group: 'DAILY QUESTS' },
  { key: 'weekly',  label: 'WEEKLY',      chip: 'WEEKLY',  group: 'WEEKLY' },
  { key: 'monthly', label: 'MONTHLY',     chip: 'MONTHLY', group: 'MONTHLY' },
];

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const RANKS = [
  { rank: 'E', min: 1 },  { rank: 'D', min: 11 }, { rank: 'C', min: 26 },
  { rank: 'B', min: 46 }, { rank: 'A', min: 66 }, { rank: 'S', min: 86 },
];

const STAT_XP_PER_POINT = 50;
const xpForLevel = (level) => 80 + level * 15;
const effortXp = (key) => (EFFORTS.find(e => e.key === key) || EFFORTS[1]).xp;
// LOCAL date, never UTC — the whole scheduler thinks in the user's timezone,
// so the "new day" boundary must be their midnight, not UTC's
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function rankFor(level) {
  let r = 'E';
  for (const b of RANKS) if (level >= b.min) r = b.rank;
  return r;
}

// cosmetic material tier per rank
const RANK_TIERS = { E: 'wood', D: 'stone', C: 'bronze', B: 'silver', A: 'gold', S: 'diamond' };
const tierFor = (rank) => RANK_TIERS[rank] || 'wood';

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ===== State =====
// tasks:     today's quest instances {id, templateId?, name, stat, effort, freq, done}
// recurring: schedule templates {id, name, stat, effort, freq, days?, monthDay?}
function defaultState() {
  const stats = {};
  STATS.forEach(s => { stats[s.abbr] = { pts: 0, xp: 0 }; });
  return { level: 1, xp: 0, stats, tasks: [], recurring: [], lastDate: todayStr() };
}

function migrate(st) {
  if (!st.recurring) st.recurring = [];
  // old shape: tasks had recurring:true booleans, plus a saved[] list
  (st.tasks || []).forEach(t => {
    if (t.recurring === true) {
      const tpl = { id: uid(), name: t.name, stat: t.stat, effort: t.effort, freq: 'daily' };
      st.recurring.push(tpl);
      t.templateId = tpl.id;
      t.freq = 'daily';
    }
    if (t.freq === undefined) t.freq = 'once';
    delete t.recurring;
  });
  delete st.saved;
  return st;
}

// Rebuild a guaranteed-valid state from ANY input (old saves, imported files,
// hand-edited JSON). Every field is type-checked; anything broken falls back
// to a sane default instead of crashing a render later.
function normalizeState(raw) {
  const st = defaultState();
  if (!raw || typeof raw !== 'object') return st;
  migrate(raw); // convert pre-scheduler shapes first

  const num = (v, fallback, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  };
  const validStat = (a) => STATS.some(s => s.abbr === a);
  const validEffort = (k) => EFFORTS.some(e => e.key === k);

  st.level = num(raw.level, 1, 1, 100);
  st.xp = num(raw.xp, 0, 0, Infinity);
  while (st.xp >= xpForLevel(st.level) && st.level < 100) { st.xp -= xpForLevel(st.level); st.level++; }

  STATS.forEach(s => {
    const src = raw.stats && raw.stats[s.abbr];
    let pts = num(src && src.pts, 0, 0, Infinity);
    let xp = num(src && src.xp, 0, 0, Infinity);
    pts += Math.floor(xp / STAT_XP_PER_POINT); // old 100-XP-era banks convert, nothing is lost
    xp = xp % STAT_XP_PER_POINT;
    st.stats[s.abbr] = { pts, xp };
  });

  if (Array.isArray(raw.tasks)) {
    st.tasks = raw.tasks
      .filter(t => t && typeof t.name === 'string' && t.name.trim() && validStat(t.stat))
      .map(t => ({
        id: typeof t.id === 'string' ? t.id : uid(),
        templateId: typeof t.templateId === 'string' ? t.templateId : undefined,
        name: t.name,
        stat: t.stat,
        effort: validEffort(t.effort) ? t.effort : 'medium',
        freq: FREQS.some(f => f.key === t.freq) ? t.freq : 'once',
        done: t.done === true,
      }));
  }

  if (Array.isArray(raw.recurring)) {
    st.recurring = raw.recurring
      .filter(t => t && typeof t.name === 'string' && t.name.trim() && validStat(t.stat) &&
                   ['daily', 'weekly', 'monthly'].includes(t.freq))
      .map(t => {
        const tpl = {
          id: typeof t.id === 'string' ? t.id : uid(),
          name: t.name,
          stat: t.stat,
          effort: validEffort(t.effort) ? t.effort : 'medium',
          freq: t.freq,
        };
        if (t.freq === 'weekly') {
          tpl.days = Array.isArray(t.days) ? t.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [];
          if (tpl.days.length === 0) tpl.days = [new Date().getDay()];
        }
        if (t.freq === 'monthly') tpl.monthDay = t.monthDay === 'last' ? 'last' : num(t.monthDay, 1, 1, 31);
        if (typeof t.skippedOn === 'string') tpl.skippedOn = t.skippedOn;
        return tpl;
      });
  }

  st.lastDate = typeof raw.lastDate === 'string' ? raw.lastDate : todayStr();
  return st;
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (e) { /* corrupted storage — start fresh */ }
  return defaultState();
}

let saveWarned = false;
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // private browsing / quota pressure — keep the app alive, tell the user once
    if (!saveWarned) { saveWarned = true; toast('⚠ Couldn’t save — progress won’t survive closing this tab'); }
  }
}

// ===== Scheduling =====
function isDueOn(tpl, d) {
  if (tpl.freq === 'daily') return true;
  if (tpl.freq === 'weekly') return (tpl.days || []).includes(d.getDay());
  if (tpl.freq === 'monthly') {
    const dom = d.getDate();
    const lastDom = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    // a monthDay past the month's end clamps to its last day, so "the 31st"
    // still fires in February (on the 28th/29th) instead of silently skipping
    const target = tpl.monthDay === 'last' ? lastDom : Math.min(tpl.monthDay, lastDom);
    return dom === target;
  }
  return false;
}

function nextDueDate(tpl) {
  const d = new Date();
  for (let i = 1; i <= 366; i++) {
    d.setDate(d.getDate() + 1);
    if (isDueOn(tpl, d)) return d;
  }
  return null;
}

function fmtDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function scheduleText(tpl) {
  if (tpl.freq === 'daily') return 'Every day';
  if (tpl.freq === 'weekly')
    return (tpl.days || []).slice().sort((a, b) => a - b).map(d => DAY_NAMES[d]).join(' · ');
  if (tpl.freq === 'monthly') {
    if (tpl.monthDay === 'last') return 'Last day of each month';
    const suffix = tpl.monthDay > 28 ? ' (or last day)' : '';
    return `${ordinal(tpl.monthDay)}${suffix} of each month`;
  }
  return '';
}

// spawn today's instances for any due template that doesn't already have one
// (a template skipped today via ✕ stays gone until tomorrow)
function generateToday() {
  let changed = false;
  const now = new Date();
  state.recurring.forEach(tpl => {
    if (tpl.skippedOn === todayStr()) return;
    if (isDueOn(tpl, now) && !state.tasks.some(t => t.templateId === tpl.id)) {
      state.tasks.push({ id: uid(), templateId: tpl.id, name: tpl.name, stat: tpl.stat, effort: tpl.effort, freq: tpl.freq, done: false });
      changed = true;
    }
  });
  return changed;
}

// New day: clear finished one-timers and all recurring instances, then respawn
// what's due. Called on load, focus, visibility, and a minute timer — so it only
// saves/renders when something actually changed.
function dailyReset() {
  const today = todayStr();
  let changed = false;
  if (state.lastDate !== today) {
    state.tasks = state.tasks.filter(t => !t.templateId && !t.done);
    state.lastDate = today;
    changed = true;
  }
  if (generateToday()) changed = true;
  if (changed) {
    saveState();
    renderAll();
  }
}

// ===== XP engine =====
function applyXp(amount, statAbbr, sign = 1) {
  const events = { xp: amount * sign, levelsGained: 0, statGained: 0, rankChanged: null };
  const beforeRank = rankFor(state.level);

  state.xp += amount * sign;
  while (state.xp >= xpForLevel(state.level) && state.level < 100) {
    state.xp -= xpForLevel(state.level);
    state.level++;
    events.levelsGained++;
  }
  while (state.xp < 0 && state.level > 1) {
    state.level--;
    state.xp += xpForLevel(state.level);
    events.levelsGained--;
  }
  if (state.xp < 0) state.xp = 0;

  const st = state.stats[statAbbr];
  if (st) {
    st.xp += amount * sign;
    while (st.xp >= STAT_XP_PER_POINT) { st.xp -= STAT_XP_PER_POINT; st.pts++; events.statGained++; }
    while (st.xp < 0 && st.pts > 0) { st.pts--; st.xp += STAT_XP_PER_POINT; events.statGained--; }
    if (st.xp < 0) st.xp = 0;
  }

  const afterRank = rankFor(state.level);
  if (afterRank !== beforeRank) events.rankChanged = afterRank;

  saveState();
  return events;
}

// ===== The payoff layer: chimes, flashes, celebration cards =====

let audioCtx = null;
function tone(freq, startIn, dur, type = 'sine', peak = 0.12) {
  const t = audioCtx.currentTime + startIn;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function chime(kind) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (kind === 'complete') {           // quick two-note ding
      tone(880, 0, 0.18);
      tone(1318.5, 0.09, 0.3);
    } else if (kind === 'level') {       // rising arpeggio
      tone(523.25, 0,    0.16);
      tone(659.25, 0.10, 0.16);
      tone(783.99, 0.20, 0.16);
      tone(1046.5, 0.30, 0.5, 'sine', 0.16);
    } else if (kind === 'rank') {        // low swell + triumphant arpeggio
      tone(130.81, 0, 1.2, 'triangle', 0.10);
      tone(523.25, 0.25, 0.22, 'sine', 0.14);
      tone(659.25, 0.40, 0.22, 'sine', 0.14);
      tone(783.99, 0.55, 0.22, 'sine', 0.14);
      tone(1046.5, 0.70, 0.8,  'sine', 0.18);
      tone(1318.5, 0.85, 0.9,  'sine', 0.10);
    }
  } catch (e) { /* no audio — stay silent, never break the app */ }
}

// glow the stat cell and float a +N label off it
function flashStat(statAbbr, xpAmt, ptsGained) {
  const idx = STATS.findIndex(s => s.abbr === statAbbr);
  const cell = document.querySelectorAll('.stat-cell')[idx];
  if (!cell) return;
  cell.classList.add('flash');
  setTimeout(() => cell.classList.remove('flash'), 1200);

  const float = document.createElement('div');
  float.className = 'stat-float' + (ptsGained > 0 ? ' big' : '');
  float.textContent = ptsGained > 0 ? `+${ptsGained}` : `+${xpAmt}`;
  cell.appendChild(float);
  setTimeout(() => float.remove(), 1400);
}

function pulseXpBar() {
  const bar = document.querySelector('.xp-bar');
  if (!bar) return;
  bar.classList.add('pulse');
  setTimeout(() => bar.classList.remove('pulse'), 900);
}

const celebration = document.getElementById('celebration');
let celebTimer = null;

function showCard(kind) {
  const card = document.getElementById('celebrationCard');
  card.className = 'celebration-card ' + kind +
    (kind === 'rank' ? ' tier-' + tierFor(rankFor(state.level)) : '');
  if (kind === 'rank') {
    document.getElementById('celebLabel').textContent = 'RANK UP';
    document.getElementById('celebBig').textContent = rankFor(state.level);
    document.getElementById('celebSub').textContent = `HUNTER LEVEL ${state.level}`;
  } else {
    document.getElementById('celebLabel').textContent = 'LEVEL UP';
    document.getElementById('celebBig').textContent = `LV. ${state.level}`;
    document.getElementById('celebSub').textContent = `${xpForLevel(state.level) - state.xp} XP to next level`;
  }
  celebration.classList.remove('hidden');
  clearTimeout(celebTimer);
  // level cards excuse themselves; rank cards wait to be admired (with a fallback)
  celebTimer = setTimeout(dismissCard, kind === 'rank' ? 6000 : 2800);
}

function dismissCard() {
  clearTimeout(celebTimer);
  celebration.classList.add('hidden');
}
celebration.addEventListener('click', dismissCard);

function celebrate(events, statAbbr) {
  if (events.xp > 0) {
    flashStat(statAbbr, events.xp, events.statGained);
    pulseXpBar();
  }
  if (events.rankChanged) {
    chime('complete');
    setTimeout(() => { chime('rank'); showCard('rank'); }, 650);
  } else if (events.levelsGained > 0) {
    chime('complete');
    setTimeout(() => { chime('level'); showCard('level'); }, 650);
  } else if (events.xp > 0) {
    chime('complete');
  }
}

// ===== Stat guesser (v1: keyword table) =====
function guessStat(text) {
  const lower = ' ' + text.toLowerCase() + ' ';
  let best = null, bestPos = Infinity;
  for (const s of STATS) {
    for (const kw of s.keywords) {
      const pos = lower.indexOf(kw);
      if (pos !== -1 && pos < bestPos) { best = s.abbr; bestPos = pos; }
    }
  }
  return best;
}

// ===== Rendering: home screen =====
function renderHeader() {
  const rank = rankFor(state.level);
  const badge = document.getElementById('rankBadge');
  badge.textContent = rank;
  badge.className = 'rank-badge tier-' + tierFor(rank);
  document.getElementById('levelNum').textContent = state.level;
  const need = xpForLevel(state.level);
  document.getElementById('xpText').textContent = `${state.xp} / ${need}`;
  requestAnimationFrame(() => {
    document.getElementById('xpFill').style.width =
      Math.min(100, (state.xp / need) * 100) + '%';
  });
}

function renderRadar() {
  const size = 320, cx = size / 2, cy = size / 2 + 6, R = 108;
  const maxStat = Math.max(10, ...STATS.map(s => state.stats[s.abbr].pts));
  const n = STATS.length;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, r) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];

  let svg = `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    const pts = STATS.map((_, i) => pt(i, R * frac).join(',')).join(' ');
    svg += `<polygon class="radar-ring" points="${pts}"/>`;
  }
  STATS.forEach((_, i) => {
    const [x, y] = pt(i, R);
    svg += `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`;
  });
  const valPts = STATS.map((s, i) =>
    pt(i, R * Math.min(1, state.stats[s.abbr].pts / maxStat)).join(',')).join(' ');
  svg += `<polygon class="radar-shape" points="${valPts}"/>`;
  STATS.forEach((s, i) => {
    const [dx, dy] = pt(i, R * Math.min(1, state.stats[s.abbr].pts / maxStat));
    svg += `<circle class="radar-dot" cx="${dx}" cy="${dy}" r="3.5"/>`;
    const [lx, ly] = pt(i, R + 22);
    svg += `<text class="radar-label" x="${lx}" y="${ly + 4}" text-anchor="middle">${s.abbr}</text>`;
  });
  svg += '</svg>';
  document.getElementById('radar').innerHTML = svg;
}

function renderStatRow() {
  document.getElementById('statRow').innerHTML = STATS.map(s =>
    `<div class="stat-cell"><div class="abbr">${s.abbr}</div><div class="val">${state.stats[s.abbr].pts}</div></div>`
  ).join('');
}

function freqLabel(freq) {
  const f = FREQS.find(x => x.key === freq);
  return (f && f.chip) || '';
}

function renderTasks() {
  const ul = document.getElementById('taskList');
  ul.innerHTML = '';

  if (state.tasks.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'No quests yet — hit + LOG to begin.';
    ul.appendChild(li);
    return;
  }

  state.tasks.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = 'task-card' + (t.done ? ' done' : '');

    const check = document.createElement('button');
    check.className = 'task-check';
    check.setAttribute('aria-label', 'Complete task');
    check.textContent = '✓';

    const body = document.createElement('div');
    body.className = 'task-body';
    const nameEl = document.createElement('div');
    nameEl.className = 'task-name';
    nameEl.textContent = t.name;
    const chip = document.createElement('span');
    chip.className = 'task-stat';
    const fl = freqLabel(t.freq);
    chip.textContent = `${t.stat} · +${effortXp(t.effort)}${fl ? ' · ' + fl : ''}`;
    body.append(nameEl, chip);

    const moves = document.createElement('div');
    moves.className = 'task-move';
    const up = document.createElement('button');
    up.textContent = '▲'; up.setAttribute('aria-label', 'Move up');
    const down = document.createElement('button');
    down.textContent = '▼'; down.setAttribute('aria-label', 'Move down');
    const del = document.createElement('button');
    del.textContent = '✕'; del.setAttribute('aria-label', 'Remove task');
    moves.append(up, down, del);

    check.addEventListener('click', () => toggleTask(t));
    up.addEventListener('click', () => moveTask(i, -1));
    down.addEventListener('click', () => moveTask(i, 1));
    del.addEventListener('click', () => removeTask(t));

    li.append(check, body, moves);
    ul.appendChild(li);
  });
}

function renderAll() {
  renderHeader();
  renderRadar();
  renderStatRow();
  renderTasks();
  renderRecurring();
}

// ===== Task actions =====
function toggleTask(t) {
  t.done = !t.done;
  const events = applyXp(effortXp(t.effort), t.stat, t.done ? 1 : -1);
  renderAll();
  if (t.done) celebrate(events, t.stat);
  else toast('Quest un-done — XP reversed');
}

function moveTask(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= state.tasks.length) return;
  [state.tasks[i], state.tasks[j]] = [state.tasks[j], state.tasks[i]];
  saveState();
  renderTasks();
}

function removeTask(t) {
  // removing a completed quest keeps its XP — it still happened
  state.tasks = state.tasks.filter(x => x.id !== t.id);
  // mark the template skipped for today, or generateToday would respawn the
  // quest on the next focus (which also allowed complete→remove→complete XP farming)
  if (t.templateId) {
    const tpl = state.recurring.find(x => x.id === t.templateId);
    if (tpl) tpl.skippedOn = todayStr();
  }
  saveState();
  renderTasks();
  toast(t.templateId ? 'Skipped for today — back next time it’s due' : 'Quest removed');
}

// ===== Screen 2: Log an Action =====
const logScreen = document.getElementById('logScreen');
const logInput = document.getElementById('logInput');
const guessHint = document.getElementById('guessHint');

let picked = null;

function openLog() {
  const now = new Date();
  picked = {
    stat: null, effort: 'medium', freq: 'once',
    days: [now.getDay()],        // weekly default: today
    monthDay: now.getDate(),     // monthly default: today's date
    statManually: false,
  };
  logInput.value = '';
  guessHint.textContent = '';
  renderPickers();
  renderRecurring();
  logScreen.classList.remove('hidden');
  logInput.focus();
}

function closeLog() { logScreen.classList.add('hidden'); }

function renderPickers() {
  // stat chips
  const statRow = document.getElementById('statChips');
  statRow.innerHTML = '';
  STATS.forEach(s => {
    const b = document.createElement('button');
    b.className = 'chip' + (picked.stat === s.abbr ? ' selected' : '');
    b.textContent = s.abbr;
    b.addEventListener('click', () => {
      picked.stat = s.abbr;
      picked.statManually = true;
      guessHint.textContent = '';
      renderPickers();
    });
    statRow.appendChild(b);
  });

  // effort chips
  const effRow = document.getElementById('effortChips');
  effRow.innerHTML = '';
  EFFORTS.forEach(e => {
    const b = document.createElement('button');
    b.className = 'chip' + (picked.effort === e.key ? ' selected' : '');
    b.textContent = `${e.label} +${e.xp}`;
    b.addEventListener('click', () => { picked.effort = e.key; renderPickers(); });
    effRow.appendChild(b);
  });

  // frequency chips
  const freqRow = document.getElementById('freqChips');
  freqRow.innerHTML = '';
  FREQS.forEach(f => {
    const b = document.createElement('button');
    b.className = 'chip' + (picked.freq === f.key ? ' selected' : '');
    b.textContent = f.label;
    b.addEventListener('click', () => { picked.freq = f.key; renderPickers(); });
    freqRow.appendChild(b);
  });

  // weekly day picker
  const weeklySection = document.getElementById('weeklySection');
  weeklySection.classList.toggle('hidden', picked.freq !== 'weekly');
  if (picked.freq === 'weekly') {
    const dayRow = document.getElementById('dayChips');
    dayRow.innerHTML = '';
    DAY_NAMES.forEach((name, d) => {
      const b = document.createElement('button');
      b.className = 'chip small' + (picked.days.includes(d) ? ' selected' : '');
      b.textContent = name;
      b.addEventListener('click', () => {
        if (picked.days.includes(d)) picked.days = picked.days.filter(x => x !== d);
        else picked.days.push(d);
        if (picked.days.length === 7) {
          picked.freq = 'daily';           // all 7 days = a daily quest
          toast('Every day selected — switched to DAILY QUEST');
        }
        renderPickers();
      });
      dayRow.appendChild(b);
    });
  }

  // monthly date picker
  const monthlySection = document.getElementById('monthlySection');
  monthlySection.classList.toggle('hidden', picked.freq !== 'monthly');
  if (picked.freq === 'monthly') {
    const grid = document.getElementById('dateGrid');
    grid.innerHTML = '';
    for (let d = 1; d <= 31; d++) {
      const b = document.createElement('button');
      b.className = 'chip small' + (picked.monthDay === d ? ' selected' : '');
      b.textContent = d;
      b.addEventListener('click', () => { picked.monthDay = d; renderPickers(); });
      grid.appendChild(b);
    }
    const last = document.createElement('button');
    last.className = 'chip small last-day' + (picked.monthDay === 'last' ? ' selected' : '');
    last.textContent = 'LAST DAY';
    last.addEventListener('click', () => { picked.monthDay = 'last'; renderPickers(); });
    grid.appendChild(last);
  }
}

logInput.addEventListener('input', () => {
  if (picked.statManually) return; // user's explicit pick wins over the guesser
  const g = guessStat(logInput.value);
  if (g) {
    picked.stat = g;
    guessHint.textContent = `— suggested: ${g}`;
  } else {
    picked.stat = null;
    guessHint.textContent = logInput.value.trim() ? '— pick one below' : '';
  }
  renderPickers();
});

function validateForm() {
  const name = logInput.value.trim();
  if (!name) { toast('Type what you did first'); return null; }
  if (!picked.stat) { toast('Pick a stat for this action'); return null; }
  if (picked.freq === 'weekly' && picked.days.length === 0) { toast('Pick at least one day'); return null; }
  return name;
}

function buildTemplate(name) {
  const tpl = { id: uid(), name, stat: picked.stat, effort: picked.effort, freq: picked.freq };
  if (picked.freq === 'weekly') tpl.days = picked.days.slice().sort((a, b) => a - b);
  if (picked.freq === 'monthly') tpl.monthDay = picked.monthDay;
  state.recurring.push(tpl);
  return tpl;
}

function makeInstance(name, templateId, done) {
  return { id: uid(), templateId, name, stat: picked.stat, effort: picked.effort, freq: picked.freq, done };
}

document.getElementById('completeNowBtn').addEventListener('click', () => {
  const name = validateForm();
  if (!name) return;
  const tpl = picked.freq === 'once' ? null : buildTemplate(name);
  state.tasks.push(makeInstance(name, tpl ? tpl.id : undefined, true));
  const events = applyXp(effortXp(picked.effort), picked.stat, 1);
  closeLog();
  renderAll();
  celebrate(events, picked.stat);
});

document.getElementById('addTodayBtn').addEventListener('click', () => {
  const name = validateForm();
  if (!name) return;
  if (picked.freq === 'once') {
    state.tasks.push(makeInstance(name, undefined, false));
    saveState();
    closeLog();
    renderAll();
    toast('Added to today’s quests');
    return;
  }
  const tpl = buildTemplate(name);
  if (isDueOn(tpl, new Date())) {
    state.tasks.push(makeInstance(name, tpl.id, false));
    saveState();
    closeLog();
    renderAll();
    toast('Added to today’s quests');
  } else {
    saveState();
    closeLog();
    renderAll();
    const next = nextDueDate(tpl);
    toast(next ? `Scheduled — next: ${fmtDate(next)}` : 'Scheduled');
  }
});

document.getElementById('logCancelBtn').addEventListener('click', closeLog);
document.getElementById('logBtn').addEventListener('click', openLog);

// ===== Recurring quests (grouped by frequency, shown in log screen) =====
function renderRecurring() {
  const panel = document.getElementById('recurringPanel');
  const wrap = document.getElementById('recurringGroups');
  wrap.innerHTML = '';

  if (state.recurring.length === 0) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');

  const groups = FREQS.filter(f => f.group).map(f => ({ freq: f.key, title: f.group }));

  groups.forEach(g => {
    const tpls = state.recurring.filter(t => t.freq === g.freq);
    if (tpls.length === 0) return;

    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = g.title;
    wrap.appendChild(title);

    tpls.forEach(tpl => {
      const card = document.createElement('div');
      card.className = 'saved-card';

      const body = document.createElement('div');
      body.className = 'task-body';
      const nameEl = document.createElement('div');
      nameEl.className = 'task-name';
      nameEl.textContent = tpl.name;
      const sched = document.createElement('div');
      sched.className = 'sched-text';
      sched.textContent = scheduleText(tpl);
      const chip = document.createElement('span');
      chip.className = 'task-stat';
      chip.textContent = `${tpl.stat} · +${effortXp(tpl.effort)}`;
      body.append(nameEl, sched, chip);

      const del = document.createElement('button');
      del.className = 'saved-del';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Delete recurring quest');
      del.addEventListener('click', () => {
        state.recurring = state.recurring.filter(x => x.id !== tpl.id);
        // pull today's instance too, unless it's already completed (XP stays)
        state.tasks = state.tasks.filter(t => t.templateId !== tpl.id || t.done);
        saveState();
        renderAll();
        toast('Recurring quest deleted');
      });

      card.append(body, del);
      wrap.appendChild(card);
    });
  });
}

// ===== Modal + toast =====
function setupModal() {
  const modal = document.getElementById('infoModal');
  document.getElementById('statDefs').innerHTML = STATS.map(s =>
    `<dt>${s.abbr} — ${s.name}</dt><dd>${s.def}</dd>`).join('');
  document.getElementById('infoBtn').addEventListener('click', () => modal.classList.remove('hidden'));
  document.getElementById('infoClose').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

// ===== Backup: export / import save =====
function setupBackup() {
  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `awakened-save-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Save exported');
  });

  const fileInput = document.getElementById('importFile');
  document.getElementById('importBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = ''; // reset up front so cancelling and re-picking the same file works
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(reader.result);
        if (typeof incoming.level !== 'number' || !incoming.stats) throw new Error('missing save fields');
        if (!confirm(`Replace your current save (LV. ${state.level}) with this file (LV. ${incoming.level})?`)) return;
        state = normalizeState(incoming); // never trust a file — rebuild it as valid state
        saveState();
        dailyReset();
        renderAll();
        toast('Save imported');
      } catch (e) {
        toast('That file is not a valid PLAYER: AWAKENED save');
      }
    };
    reader.readAsText(file);
  });
}

// ===== Boot =====
// three day-rollover triggers: refocus, becoming visible again (iOS PWA resume
// doesn't always fire 'focus'), and a minute timer for sessions left open
// across midnight. dailyReset is cheap when nothing changed.
window.addEventListener('focus', dailyReset);
document.addEventListener('visibilitychange', () => { if (!document.hidden) dailyReset(); });
setInterval(dailyReset, 60 * 1000);

saveState();                                    // persist under the new key immediately
try { localStorage.removeItem(OLD_STORAGE_KEY); } catch (e) { /* storage unavailable */ }
dailyReset();
renderAll();
setupModal();
setupBackup();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable — app still works */ });
}

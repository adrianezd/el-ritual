'use strict';

/* =========================================================================
   El ritual — investigadores contra sectarios en una mansión
   Diez rondas. En cada una, todos eligen en secreto a qué sala van y qué
   hacen allí. Los investigadores buscan pistas o vigilan; los sectarios
   (que se conocen) fingen, sabotean (avanza el ritual y se pierde una
   pista) o atacan si hay gente suficiente para esconderse. Luego se
   descubre quién estuvo en cada sala y qué pasó, y se debate y vota.

   Ganan los investigadores si reúnen las pistas o echan a todos los
   sectarios. Ganan los sectarios si completan el ritual, si son tantos
   como los investigadores o si llega el final de la décima ronda.

   Un único motor para «Mismo móvil» (mesa.js) y «Con código de sala».
   ========================================================================= */

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 10;
const ROUNDS = 10;
const TIMER_OPTIONS = [0, 1, 2, 3, 4, 5];
const TIMER_STEP = 30;
const SETTINGS_KEY = 'el-ritual-settings-v1';

const ROOMS = [
  { name: 'Biblioteca', emoji: '📚' },
  { name: 'Capilla', emoji: '⛪' },
  { name: 'Bodega', emoji: '🍷' },
  { name: 'Observatorio', emoji: '🔭' },
  { name: 'Invernadero', emoji: '🌿' }
];
const ROLES = {
  inv: { name: 'Investigador', emoji: '🔎', goal: 'Busca pistas, vigila y descubre a los sectarios antes de que acaben el ritual.' },
  sect: { name: 'Sectario', emoji: '🕯️', goal: 'Sabotea para avanzar el ritual o ataca cuando haya gente para esconderte. Que no te pillen.' }
};
const ACTS = {
  inv: [['buscar', '🔎 Buscar pistas', 'Suma una pista'], ['vigilar', '👁️ Vigilar', 'Nadie puede atacar en tu sala']],
  sect: [['fingir', '🎭 Fingir', 'No pasa nada'], ['sabotear', '🕯️ Sabotear', 'Ritual +1 y se pierde una pista'], ['atacar', '🔪 Atacar', 'Solo si hay tres o más en la sala']]
};

/* --------------------------------- Ajustes --------------------------------- */

let settings = { playerCount: 6, cultists: 2, timerMinutes: 2, reveal: true, secretVote: false };
let cultManual = false;
const maxCultsFor = (n) => Math.max(1, Math.floor((n - 1) / 3));
const suggestedCults = (n) => Math.min(maxCultsFor(n), n <= 5 ? 1 : n <= 8 ? 2 : 3);

function loadSettings() {
  const p = Kit.load(SETTINGS_KEY, {}) || {};
  if (typeof p.playerCount === 'number') settings.playerCount = Kit.clamp(Math.round(p.playerCount), MIN_PLAYERS, MAX_PLAYERS);
  if (typeof p.cultists === 'number') { settings.cultists = Kit.clamp(p.cultists, 1, maxCultsFor(settings.playerCount)); cultManual = true; }
  else settings.cultists = suggestedCults(settings.playerCount);
  ['reveal', 'secretVote'].forEach((k) => { if (typeof p[k] === 'boolean') settings[k] = p[k]; });
  if (TIMER_OPTIONS.includes(p.timerMinutes)) settings.timerMinutes = p.timerMinutes;
}
function saveSettings() { Kit.save(SETTINGS_KEY, salaBackup ? Object.assign({}, settings, salaBackup) : settings); }

/* ---------------------------------- Motor ----------------------------------- */
// Fases: reveal → move → report → (day → vote → verdict) → move… y end.

function newGame(n, cfg, local) {
  const c = Kit.clamp(cfg.cultists, 1, maxCultsFor(n));
  const roles = [];
  for (let k = 0; k < n; k++) roles.push(k < c ? 'sect' : 'inv');
  return {
    cfg: { reveal: cfg.reveal, seconds: cfg.timerMinutes * 60, local: Boolean(local), open: Boolean(local && !cfg.secretVote) },
    p: Kit.shuffled(roles).map((r) => ({ r, a: true })),
    rooms: n <= 6 ? 4 : 5,
    round: 1, phase: 'reveal', ready: {}, moves: {}, report: null,
    clues: 0, ritual: 0, goalClues: 3 * (n - c) + 3, goalRitual: 3 * c + 3,
    votes: {}, verdict: null, winner: null, why: ''
  };
}

const alive = (g) => g.p.map((x, i) => (x.a ? i : -1)).filter((i) => i >= 0);
const all = (g) => g.p.map((_, i) => i);
const sects = (g) => all(g).filter((i) => g.p[i].r === 'sect');

function checkWin(g) {
  const al = alive(g);
  const s = al.filter((i) => g.p[i].r === 'sect').length;
  if (g.clues >= g.goalClues) return ['inv', 'clues'];
  if (g.ritual >= g.goalRitual) return ['sect', 'ritual'];
  if (s === 0) return ['inv', 'caught'];
  if (s >= al.length - s) return ['sect', 'many'];
  return null;
}
function setWin(g) {
  const w = checkWin(g);
  if (w) { g.winner = w[0]; g.why = w[1]; }
  return Boolean(w);
}

function startMove(g) {
  g.phase = 'move';
  g.moves = {};
  g.votes = {};
  g.verdict = null;
}

// Se descubre qué pasó en cada sala
function resolveRound(g) {
  const rooms = Array.from({ length: g.rooms }, () => ({ who: [], sab: 0, dead: null, foiled: false }));
  alive(g).forEach((i) => {
    // quien no llegó a elegir va a una sala al azar sin hacer nada raro
    const m = Object.assign({ act: g.p[i].r === 'sect' ? 'fingir' : 'buscar' }, g.moves[i]);
    if (m.room == null) m.room = Math.floor(Math.random() * g.rooms);
    g.moves[i] = m;
    rooms[m.room].who.push(i);
  });
  let found = 0;
  rooms.forEach((room) => {
    const here = room.who;
    const watch = here.some((i) => g.p[i].r === 'inv' && g.moves[i].act === 'vigilar');
    const attackers = here.filter((i) => g.p[i].r === 'sect' && g.moves[i].act === 'atacar');
    const invs = here.filter((i) => g.p[i].r === 'inv');
    let clues = here.filter((i) => g.p[i].r === 'inv' && g.moves[i].act === 'buscar').length;
    if (attackers.length && here.length >= 3 && invs.length) {
      if (watch) room.foiled = true;
      else {
        const victim = Kit.pick(invs);
        g.p[victim].a = false;
        room.dead = victim;
        if (g.moves[victim].act === 'buscar') clues -= 1; // no llegó a contarla
      }
    }
    room.sab = here.filter((i) => g.p[i].r === 'sect' && g.moves[i].act === 'sabotear').length;
    g.ritual += room.sab;
    found += Math.max(0, clues - room.sab);
  });
  g.clues += found;
  g.report = { rooms, found };
  g.phase = 'report';
  setWin(g);
}

function resolveCounts(g, counts, none) {
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter((k) => counts[k] === max).map(Number);
  let out = null;
  let reason = 'novote';
  if (none > 0 && none >= max) reason = 'none';
  else if (top.length > 1) reason = 'tie';
  else if (top.length === 1) { out = top[0]; reason = 'out'; }
  if (out != null) g.p[out].a = false;
  g.verdict = { out, reason, counts, none };
  g.phase = 'verdict';
  setWin(g);
}
function resolveVote(g) {
  const counts = {};
  let none = 0;
  Object.keys(g.votes).forEach((k) => { const t = g.votes[k]; if (t === 'none') none += 1; else counts[t] = (counts[t] || 0) + 1; });
  resolveCounts(g, counts, none);
}

// Tras la reunión: siguiente ronda o, si era la décima, el ritual se completa
function nextRound(g) {
  if (g.round >= ROUNDS) { g.winner = 'sect'; g.why = 'time'; g.phase = 'end'; return; }
  g.round += 1;
  startMove(g);
}

function act(g, i, a, host) {
  const me = g.p[i];
  switch (a.t) {
    case 'ready':
      if (g.phase !== 'reveal' || !me) return null;
      g.ready[i] = true;
      return {};
    case 'start':
      if (!host || g.phase !== 'reveal') return null;
      startMove(g);
      return {};
    case 'pick': {
      // primero qué hace, luego a qué sala va
      if (g.phase !== 'move' || !me || !me.a) return null;
      const m = g.moves[i] || {};
      if (m.room != null) return null;
      if (a.act) {
        if (!ACTS[me.r].some(([k]) => k === a.act)) return null;
        m.act = a.act;
      } else if (a.room != null) {
        if (!m.act || !(a.room >= 0 && a.room < g.rooms)) return null;
        m.room = a.room;
      } else return null;
      g.moves[i] = m;
      return {};
    }
    case 'reveal-rooms':
      if (!host || g.phase !== 'move') return null;
      resolveRound(g);
      return {};
    case 'meet':
      if (!host || g.phase !== 'report' || g.winner) return null;
      g.phase = 'day';
      return { timer: g.cfg.seconds || null };
    case 'skip':
      if (!host || (g.phase !== 'report' && g.phase !== 'day' && g.phase !== 'verdict') || g.winner) return null;
      nextRound(g);
      return { timer: null };
    case 'to-vote':
      if (!host || g.phase !== 'day') return null;
      g.phase = 'vote';
      g.votes = {};
      return { timer: null };
    case 'vote':
      if (g.phase !== 'vote' || !me || !me.a) return null;
      if (a.target !== 'none' && (!(a.target >= 0 && a.target < g.p.length) || !g.p[a.target].a || a.target === i)) return null;
      g.votes[i] = a.target;
      return {};
    case 'tally':
      if (!host || g.phase !== 'vote') return null;
      resolveVote(g);
      return {};
    case 'end':
      if (!host || !g.winner) return null;
      g.phase = 'end';
      return { timer: null };
    default:
      return null;
  }
}

function privateTurn(g) {
  if (g.phase === 'reveal') return { key: 'reveal', order: all(g), done: (gg, k) => g.cfg.local || Boolean(gg.ready[k]), lastLabel: 'Listo, ¡a la mansión!' };
  if (g.phase === 'move') return { key: `move-${g.round}`, order: alive(g), done: (gg, k) => Boolean(gg.moves[k] && gg.moves[k].room != null), lastLabel: 'Ver qué pasó', intro: `🕯️ Ronda ${g.round} de ${ROUNDS}. Cada uno elige en secreto qué hace y adónde va.` };
  if (g.phase === 'vote' && !g.cfg.open) return { key: `vote-${g.round}`, order: alive(g), done: (gg, k) => gg.votes[k] != null, lastLabel: 'Ver el recuento', intro: '🗳️ Votación secreta.' };
  return null;
}

function advance(g) {
  if (g.phase === 'reveal') { startMove(g); return {}; }
  if (g.phase === 'move') { resolveRound(g); return {}; }
  if (g.phase === 'vote') { resolveVote(g); return {}; }
  return null;
}

/* ------------------------------ Lo que se pinta ------------------------------ */

const esc = Kit.esc;
const actAttr = (a) => `data-act="${esc(JSON.stringify(a))}"`;
const hostBtn = (a, label, cls) => `<button type="button" class="btn ${cls || 'btn-primary'} btn-large" ${actAttr(a)}>${label}</button>`;
const waitHost = (ctx, text) => `<p class="setup-hint sala-center">⏳ ${esc(text || `Esperando a ${ctx.hostName}`)}</p>`;
const roomTag = (k) => `${ROOMS[k].emoji} ${ROOMS[k].name}`;
const nameList = (ids, names) => (ids.length ? ids.map((k) => `<strong>${esc(names[k])}</strong>`).join(', ').replace(/, ([^,]*)$/, ' y $1') : 'nadie');

function roleCard(g, i, names) {
  const r = g.p[i].r;
  let extra = esc(ROLES[r].goal);
  if (r === 'sect') {
    const others = sects(g).filter((k) => k !== i);
    extra += `<br><strong>${others.length ? `Tu secta: ${others.map((k) => esc(names[k])).join(', ')}` : 'Eres el único sectario'}</strong>`;
  }
  return { label: r === 'sect' ? 'La secta' : 'Los investigadores', emoji: ROLES[r].emoji, content: ROLES[r].name, extra, alert: r === 'sect', impostor: r === 'sect' };
}

function tracks(g) {
  const pc = Math.min(100, Math.round((g.clues / g.goalClues) * 100));
  const pr = Math.min(100, Math.round((g.ritual / g.goalRitual) * 100));
  return '<div class="tracks">' +
    `<div class="track is-clues"><span>🔎 Pistas</span><strong>${g.clues} / ${g.goalClues}</strong><i style="--w:${pc}%"></i></div>` +
    `<div class="track is-ritual"><span>🕯️ Ritual</span><strong>${g.ritual} / ${g.goalRitual}</strong><i style="--w:${pr}%"></i></div>` +
    `<p class="track-round">Ronda <strong>${g.round}</strong> de ${ROUNDS}</p></div>`;
}

function movePanel(g, i, names) {
  const me = g.p[i];
  const m = g.moves[i] || {};
  if (m.room != null) {
    const a = ACTS[me.r].find(([k]) => k === m.act);
    return `<p class="screen-help">Vas a <strong>${roomTag(m.room)}</strong> a ${a[1].replace(/^\S+ /, '').toLowerCase()}.</p>`;
  }
  if (!m.act) {
    let mates = '';
    if (me.r === 'sect') {
      const others = sects(g).filter((k) => k !== i && g.p[k].a);
      if (others.length) mates = `<p class="screen-help">Tu secta: ${nameList(others, names)}. No sabéis adónde irá cada uno.</p>`;
    }
    return `<h3 class="night-title">${ROLES[me.r].emoji} ¿Qué haces esta ronda?</h3>${mates}<div class="act-grid">` +
      ACTS[me.r].map(([k, label, sub]) => `<button type="button" class="act-card" ${actAttr({ t: 'pick', act: k })}><strong>${label}</strong><small>${sub}</small></button>`).join('') + '</div>';
  }
  const a = ACTS[me.r].find(([k]) => k === m.act);
  return `<h3 class="night-title">${a[1]} · ¿adónde vas?</h3><div class="room-grid">` +
    ROOMS.slice(0, g.rooms).map((r, k) => `<button type="button" class="room-card" ${actAttr({ t: 'pick', room: k })}><span>${r.emoji}</span>${r.name}</button>`).join('') + '</div>';
}

function reportHtml(g, names) {
  const rep = g.report;
  return '<div class="room-report">' + rep.rooms.map((room, k) => {
    const marks = [];
    if (room.dead != null) marks.push(`<span class="mark is-dead">💀 ${esc(names[room.dead])} ha aparecido muerto</span>`);
    if (room.foiled) marks.push('<span class="mark is-foiled">👁️ Alguien intentó atacar, pero lo vieron</span>');
    if (room.sab) marks.push(`<span class="mark is-sab">🕯️ Sabotaje${room.sab > 1 ? ` ×${room.sab}` : ''}</span>`);
    return `<div class="room-box${room.dead != null || room.sab ? ' is-hot' : ''}"><p class="room-name">${roomTag(k)}</p>` +
      `<p class="room-who">${room.who.length ? room.who.map((i) => `<span class="${g.p[i].a ? '' : 'is-dead'}">${esc(names[i])}</span>`).join('') : '<em>Vacía</em>'}</p>${marks.join('')}</div>`;
  }).join('') + `</div><p class="vote-summary">Esta ronda: +${rep.found} pista${rep.found === 1 ? '' : 's'}</p>`;
}

function chips(g, names) {
  return `<ul class="town-chips">${g.p.map((x, k) => `<li class="${x.a ? '' : 'is-dead'}">${x.a ? '' : '💀 '}${esc(names[k])}</li>`).join('')}</ul>`;
}

function verdictHtml(g, names) {
  const v = g.verdict;
  if (v.out != null) {
    const s = g.p[v.out].r === 'sect';
    const show = g.cfg.reveal ? ` Era <strong>${ROLES[g.p[v.out].r].emoji} ${ROLES[g.p[v.out].r].name}</strong>.` : '';
    return `<div class="verdict ${g.cfg.reveal ? (s ? 'is-win' : 'is-lose') : ''}"><span class="verdict-emoji" aria-hidden="true">🚪</span><h2 class="verdict-title">Echáis a ${esc(names[v.out])} de la mansión</h2><p class="verdict-text">${show || 'Su papel queda en secreto.'}</p></div>`;
  }
  const text = v.reason === 'tie' ? 'Empate: nadie se va.' : v.reason === 'none' ? 'Decidís no echar a nadie.' : 'Nadie votó.';
  return `<div class="verdict"><span class="verdict-emoji" aria-hidden="true">🤝</span><h2 class="verdict-title">Nadie se va</h2><p class="verdict-text">${text}</p></div>`;
}

function voteSummary(g, names) {
  const v = g.verdict;
  const rows = Object.keys(v.counts).map(Number).sort((a, b) => v.counts[b] - v.counts[a]).map((k) => `${esc(names[k])} ${v.counts[k]}`);
  if (v.none) rows.push(`Nadie ${v.none}`);
  return rows.length ? `<p class="vote-summary">Votos: ${rows.join(' · ')}</p>` : '';
}

const WHY = {
  clues: ['🔎', '¡Ganan los investigadores!', 'Habéis reunido las pistas y desbaratado el ritual.'],
  caught: ['🚪', '¡Ganan los investigadores!', 'No queda ningún sectario en la mansión.'],
  ritual: ['🕯️', '¡Gana la secta!', 'El ritual se ha completado. Algo despierta bajo la mansión…'],
  many: ['🔪', '¡Gana la secta!', 'Los sectarios ya son tantos como los investigadores.'],
  time: ['🕛', '¡Gana la secta!', 'Han dado las doce de la décima noche y el ritual se completa.']
};

function endHtml(g, names) {
  const [emoji, title, text] = WHY[g.why] || WHY.time;
  const inv = g.winner === 'inv';
  return `<div class="verdict ${inv ? 'is-win' : 'is-lose'}"><span class="verdict-emoji" aria-hidden="true">${emoji}</span><h2 class="verdict-title">${title}</h2><p class="verdict-text">${text}</p></div>` +
    tracks(g) +
    '<div class="card reveal-box"><p class="results-label">Quién era quién</p><ul class="town-list">' +
    g.p.map((x, k) => `<li class="${x.r === 'sect' ? 'is-wolf' : ''}${x.a ? '' : ' is-dead'}"><span>${ROLES[x.r].emoji}</span><strong>${esc(names[k])}</strong><small>${ROLES[x.r].name}${x.a ? '' : ' · 💀'}</small></li>`).join('') +
    '</ul></div>';
}

function voteButtons(g, i, names) {
  const mine = g.votes[i];
  return '<div class="sala-votes">' + alive(g).filter((k) => k !== i).map((k) =>
    `<button type="button" class="sala-vote${mine === k ? ' is-selected' : ''}" ${actAttr({ t: 'vote', target: k })}>${esc(names[k])}</button>`).join('') +
    `<button type="button" class="sala-vote is-none${mine === 'none' ? ' is-selected' : ''}" ${actAttr({ t: 'vote', target: 'none' })}>🙅 Nadie</button></div>`;
}

function render(ctx) {
  const { g, me, host, names } = ctx;
  const inGame = me >= 0 && me < g.p.length;
  const x = inGame ? g.p[me] : null;
  const count = (obj, ids) => ids.filter((k) => obj[k] != null).length;
  const spectator = '<p class="screen-help">👀 Has entrado con la partida empezada: mira y espera a la siguiente.</p>';
  const ghost = x && !x.a ? '<p class="setup-hint sala-center">💀 Estás fuera: puedes mirar, pero no des pistas.</p>' : '';
  const next = g.round >= ROUNDS ? 'Última campanada' : 'Siguiente ronda';

  switch (g.phase) {
    case 'reveal':
      if (ctx.local) return `<h2 class="reveal-player">${esc(names[me])}</h2>${ctx.card}`;
      return (inGame ? `<h2 class="reveal-player">${esc(names[me])}</h2><p class="reveal-warning">🤫 Que nadie más mire tu pantalla</p>${ctx.card}` +
          (g.ready[me] ? '<p class="screen-help">✅ Listo. Esperando a los demás…</p>' : `<button type="button" class="btn btn-secondary btn-large" ${actAttr({ t: 'ready' })}>Ya lo vi</button>`) : spectator) +
        `<p class="sala-count">Listos <strong>${count(g.ready, all(g))}</strong> de ${g.p.length}</p>` +
        (host ? hostBtn({ t: 'start' }, 'Entrar en la mansión 🕯️') : '');
    case 'move': {
      const moved = alive(g).filter((k) => g.moves[k] && g.moves[k].room != null).length;
      return `<h2 class="screen-title">🕯️ Ronda ${g.round}</h2>` + tracks(g) +
        (inGame ? (x.a ? movePanel(g, me, names) : ghost) : spectator) +
        (ctx.local ? '' : `<p class="sala-count">Han elegido <strong>${moved}</strong> de ${alive(g).length}</p>` +
          (host ? `<button type="button" class="btn btn-text" ${actAttr({ t: 'reveal-rooms' })}>Descubrir ya</button>` : ''));
    }
    case 'report':
      return `<h2 class="screen-title">🗝️ Ronda ${g.round}: lo que pasó</h2>` + reportHtml(g, names) + tracks(g) + ghost +
        (host ? (g.winner ? hostBtn({ t: 'end' }, 'Ver el final')
          : hostBtn({ t: 'meet' }, 'Reunión 🗣️') + hostBtn({ t: 'skip' }, next, 'btn-secondary'))
          : waitHost(ctx));
    case 'day':
      return `<h2 class="screen-title">🗣️ Reunión · ronda ${g.round}</h2><p class="screen-help">¿Dónde estabais? ¿Quién saboteó? Contad lo que visteis… o lo que os convenga.</p>${ghost}` +
        chips(g, names) + ctx.timer +
        (host ? hostBtn({ t: 'to-vote' }, 'Votar 🗳️') + hostBtn({ t: 'skip' }, `Sin votar · ${next.toLowerCase()}`, 'btn-secondary') : waitHost(ctx, `${ctx.hostName} decidirá si se vota`));
    case 'vote':
      if (ctx.openVote) return '<h2 class="screen-title">¿A quién echáis de la mansión?</h2>';
      return '<h2 class="screen-title">¿A quién echáis de la mansión?</h2>' +
        (x && x.a ? '<p class="screen-help">Vota desde tu móvil.</p>' + voteButtons(g, me, names) : ghost || spectator) +
        (ctx.local ? '' : `<p class="sala-count">🗳️ Han votado <strong>${count(g.votes, alive(g))}</strong> de ${alive(g).length}</p>` +
          (host ? `<button type="button" class="btn btn-text" ${actAttr({ t: 'tally' })}>Hacer el recuento ya</button>` : ''));
    case 'verdict':
      return verdictHtml(g, names) + voteSummary(g, names) + tracks(g) +
        (host ? (g.winner ? hostBtn({ t: 'end' }, 'Ver el final') : hostBtn({ t: 'skip' }, `${next} ▶`)) : waitHost(ctx));
    case 'end':
      return endHtml(g, names) + (host
        ? '<div class="results-actions"><button type="button" class="btn btn-primary btn-large" data-sala="again">Otra partida ▶</button>' +
          '<button type="button" class="btn btn-secondary btn-large" data-sala="lobby">Cambiar ajustes</button></div>'
        : waitHost(ctx, `Esperando a que ${ctx.hostName} empiece otra partida`));
    default:
      return '';
  }
}

const engine = {
  act, advance, privateTurn, render,
  card: (g, i, names) => (i >= 0 && i < g.p.length ? roleCard(g, i, names) : null),
  title: (g) => (g.phase === 'reveal' ? 'Reparto de papeles' : g.phase === 'end' ? 'Final' : `Ronda ${g.round} de ${ROUNDS}`),
  phaseKey: (g) => `${g.phase}-${g.round}`,
  fx: (g) => (g.phase === 'end' ? (g.winner === 'inv' ? 'win' : 'lose') : null),
  openVote: (g) => (g.phase === 'vote' && g.cfg.open ? {
    targets: alive(g), allowNone: true,
    onDone: ({ counts, none }) => resolveCounts(g, counts, none)
  } : null)
};

/* ------------------------------- Ajustes (DOM) ------------------------------- */

const el = {};
let game = null;

function cacheDom() {
  ['player-count-value', 'btn-player-minus', 'btn-player-plus', 'cult-count-value', 'btn-cult-minus', 'btn-cult-plus',
    'cult-hint', 'names-grid', 'btn-shuffle-names', 'role-summary', 'time-value', 'timer-hint',
    'btn-time-minus', 'btn-time-plus', 'opt-reveal', 'opt-secret-vote', 'opt-sound', 'opt-vibrate', 'btn-start-game',
    'game-bar-title', 'btn-exit', 'play-root'
  ].forEach((id) => { el[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(id); });
}

function renderSetup() {
  const n = settings.playerCount;
  const max = maxCultsFor(n);
  settings.cultists = Kit.clamp(settings.cultists, 1, max);
  const c = settings.cultists;
  el.playerCountValue.textContent = String(n);
  el.btnPlayerMinus.disabled = n <= MIN_PLAYERS;
  el.btnPlayerPlus.disabled = n >= MAX_PLAYERS;
  el.cultCountValue.textContent = String(c);
  el.btnCultMinus.disabled = c <= 1;
  el.btnCultPlus.disabled = c >= max;
  el.cultHint.textContent = `Máximo ${max} para ${n} jugadores`;
  Kit.renderNameInputs(el.namesGrid, n);
  el.optReveal.checked = settings.reveal;
  el.optSecretVote.checked = settings.secretVote;
  el.roleSummary.textContent = `🕯️ ${c} · 🔎 ${n - c} · ${n <= 6 ? 4 : 5} salas · pistas ${3 * (n - c) + 3} · ritual ${3 * c + 3}`;
  const idx = TIMER_OPTIONS.indexOf(settings.timerMinutes);
  el.timeValue.textContent = settings.timerMinutes ? `${settings.timerMinutes}′` : '—';
  el.timerHint.textContent = settings.timerMinutes ? 'Con cronómetro' : 'Sin cronómetro';
  el.btnTimeMinus.disabled = idx <= 0;
  el.btnTimePlus.disabled = idx >= TIMER_OPTIONS.length - 1;
}

function changePlayers(d) {
  settings.playerCount = Kit.clamp(settings.playerCount + d, MIN_PLAYERS, MAX_PLAYERS);
  if (!cultManual) settings.cultists = suggestedCults(settings.playerCount);
  saveSettings();
  renderSetup();
}

function startLocalGame() {
  game = newGame(settings.playerCount, settings, true);
  Kit.keepAwake(true);
  Kit.showScreen('play');
  Mesa.start({
    root: el.playRoot, titleEl: el.gameBarTitle, engine, game, names: Kit.playerNames(settings.playerCount),
    secretVote: settings.secretVote, timerStep: TIMER_STEP, onAgain: startLocalGame, onSetup: backToSetup
  });
}

function backToSetup() {
  Mesa.stop();
  game = null;
  Kit.keepAwake(false);
  renderSetup();
  Kit.showScreen('setup');
}

/* --------------------------- Con código de sala ------------------------------ */

let salaBackup = null;

function salaHosting(on, players) {
  if (on) {
    if (!salaBackup) salaBackup = { playerCount: settings.playerCount };
    settings.playerCount = Kit.clamp(players, MIN_PLAYERS, MAX_PLAYERS);
    settings.cultists = Kit.clamp(settings.cultists, 1, maxCultsFor(settings.playerCount));
  } else if (salaBackup) {
    settings.playerCount = salaBackup.playerCount;
    salaBackup = null;
  }
  renderSetup();
}

Sala.configure({
  id: 'ritual',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  timerStep: TIMER_STEP,
  holdPrompt: 'Mantén pulsado para ver tu papel',
  who: { one: 'sectario', many: 'sectarios', One: 'Sectario', Many: 'Sectarios', the: 'el sectario', The: 'El sectario' },
  hosting: salaHosting,
  custom: {
    start: (n) => newGame(n, settings, false),
    act: Mesa.autoAct(engine),
    render,
    card: engine.card,
    phaseKey: engine.phaseKey,
    phaseFx: (g, me) => {
      if (g.phase !== 'end') return null;
      const mine = me >= 0 && me < g.p.length ? g.p[me].r : 'inv';
      return mine === g.winner ? 'win' : 'lose';
    }
  }
});

/* --------------------------------- Eventos ----------------------------------- */

function bindEvents() {
  el.btnPlayerMinus.addEventListener('click', () => changePlayers(-1));
  el.btnPlayerPlus.addEventListener('click', () => changePlayers(1));
  el.btnCultMinus.addEventListener('click', () => { settings.cultists -= 1; cultManual = true; saveSettings(); renderSetup(); });
  el.btnCultPlus.addEventListener('click', () => { settings.cultists += 1; cultManual = true; saveSettings(); renderSetup(); });
  el.btnTimeMinus.addEventListener('click', () => { settings.timerMinutes = TIMER_OPTIONS[Math.max(0, TIMER_OPTIONS.indexOf(settings.timerMinutes) - 1)]; saveSettings(); renderSetup(); });
  el.btnTimePlus.addEventListener('click', () => { settings.timerMinutes = TIMER_OPTIONS[Math.min(TIMER_OPTIONS.length - 1, TIMER_OPTIONS.indexOf(settings.timerMinutes) + 1)]; saveSettings(); renderSetup(); });
  el.btnShuffleNames.addEventListener('click', () => { Kit.shuffleNames(el.namesGrid, settings.playerCount); Kit.toast('Orden mezclado 🔀'); });
  [['optReveal', 'reveal'], ['optSecretVote', 'secretVote']].forEach(([node, key]) => {
    el[node].addEventListener('change', () => { settings[key] = el[node].checked; saveSettings(); renderSetup(); });
  });
  Kit.bindPrefToggle(el.optSound, 'sound');
  Kit.bindPrefToggle(el.optVibrate, 'vibrate');
  el.btnStartGame.addEventListener('click', () => {
    saveSettings();
    try { history.pushState({ inGame: true }, ''); } catch (err) { /* sin historial */ }
    startLocalGame();
  });
  el.btnExit.addEventListener('click', () => {
    if (!game || window.confirm('¿Salir de la partida? Se perderá la partida en curso.')) backToSetup();
  });
  window.addEventListener('popstate', () => {
    if (!game) return;
    if (window.confirm('¿Salir de la partida? Se perderá la partida en curso.')) backToSetup();
    else { try { history.pushState({ inGame: true }, ''); } catch (err) { /* sin historial */ } }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  cacheDom();
  loadSettings();
  bindEvents();
  renderSetup();
  Kit.showScreen('setup');
});

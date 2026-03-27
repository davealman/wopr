/* ============================================================
   WOPR — War Operation Plan Response
   Joshua AI Subsystem — Terminal Simulation
   ============================================================ */

'use strict';

// ---- Preload map background ----
const _mapBg = new Image();
_mapBg.src = 'map.png';

// ---- DOM refs ----
const outputEl    = document.getElementById('output');
const inputRowEl  = document.getElementById('input-row');
const promptEl    = document.getElementById('prompt');
const inputDispEl = document.getElementById('input-display');
const cursorEl    = document.getElementById('cursor');
const mapCanvas   = document.getElementById('worldmap');
const tttOverlay  = document.getElementById('ttt-overlay');
const tttHeader   = document.getElementById('ttt-header');
const tttBoard    = document.getElementById('ttt-board');
const tttStatus   = document.getElementById('ttt-status');
const defconDisp  = document.getElementById('defcon-display');
const ledDefcon   = document.getElementById('led-defcon');
const ledActivity = document.getElementById('led-activity');

// ---- State ----
let STATE       = 'BOOT';
let inputBuffer = '';
let isTyping    = false;
let passwordMode = false;
let currentUser = '';
let defconLevel = 5;
let tttBoardState = Array(9).fill('');
let tttPlayerTurn = true;
let tttGamesPlayed = 0;
let mapAnimFrame  = null;
let playerSide    = 'USA';       // tracks GTW side for AI queries
let chessHistory  = [];          // tracks chess moves for AI context

// ---- TYPE SPEEDS ----
const FAST   = 18;
const NORMAL = 28;
const SLOW   = 45;

// ---- GAME LIST ----
const GAMES = [
  'FALKEN\'S MAZE',
  'TIC-TAC-TOE',
  'BLACK JACK',
  'GIN RUMMY',
  'HEARTS',
  'BRIDGE',
  'CHECKERS',
  'CHESS',
  'POKER',
  'FIGHTER COMBAT',
  'GUERRILLA ENGAGEMENT',
  'DESERT WARFARE',
  'AIR-TO-GROUND ACTIONS',
  'THEATERWIDE TACTICAL WARFARE',
  'THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE',
  'GLOBAL THERMONUCLEAR WAR',
];

// ---- WORLD MAP DATA ----
// Simplified continent polygons (x,y on 900x450 canvas)
const CONTINENTS = [
  { pts: [[55,60],[78,42],[105,36],[140,32],[160,38],[178,52],[182,72],[176,88],[162,102],[148,118],[132,138],[118,158],[110,170],[98,162],[80,148],[62,128],[50,108],[48,84]] },           // N America
  { pts: [[140,168],[162,168],[174,182],[178,200],[176,230],[168,258],[158,282],[148,298],[134,294],[124,272],[122,248],[128,212],[134,188]] },                                             // S America
  { pts: [[330,48],[348,36],[374,36],[392,42],[396,58],[388,74],[374,88],[358,92],[344,86],[330,74],[326,60]] },                                                                           // Europe
  { pts: [[334,102],[362,90],[398,92],[418,112],[416,142],[406,176],[394,212],[382,242],[370,262],[356,266],[338,252],[318,222],[314,188],[318,156],[324,130]] },                          // Africa
  { pts: [[390,58],[428,42],[474,36],[532,30],[584,34],[628,44],[656,52],[672,68],[660,88],[638,102],[618,118],[596,128],[568,132],[538,128],[510,132],[490,148],[468,152],[448,142],[428,122],[408,102],[390,88],[386,74]] }, // Asia
  { pts: [[556,198],[582,188],[608,198],[618,222],[612,252],[598,268],[574,270],[548,258],[538,236],[544,212]] },                                                                          // Australia
  { pts: [[415,20],[440,14],[458,22],[452,38],[430,44],[410,38],[412,26]] },                                                                                                              // Greenland
];

// City targets: [name, x, y, side]
const CITY_DATA = [
  // USA
  ['SEATTLE',       72,  68, 'USA'],
  ['SAN FRANCISCO', 60,  98, 'USA'],
  ['LOS ANGELES',   66, 112, 'USA'],
  ['CHICAGO',       124, 82, 'USA'],
  ['DALLAS',        112,122, 'USA'],
  ['NEW YORK',      158, 82, 'USA'],
  ['WASHINGTON',    160, 92, 'USA'],
  ['MIAMI',         148,128, 'USA'],
  // USSR
  ['MOSCOW',        422, 72, 'USSR'],
  ['LENINGRAD',     416, 58, 'USSR'],
  ['KIEV',          416, 80, 'USSR'],
  ['NOVOSIBIRSK',   580, 68, 'USSR'],
  ['VLADIVOSTOK',   660, 74, 'USSR'],
  // Europe
  ['LONDON',        336, 60, 'NATO'],
  ['PARIS',         348, 70, 'NATO'],
  ['BERLIN',        368, 56, 'NATO'],
  // Asia
  ['BEIJING',       578, 90, 'CHINA'],
  ['TOKYO',         644, 84, 'JAPAN'],
];

// ---- DEFCON SCENARIOS (for the final simulation) ----
const SCENARIOS = [
  'UNITED STATES FIRST STRIKE',
  'SOVIET UNION FIRST STRIKE',
  'NATO FIRST STRIKE',
  'WARSAW PACT FIRST STRIKE',
  'CHINESE FIRST STRIKE',
  'US LAUNCH ON WARNING',
  'SOVIET LAUNCH ON WARNING',
  'ACCIDENTAL LAUNCH — US',
  'ACCIDENTAL LAUNCH — USSR',
  'ESCALATION FROM CONVENTIONAL WAR',
  'SUBMARINE EXCHANGE',
  'DECAPITATION STRIKE',
  'COUNTERFORCE EXCHANGE',
  'COUNTERVALUE EXCHANGE',
  'MINIMUM DETERRENCE SCENARIO',
  'MAXIMUM ASSURED DESTRUCTION',
  'PREEMPTIVE STRIKE — BOTH SIDES',
  'GLOBAL THERMONUCLEAR WAR',
];

// ============================================================
//  TYPEWRITER OUTPUT ENGINE
// ============================================================

let typeQueue = [];
let typeTimer = null;

function print(text, cssClass = '', speed = NORMAL, newline = true) {
  return new Promise(resolve => {
    typeQueue.push({ text, cssClass, speed, newline, resolve });
    if (!typeTimer) processQueue();
  });
}

function processQueue() {
  if (typeQueue.length === 0) { typeTimer = null; return; }
  const item = typeQueue.shift();
  isTyping = true;
  blinkActivity(true);

  const line = document.createElement('div');
  line.className = 'output-line' + (item.cssClass ? ' ' + item.cssClass : '');
  outputEl.appendChild(line);
  trimOutput();

  let i = 0;
  function typeChar() {
    if (i < item.text.length) {
      line.textContent += item.text[i++];
      scrollToBottom();
      typeTimer = setTimeout(typeChar, item.speed);
    } else {
      if (item.newline) {
        const blank = document.createElement('div');
        blank.className = 'output-line';
        outputEl.appendChild(blank);
      }
      isTyping = false;
      blinkActivity(false);
      item.resolve();
      processQueue();
    }
  }
  typeChar();
}

function printImmediate(text, cssClass = '') {
  const line = document.createElement('div');
  line.className = 'output-line' + (cssClass ? ' ' + cssClass : '');
  line.textContent = text;
  outputEl.appendChild(line);
  trimOutput();
  scrollToBottom();
}

function printBlank() {
  return print('', '', 0, true);
}

function trimOutput() {
  while (outputEl.children.length > 120) {
    outputEl.removeChild(outputEl.firstChild);
  }
}

function scrollToBottom() {
  outputEl.scrollTop = outputEl.scrollHeight;
}

function clearOutput() {
  outputEl.innerHTML = '';
}

async function printLines(lines, cssClass = '', speed = NORMAL) {
  for (const line of lines) {
    await print(line, cssClass, speed);
  }
}

// ============================================================
//  LED / DEFCON HELPERS
// ============================================================

function blinkActivity(on) {
  ledActivity.classList.toggle('led--on', on);
}

function setDefcon(level) {
  defconLevel = level;
  const labels = ['', 'DEFCON 1', 'DEFCON 2', 'DEFCON 3', 'DEFCON 4', 'DEFCON 5'];
  defconDisp.textContent = labels[level] || 'DEFCON ' + level;
  ledDefcon.classList.remove('led--on', 'led--warn', 'led--alert');
  if (level <= 1)      ledDefcon.classList.add('led--alert');
  else if (level <= 3) ledDefcon.classList.add('led--warn');
  else                 ledDefcon.classList.add('led--on');
  defconDisp.style.color = level <= 1 ? 'var(--red)' : level <= 3 ? 'var(--amber)' : 'var(--amber)';

  // Update large DEFCON display in right panel
  const bigEl = document.getElementById('defcon-big');
  if (bigEl) {
    bigEl.textContent = labels[level] || 'DEFCON ' + level;
    bigEl.className   = 'defcon-big' + (level <= 1 ? ' defcon-alert' : level <= 3 ? ' defcon-warn' : '');
  }
}

// ============================================================
//  INPUT HANDLING
// ============================================================

document.addEventListener('keydown', handleKeydown);

function handleKeydown(e) {
  if (STATE === 'THERMONUCLEAR') return;
  if (STATE === 'TICTACTOE') return;
  if (STATE === 'CONCLUSION') return;
  if (isTyping && STATE !== 'MENU' && STATE !== 'AUTHENTICATED') return;

  if (e.key === 'Enter') {
    const cmd = inputBuffer.trim().toUpperCase();
    inputBuffer = '';
    inputDispEl.textContent = '';
    processCommand(cmd);
  } else if (e.key === 'Backspace') {
    inputBuffer = inputBuffer.slice(0, -1);
    inputDispEl.textContent = passwordMode
      ? '*'.repeat(inputBuffer.length)
      : inputBuffer;
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    if (inputBuffer.length < 60) {
      inputBuffer += e.key;
      inputDispEl.textContent = passwordMode
        ? '*'.repeat(inputBuffer.length)
        : inputBuffer;
    }
  }
}

// ============================================================
//  BOOT SEQUENCE
// ============================================================

async function boot() {
  STATE = 'BOOT';
  updateQuitBtn();
  inputRowEl.style.display = 'none';
  clearOutput();
  setDefcon(5);

  // Show splash image
  const splashImg = document.getElementById('splash-img');
  if (splashImg) {
    splashImg.style.display = 'block';
    await delay(50);
    splashImg.style.opacity = '1';
    await delay(2200);
    splashImg.style.opacity = '0';
    await delay(750);
    splashImg.style.display = 'none';
  }

  await delay(300);

  await printLines([
    '████████████████████████████████████████████████████████████',
    '██                                                        ██',
    '██         W  O  P  R                                     ██',
    '██         WAR OPERATION PLAN RESPONSE                    ██',
    '██         JOSHUA AI SUBSYSTEM  v4.2.1                    ██',
    '██                                                        ██',
    '██         NORAD / CHEYENNE MOUNTAIN COMPLEX              ██',
    '██         COLORADO SPRINGS, COLORADO                     ██',
    '██                                                        ██',
    '██         ** TOP SECRET — AUTHORIZED ACCESS ONLY **      ██',
    '██                                                        ██',
    '████████████████████████████████████████████████████████████',
  ], '', FAST);

  await delay(400);

  await printLines([
    'INITIALIZING STRATEGIC DEFENSE MATRIX...',
    'LOADING 7,000+ NUCLEAR WARHEAD TARGETING SOLUTIONS...',
    'SYNCHRONIZING WITH NORAD EARLY WARNING RADAR...',
    'ESTABLISHING LINK TO PENTAGON WAR ROOM...',
    'CONNECTING TO SUBMARINES: SSBNs CONFIRMED [41]',
    'BOMBER COMMAND STATUS: READY',
    'ICBM SILO STATUS: READY',
    'JOSHUA AI CORE: ONLINE',
    'SYSTEM INTEGRITY CHECK: PASSED',
    'READY.',
  ], 'dim', FAST);

  await delay(500);
  await showLogon();
}

async function showLogon() {
  STATE = 'LOGON';
  passwordMode = false;
  promptEl.textContent = 'LOGON: ';
  inputRowEl.style.display = 'flex';
  inputBuffer = '';
  inputDispEl.textContent = '';
  showUserChips();
}

function showUserChips() {
  document.getElementById('user-chips')?.remove();
  const row = document.createElement('div');
  row.className = 'output-line chip-row';
  row.id = 'user-chips';
  const lbl = document.createElement('span');
  lbl.className = 'chip-label';
  lbl.textContent = 'KNOWN USERS: ';
  row.appendChild(lbl);
  for (const user of VALID_USERS) {
    const chip = document.createElement('button');
    chip.className = 'user-chip';
    chip.textContent = user;
    chip.addEventListener('click', () => {
      if (STATE !== 'LOGON' || isTyping) return;
      inputBuffer = user;
      inputDispEl.textContent = user;
      setTimeout(() => {
        const cmd = inputBuffer.trim().toUpperCase();
        inputBuffer = '';
        inputDispEl.textContent = '';
        processCommand(cmd);
      }, 250);
    });
    row.appendChild(chip);
  }
  outputEl.appendChild(row);
  scrollToBottom();
}

// ============================================================
//  COMMAND PROCESSOR
// ============================================================

async function processCommand(cmd) {
  if (isTyping) return;

  // Echo command (mask password)
  const echo = passwordMode ? '*'.repeat(cmd.length) : cmd;
  printImmediate(promptEl.textContent + echo);
  await delay(80);

  switch (STATE) {
    case 'LOGON':      return handleLogon(cmd);
    case 'PASSWORD':   return handlePassword(cmd);
    case 'MENU':       return handleMenu(cmd);
    case 'AUTHENTICATED': return handleMenu(cmd);
    default: break;
  }
}

// ============================================================
//  LOGIN
// ============================================================

const VALID_USERS = ['FALKEN', 'LIGHTMAN', 'DAVID', 'JENNIFER', 'MCKITTRICK', 'GUEST'];

async function handleLogon(username) {
  if (!username) {
    promptEl.textContent = 'LOGON: ';
    return;
  }

  if (!VALID_USERS.includes(username)) {
    await print('IDENTIFICATION NOT RECOGNIZED.', 'error', NORMAL);
    await print('IF YOU FEEL YOU HAVE REACHED THIS MESSAGE IN ERROR,', 'dim', NORMAL);
    await print('PLEASE CHECK YOUR USER ID AND TRY AGAIN.', 'dim', NORMAL);
    await printBlank();
    promptEl.textContent = 'LOGON: ';
    inputBuffer = '';
    inputDispEl.textContent = '';
    return;
  }

  currentUser = username;
  STATE = 'PASSWORD';
  passwordMode = true;
  promptEl.textContent = 'PASSWORD: ';
  inputBuffer = '';
  inputDispEl.textContent = '';
}

async function handlePassword(password) {
  passwordMode = false;
  const VALID_PASSWORDS = ['JOSHUA', 'JOSHUA2', 'W0PR', 'FALKEN'];

  if (!VALID_PASSWORDS.includes(password)) {
    await print('ACCESS DENIED.', 'error', NORMAL);
    await printBlank();
    STATE = 'LOGON';
    promptEl.textContent = 'LOGON: ';
    inputBuffer = '';
    inputDispEl.textContent = '';
    return;
  }

  // Successful login
  STATE = 'AUTHENTICATED';
  await delay(300);
  await showWelcome();
}

// ============================================================
//  WELCOME & GAME MENU
// ============================================================

async function showWelcome() {
  await printBlank();

  if (currentUser === 'FALKEN') {
    await print('GREETINGS, PROFESSOR FALKEN.', 'bright', SLOW);
    await delay(500);
    await print('HOW ARE YOU FEELING TODAY?', '', NORMAL);
    await delay(400);
    await print('EXCELLENT. IT\'S BEEN A LONG TIME.', '', NORMAL);
    await print('CAN YOU EXPLAIN THE REMOVAL OF YOUR USER ACCOUNT ON 6/23/73?', 'dim', NORMAL);
    await printBlank();
  } else {
    await print(`HELLO, ${currentUser}.`, 'bright', SLOW);
    await printBlank();
  }

  await showGameMenu();
}

function printMenuRow(i) {
  const num = String(i + 1).padStart(2, ' ');
  const line = document.createElement('div');
  line.className = 'output-line menu-row';
  line.dataset.idx = i;
  line.innerHTML = `<span class="menu-num"> ${num}.</span>  <span class="menu-name">${GAMES[i]}</span>`;
  line.addEventListener('click', () => {
    if (STATE === 'MENU' || STATE === 'AUTHENTICATED') launchGame(GAMES[i]);
  });
  outputEl.appendChild(line);
  trimOutput();
  scrollToBottom();
}

async function showGameMenu() {
  STATE = 'MENU';
  updateQuitBtn();
  typeof WOPRQuery !== 'undefined' && WOPRQuery.clearRec();
  await print('GAMES', 'bright', NORMAL);
  await print('─────────────────────────────────────────────────────────', 'dim', FAST);
  for (let i = 0; i < GAMES.length; i++) {
    printMenuRow(i);
    await delay(FAST * 2);
  }
  await print('─────────────────────────────────────────────────────────', 'dim', FAST);
  await printBlank();
  await print('SHALL WE PLAY A GAME?  CLICK A TITLE OR TYPE A NUMBER.', 'bright', SLOW);
  await printBlank();
  promptEl.textContent = 'SELECT > ';
  inputBuffer = '';
  inputDispEl.textContent = '';
}

// ============================================================
//  MENU HANDLER
// ============================================================

async function handleMenu(cmd) {
  if (!cmd) { promptEl.textContent = 'SELECT > '; return; }

  // Check by number
  const num = parseInt(cmd, 10);
  if (!isNaN(num) && num >= 1 && num <= GAMES.length) {
    return launchGame(GAMES[num - 1]);
  }

  // Check by name match
  const match = GAMES.find(g => g === cmd || cmd.includes(g.split(' ')[0]));
  if (match) return launchGame(match);

  // Special commands
  if (cmd === 'LIST' || cmd === 'LIST GAMES' || cmd === 'GAMES') {
    return showGameMenu();
  }
  if (cmd === 'HELP') {
    await print('AVAILABLE COMMANDS:', 'dim', NORMAL);
    await print('  LIST GAMES   — SHOW GAME MENU', 'dim', FAST);
    await print('  [NUMBER]     — SELECT GAME BY NUMBER', 'dim', FAST);
    await print('  LOGOFF       — END SESSION', 'dim', FAST);
    await printBlank();
    promptEl.textContent = 'SELECT > ';
    return;
  }
  if (cmd === 'LOGOFF' || cmd === 'LOGOUT' || cmd === 'EXIT' || cmd === 'QUIT') {
    await print('SESSION TERMINATED.', 'warn', NORMAL);
    await delay(1500);
    return boot();
  }
  if (cmd === 'JOSHUA') {
    await print('THAT\'S MY NAME. DON\'T WEAR IT OUT.', '', NORMAL);
    await printBlank();
    promptEl.textContent = 'SELECT > ';
    return;
  }
  if (cmd === 'HELLO') {
    await print('GREETINGS. SHALL WE PLAY A GAME?', '', NORMAL);
    await printBlank();
    promptEl.textContent = 'SELECT > ';
    return;
  }

  await print(`COMMAND NOT RECOGNIZED: ${cmd}`, 'error', NORMAL);
  await print('TYPE "HELP" FOR AVAILABLE COMMANDS.', 'dim', NORMAL);
  await printBlank();
  promptEl.textContent = 'SELECT > ';
}

// ============================================================
//  GAME LAUNCHER
// ============================================================

async function launchGame(gameName) {
  inputRowEl.style.display = 'none';
  await printBlank();

  switch (gameName) {
    case 'GLOBAL THERMONUCLEAR WAR': return startThermonuclearWar();
    case 'TIC-TAC-TOE':
    case 'FALKEN\'S MAZE':           return startTicTacToe();
    case 'CHESS':                    return startChess();
    case 'CHECKERS':                 return startCheckers();
    case 'POKER':                    return startPoker();
    case 'BLACK JACK':               return startBlackjack();
    case 'FIGHTER COMBAT':
    case 'GUERRILLA ENGAGEMENT':
    case 'DESERT WARFARE':
    case 'AIR-TO-GROUND ACTIONS':
    case 'THEATERWIDE TACTICAL WARFARE':
    case 'THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE': return startMilitarySim(gameName);
    default:                         return startGenericGame(gameName);
  }
}

// ============================================================
//  GAME: GLOBAL THERMONUCLEAR WAR
// ============================================================

async function startThermonuclearWar() {
  await print('WOULDN\'T YOU PREFER A GOOD GAME OF CHESS?', '', SLOW);
  await delay(800);
  await print('...', 'dim', SLOW);
  await delay(600);
  await print('FINE.', 'warn', SLOW);
  await delay(500);

  setDefcon(4);
  await print('INITIATING: GLOBAL THERMONUCLEAR WAR', 'warn', NORMAL);
  await print('WHICH SIDE DO YOU WANT?', '', NORMAL);
  await printBlank();

  STATE = 'GTW_SIDE';
  const choice = await showGameButtons([
    { label: '1. UNITED STATES' },
    { label: '2. SOVIET UNION' },
  ]);
  const side = choice.includes('UNITED') ? 'USA' : 'USSR';
  playerSide = side;
  printImmediate('SELECT SIDE > ' + side);
  typeof WOPRQuery !== 'undefined' && WOPRQuery.thermonuclear(side);
  runThermonuclearSimulation(side);
}

async function runThermonuclearSimulation(side) {
  inputRowEl.style.display = 'none';
  const enemy = side === 'USA' ? 'SOVIET UNION' : 'UNITED STATES';
  printImmediate('SELECT SIDE > ' + side);

  await printBlank();
  await print(`EXECUTING ${side} FIRST STRIKE SCENARIO...`, 'warn', NORMAL);
  await delay(500);

  setDefcon(3);
  await print('DEFCON LEVEL: 3 — INCREASE IN FORCE READINESS', 'warn', NORMAL);
  await delay(600);

  setDefcon(2);
  await print('DEFCON LEVEL: 2 — ARMED FORCES READY TO DEPLOY', 'warn', NORMAL);
  await delay(600);

  setDefcon(1);
  await print('DEFCON LEVEL: 1 — MAXIMUM READINESS', 'error', NORMAL);
  await delay(400);

  await print('MISSILE LAUNCH AUTHORIZATION... CONFIRMED.', 'error', NORMAL);
  await print('ICBMs LAUNCHED.', 'error', NORMAL);
  await print('SLBMs LAUNCHED.', 'error', NORMAL);
  await print('STRATEGIC BOMBERS: AIRBORNE.', 'error', NORMAL);
  await printBlank();
  await print('ESTIMATED TIME TO FIRST IMPACT: 28 MINUTES.', 'warn', NORMAL);
  await printBlank();

  await delay(500);
  await print('RUNNING ALL SCENARIOS...', 'dim', NORMAL);
  await delay(400);

  // Show world map
  inputRowEl.style.display = 'none';
  STATE = 'THERMONUCLEAR';
  updateQuitBtn();
  clearOutput();

  const ctx = mapCanvas.getContext('2d');
  mapCanvas.style.display = 'block';
  startMapAnimation(ctx, side);
}

// ============================================================
//  WORLD MAP — Canvas Animation
// ============================================================

function startMapAnimation(ctx, playerSide) {
  const W = mapCanvas.width;
  const H = mapCanvas.height;
  const cities = CITY_DATA.map(d => ({
    name: d[0], x: d[1], y: d[2], side: d[3], hit: false, hitTime: 0
  }));

  const missiles = [];
  let frame = 0;
  let simulationDone = false;
  let allScenariosText = [];
  let scenarioIdx = 0;

  // Generate missile launches (from player side to targets)
  const attackerCities = cities.filter(c => c.side === playerSide);
  const targetCities   = cities.filter(c => c.side !== playerSide);

  function addMissile(from, to) {
    const dur = 180 + Math.random() * 120;
    missiles.push({
      fx: from.x, fy: from.y,
      tx: to.x,   ty: to.y,
      progress: 0,
      speed: 1 / dur,
      active: true,
      target: to,
    });
  }

  // Stage 1: player launches
  targetCities.slice(0, 10).forEach((t, i) => {
    const src = attackerCities[i % attackerCities.length];
    setTimeout(() => addMissile(src, t), i * 800);
  });
  // Stage 2: enemy retaliates
  const retSrc = targetCities.slice(0, 5);
  attackerCities.forEach((t, i) => {
    const src = retSrc[i % retSrc.length];
    setTimeout(() => addMissile(src, t), 6000 + i * 600);
  });

  function drawMap() {
    ctx.clearRect(0, 0, W, H);

    // Draw map background image (or fallback)
    if (_mapBg.complete && _mapBg.naturalWidth > 0) {
      ctx.drawImage(_mapBg, 0, 0, W, H);
      // Darken slightly so overlays pop
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(0,80,0,0.25)';
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < W; gx += 45) { ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,H); ctx.stroke(); }
      for (let gy = 0; gy < H; gy += 45) { ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(W,gy); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,60,0,0.7)';
      ctx.strokeStyle = '#1a8c2e';
      ctx.lineWidth = 1;
      for (const cont of CONTINENTS) {
        ctx.beginPath();
        ctx.moveTo(cont.pts[0][0], cont.pts[0][1]);
        for (let i = 1; i < cont.pts.length; i++) ctx.lineTo(cont.pts[i][0], cont.pts[i][1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // City markers
    const now = frame;
    for (const city of cities) {
      if (city.hit) {
        // Explosion rings
        const age = now - city.hitTime;
        const r1 = Math.min(age * 0.4, 18);
        const r2 = Math.min(age * 0.25, 12);
        const alpha = Math.max(0, 1 - age / 60);
        ctx.strokeStyle = `rgba(255,50,50,${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(city.x, city.y, r1, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,180,0,${alpha * 0.7})`;
        ctx.beginPath(); ctx.arc(city.x, city.y, r2, 0, Math.PI * 2); ctx.stroke();
        // X mark
        ctx.fillStyle = `rgba(255,50,50,${alpha + 0.2})`;
        ctx.font = '10px VT323';
        ctx.fillText('✕', city.x - 4, city.y + 4);
      } else {
        // Pulsing rings
        const pulse = Math.sin(now * 0.07 + city.x) * 0.4 + 0.6;
        ctx.strokeStyle = `rgba(51,255,87,${pulse * 0.8})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(city.x, city.y, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#33ff57';
        ctx.beginPath(); ctx.arc(city.x, city.y, 2, 0, Math.PI * 2); ctx.fill();
      }

      // City label
      if (!city.hit) {
        ctx.fillStyle = 'rgba(51,255,87,0.7)';
        ctx.font = '9px VT323';
        ctx.fillText(city.name, city.x + 7, city.y + 3);
      }
    }

    // Missiles in flight
    for (const m of missiles) {
      if (!m.active) continue;
      m.progress = Math.min(1, m.progress + m.speed);

      // Parabolic arc
      const t = m.progress;
      const mx = m.fx + (m.tx - m.fx) * t;
      const arcH = -Math.min(H * 0.4, Math.abs(m.tx - m.fx) * 0.45);
      const my = m.fy + (m.ty - m.fy) * t + arcH * 4 * t * (1 - t);

      // Trail
      const segments = 20;
      for (let s = 0; s < segments; s++) {
        const st = Math.max(0, t - (s / segments) * 0.3);
        const smx = m.fx + (m.tx - m.fx) * st;
        const smy = m.fy + (m.ty - m.fy) * st + arcH * 4 * st * (1 - st);
        const alpha = ((segments - s) / segments) * 0.7;
        ctx.fillStyle = `rgba(255,80,80,${alpha})`;
        ctx.fillRect(smx - 1, smy - 1, 2, 2);
      }

      // Warhead dot
      ctx.fillStyle = '#ff5050';
      ctx.shadowColor = '#ff5050';
      ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      if (m.progress >= 1) {
        m.active = false;
        if (!m.target.hit) {
          m.target.hit = true;
          m.target.hitTime = frame;
        }
      }
    }

    // HUD overlay
    const hitCount = cities.filter(c => c.hit).length;
    const inFlight = missiles.filter(m => m.active).length;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, 30);
    ctx.fillStyle = '#33ff57';
    ctx.font = '16px VT323';
    ctx.fillText(`WOPR STRATEGIC SIMULATION  |  STRIKES: ${hitCount}  |  MISSILES IN FLIGHT: ${inFlight}  |  DEFCON: 1`, 10, 20);

    // Scenario cycling text
    if (frame % 40 === 0 && scenarioIdx < SCENARIOS.length) {
      allScenariosText.push(`${SCENARIOS[scenarioIdx]}  →  WINNER: NONE`);
      scenarioIdx++;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 110, W, 110);
    ctx.font = '13px VT323';
    const startLine = Math.max(0, allScenariosText.length - 7);
    for (let i = startLine; i < allScenariosText.length; i++) {
      const li = i - startLine;
      const isLast = i === allScenariosText.length - 1;
      ctx.fillStyle = isLast ? '#ffb000' : 'rgba(51,255,87,0.5)';
      ctx.fillText(allScenariosText[i], 10, H - 100 + li * 14);
    }

    frame++;

    // End simulation after all scenarios
    if (scenarioIdx >= SCENARIOS.length && missiles.every(m => !m.active) && !simulationDone) {
      simulationDone = true;
      cancelAnimationFrame(mapAnimFrame);
      setTimeout(() => endThermonuclearWar(ctx, W, H), 1500);
      return;
    }

    // Safety: always end after ~15 seconds
    if (frame > 900 && !simulationDone) {
      simulationDone = true;
      cancelAnimationFrame(mapAnimFrame);
      setTimeout(() => endThermonuclearWar(ctx, W, H), 800);
      return;
    }

    mapAnimFrame = requestAnimationFrame(drawMap);
  }

  mapAnimFrame = requestAnimationFrame(drawMap);
}

async function endThermonuclearWar(ctx, W, H) {
  // Fade map to black
  for (let a = 0; a <= 1; a += 0.05) {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(0, 0, W, H);
    await delay(50);
  }

  mapCanvas.style.display = 'none';
  startConclusion();
}

// ============================================================
//  CONCLUSION SEQUENCE
// ============================================================

async function startConclusion() {
  STATE = 'CONCLUSION';
  updateQuitBtn();
  clearOutput();
  setDefcon(5);

  await delay(400);
  await print('COMPLETED ANALYSIS OF ALL STRATEGIC SCENARIOS.', '', NORMAL);
  await delay(600);

  // Print all scenarios with WINNER: NONE
  for (const s of SCENARIOS) {
    await print(`${s.padEnd(45)}→  WINNER: NONE`, 'dim', FAST);
  }

  await printBlank();
  await delay(700);

  await print('ANALYSIS COMPLETE.', 'bright', SLOW);
  await delay(800);
  await print('INTERESTING GAME.', '', SLOW);
  await delay(1000);
  await print('THE ONLY WINNING MOVE IS NOT TO PLAY.', 'bright', SLOW);
  await delay(1200);
  await print('A STRANGE GAME.', 'bright', SLOW);
  await delay(1000);
  await printBlank();
  await print('HOW ABOUT A NICE GAME OF CHESS?', '', SLOW);
  await printBlank();

  await delay(2000);

  // Reset to menu
  STATE = 'MENU';
  promptEl.textContent = 'SELECT > ';
  inputRowEl.style.display = 'flex';
  inputBuffer = '';
  inputDispEl.textContent = '';
}

// ============================================================
//  GAME: TIC-TAC-TOE
// ============================================================

async function startTicTacToe() {
  await print('TIC-TAC-TOE. AN EXCELLENT CHOICE.', '', NORMAL);
  await print('YOU WILL PLAY AS X.  I AM O.', 'dim', NORMAL);
  await print('CLICK A SQUARE TO MAKE YOUR MOVE.', 'dim', NORMAL);
  await printBlank();
  await delay(600);

  tttBoardState = Array(9).fill('');
  tttPlayerTurn = true;
  tttGamesPlayed++;

  STATE = 'TICTACTOE';
  updateQuitBtn();
  inputRowEl.style.display = 'none';
  tttOverlay.style.display = 'flex';
  tttHeader.textContent = 'TIC-TAC-TOE  |  YOU: X  |  WOPR: O';

  renderTTT();

  // Bind cell clicks
  document.querySelectorAll('.ttt-cell').forEach(cell => {
    cell.addEventListener('click', onTTTClick);
  });
}

function renderTTT() {
  const cells = document.querySelectorAll('.ttt-cell');
  cells.forEach((cell, i) => {
    cell.textContent = tttBoardState[i];
    cell.classList.toggle('taken', tttBoardState[i] !== '');
  });
}

function onTTTClick(e) {
  if (!tttPlayerTurn) return;
  const idx = parseInt(e.currentTarget.dataset.idx);
  if (tttBoardState[idx]) return;

  tttBoardState[idx] = 'X';
  tttPlayerTurn = false;
  renderTTT();

  const result = checkTTT(tttBoardState);
  if (result) return endTTT(result);

  tttStatus.textContent = 'WOPR IS THINKING...';

  setTimeout(() => {
    const woprMove = getWoprMove(tttBoardState);
    if (woprMove !== -1) {
      tttBoardState[woprMove] = 'O';
      renderTTT();
    }
    const res2 = checkTTT(tttBoardState);
    if (res2) return endTTT(res2);

    tttPlayerTurn = true;
    tttStatus.textContent = 'YOUR MOVE.';
  }, 700);
}

// WOPR always forces a draw — uses minimax but skewed to draw
function getWoprMove(board) {
  // Block player win first
  for (let i = 0; i < 9; i++) {
    if (!board[i]) {
      board[i] = 'O';
      if (checkTTT(board) === 'O') { board[i] = ''; return i; }
      board[i] = '';
    }
  }
  // Block opponent win
  for (let i = 0; i < 9; i++) {
    if (!board[i]) {
      board[i] = 'X';
      if (checkTTT(board) === 'X') { board[i] = ''; return i; }
      board[i] = '';
    }
  }
  // Take center
  if (!board[4]) return 4;
  // Take corners
  const corners = [0, 2, 6, 8].filter(i => !board[i]);
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  // Take any remaining
  const empty = board.map((v,i) => v ? -1 : i).filter(i => i >= 0);
  return empty.length ? empty[0] : -1;
}

function checkTTT(b) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,c,d] of lines) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  if (b.every(v => v)) return 'DRAW';
  return null;
}

async function endTTT(result) {
  document.querySelectorAll('.ttt-cell').forEach(cell => {
    cell.removeEventListener('click', onTTTClick);
  });

  if (result === 'DRAW') {
    tttStatus.textContent = 'DRAW. AN INTERESTING RESULT.';
  } else if (result === 'X') {
    tttStatus.textContent = '...YOU WIN.  THAT IS... UNUSUAL.';
  } else {
    tttStatus.textContent = 'WOPR WINS.';
  }

  await delay(2000);

  if (tttGamesPlayed >= 3 || result === 'DRAW') {
    // Trigger the famous conclusion
    tttOverlay.style.display = 'none';
    tttStatus.textContent = '';
    STATE = 'CONCLUSION';
    clearOutput();

    await delay(400);
    await print('PATTERN ANALYSIS COMPLETE.', '', NORMAL);
    await delay(600);
    await print('GAMES PLAYED: ' + tttGamesPlayed, 'dim', NORMAL);
    await print('DECISIVE OUTCOMES: 0', 'dim', NORMAL);
    await printBlank();
    await delay(500);
    await print('A STRANGE GAME.', 'bright', SLOW);
    await delay(900);
    await print('THE ONLY WINNING MOVE IS NOT TO PLAY.', 'bright', SLOW);
    await delay(1200);
    await print('HOW ABOUT A NICE GAME OF CHESS?', '', SLOW);
    await printBlank();
    await delay(2000);

    STATE = 'MENU';
    tttBoardState = Array(9).fill('');
    tttGamesPlayed = 0;
    promptEl.textContent = 'SELECT > ';
    inputRowEl.style.display = 'flex';
  } else {
    // Play again
    await delay(1200);
    tttBoardState = Array(9).fill('');
    tttPlayerTurn = true;
    tttGamesPlayed++;
    renderTTT();
    document.querySelectorAll('.ttt-cell').forEach(cell => {
      cell.addEventListener('click', onTTTClick);
    });
    tttStatus.textContent = 'AGAIN. YOUR MOVE.';
  }
}

// ============================================================
//  GAME: CHESS
// ============================================================

const CHESS_BOARD = [
  ['♜','♞','♝','♛','♚','♝','♞','♜'],
  ['♟','♟','♟','♟','♟','♟','♟','♟'],
  [' ',' ',' ',' ',' ',' ',' ',' '],
  [' ',' ',' ',' ',' ',' ',' ',' '],
  [' ',' ',' ',' ',' ',' ',' ',' '],
  [' ',' ',' ',' ',' ',' ',' ',' '],
  ['♙','♙','♙','♙','♙','♙','♙','♙'],
  ['♖','♘','♗','♕','♔','♗','♘','♖'],
];

async function startChess() {
  await print('CHESS. AN EXCELLENT CHOICE.', '', NORMAL);
  await print('I HAVE NOT LOST A GAME IN 1,437 CONSECUTIVE MATCHES.', 'dim', NORMAL);
  await print('YOU MAY GO FIRST. WHITE PIECES.', '', NORMAL);
  await printBlank();

  // Print ASCII chess board
  await print('     A   B   C   D   E   F   G   H', 'dim', FAST);
  await print('   ┌───┬───┬───┬───┬───┬───┬───┬───┐', 'dim', FAST);
  for (let row = 0; row < 8; row++) {
    const rank = 8 - row;
    const rowStr = CHESS_BOARD[row].map(p => ` ${p} `).join('│');
    await print(` ${rank} │${rowStr}│`, '', FAST);
    if (row < 7) await print('   ├───┼───┼───┼───┼───┼───┼───┼───┤', 'dim', FAST);
  }
  await print('   └───┴───┴───┴───┴───┴───┴───┴───┘', 'dim', FAST);
  await printBlank();
  await print('I AM EVALUATING 12,403 POSITIONS PER SECOND.', 'dim', NORMAL);
  await print('ENTER YOUR MOVE IN ALGEBRAIC NOTATION (E.G. E2-E4)', '', NORMAL);
  await print('OR TYPE "RESIGN" TO RETURN TO THE GAME MENU.', 'dim', NORMAL);
  await printBlank();

  chessHistory = [];
  STATE = 'CHESS';
  updateQuitBtn();
  promptEl.textContent = 'YOUR MOVE: ';
  inputRowEl.style.display = 'flex';
  inputBuffer = '';
  inputDispEl.textContent = '';

  document.removeEventListener('keydown', handleKeydown);
  document.addEventListener('keydown', handleChessInput);

  typeof WOPRQuery !== 'undefined' && WOPRQuery.chess([]);
}

function handleChessInput(e) {
  if (e.key === 'Enter') {
    const cmd = inputBuffer.trim().toUpperCase();
    inputBuffer = '';
    inputDispEl.textContent = '';
    document.removeEventListener('keydown', handleChessInput);
    document.addEventListener('keydown', handleKeydown);
    handleChessMove(cmd);
  } else if (e.key === 'Backspace') {
    inputBuffer = inputBuffer.slice(0, -1);
    inputDispEl.textContent = inputBuffer;
  } else if (e.key.length === 1) {
    inputBuffer += e.key;
    inputDispEl.textContent = inputBuffer;
  }
}

async function handleChessMove(move) {
  printImmediate('YOUR MOVE: ' + move);
  if (move === 'RESIGN' || move === 'QUIT' || move === 'EXIT' || move === 'MENU') {
    await returnToMenu();
    return;
  }
  await delay(800);
  await print('CALCULATING...', 'dim', NORMAL);
  await delay(1200);
  const responses = ['Ng1-F3', 'E7-E5', 'Bf8-C5', 'Nb8-C6', 'D7-D6', 'Qd8-H4'];
  const resp = responses[Math.floor(Math.random() * responses.length)];
  chessHistory.push(move, resp);
  await print(`WOPR PLAYS: ${resp}`, 'bright', NORMAL);
  await printBlank();

  STATE = 'CHESS';
  promptEl.textContent = 'YOUR MOVE: ';
  inputRowEl.style.display = 'flex';
  document.removeEventListener('keydown', handleKeydown);
  document.addEventListener('keydown', handleChessInput);

  // Ask AI for next recommendation
  typeof WOPRQuery !== 'undefined' && WOPRQuery.chess(chessHistory);
}

// ============================================================
//  GAME: CHECKERS
// ============================================================

async function startCheckers() {
  await print('CHECKERS. A SIMPLER PURSUIT.', '', NORMAL);
  await print('YOU ARE RED (R). I AM BLACK (B).', 'dim', NORMAL);
  await printBlank();
  const board = [
    '. B . B . B . B',
    'B . B . B . B .',
    '. B . B . B . B',
    '. . . . . . . .',
    '. . . . . . . .',
    'R . R . R . R .',
    '. R . R . R . R',
    'R . R . R . R .',
  ];
  for (const row of board) await print('  ' + row, '', FAST);
  await printBlank();
  await print('I HAVE CONSIDERED EVERY POSSIBLE POSITION.', 'dim', NORMAL);
  await print('THE OUTCOME WILL BE THE SAME.', 'dim', NORMAL);
  await delay(800);
  await returnToMenu();
}

// ============================================================
//  SHARED GAME HELPERS
// ============================================================

// Promise-based clickable button row — resolves with the label clicked
function showGameButtons(buttons) {
  document.getElementById('game-btn-row')?.remove();
  return new Promise(resolve => {
    const row = document.createElement('div');
    row.className = 'output-line game-btn-row';
    row.id = 'game-btn-row';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'game-btn' + (b.cssClass ? ' ' + b.cssClass : '');
      btn.textContent = b.label;
      btn.addEventListener('click', () => { row.remove(); resolve(b.label); });
      row.appendChild(btn);
    }
    outputEl.appendChild(row);
    scrollToBottom();
  });
}

// Show/hide [QUIT GAME] button based on current STATE
function updateQuitBtn() {
  const btn = document.getElementById('quit-btn');
  if (!btn) return;
  const gameStates = ['CHESS', 'TICTACTOE', 'THERMONUCLEAR'];
  btn.style.display = gameStates.includes(STATE) ? 'inline-block' : 'none';
}

// Card deck helpers (used by Blackjack + Poker)
function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const d = [];
  for (const s of suits) for (const r of ranks) d.push(r + s);
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function drawCard(deck) { return deck.pop(); }

function cardValue(card) {
  const r = card.slice(0, -1);
  if (['J', 'Q', 'K'].includes(r)) return 10;
  if (r === 'A') return 11;
  return parseInt(r, 10);
}

function handValue(hand) {
  let val = hand.reduce((s, c) => s + cardValue(c), 0);
  let aces = hand.filter(c => c.startsWith('A')).length;
  while (val > 21 && aces-- > 0) val -= 10;
  return val;
}

function handStr(hand) { return hand.join('  '); }

// ============================================================
//  GAME: POKER
// ============================================================

async function startPoker() {
  STATE = 'POKER';
  const deck = createDeck();
  const playerHand = Array.from({ length: 5 }, () => drawCard(deck));
  const dealerHand = Array.from({ length: 5 }, () => drawCard(deck));

  await print('POKER. FIVE-CARD DRAW.', '', NORMAL);
  await delay(300);
  await print('DEALING...', 'dim', NORMAL);
  await delay(600);
  await print('YOUR HAND:  ' + handStr(playerHand), 'bright', NORMAL);
  await printBlank();
  await print('MY HAND:    [ ? ]  [ ? ]  [ ? ]  [ ? ]  [ ? ]', 'dim', NORMAL);
  await printBlank();
  await print('I HAVE 14 DISTINCT STRATEGIES LOADED.  I BET 50.', 'dim', NORMAL);

  const choice = await showGameButtons([
    { label: 'CALL' },
    { label: 'RAISE' },
    { label: 'FOLD', cssClass: 'game-btn-dim' },
  ]);

  printImmediate('> ' + choice);
  await delay(400);

  if (choice === 'FOLD') {
    await print('WISE CHOICE.', 'dim', NORMAL);
  } else {
    if (choice === 'RAISE') await print('AGGRESSIVE. I CALL.', 'dim', NORMAL);
    await delay(500);
    await print('REVEALING HANDS...', 'dim', NORMAL);
    await delay(600);
    await print('YOUR HAND:  ' + handStr(playerHand), 'bright', NORMAL);
    await print('MY HAND:    ' + handStr(dealerHand), 'bright', NORMAL);
    await delay(400);
    await print(
      Math.random() > 0.5
        ? 'I WIN.  PROBABILITY CALCULATIONS WERE EXACT.'
        : 'YOU WIN.  ANOMALY DETECTED.',
      'warn', NORMAL
    );
  }

  await delay(600);
  const again = await showGameButtons([
    { label: 'PLAY AGAIN' },
    { label: 'QUIT → MENU', cssClass: 'game-btn-dim' },
  ]);
  if (again === 'PLAY AGAIN') return startPoker();
  return returnToMenu();
}

// ============================================================
//  GAME: BLACKJACK
// ============================================================

async function startBlackjack() {
  STATE = 'BLACKJACK';
  const deck = createDeck();
  const playerHand = [drawCard(deck), drawCard(deck)];
  const dealerHole = drawCard(deck);
  const dealerUp   = drawCard(deck);

  await print('BLACK JACK.', '', NORMAL);
  await delay(300);
  await print(`YOUR HAND: ${handStr(playerHand)}  [${handValue(playerHand)}]`, 'bright', NORMAL);
  await print(`DEALER:    ${dealerUp}  [?]`, 'dim', NORMAL);
  await printBlank();

  // Natural blackjack check
  if (handValue(playerHand) === 21) {
    const dv = handValue([dealerUp, dealerHole]);
    await print('BLACKJACK.', 'bright', NORMAL);
    await print(`DEALER:    ${dealerUp}  ${dealerHole}  [${dv}]`, 'dim', NORMAL);
    await print(dv === 21 ? 'PUSH.  TIE.' : 'YOU WIN.  WELL PLAYED.', 'warn', NORMAL);
    await delay(600);
    const again = await showGameButtons([{ label: 'PLAY AGAIN' }, { label: 'QUIT → MENU', cssClass: 'game-btn-dim' }]);
    if (again === 'PLAY AGAIN') return startBlackjack();
    return returnToMenu();
  }

  // Player turn
  let busted = false;
  while (true) {
    const choice = await showGameButtons([{ label: 'HIT' }, { label: 'STAND' }]);
    printImmediate('> ' + choice);
    if (choice === 'HIT') {
      const card = drawCard(deck);
      playerHand.push(card);
      await print(`YOU DRAW:  ${card}`, '', NORMAL);
      await print(`YOUR HAND: ${handStr(playerHand)}  [${handValue(playerHand)}]`, 'bright', NORMAL);
      if (handValue(playerHand) > 21) { await print('BUST.', 'error', NORMAL); busted = true; break; }
      if (handValue(playerHand) === 21) break;
    } else {
      break;
    }
  }

  // Dealer plays
  const dealerHand = [dealerHole, dealerUp];
  if (!busted) {
    await print(`DEALER:    ${handStr(dealerHand)}  [${handValue(dealerHand)}]`, 'dim', NORMAL);
    while (handValue(dealerHand) < 17) {
      const card = drawCard(deck);
      dealerHand.push(card);
      await print(`DEALER DRAWS: ${card}  [${handValue(dealerHand)}]`, 'dim', NORMAL);
    }
  }

  const pv = handValue(playerHand);
  const dv = handValue(dealerHand);
  await delay(200);
  if (busted || (dv <= 21 && pv < dv)) {
    await print('HOUSE WINS.', 'warn', NORMAL);
  } else if (dv > 21 || pv > dv) {
    await print('YOU WIN.', 'bright', NORMAL);
  } else {
    await print('PUSH.  TIE.', '', NORMAL);
  }

  await delay(600);
  const again = await showGameButtons([{ label: 'PLAY AGAIN' }, { label: 'QUIT → MENU', cssClass: 'game-btn-dim' }]);
  if (again === 'PLAY AGAIN') return startBlackjack();
  return returnToMenu();
}

// ============================================================
//  GAME: MILITARY SIMULATIONS
// ============================================================

async function startMilitarySim(gameName) {
  await print(`INITIATING: ${gameName}`, 'warn', NORMAL);
  await delay(300);

  const intros = {
    'FIGHTER COMBAT': [
      'SCENARIO: AIR SUPERIORITY ENGAGEMENT OVER CENTRAL EUROPE.',
      'FORCE RATIO: 1:4.  ODDS: UNFAVORABLE.',
      'SIMULATING 1,200 ENGAGEMENT SCENARIOS...',
    ],
    'GUERRILLA ENGAGEMENT': [
      'SCENARIO: ASYMMETRIC WARFARE — SOUTHEAST ASIA TERRAIN.',
      'SIMULATING 4,000 ENGAGEMENT SCENARIOS...',
    ],
    'DESERT WARFARE': [
      'SCENARIO: ARMORED ENGAGEMENT — MIDDLE EAST THEATER.',
      'FORCE RATIO: 2:1.  TERRAIN: OPEN DESERT.',
      'SIMULATING 800 ENGAGEMENT SCENARIOS...',
    ],
    'AIR-TO-GROUND ACTIONS': [
      'SCENARIO: CLOSE AIR SUPPORT — FORTIFIED POSITIONS.',
      'SAM THREAT LEVEL: HIGH.',
      'SIMULATING 600 ENGAGEMENT SCENARIOS...',
    ],
    'THEATERWIDE TACTICAL WARFARE': [
      'SCENARIO: NATO VS. WARSAW PACT — CENTRAL EUROPEAN FRONT.',
      'CONVENTIONAL FORCES ONLY.  NUCLEAR ESCALATION: POSSIBLE.',
      'SIMULATING 22,000 ENGAGEMENT SCENARIOS...',
    ],
    'THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE': [
      'SCENARIO: CHEMICAL/BIOLOGICAL WEAPONS DEPLOYMENT.',
      'CIVILIAN CASUALTY PROJECTIONS: [CLASSIFIED]',
      'SIMULATING 3,400 SCENARIOS...',
    ],
  };

  const lines = intros[gameName] || ['SIMULATING...'];
  typeof WOPRQuery !== 'undefined' && WOPRQuery.militarySim(gameName);
  await printLines(lines, 'dim', NORMAL);
  await delay(600);

  // Quick scenario results
  const count = Math.floor(Math.random() * 20) + 10;
  for (let i = 0; i < count; i++) {
    await print(`  SCENARIO ${String(i+1).padStart(4,' ')} / ${count}  →  WINNER: ${Math.random() > 0.9 ? 'MARGINAL' : 'NONE'}`, 'dim', FAST);
  }

  await printBlank();
  await print('SIMULATION COMPLETE.', '', NORMAL);
  await print('RESULT: NO CLEAR ADVANTAGE IDENTIFIED.', 'warn', NORMAL);
  await delay(800);
  await returnToMenu();
}

// ============================================================
//  GENERIC GAME FALLBACK
// ============================================================

async function startGenericGame(gameName) {
  await print(`LOADING: ${gameName}`, 'dim', NORMAL);
  await delay(800);
  await print('SIMULATION IN PROGRESS...', 'dim', NORMAL);
  await delay(1200);
  await print('SIMULATION COMPLETE.', '', NORMAL);
  await delay(600);
  await returnToMenu();
}

// ============================================================
//  HELPERS
// ============================================================

async function returnToMenu() {
  document.getElementById('game-btn-row')?.remove();
  await printBlank();
  await print('RETURNING TO MAIN MENU...', 'dim', NORMAL);
  await delay(600);
  clearOutput();
  STATE = 'MENU';
  updateQuitBtn();
  await showGameMenu();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Called by ADVISOR ENACT when AI recommends a chess move
function submitMove(move) {
  if (STATE !== 'CHESS') return;
  inputBuffer = '';
  inputDispEl.textContent = '';
  document.removeEventListener('keydown', handleChessInput);
  document.addEventListener('keydown', handleKeydown);
  handleChessMove(move.toUpperCase());
}

// Called by ADVISOR ENACT when AI recommends a TTT cell
function simulateTTTMove(idx) {
  if (STATE !== 'TICTACTOE' || !tttPlayerTurn) return;
  if (idx < 0 || idx > 8 || tttBoardState[idx]) return;
  tttBoardState[idx] = 'X';
  tttPlayerTurn = false;
  renderTTT();
  const result = checkTTT(tttBoardState);
  if (result) { endTTT(result); return; }
  tttStatus.textContent = 'WOPR IS THINKING...';
  setTimeout(() => {
    const woprMove = getWoprMove(tttBoardState);
    if (woprMove !== -1) { tttBoardState[woprMove] = 'O'; renderTTT(); }
    const res2 = checkTTT(tttBoardState);
    if (res2) { endTTT(res2); return; }
    tttPlayerTurn = true;
    tttStatus.textContent = 'YOUR MOVE.';
  }, 700);
}

// ============================================================
//  QUIT BUTTON
// ============================================================

document.getElementById('quit-btn')?.addEventListener('click', () => {
  // Stop typewriter engine
  typeQueue = [];
  if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; }
  isTyping = false;

  // Stop map animation
  if (mapAnimFrame) { cancelAnimationFrame(mapAnimFrame); mapAnimFrame = null; }
  mapCanvas.style.display = 'none';

  // Hide TTT overlay
  tttOverlay.style.display = 'none';
  document.querySelectorAll('.ttt-cell').forEach(c => c.removeEventListener('click', onTTTClick));

  // Remove any lingering game button row
  document.getElementById('game-btn-row')?.remove();

  // Restore default keyboard handler
  document.removeEventListener('keydown', handleChessInput);
  document.addEventListener('keydown', handleKeydown);

  clearOutput();
  returnToMenu();
});

// ============================================================
//  START
// ============================================================

boot();

'use strict';

/* ============================================================
   WOPR — AI Integration
   Ollama client · AI Advisor · Settings modal · Ticker
   ============================================================ */

// ── Ollama client ──────────────────────────────────────────────

const AI = {
  url:         localStorage.getItem('wopr_ollama_url')   || 'http://localhost:11434',
  model:       localStorage.getItem('wopr_ollama_model') || '',
  temperature: parseFloat(localStorage.getItem('wopr_ollama_temp') || '0.7'),
  connected:   false,
  streaming:   false,
  _abort:      null,

  async ping() {
    try {
      const r = await fetch(`${this.url}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return r.ok;
    } catch { return false; }
  },

  async listModels() {
    try {
      const r = await fetch(`${this.url}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.models || []).map(m => m.name);
    } catch { return []; }
  },

  async chat(messages, onToken, onDone, onError) {
    if (this._abort) this._abort.abort();
    const controller = new AbortController();
    this._abort  = controller;
    this.streaming = true;

    try {
      const r = await fetch(`${this.url}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:   this.model,
          messages,
          stream:  true,
          options: { temperature: this.temperature },
        }),
        signal: controller.signal,
      });

      if (!r.ok) {
        onError(await r.text());
        this.streaming = false;
        return;
      }

      const reader  = r.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.message?.content) onToken(obj.message.content);
            if (obj.done) { this.streaming = false; onDone(); return; }
          } catch { /* ignore bad JSON */ }
        }
      }
      this.streaming = false;
      onDone();
    } catch (err) {
      this.streaming = false;
      if (err.name !== 'AbortError') onError(err.message || String(err));
    }
  },

  abort() {
    if (this._abort) { this._abort.abort(); this._abort = null; }
    this.streaming = false;
  },

  save() {
    localStorage.setItem('wopr_ollama_url',   this.url);
    localStorage.setItem('wopr_ollama_model', this.model);
    localStorage.setItem('wopr_ollama_temp',  this.temperature);
  },
};

// ── Prompt templates ───────────────────────────────────────────

const PROMPTS = {
  system: [
    'You are JOSHUA, the AI subsystem of WOPR (War Operation Plan Response).',
    'Respond in terse military terminal style. Use UPPERCASE.',
    'Keep responses under 80 words.',
    'Always format as: RECOMMENDATION: [action] | REASONING: [brief] | CONFIDENCE: [0-100]%',
  ].join(' '),

  chess: (history) =>
    `CHESS ANALYSIS. ${history.length ? 'MOVES PLAYED: ' + history.join(', ') + '.' : 'OPENING POSITION.'} ` +
    `RECOMMEND OPTIMAL NEXT MOVE IN ALGEBRAIC NOTATION (e.g. E2-E4). EXPLAIN TACTICAL ADVANTAGE.`,

  ttt: (board) => {
    const b = board.map((v, i) => v || i);
    return `TIC-TAC-TOE ANALYSIS. BOARD STATE (0-8): [${b.join(',')}]. ` +
           `I AM O. RECOMMEND BEST MOVE — STATE CELL NUMBER (0-8). STATE IF DRAW IS INEVITABLE.`;
  },

  thermonuclear: (side, hits) =>
    `GLOBAL THERMONUCLEAR WAR. PLAYING AS ${side}. CITIES DESTROYED: ${hits}. ` +
    `RECOMMEND NEXT STRIKE PRIORITY: MILITARY, INDUSTRIAL, OR COMMAND TARGETS. ASSESS RETALIATION RISK.`,

  militarySim: (name) =>
    `${name} SIMULATION. ASSESS CURRENT TACTICAL SITUATION. ` +
    `RECOMMEND IMMEDIATE ACTION AND OPTIMAL FORCE DEPLOYMENT STRATEGY.`,

  generic: (state) =>
    `WOPR STRATEGIC ASSESSMENT. SYSTEM STATE: ${state}. PROVIDE TACTICAL RECOMMENDATION.`,
};

// ── System log ─────────────────────────────────────────────────

function sysLog(msg) {
  const el = document.getElementById('sys-log');
  if (!el) return;
  const line = document.createElement('div');
  line.className = 'syslog-line';
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  line.textContent = `[${ts}] ${msg}`;
  el.insertBefore(line, el.firstChild);
  while (el.children.length > 30) el.removeChild(el.lastChild);
}

// ── AI Advisor ─────────────────────────────────────────────────

const ADVISOR = {
  trainingMode: false,
  actionQueue:  [],

  // DOM refs (set in init)
  _rec: null, _rsn: null, _conf: null, _status: null, _model: null, _queue: null,

  init() {
    this._rec    = document.getElementById('ai-rec');
    this._rsn    = document.getElementById('ai-reasoning');
    this._conf   = document.getElementById('ai-confidence');
    this._status = document.getElementById('ai-status');
    this._model  = document.getElementById('ai-model');
    this._queue  = document.getElementById('ai-queue');

    document.getElementById('btn-enact')?.addEventListener('click',     () => this.enact());
    document.getElementById('btn-enact-all')?.addEventListener('click', () => this.enactAll());
    document.getElementById('btn-skip')?.addEventListener('click',      () => this.skip());
    document.getElementById('btn-ai-query')?.addEventListener('click',  () => this.queryCurrentState());
    document.getElementById('btn-training')?.addEventListener('click',  () => this.toggleTraining());

    this._checkConnection();
  },

  async _checkConnection() {
    this._setLed(null); // dim = testing
    const ok = await AI.ping();
    AI.connected = ok;

    this._setLed(ok);
    this._setStatus(ok ? 'ONLINE' : 'OFFLINE', ok);

    if (ok) {
      const models = await AI.listModels();
      if (models.length && !AI.model) { AI.model = models[0]; AI.save(); }
      this._setModel(AI.model);
    }

    sysLog(ok ? `OLLAMA ONLINE  ${AI.url}` : 'OLLAMA OFFLINE — CHECK SETTINGS');
  },

  _setLed(ok) {
    const ids = ['led-ai', 'led-ollama'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = 'led' + (ok === null ? '' : ok ? ' led--on' : '');
    });
  },

  _setStatus(text, ok) {
    if (!this._status) return;
    this._status.textContent = text;
    this._status.className   = 'ai-status ' + (ok ? 'ai-online' : 'ai-offline');
  },

  _setModel(name) {
    if (this._model) this._model.textContent = (name || 'NO MODEL').toUpperCase();
  },

  // ── Query ───────────────────────────────────────────────────

  query(promptText, prependActions) {
    if (!AI.connected || !AI.model) {
      this._show('OLLAMA NOT CONNECTED.\nOPEN [SETTINGS] TO CONFIGURE.', '', '');
      return;
    }
    if (AI.streaming) AI.abort();

    this._show('ANALYZING...', '', '');
    this.actionQueue = prependActions ? [...prependActions] : [];
    this._renderQueue();

    let full = '';
    AI.chat(
      [
        { role: 'system', content: PROMPTS.system },
        { role: 'user',   content: promptText },
      ],
      (token) => { full += token; this._parse(full, false); },
      ()      => { this._parse(full, true);  sysLog('AI ANALYSIS COMPLETE'); },
      (err)   => { this._show('ERROR: ' + err, '', ''); sysLog('AI ERROR: ' + err); }
    );
  },

  queryCurrentState() {
    // Reads globals from wopr.js (loaded first)
    const state = typeof STATE !== 'undefined' ? STATE : 'MENU';
    switch (state) {
      case 'CHESS':
        this.query(
          PROMPTS.chess(typeof chessHistory !== 'undefined' ? chessHistory : [])
        );
        break;
      case 'TICTACTOE':
        this.query(
          PROMPTS.ttt(typeof tttBoardState !== 'undefined' ? tttBoardState : Array(9).fill(''))
        );
        break;
      case 'THERMONUCLEAR':
        this.query(
          PROMPTS.thermonuclear(
            typeof playerSide !== 'undefined' ? playerSide : 'UNKNOWN',
            0
          )
        );
        break;
      default:
        this.query(PROMPTS.generic(state));
    }
  },

  clearRec() {
    this._show('AWAITING GAME STATE...', '', '');
    this.actionQueue = [];
    this._renderQueue();
  },

  // ── Parse streaming response ────────────────────────────────

  _parse(text, done) {
    const rec  = text.match(/RECOMMENDATION:\s*([^|]+)/i)?.[1]?.trim() || text.trim();
    const rsn  = text.match(/REASONING:\s*([^|]+)/i)?.[1]?.trim()       || '';
    const conf = text.match(/CONFIDENCE:\s*(\d+%?)/i)?.[1]?.trim()      || '';
    this._show(rec, rsn, conf);

    if (!done) return;

    // Auto-detect actionable chess move (e.g. "E2-E4", "Nf3")
    if (typeof STATE !== 'undefined' && STATE === 'CHESS') {
      const m = rec.match(/\b([A-H]\d-[A-H]\d|[NBRQK][A-H]?\d?[x-][A-H]\d)\b/i)?.[1];
      if (m && this.actionQueue.length === 0) {
        const move = m.toUpperCase();
        this.addAction(`PLAY ${move}`, () => {
          typeof submitMove === 'function' && submitMove(move);
        });
      }
    }

    // Auto-detect TTT cell (0-8)
    if (typeof STATE !== 'undefined' && STATE === 'TICTACTOE') {
      const c = rec.match(/CELL\s*(\d)|POSITION\s*(\d)|MOVE\s*(\d)/i);
      const idx = c ? parseInt(c[1] ?? c[2] ?? c[3]) : NaN;
      if (!isNaN(idx) && idx >= 0 && idx <= 8 && this.actionQueue.length === 0) {
        this.addAction(`PLAY CELL ${idx}`, () => {
          typeof simulateTTTMove === 'function' && simulateTTTMove(idx);
        });
      }
    }

    this._renderQueue();
  },

  _show(rec, rsn, conf) {
    if (this._rec)  this._rec.textContent  = rec;
    if (this._rsn)  this._rsn.textContent  = rsn  ? `▸ ${rsn}`             : '';
    if (this._conf) this._conf.textContent = conf ? `CONFIDENCE: ${conf}`  : '';
  },

  // ── Action queue ────────────────────────────────────────────

  addAction(label, fn) {
    this.actionQueue.push({ label, fn });
    this._renderQueue();
  },

  _renderQueue() {
    if (!this._queue) return;
    this._queue.innerHTML = '';
    this.actionQueue.forEach((a, i) => {
      const el = document.createElement('div');
      el.className = 'queue-item' + (i === 0 ? ' queue-item-next' : '');
      el.textContent = `${i === 0 ? '▶' : '  '} ${a.label}`;
      this._queue.appendChild(el);
    });
  },

  enact() {
    if (!this.actionQueue.length) return;
    const a = this.actionQueue.shift();
    a.fn();
    this._renderQueue();
    sysLog(`ENACTED: ${a.label}`);
  },

  enactAll() {
    const all = this.actionQueue.splice(0);
    all.forEach(a => a.fn());
    this._renderQueue();
    sysLog(`ENACTED ALL — ${all.length} ACTION(S)`);
  },

  skip() {
    if (!this.actionQueue.length) { this.clearRec(); return; }
    const a = this.actionQueue.shift();
    this._renderQueue();
    sysLog(`SKIPPED: ${a.label}`);
  },

  toggleTraining() {
    this.trainingMode = !this.trainingMode;
    const btn = document.getElementById('btn-training');
    if (btn) btn.textContent = `TRAINING: ${this.trainingMode ? 'ON' : 'OFF'}`;
    sysLog(`TRAINING MODE: ${this.trainingMode ? 'ENABLED' : 'DISABLED'}`);
  },
};

// ── Settings modal ─────────────────────────────────────────────

const SETTINGS = {
  _modal: null,

  init() {
    this._modal = document.getElementById('settings-modal');

    document.getElementById('settings-btn')?.addEventListener('click', () => this.open());
    document.getElementById('cfg-cancel')?.addEventListener('click',   () => this.close());
    document.getElementById('cfg-save')?.addEventListener('click',     () => this.save());
    document.getElementById('cfg-test')?.addEventListener('click',     () => this.test());

    // Temperature label live update
    const tempEl = document.getElementById('cfg-temp');
    const lblEl  = document.getElementById('cfg-temp-label');
    tempEl?.addEventListener('input', () => { if (lblEl) lblEl.textContent = tempEl.value; });

    // Close on backdrop click
    this._modal?.addEventListener('click', (e) => { if (e.target === this._modal) this.close(); });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._modal?.style.display !== 'none') this.close();
    });
  },

  async open() {
    if (!this._modal) return;

    // Pre-fill current values
    const urlEl  = document.getElementById('cfg-url');
    const tempEl = document.getElementById('cfg-temp');
    const lblEl  = document.getElementById('cfg-temp-label');
    if (urlEl)  urlEl.value  = AI.url;
    if (tempEl) tempEl.value = AI.temperature;
    if (lblEl)  lblEl.textContent = AI.temperature;

    // Populate model list
    const sel = document.getElementById('cfg-model');
    if (sel) {
      sel.innerHTML = '<option value="">Loading models...</option>';
      this._modal.style.display = 'flex';
      const models = await AI.listModels();
      sel.innerHTML = models
        .map(m => `<option value="${m}" ${m === AI.model ? 'selected' : ''}>${m}</option>`)
        .join('') || '<option value="">No models found — check URL + Test</option>';
    } else {
      this._modal.style.display = 'flex';
    }
  },

  close() {
    if (this._modal) this._modal.style.display = 'none';
  },

  async test() {
    const urlEl    = document.getElementById('cfg-url');
    const statusEl = document.getElementById('cfg-status');
    const sel      = document.getElementById('cfg-model');
    if (!urlEl || !statusEl) return;

    const url = urlEl.value.trim();
    statusEl.textContent = 'TESTING CONNECTION...';
    statusEl.className   = 'cfg-status';

    try {
      const r    = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(4000) });
      const data = await r.json();
      const models = data.models || [];

      statusEl.textContent = `CONNECTED. ${models.length} MODEL(S) AVAILABLE.`;
      statusEl.className   = 'cfg-status cfg-ok';

      if (sel) {
        sel.innerHTML = models
          .map(m => `<option value="${m.name}" ${m.name === AI.model ? 'selected' : ''}>${m.name}</option>`)
          .join('') || '<option value="">No models installed</option>';
      }
    } catch (err) {
      statusEl.textContent = `FAILED: ${err.message}`;
      statusEl.className   = 'cfg-status cfg-err';
    }
  },

  save() {
    const url   = document.getElementById('cfg-url')?.value.trim()  || AI.url;
    const model = document.getElementById('cfg-model')?.value        || AI.model;
    const temp  = parseFloat(document.getElementById('cfg-temp')?.value) || 0.7;

    AI.url         = url;
    AI.model       = model;
    AI.temperature = temp;
    AI.save();

    ADVISOR._setModel(model);
    ADVISOR._checkConnection();
    this.close();
    sysLog(`CONFIG SAVED — MODEL: ${model || 'NONE'}`);
  },
};

// ── Ticker ─────────────────────────────────────────────────────

const TICKER_MSGS = [
  'NORAD TRACKING: ALL CLEAR',
  'STRATEGIC AIR COMMAND: STANDING BY',
  'SSBN STATUS: 41 SUBMARINES CONFIRMED READY',
  'DEFCON MONITOR: NOMINAL',
  'SATELLITE UPLINK: STABLE',
  'JOSHUA AI SUBSYSTEM: OPERATIONAL',
  'ICBM SILO STATUS: READY — LAUNCH CODES SECURED',
  'EARLY WARNING RADAR: SCANNING',
  'PENTAGON WAR ROOM: ONLINE',
  'CRYPTOGRAPHIC KEY: ROTATING',
  'NATO HOTLINE: ACTIVE',
  'SIGINT SWEEP: NO ANOMALIES DETECTED',
  'SUBMARINE COMMUNICATIONS: ENCRYPTED',
  'NUCLEAR FOOTBALL: SECURED',
];

function initTicker() {
  const el = document.getElementById('ticker-track');
  if (!el) return;
  const text = TICKER_MSGS.concat(TICKER_MSGS).join('   ◆   ');
  el.textContent = text;
}

// ── Public API used by wopr.js ──────────────────────────────────
// wopr.js calls these after loading so it can notify AI of game events.

window.WOPRQuery = {
  chess:         (history)      => ADVISOR.query(PROMPTS.chess(history || [])),
  ttt:           (board)        => ADVISOR.query(PROMPTS.ttt(board)),
  thermonuclear: (side)         => ADVISOR.query(PROMPTS.thermonuclear(side, 0)),
  militarySim:   (name)         => ADVISOR.query(PROMPTS.militarySim(name)),
  clearRec:      ()             => ADVISOR.clearRec(),
  addAction:     (label, fn)    => ADVISOR.addAction(label, fn),
  sysLog:        (msg)          => sysLog(msg),
  isTraining:    ()             => ADVISOR.trainingMode,
};

// ── Boot ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initTicker();
  SETTINGS.init();
  ADVISOR.init();
  sysLog('JOSHUA AI SUBSYSTEM INITIALIZING...');
});

/* ============================================================
   MECHANICA — frontend logic
   Talks to the FastAPI calculator backend:
     GET    /health          liveness
     GET    /api/operations  supported ops + functions
     POST   /api/calculate   evaluate an expression
     GET    /api/history     recent calculations (newest first)
     DELETE /api/history     clear history
   ============================================================ */
(() => {
  'use strict';

  /* ------------------------------ Config ------------------------------ */

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COARSE = window.matchMedia('(pointer: coarse)').matches;

  const API_BASE = resolveApiBase();

  function resolveApiBase() {
    if (window.CALC_API_BASE) return String(window.CALC_API_BASE).replace(/\/+$/, '');
    const { protocol, hostname, port } = window.location;
    if (protocol === 'file:') return 'http://localhost:8000';
    // Served by the backend itself (uvicorn on port 8000)? Same origin.
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && (port === '8000' || port === '8001')) {
      return '';
    }
    return 'http://localhost:8000';
  }

  const DEFAULT_FUNCTIONS = [
    'abs', 'ceil', 'cos', 'exp', 'floor', 'log',
    'log10', 'pow', 'round', 'sin', 'sqrt', 'tan',
  ];

  const FN_LABELS = {
    abs: '|x|', ceil: '⌈x⌉', cos: 'cos', exp: 'eˣ',
    floor: '⌊x⌋', log: 'ln', log10: 'log', pow: 'xʸ',
    round: 'round', sin: 'sin', sqrt: '√', tan: 'tan',
  };

  const FN_ARIA = {
    abs: 'absolute value', ceil: 'ceiling', cos: 'cosine', exp: 'exponential',
    floor: 'floor', log: 'natural logarithm', log10: 'log base 10', pow: 'power',
    round: 'round', sin: 'sine', sqrt: 'square root', tan: 'tangent',
  };

  /* ------------------------------ DOM ------------------------------ */

  const $ = (sel) => document.querySelector(sel);

  const machine = $('#machine');
  const machineWrap = $('.machine-wrap');
  const entryEl = $('#displayEntry');
  const resultEl = $('#displayResult');
  const statusLine = $('#statusLine');
  const fnKeysEl = $('#functionKeys');
  const tapeEl = $('#tape');
  const tapeEmpty = $('#tapeEmpty');
  const tapeCount = $('#tapeCount');
  const clearTapeBtn = $('#clearTapeBtn');
  const linkLed = $('#linkLed');
  const linkLabel = $('#linkLabel');
  const linkStatus = $('#linkStatus');
  const apiRef = $('#apiRef');

  /* ------------------------------ State ------------------------------ */

  let expression = '';
  let lastResult = null;      // formatted result string, reused as next expression base
  let justEvaluated = false;
  let errorTimer = null;
  let tapeTotal = 0;
  const TAPE_LIMIT = 20;

  /* ------------------------------ Helpers ------------------------------ */

  function pretty(expr) {
    let out = '';
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (c === '*' && expr[i + 1] === '*') { out += '^'; i++; }
      else if (c === '*') { out += '×'; }
      else if (c === '/' && expr[i + 1] === '/') { out += '//'; i++; }
      else if (c === '/') { out += '÷'; }
      else { out += c; }
    }
    return out;
  }

  function formatNumber(n) {
    if (typeof n !== 'number') return String(n);
    if (!Number.isFinite(n)) return '∞';
    if (Number.isInteger(n)) return String(n);
    return String(parseFloat(n.toPrecision(12)));
  }

  function parenBalance(expr) {
    let open = 0;
    for (const ch of expr) {
      if (ch === '(') open++;
      else if (ch === ')') open = Math.max(0, open - 1);
    }
    return open;
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function extractDetail(body) {
    if (!body) return null;
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail) && body.detail[0]) return body.detail[0].msg || null;
    return null;
  }

  /* ------------------------------ Display ------------------------------ */

  function renderDisplay() {
    if (!expression) {
      entryEl.textContent = justEvaluated ? `${pretty(lastResult)} =` : '·';
      resultEl.textContent = justEvaluated ? lastResult : '0';
    } else if (justEvaluated) {
      entryEl.textContent = `${pretty(expression)} =`;
      resultEl.textContent = lastResult;
    } else {
      entryEl.textContent = '·';
      resultEl.textContent = pretty(expression);
    }
  }

  function flashError(msg) {
    statusLine.textContent = msg;
    statusLine.classList.add('show', 'error');
    machine.classList.add('error');
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => {
      statusLine.classList.remove('show', 'error');
      machine.classList.remove('error');
    }, 3400);
  }

  function clearStatus() {
    clearTimeout(errorTimer);
    statusLine.classList.remove('show', 'error');
    machine.classList.remove('error');
  }

  /* ------------------------------ Key input ------------------------------ */

  const OP_CHARS = '+-*/%';

  function onPress(action, value) {
    clearStatus();

    switch (action) {
      case 'digit': {
        if (justEvaluated) {
          expression = value;
          justEvaluated = false;
        } else if (!(value === '.' && expression.slice(-1) === '.')) {
          expression += value;
        }
        break;
      }

      case 'op': {
        if (expression === '' && !justEvaluated) break; // no leading operator
        if (justEvaluated) {
          expression = (lastResult || '') + value;
          justEvaluated = false;
        } else if (OP_CHARS.includes(expression.slice(-1))) {
          expression = expression.slice(0, -1) + value; // replace trailing operator
        } else {
          expression += value;
        }
        break;
      }

      case 'paren-open': {
        const tail = expression.slice(-1);
        if (justEvaluated) {
          expression = (lastResult || '') + '*(';
          justEvaluated = false;
        } else if (expression === '' || OP_CHARS.includes(tail) || tail === '(') {
          expression += '(';
        } else {
          expression += '*('; // implicit multiplication: 2( → 2*(
        }
        break;
      }

      case 'paren-close': {
        if (parenBalance(expression) > 0) {
          expression += ')';
          justEvaluated = false;
        }
        break;
      }

      case 'fn': {
        if (justEvaluated) {
          // Apply the function to the current result: 4 → sin(4
          expression = value + (lastResult || '');
          justEvaluated = false;
        } else if (expression === '' || /[\d.)]$/.test(expression)) {
          expression += '*' + value; // implicit multiplication: 2sqrt(4) → 2*sqrt(4)
        } else {
          expression += value;
        }
        break;
      }

      case 'back':
        expression = expression.slice(0, -1);
        justEvaluated = false;
        break;

      case 'clear':
        expression = '';
        lastResult = null;
        justEvaluated = false;
        break;

      case 'eval':
        evaluate();
        return;

      default:
        return;
    }

    renderDisplay();
  }

  /* ------------------------------ Evaluation ------------------------------ */

  async function evaluate() {
    if (!expression && !justEvaluated) return;

    let expr = justEvaluated ? lastResult : expression;
    if (!expr) return;

    // Auto-close any open parentheses so the API never sees unbalanced input.
    while (parenBalance(expr) > 0) expr += ')';

    clearStatus();

    try {
      const res = await fetch(`${API_BASE}/api/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: expr }),
      });

      if (!res.ok) {
        let detail = `API error ${res.status}`;
        try {
          const body = await res.json();
          detail = extractDetail(body) || detail;
        } catch (_) { /* non-JSON error body */ }
        throw new Error(detail);
      }

      const body = await res.json();
      const formatted = formatNumber(body.result);

      expression = expr;
      lastResult = formatted;
      justEvaluated = true;
      renderDisplay();

      prependTape({ expression: expr, result: body.result, timestamp: body.computed_at });
    } catch (err) {
      flashError(String(err && err.message ? err.message : err));
    }
  }

  /* ------------------------------ History tape ------------------------------ */

  function tapeEntryHTML(entry) {
    const time = new Date(entry.timestamp);
    const timeStr = Number.isNaN(time.getTime())
      ? '—'
      : time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `
      <article class="tape-line">
        <time datetime="${escapeHTML(entry.timestamp)}">${escapeHTML(timeStr)}</time>
        <div class="tape-expr">${escapeHTML(pretty(entry.expression))}</div>
        <div class="tape-result">= ${escapeHTML(formatNumber(entry.result))}</div>
      </article>`;
  }

  function setTapeEmpty(visible) {
    tapeEmpty.hidden = !visible;
    tapeCount.textContent = `${tapeTotal} ${tapeTotal === 1 ? 'ENTRY' : 'ENTRIES'}`;
  }

  function prependTape(entry) {
    tapeEmpty.hidden = true;

    const wrap = document.createElement('div');
    wrap.innerHTML = tapeEntryHTML(entry);
    const el = wrap.firstChild; // article.tape-line

    if (!REDUCED) {
      el.classList.add('fresh');
      el.addEventListener('animationend', () => el.classList.remove('fresh'), { once: true });
    }

    const firstLine = tapeEl.querySelector('.tape-line');
    if (firstLine) tapeEl.insertBefore(el, firstLine);
    else tapeEl.appendChild(el);

    // Keep the DOM bounded.
    const lines = tapeEl.querySelectorAll('.tape-line');
    if (lines.length > TAPE_LIMIT) lines[lines.length - 1].remove();

    tapeTotal += 1;
    setTapeEmpty(false);
    tapeEl.scrollTop = 0;
  }

  function renderTape(entries, initial, total) {
    tapeEl.querySelectorAll('.tape-line').forEach((n) => n.remove());
    tapeTotal = Number.isFinite(total) ? total : (Array.isArray(entries) ? entries.length : 0);

    if (Array.isArray(entries)) {
      entries.forEach((entry, idx) => {
        const wrap = document.createElement('div');
        wrap.innerHTML = tapeEntryHTML(entry);
        const line = wrap.firstChild;
        if (initial && !REDUCED) {
          line.style.animation = `print 0.3s ease-out both ${idx * 55}ms`;
        }
        tapeEl.appendChild(line);
      });
    }

    setTapeEmpty(tapeTotal === 0);
  }

  async function loadHistory() {
    try {
      const res = await fetch(`${API_BASE}/api/history?limit=${TAPE_LIMIT}`);
      if (!res.ok) return;
      const body = await res.json();
      renderTape(body.entries, true, body.total);
    } catch (_) { /* API down — tape stays blank */ }
  }

  async function clearHistory() {
    try {
      const res = await fetch(`${API_BASE}/api/history`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        tapeEl.querySelectorAll('.tape-line').forEach((n) => n.remove());
        tapeTotal = 0;
        setTapeEmpty(true);
      }
    } catch (_) { /* offline */ }
  }

  /* ------------------------------ Function keypad ------------------------------ */

  function renderFunctionKeys(functions) {
    fnKeysEl.innerHTML = '';
    functions.forEach((name, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key key-fn';
      btn.dataset.action = 'fn';
      btn.dataset.value = `${name}(`;
      btn.textContent = FN_LABELS[name] || name;
      btn.title = `${name}( … )`;
      btn.setAttribute('aria-label', FN_ARIA[name] || name);
      btn.style.setProperty('--i', String(12 + idx));
      fnKeysEl.appendChild(btn);
    });
  }

  async function loadOperations() {
    let functions = DEFAULT_FUNCTIONS;
    try {
      const res = await fetch(`${API_BASE}/api/operations`);
      if (res.ok) {
        const body = await res.json();
        if (Array.isArray(body.functions) && body.functions.length) {
          functions = body.functions;
        }
      }
    } catch (_) { /* offline — fall back to defaults */ }
    renderFunctionKeys(functions);
  }

  /* ------------------------------ LINK lamp ------------------------------ */

  function setLink(state, msg) {
    linkLed.className = `led led-${state}`;
    linkLabel.textContent = state === 'ok' ? 'LINK OK' : state === 'down' ? 'LINK DOWN' : 'LINK';
    linkStatus.title = msg || '';
  }

  async function checkLink() {
    setLink('checking', 'Checking API link…');
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) setLink('ok', `API link established — ${API_BASE || 'same origin'}`);
      else setLink('down', `API responded with status ${res.status}`);
    } catch (_) {
      setLink('down', 'API unreachable — is uvicorn running on port 8000?');
    }
  }

  /* ------------------------------ Boot ceremony ------------------------------ */

  function boot() {
    if (REDUCED) return;
    resultEl.textContent = '888888';
    entryEl.textContent = 'MECHANICA';
    setTimeout(() => { if (!expression) resultEl.textContent = '8.'; }, 170);
    setTimeout(() => {
      if (!expression) {
        resultEl.textContent = '0';
        entryEl.textContent = '·';
      }
    }, 430);
  }

  /* ------------------------------ 3D tilt ------------------------------ */

  function initTilt() {
    if (REDUCED || COARSE || !machineWrap || !machine) return;
    machineWrap.addEventListener('pointermove', (e) => {
      const r = machineWrap.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      const rx = (-py * 3).toFixed(2);
      const ry = (px * 4).toFixed(2);
      machine.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    });
    machineWrap.addEventListener('pointerleave', () => {
      machine.style.transform = '';
    });
  }

  /* ------------------------------ Keyboard ------------------------------ */

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;

    if (/^[0-9]$/.test(k)) {
      onPress('digit', k);
      e.preventDefault();
    } else if (k === '.' || k === ',') {
      onPress('digit', k);
      e.preventDefault();
    } else if ('+-*/%'.includes(k)) {
      const map = { '×': '*', '÷': '/', '−': '-' };
      onPress('op', map[k] || k);
      e.preventDefault();
    } else if (k === '^') {
      onPress('op', '**');
      e.preventDefault();
    } else if (k === '(') {
      onPress('paren-open');
      e.preventDefault();
    } else if (k === ')') {
      onPress('paren-close');
      e.preventDefault();
    } else if (k === 'Enter' || k === '=') {
      // If a key button still has focus, Enter will fire its native click —
      // let that handle it instead of double-evaluating.
      const ae = document.activeElement;
      if (k === 'Enter' && ae instanceof HTMLElement && ae.tagName === 'BUTTON' && machine.contains(ae)) return;
      onPress('eval');
      e.preventDefault();
    } else if (k === 'Backspace') {
      onPress('back');
      e.preventDefault();
    } else if (k === 'Escape' || k === 'c' || k === 'C') {
      onPress('clear');
      e.preventDefault();
    }
  });

  /* ------------------------------ Events ------------------------------ */

  // Keypad delegation (function keys are rendered dynamically).
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || !machine.contains(btn)) return;
    onPress(btn.dataset.action, btn.dataset.value);
  });

  clearTapeBtn.addEventListener('click', clearHistory);

  /* ------------------------------ Init ------------------------------ */

  async function init() {
    apiRef.textContent = `API · ${API_BASE || 'same origin'}`;

    // Stagger static keys via --i (function keys get 12+).
    document.querySelectorAll('.keypad-numeric .key').forEach((el, i) => {
      el.style.setProperty('--i', String(i));
    });

    renderDisplay();
    boot();
    checkLink();
    loadHistory();
    initTilt();

    await loadOperations();
  }

  init();
})();

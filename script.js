/* ═══════════════════════════════════════════════════════════
   PROJECT ECHO — Escape Room
   script.js  —  Full game logic with RANDOM PASSWORDS every time
═══════════════════════════════════════════════════════════ */

const STATE = {
  totalSeconds: 7 * 60,
  secondsLeft:  7 * 60,
  timerInterval: null,
  hintsLeft: 3,
  inventory: [],

  puzzles: {
    bookshelf: false,
    cabinet:   false,
    painting:  false,
    safe:      false,
    terminal:  false,
  },

  cabinetCode: "",
  safeCode:    "",
  exitCode:    ""
};

let PUZZLES = {};

/* Generate new random codes every game */
function generateRandomCodes() {
  // 4-digit cabinet code (1000–9999)
  STATE.cabinetCode = String(1000 + Math.floor(Math.random() * 9000));

  // 3-digit safe code (100–999)
  STATE.safeCode = String(100 + Math.floor(Math.random() * 900));

  // Exit code = cabinet code + safe code
  STATE.exitCode = STATE.cabinetCode + STATE.safeCode;

  // Update puzzle data with new codes
  PUZZLES = {
    bookshelf: {
      riddle: "I speak without a mouth, and hear without ears. I have no body, but I come alive with the wind. What am I?",
      options: ["A ghost", "An echo", "A shadow", "A dream"],
      correct: 1,
      reward: "note",
      rewardLabel: "Note 📝",
      hint: "The facility is called Project ECHO for a reason."
    },

    cabinet: {
      code: STATE.cabinetCode,
      clueText: `The sticky note inside the book reads:\n"Maintenance override sequence: ${STATE.cabinetCode.split('').join(' - ')}\nDo NOT share with subject."`
    },

    painting: {
      targetX: 0.68,
      targetY: 0.35,
      radius: 18,
      reward: "combo",
      rewardLabel: "Scrap of Paper 🔢"
    },

    safe: {
      code: STATE.safeCode,
      clueText: `Behind the painting you find a scrap of paper:\n"Safe — R3, L9, R1"\n(Right 3, Left 9, Right 1)\n\nActual combination: <strong>${STATE.safeCode}</strong>`
    },

    terminal: {
      answer: STATE.exitCode,
      clueText: `SYSTEM TERMINAL v4.2\n> Access denied.\n> Emergency override requires 7-digit code.\n> Format: [CABINET_CODE][SAFE_CODE]\n> _`
    }
  };
}

/* ──────────────────────────────────────────────────────────
   DOM REFERENCES
────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const introScreen  = $('intro-screen');
const gameScreen   = $('game-screen');
const winScreen    = $('win-screen');
const loseScreen   = $('lose-screen');
const timerEl      = $('timer');
const statusEl     = $('status-msg');
const hintCountEl  = $('hint-count');
const hintBtn      = $('hint-btn');
const hintPopup    = $('hint-popup');
const hintText     = $('hint-text');
const invSlots     = $('inventory-slots');
const modalOverlay = $('modal-overlay');
const modalContent = $('modal-content');
const modalClose   = $('modal-close');

/* ──────────────────────────────────────────────────────────
   AUDIO
────────────────────────────────────────────────────────── */
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playBeep(freq = 440, type = 'sine', duration = 0.15, vol = 0.25) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch(e) {}
}

const SFX = {
  click:   () => playBeep(600, 'square', 0.07, 0.15),
  success: () => { playBeep(523, 'sine', 0.15, 0.3); setTimeout(() => playBeep(659, 'sine', 0.2, 0.3), 150); setTimeout(() => playBeep(784, 'sine', 0.25, 0.3), 300); },
  error:   () => playBeep(180, 'sawtooth', 0.2, 0.3),
  collect: () => playBeep(880, 'triangle', 0.12, 0.2),
  alarm:   () => { playBeep(440, 'sawtooth', 0.1, 0.4); setTimeout(() => playBeep(350, 'sawtooth', 0.1, 0.4), 150); },
  win:     () => { [523,659,784,1047].forEach((f,i) => setTimeout(() => playBeep(f,'sine',0.3,0.35), i*150)); }
};

/* ──────────────────────────────────────────────────────────
   PARTICLES (Intro)
────────────────────────────────────────────────────────── */
function initParticles() {
  const canvas = $('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  particles = Array.from({ length: 60 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 1.5 + 0.5,
    dx: (Math.random() - 0.5) * 0.4,
    dy: (Math.random() - 0.5) * 0.4,
    alpha: Math.random() * 0.5 + 0.1
  }));

  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,255,224,${p.alpha})`;
      ctx.fill();
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
    });
    requestAnimationFrame(draw);
  }
  draw();
}

/* ──────────────────────────────────────────────────────────
   HELPERS
────────────────────────────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function startTimer() {
  STATE.timerInterval = setInterval(() => {
    STATE.secondsLeft--;
    timerEl.textContent = formatTime(STATE.secondsLeft);

    if (STATE.secondsLeft <= 60) {
      timerEl.className = 'timer danger';
      if (STATE.secondsLeft % 10 === 0) SFX.alarm();
    } else if (STATE.secondsLeft <= 180) {
      timerEl.className = 'timer warning';
    }

    if (STATE.secondsLeft <= 0) {
      clearInterval(STATE.timerInterval);
      triggerLose();
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(STATE.timerInterval);
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function addToInventory(id, emoji, label) {
  if (STATE.inventory.includes(id)) return;
  STATE.inventory.push(id);

  const slot = document.createElement('div');
  slot.className = 'inv-slot';
  slot.textContent = emoji;
  slot.dataset.label = label;
  slot.title = label;
  invSlots.appendChild(slot);

  SFX.collect();
  setStatus(`Added to inventory: ${label}`);
}

function hasItem(id) {
  return STATE.inventory.includes(id);
}

function openModal(html) {
  modalContent.innerHTML = html;
  modalOverlay.classList.remove('hidden');
}

function closeModal() {
  modalOverlay.classList.add('hidden');
}

/* ──────────────────────────────────────────────────────────
   HINT SYSTEM
────────────────────────────────────────────────────────── */
const HINTS = [
  "Start by examining the bookshelf — there is a book that catches your eye.",
  "Some items in your inventory contain clues. Hover over them.",
  "The exit door needs a 7-digit override code. Collect all codes first.",
  "The painting hides something in its upper-right quadrant.",
  "The safe combination is written in a lock-direction shorthand: R=Right, L=Left.",
  "Combine the cabinet code (4 digits) and the safe code (3 digits) for the terminal."
];

hintBtn.addEventListener('click', () => {
  if (STATE.hintsLeft <= 0) {
    setStatus('No hints remaining.');
    return;
  }
  STATE.hintsLeft--;
  hintCountEl.textContent = STATE.hintsLeft;
  if (STATE.hintsLeft === 0) hintBtn.disabled = true;

  let msg = HINTS[5];
  if (!STATE.puzzles.bookshelf) msg = HINTS[0];
  else if (!STATE.puzzles.cabinet) msg = HINTS[1];
  else if (!STATE.puzzles.painting) msg = HINTS[3];
  else if (!STATE.puzzles.safe) msg = HINTS[4];

  hintText.textContent = msg;
  hintPopup.classList.remove('hidden');
  setTimeout(() => hintPopup.classList.add('hidden'), 5000);
  SFX.click();
});

/* ──────────────────────────────────────────────────────────
   PUZZLES
────────────────────────────────────────────────────────── */

function openBookshelf() {
  SFX.click();
  if (STATE.puzzles.bookshelf) {
    openModal(`<h3>📚 BOOKSHELF</h3><p>You already took the note.</p><div class="modal-desc clue-text">${PUZZLES.cabinet.clueText}</div>`);
    return;
  }

  const opts = PUZZLES.bookshelf.options.map((o, i) => 
    `<button class="riddle-option" data-index="${i}">${o}</button>`
  ).join('');

  openModal(`
    <h3>📚 BOOKSHELF</h3>
    <div class="modal-desc">
      You find a single book lying open with a riddle:<br><br>
      <span class="clue-text">"${PUZZLES.bookshelf.riddle}"</span>
    </div>
    <div class="riddle-options">${opts}</div>
    <div class="feedback" id="riddle-feedback"></div>
  `);

  document.querySelectorAll('.riddle-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const chosen = parseInt(btn.dataset.index);
      const feedback = $('riddle-feedback');

      if (chosen === PUZZLES.bookshelf.correct) {
        btn.classList.add('correct');
        feedback.textContent = '✓ Correct! You notice a sticky note tucked inside.';
        feedback.className = 'feedback ok';
        SFX.success();
        STATE.puzzles.bookshelf = true;
        $('obj-bookshelf').classList.add('solved');
        addToInventory('note', '📝', 'Sticky Note');
        setTimeout(closeModal, 1800);
      } else {
        btn.classList.add('wrong');
        feedback.textContent = '✗ That doesn\'t feel right…';
        feedback.className = 'feedback err';
        SFX.error();
        setTimeout(() => btn.classList.remove('wrong'), 800);
      }
    });
  });
}

function openCabinet() {
  SFX.click();
  if (STATE.puzzles.cabinet) {
    openModal(`<h3>🗄️ CABINET — UNLOCKED</h3><p>You already took the keycard.</p>`);
    return;
  }

  openModal(`
    <h3>🗄️ CABINET CODE LOCK</h3>
    <div class="modal-desc clue-text">${hasItem('note') ? PUZZLES.cabinet.clueText : 'The cabinet is secured with a 4-digit code lock.'}</div>
    <input class="puzzle-input" id="cabinet-input" type="text" maxlength="4" placeholder="0000" autocomplete="off" />
    <button class="btn-submit" id="cabinet-submit">UNLOCK</button>
    <div class="feedback" id="cabinet-feedback"></div>
  `);

  const input = $('cabinet-input');
  input.focus();
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submitCabinet(); });
  $('cabinet-submit').addEventListener('click', submitCabinet);
}

function submitCabinet() {
  const input = $('cabinet-input');
  const val = input.value.trim();

  if (val === STATE.cabinetCode) {
    input.classList.add('success');
    $('cabinet-feedback').innerHTML = '✓ UNLOCKED — You find a <strong>LAB KEYCARD</strong> inside!';
    $('cabinet-feedback').className = 'feedback ok';
    SFX.success();
    STATE.puzzles.cabinet = true;
    $('obj-cabinet').classList.add('solved');
    $('cabinet-badge').textContent = '🔓';
    addToInventory('keycard', '🪪', 'Lab Keycard');
    setTimeout(closeModal, 1800);
  } else {
    input.classList.add('error');
    $('cabinet-feedback').textContent = '✗ Wrong code.';
    $('cabinet-feedback').className = 'feedback err';
    SFX.error();
    setTimeout(() => { input.classList.remove('error'); input.value = ''; input.focus(); }, 700);
  }
}

function openPainting() {
  SFX.click();
  if (STATE.puzzles.painting) {
    openModal(`<h3>🖼️ PAINTING</h3><p>You already found the scrap of paper.</p><div class="modal-desc clue-text">${PUZZLES.safe.clueText}</div>`);
    return;
  }

  openModal(`
    <h3>🖼️ ABSTRACT PAINTING</h3>
    <p>Click the spot that seems deliberately placed.</p>
    <canvas id="painting-canvas"></canvas>
    <div class="feedback" id="painting-feedback">Click somewhere on the painting…</div>
  `);

  requestAnimationFrame(drawPainting);
}

function drawPainting() {
  const canvas = $('painting-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = 400;
  const H = canvas.height = 220;

  // Background + abstract strokes (same as before)
  ctx.fillStyle = '#08080e';
  ctx.fillRect(0, 0, W, H);

  const strokes = [ /* keep your original strokes array */ 
    { x1:0.1,y1:0.8, x2:0.4,y2:0.2, c:'#1a1050', w:18 },
    { x1:0.0,y1:0.5, x2:0.6,y2:0.7, c:'#0a2030', w:22 },
    { x1:0.3,y1:0.0, x2:0.5,y2:1.0, c:'#150820', w:14 },
    { x1:0.6,y1:0.1, x2:0.9,y2:0.9, c:'#0d1a40', w:20 },
    { x1:0.2,y1:0.9, x2:0.8,y2:0.3, c:'#1e0a30', w:16 },
    { x1:0.5,y1:0.0, x2:0.1,y2:1.0, c:'#0a3020', w:10 },
    { x1:0.7,y1:0.6, x2:0.4,y2:0.1, c:'#302010', w:8  },
  ];

  strokes.forEach(s => {
    ctx.beginPath();
    ctx.moveTo(s.x1 * W, s.y1 * H);
    ctx.lineTo(s.x2 * W, s.y2 * H);
    ctx.strokeStyle = s.c;
    ctx.lineWidth = s.w;
    ctx.lineCap = 'round';
    ctx.stroke();
  });

  // Hidden marker
  const tx = PUZZLES.painting.targetX * W;
  const ty = PUZZLES.painting.targetY * H;
  ctx.beginPath(); ctx.arc(tx, ty, 4, 0, Math.PI*2); ctx.fillStyle = '#00ffe020'; ctx.fill();
  ctx.beginPath(); ctx.arc(tx, ty, 2, 0, Math.PI*2); ctx.fillStyle = '#00ffe040'; ctx.fill();

  canvas.addEventListener('click', function handler(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    if (Math.hypot(cx - tx, cy - ty) <= PUZZLES.painting.radius + 10) {
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI*2);
      ctx.strokeStyle = '#00ffe0';
      ctx.lineWidth = 2;
      ctx.stroke();

      $('painting-feedback').textContent = '✓ You found a scrap of paper!';
      $('painting-feedback').className = 'feedback ok';
      SFX.success();
      STATE.puzzles.painting = true;
      $('obj-painting').classList.add('solved');
      $('painting-badge').textContent = '✓';
      addToInventory('combo', '🔢', 'Scrap of Paper');
      canvas.removeEventListener('click', handler);
      setTimeout(closeModal, 2000);
    } else {
      $('painting-feedback').textContent = '✗ Nothing here...';
      $('painting-feedback').className = 'feedback err';
      SFX.error();
    }
  });
}

function openSafe() {
  SFX.click();
  if (!hasItem('keycard')) {
    openModal(`<h3>🔐 WALL SAFE</h3><p>You need the lab keycard to activate the dial.</p>`);
    return;
  }
  if (STATE.puzzles.safe) {
    openModal(`<h3>🔐 WALL SAFE</h3><p>The safe is already empty.</p>`);
    return;
  }

  openModal(`
    <h3>🔐 WALL SAFE</h3>
    <div class="modal-desc clue-text">${hasItem('combo') ? PUZZLES.safe.clueText : 'You need the combination.'}</div>
    <input class="puzzle-input" id="safe-input" type="text" maxlength="3" placeholder="000" autocomplete="off" />
    <button class="btn-submit" id="safe-submit">OPEN SAFE</button>
    <div class="feedback" id="safe-feedback"></div>
  `);

  const input = $('safe-input');
  input.focus();
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submitSafe(); });
  $('safe-submit').addEventListener('click', submitSafe);
}

function submitSafe() {
  const input = $('safe-input');
  if (input.value.trim() === STATE.safeCode) {
    input.classList.add('success');
    $('safe-feedback').innerHTML = '✓ OPENED — A USB drive is inside!';
    $('safe-feedback').className = 'feedback ok';
    SFX.success();
    STATE.puzzles.safe = true;
    $('obj-safe').classList.add('solved');
    $('safe-badge').textContent = '🔓';
    addToInventory('usb', '💾', 'USB Drive');
    setTimeout(closeModal, 1800);
  } else {
    input.classList.add('error');
    $('safe-feedback').textContent = '✗ Wrong combination.';
    $('safe-feedback').className = 'feedback err';
    SFX.error();
    setTimeout(() => { input.classList.remove('error'); input.value = ''; input.focus(); }, 700);
  }
}

function openTerminal() {
  SFX.click();
  if (STATE.puzzles.terminal) {
    openModal(`<h3>🖥️ TERMINAL</h3><p>Override already accepted. Go to the exit door.</p>`);
    return;
  }

  openModal(`
    <h3>🖥️ EMERGENCY TERMINAL</h3>
    <div class="modal-desc clue-text">${PUZZLES.terminal.clueText}</div>
    ${hasItem('usb') ? `<div class="modal-desc clue-text">USB hint: Combine cabinet code + safe code</div>` : ''}
    <input class="puzzle-input" id="terminal-input" type="text" maxlength="7" placeholder="0000000" autocomplete="off" />
    <button class="btn-submit" id="terminal-submit">SUBMIT OVERRIDE</button>
    <div class="feedback" id="terminal-feedback"></div>
  `);

  const input = $('terminal-input');
  input.focus();
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submitTerminal(); });
  $('terminal-submit').addEventListener('click', submitTerminal);
}

function submitTerminal() {
  const input = $('terminal-input');
  if (input.value.trim() === STATE.exitCode) {
    input.classList.add('success');
    $('terminal-feedback').textContent = '✓ OVERRIDE ACCEPTED — EXIT DOOR UNLOCKED!';
    $('terminal-feedback').className = 'feedback ok';
    SFX.success();
    STATE.puzzles.terminal = true;
    $('obj-terminal').classList.add('solved');
    setStatus('EXIT UNLOCKED — Go to the door!');
    setTimeout(closeModal, 1800);
  } else {
    input.classList.add('error');
    $('terminal-feedback').textContent = '✗ ACCESS DENIED.';
    $('terminal-feedback').className = 'feedback err';
    SFX.error();
    setTimeout(() => { input.classList.remove('error'); input.value = ''; input.focus(); }, 700);
  }
}

function tryExitDoor() {
  SFX.click();
  if (!STATE.puzzles.terminal) {
    openModal(`<h3>🚪 EXIT DOOR — SEALED</h3><p>You must first enter the override code at the terminal.</p>`);
  } else {
    stopTimer();
    SFX.win();
    $('time-left').textContent = formatTime(STATE.secondsLeft);
    setTimeout(() => showScreen('win-screen'), 600);
  }
}

function triggerLose() {
  SFX.alarm();
  setTimeout(() => showScreen('lose-screen'), 500);
}

/* ──────────────────────────────────────────────────────────
   RESTART
────────────────────────────────────────────────────────── */
function restartGame() {
  generateRandomCodes();

  STATE.secondsLeft = STATE.totalSeconds;
  STATE.hintsLeft = 3;
  STATE.inventory = [];
  STATE.puzzles = { bookshelf: false, cabinet: false, painting: false, safe: false, terminal: false };

  timerEl.textContent = formatTime(STATE.secondsLeft);
  timerEl.className = 'timer';
  hintCountEl.textContent = '3';
  hintBtn.disabled = false;
  invSlots.innerHTML = '';
  setStatus('Explore the room. Click objects to interact.');

  ['bookshelf','cabinet','painting','safe','terminal'].forEach(id => {
    const el = $(`obj-${id}`);
    if (el) el.classList.remove('solved');
  });
  $('cabinet-badge').textContent = '🔒';
  $('painting-badge').textContent = '❓';
  $('safe-badge').textContent = '🔒';

  closeModal();
  showScreen('intro-screen');
}

/* ──────────────────────────────────────────────────────────
   OBJECT BINDINGS
────────────────────────────────────────────────────────── */
function bindObjectClicks() {
  const bindings = {
    'obj-bookshelf': openBookshelf,
    'obj-cabinet':   openCabinet,
    'obj-painting':  openPainting,
    'obj-safe':      openSafe,
    'obj-terminal':  openTerminal,
    'obj-exit-door': tryExitDoor
  };

  Object.entries(bindings).forEach(([id, fn]) => {
    const el = $(id);
    if (el) {
      el.addEventListener('click', fn);
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fn();
        }
      });
    }
  });
}

/* ──────────────────────────────────────────────────────────
   START GAME
────────────────────────────────────────────────────────── */
function startGame() {
  generateRandomCodes();
  showScreen('game-screen');
  startTimer();
  setStatus('Explore the room. Click objects to interact.');
  SFX.click();
}

/* ──────────────────────────────────────────────────────────
   INIT
────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  bindObjectClicks();

  $('start-btn').addEventListener('click', startGame);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
  modalClose.addEventListener('click', closeModal);
});
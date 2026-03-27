/* ═══════════════════════════════════════════════════════════
   PROJECT ECHO — Escape Room
   script.js  —  All game logic, puzzles, timer, inventory
═══════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────
   GAME STATE
   One object holds everything about the current session.
────────────────────────────────────────────────────────── */
const STATE = {
  totalSeconds: 7 * 60,   // 7-minute countdown
  secondsLeft:  7 * 60,
  timerInterval: null,
  hintsLeft: 3,
  inventory: [],            // array of item IDs collected

  // Track which puzzles are solved
  puzzles: {
    bookshelf: false,       // Puzzle 1 — riddle clue (gives cabinet code)
    cabinet:   false,       // Puzzle 2 — number code lock
    painting:  false,       // Puzzle 3 — hidden-object (gives safe combo)
    safe:      false,       // Puzzle 4 — dial safe (gives keycard)
    terminal:  false,       // Puzzle 5 — terminal cipher (confirms exit code)
  }
};

/* ──────────────────────────────────────────────────────────
   PUZZLE DATA
────────────────────────────────────────────────────────── */
const PUZZLES = {
  // The bookshelf holds a riddle whose answer is the cabinet code
  bookshelf: {
    riddle:   "I speak without a mouth, and hear without ears. I have no body, but I come alive with the wind. What am I?",
    options:  ["A ghost", "An echo", "A shadow", "A dream"],
    correct:  1,             // index of correct answer ("An echo")
    reward:   "note",        // item added to inventory
    rewardLabel: "Note 📝",
    hint:     "The facility is called Project ECHO for a reason. What phenomenon repeats your words back to you?"
  },

  // Cabinet code lock: the code is found from the clue hidden in the bookshelf note
  cabinet: {
    code:     "7429",
    hint:     "Check the note you found in the bookshelf. The numbers are written in the margins.",
    clueText: "The sticky note inside the book reads:\n" +
              "\"Maintenance override sequence: 7 - 4 - 2 - 9\n" +
              "Do NOT share with subject.\""
  },

  // Painting: player must click a hidden marker on the canvas
  painting: {
    // The target circle will be drawn at these RELATIVE coordinates (0.0 – 1.0)
    targetX:  0.68,
    targetY:  0.35,
    radius:   18,            // click tolerance in canvas pixels
    reward:   "combo",
    rewardLabel: "Combo 🔢",
    hint:     "The painting looks abstract, but one brushstroke in the upper-right area seems deliberately placed. Click precisely on it."
  },

  // Safe: combination is embedded in the painting reward item description
  safe: {
    code:     "391",
    hint:     "The scrap of paper from behind the painting shows three digits. Think of it as a safe combination.",
    clueText: "Behind the painting you find a scrap of paper:\n\"Safe — R3, L9, R1\"\n(Right 3, Left 9, Right 1)"
  },

  // Terminal: asks a cipher question whose solution is the exit code
  terminal: {
    cipher:   "URYYB",       // ROT13 of "HELLO"
    answer:   "7429391",     // cabinet code + safe code combined
    hint:     "Combine every code you have found so far — in the order you discovered them. The exit code is a 7-digit sequence.",
    clueText: "SYSTEM TERMINAL v4.2\n> Access denied.\n> Emergency override requires 7-digit code.\n> Format: [CABINET_CODE][SAFE_CODE]\n> _"
  }
};

/* ──────────────────────────────────────────────────────────
   HINTS — context-sensitive pool
────────────────────────────────────────────────────────── */
const HINTS = [
  "Start by examining the bookshelf — there is a book that catches your eye.",
  "Some items in your inventory contain clues. Hover over them.",
  "The exit door needs a 7-digit override code. Collect all codes first.",
  "The painting hides something in its upper-right quadrant.",
  "The safe combination is written in a lock-direction shorthand: R=Right, L=Left.",
  "Combine the cabinet code (4 digits) and the safe code (3 digits) for the terminal."
];
let hintIndex = 0;

/* ──────────────────────────────────────────────────────────
   DOM REFERENCES
────────────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
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
   AUDIO (Web Audio API — no external files needed)
────────────────────────────────────────────────────────── */
let audioCtx = null;

// Lazily create AudioContext on first user gesture
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

/**
 * Play a short beep tone
 * @param {number} freq - frequency in Hz
 * @param {string} type - oscillator type
 * @param {number} duration - seconds
 * @param {number} vol - gain (0–1)
 */
function playBeep(freq = 440, type = 'sine', duration = 0.15, vol = 0.25) {
  try {
    const ctx = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch(e) { /* silence on unsupported browsers */ }
}

// Preset sounds
const SFX = {
  click:   () => playBeep(600, 'square', 0.07, 0.15),
  success: () => { playBeep(523, 'sine', 0.15, 0.3); setTimeout(() => playBeep(659, 'sine', 0.2, 0.3), 150); setTimeout(() => playBeep(784, 'sine', 0.25, 0.3), 300); },
  error:   () => playBeep(180, 'sawtooth', 0.2, 0.3),
  collect: () => playBeep(880, 'triangle', 0.12, 0.2),
  alarm:   () => { playBeep(440, 'sawtooth', 0.1, 0.4); setTimeout(() => playBeep(350, 'sawtooth', 0.1, 0.4), 150); },
  win:     () => { [523,659,784,1047].forEach((f,i) => setTimeout(() => playBeep(f,'sine',0.3,0.35), i*150)); }
};

/* ──────────────────────────────────────────────────────────
   INTRO PARTICLES (canvas animation)
────────────────────────────────────────────────────────── */
function initParticles() {
  const canvas = $('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Create floating dots
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

      p.x += p.dx;
      p.y += p.dy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
    });
    requestAnimationFrame(draw);
  }
  draw();
}

/* ──────────────────────────────────────────────────────────
   SCREEN TRANSITIONS
────────────────────────────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

/* ──────────────────────────────────────────────────────────
   TIMER
────────────────────────────────────────────────────────── */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function startTimer() {
  STATE.timerInterval = setInterval(() => {
    STATE.secondsLeft--;
    timerEl.textContent = formatTime(STATE.secondsLeft);

    // Visual warnings
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

function stopTimer() { clearInterval(STATE.timerInterval); }

/* ──────────────────────────────────────────────────────────
   STATUS MESSAGE
────────────────────────────────────────────────────────── */
function setStatus(msg) {
  statusEl.textContent = msg;
}

/* ──────────────────────────────────────────────────────────
   INVENTORY
────────────────────────────────────────────────────────── */
/**
 * Add an item to the player's inventory and render the slot.
 * @param {string} id    - unique item identifier
 * @param {string} emoji - display emoji
 * @param {string} label - tooltip text
 */
function addToInventory(id, emoji, label) {
  if (STATE.inventory.includes(id)) return; // don't add duplicates
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

function hasItem(id) { return STATE.inventory.includes(id); }

/* ──────────────────────────────────────────────────────────
   MODAL HELPERS
────────────────────────────────────────────────────────── */
function openModal(html) {
  modalContent.innerHTML = html;
  modalOverlay.classList.remove('hidden');
}
function closeModal() { modalOverlay.classList.add('hidden'); }

// Close modal on overlay click or close button
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
modalClose.addEventListener('click', closeModal);

/* ──────────────────────────────────────────────────────────
   HINT SYSTEM
────────────────────────────────────────────────────────── */
hintBtn.addEventListener('click', () => {
  if (STATE.hintsLeft <= 0) { setStatus('No hints remaining.'); return; }
  STATE.hintsLeft--;
  hintCountEl.textContent = STATE.hintsLeft;
  if (STATE.hintsLeft === 0) hintBtn.disabled = true;

  // Pick a contextual hint based on progress
  let msg;
  if (!STATE.puzzles.bookshelf) msg = HINTS[0];
  else if (!STATE.puzzles.cabinet) msg = HINTS[1];
  else if (!STATE.puzzles.painting) msg = HINTS[3];
  else if (!STATE.puzzles.safe) msg = HINTS[4];
  else msg = HINTS[5];

  hintText.textContent = msg;
  hintPopup.classList.remove('hidden');
  setTimeout(() => hintPopup.classList.add('hidden'), 5000);
  SFX.click();
});

/* ──────────────────────────────────────────────────────────
   PUZZLE 1 — BOOKSHELF RIDDLE
   Player reads a riddle and picks the correct answer.
   Reward: sticky note item → reveals cabinet code.
────────────────────────────────────────────────────────── */
function openBookshelf() {
  SFX.click();
  if (STATE.puzzles.bookshelf) {
    openModal(`
      <h3>📚 BOOKSHELF</h3>
      <p>You already pocketed the sticky note from this shelf.</p>
      <div class="modal-desc clue-text">${PUZZLES.cabinet.clueText}</div>
    `);
    return;
  }

  const opts = PUZZLES.bookshelf.options.map((o, i) => `
    <button class="riddle-option" data-index="${i}">${o}</button>
  `).join('');

  openModal(`
    <h3>📚 BOOKSHELF</h3>
    <div class="modal-desc">
      You find a single book lying open. Inside, someone has written a riddle:
      <br><br>
      <span class="clue-text">"${PUZZLES.bookshelf.riddle}"</span>
    </div>
    <div class="riddle-options">${opts}</div>
    <div class="feedback" id="riddle-feedback"></div>
  `);

  // Attach click handlers after inserting HTML
  document.querySelectorAll('.riddle-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const chosen = parseInt(btn.dataset.index);
      if (chosen === PUZZLES.bookshelf.correct) {
        btn.classList.add('correct');
        $('riddle-feedback').textContent = '✓ Correct! You notice a sticky note tucked into the back cover.';
        $('riddle-feedback').className = 'feedback ok';
        SFX.success();
        STATE.puzzles.bookshelf = true;
        $('obj-bookshelf').classList.add('solved');
        addToInventory('note', '📝', 'Sticky Note (cabinet code)');
        setTimeout(closeModal, 1800);
      } else {
        btn.classList.add('wrong');
        $('riddle-feedback').textContent = '✗ That doesn\'t feel right…';
        $('riddle-feedback').className = 'feedback err';
        SFX.error();
        setTimeout(() => btn.classList.remove('wrong'), 800);
      }
    });
  });
}

/* ──────────────────────────────────────────────────────────
   PUZZLE 2 — CABINET CODE LOCK
   Player enters the 4-digit code found on the sticky note.
   Reward: lab key card (needed in the safe).
────────────────────────────────────────────────────────── */
function openCabinet() {
  SFX.click();
  if (STATE.puzzles.cabinet) {
    openModal(`
      <h3>🗄️ CABINET — UNLOCKED</h3>
      <p>The cabinet is open. You already took the key card.</p>
    `);
    return;
  }

  const noteClue = hasItem('note')
    ? `<div class="modal-desc clue-text">Your sticky note reads: "Maintenance override sequence: 7 - 4 - 2 - 9"</div>`
    : `<p>The cabinet is secured with a 4-digit code lock. You need to find the code first.</p>`;

  openModal(`
    <h3>🗄️ CABINET CODE LOCK</h3>
    ${noteClue}
    <input class="puzzle-input" id="cabinet-input" type="text" maxlength="4"
           placeholder="0000" autocomplete="off" />
    <button class="btn-submit" id="cabinet-submit">UNLOCK</button>
    <div class="feedback" id="cabinet-feedback"></div>
  `);

  $('cabinet-input').focus();

  // Allow pressing Enter to submit
  $('cabinet-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitCabinet(); });
  $('cabinet-submit').addEventListener('click', submitCabinet);
}

function submitCabinet() {
  const input = $('cabinet-input');
  const val   = input.value.trim();

  if (val === PUZZLES.cabinet.code) {
    input.classList.add('success');
    $('cabinet-feedback').textContent = '✓ UNLOCKED — You find a LAB KEYCARD inside.';
    $('cabinet-feedback').className = 'feedback ok';
    SFX.success();
    STATE.puzzles.cabinet = true;
    $('cabinet-badge').textContent = '🔓';
    $('obj-cabinet').classList.add('solved');
    addToInventory('keycard', '🪪', 'Lab Keycard');
    setTimeout(closeModal, 1800);
  } else {
    input.classList.add('error');
    $('cabinet-feedback').textContent = '✗ Wrong code. The lock beeps angrily.';
    $('cabinet-feedback').className = 'feedback err';
    SFX.error();
    setTimeout(() => { input.classList.remove('error'); input.value = ''; input.focus(); }, 700);
  }
}

/* ──────────────────────────────────────────────────────────
   PUZZLE 3 — PAINTING HIDDEN OBJECT
   A canvas shows an abstract painting. Player must click the
   hidden marker in the upper-right area.
   Reward: scrap of paper → reveals safe combo.
────────────────────────────────────────────────────────── */
function openPainting() {
  SFX.click();
  if (STATE.puzzles.painting) {
    openModal(`
      <h3>🖼️ PAINTING — SEARCHED</h3>
      <p>You already found and pocketed the scrap of paper behind this painting.</p>
      <div class="modal-desc clue-text">${PUZZLES.safe.clueText}</div>
    `);
    return;
  }

  openModal(`
    <h3>🖼️ ABSTRACT PAINTING</h3>
    <p>Something about this painting feels deliberate — like a message hidden in plain sight. Click the spot that seems out of place.</p>
    <canvas id="painting-canvas"></canvas>
    <div class="feedback" id="painting-feedback">Click somewhere on the painting…</div>
  `);

  // Draw the painting after the modal is rendered
  requestAnimationFrame(() => drawPainting());
}

function drawPainting() {
  const canvas = $('painting-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width  = canvas.offsetWidth  || 400;
  const H = canvas.height = canvas.offsetHeight || 220;

  // Background
  ctx.fillStyle = '#08080e';
  ctx.fillRect(0, 0, W, H);

  // Abstract random strokes (same seed effect via deterministic values)
  const strokes = [
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

  // Add noise-like dots
  for (let i = 0; i < 200; i++) {
    const x = (Math.sin(i * 137.5) * 0.5 + 0.5) * W;
    const y = (Math.cos(i * 97.3)  * 0.5 + 0.5) * H;
    ctx.beginPath();
    ctx.arc(x, y, 1, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,0.04)`;
    ctx.fill();
  }

  // The hidden marker — a barely visible teal dot
  const tx = PUZZLES.painting.targetX * W;
  const ty = PUZZLES.painting.targetY * H;
  ctx.beginPath();
  ctx.arc(tx, ty, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#00ffe020';  // nearly invisible
  ctx.fill();
  ctx.beginPath();
  ctx.arc(tx, ty, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#00ffe040';
  ctx.fill();

  // Click handler
  canvas.addEventListener('click', function onCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top)  * scaleY;

    const dist = Math.hypot(cx - tx, cy - ty);

    if (dist <= PUZZLES.painting.radius + 10) {
      // Success!
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.strokeStyle = '#00ffe0';
      ctx.lineWidth = 2;
      ctx.stroke();

      $('painting-feedback').textContent = '✓ You peel back the canvas — a scrap of paper falls out!';
      $('painting-feedback').className = 'feedback ok';
      SFX.success();
      STATE.puzzles.painting = true;
      $('painting-badge').textContent = '✓';
      $('obj-painting').classList.add('solved');
      addToInventory('combo', '🔢', 'Scrap of Paper (safe combo)');
      canvas.removeEventListener('click', onCanvasClick);
      setTimeout(closeModal, 2000);
    } else {
      // Miss — show ripple
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff2d5560';
      ctx.lineWidth = 1;
      ctx.stroke();
      $('painting-feedback').textContent = '✗ Nothing here. Keep looking…';
      $('painting-feedback').className = 'feedback err';
      SFX.error();
    }
  });
}

/* ──────────────────────────────────────────────────────────
   PUZZLE 4 — WALL SAFE (3-digit combination)
   Code is on the scrap of paper from behind the painting.
   Reward: USB drive containing the exit code.
────────────────────────────────────────────────────────── */
function openSafe() {
  SFX.click();
  if (!hasItem('keycard')) {
    openModal(`
      <h3>🔐 WALL SAFE</h3>
      <p>A small panel above the safe reads: <span class="clue-text">"Insert lab keycard to activate dial."</span></p>
      <p>You need the lab keycard first.</p>
    `);
    return;
  }

  if (STATE.puzzles.safe) {
    openModal(`
      <h3>🔐 WALL SAFE — OPENED</h3>
      <p>The safe is empty — you already took the USB drive.</p>
    `);
    return;
  }

  const comboClue = hasItem('combo')
    ? `<div class="modal-desc clue-text">Your scrap of paper: "Safe — R3, L9, R1"<br>(Right 3, Left 9, Right 1 = combination <strong>391</strong>)</div>`
    : `<p>You need the combination to open this safe.</p>`;

  openModal(`
    <h3>🔐 WALL SAFE</h3>
    ${comboClue}
    <input class="puzzle-input" id="safe-input" type="text" maxlength="3"
           placeholder="000" autocomplete="off" />
    <button class="btn-submit" id="safe-submit">OPEN SAFE</button>
    <div class="feedback" id="safe-feedback"></div>
  `);

  $('safe-input').focus();
  $('safe-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitSafe(); });
  $('safe-submit').addEventListener('click', submitSafe);
}

function submitSafe() {
  const input = $('safe-input');
  const val   = input.value.trim();

  if (val === PUZZLES.safe.code) {
    input.classList.add('success');
    $('safe-feedback').textContent = '✓ OPENED — A USB drive sits inside!';
    $('safe-feedback').className = 'feedback ok';
    SFX.success();
    STATE.puzzles.safe = true;
    $('safe-badge').textContent = '🔓';
    $('obj-safe').classList.add('solved');
    addToInventory('usb', '💾', 'USB Drive (exit code)');
    setTimeout(closeModal, 1800);
  } else {
    input.classList.add('error');
    $('safe-feedback').textContent = '✗ The dial clicks back. Wrong combination.';
    $('safe-feedback').className = 'feedback err';
    SFX.error();
    setTimeout(() => { input.classList.remove('error'); input.value = ''; input.focus(); }, 700);
  }
}

/* ──────────────────────────────────────────────────────────
   PUZZLE 5 — COMPUTER TERMINAL
   Player must enter the full 7-digit exit override code
   (cabinet code + safe code = "7429391").
   Solving this unlocks the exit door.
────────────────────────────────────────────────────────── */
function openTerminal() {
  SFX.click();

  if (STATE.puzzles.terminal) {
    openModal(`
      <h3>🖥️ TERMINAL — ACCESS GRANTED</h3>
      <p>The override code has been accepted. Head to the exit door.</p>
    `);
    return;
  }

  const usbClue = hasItem('usb')
    ? `<div class="modal-desc clue-text">USB contents: "EXIT OVERRIDE = [CABINET_CODE][SAFE_CODE]<br>Combine all codes in discovery order."</div>`
    : `<p>The terminal is asking for the 7-digit override code. You might need more items first.</p>`;

  openModal(`
    <h3>🖥️ EMERGENCY TERMINAL</h3>
    <div class="modal-desc">${PUZZLES.terminal.clueText}</div>
    ${usbClue}
    <input class="puzzle-input" id="terminal-input" type="text" maxlength="7"
           placeholder="0000000" autocomplete="off" />
    <button class="btn-submit" id="terminal-submit">SUBMIT OVERRIDE</button>
    <div class="feedback" id="terminal-feedback"></div>
  `);

  $('terminal-input').focus();
  $('terminal-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitTerminal(); });
  $('terminal-submit').addEventListener('click', submitTerminal);
}

function submitTerminal() {
  const input = $('terminal-input');
  const val   = input.value.trim();

  if (val === PUZZLES.terminal.answer) {
    input.classList.add('success');
    $('terminal-feedback').textContent = '✓ OVERRIDE ACCEPTED — EXIT DOOR UNLOCKED!';
    $('terminal-feedback').className = 'feedback ok';
    SFX.success();
    STATE.puzzles.terminal = true;
    $('obj-terminal').classList.add('solved');
    setStatus('EXIT UNLOCKED — Get to the door!');
    setTimeout(closeModal, 1800);
  } else {
    input.classList.add('error');
    $('terminal-feedback').textContent = '✗ ACCESS DENIED. Invalid override code.';
    $('terminal-feedback').className = 'feedback err';
    SFX.error();
    setTimeout(() => { input.classList.remove('error'); input.value = ''; input.focus(); }, 700);
  }
}

/* ──────────────────────────────────────────────────────────
   EXIT DOOR
   Only works after the terminal puzzle is solved.
────────────────────────────────────────────────────────── */
function tryExitDoor() {
  SFX.click();
  if (!STATE.puzzles.terminal) {
    openModal(`
      <h3>🚪 EXIT DOOR — SEALED</h3>
      <p>A panel reads: <span class="clue-text">"LOCKDOWN ACTIVE — Awaiting 7-digit override from terminal."</span></p>
      <p>You must enter the override code at the terminal first.</p>
    `);
  } else {
    // Win!
    stopTimer();
    SFX.win();
    $('time-left').textContent = formatTime(STATE.secondsLeft);
    setTimeout(() => showScreen('win-screen'), 600);
  }
}

/* ──────────────────────────────────────────────────────────
   WIN / LOSE
────────────────────────────────────────────────────────── */
function triggerLose() {
  SFX.alarm();
  setTimeout(() => showScreen('lose-screen'), 500);
}

/* ──────────────────────────────────────────────────────────
   RESTART
────────────────────────────────────────────────────────── */
function restartGame() {
  // Reset state
  STATE.secondsLeft = STATE.totalSeconds;
  STATE.hintsLeft   = 3;
  STATE.inventory   = [];
  STATE.puzzles     = { bookshelf: false, cabinet: false, painting: false, safe: false, terminal: false };
  hintIndex = 0;

  // Reset UI
  timerEl.textContent  = formatTime(STATE.secondsLeft);
  timerEl.className    = 'timer';
  hintCountEl.textContent = '3';
  hintBtn.disabled     = false;
  invSlots.innerHTML   = '';
  setStatus('Explore the room. Click objects to interact.');

  // Reset object states
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
   OBJECT CLICK BINDINGS
────────────────────────────────────────────────────────── */
function bindObjectClicks() {
  const bindings = {
    'obj-bookshelf':  openBookshelf,
    'obj-cabinet':    openCabinet,
    'obj-painting':   openPainting,
    'obj-safe':       openSafe,
    'obj-terminal':   openTerminal,
    'obj-exit-door':  tryExitDoor,
  };

  Object.entries(bindings).forEach(([id, fn]) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('click', fn);
    // Also support keyboard (Enter / Space)
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
    });
  });
}

/* ──────────────────────────────────────────────────────────
   START GAME
────────────────────────────────────────────────────────── */
function startGame() {
  showScreen('game-screen');
  startTimer();
  setStatus('Explore the room. Click objects to interact.');
  SFX.click();
}

/* ──────────────────────────────────────────────────────────
   INITIALISE on DOM ready
────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  bindObjectClicks();

  $('start-btn').addEventListener('click', startGame);
});

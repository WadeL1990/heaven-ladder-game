// src/app.js
// Cartoon ladder game (Amidakuji/Ghost Leg) for Kids Sunday School
// Manual mode: choose start -> marker walks down -> when reaching a rung, STOP and wait for child to click the correct rung.
// Heaven fixed at the center column; number of columns is always odd.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const elChoices = document.getElementById("choices");
const elMsg = document.getElementById("message");

const btnNew = document.getElementById("btnNew");
const btnGo = document.getElementById("btnGo");

// =========================
// Config
// =========================
const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

// Always odd columns. Recommend 5 for kids. If you want harder: [5, 7]
const ODD_COUNTS = [5];

// Rows range (more rows = more rungs = more complex)
const ROWS_RANGE = [11, 15];

// Canvas paddings
const PADDING = { top: 92, bottom: 96, left: 96, right: 96 };

// Visual sizes
const LINE_WIDTH = 10;
const RUNG_WIDTH = 10;

// Manual movement speed (CSS pixels per frame)
const SPEED_DOWN = 3.6;
const SPEED_CROSS = 4.8;

// Click tolerance in CSS pixels for rung hit-testing
const RUNG_HIT_TOL = 16;

// Avatars and ends
const AVATARS = ["🐑 小羊", "🐟 小魚", "🕯️ 小燈", "🍇 葡萄", "🧡 愛心", "📖 聖經", "🌈 彩虹"];
const OTHER_ENDS_POOL = ["🎮 只想玩", "🍬 只想吃", "😴 只想睡", "😡 愛生氣", "😎 愛炫耀", "🧸 只要玩具", "🙈 不想聽", "💤 發呆中"];

// =========================
// State
// =========================
let state = {
  N: 5,
  ROWS: 13,
  selected: 0,
  rungs: [],         // rungs[r] = [c, c2...] means rung connects c<->c+1 at row r
  endLabels: [],
  heavenIndex: 2,    // (N-1)/2
  animating: false,
  confetti: [],

  manual: {
    running: false,
    waitingClick: false,
    // targets are rungs that are actually on the path from chosen start
    // each item: { row, y, x1, x2, dir } where dir is +1 (to right) or -1 (to left)
    targets: [],
    targetIndex: 0,

    marker: { x: 0, y: 0 },  // current marker position
    to: { x: 0, y: 0 },      // current goal position
    phase: "idle",           // "down" | "wait" | "cross" | "done"

    // Visual aids
    hintT: 0,
    shake: 0,

    // Draw traveled path as polyline points
    pathPts: []              // [{x,y}, ...]
  }
};

// =========================
// Utils
// =========================
function randInt(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Canvas resize to responsive size
function resizeCanvas() {
  const cssWidth = canvas.clientWidth || 980;
  const cssHeight = Math.round(cssWidth * 0.68);

  canvas.width = Math.floor(cssWidth * DPR);
  canvas.height = Math.floor(cssHeight * DPR);

  canvas.style.height = cssHeight + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function layout() {
  const w = canvas.width / DPR;
  const h = canvas.height / DPR;
  const left = PADDING.left;
  const right = w - PADDING.right;
  const top = PADDING.top;
  const bottom = h - PADDING.bottom;
  const dx = (right - left) / (state.N - 1);
  const dy = (bottom - top) / (state.ROWS - 1);
  return { w, h, left, right, top, bottom, dx, dy };
}
function xOf(col) {
  const { left, dx } = layout();
  return left + col * dx;
}
function yOf(row) {
  const { top, dy } = layout();
  return top + row * dy;
}

// Convert pointer event to canvas coordinates (CSS pixels of drawing space)
function getCanvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;

  // scale correction when CSS size != internal drawing size
  const scaleX = (canvas.width / DPR) / rect.width;
  const scaleY = (canvas.height / DPR) / rect.height;

  return { x: x * scaleX, y: y * scaleY };
}

// Distance from point to segment (for hit test)
function distPointToSeg(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return Math.hypot(px - ax, py - ay);

  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

function hitTestRung(px, py, rung, tol = RUNG_HIT_TOL) {
  const d = distPointToSeg(px, py, rung.x1, rung.y, rung.x2, rung.y);
  return d <= tol;
}

// =========================
// Ladder generation
// =========================
function generateRungs(N, ROWS) {
  const rungs = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    let lastPlaced = -99;
    for (let c = 0; c < N - 1; c++) {
      if (c === lastPlaced + 1) continue; // avoid adjacent rungs
      const p = (N === 5) ? 0.42 : 0.35;
      if (Math.random() < p) {
        row.push(c);
        lastPlaced = c;
      }
    }
    rungs.push(row);
  }
  return rungs;
}

function generateEndLabels(N, heavenIndex) {
  const picks = shuffle(OTHER_ENDS_POOL);
  const labels = [];
  let p = 0;
  for (let i = 0; i < N; i++) {
    if (i === heavenIndex) labels.push("✨ 天國");
    else labels.push(picks[p++] || "🌟 其他路");
  }
  return labels;
}

// =========================
// Path trace (for final result) + manual targets (rungs on path)
// =========================
function tracePath(startCol) {
  let col = startCol;
  const pts = [{ x: xOf(col), y: yOf(0) }];

  for (let r = 0; r < state.ROWS; r++) {
    const y = yOf(r);
    pts.push({ x: xOf(col), y });

    const row = state.rungs[r];
    if (row.includes(col)) {
      col = col + 1;
      pts.push({ x: xOf(col), y });
    } else if (row.includes(col - 1)) {
      col = col - 1;
      pts.push({ x: xOf(col), y });
    }
  }
  const { bottom } = layout();
  pts.push({ x: xOf(col), y: bottom });

  return { endCol: col, pts };
}

function buildManualTargets(startCol) {
  let col = startCol;
  const targets = [];

  for (let r = 0; r < state.ROWS; r++) {
    const y = yOf(r);
    const row = state.rungs[r];

    if (row.includes(col)) {
      const x1 = xOf(col);
      const x2 = xOf(col + 1);
      targets.push({ row: r, y, x1, x2, dir: +1 });
      col = col + 1;
    } else if (row.includes(col - 1)) {
      const x1 = xOf(col - 1);
      const x2 = xOf(col);
      targets.push({ row: r, y, x1, x2, dir: -1 });
      col = col - 1;
    }
  }
  return targets;
}

// =========================
// Background (cartoon sky, clouds, rainbow)
// =========================
function drawSky() {
  const { w, h } = layout();

  // gradient sky
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#b9f3ff");
  g.addColorStop(0.55, "#fff0fb");
  g.addColorStop(1, "#ffe6f3");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // tiny stars/sparkles
  ctx.save();
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 26; i++) {
    const x = randInt(20, w - 20);
    const y = randInt(10, 140);
    ctx.fillStyle = (i % 2 === 0) ? "#ffffff" : "#fff5a8";
    ctx.beginPath();
    ctx.arc(x, y, randInt(1, 2), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // rainbow
  drawRainbow(w * 0.77, h * 0.12, 92);

  // clouds
  drawCloud(w * 0.18, h * 0.14, 1.05);
  drawCloud(w * 0.44, h * 0.10, 0.9);
  drawCloud(w * 0.70, h * 0.18, 1.2);
}

function drawCloud(cx, cy, s = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.strokeStyle = "rgba(36,48,74,.06)";
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.arc(-40, 0, 22, 0, Math.PI * 2);
  ctx.arc(-15, -12, 28, 0, Math.PI * 2);
  ctx.arc(18, -5, 24, 0, Math.PI * 2);
  ctx.arc(44, 4, 18, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawRainbow(cx, cy, r) {
  const colors = ["#ff5fa2", "#ffb84d", "#fff083", "#7be495", "#53d9ff", "#8a7dff"];
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < colors.length; i++) {
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r - i * 12, Math.PI * 0.95, Math.PI * 1.85);
    ctx.stroke();
  }
  ctx.restore();
}

// =========================
// Ladder drawing
// =========================
function drawLadder() {
  const { top, bottom } = layout();

  // vertical lines
  ctx.save();
  ctx.strokeStyle = "#2a3b63";
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = "round";
  for (let c = 0; c < state.N; c++) {
    ctx.beginPath();
    ctx.moveTo(xOf(c), top);
    ctx.lineTo(xOf(c), bottom);
    ctx.stroke();
  }
  ctx.restore();

  // rungs
  ctx.save();
  ctx.strokeStyle = "#32c6ff";
  ctx.lineWidth = RUNG_WIDTH;
  ctx.lineCap = "round";
  for (let r = 0; r < state.ROWS; r++) {
    const y = yOf(r);
    for (const c of state.rungs[r]) {
      ctx.beginPath();
      ctx.moveTo(xOf(c), y);
      ctx.lineTo(xOf(c + 1), y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawLabels() {
  const { top, bottom, w } = layout();

  // top avatars
  ctx.save();
  ctx.textAlign = "center";
  for (let c = 0; c < state.N; c++) {
    const isSel = c === state.selected;
    ctx.font = isSel ? "900 16px ui-rounded, system-ui" : "900 14px ui-rounded, system-ui";
    ctx.fillStyle = isSel ? "#ff4a9a" : "rgba(36,48,74,.85)";
    const text = AVATARS[c] || `角色${c + 1}`;
    ctx.fillText(text, xOf(c), top - 22);
  }
  ctx.restore();

  // bottom ends
  ctx.save();
  ctx.textAlign = "center";
  for (let c = 0; c < state.N; c++) {
    const label = state.endLabels[c];
    const isHeaven = c === state.heavenIndex;
    ctx.font = isHeaven ? "1000 18px ui-rounded, system-ui" : "900 14px ui-rounded, system-ui";
    ctx.fillStyle = isHeaven ? "#2ad48f" : "rgba(36,48,74,.75)";
    ctx.fillText(label, xOf(c), bottom + 44);
  }
  ctx.restore();

  // corners hints
  ctx.save();
  ctx.textAlign = "left";
  ctx.font = "1000 18px ui-rounded, system-ui";
  ctx.fillStyle = "rgba(36,48,74,.88)";
  ctx.fillText("起點", 18, 34);
  ctx.font = "900 13px ui-rounded, system-ui";
  ctx.fillStyle = "rgba(90,107,138,.9)";
  ctx.fillText("選角色 → 出發", 18, 56);
  ctx.restore();

  ctx.save();
  ctx.textAlign = "right";
  ctx.font = "900 13px ui-rounded, system-ui";
  ctx.fillStyle = "rgba(90,107,138,.9)";
  ctx.fillText("✨天國永遠在正中間！", w - 18, 56);
  ctx.restore();
}

// =========================
// Message
// =========================
function setMessage(html) {
  elMsg.innerHTML = `
    <div class="messageTitle">💬 老師的小提醒</div>
    <div class="messageBody">
      ${html}<br/>
      <span class="verse">主題經文：使徒行傳 1:1–11（耶穌升天、應許聖靈、將來再來）</span>
    </div>
  `;
}

// =========================
// Confetti (when reach heaven)
// =========================
function spawnConfetti() {
  const { w } = layout();
  state.confetti = [];
  const colors = ["#ff5fa2", "#ffd166", "#06d6a0", "#32c6ff", "#8a7dff", "#ff8fab"];
  for (let i = 0; i < 180; i++) {
    state.confetti.push({
      x: Math.random() * w,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 2.2,
      vy: 2 + Math.random() * 4.0,
      r: 2 + Math.random() * 4.0,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.22,
      c: colors[i % colors.length],
      life: 160 + Math.random() * 60
    });
  }
}

function updateConfetti() {
  const { h } = layout();
  for (const p of state.confetti) {
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.vy += 0.02;
    p.life -= 1;
    if (p.y > h + 30) p.life = 0;
  }
  state.confetti = state.confetti.filter(p => p.life > 0);
}

function drawConfetti() {
  if (!state.confetti.length) return;
  ctx.save();
  for (const p of state.confetti) {
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.c;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(-p.r, -p.r, p.r * 2.2, p.r * 1.3);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  ctx.restore();
}

// =========================
// Manual overlay: traveled path, hint rung, marker
// =========================
function drawManualOverlay() {
  const m = state.manual;
  if (!m.running) return;

  // 1) Draw traveled path (green)
  if (m.pathPts.length >= 2) {
    ctx.save();
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(42, 212, 143, .62)";
    ctx.beginPath();
    ctx.moveTo(m.pathPts[0].x, m.pathPts[0].y);
    for (let i = 1; i < m.pathPts.length; i++) {
      ctx.lineTo(m.pathPts[i].x, m.pathPts[i].y);
    }
    // also connect to current marker position (in-progress)
    ctx.lineTo(m.marker.x, m.marker.y);
    ctx.stroke();
    ctx.restore();
  }

  // 2) Hint rung pulse while waiting click
  if (m.waitingClick && m.targetIndex < m.targets.length) {
    const t = m.targets[m.targetIndex];
    const pulse = 0.55 + 0.45 * Math.sin(m.hintT);

    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(255, 74, 154, ${0.25 + 0.45 * pulse})`;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y);
    ctx.lineTo(t.x2, t.y);
    ctx.stroke();

    // small arrow hint
    ctx.fillStyle = `rgba(255, 74, 154, ${0.35 + 0.45 * pulse})`;
    ctx.font = "900 18px ui-rounded, system-ui";
    ctx.textAlign = "center";
    ctx.fillText("點我!", (t.x1 + t.x2) / 2, t.y - 10);
    ctx.restore();
  }

  // 3) Marker (star bubble) with small shake on error
  const shakeX = (m.shake ? (Math.random() - 0.5) * m.shake : 0);
  const shakeY = (m.shake ? (Math.random() - 0.5) * m.shake : 0);

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,.94)";
  ctx.strokeStyle = "rgba(255,74,154,.55)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(m.marker.x + shakeX, m.marker.y + shakeY, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.font = "900 14px ui-rounded, system-ui";
  ctx.fillStyle = "#ff4a9a";
  ctx.textAlign = "center";
  ctx.fillText("★", m.marker.x + shakeX, m.marker.y + shakeY + 5);
  ctx.restore();

  // 4) Confetti
  if (state.confetti.length) {
    updateConfetti();
    drawConfetti();
  }
}

// =========================
// Main draw
// =========================
function draw() {
  resizeCanvas();
  drawSky();
  drawLadder();
  drawLabels();
  drawManualOverlay();
}

// =========================
// UI Chips
// =========================
function renderChoices() {
  elChoices.innerHTML = "";
  for (let i = 0; i < state.N; i++) {
    const chip = document.createElement("div");
    chip.className = "chip" + (i === state.selected ? " active" : "");
    chip.textContent = AVATARS[i] || `角色${i + 1}`;
    chip.setAttribute("role", "listitem");
    chip.addEventListener("click", () => {
      if (state.animating) return;
      state.selected = i;
      renderChoices();
      draw();
    });
    elChoices.appendChild(chip);
  }
}

// =========================
// New map
// =========================
function newMap() {
  // reset running states
  stopManualIfRunning();

  // odd columns
  state.N = ODD_COUNTS[randInt(0, ODD_COUNTS.length - 1)];
  state.ROWS = randInt(ROWS_RANGE[0], ROWS_RANGE[1]);
  state.heavenIndex = Math.floor((state.N - 1) / 2);

  // generate
  state.rungs = generateRungs(state.N, state.ROWS);
  state.endLabels = generateEndLabels(state.N, state.heavenIndex);

  // clamp selection
  state.selected = Math.min(state.selected, state.N - 1);

  // clear confetti
  state.confetti = [];

  renderChoices();
  draw();

  setMessage(`🎯 選一個角色出發吧！<br/>走到岔路時，請「點一下橫桿」讓星星走過去。<br/>✨ 天國永遠在正中間～`);
}

// =========================
// Manual run control
// =========================
function stopManualIfRunning() {
  const m = state.manual;
  m.running = false;
  m.waitingClick = false;
  m.phase = "idle";
  m.targets = [];
  m.targetIndex = 0;
  m.pathPts = [];
  m.hintT = 0;
  m.shake = 0;
  state.animating = false;
  btnNew.disabled = false;
  btnGo.disabled = false;
}

function startManualRun() {
  if (state.animating) return;

  state.animating = true;
  btnNew.disabled = true;
  btnGo.disabled = true;

  const m = state.manual;
  m.running = true;
  m.waitingClick = false;
  m.phase = "down";
  m.targets = buildManualTargets(state.selected);
  m.targetIndex = 0;
  m.hintT = 0;
  m.shake = 0;
  m.pathPts = [];

  const { top, bottom } = layout();
  m.marker.x = xOf(state.selected);
  m.marker.y = top;

  // start polyline
  m.pathPts.push({ x: m.marker.x, y: m.marker.y });

  // set first destination: down to first target rung or bottom
  if (m.targets.length) {
    m.to.x = m.marker.x;
    m.to.y = m.targets[0].y;
  } else {
    m.to.x = m.marker.x;
    m.to.y = bottom;
  }

  setMessage(`🚶 出發！<br/>星星走到岔路會停下來～請你點那根橫桿，幫它確認要走的路！`);

  requestAnimationFrame(manualLoop);
}

function manualLoop() {
  const m = state.manual;
  if (!m.running) return;

  // advance hint/shake
  if (m.waitingClick) {
    m.hintT += 0.08;
    m.shake *= 0.85;
    draw();
    requestAnimationFrame(manualLoop);
    return;
  }

  // animate movement towards m.to
  const dx = m.to.x - m.marker.x;
  const dy = m.to.y - m.marker.y;
  const dist = Math.hypot(dx, dy);

  const speed = (m.phase === "cross") ? SPEED_CROSS : SPEED_DOWN;

  if (dist <= speed) {
    // snap
    m.marker.x = m.to.x;
    m.marker.y = m.to.y;

    // record point when reaching a segment end
    m.pathPts.push({ x: m.marker.x, y: m.marker.y });

    // if we just reached a rung row while going down -> wait for click
    if (m.phase === "down" && m.targetIndex < m.targets.length && Math.abs(m.marker.y - m.targets[m.targetIndex].y) < 0.5) {
      m.waitingClick = true;
      m.phase = "wait";
      m.hintT = 0;
      draw();
      requestAnimationFrame(manualLoop);
      return;
    }

    // if we just finished crossing -> continue down to next rung or bottom
    if (m.phase === "cross") {
      m.targetIndex += 1;
      m.phase = "down";

      const { bottom } = layout();
      if (m.targetIndex < m.targets.length) {
        m.to.x = m.marker.x;
        m.to.y = m.targets[m.targetIndex].y;
      } else {
        m.to.x = m.marker.x;
        m.to.y = bottom;
      }

      draw();
      requestAnimationFrame(manualLoop);
      return;
    }

    // if reached bottom -> finish
    const { bottom } = layout();
    if (m.marker.y >= bottom - 0.5) {
      finishManualRun();
      draw();
      return;
    }

    draw();
    requestAnimationFrame(manualLoop);
    return;
  }

  // move step
  m.marker.x += (dx / dist) * speed;
  m.marker.y += (dy / dist) * speed;

  draw();
  requestAnimationFrame(manualLoop);
}

function finishManualRun() {
  const m = state.manual;
  const { endCol } = tracePath(state.selected);
  const reachedHeaven = (endCol === state.heavenIndex);

  if (reachedHeaven) {
    spawnConfetti();
    setMessage(`🎉 太棒了！你走到了 <b>✨天國</b>！<br/>「耶穌怎樣往天上去，祂還要怎樣來。」（徒 1:11）`);
  } else {
    setMessage(`🙂 你走到了 <b>${state.endLabels[endCol]}</b>。<br/>再試一次～找到通往天國的那一條路！`);
  }

  // end run
  m.running = false;
  m.waitingClick = false;
  m.phase = "done";

  state.animating = false;
  btnNew.disabled = false;
  btnGo.disabled = false;
}

// =========================
// Pointer click handler for manual rung selection
// =========================
function onCanvasPointerDown(evt) {
  const m = state.manual;
  if (!m.running || !m.waitingClick) return;
  if (m.targetIndex >= m.targets.length) return;

  const p = getCanvasPos(evt);
  const target = m.targets[m.targetIndex];

  const ok = hitTestRung(p.x, p.y, target, RUNG_HIT_TOL);

  if (!ok) {
    // wrong click: shake + gentle reminder
    m.shake = 12;
    setMessage(`再看一下～星星停在哪裡？<br/>請點它旁邊那根「會發亮」的橫桿！`);
    return;
  }

  // correct rung clicked -> cross
  m.waitingClick = false;
  m.phase = "cross";

  // set crossing destination
  m.to.x = (target.dir === +1) ? target.x2 : target.x1;
  m.to.y = target.y;

  setMessage(`👍 做得好！繼續往下走～`);

  // continue loop
  requestAnimationFrame(manualLoop);
}

// Use pointer events for mouse + touch
canvas.addEventListener("pointerdown", onCanvasPointerDown);

// =========================
// Events
// =========================
btnNew.addEventListener("click", () => {
  if (state.animating) return;
  newMap();
});

btnGo.addEventListener("click", () => {
  startManualRun();
});

window.addEventListener("resize", () => draw());

// =========================
// Start
// =========================
newMap();
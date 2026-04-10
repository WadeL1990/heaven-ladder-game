// src/app.js
// Manual ladder game (Amidakuji/Ghost Leg) for Kids Sunday School
// Layout: START at bottom (avatars), END at top (heaven + other ends)
// Manual play: marker moves up; at each rung on the true path, STOP and wait for child to click that rung.
// Hint toggle: show/hide pulsing rung + "點我!" label.
// End-only feedback: reminders/encouragement are shown in a modal dialog only when reaching the end.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const elChoices = document.getElementById("choices");
const elMsg = document.getElementById("message");
const elTip = document.getElementById("tip");

const btnNew = document.getElementById("btnNew");
const btnGo = document.getElementById("btnGo");
const btnHint = document.getElementById("btnHint");

// Optional dialog elements (if you added <dialog id="resultDialog"> in index.html)
const resultDialog = document.getElementById("resultDialog");
const dialogIcon = document.getElementById("dialogIcon");
const dialogTitle = document.getElementById("dialogTitle");
const dialogDesc = document.getElementById("dialogDesc");
const dialogBody = document.getElementById("dialogBody");
const dialogClose = document.getElementById("dialogClose");
const dialogReplay = document.getElementById("dialogReplay");
const dialogNewMap = document.getElementById("dialogNewMap");

// =========================
// Config
// =========================
const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

// Always odd columns. Recommend 5 for kids. If you want harder: [5, 7]
const ODD_COUNTS = [5];

// Rows range (more = more rungs = more complex)
const ROWS_RANGE = [11, 15];

// Canvas paddings (space for labels at top & bottom)
const PADDING = { top: 96, bottom: 104, left: 96, right: 96 };

// Visual sizes
const LINE_WIDTH = 10;
const RUNG_WIDTH = 10;

// Movement speed (CSS pixels per frame)
const SPEED_UP = 3.6;
const SPEED_CROSS = 4.8;

// Click tolerance for rung hit-testing (CSS pixels)
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

  rungs: [],         // rungs[r] = [c...] rung connects c<->c+1 at row r
  endLabels: [],
  heavenIndex: 2,    // (N-1)/2

  animating: false,
  confetti: [],

  hintsEnabled: true,

  manual: {
    running: false,
    waitingClick: false,
    targets: [],       // rungs on actual path when traveling UP
    targetIndex: 0,

    marker: { x: 0, y: 0 },
    to: { x: 0, y: 0 },
    phase: "idle",     // "up" | "wait" | "cross" | "done"

    hintT: 0,
    shake: 0,

    pathPts: [],       // traveled polyline points

    // end-only feedback: during play only subtle cues
    wrongFlash: 0,     // 0..1 for red flash
    bubble: { text: "", t: 0 } // small bubble near marker (optional, short-lived)
  }
};

// =========================
// Utils
// =========================
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
function xOf(col) { const { left, dx } = layout(); return left + col * dx; }
function yOf(row) { const { top, dy } = layout(); return top + row * dy; }

// Convert pointer event to canvas coordinates (CSS pixels)
function getCanvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;
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
      if (Math.random() < p) { row.push(c); lastPlaced = c; }
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
// Upward path trace + manual targets
// =========================
function tracePathUp(startCol) {
  let col = startCol;
  const { top, bottom } = layout();
  const pts = [{ x: xOf(col), y: bottom }];

  for (let r = state.ROWS - 1; r >= 0; r--) {
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

  pts.push({ x: xOf(col), y: top });
  return { endCol: col, pts };
}

function buildManualTargetsUp(startCol) {
  let col = startCol;
  const targets = [];

  for (let r = state.ROWS - 1; r >= 0; r--) {
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
// Background (cartoon sky)
// =========================
function drawSky() {
  const { w, h } = layout();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#b9f3ff");
  g.addColorStop(0.55, "#fff0fb");
  g.addColorStop(1, "#ffe6f3");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // sparkle dots
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

  drawRainbow(w * 0.77, h * 0.12, 92);
  drawCloud(w * 0.18, h * 0.14, 1.05);
  drawCloud(w * 0.44, h * 0.10, 0.9);
  drawCloud(w * 0.70, h * 0.18, 1.2);

  // wrong flash overlay
  const m = state.manual;
  if (m.running && m.wrongFlash > 0.001) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.35, m.wrongFlash * 0.35);
    ctx.fillStyle = "#ff4a9a";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
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
// Ladder drawing (top ends + bottom starts)
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

  // TOP: end labels
  ctx.save();
  ctx.textAlign = "center";
  for (let c = 0; c < state.N; c++) {
    const label = state.endLabels[c];
    const isHeaven = c === state.heavenIndex;
    ctx.font = isHeaven ? "1000 18px ui-rounded, system-ui" : "900 14px ui-rounded, system-ui";
    ctx.fillStyle = isHeaven ? "#2ad48f" : "rgba(36,48,74,.75)";
    ctx.fillText(label, xOf(c), top - 44);
  }
  ctx.restore();

  // BOTTOM: avatars
  ctx.save();
  ctx.textAlign = "center";
  for (let c = 0; c < state.N; c++) {
    const isSel = c === state.selected;
    ctx.font = isSel ? "900 16px ui-rounded, system-ui" : "900 14px ui-rounded, system-ui";
    ctx.fillStyle = isSel ? "#ff4a9a" : "rgba(36,48,74,.85)";
    const text = AVATARS[c] || `角色${c + 1}`;
    ctx.fillText(text, xOf(c), bottom + 44);
  }
  ctx.restore();

  // small headings
  ctx.save();
  ctx.textAlign = "left";
  ctx.font = "1000 18px ui-rounded, system-ui";
  ctx.fillStyle = "rgba(36,48,74,.88)";
  ctx.fillText("終點（上方）", 18, 34);
  ctx.font = "900 13px ui-rounded, system-ui";
  ctx.fillStyle = "rgba(90,107,138,.9)";
  ctx.fillText("往上走 → 點橫桿", 18, 56);
  ctx.restore();

  ctx.save();
  ctx.textAlign = "right";
  ctx.font = "900 13px ui-rounded, system-ui";
  ctx.fillStyle = "rgba(90,107,138,.9)";
  ctx.fillText("起點在下方（從地上往天國）", w - 18, 56);
  ctx.restore();
}

// =========================
// Message area: keep it stable (not used for in-play reminders)
// =========================
function setMessageStable() {
  elMsg.innerHTML = `
    <div class="messageTitle">🎯 今天的挑戰</div>
    <div class="messageBody">
      從下方出發，找到通往 <b>✨天國</b> 的那條路！<br/>
      <span class="verse">主題經文：使徒行傳 1:1–11（耶穌升天、應許聖靈、將來再來）</span>
    </div>
  `;
}

function syncHintUI() {
  if (btnHint) {
    btnHint.textContent = state.hintsEnabled ? "💡 提示：開" : "🙈 無提示：開";
  }
  // You asked to move reminders/encouragement to the END popup,
  // so we keep bottom tip neutral and short.
  if (elTip) {
    elTip.textContent = state.hintsEnabled
      ? "提示模式：開（岔路橫桿會發亮）"
      : "無提示模式：開（不顯示提示）";
  }
}

// =========================
// Confetti
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
    p.x += p.vx; p.y += p.vy; p.rot += p.vr;
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

  // traveled path
  if (m.pathPts.length >= 2) {
    ctx.save();
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(42, 212, 143, .62)";
    ctx.beginPath();
    ctx.moveTo(m.pathPts[0].x, m.pathPts[0].y);
    for (let i = 1; i < m.pathPts.length; i++) ctx.lineTo(m.pathPts[i].x, m.pathPts[i].y);
    ctx.lineTo(m.marker.x, m.marker.y);
    ctx.stroke();
    ctx.restore();
  }

  // hint rung
  if (state.hintsEnabled && m.waitingClick && m.targetIndex < m.targets.length) {
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

    ctx.fillStyle = `rgba(255, 74, 154, ${0.35 + 0.45 * pulse})`;
    ctx.font = "900 18px ui-rounded, system-ui";
    ctx.textAlign = "center";
    ctx.fillText("點我!", (t.x1 + t.x2) / 2, t.y - 10);
    ctx.restore();
  }

  // marker bubble
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

  // tiny bubble text (short lived)
  if (m.bubble.t > 0.001 && m.bubble.text) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, m.bubble.t);
    ctx.font = "900 12px ui-rounded, system-ui";
    ctx.textAlign = "center";
    const bx = m.marker.x;
    const by = m.marker.y - 22;
    const pad = 8;
    const text = m.bubble.text;
    const w = ctx.measureText(text).width + pad * 2;
    const h = 28;

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.strokeStyle = "rgba(36,48,74,.12)";
    ctx.lineWidth = 2;
    roundRect(ctx, bx - w / 2, by - h, w, h, 10, true, true);

    ctx.fillStyle = "rgba(36,48,74,.9)";
    ctx.fillText(text, bx, by - h / 2 + 4);
    ctx.restore();
  }

  // confetti
  if (state.confetti.length) {
    updateConfetti();
    drawConfetti();
  }
}

// helper: rounded rect
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// =========================
// Draw
// =========================
function draw() {
  resizeCanvas();

  // decay wrong flash & bubble
  const m = state.manual;
  if (m.running) {
    m.wrongFlash *= 0.86;
    m.shake *= 0.85;
    m.bubble.t *= 0.86;
    if (m.bubble.t < 0.03) m.bubble.text = "";
  }

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
// Dialog result (end-only reminder/encouragement)
// =========================
function openResultDialog({ ok, endLabel, encourage, verseLine }) {
  // If dialog not present, fall back to message area
  if (!resultDialog || typeof resultDialog.showModal !== "function") {
    elMsg.innerHTML = `
      <div class="messageTitle">${ok ? "🎉 恭喜！" : "🙂 再試一次！"}</div>
      <div class="messageBody">
        <div style="margin-bottom:6px;"><b>終點：</b>${endLabel}</div>
        <div style="margin-bottom:8px;">${encourage}</div>
        <span class="verse">${verseLine}</span>
      </div>
    `;
    return;
  }

  if (dialogIcon) dialogIcon.textContent = ok ? "🎉" : "🙂";
  if (dialogTitle) dialogTitle.textContent = ok ? "你到達天國了！" : "再試一次！";
  if (dialogDesc) dialogDesc.textContent = ok ? "你找到通往天國的那條路" : "這條路很吸引人，但沒有到天國";

  if (dialogBody) {
    dialogBody.innerHTML = `
      <div style="margin-bottom:8px;"><b>終點：</b> ${endLabel}</div>
      <div style="margin-bottom:10px;">${encourage}</div>
      <div style="font-weight:800;color:rgba(36,48,74,.7);font-size:13px;">${verseLine}</div>
    `;
  }

  resultDialog.showModal();
}

function wireDialogButtons() {
  if (!resultDialog) return;

  dialogClose?.addEventListener("click", () => resultDialog.close());
  dialogReplay?.addEventListener("click", () => {
    resultDialog.close();
    startManualRun();
  });
  dialogNewMap?.addEventListener("click", () => {
    resultDialog.close();
    newMap();
  });

  // optional: close when clicking backdrop (some browsers handle via closedby="any")
  resultDialog.addEventListener("click", (e) => {
    const rect = resultDialog.getBoundingClientRect();
    const inDialog =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inDialog) resultDialog.close();
  });
}

// =========================
// New map
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
  m.wrongFlash = 0;
  m.bubble = { text: "", t: 0 };

  state.animating = false;
  btnNew.disabled = false;
  btnGo.disabled = false;
}

function newMap() {
  stopManualIfRunning();

  state.N = ODD_COUNTS[randInt(0, ODD_COUNTS.length - 1)];
  state.ROWS = randInt(ROWS_RANGE[0], ROWS_RANGE[1]);
  state.heavenIndex = Math.floor((state.N - 1) / 2);

  state.rungs = generateRungs(state.N, state.ROWS);
  state.endLabels = generateEndLabels(state.N, state.heavenIndex);

  state.selected = Math.min(state.selected, state.N - 1);
  state.confetti = [];

  renderChoices();
  draw();
  setMessageStable();
  syncHintUI();
}

// =========================
// Manual run
// =========================
function startManualRun() {
  if (state.animating) return;

  // close dialog if open
  if (resultDialog?.open) resultDialog.close();

  state.animating = true;
  btnNew.disabled = true;
  btnGo.disabled = true;

  const m = state.manual;
  m.running = true;
  m.waitingClick = false;
  m.phase = "up";
  m.targets = buildManualTargetsUp(state.selected);
  m.targetIndex = 0;
  m.hintT = 0;
  m.shake = 0;
  m.pathPts = [];
  m.wrongFlash = 0;
  m.bubble = { text: "", t: 0 };

  const { top, bottom } = layout();
  m.marker.x = xOf(state.selected);
  m.marker.y = bottom;
  m.pathPts.push({ x: m.marker.x, y: m.marker.y });

  if (m.targets.length) {
    m.to.x = m.marker.x;
    m.to.y = m.targets[0].y;
  } else {
    m.to.x = m.marker.x;
    m.to.y = top;
  }

  requestAnimationFrame(manualLoop);
}

function manualLoop() {
  const m = state.manual;
  if (!m.running) return;

  // waiting click: pulse timer only
  if (m.waitingClick) {
    m.hintT += 0.08;
    draw();
    requestAnimationFrame(manualLoop);
    return;
  }

  const dx = m.to.x - m.marker.x;
  const dy = m.to.y - m.marker.y;
  const dist = Math.hypot(dx, dy);

  const speed = (m.phase === "cross") ? SPEED_CROSS : SPEED_UP;

  if (dist <= speed) {
    m.marker.x = m.to.x;
    m.marker.y = m.to.y;
    m.pathPts.push({ x: m.marker.x, y: m.marker.y });

    // reached a rung row while going UP -> wait click
    if (m.phase === "up" && m.targetIndex < m.targets.length && Math.abs(m.marker.y - m.targets[m.targetIndex].y) < 0.5) {
      m.waitingClick = true;
      m.phase = "wait";
      m.hintT = 0;
      draw();
      requestAnimationFrame(manualLoop);
      return;
    }

    // finished crossing -> continue up
    if (m.phase === "cross") {
      m.targetIndex += 1;
      m.phase = "up";

      const { top } = layout();
      if (m.targetIndex < m.targets.length) {
        m.to.x = m.marker.x;
        m.to.y = m.targets[m.targetIndex].y;
      } else {
        m.to.x = m.marker.x;
        m.to.y = top;
      }

      draw();
      requestAnimationFrame(manualLoop);
      return;
    }

    // reached top -> finish
    const { top } = layout();
    if (m.marker.y <= top + 0.5) {
      finishManualRun();
      draw();
      return;
    }

    draw();
    requestAnimationFrame(manualLoop);
    return;
  }

  m.marker.x += (dx / dist) * speed;
  m.marker.y += (dy / dist) * speed;

  draw();
  requestAnimationFrame(manualLoop);
}

function finishManualRun() {
  const m = state.manual;
  const { endCol } = tracePathUp(state.selected);
  const reachedHeaven = (endCol === state.heavenIndex);
  const endLabel = state.endLabels[endCol];

  if (reachedHeaven) spawnConfetti();

  // End-only reminder/encouragement (popup content)
  const encourage = reachedHeaven
    ? `做得好！在等耶穌再來的日子，我們也要每天走在跟隨祂的路上。`
    : `沒關係～再試一次！在等耶穌再來的日子，我們也要學習走在正確的路上。`;

  const verseLine = `「你們見祂怎樣往天上去，祂還要怎樣來。」（徒 1:11）`;

  openResultDialog({
    ok: reachedHeaven,
    endLabel,
    encourage,
    verseLine
  });

  m.running = false;
  m.waitingClick = false;
  m.phase = "done";

  state.animating = false;
  btnNew.disabled = false;
  btnGo.disabled = false;
}

// =========================
// Pointer handler: click correct rung
// =========================
function onCanvasPointerDown(evt) {
  const m = state.manual;
  if (!m.running || !m.waitingClick) return;
  if (m.targetIndex >= m.targets.length) return;

  const p = getCanvasPos(evt);
  const target = m.targets[m.targetIndex];

  const ok = hitTestRung(p.x, p.y, target, RUNG_HIT_TOL);

  if (!ok) {
    // wrong click: subtle feedback only (no bottom reminders)
    m.shake = 12;
    m.wrongFlash = 1;
    m.bubble = { text: "再試一次～", t: 1 };
    return;
  }

  // correct rung
  m.waitingClick = false;
  m.phase = "cross";

  m.to.x = (target.dir === +1) ? target.x2 : target.x1;
  m.to.y = target.y;

  // tiny positive bubble
  m.bubble = { text: "👍", t: 1 };

  requestAnimationFrame(manualLoop);
}

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

if (btnHint) {
  btnHint.addEventListener("click", () => {
    state.hintsEnabled = !state.hintsEnabled;
    syncHintUI();
    draw();
  });
}

// keyboard shortcut: H toggles hints
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "h") {
    state.hintsEnabled = !state.hintsEnabled;
    syncHintUI();
    draw();
  }
});

window.addEventListener("resize", () => draw());

// =========================
// Start
// =========================
wireDialogButtons();
newMap();
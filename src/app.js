/* ===============================
   Heaven Ladder Game – STABLE v2
   - Start at bottom, end at top
   - Manual: stop at each rung, must click correct rung
   - Movement: orthogonal only (vertical then horizontal) => no diagonal
   - Traveled path: RED polyline
   - Marker: rounded avatar frame + emoji (方案A)
   - Character chips: show emoji + name
   - Difficulty UI: easy/normal/hard (rows + density)
   - Hint toggle: highlights correct rung only when waiting
   - End dialog: buttons work
   =============================== */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const elChoices = document.getElementById("choices");
const elMsg = document.getElementById("message");
const elTip = document.getElementById("tip");

const btnNew = document.getElementById("btnNew");
const btnGo = document.getElementById("btnGo");
const btnHint = document.getElementById("btnHint");
const difficultySelect = document.getElementById("difficultySelect");

/* dialog (optional but recommended) */
const resultDialog = document.getElementById("resultDialog");
const dialogIcon = document.getElementById("dialogIcon");
const dialogTitle = document.getElementById("dialogTitle");
const dialogDesc = document.getElementById("dialogDesc");
const dialogBody = document.getElementById("dialogBody");
const dialogClose = document.getElementById("dialogClose");
const dialogReplay = document.getElementById("dialogReplay");
const dialogNewMap = document.getElementById("dialogNewMap");

/* ===============================
   Config
   =============================== */
const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const AVATARS = ["🐑 小羊", "🐟 小魚", "🕯️ 小燈", "🍇 葡萄", "🧡 愛心"];
const OTHER_ENDS_POOL = ["🎮 只想玩", "🍬 只想吃", "😴 只想睡", "😡 愛生氣", "😎 愛炫耀"];

const PADDING = { top: 96, bottom: 110, left: 96, right: 96 };
const LINE_WIDTH = 10;
const RUNG_WIDTH = 10;

const SPEED_UP = 2.6;
const SPEED_CROSS = 3.4;

const RUNG_HIT_TOL = 18;

const DIFFICULTY_CONFIG = {
  easy:   { rows: [10, 14], p: 0.36 },
  normal: { rows: [18, 22], p: 0.52 },
  hard:   { rows: [24, 30], p: 0.62 }
};

/* emoji fonts for canvas + DOM chips */
const EMOJI_FONT = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',system-ui";

/* ===============================
   State
   =============================== */
let state = {
  N: 5,
  ROWS: 20,
  difficulty: "normal",
  selected: 0,
  rungs: [],
  endLabels: [],
  heavenIndex: 2,
  hintsEnabled: true,
  animating: false,

  manual: {
    running: false,
    waitingClick: false,
    phase: "idle", // "up" | "wait" | "cross" | "done"

    targets: [],    // rungs on actual path
    targetIndex: 0,
    endCol: 0,

    marker: { x: 0, y: 0 },
    to: { x: 0, y: 0 },

    // red path trace nodes
    pathPts: [],

    // effects
    shake: 0,
    hintT: 0,
    wrongFlash: 0
  }
};

/* ===============================
   Utils
   =============================== */
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function shuffle(a) { return [...a].sort(() => Math.random() - 0.5); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function avatarEmoji(i){
  return (AVATARS[i] || "").split(" ")[0] || "⭐";
}
function avatarName(i){
  return (AVATARS[i] || "").split(" ").slice(1).join(" ") || "";
}

/* ===============================
   Layout
   =============================== */
function resizeCanvas() {
  const w = canvas.clientWidth || 960;
  const h = Math.round(w * 0.68);
  canvas.width = w * DPR;
  canvas.height = h * DPR;
  canvas.style.height = h + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function layout() {
  const w = canvas.width / DPR, h = canvas.height / DPR;
  const left = PADDING.left, right = w - PADDING.right;
  const top = PADDING.top, bottom = h - PADDING.bottom;
  const dx = (right - left) / (state.N - 1);
  const dy = (bottom - top) / (state.ROWS - 1);
  return { w, h, left, right, top, bottom, dx, dy };
}
const xOf = c => layout().left + c * layout().dx;
const yOf = r => layout().top + r * layout().dy;

/* ===============================
   Hit test helpers
   =============================== */
function getCanvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = (evt.clientX - rect.left) * (canvas.width / DPR) / rect.width;
  const y = (evt.clientY - rect.top) * (canvas.height / DPR) / rect.height;
  return { x, y };
}

function distPointToSeg(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return Math.hypot(px - ax, py - ay);
  let t = (apx * abx + apy * aby) / ab2;
  t = clamp(t, 0, 1);
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

function hitTestRung(px, py, rung, tol = RUNG_HIT_TOL) {
  return distPointToSeg(px, py, rung.x1, rung.y, rung.x2, rung.y) <= tol;
}

/* ===============================
   Generate ladder
   =============================== */
function generateRungs() {
  const { p } = DIFFICULTY_CONFIG[state.difficulty] || DIFFICULTY_CONFIG.normal;
  const rows = [];
  for (let r = 0; r < state.ROWS; r++) {
    const row = [];
    let last = -99;
    for (let c = 0; c < state.N - 1; c++) {
      if (c === last + 1) continue;
      if (Math.random() < p) { row.push(c); last = c; }
    }
    rows.push(row);
  }
  return rows;
}

/* simulate upward traversal once to get targets + final column */
function simulateUp(startCol) {
  let col = startCol;
  const targets = [];
  for (let r = state.ROWS - 1; r >= 0; r--) {
    const row = state.rungs[r];
    const y = yOf(r);
    if (row.includes(col)) {
      targets.push({ y, x1: xOf(col), x2: xOf(col + 1), dir: +1 });
      col++;
    } else if (row.includes(col - 1)) {
      targets.push({ y, x1: xOf(col - 1), x2: xOf(col), dir: -1 });
      col--;
    }
  }
  return { targets, endCol: col };
}

/* ===============================
   UI: choices (chips)
   =============================== */
function renderChoices() {
  if (!elChoices) return;
  elChoices.innerHTML = "";

  for (let i = 0; i < state.N; i++) {
    const chip = document.createElement("div");
    chip.className = "chip" + (i === state.selected ? " active" : "");
    chip.style.fontFamily = EMOJI_FONT; // ensure emoji shows on Windows too
    chip.style.display = "flex";
    chip.style.alignItems = "center";
    chip.style.gap = "8px";

    const e = document.createElement("span");
    e.textContent = avatarEmoji(i);
    e.style.fontSize = "18px";

    const n = document.createElement("span");
    n.textContent = avatarName(i);
    n.style.fontSize = "14px";
    n.style.fontWeight = "900";

    chip.appendChild(e);
    chip.appendChild(n);

    chip.onclick = () => {
      if (state.animating) return;
      state.selected = i;
      renderChoices();
      draw();
    };

    elChoices.appendChild(chip);
  }
}

function syncHintUI() {
  if (btnHint) btnHint.textContent = state.hintsEnabled ? "💡 提示：開" : "🙈 無提示：開";
  if (elTip) {
    elTip.textContent = state.hintsEnabled
      ? "提示模式：岔路的正確橫桿會發亮。"
      : "無提示模式：不顯示提示，請自己找正確橫桿。";
  }
}

function setMessageStable() {
  if (!elMsg) return;
  elMsg.innerHTML = `
    <div class="messageTitle">🎯 今天的挑戰</div>
    <div class="messageBody">
      從下方出發，找到通往 <b>✨天國</b> 的那條路！<br/>
      <span class="verse">主題經文：使徒行傳 1:1–11（耶穌升天、應許聖靈、將來再來）</span>
    </div>
  `;
}

/* ===============================
   Drawing helpers
   =============================== */
function drawSky() {
  const { w, h } = layout();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#b9f3ff");
  g.addColorStop(0.55, "#fff0fb");
  g.addColorStop(1, "#ffffff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // clouds
  drawCloud(w * 0.18, h * 0.15, 1.0);
  drawCloud(w * 0.45, h * 0.11, 0.85);
  drawCloud(w * 0.72, h * 0.18, 1.1);

  // wrong flash
  const m = state.manual;
  if (m.wrongFlash > 0.001) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.28, m.wrongFlash * 0.28);
    ctx.fillStyle = "#ff4a9a";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function drawCloud(cx, cy, s = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(255,255,255,.85)";
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

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function drawLadder() {
  const { top, bottom } = layout();

  // vertical lines
  ctx.save();
  ctx.strokeStyle = "#2a3b63";
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = "round"; // [1](https://itch.io/game-assets/tag-buttons/tag-cartoon/tag-user-interface)
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
  const { top, bottom } = layout();

  // end labels (top)
  ctx.save();
  ctx.textAlign = "center";
  for (let c = 0; c < state.N; c++) {
    const label = state.endLabels[c];
    const isHeaven = c === state.heavenIndex;
    ctx.font = isHeaven ? "900 18px ui-rounded, system-ui" : "800 14px ui-rounded, system-ui";
    ctx.fillStyle = isHeaven ? "#2ad48f" : "rgba(36,48,74,.80)";
    ctx.fillText(label, xOf(c), top - 44);
  }
  ctx.restore();

  // avatar labels (bottom) — emoji only for clarity
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = `900 18px ${EMOJI_FONT}`;
  for (let c = 0; c < state.N; c++) {
    ctx.fillStyle = c === state.selected ? "#ff4a9a" : "rgba(36,48,74,.85)";
    ctx.fillText(avatarEmoji(c), xOf(c), bottom + 44);
  }
  ctx.restore();
}

function drawPathTrace() {
  const m = state.manual;
  if (!m.running || m.pathPts.length === 0) return;

  ctx.save();
  ctx.lineWidth = 10;
  ctx.lineCap = "round";   // [1](https://itch.io/game-assets/tag-buttons/tag-cartoon/tag-user-interface)
  ctx.lineJoin = "round";  // [2](https://craftpix.net/categorys/cartoon-gui/)
  ctx.strokeStyle = "rgba(255, 74, 154, .75)";
  ctx.beginPath();
  ctx.moveTo(m.pathPts[0].x, m.pathPts[0].y);
  for (let i = 1; i < m.pathPts.length; i++) ctx.lineTo(m.pathPts[i].x, m.pathPts[i].y);
  ctx.lineTo(m.marker.x, m.marker.y); // current segment
  ctx.stroke();
  ctx.restore();
}

function drawHintRung() {
  const m = state.manual;
  if (!state.hintsEnabled) return;
  if (!m.running || !m.waitingClick) return;
  const t = m.targets[m.targetIndex];
  if (!t) return;

  m.hintT += 0.08;
  const pulse = 0.55 + 0.45 * Math.sin(m.hintT);

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = `rgba(255, 74, 154, ${0.25 + 0.50 * pulse})`;
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(t.x1, t.y);
  ctx.lineTo(t.x2, t.y);
  ctx.stroke();
  ctx.restore();
}

function drawMarker() {
  const m = state.manual;
  if (!m.running) return;

  const shake = m.shake || 0;
  const sx = shake ? (Math.random() - 0.5) * shake : 0;
  const sy = shake ? (Math.random() - 0.5) * shake : 0;

  const cx = m.marker.x + sx;
  const cy = m.marker.y + sy;

  const size = 34;
  const radius = 8;

  // rounded avatar frame
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,.96)";
  ctx.strokeStyle = "rgba(255,74,154,.75)";
  ctx.lineWidth = 4;
  roundRect(ctx, cx - size/2, cy - size/2, size, size, radius, true, true);

  // emoji inside
  ctx.font = `20px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000";
  ctx.fillText(avatarEmoji(state.selected), cx, cy + 1);
  ctx.restore();
}

function draw() {
  resizeCanvas();

  // decay effects
  const m = state.manual;
  m.shake *= 0.85;
  m.wrongFlash *= 0.86;

  drawSky();
  drawLadder();
  drawLabels();
  drawPathTrace();
  drawHintRung();
  drawMarker();
}

/* ===============================
   Manual run (orthogonal movement)
   =============================== */
function startManual() {
  if (state.animating) return;
  state.animating = true;

  // close dialog if open
  if (resultDialog?.open) resultDialog.close();

  const m = state.manual;
  m.running = true;
  m.waitingClick = false;
  m.phase = "up";
  m.targetIndex = 0;
  m.hintT = 0;
  m.shake = 0;
  m.wrongFlash = 0;
  m.pathPts = [];

  const { bottom, top } = layout();
  m.marker = { x: xOf(state.selected), y: bottom };

  const sim = simulateUp(state.selected);
  m.targets = sim.targets;
  m.endCol = sim.endCol;

  // initial goal: go up to first target's y or to top
  if (m.targets.length) m.to = { x: m.marker.x, y: m.targets[0].y };
  else m.to = { x: m.marker.x, y: top };

  // start trace
  m.pathPts.push({ x: m.marker.x, y: m.marker.y });

  requestAnimationFrame(loop);
}

function loop() {
  const m = state.manual;
  if (!m.running) return;

  if (m.waitingClick) {
    draw();
    requestAnimationFrame(loop);
    return;
  }

  // Orthogonal movement only:
  // up: change y only; cross: change x only.
  if (m.phase === "up") {
    const dy = m.to.y - m.marker.y;     // negative to go upward
    const step = clamp(dy, -SPEED_UP, SPEED_UP);
    m.marker.y += step;

    if (Math.abs(m.marker.y - m.to.y) < 0.6) {
      m.marker.y = m.to.y;

      // record node
      m.pathPts.push({ x: m.marker.x, y: m.marker.y });

      // if there is still a rung to click at this y, stop
      if (m.targetIndex < m.targets.length) {
        m.waitingClick = true;
        m.phase = "wait";
        draw();
        requestAnimationFrame(loop);
        return;
      }

      // otherwise we're at top
      finish();
      return;
    }

    draw();
    requestAnimationFrame(loop);
    return;
  }

  if (m.phase === "cross") {
    const dx = m.to.x - m.marker.x;
    const step = clamp(dx, -SPEED_CROSS, SPEED_CROSS);
    m.marker.x += step;

    if (Math.abs(m.marker.x - m.to.x) < 0.6) {
      m.marker.x = m.to.x;

      // record node
      m.pathPts.push({ x: m.marker.x, y: m.marker.y });

      // next go up
      m.phase = "up";
      const { top } = layout();
      if (m.targetIndex < m.targets.length) {
        m.to = { x: m.marker.x, y: m.targets[m.targetIndex].y };
      } else {
        m.to = { x: m.marker.x, y: top };
      }

      draw();
      requestAnimationFrame(loop);
      return;
    }

    draw();
    requestAnimationFrame(loop);
    return;
  }

  draw();
  requestAnimationFrame(loop);
}

/* ===============================
   Finish + dialog
   =============================== */
function finish() {
  const m = state.manual;
  m.running = false;
  state.animating = false;

  const reachedHeaven = (m.endCol === state.heavenIndex);
  const endLabel = state.endLabels[m.endCol] || "（未知）";

  const encourage = reachedHeaven
    ? "🎉 做得好！在等耶穌再來的日子，也要每天走在跟隨祂的路上。"
    : "🙂 沒關係～再試一次！一步一步選擇走在正確的路上。";

  const verseLine = "「你們見祂怎樣往天上去，祂還要怎樣來。」（徒 1:11）";

  if (resultDialog && typeof resultDialog.showModal === "function") {
    if (dialogIcon) dialogIcon.textContent = reachedHeaven ? "🎉" : "🙂";
    if (dialogTitle) dialogTitle.textContent = reachedHeaven ? "你到達天國了！" : "再試一次！";
    if (dialogDesc) dialogDesc.textContent = reachedHeaven ? "你找到通往天國的那條路" : "這條路很吸引人，但沒有到天國";
    if (dialogBody) dialogBody.innerHTML = `
      <div style="margin-bottom:8px;"><b>終點：</b> ${endLabel}</div>
      <div style="margin-bottom:10px;">${encourage}</div>
      <div style="font-weight:800;color:rgba(36,48,74,.7);font-size:13px;">${verseLine}</div>
    `;
    resultDialog.showModal();
  } else if (elMsg) {
    elMsg.innerHTML = `
      <div class="messageTitle">${reachedHeaven ? "🎉 你到達天國了！" : "🙂 再試一次！"}</div>
      <div class="messageBody">
        <div style="margin-bottom:6px;"><b>終點：</b>${endLabel}</div>
        <div style="margin-bottom:8px;">${encourage}</div>
        <span class="verse">${verseLine}</span>
      </div>
    `;
  }
}

/* ===============================
   Events
   =============================== */
canvas.addEventListener("pointerdown", (e) => {
  const m = state.manual;
  if (!m.running || !m.waitingClick) return;

  const t = m.targets[m.targetIndex];
  if (!t) return;

  const pos = getCanvasPos(e);

  // Must click the correct rung
  if (!hitTestRung(pos.x, pos.y, t, RUNG_HIT_TOL)) {
    m.shake = 12;
    m.wrongFlash = 1;
    draw();
    return;
  }

  // correct
  m.waitingClick = false;
  m.phase = "cross";
  m.targetIndex++;

  m.to = { x: (t.dir > 0 ? t.x2 : t.x1), y: t.y };
  requestAnimationFrame(loop);
});

btnGo && (btnGo.onclick = () => startManual());
btnNew && (btnNew.onclick = () => newMap());

btnHint && (btnHint.onclick = () => {
  state.hintsEnabled = !state.hintsEnabled;
  syncHintUI();
  draw();
});

difficultySelect && (difficultySelect.onchange = () => {
  state.difficulty = difficultySelect.value;
  newMap();
});

/* dialog buttons */
if (resultDialog) {
  dialogClose && (dialogClose.onclick = () => resultDialog.close());
  dialogReplay && (dialogReplay.onclick = () => {
    resultDialog.close();
    startManual();
  });
  dialogNewMap && (dialogNewMap.onclick = () => {
    resultDialog.close();
    newMap();
  });
}

/* ===============================
   New Map
   =============================== */
function newMap() {
  // reset run
  state.animating = false;
  const m = state.manual;
  m.running = false;
  m.waitingClick = false;
  m.phase = "idle";
  m.targets = [];
  m.targetIndex = 0;
  m.pathPts = [];
  m.shake = 0;
  m.hintT = 0;
  m.wrongFlash = 0;

  // fixed odd columns = 5; heaven center
  state.N = 5;
  state.heavenIndex = 2;

  // apply difficulty
  const cfg = DIFFICULTY_CONFIG[state.difficulty] || DIFFICULTY_CONFIG.normal;
  state.ROWS = randInt(cfg.rows[0], cfg.rows[1]);

  state.rungs = generateRungs();

  // end labels (heaven in middle)
  const picks = shuffle(OTHER_ENDS_POOL).slice(0, state.N);
  state.endLabels = picks.map((v, i) => i === state.heavenIndex ? "✨ 天國" : v);

  state.selected = clamp(state.selected, 0, state.N - 1);

  renderChoices();
  syncHintUI();
  setMessageStable();
  draw();
}

/* ===============================
   Init
   =============================== */
newMap();
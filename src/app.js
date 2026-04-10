/* =====================================================
   Heaven Ladder Game – FIXED VERSION v2
   修正項目：
   1. showResultDiaglog → showResultDialog（拼寫錯誤）
   2. 整合三次重複的 showModal() 呼叫
   3. 移除 drawLabels() 與 drawStartAndEndIcons() 重複繪製 emoji
   4. loop() 在 waitingClick 時暫停 RAF，等 pointerdown 再重啟
   5. resizeCanvas() 移出 draw()，改由 resize 事件觸發
   6. RUNG_HIT_TOL 從 18 調高至 30（行動裝置友善）
   7. 點錯橫桿時顯示紅色警示泡泡，1.2 秒後自動消失
   8. 點對橫桿後教學提示文字立即消失
   ===================================================== */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const elChoices = document.getElementById("choices");
const elMsg = document.getElementById("message");
const elTip = document.getElementById("tip");

const btnNew = document.getElementById("btnNew");
const btnGo = document.getElementById("btnGo");
const btnHint = document.getElementById("btnHint");
const difficultySelect = document.getElementById("difficultySelect");

// Dialog
const resultDialog = document.getElementById("resultDialog");
const dialogIcon = document.getElementById("dialogIcon");
const dialogTitle = document.getElementById("dialogTitle");
const dialogDesc = document.getElementById("dialogDesc");
const dialogBody = document.getElementById("dialogBody");
const dialogClose = document.getElementById("dialogClose");
const dialogReplay = document.getElementById("dialogReplay");
const dialogNewMap = document.getElementById("dialogNewMap");

/* ===============================
   Global animation lock
   =============================== */
let animationRunning = false;
let rafID = null;

/* ===============================
   Config
   =============================== */
const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const AVATARS = ["🐑 小羊", "🐟 小魚", "🕯️ 小燈", "🍇 葡萄", "🧡 愛心"];
const OTHER_ENDS_POOL = ["🎮 只想玩", "🍬 只想吃", "😴 只想睡", "😡 愛生氣", "😎 愛炫耀"];

const EMOJI_FONT = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',system-ui";

const PADDING = { top: 96, bottom: 110, left: 96, right: 96 };

const LINE_WIDTH = 10;
const RUNG_WIDTH = 10;

const SPEED_UP = 2.6;
const SPEED_CROSS = 3.4;

// ✅ 修正5：提高觸控命中容差，行動裝置更好點擊
const RUNG_HIT_TOL = 30;

const DIFFICULTY_CONFIG = {
  easy:   { rows: [10, 14], p: 0.36 },
  normal: { rows: [18, 22], p: 0.52 },
  hard:   { rows: [24, 30], p: 0.62 }
};

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
    phase: "idle",
    targets: [],
    targetIndex: 0,
    endCol: 0,
    marker: { x: 0, y: 0 },
    to: { x: 0, y: 0 },
    pathPts: [],
    shake: 0,
    hintT: 0,
    wrongFlash: 0,
    wrongMsg: false,       // ✅ 新增：是否顯示點錯提醒
    wrongMsgTimer: null    // ✅ 新增：自動消失計時器
  }
};

/* ===============================
   Utilities
   =============================== */
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const shuffle = a => [...a].sort(() => Math.random() - 0.5);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const avatarEmoji = i => (AVATARS[i] || "").split(" ")[0];
const avatarName  = i => (AVATARS[i] || "").split(" ").slice(1).join(" ");

// ✅ 修正4：resizeCanvas 獨立出來，不在 draw() 裡每幀呼叫
function resizeCanvas() {
  const w = canvas.clientWidth || 960;
  const h = Math.round(w * 0.68);
  canvas.width = w * DPR;
  canvas.height = h * DPR;
  canvas.style.height = h + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

window.addEventListener("resize", () => {
  resizeCanvas();
  draw();
});

function layout() {
  const w = canvas.width / DPR, h = canvas.height / DPR;
  const left = PADDING.left, right = w - PADDING.right;
  const top = PADDING.top, bottom = h - PADDING.bottom;
  return {
    w, h, left, right, top, bottom,
    dx: (right - left) / (state.N - 1),
    dy: (bottom - top) / (state.ROWS - 1)
  };
}
const xOf = c => layout().left + c * layout().dx;
const yOf = r => layout().top + r * layout().dy;

/* ===============================
   Hit test helpers
   =============================== */
function getCanvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (canvas.width / DPR) / rect.width,
    y: (evt.clientY - rect.top) * (canvas.height / DPR) / rect.height
  };
}

function distPointToSeg(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (!ab2) return Math.hypot(px - ax, py - ay);
  let t = (apx * abx + apy * aby) / ab2;
  t = clamp(t, 0, 1);
  const cx = ax + t * abx, cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}
const hitTestRung = (px, py, t) => distPointToSeg(px, py, t.x1, t.y, t.x2, t.y) <= RUNG_HIT_TOL;

/* ===============================
   Ladder generation
   =============================== */
function generateRungs() {
  const { p } = DIFFICULTY_CONFIG[state.difficulty];
  const rows = [];
  for (let r = 0; r < state.ROWS; r++) {
    const row = []; let last = -99;
    for (let c = 0; c < state.N - 1; c++) {
      if (c === last + 1) continue;
      if (Math.random() < p) { row.push(c); last = c; }
    }
    rows.push(row);
  }
  return rows;
}

function simulateUp(start) {
  let col = start, targets = [];
  for (let r = state.ROWS - 1; r >= 0; r--) {
    const row = state.rungs[r], y = yOf(r);
    if (row.includes(col)) {
      targets.push({ y, x1: xOf(col), x2: xOf(col + 1), dir: 1 }); col++;
    } else if (row.includes(col - 1)) {
      targets.push({ y, x1: xOf(col - 1), x2: xOf(col), dir: -1 }); col--;
    }
  }
  return { targets, endCol: col };
}

/* ===============================
   UI: avatar choices
   =============================== */
function renderChoices() {
  elChoices.innerHTML = "";
  for (let i = 0; i < state.N; i++) {
    const chip = document.createElement("div");
    chip.className = "chip" + (i === state.selected ? " active" : "");
    chip.style.display = "flex";
    chip.style.alignItems = "center";
    chip.style.gap = "8px";
    chip.style.fontFamily = EMOJI_FONT;

    const e = document.createElement("span");
    e.textContent = avatarEmoji(i);
    e.style.fontSize = "18px";

    const n = document.createElement("span");
    n.textContent = avatarName(i);
    n.style.fontWeight = "900";

    chip.append(e, n);
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
  btnHint.textContent = state.hintsEnabled ? "💡 提示：開" : "🙈 無提示：開";
  elTip.textContent = state.hintsEnabled
    ? "提示模式：正確橫桿會發亮"
    : "無提示模式";
}

/* ===============================
   Drawing
   =============================== */
function drawSky() {
  const { w, h } = layout();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#b9f3ff");
  g.addColorStop(1, "#fff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawLadder() {
  const { top, bottom } = layout();
  ctx.lineCap = "round";

  ctx.strokeStyle = "#2a3b63";
  ctx.lineWidth = LINE_WIDTH;
  for (let c = 0; c < state.N; c++) {
    ctx.beginPath();
    ctx.moveTo(xOf(c), top);
    ctx.lineTo(xOf(c), bottom);
    ctx.stroke();
  }

  ctx.strokeStyle = "#32c6ff";
  ctx.lineWidth = RUNG_WIDTH;
  for (let r = 0; r < state.ROWS; r++) {
    for (const c of state.rungs[r]) {
      ctx.beginPath();
      ctx.moveTo(xOf(c), yOf(r));
      ctx.lineTo(xOf(c + 1), yOf(r));
      ctx.stroke();
    }
  }
}

function drawPath() {
  const m = state.manual;
  if (!m.running || !m.pathPts.length) return;
  ctx.strokeStyle = "rgba(255,74,154,.75)";
  ctx.lineWidth = 10;
  ctx.lineJoin = ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(m.pathPts[0].x, m.pathPts[0].y);
  for (const p of m.pathPts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(m.marker.x, m.marker.y);
  ctx.stroke();
}

function drawMarker() {
  const m = state.manual;
  if (!m.running) return;
  const cx = m.marker.x, cy = m.marker.y;

  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(255,74,154,.8)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(cx - 17, cy - 17, 34, 34, 8);
  ctx.fill(); ctx.stroke();

  ctx.font = `20px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(avatarEmoji(state.selected), cx, cy + 1);
}

// ✅ 修正3：drawLabels 只畫文字，不再重複畫 emoji（emoji 由 drawStartAndEndIcons 負責）
function drawLabels() {
  const { top, bottom } = layout();

  ctx.save();
  ctx.textAlign = "center";

  // 終點文字（名稱，不含 emoji）
  for (let c = 0; c < state.N; c++) {
    const isHeaven = c === state.heavenIndex;
    const label = state.endLabels[c] || "";
    // 取文字部分（去掉開頭 emoji）
    const textOnly = label.replace(/^\S+\s*/, "");

    ctx.font = isHeaven
      ? "900 18px ui-rounded, system-ui"
      : "800 14px ui-rounded, system-ui";
    ctx.fillStyle = isHeaven ? "#2ad48f" : "rgba(36,48,74,.8)";
    ctx.fillText(textOnly, xOf(c), top - 44);
  }

  // 起點角色名稱（文字，不含 emoji；emoji 由 drawStartAndEndIcons 畫）
  ctx.font = "800 13px ui-rounded, system-ui";
  for (let c = 0; c < state.N; c++) {
    ctx.fillStyle = c === state.selected
      ? "#ff4a9a"
      : "rgba(36,48,74,.85)";
    ctx.fillText(avatarName(c), xOf(c), bottom + 86);
  }

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

// ✅ 修正3：此函式負責所有 emoji 繪製（上方終點 emoji、下方角色 emoji），不與 drawLabels 重複
function drawStartAndEndIcons() {
  const { top, bottom } = layout();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 終點（上方）emoji
  ctx.font = `20px ${EMOJI_FONT}`;
  for (let c = 0; c < state.N; c++) {
    const label = state.endLabels[c] || "";
    const emoji = label.split(" ")[0];
    ctx.fillText(emoji, xOf(c), top - 68);
  }

  // 起點（下方）角色 emoji + 頭像框
  const size = 28;
  const radius = 7;

  for (let c = 0; c < state.N; c++) {
    const cx = xOf(c);
    const cy = bottom + 56;

    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.strokeStyle =
      c === state.selected ? "rgba(255,74,154,.85)" : "rgba(36,48,74,.25)";
    ctx.lineWidth = 3;
    roundRect(ctx, cx - size / 2, cy - size / 2, size, size, radius, true, true);

    ctx.font = `16px ${EMOJI_FONT}`;
    ctx.fillStyle = "#000";
    ctx.fillText(avatarEmoji(c), cx, cy + 1);
  }

  ctx.restore();
}

// ✅ 修正：waitingClick 為 true 才顯示提示；點對後立即消失
function drawTeachingHint() {
  const m = state.manual;
  if (!m.running || !m.waitingClick) return;

  const cx = m.marker.x;
  const cy = m.marker.y - 24;

  ctx.save();
  ctx.font = "14px ui-rounded, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.strokeStyle = "rgba(255,74,154,.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - 90, cy - 28, 180, 26, 10);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = "#24304a";
  ctx.fillText("👉 請點選正確的橫桿", cx, cy - 6);

  ctx.restore();
}

// ✅ 新增：點錯橫桿時的警示泡泡（顯示1.2秒後自動消失）
function drawWrongMsg() {
  const m = state.manual;
  if (!m.running || !m.wrongMsg) return;

  const cx = m.marker.x;
  const cy = m.marker.y - 60;

  ctx.save();
  ctx.font = "bold 14px ui-rounded, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  // 紅色警示泡泡
  ctx.fillStyle = "rgba(255,80,80,.95)";
  ctx.strokeStyle = "rgba(180,30,30,.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - 80, cy - 28, 160, 28, 10);
  ctx.fill(); ctx.stroke();

  // 泡泡尾巴（小三角形朝下）
  ctx.fillStyle = "rgba(255,80,80,.95)";
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy);
  ctx.lineTo(cx + 8, cy);
  ctx.lineTo(cx, cy + 10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.fillText("❌ 點錯了！請再試一次", cx, cy - 4);

  ctx.restore();
}

// ✅ 修正4：draw() 不再呼叫 resizeCanvas()
function draw() {
  drawSky();
  drawLadder();
  drawPath();
  drawMarker();
  drawLabels();
  drawStartAndEndIcons();
  drawTeachingHint();
  drawWrongMsg();  // ✅ 新增
}

/* ===============================
   Animation loop
   =============================== */
function startManual() {
  if (animationRunning) return;
  animationRunning = true;
  state.animating = true;

  const m = state.manual;
  m.running = true;
  m.waitingClick = false;
  m.phase = "up";
  m.targetIndex = 0;
  m.pathPts = [];

  const { bottom, top } = layout();
  m.marker = { x: xOf(state.selected), y: bottom };
  const sim = simulateUp(state.selected);
  m.targets = sim.targets;
  m.endCol = sim.endCol;
  m.to = m.targets.length
    ? { x: m.marker.x, y: m.targets[0].y }
    : { x: m.marker.x, y: top };
  m.pathPts.push({ ...m.marker });

  if (rafID !== null) cancelAnimationFrame(rafID);
  rafID = requestAnimationFrame(loop);
}

// ✅ 修正4：waitingClick 時不繼續跑 RAF；由 pointerdown 事件重新啟動
function loop() {
  const m = state.manual;
  if (!m.running) { animationRunning = false; return; }

  if (m.waitingClick) {
    m.phase = "wait";
    draw();
    // 暫停 RAF，等玩家點擊後由 pointerdown 重啟
    rafID = null;
    return;
  }

  if (m.phase === "up") {
    const dy = m.to.y - m.marker.y;
    m.marker.y += clamp(dy, -SPEED_UP, SPEED_UP);
    if (Math.abs(dy) < 0.6) {
      m.marker.y = m.to.y;
      m.pathPts.push({ ...m.marker });
      if (m.targetIndex < m.targets.length) {
        m.waitingClick = true;
        draw();
        rafID = null; // 暫停，等待點擊
        return;
      }
      finish();
      return;
    }
  } else if (m.phase === "cross") {
    const dx = m.to.x - m.marker.x;
    m.marker.x += clamp(dx, -SPEED_CROSS, SPEED_CROSS);
    if (Math.abs(dx) < 0.6) {
      m.marker.x = m.to.x;
      m.pathPts.push({ ...m.marker });
      m.phase = "up";
      const { top } = layout();
      m.to = m.targetIndex < m.targets.length
        ? { x: m.marker.x, y: m.targets[m.targetIndex].y }
        : { x: m.marker.x, y: top };
    }
  }

  draw();
  rafID = requestAnimationFrame(loop);
}

/* ===============================
   Finish
   =============================== */
function finish() {
  const m = state.manual;
  m.running = false;
  state.animating = false;
  animationRunning = false;
  rafID = null;

  setTimeout(showResultDialog, 300);
}

// ✅ 修正1：函式名稱從 showResultDiaglog 改為 showResultDialog
// ✅ 修正2：整合為單一 showModal() 呼叫
function showResultDialog() {
  const m = state.manual;
  const reachedHeaven = (m.endCol === state.heavenIndex);
  const endLabel = state.endLabels[m.endCol] || "未知的地方";

  if (reachedHeaven) {
    dialogIcon.textContent = "🎉";
    dialogTitle.textContent = "你到達天國了！";
    dialogDesc.textContent = "你選擇了正確的道路";
    dialogBody.innerHTML = `
      <div style="margin-bottom:8px;"><b>終點：</b> ${endLabel}</div>
      <div style="margin-bottom:10px;">
        🎉 做得好！等待耶穌再來的日子，也要每天走在跟隨祂的路上。
      </div>
      <div style="font-weight:800;color:rgba(36,48,74,.7);font-size:13px;">
        「你們見祂怎樣往天上去，祂還要怎樣來。」（徒 1:11）
      </div>
    `;
  } else {
    dialogIcon.textContent = "🙂";
    dialogTitle.textContent = "再試一次！";
    dialogDesc.textContent = "這條路很吸引人，但沒有通往天國";
    dialogBody.innerHTML = `
      <div style="margin-bottom:8px;"><b>終點：</b> ${endLabel}</div>
      <div style="margin-bottom:10px;">
        🙂 沒關係～再試一次！一步一步選擇走在正確的路上。
      </div>
      <div style="font-weight:800;color:rgba(36,48,74,.7);font-size:13px;">
        「你們見祂怎樣往天上去，祂還要怎樣來。」（徒 1:11）
      </div>
    `;
  }

  // ✅ 修正2：只呼叫一次，用 try/catch 安全 fallback
  if (resultDialog && typeof resultDialog.showModal === "function") {
    try {
      resultDialog.showModal();
    } catch (e) {
      resultDialog.setAttribute("open", "");
    }
  } else {
    resultDialog.setAttribute("open", "");
  }
}

/* ===============================
   Events
   =============================== */
canvas.addEventListener("pointerdown", e => {
  const m = state.manual;
  if (!m.running || !m.waitingClick) return;
  const t = m.targets[m.targetIndex];
  const pos = getCanvasPos(e);

  if (!hitTestRung(pos.x, pos.y, t)) {
    // ✅ 點錯：顯示警示泡泡，1.2 秒後自動消失
    m.shake = 16;
    m.wrongFlash = 1.2;
    m.wrongMsg = true;
    if (m.wrongMsgTimer) clearTimeout(m.wrongMsgTimer);
    m.wrongMsgTimer = setTimeout(() => {
      m.wrongMsg = false;
      draw();
    }, 1200);
    draw();
    return;
  }

  // ✅ 點對：立即清除所有提示（包含教學提示與錯誤泡泡）
  m.wrongMsg = false;
  if (m.wrongMsgTimer) { clearTimeout(m.wrongMsgTimer); m.wrongMsgTimer = null; }
  m.waitingClick = false;
  m.phase = "cross";
  m.targetIndex++;
  m.to = { x: t.dir > 0 ? t.x2 : t.x1, y: t.y };

  // 玩家點擊正確後重啟 RAF
  if (rafID === null && m.running) {
    animationRunning = true;
    rafID = requestAnimationFrame(loop);
  }
});

btnGo.onclick = startManual;
btnNew.onclick = () => { animationRunning = false; newMap(); };
btnHint.onclick = () => { state.hintsEnabled = !state.hintsEnabled; syncHintUI(); };
difficultySelect.onchange = () => { state.difficulty = difficultySelect.value; newMap(); };

dialogReplay.onclick = () => { resultDialog.close(); startManual(); };
dialogNewMap.onclick = () => { resultDialog.close(); newMap(); };
dialogClose.onclick = () => resultDialog.close();

/* ===============================
   New Map
   =============================== */
function newMap() {
  animationRunning = false;
  state.animating = false;
  const m = state.manual;
  m.running = false;
  m.wrongMsg = false;
  if (m.wrongMsgTimer) { clearTimeout(m.wrongMsgTimer); m.wrongMsgTimer = null; }
  if (rafID !== null) { cancelAnimationFrame(rafID); rafID = null; }

  state.ROWS = randInt(...DIFFICULTY_CONFIG[state.difficulty].rows);
  state.rungs = generateRungs();
  state.endLabels = shuffle(OTHER_ENDS_POOL).map((v, i) =>
    i === state.heavenIndex ? "✨ 天國" : v
  );

  renderChoices();
  syncHintUI();
  draw();
}

// ✅ 初始化：先 resize 再畫
resizeCanvas();
newMap();
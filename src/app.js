// src/app.js
// 可愛卡通風：粉彩天空 + 雲朵 + 彩虹 + 粗線圓角爬梯圖
// 需求：
// 1) 終點/直線數量永遠奇數
// 2) 天國永遠在正中間
// 3) 兩個按鈕：換新地圖（隨機）/ 出發（同圖重玩）
// 4) 到天國噴彩帶

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const elChoices = document.getElementById("choices");
const elMsg = document.getElementById("message");

const btnNew = document.getElementById("btnNew");
const btnGo = document.getElementById("btnGo");

// =========================
// 基本設定
// =========================

// 永遠奇數：想固定就用 5；想兩種難度可用 [5, 7]
// 兒童主日學最推薦 5（清楚、好理解）
const ODD_COUNTS = [5]; // 你要 7 就改成 [5,7] 或 [7]
const ROWS_RANGE = [11, 15]; // 橫槓層數（愈大愈複雜）
const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const AVATARS = [
  "🐑 小羊", "🐟 小魚", "🕯️ 小燈", "🍇 葡萄", "🧡 愛心", "📖 聖經", "🌈 彩虹"
];

const OTHER_ENDS_POOL = [
  "🎮 只想玩", "🍬 只想吃", "😴 只想睡", "😡 愛生氣",
  "😎 愛炫耀", "🧸 只要玩具", "🙈 不想聽", "💤 發呆中"
];

// 畫面留白
const PADDING = { top: 92, bottom: 96, left: 96, right: 96 };
const LINE_WIDTH = 10;
const RUNG_WIDTH = 10;

let state = {
  N: 5,
  ROWS: 13,
  selected: 0,
  rungs: [],     // rungs[r] = [c, c2...] 代表該 row 有橫槓連接 c<->c+1
  endLabels: [],
  heavenIndex: 2, // (N-1)/2
  animating: false,
  confetti: []
};

// =========================
// 工具
// =========================

function randInt(a, b){
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
function shuffle(arr){
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function resizeCanvas(){
  // 以容器寬度決定 canvas 尺寸，維持固定比例
  const cssWidth = canvas.clientWidth || 980;
  const cssHeight = Math.round(cssWidth * 0.68); // 甜蜜比例
  canvas.width = Math.floor(cssWidth * DPR);
  canvas.height = Math.floor(cssHeight * DPR);
  canvas.style.height = cssHeight + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function layout(){
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

function xOf(col){
  const { left, dx } = layout();
  return left + col * dx;
}
function yOf(row){
  const { top, dy } = layout();
  return top + row * dy;
}

// =========================
// 梯圖生成（避免同層相鄰橫槓黏在一起）
// =========================

function generateRungs(N, ROWS){
  const rungs = [];
  for(let r=0;r<ROWS;r++){
    const row = [];
    let lastPlaced = -99;

    for(let c=0;c<N-1;c++){
      // 不允許相鄰橫槓：如果上一個放在 c-1，就跳過
      if (c === lastPlaced + 1) continue;

      // 機率：線越多，橫槓稍微少一點
      const p = (N === 5) ? 0.42 : 0.35;
      if (Math.random() < p){
        row.push(c);
        lastPlaced = c;
      }
    }
    rungs.push(row);
  }
  return rungs;
}

// 終點標籤：中間固定天國，其餘抽卡
function generateEndLabels(N, heavenIndex){
  const picks = shuffle(OTHER_ENDS_POOL);
  const labels = [];
  let p = 0;
  for(let i=0;i<N;i++){
    if (i === heavenIndex) labels.push("✨ 天國");
    else labels.push(picks[p++] || "🌟 其他路");
  }
  return labels;
}

// =========================
// 路徑追蹤（鬼腳圖規則）
// =========================

function tracePath(startCol){
  let col = startCol;
  const pts = [{ x: xOf(col), y: yOf(0) }];

  for(let r=0;r<state.ROWS;r++){
    const y = yOf(r);
    pts.push({ x: xOf(col), y });

    const row = state.rungs[r];
    // 如果本列在 col 有橫槓 -> 往右
    if (row.includes(col)){
      col = col + 1;
      pts.push({ x: xOf(col), y });
    }
    // 如果本列在 col-1 有橫槓 -> 往左
    else if (row.includes(col - 1)){
      col = col - 1;
      pts.push({ x: xOf(col), y });
    }
  }
  const { bottom } = layout();
  pts.push({ x: xOf(col), y: bottom });

  return { endCol: col, pts };
}

// =========================
// 可愛背景：天空 / 雲 / 彩虹
// =========================

function drawSky(){
  const { w, h } = layout();

  // 漸層天空
  const g = ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0, "#b9f3ff");
  g.addColorStop(0.55, "#fff0fb");
  g.addColorStop(1, "#ffe6f3");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);

  // 小星星點點
  ctx.save();
  ctx.globalAlpha = 0.35;
  for(let i=0;i<26;i++){
    const x = randInt(20, w-20);
    const y = randInt(10, 140);
    ctx.fillStyle = (i%2===0) ? "#ffffff" : "#fff5a8";
    ctx.beginPath();
    ctx.arc(x,y, randInt(1,2), 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();

  // 彩虹（右上角）
  drawRainbow(w*0.77, h*0.12, 92);

  // 雲朵
  drawCloud(w*0.18, h*0.14, 1.05);
  drawCloud(w*0.44, h*0.10, 0.9);
  drawCloud(w*0.70, h*0.18, 1.2);
}

function drawCloud(cx, cy, s=1){
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s,s);

  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.strokeStyle = "rgba(36,48,74,.06)";
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.arc(-40, 0, 22, 0, Math.PI*2);
  ctx.arc(-15, -12, 28, 0, Math.PI*2);
  ctx.arc(18, -5, 24, 0, Math.PI*2);
  ctx.arc(44, 4, 18, 0, Math.PI*2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawRainbow(cx, cy, r){
  const colors = ["#ff5fa2","#ffb84d","#fff083","#7be495","#53d9ff","#8a7dff"];
  ctx.save();
  ctx.lineCap = "round";
  for(let i=0;i<colors.length;i++){
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r - i*12, Math.PI*0.95, Math.PI*1.85);
    ctx.stroke();
  }
  ctx.restore();
}

// =========================
// 梯圖繪製（卡通粗線/圓角）
// =========================

function drawLadder(){
  const { top, bottom } = layout();

  // 垂直線
  ctx.save();
  ctx.strokeStyle = "#2a3b63";
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = "round";
  for(let c=0;c<state.N;c++){
    ctx.beginPath();
    ctx.moveTo(xOf(c), top);
    ctx.lineTo(xOf(c), bottom);
    ctx.stroke();
  }
  ctx.restore();

  // 橫槓
  ctx.save();
  ctx.strokeStyle = "#32c6ff";
  ctx.lineWidth = RUNG_WIDTH;
  ctx.lineCap = "round";
  for(let r=0;r<state.ROWS;r++){
    const y = yOf(r);
    for(const c of state.rungs[r]){
      ctx.beginPath();
      ctx.moveTo(xOf(c), y);
      ctx.lineTo(xOf(c+1), y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawLabels(){
  const { top, bottom, w } = layout();

  // 上方：起點角色
  ctx.save();
  ctx.textAlign = "center";
  for(let c=0;c<state.N;c++){
    const isSel = c === state.selected;
    ctx.font = isSel ? "900 16px ui-rounded, system-ui" : "900 14px ui-rounded, system-ui";
    ctx.fillStyle = isSel ? "#ff4a9a" : "rgba(36,48,74,.85)";

    const text = AVATARS[c] || `角色${c+1}`;
    ctx.fillText(text, xOf(c), top - 22);
  }
  ctx.restore();

  // 下方：終點
  ctx.save();
  ctx.textAlign = "center";
  for(let c=0;c<state.N;c++){
    const label = state.endLabels[c];
    const isHeaven = c === state.heavenIndex;

    ctx.font = isHeaven ? "1000 18px ui-rounded, system-ui" : "900 14px ui-rounded, system-ui";
    ctx.fillStyle = isHeaven ? "#2ad48f" : "rgba(36,48,74,.75)";

    ctx.fillText(label, xOf(c), bottom + 44);
  }
  ctx.restore();

  // 小標題
  ctx.save();
  ctx.textAlign = "left";
  ctx.font = "1000 18px ui-rounded, system-ui";
  ctx.fillStyle = "rgba(36,48,74,.88)";
  ctx.fillText("起點", 18, 34);
  ctx.font = "900 13px ui-rounded, system-ui";
  ctx.fillStyle = "rgba(90,107,138,.9)";
  ctx.fillText("選角色 → 出發", 18, 56);
  ctx.restore();

  // 中間提示：天國在正中間
  ctx.save();
  ctx.textAlign = "right";
  ctx.font = "900 13px ui-rounded, system-ui";
  ctx.fillStyle = "rgba(90,107,138,.9)";
  ctx.fillText("✨天國永遠在正中間！", w - 18, 56);
  ctx.restore();
}

function draw(){
  resizeCanvas();
  drawSky();
  drawLadder();
  drawLabels();
  drawConfetti(); // 若有彩帶則畫
}

// =========================
// 互動：選角色 Chips
// =========================

function renderChoices(){
  elChoices.innerHTML = "";
  for(let i=0;i<state.N;i++){
    const chip = document.createElement("div");
    chip.className = "chip" + (i===state.selected ? " active" : "");
    chip.textContent = AVATARS[i] || `角色${i+1}`;
    chip.setAttribute("role","listitem");
    chip.addEventListener("click", ()=>{
      if (state.animating) return;
      state.selected = i;
      renderChoices();
      draw();
    });
    elChoices.appendChild(chip);
  }
}

function setMessage(html){
  elMsg.innerHTML = `
    <div class="messageTitle">💬 老師的小提醒</div>
    <div class="messageBody">${html}<br/><span class="verse">可搭配經文：馬太福音 7:13–14（窄門與生命之路）</span></div>
  `;
}

// =========================
// 彩帶（到天國時）
// =========================

function spawnConfetti(){
  const { w } = layout();
  state.confetti = [];
  const colors = ["#ff5fa2","#ffd166","#06d6a0","#32c6ff","#8a7dff","#ff8fab"];
  for(let i=0;i<180;i++){
    state.confetti.push({
      x: Math.random()*w,
      y: -20 - Math.random()*200,
      vx: (Math.random()-0.5)*2.2,
      vy: 2 + Math.random()*4.0,
      r: 2 + Math.random()*4.0,
      rot: Math.random()*Math.PI*2,
      vr: (Math.random()-0.5)*0.22,
      c: colors[i % colors.length],
      life: 160 + Math.random()*60
    });
  }
}

function updateConfetti(){
  const { h } = layout();
  for(const p of state.confetti){
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.vy += 0.02; // 一點重力
    p.life -= 1;
    if (p.y > h + 30) p.life = 0;
  }
  state.confetti = state.confetti.filter(p => p.life > 0);
}

function drawConfetti(){
  if (!state.confetti.length) return;
  ctx.save();
  for(const p of state.confetti){
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.c;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(-p.r, -p.r, p.r*2.2, p.r*1.3);
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  ctx.restore();
}

// =========================
// 動畫：沿路徑走
// =========================

async function animateWalk(){
  if (state.animating) return;
  state.animating = true;
  btnNew.disabled = true;
  btnGo.disabled = true;

  const { endCol, pts } = tracePath(state.selected);

  // 用 requestAnimationFrame 逐段畫
  let seg = 0;
  let t = 0;

  function lerp(a,b,u){ return a + (b-a)*u; }

  await new Promise(resolve=>{
    function frame(){
      draw();

      // 畫已走過的綠色路徑
      ctx.save();
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(42, 212, 143, .62)";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for(let i=1;i<=seg;i++){
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      if (seg < pts.length - 1){
        const p0 = pts[seg], p1 = pts[seg+1];
        ctx.lineTo(lerp(p0.x,p1.x,t), lerp(p0.y,p1.y,t));
      }
      ctx.stroke();
      ctx.restore();

      // 畫角色小泡泡
      const p0 = pts[seg];
      const p1 = pts[Math.min(seg+1, pts.length-1)];
      const cx = lerp(p0.x, p1.x, t);
      const cy = lerp(p0.y, p1.y, t);

      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.strokeStyle = "rgba(255,74,154,.55)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      ctx.font = "900 14px ui-rounded, system-ui";
      ctx.fillStyle = "#ff4a9a";
      ctx.textAlign = "center";
      ctx.fillText("★", cx, cy + 5);
      ctx.restore();

      // 彩帶更新
      if (state.confetti.length){
        updateConfetti();
      }

      t += 0.09;
      if (t >= 1){
        t = 0;
        seg += 1;
        if (seg >= pts.length - 1){
          resolve();
          return;
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  // 結果
  const reachedHeaven = (endCol === state.heavenIndex);

  if (reachedHeaven){
    spawnConfetti();
    setMessage(`🎉 太棒了！你走到了 <b>✨天國</b>！<br/>跟著耶穌走在生命的路上～`);
  } else {
    const label = state.endLabels[endCol];
    setMessage(`🙂 你走到了 <b>${label}</b>。<br/>有些路看起來很吸引人，但不一定帶我們到天國～再試一次！`);
  }

  // 讓彩帶再飛一下（非同步小段）
  const endTime = performance.now() + (reachedHeaven ? 1200 : 0);
  function confettiLoop(now){
    if (!state.confetti.length) return;
    draw();
    updateConfetti();
    if (now < endTime) requestAnimationFrame(confettiLoop);
  }
  if (reachedHeaven) requestAnimationFrame(confettiLoop);

  state.animating = false;
  btnNew.disabled = false;
  btnGo.disabled = false;
}

// =========================
// 新地圖（隨機）
// =========================

function newMap(){
  // 1) N 必為奇數
  state.N = ODD_COUNTS[randInt(0, ODD_COUNTS.length - 1)];

  // 2) ROWS 隨機
  state.ROWS = randInt(ROWS_RANGE[0], ROWS_RANGE[1]);

  // 3) 天國固定正中間
  state.heavenIndex = Math.floor((state.N - 1) / 2);

  // 4) 生成橫槓與終點
  state.rungs = generateRungs(state.N, state.ROWS);
  state.endLabels = generateEndLabels(state.N, state.heavenIndex);

  // 5) 選擇角色歸零（或你想保留也可）
  state.selected = Math.min(state.selected, state.N - 1);
  state.confetti = [];

  renderChoices();
  draw();
  setMessage(`🎯 選一個角色出發吧！<br/>✨ 天國永遠在正中間，看看哪一條路會帶你到那裡～`);
}

// =========================
// 綁定事件
// =========================

btnNew.addEventListener("click", ()=>{
  if (state.animating) return;
  newMap();
});

btnGo.addEventListener("click", ()=>{
  animateWalk();
});

window.addEventListener("resize", draw);

// =========================
// 啟動
// =========================

newMap();
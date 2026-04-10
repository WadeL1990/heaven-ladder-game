/* ===============================
   Heaven Ladder Game – Final FIXED
   Manual play + Difficulty UI
   ✅ WITH Character Selection
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

/* dialog */
const resultDialog = document.getElementById("resultDialog");
const dialogIcon = document.getElementById("dialogIcon");
const dialogTitle = document.getElementById("dialogTitle");
const dialogBody = document.getElementById("dialogBody");

/* ===============================
   Config
   =============================== */
const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const AVATARS = ["🐑 小羊", "🐟 小魚", "🕯️ 小燈", "🍇 葡萄", "🧡 愛心"];
function avatarEmoji(i){
    // AVATARS[i]形如"🐑小羊"→取出"🐑"
    return (AVATARS[i] || "").split(" ")[0] || "❓";
}
const OTHER_ENDS_POOL = ["🎮 只想玩", "🍬 只想吃", "😴 只想睡", "😡 愛生氣", "😎 愛炫耀"];

const PADDING = { top: 96, bottom: 104, left: 96, right: 96 };
const LINE_WIDTH = 10;
const RUNG_WIDTH = 10;
const SPEED_UP = 3.6;
const SPEED_CROSS = 4.8;
const RUNG_HIT_TOL = 16;

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
  animating: false,
  hintsEnabled: true,
  manual: {
    running: false,
    waitingClick: false,
    targets: [],
    targetIndex: 0,
    marker: { x: 0, y: 0 },
    to: { x: 0, y: 0 },
    phase: "idle"
  }
};

/* ===============================
   Utility
   =============================== */
const randInt = (a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const shuffle = a=>[...a].sort(()=>Math.random()-0.5);

/* ===============================
   ✅ Character Selection
   =============================== */
function renderChoices(){
  if(!elChoices) return;
  elChoices.innerHTML = "";

  for(let i=0;i<state.N;i++){
    const chip = document.createElement("div");
    chip.className = "chip" + (i===state.selected?" active":"");
    chip.textContent = avatarEmoji[i];
    chip.onclick = ()=>{
      if(state.animating) return;
      state.selected = i;
      renderChoices();
      draw();
    };
    elChoices.appendChild(chip);
  }
}

/* ===============================
    Mouse Postion
    =============================== */
function getCanvasPos(evt){
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (canvas.width / rect.width) / DPR,
    y: (evt.clientY - rect.top) * (canvas.height / rect.height) / DPR
  };
}

function hitTestRung(px, py, t){
  // 計算點到橫桿線段的距離
  const x1 = t.x1, y1 = t.y;
  const x2 = t.x2, y2 = t.y;

  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A*C + B*D;
  const lenSq = C*C + D*D;
  let param = -1;
  if(lenSq !== 0) param = dot / lenSq;

  let xx, yy;
  if(param < 0){ xx = x1; yy = y1; }
  else if(param > 1){ xx = x2; yy = y2; }
  else{
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx*dx + dy*dy) < RUNG_HIT_TOL;
}


/* ===============================
   Layout
   =============================== */
function resizeCanvas(){
  const w = canvas.clientWidth || 960;
  const h = Math.round(w*0.68);
  canvas.width = w*DPR;
  canvas.height = h*DPR;
  canvas.style.height = h+"px";
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
function layout(){
  const w = canvas.width/DPR, h = canvas.height/DPR;
  return {
    w,h,
    left:PADDING.left,
    right:w-PADDING.right,
    top:PADDING.top,
    bottom:h-PADDING.bottom,
    dx:(w-PADDING.left-PADDING.right)/(state.N-1),
    dy:(h-PADDING.top-PADDING.bottom)/(state.ROWS-1)
  };
}
const xOf=c=>layout().left+c*layout().dx;
const yOf=r=>layout().top+r*layout().dy;

/* ===============================
   Rungs
   =============================== */
function generateRungs(){
  const {p}=DIFFICULTY_CONFIG[state.difficulty];
  const rows=[];
  for(let r=0;r<state.ROWS;r++){
    const row=[]; let last=-99;
    for(let c=0;c<state.N-1;c++){
      if(c===last+1) continue;
      if(Math.random()<p){ row.push(c); last=c; }
    }
    rows.push(row);
  }
  return rows;
}

/* ===============================
   Manual Path
   =============================== */
function buildTargetsUp(start){
  let col=start, list=[];
  for(let r=state.ROWS-1;r>=0;r--){
    const row=state.rungs[r];
    if(row.includes(col)){
      list.push({y:yOf(r),x1:xOf(col),x2:xOf(col+1),dir:1});
      col++;
    }else if(row.includes(col-1)){
      list.push({y:yOf(r),x1:xOf(col-1),x2:xOf(col),dir:-1});
      col--;
    }
  }
  return list;
}

/* ===============================
   Drawing
   =============================== */
function draw(){
  resizeCanvas();
  const {top,bottom}=layout();
  ctx.clearRect(0,0,canvas.width,canvas.height);

  ctx.strokeStyle="#2a3b63";
  ctx.lineWidth=LINE_WIDTH;
  for(let c=0;c<state.N;c++){
    ctx.beginPath();
    ctx.moveTo(xOf(c),top);
    ctx.lineTo(xOf(c),bottom);
    ctx.stroke();
  }

  ctx.strokeStyle="#32c6ff";
  ctx.lineWidth=RUNG_WIDTH;
  for(let r=0;r<state.ROWS;r++){
    for(const c of state.rungs[r]){
      ctx.beginPath();
      ctx.moveTo(xOf(c),yOf(r));
      ctx.lineTo(xOf(c+1),yOf(r));
      ctx.stroke();
    }
  }

  ctx.textAlign="center";
  for(let c=0;c<state.N;c++){
    ctx.fillStyle=c===state.heavenIndex?"#2ad48f":"#24304a";
    ctx.font="900 16px ui-rounded";
    ctx.fillText(state.endLabels[c],xOf(c),top-44);

    ctx.fillStyle=c===state.selected?"#ff4a9a":"#24304a";
    ctx.font="700 14px ui-rounded";
    ctx.fillText(AVATARS[c],xOf(c),bottom+44);
  }

  drawMarker();
}

function drawMarker(){
  const m = state.manual;
  if(!m.running) return;

  const shake = m.shake || 0;
  const sx = shake ? (Math.random() - 0.5) * shake : 0;
  const sy = shake ? (Math.random() - 0.5) * shake : 0;

  const emoji = avatarEmoji(state.selected); // ✅ 同步角色

  // 泡泡底
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.strokeStyle = "rgba(255,74,154,.65)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(m.marker.x + sx, m.marker.y + sy, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 角色 emoji（取代 ★）
  ctx.font = "20px ui-rounded, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#24304a";
  ctx.fillText(emoji, m.marker.x + sx, m.marker.y + sy + 1);

  ctx.restore();
}


/* ===============================
   Manual Run
   =============================== */
function startManual(){
  if(state.animating) return;
  state.animating=true;
  const m=state.manual;
  m.running=true;
  m.targets=buildTargetsUp(state.selected);
  m.targetIndex=0;
  m.marker={x:xOf(state.selected),y:layout().bottom};
  if(m.targets.length) m.to={x:m.marker.x,y:m.targets[0].y};
  requestAnimationFrame(loop);
}

function loop(){
  const m=state.manual;
  if(!m.running) return;
  if(m.waitingClick){ draw(); requestAnimationFrame(loop); return; }

  const dx=m.to.x-m.marker.x, dy=m.to.y-m.marker.y;
  const d=Math.hypot(dx,dy);
  const speed=m.phase==="cross"?SPEED_CROSS:SPEED_UP;

  if(d<=speed){
    m.marker={...m.to};
    if(m.targetIndex<m.targets.length){
      m.waitingClick=true; draw(); return;
    }else finish();
    return;
  }
  m.marker.x+=dx/d*speed;
  m.marker.y+=dy/d*speed;
  draw(); requestAnimationFrame(loop);
}

/* ===============================
   Finish
   =============================== */
function finish(){
  state.manual.running=false;
  state.animating=false;
  if(resultDialog){
    dialogIcon.textContent="🎉";
    dialogTitle.textContent="完成了！";
    dialogBody.innerHTML="你已完成這一次的選擇。<br/>（徒 1:11）";
    resultDialog.showModal();
  }
}

/* ===============================
   Events
   =============================== */
canvas.addEventListener("pointerdown",(e)=>{
  const m = state.manual;
  if(!m.waitingClick) return;

  const t = m.targets[m.targetIndex];
  if(!t) return;

  const pos = getCanvasPos(e);

  // ✅ 關鍵：只有真的點到橫桿，才允許通過
  if(!hitTestRung(pos.x, pos.y, t)){
    // 點錯：什麼都不做（或之後你要加抖動）
    m.shake = 12;
    return;
  }

  // ✅ 點對
  m.waitingClick = false;
  m.phase = "cross";
  m.targetIndex++;

  m.to = {
    x: t.dir > 0 ? t.x2 : t.x1,
    y: t.y
  };

  requestAnimationFrame(loop);
});


btnGo.onclick=startManual;
btnNew.onclick=newMap;
btnHint.onclick=()=>{
  state.hintsEnabled=!state.hintsEnabled;
  btnHint.textContent=state.hintsEnabled?"💡 提示：開":"🙈 無提示：開";
};
difficultySelect.onchange=()=>{
  state.difficulty=difficultySelect.value;
  newMap();
};

/* ===============================
   New Map
   =============================== */
function newMap(){
  const cfg=DIFFICULTY_CONFIG[state.difficulty];
  state.ROWS=randInt(cfg.rows[0],cfg.rows[1]);
  state.rungs=generateRungs();
  state.endLabels=shuffle(OTHER_ENDS_POOL).slice(0,state.N)
    .map((v,i)=>i===state.heavenIndex?"✨ 天國":v);

  renderChoices();   // ✅ 關鍵：角色選擇在這裡生成
  draw();
}

/* ===============================
   Init
   =============================== */
newMap();
``
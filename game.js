"use strict";
/* ========= DADOS DO JOGO ========= */
const SUSP = [
  {nome:"Comissário Azevedo", cor:"blue"},
  {nome:"Srta. Escarlate", cor:"red"},
  {nome:"Mordomo Verdi", cor:"green"},
  {nome:"Dra. Violeta", cor:"purple"},
  {nome:"Madame Amarela", cor:"yellow"},
  {nome:"Sr. Corvo", cor:"black"}
];
const ARMAS = [
  {nome:"Castiçal", img:"castical"},{nome:"Chave Inglesa", img:"chave"},{nome:"Corda", img:"corda"},
  {nome:"Cano de Chumbo", img:"cano"},{nome:"Faca", img:"faca"},{nome:"Revólver", img:"revolver"}
];
const SALAS = ["Cozinha","Salão de Baile","Estufa","Sala de Jantar","Biblioteca","Sala de Bilhar","Escritório","Sala de Música","Hall de Entrada"];
const START = ["r0","r2","r6","r8","r1","r7"];
const SECRET = {0:8, 8:0, 2:6, 6:2};
const CX = [17,50,83];

/* ========= UTIL ========= */
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = n => Math.floor(Math.random()*n);
const pick = a => a[rnd(a.length)];
const shuffle = a => { a = a.slice(); for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]];} return a; };

/* ========= SOM ========= */
let actx = null, muted = false;
function beep(f=440, d=.1, type="sine", v=.08, delay=0){
  if(muted) return;
  try{
    actx = actx || new (window.AudioContext||window.webkitAudioContext)();
    const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t+d);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t+d);
  }catch(e){}
}
const sfx = {
  click: ()=>beep(520,.06,"triangle"),
  dice: ()=>{for(let i=0;i<6;i++)beep(200+rnd(300),.05,"square",.05,i*.07)},
  step: ()=>beep(260,.07,"triangle",.07),
  card: ()=>beep(700,.05,"sine",.05),
  reveal: ()=>{beep(440,.12,"sine");beep(660,.2,"sine",.08,.1)},
  win: ()=>[523,659,784,1046].forEach((f,i)=>beep(f,.3,"triangle",.09,i*.13)),
  lose: ()=>[400,320,250,180].forEach((f,i)=>beep(f,.3,"sawtooth",.06,i*.16))
};

/* ========= CARTAS ========= */
const ALLCARDS = [...SUSP.map((_,i)=>"s"+i), ...ARMAS.map((_,i)=>"a"+i), ...SALAS.map((_,i)=>"l"+i)];
const ctype = id => id[0], cidx = id => +id.slice(1);
function cardName(id){ const i=cidx(id); return ctype(id)==="s"?SUSP[i].nome:ctype(id)==="a"?ARMAS[i].nome:SALAS[i]; }
function mkCard(id, size="", flipped=true){
  const t = ctype(id), i = cidx(id);
  const tn = t==="s"?"Suspeito":t==="a"?"Arma":"Local";
  let art;
  if(t==="s") art = `<div class="art"><img src="assets/char_${SUSP[i].cor}.png" alt=""></div>`;
  else if(t==="a") art = `<div class="art arma"><img src="assets/arma_${ARMAS[i].img}.png" alt=""></div>`;
  else art = `<div class="art" style="background-image:url(assets/sala${i}.jpg)"></div>`;
  const d = document.createElement("div");
  d.className = `card ${t==="s"?"suspeito":t==="a"?"arma":"local"} ${size} ${flipped?"flipped":""}`;
  d.dataset.id = id;
  d.innerHTML = `<div class="inner"><div class="back"></div><div class="face"><div class="ctype">${tn}</div>${art}<div class="cname">${cardName(id)}</div></div></div>`;
  return d;
}

/* ========= GRAFO DO TABULEIRO ========= */
const NODES = {}, ADJ = {};
function addEdge(a,b){ (ADJ[a]=ADJ[a]||[]).push(b); (ADJ[b]=ADJ[b]||[]).push(a); }
(function buildGraph(){
  for(let i=0;i<9;i++){ NODES["r"+i] = {x:CX[i%3], y:CX[Math.floor(i/3)], room:i}; }
  for(let i=0;i<9;i++){
    const r=Math.floor(i/3), c=i%3;
    [[r,c+1],[r+1,c]].forEach(([rr,cc])=>{
      if(rr>2||cc>2) return;
      const j=rr*3+cc, id=`c${i}_${j}`;
      NODES[id] = {x:(NODES["r"+i].x+NODES["r"+j].x)/2, y:(NODES["r"+i].y+NODES["r"+j].y)/2, room:-1};
      addEdge("r"+i,id); addEdge(id,"r"+j);
    });
  }
  addEdge("r0","r8"); addEdge("r2","r6");
})();
function bfs(from){
  const dist={[from]:0}, prev={}, q=[from];
  while(q.length){ const u=q.shift(); for(const v of ADJ[u]) if(!(v in dist)){dist[v]=dist[u]+1;prev[v]=u;q.push(v);} }
  return {dist,prev};
}
function pathTo(prev, from, to){ const p=[to]; let c=to; while(c!==from){c=prev[c];p.unshift(c);} return p.slice(1); }

/* ========= ESTADO ========= */
let G = null, CONFIG = {mode:"cpu", p1:{name:"Jogador 1",susp:0}, p2:{name:"Jogador 2",susp:1}};
let busy = false;

function cur(){ return G.players[G.turn]; }
function isHumanTurn(){ return G && !G.over && !cur().cpu; }

/* ========= TELAS ========= */
function show(id){ document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active")); $("#"+id).classList.add("active"); window.scrollTo(0,0); }
function openModal(build){
  return new Promise(res=>{
    const box=$("#modal-box"); box.innerHTML=""; build(box,v=>{res(v);});
    $("#modal").classList.remove("hidden");
  });
}
function closeModal(){ $("#modal").classList.add("hidden"); $("#modal-box").innerHTML=""; }
function el(tag, cls, html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html!==undefined) e.innerHTML=html; return e; }
function btn(label, cls, fn){ const b=el("button","btn "+(cls||""),label); b.onclick=()=>{sfx.click();fn();}; return b; }
async function info(title, text, label="Continuar"){
  await openModal((box,done)=>{ box.append(el("h2","",title), el("p","",text), btn(label,"",()=>done(1))); });
  closeModal();
}
function addLog(t, cls=""){ const p=el("p",cls,t); const l=$("#log"); l.append(p); l.scrollTop=l.scrollHeight; }

/* ========= MENU / CONFIG ========= */
document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{ sfx.click(); CONFIG.mode=b.dataset.mode; buildSetup(); show("setup"); });
$("#btn-back-menu").onclick=()=>{sfx.click();show("menu");};
$("#btn-regras").onclick=()=>{ sfx.click(); info("Como jogar",
  "Três cartas secretas (um suspeito, uma arma e um local) formam a solução. As outras são distribuídas entre os jogadores. Na sua vez, role o dado e escolha uma sala destacada: o peão caminha pelos corredores, e cada casa conta um passo. As salas dos cantos opostos (Cozinha e Hall; Estufa e Escritório) têm passagem secreta, que custa um passo. Dentro de uma sala, faça uma hipótese: o adversário que tiver uma das cartas citadas deve mostrá-la em segredo. Use o Caderno para anotar. Quando tiver certeza, faça a acusação. Se errar, está eliminado!","Entendi"); };

function buildSetup(){
  const box=$("#setup-fields"); box.innerHTML="";
  const duo = CONFIG.mode==="duo";
  const players = duo ? [CONFIG.p1, CONFIG.p2] : [CONFIG.p1];
  const labels = duo ? ["Jogador 1","Jogador 2"] : ["Seu nome"];
  players.forEach((p,pi)=>{
    const f=el("div","field");
    f.append(el("label","",labels[pi]));
    const inp=el("input"); inp.value=p.name; inp.maxLength=18; inp.oninput=()=>p.name=inp.value||labels[pi];
    f.append(inp);
    const row=el("div","pick");
    SUSP.forEach((s,si)=>{
      const b=el("button",""); b.title=s.nome; b.innerHTML=`<img src="assets/char_${s.cor}.png" alt="${s.nome}">`;
      b.onclick=()=>{ sfx.click(); p.susp=si; if(duo){const o=players[1-pi]; if(o.susp===si) o.susp=(si+1)%6;} buildSetup(); };
      if(duo && players[1-pi].susp===si) b.disabled=true;
      if(p.susp===si) b.classList.add("sel");
      row.append(b);
    });
    f.append(row); box.append(f);
  });
  if(!duo) box.append(el("p","lead","Seu adversário será o Inspetor Máquina, que só usa o que descobre durante o jogo."));
}
$("#btn-start").onclick=()=>{ sfx.click(); newGame(); };
$("#btn-quit").onclick=()=>{ sfx.click(); if(G) G.over=true; pending=null; $("#notes").classList.add("hidden"); show("menu"); };
$("#btn-mute").onclick=()=>{ muted=!muted; $("#btn-mute").textContent = muted?"Som: desligado":"Som: ligado"; if(!muted) sfx.click(); };
$("#btn-notes-toggle").onclick=()=>{ sfx.click(); $("#notes").classList.toggle("hidden"); renderNotes(); };
$("#btn-notes-close").onclick=()=>$("#notes").classList.add("hidden");

/* ========= NOVA PARTIDA ========= */
async function newGame(){
  const duo = CONFIG.mode==="duo";
  let cpuSusp = pick([0,1,2,3,4,5].filter(i=>i!==CONFIG.p1.susp));
  const players = [
    {name:CONFIG.p1.name||"Jogador 1", susp:CONFIG.p1.susp, cpu:false},
    duo ? {name:CONFIG.p2.name||"Jogador 2", susp:CONFIG.p2.susp, cpu:false} : {name:"Inspetor Máquina", susp:cpuSusp, cpu:true}
  ];
  const deck = shuffle(ALLCARDS);
  const solution = { s: pick(SUSP.map((_,i)=>"s"+i)), a: pick(ARMAS.map((_,i)=>"a"+i)), l: pick(SALAS.map((_,i)=>"l"+i)) };
  const sol = [solution.s, solution.a, solution.l];
  const rest = shuffle(ALLCARDS.filter(c=>!sol.includes(c)));
  players.forEach((p,i)=>{ p.hand=[]; p.seen={}; p.marks=new Set(); p.deduced=new Set(); p.shownTo=new Set(); p.out=false; });
  rest.forEach((c,i)=>players[i%2].hand.push(c));
  players.forEach(p=>p.hand.sort((a,b)=>ALLCARDS.indexOf(a)-ALLCARDS.indexOf(b)));
  G = { players, solution, turn:0, viewer:0, roll:0, rolled:false, moved:false, suggested:false, over:false, reach:[], pawnPos:START.slice(), duo };
  $("#log").innerHTML=""; $("#hand").innerHTML=""; $("#notes").classList.add("hidden");
  $("#dice-result").textContent="Role o dado"; $("#die-img").src="assets/die1.png";
  buildBoard(); renderPawns(); updateUI();
  show("game");
  closeModal();
  addLog("Um crime foi cometido na mansão! Descubra o assassino, o local e a arma.");
  await dealAnimation();
  G.viewer = 0;
  await startTurn();
}

/* ========= TABULEIRO ========= */
function buildBoard(){
  const rooms=$("#rooms"), cor=$("#corridors"), pw=$("#pawns"), svg=$("#paths");
  rooms.innerHTML=""; cor.innerHTML=""; pw.innerHTML=""; svg.innerHTML="";
  // caminhos
  Object.keys(ADJ).forEach(a=>ADJ[a].forEach(b=>{
    if(a<b){ const A=NODES[a],B=NODES[b]; const secret=(a[0]==="r"&&b[0]==="r");
      const ln=document.createElementNS("http://www.w3.org/2000/svg","line");
      ln.setAttribute("x1",A.x);ln.setAttribute("y1",A.y);ln.setAttribute("x2",B.x);ln.setAttribute("y2",B.y);
      ln.setAttribute("stroke",secret?"#7ee2a0":"#d9ad5f");ln.setAttribute("stroke-width",secret?.5:2.4);
      ln.setAttribute("stroke-linecap","round"); if(secret) ln.setAttribute("stroke-dasharray","1.5 1.5"); else ln.setAttribute("opacity",".85");
      svg.append(ln);
    }
  }));
  for(let i=0;i<9;i++){
    const n=NODES["r"+i], r=el("div","room"); r.id="room"+i;
    r.style.left=(n.x-12)+"%"; r.style.top=(n.y-12)+"%"; r.style.backgroundImage=`url(assets/sala${i}.jpg)`;
    r.innerHTML=`<div class="rname">${SALAS[i]}${i in SECRET?" ·":""}</div>`;
    r.onclick=()=>onNodeClick("r"+i);
    rooms.append(r);
  }
  Object.keys(NODES).filter(k=>k[0]==="c").forEach(k=>{
    const d=el("div","corr"); d.id="cor_"+k; d.onclick=()=>onNodeClick(k); d.style.left=NODES[k].x+"%"; d.style.top=NODES[k].y+"%"; cor.append(d);
  });
  SUSP.forEach((s,i)=>{
    const im=el("img","pawn"); im.id="pawn"+i; im.src=`assets/pawn_${s.cor}.png`; im.alt=s.nome; im.title=s.nome; pw.append(im);
  });
}
function renderPawns(){
  const groups={};
  G.pawnPos.forEach((node,i)=>(groups[node]=groups[node]||[]).push(i));
  Object.keys(groups).forEach(node=>{
    const list=groups[node], n=NODES[node], inRoom=node[0]==="r";
    list.forEach((si,k)=>{
      let x=n.x, y=n.y+(inRoom?5:3);
      if(inRoom){
        const rows = list.length>3?2:1, row = rows===2?Math.floor(k/3):0;
        const inRow = rows===2 ? (row===0?Math.min(3,list.length):list.length-3) : list.length;
        const col = rows===2?k%3:k;
        x = n.x + (col-(inRow-1)/2)*6.4;
        y = n.y + (rows===2 ? (row===0?-1:7) : 6);
      }
      const p=$("#pawn"+si); p.style.left=x+"%"; p.style.top=y+"%"; p.style.zIndex=Math.round(y);
    });
  });
  document.querySelectorAll(".pawn").forEach((p,i)=>p.classList.toggle("active", G && !G.over && cur() && i===cur().susp));
}
function highlightRooms(list, here){
  document.querySelectorAll(".room").forEach(r=>r.classList.remove("reach","here"));
  list.forEach(i=>$("#room"+i).classList.add("reach"));
  if(here!=null) $("#room"+here).classList.add("here");
}
function curNode(pi=G.turn){ return G.pawnPos[G.players[pi].susp]; }
async function walk(si, path){
  for(const node of path){
    G.pawnPos[si]=node; renderPawns(); sfx.step();
    const p=$("#pawn"+si); p.classList.remove("hop"); void p.offsetWidth; p.classList.add("hop");
    await sleep(420);
  }
}

/* ========= DISTRIBUIÇÃO ========= */
async function dealAnimation(){
  const layer=$("#deal-layer"); layer.innerHTML="";
  const msg=el("div","","Distribuindo as cartas..."); msg.id="deal-msg"; layer.append(msg);
  const cx=innerWidth/2-37, cy=innerHeight/2-52, W=innerWidth, H=innerHeight;
  const targets=[ [W*.3,H-130], [W*.7, G.duo?H-130:40], [W/2-37,30] ];
  const order=[2,2,2]; for(let i=0;i<18;i++) order.push(i%2);
  const cards=order.map((t,i)=>{
    const c=el("div","fly card"); c.style.cssText=`left:${cx}px;top:${cy}px;`;
    c.innerHTML='<div class="inner"><div class="back" style="position:absolute;inset:0;border-radius:8px;border:2px solid #d9ad5f;background:url(assets/verso.jpg) center/cover"></div></div>';
    c.style.opacity=0; layer.append(c); return {c,t};
  });
  await sleep(300);
  for(let i=0;i<cards.length;i++){
    const {c,t}=cards[i]; sfx.card();
    c.style.opacity=1;
    requestAnimationFrame(()=>{ c.style.transform=`translate(${targets[t][0]-cx+rnd(30)-15}px,${targets[t][1]-cy}px) rotate(${rnd(40)-20}deg) scale(.8)`; });
    await sleep(i<3?220:130);
  }
  msg.textContent="Três cartas formam a solução secreta.";
  await sleep(900);
  layer.innerHTML="";
}

/* ========= MÃO E CADERNO ========= */
function renderHand(animate=true){
  const h=$("#hand"); h.innerHTML="";
  const p=G.players[G.viewer];
  $("#hand-owner").textContent="("+p.name+")";
  p.hand.forEach((id,i)=>{
    const c=mkCard(id,"",false); h.append(c);
    setTimeout(()=>{c.classList.add("flipped"); sfx.card();}, animate? 150+i*120 : 0);
  });
  renderNotes();
}
function cardStatus(p,id){
  if(p.hand.includes(id)) return ["mine","minha"];
  if(id in p.seen) return ["seen","vista"];
  if(p.marks.has(id)) return ["mark","descartada"];
  return ["","?"];
}
function renderNotes(){
  if($("#notes").classList.contains("hidden")) return;
  const p=G.players[G.viewer], b=$("#notes-body"); b.innerHTML="";
  b.append(el("p","", "<small style='color:#b9a58a'>Clique para marcar/desmarcar. Cartas suas e reveladas são marcadas automaticamente.</small>"));
  [["s","Suspeitos"],["a","Armas"],["l","Locais"]].forEach(([t,title])=>{
    b.append(el("h4","",title));
    ALLCARDS.filter(c=>c[0]===t).forEach(id=>{
      const [cls,tag]=cardStatus(p,id);
      const r=el("div","nrow "+cls); r.innerHTML=`<span>${cardName(id)}</span><span class="tag">${id in p.seen?"vista ("+p.seen[id]+")":tag}</span>`;
      r.onclick=()=>{ if(cls==="mine"||cls==="seen") return; p.marks.has(id)?p.marks.delete(id):p.marks.add(id); sfx.click(); renderNotes(); };
      b.append(r);
    });
  });
}

/* ========= UI ========= */
function updateUI(){
  if(!G) return;
  const hum = isHumanTurn() && !busy;
  $("#btn-roll").disabled = !(hum && !G.rolled);
  $("#btn-suggest").disabled = !(hum && !G.suggested && NODES[curNode()].room>=0);
  $("#btn-accuse").disabled = !hum;
  $("#btn-end").disabled = !(hum && G.moved);
  if(!G.over) $("#turn-info").innerHTML = `Vez de <b>${cur().name}</b> · ${SUSP[cur().susp].nome} · ${NODES[curNode()].room>=0?SALAS[NODES[curNode()].room]:"Corredor"}`;
  renderPawns();
}

/* ========= TURNO ========= */
async function startTurn(){
  if(G.over) return;
  const p=cur();
  G.rolled=false; G.moved=false; G.suggested=false; G.roll=0; G.reach=[];
  highlightRooms([], null);
  $("#dice-result").textContent="Role o dado";
  if(p.cpu){
    updateUI(); addLog("Vez da Máquina.");
    await sleep(600); await cpuTurn(); return;
  }
  if(G.duo){
    G.viewer=G.turn; $("#hand").innerHTML="";
    await openModal((box,done)=>{
      box.append(el("h2","",`Vez de ${p.name}`), el("p","",`Passe o computador para ${p.name}. Só ${p.name} deve olhar a tela.`), btn("Estou pronto","",()=>done(1)));
    });
    closeModal();
  }
  renderHand(true);
  addLog(`Vez de ${p.name}.`,"me");
  updateUI();
}
async function endTurn(){
  if(G.over) return;
  highlightRooms([],null);
  do{ G.turn=(G.turn+1)%G.players.length; }while(cur().out);
  await startTurn();
}
$("#btn-end").onclick=()=>{ sfx.click(); if(isHumanTurn()&&!busy) endTurn(); };

/* ========= DADO ========= */
async function rollDie(){
  const d=$("#dice"), im=$("#die-img");
  const result=1+rnd(6);
  d.classList.add("rolling"); sfx.dice();
  for(let i=0;i<10;i++){ im.src=`assets/die${1+rnd(6)}.png`; await sleep(80+i*10); }
  d.classList.remove("rolling"); im.src=`assets/die${result}.png`;
  return result;
}
let pending=null;
function nodeEl(k){ return k[0]==="r"?$("#room"+NODES[k].room):$("#cor_"+k); }
function clearHL(){ document.querySelectorAll(".reach,.here").forEach(e=>e.classList.remove("reach","here")); }
function chooseNode(opts, stopKey){
  return new Promise(res=>{
    clearHL(); opts.forEach(k=>nodeEl(k).classList.add("reach"));
    if(stopKey) nodeEl(stopKey).classList.add("here");
    pending={opts,stopKey,res};
  });
}
function onNodeClick(k){
  if(!pending) return;
  let v=null;
  if(pending.opts.includes(k)) v=k; else if(pending.stopKey===k) v="stop";
  if(!v) return;
  const r=pending.res; pending=null; clearHL(); sfx.click(); r(v);
}
async function humanMove(n){
  const si=cur().susp; let steps=n, prev=null;
  while(steps>0){
    const node=G.pawnPos[si], isRoom=node[0]==="r";
    let opts=ADJ[node].slice();
    if(!isRoom && prev!==null) opts=opts.filter(x=>x!==prev);
    let next;
    if(opts.length===1) next=opts[0];
    else{
      $("#dice-result").innerHTML=`Passos restantes: <b>${steps}</b>. Escolha o caminho (frente ou trás)${isRoom?" ou clique na sua sala para parar":""}.`;
      next=await chooseNode(opts, isRoom?node:null);
      if(next==="stop") break;
    }
    prev=node; steps--; await walk(si,[next]);
  }
  $("#dice-result").innerHTML=`Movimento concluído.`;
}
$("#btn-roll").onclick=async()=>{
  if(!isHumanTurn()||busy||G.rolled) return;
  busy=true; updateUI();
  const r=await rollDie();
  G.roll=r; G.rolled=true;
  addLog(`${cur().name} tirou ${r} no dado.`,"me");
  await humanMove(r);
  G.moved=true; busy=false; updateUI();
  const nd=NODES[curNode()];
  addLog(nd.room>=0?`${cur().name} está em ${SALAS[nd.room]}. Faça uma hipótese ou encerre o turno.`:`${cur().name} parou no corredor. Não é possível fazer hipótese aqui.`,"me");
};
async function moveTo(pi,room){
  const si=G.players[pi].susp, from=G.pawnPos[si], to="r"+room;
  if(from===to) return;
  const {prev}=bfs(from); await walk(si, pathTo(prev,from,to));
}

/* ========= HIPÓTESE ========= */
function pickerSection(box,title,items,sel,key,onchange){
  box.append(el("div","sec-title",title));
  const wrap=el("div","choices");
  items.forEach(it=>{
    const b=el("button","choice"+(sel[key]===it.v?" sel":""),(it.img?`<img src="${it.img}" alt="">`:"")+`<span>${it.label}</span>`);
    b.onclick=()=>{ sfx.click(); sel[key]=it.v; [...wrap.children].forEach(c=>c.classList.remove("sel")); b.classList.add("sel"); onchange(); };
    wrap.append(b);
  });
  box.append(wrap);
}
const suspItems=()=>SUSP.map((s,i)=>({v:"s"+i,label:s.nome,img:`assets/pawn_${s.cor}.png`}));
const armaItems=()=>ARMAS.map((a,i)=>({v:"a"+i,label:a.nome,img:`assets/arma_${a.img}.png`}));
const salaItems=()=>SALAS.map((s,i)=>({v:"l"+i,label:s}));

$("#btn-suggest").onclick=async()=>{
  if(!isHumanTurn()||busy||G.suggested) return;
  busy=true; updateUI();
  const room=NODES[curNode()].room, sel={};
  const res=await openModal((box,done)=>{
    box.append(el("h2","","Fazer hipótese"), el("p","",`Local da hipótese: <b style="color:#f3d58f">${SALAS[room]}</b>`));
    const ok=btn("Perguntar","",()=>done(sel)); ok.disabled=true;
    const chk=()=>ok.disabled=!(sel.s&&sel.a);
    pickerSection(box,"Suspeito",suspItems(),sel,"s",chk);
    pickerSection(box,"Arma",armaItems(),sel,"a",chk);
    box.append(ok, btn("Cancelar","ghost",()=>done(null)));
  });
  closeModal();
  if(!res){ busy=false; updateUI(); return; }
  G.suggested=true;
  await doSuggestion(G.turn,res.s,res.a);
  busy=false; updateUI();
};

async function doSuggestion(pi,s,a){
  const p=G.players[pi], room=NODES[curNode(pi)].room, l="l"+room, ids=[s,a,l];
  addLog(`${p.name} sugere: ${cardName(s)}, com ${cardName(a)}, em ${SALAS[room]}.`, p.cpu?"":"me");
  // suspeito é levado à sala
  G.pawnPos[cidx(s)]="r"+room; renderPawns(); sfx.step(); await sleep(800);
  for(let k=1;k<G.players.length;k++){
    const ri=(pi+k)%G.players.length, r=G.players[ri];
    const matches=r.hand.filter(c=>ids.includes(c));
    if(!matches.length){ addLog(`${r.name} não tem nenhuma dessas cartas.`); await sleep(400); continue; }
    const card=await chooseShown(ri,pi,matches);
    addLog(`${r.name} mostrou uma carta a ${p.name}.`);
    await revealCard(pi,ri,card);
    return {ri,card};
  }
  addLog("Ninguém pôde refutar a hipótese!","bad");
  if(p.cpu) ids.forEach(c=>{ if(!p.hand.includes(c)) p.deduced.add(c); });
  else await info("Ninguém refutou","Nenhum adversário possui qualquer uma dessas cartas. Elas estão na sua mão ou são a solução!");
  return null;
}
async function chooseShown(ri,pi,matches){
  const r=G.players[ri], p=G.players[pi];
  if(r.cpu){
    const prev=matches.filter(c=>r.shownTo.has(c));
    const c=prev.length?pick(prev):pick(matches); r.shownTo.add(c); await sleep(700); return c;
  }
  if(G.duo){
    await openModal((box,done)=>{ box.append(el("h2","",`Passe para ${r.name}`), el("p","",`${p.name} fez uma hipótese. ${r.name} deve responder em segredo.`), btn(`Sou ${r.name}`,"",()=>done(1))); });
  }
  const c=await openModal((box,done)=>{
    box.append(el("h2","","Mostre uma carta"), el("p","",`${p.name} fez uma hipótese. Você tem ${matches.length>1?"estas cartas":"esta carta"}. Escolha qual mostrar:`));
    const row=el("div","row");
    matches.forEach(id=>{ const cd=mkCard(id,"md",true); cd.classList.add("pickable"); cd.onclick=()=>{sfx.reveal();done(id);}; row.append(cd); });
    box.append(row);
  });
  closeModal();
  if(G.duo){
    await openModal((box,done)=>{ box.append(el("h2","",`Devolva para ${p.name}`), el("p","",`Entregue o computador a ${p.name}.`), btn(`Sou ${p.name}`,"",()=>done(1))); });
    closeModal();
  }
  return c;
}
async function revealCard(pi,ri,card){
  const p=G.players[pi], r=G.players[ri];
  p.seen[card]=r.name;
  if(p.cpu){ await sleep(500); return; }
  await openModal((box,done)=>{
    box.append(el("h2","",`${r.name} mostrou uma carta`), el("p","","Somente você viu esta carta. Anote no caderno!"));
    const row=el("div","row"), c=mkCard(card,"lg",false); row.append(c); box.append(row, btn("Entendi","",()=>done(1)));
    setTimeout(()=>{c.classList.add("flipped");sfx.reveal();},400);
  });
  closeModal(); renderNotes();
}

/* ========= ACUSAÇÃO ========= */
$("#btn-accuse").onclick=async()=>{
  if(!isHumanTurn()||busy) return;
  busy=true; updateUI();
  const sel={};
  const nd=curNode();
  const allowed = NODES[nd].room>=0 ? [NODES[nd].room] : ADJ[nd].map(k=>NODES[k].room);
  const res=await openModal((box,done)=>{
    box.append(el("h2","","Acusação final"), el("p","","Se errar, você estará eliminado. Tem certeza do culpado, da arma e do local?"));
    const ok=btn("Acusar","danger",()=>done(sel));
    const chk=()=>ok.disabled=!(sel.s&&sel.a&&sel.l); chk();
    pickerSection(box,"Suspeito",suspItems(),sel,"s",chk);
    pickerSection(box,"Arma",armaItems(),sel,"a",chk);
    if(allowed.length===1){ sel.l="l"+allowed[0]; box.append(el("p","",`Local da acusação: <b style="color:#f3d58f">${SALAS[allowed[0]]}</b> (você só pode acusar onde está)`)); }
    else pickerSection(box,"Local (uma das salas ao lado do corredor)",allowed.map(i=>({v:"l"+i,label:SALAS[i]})),sel,"l",chk);
    box.append(ok, btn("Cancelar","ghost",()=>done(null)));
  });
  closeModal();
  if(!res){ busy=false; updateUI(); return; }
  await resolveAccusation(G.turn,res);
};
async function resolveAccusation(pi,acc){
  const p=G.players[pi], sol=G.solution;
  addLog(`${p.name} acusa: ${cardName(acc.s)}, ${cardName(acc.a)}, ${cardName(acc.l)}.`, "bad");
  const correct = acc.s===sol.s && acc.a===sol.a && acc.l===sol.l;
  busy=false;
  if(!correct){
    sfx.lose(); addLog("Acusação errada! O jogo continua.","bad");
    await info("Acusação errada!","Está errado. Continue investigando.","Continuar");
    await endTurn(); return;
  }
  G.over=true;
  const humanWon = !p.cpu;
  const title = G.duo ? `${p.name} venceu!` : (humanWon?"Vitória!":"Derrota");
  const good = G.duo || humanWon;
  highlightRooms([],null); updateUI();
  good?sfx.win():sfx.lose();
  await openModal((box,done)=>{
    box.append(el("h2",good?"win-title":"lose-title",title), el("p","",`${p.name} desvendou o mistério! A solução era:`));
    const row=el("div","row"); const cs=[sol.s,sol.a,sol.l].map(id=>mkCard(id,"lg",false)); cs.forEach(c=>row.append(c)); box.append(row);
    cs.forEach((c,i)=>setTimeout(()=>{c.classList.add("flipped");sfx.reveal();},500+i*600));
    box.append(btn("Nova partida","",()=>done("again")), btn("Menu inicial","ghost",()=>done("menu")));
  }).then(v=>{ closeModal(); if(v==="again") newGame(); else { $("#notes").classList.add("hidden"); show("menu"); } });
}

/* ========= IA DA MÁQUINA ========= */
function cpuKnowledge(p){
  const known=new Set([...p.hand, ...Object.keys(p.seen)]);
  const out={};
  [["s",SUSP.length],["a",ARMAS.length],["l",SALAS.length]].forEach(([t,n])=>{
    const all=[...Array(n).keys()].map(i=>t+i);
    const ded=all.filter(c=>p.deduced.has(c));
    const unk=all.filter(c=>!known.has(c));
    out[t]={unk, target: ded.length?ded[0]:(unk.length===1?unk[0]:null)};
  });
  return out;
}
async function cpuTurn(){
  const pi=G.turn, p=cur();
  let K=cpuKnowledge(p);
  const sure=()=>K.s.target&&K.a.target&&K.l.target;
  if(sure()){ await cpuAccuse(K); return; }
  // rolar
  addLog("A Máquina rola o dado...");
  const r=await rollDie(); G.roll=r; G.rolled=true;
  $("#dice-result").innerHTML=`Máquina tirou <b>${r}</b>.`;
  addLog(`Máquina tirou ${r}.`);
  await sleep(500);
  const here=curNode(pi), {dist,prev}=bfs(here);
  const reach=[]; for(let i=0;i<9;i++) if(dist["r"+i]<=r) reach.push(i);
  // escolher sala: prioriza salas ainda desconhecidas
  const goal = K.l.target ? [cidx(K.l.target)] : K.l.unk.map(c=>cidx(c));
  let dest;
  const good=reach.filter(i=>goal.includes(i));
  if(good.length) dest=pick(good);
  else{
    // aproxima-se da sala desconhecida mais próxima
    let best=1e9, cands=[];
    reach.forEach(i=>{
      const d2=bfs("r"+i).dist; const m=Math.min(...goal.map(g=>d2["r"+g]));
      if(m<best){best=m;cands=[i];} else if(m===best) cands.push(i);
    });
    dest=pick(cands);
  }
  highlightRooms([dest],null); await sleep(500); highlightRooms([],null);
  await moveTo(pi,dest); G.moved=true; updateUI();
  addLog(`A Máquina foi para ${SALAS[dest]}.`);
  await sleep(500);
  // hipótese
  const s=K.s.target||pick(K.s.unk), a=K.a.target||pick(K.a.unk);
  G.suggested=true;
  await doSuggestion(pi,s,a);
  K=cpuKnowledge(p);
  await sleep(500);
  if(K.s.target&&K.a.target&&K.l.target){ await cpuAccuse(K); return; }
  await endTurn();
}
async function cpuAccuse(K){
  const acc={s:K.s.target,a:K.a.target,l:K.l.target};
  await info("A Máquina acusa!",`Acusação: ${cardName(acc.s)}, com ${cardName(acc.a)}, em ${cardName(acc.l)}.`,"Ver resultado");
  await resolveAccusation(G.turn,acc);
}

/* ========= TELA CHEIA ========= */
function toggleFull(){
  const d=document, de=d.documentElement;
  const inFull=d.fullscreenElement||d.webkitFullscreenElement;
  try{
    if(!inFull){ (de.requestFullscreen||de.webkitRequestFullscreen).call(de); }
    else { (d.exitFullscreen||d.webkitExitFullscreen).call(d); }
  }catch(e){}
}
function updFullLabel(){
  const t=(document.fullscreenElement||document.webkitFullscreenElement)?"Sair da tela cheia":"Tela cheia";
  ["#btn-full","#btn-full-menu"].forEach(id=>{const b=$(id); if(b) b.textContent=t;});
}
["#btn-full","#btn-full-menu"].forEach(id=>$(id).onclick=()=>{sfx.click();toggleFull();});
document.addEventListener("fullscreenchange",updFullLabel);
document.addEventListener("webkitfullscreenchange",updFullLabel);

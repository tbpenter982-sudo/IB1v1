(() => {
'use strict';

/* ==============================================================
   IB RACE v5
   - 2–6 player Firebase races
   - external, separate Race + Practice question banks
   - SL/HL, Normal/Hard, hints worth 0.6 on a correct race answer
   - typed scientific calculator
   - self-rendering interface (does not depend on the old HTML screens)
   ============================================================== */

const SUBJECTS = {
  mathAA:{name:'Mathematics: Analysis & Approaches',short:'Math AA',icon:'∫',topics:['Algebra','Functions','Trigonometry','Calculus','Vectors','Probability & Statistics']},
  mathAI:{name:'Mathematics: Applications & Interpretation',short:'Math AI',icon:'Σ',topics:['Number & Algebra','Functions','Geometry & Trigonometry','Statistics & Probability','Calculus','Financial Mathematics']},
  physics:{name:'Physics',short:'Physics',icon:'⚛',topics:['Mechanics','Waves','Fields','Electricity','Thermal','Nuclear']},
  chemistry:{name:'Chemistry',short:'Chemistry',icon:'◌',topics:['Stoichiometry','Atomic Structure','Bonding','Energetics','Kinetics','Equilibrium','Acids & Bases','Redox','Organic']},
  biology:{name:'Biology',short:'Biology',icon:'⌬',topics:['Cell Biology','Molecular Biology','Genetics','Metabolism','Ecology','Evolution','Human Physiology']},
  economics:{name:'Economics',short:'Economics',icon:'↗',topics:['Microeconomics','Macroeconomics','Global Economy','Development']},
  ess:{name:'Environmental Systems & Societies',short:'ESS',icon:'◎',topics:['Ecosystems','Biodiversity','Pollution','Climate Change','Water & Food','Energy & Resources','Sustainability']}
};

const DEFAULT_QUESTION_BANKS = {
  race: { url: './questionbanks/race.json', fallback: './questionbanks/race.json' },
  practice: { url: './questionbanks/practice.json', fallback: './questionbanks/practice.json' }
};

const BUILD_INFO = {
  version: '5.2.1-grading-fix',
  questionBankHost: 'local + authorized imports'
};

const DEFAULT_CONFIG = {
  subject:'mathAA', level:'HL', hardMode:false,
  topics:[], subtopics:[], count:10, time:300, maxPlayers:6
};

const state = {
  screen:'home',
  banks:{race:[],practice:[]},
  bankStatus:{race:'loading',practice:'loading'},
  bankErrors:{race:'',practice:''},
  config:{...DEFAULT_CONFIG},
  firebaseDb:null,
  roomRef:null,
  roomListener:null,
  roomCode:null,
  room:null,
  playerKey:null,
  playerName:'Player',
  sessionId:`s_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`,
  isHost:false,
  activeRound:null,
  race:{questions:[],index:0,score:0,answered:[],hintUsed:false,submitted:false,timer:null,startedAt:0},
  practiceConfig:{subject:'mathAA',level:'HL',topics:[],subtopics:[],difficulty:'mixed',count:10},
  practice:{active:false,questions:[],index:0,startedAt:0,timer:null},
  calc:{angle:'DEG',result:'0'},
  toastTimer:null
};

const app = document.getElementById('app') || (()=>{ const x=document.createElement('div'); x.id='app'; document.body.appendChild(x); return x; })();
const $ = (sel,root=document) => root.querySelector(sel);
const $$ = (sel,root=document) => [...root.querySelectorAll(sel)];
const esc = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const round=(n,d=3)=>Math.round((Number(n)+Number.EPSILON)*10**d)/10**d;
const shuffle = arr => { const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const prettyTime = sec => { sec=Math.max(0,Math.floor(Number(sec)||0)); return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`; };
const safeCode=()=>Math.random().toString(36).slice(2,8).toUpperCase().padEnd(6,'X').slice(0,6);
const normalizeText=s=>String(s??'').trim().toLowerCase().replace(/[−–—]/g,'-').replace(/\s+/g,' ').replace(/[.,;:!?]+$/g,'');
const levelsFor=q=>Array.isArray(q.levels)?q.levels:(Array.isArray(q.level)?q.level:[q.level||'Both']);
const topicsFor=q=>Array.isArray(q.topics)?q.topics:[q.topic].filter(Boolean);
const subtopicsFor=q=>Array.isArray(q.subtopics)?q.subtopics:[q.subtopic].filter(Boolean);

function toast(message){
  let el=$('#toast');
  if(!el){ el=document.createElement('div'); el.id='toast'; el.className='toast'; document.body.appendChild(el); }
  el.textContent=message; el.classList.add('show');
  clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>el.classList.remove('show'),2200);
}

function setScreen(name){ state.screen=name; $$('.screen').forEach(x=>x.classList.toggle('active',x.dataset.screen===name)); window.scrollTo({top:0,behavior:'smooth'}); }

function renderShell(){
  app.innerHTML=`
    <div class="app-shell">
      <header class="topbar">
        <button class="brand btn ghost" id="brand-home" type="button" aria-label="Home">
          <span class="brand-mark">⚡</span><span class="brand-copy"><strong>IB RACE</strong><span>race • practise • improve</span></span>
        </button>
        <div class="top-actions">
          <div class="bank-indicator"><span id="bank-dot" class="status-dot"></span><span id="bank-status">Loading question banks…</span></div>
          <button class="btn secondary" id="global-calc" type="button">⌨ Calculator</button>
        </div>
      </header>

      <section class="screen active" data-screen="home" id="screen-home"></section>
      <section class="screen" data-screen="setup" id="screen-setup"></section>
      <section class="screen" data-screen="join" id="screen-join"></section>
      <section class="screen" data-screen="lobby" id="screen-lobby"></section>
      <section class="screen" data-screen="race" id="screen-race"></section>
      <section class="screen" data-screen="results" id="screen-results"></section>
      <section class="screen" data-screen="practice" id="screen-practice"></section>
    </div>
    ${calculatorMarkup()}
  `;
  $('#brand-home').addEventListener('click',leaveToHome);
  $('#global-calc').addEventListener('click',openCalculator);
  bindCalculator();
  renderHome();
  updateBankIndicator();
}

function renderHome(){
  $('#screen-home').innerHTML=`
    <div class="hero">
      <div class="hero-main">
        <div class="eyebrow">competitive IB revision</div>
        <h1>Stop revising.<br><em>Start racing.</em></h1>
        <div class="hero-copy">Challenge up to five friends on the same IB subject, or drill a separate practice bank on your own. Fast setup, live standings, hard mode, formula hints and a built-in calculator.</div>
        <div class="hero-actions">
          <button class="btn primary" id="home-create">⚡ Create race</button>
          <button class="btn secondary" id="home-join">⌁ Join room</button>
          <button class="btn secondary" id="home-practice">◎ Practice</button>
        </div>
      </div>
      <aside class="hero-side">
        <div class="mode-card"><div class="mode-icon">🏁</div><h3>2–6 player races</h3><p>Everyone gets the same questions. Scores update live. Hard mode rewards clean answers and punishes misses.</p></div>
        <div class="mode-card"><div class="mode-icon">◫</div><h3>Separate practice bank</h3><p>Practice questions never have to be the questions used in races. Filter by subject, level, topic and difficulty.</p></div>
        <div class="mini-stat-row">
          <div class="mini-stat"><b>7</b><span>subjects</span></div>
          <div class="mini-stat"><b>SL / HL</b><span>levels</span></div>
          <div class="mini-stat"><b>5</b><span>difficulty levels</span></div>
        </div>
      </aside>
    </div>`;
  $('#home-create').addEventListener('click',()=>{ state.isHost=true; state.config={...DEFAULT_CONFIG,topics:[],subtopics:[]}; renderSetup(); setScreen('setup'); });
  $('#home-join').addEventListener('click',()=>{ renderJoin(); setScreen('join'); });
  $('#home-practice').addEventListener('click',()=>{ renderPractice(); setScreen('practice'); });
}

function renderSetup(){
  const c=state.config;
  $('#screen-setup').innerHTML=`
    <div class="backline"><button class="btn ghost" id="setup-back">← Home</button></div>
    <div class="setup-grid">
      <div class="panel">
        <div class="panel-head"><div><h2>Build a race</h2><p>Choose exactly what everyone will be tested on.</p></div></div>
        <div class="setup-section"><div class="label">Subject</div><div class="subject-grid" id="subject-grid"></div></div>
        <div class="setup-section"><div class="label">Level</div><div class="segmented" id="level-toggle"><button class="seg-btn ${c.level==='SL'?'selected':''}" data-level="SL">SL</button><button class="seg-btn ${c.level==='HL'?'selected':''}" data-level="HL">HL</button></div></div>
        <div class="setup-section"><div class="label">Race mode</div><div class="segmented" id="hard-toggle"><button class="seg-btn ${!c.hardMode?'selected':''}" data-hard="false">Normal · 1 pt</button><button class="seg-btn ${c.hardMode?'selected':''}" data-hard="true">🔥 Hard · +2 / −1</button></div></div>
        <div class="setup-section"><div class="label">Topics</div><div class="topic-grid" id="topic-grid"></div></div>
        <div class="form-grid">
          <div class="field"><label>Your name</label><input id="host-name" class="input" maxlength="22" value="${esc(state.playerName==='Player'?'':state.playerName)}" placeholder="e.g. Neil"></div>
          <div class="field"><label>Players</label><select id="max-players" class="select">${[2,3,4,5,6].map(n=>`<option value="${n}" ${c.maxPlayers===n?'selected':''}>Up to ${n}</option>`).join('')}</select></div>
          <div class="field"><label>Questions</label><select id="race-count" class="select">${[1,3,5,10,15,20,25,30].map(n=>`<option value="${n}" ${c.count===n?'selected':''}>${n}</option>`).join('')}</select></div>
          <div class="field"><label>Timer</label><select id="race-time" class="select">${[[0,'No timer'],[180,'3 min'],[300,'5 min'],[600,'10 min'],[900,'15 min']].map(([v,t])=>`<option value="${v}" ${c.time===v?'selected':''}>${t}</option>`).join('')}</select></div>
        </div>
        <div id="setup-error" class="error-text"></div>
      </div>
      <aside class="summary-box">
        <h3>Race preview</h3><div class="summary-list" id="setup-summary"></div>
        <div class="bank-note" id="setup-bank-note"></div>
        <button class="btn primary full" id="create-room" style="margin-top:15px">Create room →</button>
      </aside>
    </div>`;
  renderSubjectButtons('#subject-grid',c.subject,key=>{ c.subject=key; c.topics=[...SUBJECTS[key].topics]; renderSetup(); });
  renderTopicButtons('#topic-grid',SUBJECTS[c.subject].topics,c.topics,topic=>{ c.topics=c.topics.includes(topic)?c.topics.filter(x=>x!==topic):[...c.topics,topic]; updateSetupSummary(); renderTopicsOnly(); });
  $('#setup-back').addEventListener('click',leaveToHome);
  $$('#level-toggle [data-level]').forEach(b=>b.addEventListener('click',()=>{ c.level=b.dataset.level; renderSetup(); }));
  $$('#hard-toggle [data-hard]').forEach(b=>b.addEventListener('click',()=>{ c.hardMode=b.dataset.hard==='true'; renderSetup(); }));
  $('#max-players').addEventListener('change',e=>{ c.maxPlayers=Number(e.target.value); updateSetupSummary(); });
  $('#race-count').addEventListener('change',e=>{ c.count=Number(e.target.value); updateSetupSummary(); });
  $('#race-time').addEventListener('change',e=>{ c.time=Number(e.target.value); updateSetupSummary(); });
  $('#host-name').addEventListener('input',e=>state.playerName=e.target.value.trim()||'Player');
  $('#create-room').addEventListener('click',createRoom);
  updateSetupSummary();
}

function renderTopicsOnly(){
  renderTopicButtons('#topic-grid',SUBJECTS[state.config.subject].topics,state.config.topics,topic=>{
    const c=state.config; c.topics=c.topics.includes(topic)?c.topics.filter(x=>x!==topic):[...c.topics,topic]; renderTopicsOnly(); updateSetupSummary();
  });
}
function renderSubjectButtons(selector,selected,onPick){
  const root=$(selector); if(!root)return;
  root.innerHTML=Object.entries(SUBJECTS).map(([key,s])=>`<button class="subject-btn ${key===selected?'selected':''}" data-subject="${key}"><span class="subject-icon">${s.icon}</span><span>${esc(s.short)}</span></button>`).join('');
  $$('[data-subject]',root).forEach(b=>b.addEventListener('click',()=>onPick(b.dataset.subject)));
}
function renderTopicButtons(selector,topics,selected,onToggle){
  const root=$(selector); if(!root)return;
  root.innerHTML=topics.map(t=>`<button class="chip ${selected.includes(t)?'selected':''}" data-topic="${esc(t)}">${esc(t)}</button>`).join('');
  $$('[data-topic]',root).forEach(b=>b.addEventListener('click',()=>onToggle(b.dataset.topic)));
}
function updateSetupSummary(){
  const c=state.config, bank=matchingRacePool(c);
  if($('#setup-summary')) $('#setup-summary').innerHTML=`
    <div class="summary-row"><span>Subject</span><b>${esc(SUBJECTS[c.subject].short)} ${c.level}</b></div>
    <div class="summary-row"><span>Mode</span><b>${c.hardMode?'🔥 Hard':'Normal'}</b></div>
    <div class="summary-row"><span>Topics</span><b>${c.topics.length||0} selected</b></div>
    <div class="summary-row"><span>Lobby</span><b>${c.maxPlayers} players max</b></div>
    <div class="summary-row"><span>Questions</span><b>${c.count}</b></div>
    <div class="summary-row"><span>Time</span><b>${c.time?prettyTime(c.time):'∞'}</b></div>`;
  if($('#setup-bank-note')) $('#setup-bank-note').innerHTML=state.bankStatus.race==='ok'
    ? `<b>${bank.length}</b> matching race-bank questions available. ${bank.length<c.count?'<br><span style="color:#ffb2be">You need more matching questions or a smaller race.</span>':''}`
    : `Race bank is not ready. ${esc(state.bankErrors.race||'Check questionbank-config.js.')}`;
}

function renderJoin(){
  $('#screen-join').innerHTML=`
    <div class="backline"><button class="btn ghost" id="join-back">← Home</button></div>
    <div class="panel" style="max-width:620px;margin:30px auto">
      <div class="panel-head"><div><h2>Join a race</h2><p>Enter the six-character room code from the host.</p></div></div>
      <div class="field" style="margin-bottom:12px"><label>Your name</label><input id="join-name" class="input" maxlength="22" placeholder="e.g. Neil" value="${esc(state.playerName==='Player'?'':state.playerName)}"></div>
      <div class="field"><label>Room code</label><input id="join-code" class="input" maxlength="6" autocomplete="off" style="text-transform:uppercase;font-size:1.3rem;letter-spacing:.16em;font-weight:900" placeholder="ABC123"></div>
      <div id="join-error" class="error-text"></div>
      <button class="btn primary full" id="join-room" style="margin-top:16px">Join room →</button>
    </div>`;
  $('#join-back').addEventListener('click',leaveToHome);
  $('#join-name').addEventListener('input',e=>state.playerName=e.target.value.trim()||'Player');
  $('#join-code').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
  $('#join-code').addEventListener('keydown',e=>{ if(e.key==='Enter') joinRoom(); });
  $('#join-room').addEventListener('click',joinRoom);
  setTimeout(()=>$('#join-code')?.focus(),0);
}

function renderLobby(){
  const room=state.room||{}, cfg=room.config||state.config;
  const players=room.players||{}; const connected=connectedPlayers(room);
  $('#screen-lobby').innerHTML=`
    <div class="backline"><button class="btn ghost" id="lobby-leave">← Leave room</button></div>
    <div class="lobby-grid">
      <div class="panel">
        <div class="eyebrow">room code</div><div class="room-code">${esc(state.roomCode||'------')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px"><button class="btn secondary" id="copy-room">Copy code</button><span class="tag">${esc(SUBJECTS[cfg.subject]?.short||cfg.subject)} ${esc(cfg.level)}</span>${cfg.hardMode?'<span class="tag hard">🔥 HARD</span>':''}<span class="tag">${cfg.count} questions</span></div>
        <div class="label">Players · ${connected.length}/${cfg.maxPlayers||6}</div>
        <div class="player-grid">${Array.from({length:cfg.maxPlayers||6},(_,i)=>playerLobbyCard(players[`p${i+1}`],`p${i+1}`)).join('')}</div>
      </div>
      <aside class="summary-box">
        <h3>${state.isHost?'Start when ready':'Waiting for host'}</h3>
        <p class="muted" style="line-height:1.55;font-size:.84rem">${state.isHost?'You only need two connected players. More players can join until the race starts.':'The host controls the start. Keep this page open.'}</p>
        <div class="summary-list">
          <div class="summary-row"><span>Topics</span><b>${cfg.topics?.length?cfg.topics.length:'Mixed'}</b></div><div class="summary-row"><span>Subtopics</span><b>${cfg.subtopics?.length?cfg.subtopics.length:'Mixed'}</b></div>
          <div class="summary-row"><span>Timer</span><b>${cfg.time?prettyTime(cfg.time):'∞'}</b></div>
          <div class="summary-row"><span>Scoring</span><b>${cfg.hardMode?'+2 / −1':'1 per correct'}</b></div>
        </div>
        ${state.isHost?`<button class="btn primary full" id="start-race" style="margin-top:16px" ${connected.length<2?'disabled':''}>${connected.length<2?'Waiting for another player…':'Start race →'}</button>`:'<div class="bank-note" style="margin-top:16px">Connected as <b>'+esc(state.playerName)+'</b>.</div>'}
        <div id="lobby-error" class="error-text"></div>
      </aside>
    </div>`;
  $('#lobby-leave').addEventListener('click',leaveRoom);
  $('#copy-room').addEventListener('click',async()=>{ try{await navigator.clipboard.writeText(state.roomCode);toast('Room code copied');}catch{toast(`Room code: ${state.roomCode}`);} });
  $('#start-race')?.addEventListener('click',hostStartRace);
}
function playerLobbyCard(player,key){
  const connected=!!player?.connected;
  return `<div class="player-card ${connected?'':'empty'}"><div class="player-avatar">${connected?esc((player.name||'?').slice(0,1).toUpperCase()):'?'}</div><b>${connected?esc(player.name||'Player'):'Open slot'}</b><small>${connected?(key===state.playerKey?'You · Ready':'Ready'):'Waiting…'}</small></div>`;
}

function renderRace(){
  const q=state.race.questions[state.race.index]; if(!q){ finishLocalRace(); return; }
  const cfg=state.room?.config||state.config;
  const subject=SUBJECTS[cfg.subject];
  $('#screen-race').innerHTML=`
    <div class="race-layout">
      <main>
        <div class="race-top">
          <div class="race-meta"><span class="tag">${esc(subject?.short||cfg.subject)} ${esc(cfg.level)}</span><span class="tag">${esc(q.topic||'Mixed')}</span>${cfg.hardMode?'<span class="tag hard">🔥 HARD</span>':''}<span class="tag">Q${state.race.index+1}/${state.race.questions.length}</span></div>
          <div style="display:flex;align-items:center;gap:8px"><button class="btn secondary" id="race-calc">⌨ Calculator</button><span class="timer" id="race-timer">${cfg.time?'--:--':'∞'}</span></div>
        </div>
        <section class="question-card">
          <div class="question-kicker">Difficulty ${q.difficulty}/5 · ${q.type==='mcq'?'multiple choice':q.type||'question'}</div>
          <div class="question-prompt">${esc(q.prompt)}</div>
          ${q.expression?`<div class="question-expression">${esc(q.expression)}</div>`:''}
          <div id="race-answer-area"></div>
          <div class="question-tools">
            ${questionHint(q)?`<button class="btn secondary" id="race-hint" ${state.race.hintUsed?'disabled':''}>💡 ${state.race.hintUsed?'Hint used · max 0.6 pt':'Show hint / formula'}</button>`:''}
          </div>
          ${state.race.hintUsed?`<div class="hint-box"><b>Hint</b><br>${esc(questionHint(q))}<br><small>This question is now worth 0.6 points if correct.</small></div>`:''}
          <div id="race-feedback"></div>
        </section>
      </main>
      <aside class="leaderboard"><h3>Live standings</h3><div id="leaderboard-list"></div></aside>
    </div>`;
  renderAnswerArea(q,'race');
  renderLeaderboard();
  updateRaceTimer();
  $('#race-calc').addEventListener('click',openCalculator);
  $('#race-hint')?.addEventListener('click',()=>{ if(state.race.submitted)return; state.race.hintUsed=true; renderRace(); updateOwn({status:`Q${state.race.index+1} · used hint`}).catch(()=>{}); });
}

function renderAnswerArea(q,mode){
  const target=mode==='race'?$('#race-answer-area'):$('#practice-answer-area'); if(!target)return;
  const current=mode==='race'?state.race:state.practice.questions[state.practice.index];
  const submitted=mode==='race'?state.race.submitted:!!current.submitted;
  const selected=mode==='race'?state.race.selectedAnswer:current.selectedAnswer;
  if(Array.isArray(q.options)&&q.options.length){
    target.innerHTML=`<div class="answer-stack">${q.options.map((opt,i)=>{
      const letter=String.fromCharCode(65+i); let cls=selected===letter?'selected':'';
      if(submitted){ const correct=answerIsCorrect(q,letter); if(correct)cls+=' correct'; else if(selected===letter)cls+=' wrong'; }
      return `<button class="choice ${cls}" data-choice="${letter}" ${submitted?'disabled':''}><span class="choice-letter">${letter}</span><span>${esc(opt)}</span></button>`;
    }).join('')}</div>${!submitted?'<button class="btn primary" id="submit-choice" disabled>Submit answer</button>':''}`;
    $$('[data-choice]',target).forEach(b=>b.addEventListener('click',()=>{
      if(mode==='race'){ state.race.selectedAnswer=b.dataset.choice; renderAnswerArea(q,'race'); }
      else { current.selectedAnswer=b.dataset.choice; renderAnswerArea(q,'practice'); }
    }));
    const submit=$('#submit-choice',target); if(submit){ submit.disabled=!selected; submit.addEventListener('click',()=>mode==='race'?submitRaceAnswer(selected):submitPracticeAnswer(selected)); }
  } else {
    const existing=mode==='race'?(state.race.typedAnswer||''):(current.typedAnswer||'');
    target.innerHTML=`<div class="answer-row"><input class="input" id="typed-answer" autocomplete="off" ${submitted?'disabled':''} value="${esc(existing)}" placeholder="Type your answer…"><button class="btn primary" id="submit-typed" ${submitted?'disabled':''}>Submit</button></div>`;
    const input=$('#typed-answer',target); input?.addEventListener('input',e=>{ if(mode==='race') state.race.typedAnswer=e.target.value; else current.typedAnswer=e.target.value; });
    input?.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!submitted){ e.preventDefault(); mode==='race'?submitRaceAnswer(input.value):submitPracticeAnswer(input.value); } });
    $('#submit-typed',target)?.addEventListener('click',()=>mode==='race'?submitRaceAnswer(input?.value||''):submitPracticeAnswer(input?.value||''));
    if(mode==='race'&&!submitted) setTimeout(()=>input?.focus(),0);
  }
}

function submitRaceAnswer(raw){
  if(state.race.submitted)return;
  const q=state.race.questions[state.race.index]; if(!q)return;
  const ok=answerIsCorrect(q,raw); const cfg=state.room?.config||state.config;
  let delta=0;
  if(ok) delta=state.race.hintUsed?0.6:(cfg.hardMode?2:1);
  else delta=cfg.hardMode?-1:0;
  state.race.score=round(Math.max(0,state.race.score+delta),2);
  state.race.submitted=true;
  state.race.answered.push({id:q.id,topic:q.topic,ok,raw,answer:displayAnswer(q),delta,hintUsed:state.race.hintUsed});
  updateOwn({score:state.race.score,status:ok?`Q${state.race.index+1} correct +${delta}`:`Q${state.race.index+1} submitted`,question:state.race.index+1}).catch(()=>{});
  renderRace();
  const fb=$('#race-feedback'); if(fb) fb.innerHTML=`<div class="feedback ${ok?'good':'bad'}"><b>${ok?'Correct ✓':`Incorrect · ${delta<0?'−1 point':'0 points'}`}</b>${ok&&state.race.hintUsed?'<br>Hint used: +0.6 points.':''}${!ok?`<br>Correct answer: ${esc(displayAnswer(q))}`:''}</div>`;
  setTimeout(()=>{ state.race.index++; state.race.hintUsed=false; state.race.submitted=false; state.race.selectedAnswer=''; state.race.typedAnswer=''; if(state.race.index>=state.race.questions.length)finishLocalRace(); else { updateOwn({status:`On Q${state.race.index+1}`,question:state.race.index+1}).catch(()=>{}); renderRace(); } },900);
}

function renderLeaderboard(){
  const root=$('#leaderboard-list'); if(!root)return;
  const cfg=state.room?.config||state.config; const max=cfg.hardMode?cfg.count*2:cfg.count;
  const players=connectedPlayers(state.room).sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0)||String(a.name).localeCompare(String(b.name)));
  root.innerHTML=players.map((p,i)=>`<div class="leader-row"><span class="rank">#${i+1}</span><div class="leader-name"><b>${esc(p.name||'Player')}${p.key===state.playerKey?'<span class="you-pill">YOU</span>':''}</b><small>${esc(p.status||'Ready')}</small><div class="progress"><span style="width:${clamp(((Number(p.score)||0)/Math.max(1,max))*100,0,100)}%"></span></div></div><span class="leader-score">${formatScore(p.score||0)}</span></div>`).join('') || '<div class="muted">No players.</div>';
}
function formatScore(n){ n=Number(n)||0; return Number.isInteger(n)?String(n):String(round(n,1)); }

function finishLocalRace(){
  clearInterval(state.race.timer); state.race.timer=null;
  updateOwn({finished:true,status:'Finished',score:state.race.score,question:state.race.questions.length}).catch(()=>{});
  renderResults(); setScreen('results');
}
function renderResults(){
  const players=connectedPlayers(state.room).sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));
  const me=players.find(p=>p.key===state.playerKey); const rank=Math.max(1,players.findIndex(p=>p.key===state.playerKey)+1);
  const allFinished=players.length>0&&players.every(p=>p.finished);
  $('#screen-results').innerHTML=`
    <div class="panel">
      <div class="result-hero"><div class="result-icon">${rank===1?'🏆':'⚡'}</div><div class="eyebrow">race complete</div><h2>${rank===1?'You are currently #1':`You finished #${rank}`}</h2><p class="muted">Your score: <b style="color:var(--text)">${formatScore(me?.score??state.race.score)}</b></p></div>
      <div class="podium">${players.slice(0,3).map((p,i)=>`<div class="podium-card"><div style="font-size:1.5rem">${['🥇','🥈','🥉'][i]}</div><b>${esc(p.name)}</b><div style="font-size:1.5rem;font-weight:950;margin-top:8px">${formatScore(p.score)}</div><small class="muted">${esc(p.status||'')}</small></div>`).join('')}</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn secondary" id="results-home">Leave room</button>${state.isHost?`<button class="btn primary" id="rematch" ${allFinished?'':'disabled'}>${allFinished?'Rematch →':'Waiting for everyone…'}</button>`:''}</div>
      <div class="review-list">${state.race.answered.map((a,i)=>`<div class="review-item"><span class="review-mark ${a.ok?'ok':'no'}">${a.ok?'✓':'×'}</span><span><b>Q${i+1} · ${esc(a.topic||'')}</b><br><small class="muted">Your answer: ${esc(a.raw||'—')}${a.hintUsed?' · hint used':''}</small></span><span style="font-weight:900">${a.delta>0?'+':''}${formatScore(a.delta)}</span></div>`).join('')}</div>
    </div>`;
  $('#results-home').addEventListener('click',leaveRoom);
  $('#rematch')?.addEventListener('click',hostRematch);
}

function renderPractice(){
  const c=state.practiceConfig;
  $('#screen-practice').innerHTML=`
    <div class="backline"><button class="btn ghost" id="practice-back">← Home</button></div>
    <div class="practice-layout">
      <aside class="sidebar">
        <div class="label">Subject</div><select id="practice-subject" class="select">${Object.entries(SUBJECTS).map(([k,s])=>`<option value="${k}" ${c.subject===k?'selected':''}>${esc(s.short)}</option>`).join('')}</select>
        <div class="setup-section" style="margin-top:14px"><div class="label">Level</div><div class="segmented" id="practice-level"><button class="seg-btn ${c.level==='SL'?'selected':''}" data-level="SL">SL</button><button class="seg-btn ${c.level==='HL'?'selected':''}" data-level="HL">HL</button></div></div>
        <div class="setup-section"><div class="label">Difficulty</div><select id="practice-difficulty" class="select"><option value="mixed">Mixed 1–5</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${String(c.difficulty)===String(n)?'selected':''}>${n} · ${['Foundation','Standard','Challenging','Hard','Brutal'][n-1]}</option>`).join('')}</select></div>
        <div class="setup-section"><div class="label">Topic</div><select id="practice-topic" class="select"><option>All topics</option>${SUBJECTS[c.subject].topics.map(t=>`<option ${c.topic===t?'selected':''}>${esc(t)}</option>`).join('')}</select></div>
        <div class="setup-section"><div class="label">Questions</div><select id="practice-count" class="select">${[1,3,5,10,15,20,30].map(n=>`<option value="${n}" ${c.count===n?'selected':''}>${n}</option>`).join('')}</select></div>
        <div id="practice-pool" class="bank-note"></div>
        <button class="btn primary full" id="practice-start" style="margin-top:14px">Start practice →</button>
      </aside>
      <main class="practice-workspace" id="practice-workspace"></main>
    </div>`;
  $('#practice-back').addEventListener('click',()=>{ stopPracticeTimer(); renderHome(); setScreen('home'); });
  $('#practice-subject').addEventListener('change',e=>{ c.subject=e.target.value; c.topic='All topics'; renderPractice(); });
  $$('#practice-level [data-level]').forEach(b=>b.addEventListener('click',()=>{ c.level=b.dataset.level; renderPractice(); }));
  $('#practice-difficulty').addEventListener('change',e=>{ c.difficulty=e.target.value; renderPracticePoolInfo(); });
  $('#practice-topic').addEventListener('change',e=>{ c.topic=e.target.value; renderPracticePoolInfo(); });
  $('#practice-count').addEventListener('change',e=>{ c.count=Number(e.target.value); renderPracticePoolInfo(); });
  $('#practice-start').addEventListener('click',startPractice);
  renderPracticePoolInfo();
  if(state.practice.active) renderPracticeQuestion(); else renderPracticeEmpty();
}
function renderPracticePoolInfo(){
  const pool=matchingPracticePool(state.practiceConfig); const el=$('#practice-pool'); if(!el)return;
  el.innerHTML=state.bankStatus.practice==='ok'?`<b>${pool.length}</b> matching questions in the separate practice bank.${pool.length<state.practiceConfig.count?'<br><span style="color:#ffb2be">Choose fewer questions or add more to the bank.</span>':''}`:`Practice bank unavailable.<br>${esc(state.bankErrors.practice||'Check questionbank-config.js.')}`;
}
function renderPracticeEmpty(){
  $('#practice-workspace').innerHTML=`<div class="question-card empty-state"><div><div class="big">◎</div><h3>Build a focused set</h3><p>This practice area reads from a completely different question-bank URL than multiplayer races.</p><button class="btn primary" id="practice-quick">Start with these filters</button></div></div>`;
  $('#practice-quick').addEventListener('click',startPractice);
}
function startPractice(){
  const pool=matchingPracticePool(state.practiceConfig); const count=state.practiceConfig.count;
  if(pool.length<count){ toast(`Only ${pool.length} matching practice questions. Need ${count}.`); return; }
  state.practice.active=true; state.practice.questions=shuffle(pool).slice(0,count).map(q=>({...q,submitted:false,selectedAnswer:'',typedAnswer:'',flagged:false,hintShown:false,userAnswer:''})); state.practice.index=0; state.practice.startedAt=Date.now();
  clearInterval(state.practice.timer); state.practice.timer=setInterval(updatePracticeLiveStats,1000); renderPracticeQuestion();
}
function renderPracticeQuestion(){
  const q=state.practice.questions[state.practice.index]; if(!q){renderPracticeSummary();return;}
  const attempted=state.practice.questions.filter(x=>x.submitted).length, correct=state.practice.questions.filter(x=>x.submitted&&x._correct).length;
  const elapsed=Math.floor((Date.now()-state.practice.startedAt)/1000);
  $('#practice-workspace').innerHTML=`
    <div class="session-header"><div class="race-meta"><span class="tag">${esc(SUBJECTS[q.subject]?.short||q.subject)} ${esc(state.practiceConfig.level)}</span><span class="tag">${esc(q.topic||'Mixed')}</span><span class="tag">Difficulty ${q.difficulty}/5</span></div><div class="session-stats"><span class="stat-pill"><b id="practice-correct">${correct}</b> correct</span><span class="stat-pill"><b id="practice-attempted">${attempted}</b> attempted</span><span class="stat-pill" id="practice-clock">${prettyTime(elapsed)}</span></div></div>
    <section class="question-card">
      <div class="question-kicker">Question ${state.practice.index+1} of ${state.practice.questions.length}</div>
      <div class="question-prompt">${esc(q.prompt)}</div>${q.expression?`<div class="question-expression">${esc(q.expression)}</div>`:''}
      <div id="practice-answer-area"></div>
      <div class="question-tools">${questionHint(q)?`<button class="btn secondary" id="practice-hint">💡 ${q.hintShown?'Hint shown':'Show hint / formula'}</button>`:''}<button class="btn secondary" id="practice-flag">${q.flagged?'⚑ Flagged':'⚐ Flag'}</button><button class="btn secondary" id="practice-calc">⌨ Calculator</button></div>
      ${q.hintShown?`<div class="hint-box"><b>Hint</b><br>${esc(questionHint(q))}</div>`:''}
      ${q.submitted?`<div class="feedback ${q._correct?'good':'bad'}"><b>${q._correct?'Correct ✓':'Incorrect'}</b>${!q._correct?`<br>Correct answer: ${esc(displayAnswer(q))}`:''}${q.explanation?`<br><br>${esc(q.explanation)}`:''}</div>`:''}
      <div class="nav-dots" id="practice-nav">${state.practice.questions.map((x,i)=>`<button class="qdot ${i===state.practice.index?'current':''} ${x.submitted?(x._correct?'correct':'wrong'):''} ${x.flagged?'flagged':''}" data-index="${i}">${i+1}</button>`).join('')}</div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:18px;flex-wrap:wrap"><button class="btn secondary" id="practice-prev" ${state.practice.index===0?'disabled':''}>← Previous</button><div style="display:flex;gap:8px"><button class="btn danger" id="practice-finish">Finish set</button><button class="btn primary" id="practice-next">${state.practice.index===state.practice.questions.length-1?'Finish':'Next →'}</button></div></div>
    </section>`;
  renderAnswerArea(q,'practice');
  $('#practice-hint')?.addEventListener('click',()=>{q.hintShown=true;renderPracticeQuestion();});
  $('#practice-flag').addEventListener('click',()=>{q.flagged=!q.flagged;renderPracticeQuestion();});
  $('#practice-calc').addEventListener('click',openCalculator);
  $('#practice-prev').addEventListener('click',()=>{state.practice.index--;renderPracticeQuestion();});
  $('#practice-next').addEventListener('click',()=>{ if(state.practice.index>=state.practice.questions.length-1) renderPracticeSummary(); else {state.practice.index++;renderPracticeQuestion();} });
  $('#practice-finish').addEventListener('click',renderPracticeSummary);
  $$('#practice-nav [data-index]').forEach(b=>b.addEventListener('click',()=>{state.practice.index=Number(b.dataset.index);renderPracticeQuestion();}));
}
function submitPracticeAnswer(raw){
  const q=state.practice.questions[state.practice.index]; if(!q||q.submitted)return;
  q.userAnswer=raw; q.submitted=true; q._correct=answerIsCorrect(q,raw); renderPracticeQuestion();
}
function updatePracticeLiveStats(){
  if(state.screen!=='practice'||!state.practice.active)return;
  const clock=$('#practice-clock'); if(clock) clock.textContent=prettyTime(Math.floor((Date.now()-state.practice.startedAt)/1000));
}
function renderPracticeSummary(){
  stopPracticeTimer(); const qs=state.practice.questions; const attempted=qs.filter(q=>q.submitted).length,correct=qs.filter(q=>q.submitted&&q._correct).length;
  const pct=attempted?Math.round(correct/attempted*100):0;
  $('#practice-workspace').innerHTML=`<div class="panel result-hero"><div class="result-icon">◎</div><div class="eyebrow">practice complete</div><h2>${pct}% accuracy</h2><p class="muted">${correct} correct · ${attempted} attempted · ${qs.length-attempted} skipped</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn secondary" id="practice-new">New set</button><button class="btn primary" id="practice-review">Review questions</button></div></div><div class="review-list">${qs.map((q,i)=>`<div class="review-item"><span class="review-mark ${q.submitted?(q._correct?'ok':'no'):''}">${q.submitted?(q._correct?'✓':'×'):'—'}</span><span><b>Q${i+1} · ${esc(q.topic)}</b><br><small class="muted">${esc(q.prompt.slice(0,90))}${q.prompt.length>90?'…':''}</small></span><span>${q.flagged?'⚑':''}</span></div>`).join('')}</div>`;
  $('#practice-new').addEventListener('click',()=>{state.practice.active=false;renderPractice();});
  $('#practice-review').addEventListener('click',()=>{state.practice.index=0;renderPracticeQuestion();});
}
function stopPracticeTimer(){ clearInterval(state.practice.timer); state.practice.timer=null; }

/* ------------------------- QUESTION BANK ------------------------- */
async function loadQuestionBanks(){
  await Promise.all(['race','practice'].map(async kind=>{
    const source=window.IBRACE_QUESTION_BANKS?.[kind] || DEFAULT_QUESTION_BANKS[kind];
    if(!source){ state.bankStatus[kind]='error'; state.bankErrors[kind]=`No ${kind} URL configured.`; return; }
    try{
      const primary=typeof source==='string'?source:source.url;
      const fallback=typeof source==='object'?source.fallback:null;
      let res; let primaryError=null;
      try{
        res=await fetch(primary,{cache:'no-store'});
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
      }catch(err){
        primaryError=err;
        if(!fallback) throw err;
        res=await fetch(fallback,{cache:'no-store'});
        if(!res.ok) throw new Error(`Remote bank failed (${String(primaryError?.message||primaryError)}); fallback HTTP ${res.status}`);
      }
      const data=await res.json(); const raw=Array.isArray(data)?data:data?.questions;
      if(!Array.isArray(raw)) throw new Error('Expected an array or {questions:[…]}.');
      const normalized=[]; const ids=new Set();
      raw.forEach((q,i)=>{
        const nq=normalizeQuestionV52(q,kind,i);
        if(ids.has(nq.id)) throw new Error(`Duplicate question id: ${nq.id}`);
        ids.add(nq.id); normalized.push(nq);
      });
      state.banks[kind]=normalized; state.bankStatus[kind]='ok'; state.bankErrors[kind]='';
    }catch(err){ state.bankStatus[kind]='error'; state.bankErrors[kind]=String(err?.message||err); }
  }));
  updateBankIndicator();
  if(state.screen==='setup') updateSetupSummary();
  if(state.screen==='practice') renderPracticePoolInfo();
}
function normalizeQuestion(q,kind,index){
  if(!q||typeof q!=='object') throw new Error(`${kind} question ${index+1} is not an object.`);
  const id=String(q.id||`${kind}-${index+1}`); const subject=String(q.subject||'');
  if(!SUBJECTS[subject]) throw new Error(`${id}: unknown subject "${subject}".`);
  const levels=levelsFor(q); if(!levels.some(l=>['SL','HL','Both'].includes(l))) throw new Error(`${id}: level must be SL, HL, Both, or an array.`);
  const topics=topicsFor(q); if(!topics.length) throw new Error(`${id}: missing topic.`);
  const difficulty=clamp(Number(q.difficulty)||3,1,5); if(!String(q.prompt||'').trim()) throw new Error(`${id}: missing prompt.`);
  if(q.answer===undefined||q.answer===null) throw new Error(`${id}: missing answer.`);
  const options=Array.isArray(q.options)?q.options.map(String):null;
  const type=q.type||(options?'mcq':typeof q.answer==='number'?'numeric':'text');
  return {...q,id,subject,level:levels,topics,topic:String(q.topic||topics[0]),difficulty,prompt:String(q.prompt),expression:String(q.expression||''),type,options,
    aliases:Array.isArray(q.aliases)?q.aliases:[],tolerance:Number(q.tolerance)||0,explanation:String(q.explanation||''),bank:kind};
}
function questionMatchesLevel(q,level){ const ls=levelsFor(q); return ls.includes('Both')||ls.includes(level); }
function questionMatchesTopics(q,selected){ return topicsFor(q).some(t=>selected.includes(t)); }
function matchingRacePool(c=state.config){
  return state.banks.race.filter(q=>q.subject===c.subject&&questionMatchesLevel(q,c.level)&&questionMatchesTopics(q,c.topics)&&Number(q.difficulty)>=(c.hardMode?4:1)&&Number(q.difficulty)<=(c.hardMode?5:3));
}
function matchingPracticePool(c=state.practiceConfig){
  return state.banks.practice.filter(q=>q.subject===c.subject&&questionMatchesLevel(q,c.level)&&(c.topic==='All topics'||topicsFor(q).includes(c.topic))&&(c.difficulty==='mixed'||Number(q.difficulty)===Number(c.difficulty)));
}
function chooseRaceQuestions(count,excludeIds=[]){
  const pool=matchingRacePool(state.config); if(pool.length<count) throw new Error(`Only ${pool.length} matching race questions are available; ${count} requested.`);
  const excluded=new Set(excludeIds||[]); const fresh=shuffle(pool.filter(q=>!excluded.has(q.id))), old=shuffle(pool.filter(q=>excluded.has(q.id)));
  return [...fresh,...old].slice(0,count).map(q=>stripLocalFields(q));
}
function stripLocalFields(q){ const out={...q}; delete out.bank; return out; }
function updateBankIndicator(){
  const dot=$('#bank-dot'),label=$('#bank-status'); if(!dot||!label)return;
  const statuses=Object.values(state.bankStatus);
  dot.className='status-dot '+(statuses.every(x=>x==='ok')?'ok':statuses.some(x=>x==='error')?'bad':'');
  label.textContent=statuses.every(x=>x==='ok')?`${state.banks.race.length} race · ${state.banks.practice.length} practice questions`:statuses.some(x=>x==='error')?'Question bank connection issue':'Loading question banks…';
}

/* ------------------------- FIREBASE ------------------------- */
function firebaseReady(){ const c=window.IBRACE_FIREBASE_CONFIG; return !!(window.firebase&&c&&c.apiKey&&c.databaseURL&&!String(c.apiKey).includes('PASTE_')); }
function db(){ if(state.firebaseDb)return state.firebaseDb; if(!firebaseReady()) throw new Error('Firebase is not configured. Add firebase-config.js with your web config.'); if(!firebase.apps.length) firebase.initializeApp(window.IBRACE_FIREBASE_CONFIG); state.firebaseDb=firebase.database(); return state.firebaseDb; }
async function roomExists(code){ const snap=await db().ref(`rooms/${code}`).once('value'); return snap.exists(); }
async function uniqueRoomCode(){ for(let i=0;i<15;i++){const code=safeCode();if(!(await roomExists(code)))return code;} throw new Error('Could not create a unique room code. Try again.'); }
function firebaseMessage(err){ const m=String(err?.message||err); if(/permission/i.test(m))return 'Firebase denied the request. Update Realtime Database rules for rooms.'; return m; }
function detachRoom(){ if(state.roomRef&&state.roomListener) state.roomRef.off('value',state.roomListener); state.roomRef=null; state.roomListener=null; }
function attachRoom(code){ detachRoom(); state.roomRef=db().ref(`rooms/${code}`); state.roomListener=s=>syncRoom(s.val()); state.roomRef.on('value',state.roomListener,err=>toast(firebaseMessage(err))); }
async function updateOwn(patch){ if(!state.roomRef||!state.playerKey)return; await state.roomRef.child(`players/${state.playerKey}`).update(patch); }
function connectedPlayers(room=state.room){ return Object.entries(room?.players||{}).filter(([,p])=>p?.connected).map(([key,p])=>({...p,key})); }

async function createRoom(){
  const err=$('#setup-error'); if(err)err.textContent='';
  try{
    if(state.bankStatus.race!=='ok') throw new Error(`Race question bank is unavailable: ${state.bankErrors.race||'not loaded'}`);
    state.playerName=$('#host-name')?.value.trim()||state.playerName||'Host';
    state.config.maxPlayers=Number($('#max-players')?.value)||6; state.config.count=Number($('#race-count')?.value)||10; state.config.time=Number($('#race-time')?.value)||0;
    const questions=chooseRaceQuestions(state.config.count,[]); const code=await uniqueRoomCode(); const ref=db().ref(`rooms/${code}`);
    const now=firebase.database.ServerValue.TIMESTAMP;
    await ref.set({status:'lobby',round:1,createdAt:now,config:{...state.config},questions,recentQuestionIds:questions.map(q=>q.id),players:{p1:{name:state.playerName,connected:true,score:0,status:'Ready',finished:false,question:0,sessionId:state.sessionId,joinedAt:now}}});
    state.roomCode=code; state.playerKey='p1'; state.isHost=true; await ref.child('players/p1').onDisconnect().update({connected:false,status:'Disconnected'}); setScreen('lobby'); attachRoom(code);
  }catch(e){ if(err)err.textContent=firebaseMessage(e); }
}

async function joinRoom(){
  const error=$('#join-error'); if(error)error.textContent='';
  try{
    state.playerName=$('#join-name')?.value.trim()||state.playerName||'Player'; const code=String($('#join-code')?.value||'').trim().toUpperCase();
    if(!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Enter the full six-character room code.');
    const ref=db().ref(`rooms/${code}`); const pre=await ref.once('value'); if(!pre.exists()) throw new Error('Room not found.');
    let reason='Room is full.';
    const tx=await ref.transaction(room=>{
      if(!room){reason='Room not found.';return;}
      if(room.status!=='lobby'){reason='That race has already started.';return;}
      const max=Number(room.config?.maxPlayers)||6; room.players=room.players||{};
      let slot=null; for(let i=2;i<=max;i++){const k=`p${i}`;if(!room.players[k]?.connected){slot=k;break;}}
      if(!slot){reason='This room is full.';return;}
      room.players[slot]={name:state.playerName,connected:true,score:0,status:'Ready',finished:false,question:0,sessionId:state.sessionId,joinedAt:Date.now()};
      return room;
    },undefined,false);
    if(!tx.committed) throw new Error(reason);
    const joined=tx.snapshot.val(); const entry=Object.entries(joined.players||{}).find(([,p])=>p?.sessionId===state.sessionId);
    if(!entry) throw new Error('Joined room, but could not identify your player slot. Refresh and try again.');
    state.roomCode=code; state.playerKey=entry[0]; state.isHost=false; await ref.child(`players/${state.playerKey}`).onDisconnect().update({connected:false,status:'Disconnected'}); setScreen('lobby'); attachRoom(code);
  }catch(e){ if(error)error.textContent=firebaseMessage(e); }
}

function syncRoom(room){
  if(!room){ toast('Room closed.'); leaveToHome(); return; }
  state.room=room;
  if(room.config) state.config={...state.config,...room.config};
  if(state.screen==='lobby') renderLobby();
  if(state.screen==='race') renderLeaderboard();
  if(state.screen==='results') renderResults();
  const round=Number(room.round)||1;
  if(room.status==='started'&&state.activeRound!==round){ state.activeRound=round; startLocalRace(room); }
  if(room.status==='lobby'&&state.activeRound!==null&&state.activeRound!==round){ state.activeRound=null; resetLocalRace(); renderLobby(); setScreen('lobby'); }
}
async function hostStartRace(){
  try{ const room=state.room; if(!state.isHost) return; if(connectedPlayers(room).length<2)throw new Error('At least two players are required.'); await state.roomRef.update({status:'started',startedAt:firebase.database.ServerValue.TIMESTAMP}); }catch(e){ const el=$('#lobby-error');if(el)el.textContent=firebaseMessage(e); }
}
function resetLocalRace(){ clearInterval(state.race.timer); state.race={questions:[],index:0,score:0,answered:[],hintUsed:false,submitted:false,timer:null,startedAt:0,selectedAnswer:'',typedAnswer:''}; }
function startLocalRace(room){
  resetLocalRace(); state.race.questions=Array.isArray(room.questions)?room.questions:[]; state.race.startedAt=Number(room.startedAt)||Date.now(); updateOwn({score:0,status:'On Q1',finished:false,question:1}).catch(()=>{}); setScreen('race'); renderRace();
  if(room.config?.time){ state.race.timer=setInterval(()=>{ updateRaceTimer(); if(raceTimeLeft()<=0)finishLocalRace(); },500); }
}
function raceTimeLeft(){ const seconds=Number(state.room?.config?.time)||0; if(!seconds)return Infinity; return Math.max(0,seconds-Math.floor((Date.now()-state.race.startedAt)/1000)); }
function updateRaceTimer(){ const el=$('#race-timer'); if(el)el.textContent=Number.isFinite(raceTimeLeft())?prettyTime(raceTimeLeft()):'∞'; }
async function hostRematch(){
  if(!state.isHost||!state.roomRef)return;
  try{
    const room=state.room||{}; const recent=Array.isArray(room.recentQuestionIds)?room.recentQuestionIds:[]; const questions=chooseRaceQuestions(state.config.count,recent);
    const players={}; Object.entries(room.players||{}).forEach(([k,p])=>{players[k]={...p,score:0,status:p.connected?'Ready':'Disconnected',finished:false,question:0};});
    await state.roomRef.update({status:'lobby',round:(Number(room.round)||1)+1,questions,recentQuestionIds:questions.map(q=>q.id),players});
  }catch(e){toast(firebaseMessage(e));}
}
async function leaveRoom(){ try{await updateOwn({connected:false,status:'Left room'});}catch{} detachRoom(); clearInterval(state.race.timer); state.room=null;state.roomCode=null;state.playerKey=null;state.isHost=false;state.activeRound=null;resetLocalRace();renderHome();setScreen('home'); }
function leaveToHome(){ if(state.roomRef){leaveRoom();return;} stopPracticeTimer();state.practice.active=false;renderHome();setScreen('home'); }

/* ------------------------- ANSWERS ------------------------- */
function questionHint(q){ if(typeof q.hint==='string')return q.hint; if(q.hint&&typeof q.hint==='object')return q.hint.formula||q.hint.content||q.hint.text||''; return q.formula||''; }
function displayAnswer(q){ if(q.answerDisplay!==undefined)return String(q.answerDisplay); if(Array.isArray(q.options)&&typeof q.answer==='string'&&/^[A-D]$/i.test(q.answer)){ const i=q.answer.toUpperCase().charCodeAt(0)-65; return `${q.answer.toUpperCase()} — ${q.options[i]??''}`; } return String(q.answer); }
function answerIsCorrect(q,raw){
  if(raw===undefined||raw===null||String(raw).trim()==='')return false;
  if(typeof q.answer==='number'||q.type==='numeric'){
    let val; try{val=calcEvaluate(String(raw),state.calc.angle);}catch{return false;}
    const ans=Number(q.answer); if(!Number.isFinite(val)||!Number.isFinite(ans))return false; const tol=Math.max(Number(q.tolerance)||0,Math.abs(ans)*1e-6); return Math.abs(val-ans)<=tol;
  }
  const value=normalizeText(raw); const accepted=[q.answer,...(q.aliases||[])].map(normalizeText);
  if(Array.isArray(q.options)&&/^[a-z]$/.test(value)) return accepted.includes(value.toUpperCase().toLowerCase());
  if(Array.isArray(q.options)){
    const answerLetter=String(q.answer).trim().toUpperCase(); const idx=answerLetter.charCodeAt(0)-65; if(idx>=0&&idx<q.options.length) accepted.push(normalizeText(q.options[idx]));
  }
  return accepted.includes(value);
}

/* ------------------------- CALCULATOR ------------------------- */
function calculatorMarkup(){return `<div class="calc-overlay" id="calc-overlay"><div class="calc" role="dialog" aria-modal="true" aria-label="Scientific calculator"><div class="calc-head"><div><b>Calculator</b><div class="calc-mode">Type expressions directly: 12*4, 3(2+5), sqrt(81)</div></div><div><button class="btn secondary" id="calc-angle">DEG</button> <button class="btn ghost" id="calc-close">✕</button></div></div><input id="calc-input" class="calc-input" autocomplete="off" spellcheck="false" placeholder="Type an expression…"><div class="calc-result" id="calc-result">0</div><div class="calc-grid" id="calc-keys">
<button class="calc-key op" data-k="sin(">sin</button><button class="calc-key op" data-k="cos(">cos</button><button class="calc-key op" data-k="tan(">tan</button><button class="calc-key op" data-k="sqrt(">√</button><button class="calc-key ac" data-action="clear">AC</button>
<button class="calc-key op" data-k="ln(">ln</button><button class="calc-key op" data-k="log(">log</button><button class="calc-key op" data-k="^">xʸ</button><button class="calc-key op" data-k="(">(</button><button class="calc-key op" data-k=")">)</button>
<button class="calc-key" data-k="7">7</button><button class="calc-key" data-k="8">8</button><button class="calc-key" data-k="9">9</button><button class="calc-key op" data-k="/">÷</button><button class="calc-key op" data-action="back">⌫</button>
<button class="calc-key" data-k="4">4</button><button class="calc-key" data-k="5">5</button><button class="calc-key" data-k="6">6</button><button class="calc-key op" data-k="*">×</button><button class="calc-key op" data-k="pi">π</button>
<button class="calc-key" data-k="1">1</button><button class="calc-key" data-k="2">2</button><button class="calc-key" data-k="3">3</button><button class="calc-key op" data-k="-">−</button><button class="calc-key op" data-k="e">e</button>
<button class="calc-key" data-k="0">0</button><button class="calc-key" data-k=".">.</button><button class="calc-key op" data-k="+">+</button><button class="calc-key op" data-k="%">%</button><button class="calc-key eq" data-action="equals">=</button>
</div></div></div>`;}
function openCalculator(){ $('#calc-overlay').classList.add('open'); setTimeout(()=>$('#calc-input')?.focus(),0); }
function closeCalculator(){ $('#calc-overlay').classList.remove('open'); }
function bindCalculator(){
  $('#calc-close').addEventListener('click',closeCalculator); $('#calc-overlay').addEventListener('click',e=>{if(e.target.id==='calc-overlay')closeCalculator();});
  $('#calc-angle').addEventListener('click',()=>{state.calc.angle=state.calc.angle==='DEG'?'RAD':'DEG';$('#calc-angle').textContent=state.calc.angle;calculateFromInput(false);});
  const input=$('#calc-input'); input.addEventListener('input',()=>calculateFromInput(false)); input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();calculateFromInput(true);}if(e.key==='Escape')closeCalculator();});
  $$('#calc-keys [data-k]').forEach(b=>b.addEventListener('click',()=>{const start=input.selectionStart??input.value.length,end=input.selectionEnd??start; input.value=input.value.slice(0,start)+b.dataset.k+input.value.slice(end); const pos=start+b.dataset.k.length; input.setSelectionRange(pos,pos);input.focus();calculateFromInput(false);}));
  $$('#calc-keys [data-action]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.action==='clear'){input.value='';state.calc.result='0';$('#calc-result').textContent='0';input.focus();}else if(b.dataset.action==='back'){const p=input.selectionStart??input.value.length;if(p>0){input.value=input.value.slice(0,p-1)+input.value.slice(input.selectionEnd??p);input.setSelectionRange(p-1,p-1);}calculateFromInput(false);input.focus();}else calculateFromInput(true);}));
}
function calculateFromInput(commit){ const input=$('#calc-input'),out=$('#calc-result'); const expr=input.value.trim(); if(!expr){out.textContent='0';return;}try{const v=calcEvaluate(expr,state.calc.angle);state.calc.result=Number.isInteger(v)?String(v):String(round(v,10));out.textContent=state.calc.result;if(commit)input.value=state.calc.result;}catch(e){out.textContent='…';} }
function calcEvaluate(expression,angleMode='DEG'){
  let s=String(expression).trim().replace(/[×·]/g,'*').replace(/÷/g,'/').replace(/[−–—]/g,'-').replace(/π/g,'pi').replace(/√/g,'sqrt').replace(/\s+/g,'');
  if(!s)throw new Error('Empty expression');
  let i=0;
  const peek=()=>s[i]; const eat=c=>{if(s[i]===c){i++;return true;}return false;};
  const isStart=ch=>ch!==undefined&&(ch==='('||ch==='.'||/[0-9A-Za-z_]/.test(ch));
  function number(){const m=s.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);if(!m)return null;i+=m[0].length;return Number(m[0]);}
  function ident(){const m=s.slice(i).match(/^[A-Za-z_]+/);if(!m)return null;i+=m[0].length;return m[0].toLowerCase();}
  function primary(){
    if(eat('(')){const v=expr();if(!eat(')'))throw new Error('Missing )');return v;}
    const n=number();if(n!==null)return n;
    const id=ident();if(id){if(id==='pi')return Math.PI;if(id==='e')return Math.E; if(!eat('('))throw new Error(`Expected ( after ${id}`);const v=expr();if(!eat(')'))throw new Error('Missing )');const rad=angleMode==='DEG'?v*Math.PI/180:v; const fn={sin:()=>Math.sin(rad),cos:()=>Math.cos(rad),tan:()=>Math.tan(rad),sqrt:()=>Math.sqrt(v),ln:()=>Math.log(v),log:()=>Math.log10(v),abs:()=>Math.abs(v)}[id];if(!fn)throw new Error('Unknown function');const out=fn();if(!Number.isFinite(out))throw new Error('Math error');return out;}
    throw new Error(`Unexpected token at ${i+1}`);
  }
  function unary(){if(eat('+'))return unary();if(eat('-'))return -unary();return primary();}
  function power(){let left=unary();if(eat('^'))left=Math.pow(left,power());return left;}
  function term(){let left=power();while(true){if(eat('*'))left*=power();else if(eat('/')){const d=power();if(d===0)throw new Error('Division by zero');left/=d;}else if(eat('%'))left/=100;else if(isStart(peek()))left*=power();else break;}return left;}
  function expr(){let left=term();while(true){if(eat('+'))left+=term();else if(eat('-'))left-=term();else break;}return left;}
  const value=expr();if(i!==s.length)throw new Error('Invalid expression');if(!Number.isFinite(value))throw new Error('Math error');return value;
}


/* ==============================================================
   v5.2 PATCH — syllabus filters, maths rendering & peer grading
   ============================================================== */

function gradingModeFor(q){ return String(q?.gradingMode||'auto').toLowerCase()==='peer'?'peer':'auto'; }
function markschemeFor(q){ return Array.isArray(q?.markscheme)?q.markscheme:[]; }
function maxMarksFor(q){
  const listed=markschemeFor(q).reduce((sum,m)=>sum+Math.max(0,Number(m?.marks)||1),0);
  return Math.max(1,Number(q?.marks)||listed||1);
}
function safeFirebaseKey(value){ return String(value||'q').replace(/[.#$\[\]\/]/g,'_'); }

function katexHtml(tex,displayMode=false){
  const source=String(tex??'').trim(); if(!source)return '';
  if(window.katex?.renderToString){
    try{return window.katex.renderToString(source,{throwOnError:false,displayMode,strict:'ignore',trust:false});}catch{}
  }
  return `<code>${esc(source)}</code>`;
}
function unicodeDigitsToAscii(s){
  const map={'₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9','⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9'};
  return [...String(s||'')].map(ch=>map[ch]??ch).join('');
}
function autoMathifyLegacy(text){
  let s=String(text??'');
  // Fix the most visibly broken legacy notation while new/imported questions use real LaTeX delimiters.
  s=s.replace(/∫([₀₁₂₃₄₅₆₇₈₉]+)?\^?([−-]?\d+(?:\.\d+)?)?\s+([^.,;!?]+?)\s+d([a-zA-Z])/g,(m,lo,hi,body,v)=>{
    const low=lo?unicodeDigitsToAscii(lo):''; const high=hi?unicodeDigitsToAscii(hi):'';
    let b=unicodeDigitsToAscii(body).replace(/([A-Za-z0-9)])2\b/g,'$1^2').replace(/([A-Za-z0-9)])3\b/g,'$1^3');
    return `$\\int${low?`_{${low}}`:''}${high?`^{${high}}`:''} ${b}\\,d${v}$`;
  });
  return s;
}
function renderRichText(value){
  const source=autoMathifyLegacy(value); const re=/(\\\[(.+?)\\\]|\\\((.+?)\\\)|\$\$(.+?)\$\$|\$([^$\n]+?)\$)/gs;
  let out='',last=0,m;
  while((m=re.exec(source))){
    out+=esc(source.slice(last,m.index));
    const tex=m[2]??m[3]??m[4]??m[5]??''; const display=!!(m[2]||m[4]);
    out+=`<span class="math-render ${display?'display':''}">${katexHtml(tex,display)}</span>`; last=re.lastIndex;
  }
  out+=esc(source.slice(last)); return out.replace(/\n/g,'<br>');
}
function renderQuestionPrompt(q){ return renderRichText(q.promptLatex||q.prompt); }
function renderQuestionExpression(q){
  const tex=q.expressionLatex||q.math||q.latex;
  if(tex)return `<div class="question-expression math-expression">${katexHtml(tex,true)}</div>`;
  return q.expression?`<div class="question-expression">${renderRichText(q.expression)}</div>`:'';
}
function renderHintContent(q){ return renderRichText(questionHint(q)); }

function normalizeQuestionV52(q,kind,index){
  if(!q||typeof q!=='object') throw new Error(`${kind} question ${index+1} is not an object.`);
  const id=String(q.id||`${kind}-${index+1}`), subject=String(q.subject||'');
  if(!SUBJECTS[subject]) throw new Error(`${id}: unknown subject "${subject}".`);
  const levels=levelsFor(q).map(String); if(!levels.some(l=>['SL','HL','Both'].includes(l))) throw new Error(`${id}: level must be SL, HL, Both, or an array.`);
  const topics=topicsFor(q).map(String); if(!topics.length) throw new Error(`${id}: missing topic.`);
  const subtopics=(subtopicsFor(q).length?subtopicsFor(q):[q.subtopic||topics[0]]).map(String);
  const difficulty=clamp(Number(q.difficulty)||3,1,5); if(!String(q.prompt||'').trim()&&!String(q.promptLatex||'').trim()) throw new Error(`${id}: missing prompt.`);
  const gradingMode=gradingModeFor(q); if(gradingMode==='auto'&&(q.answer===undefined||q.answer===null)) throw new Error(`${id}: auto-graded question is missing answer.`);
  const options=Array.isArray(q.options)?q.options.map(String):null;
  const type=q.type||(options?'mcq':typeof q.answer==='number'?'numeric':'text');
  const acceptedAnswers=Array.isArray(q.acceptedAnswers)?q.acceptedAnswers:(Array.isArray(q.aliases)?q.aliases:[]);
  const markscheme=markschemeFor(q).map((m,i)=>typeof m==='string'?{code:`M${i+1}`,text:m,marks:1}:{code:String(m.code||`M${i+1}`),text:String(m.text||m.criterion||''),marks:Math.max(1,Number(m.marks)||1)});
  return {...q,id,subject,level:levels,levels,topics,topic:String(q.topic||topics[0]),subtopics,subtopic:String(q.subtopic||subtopics[0]||q.topic||topics[0]),difficulty,
    prompt:String(q.prompt||q.promptLatex||''),promptLatex:String(q.promptLatex||''),expression:String(q.expression||''),expressionLatex:String(q.expressionLatex||''),type,options,
    aliases:acceptedAnswers,acceptedAnswers,tolerance:Number(q.tolerance)||0,explanation:String(q.explanation||''),gradingMode,markscheme,marks:Math.max(1,Number(q.marks)||markscheme.reduce((s,m)=>s+m.marks,0)||1),bank:kind};
}
normalizeQuestion=normalizeQuestionV52;

questionMatchesLevel=function(q,level){ const ls=levelsFor(q); return ls.includes('Both')||ls.includes(level); };
questionMatchesTopics=function(q,selected){ return !selected?.length||topicsFor(q).some(t=>selected.includes(t)); };
function questionMatchesSubtopics(q,selected){ return !selected?.length||subtopicsFor(q).some(t=>selected.includes(t)); }
function availableTopics(kind,subject,level){
  const fromBank=[...new Set((state.banks[kind]||[]).filter(q=>q.subject===subject&&questionMatchesLevel(q,level)).flatMap(topicsFor))];
  return fromBank.length?fromBank:[...(SUBJECTS[subject]?.topics||[])];
}
function availableSubtopics(kind,subject,level,topics=[]){
  return [...new Set((state.banks[kind]||[]).filter(q=>q.subject===subject&&questionMatchesLevel(q,level)&&questionMatchesTopics(q,topics)).flatMap(subtopicsFor))].filter(Boolean).sort((a,b)=>a.localeCompare(b));
}
matchingRacePool=function(c=state.config){
  return state.banks.race.filter(q=>q.subject===c.subject&&questionMatchesLevel(q,c.level)&&questionMatchesTopics(q,c.topics)&&questionMatchesSubtopics(q,c.subtopics)
    &&Number(q.difficulty)>=(c.hardMode?4:1)&&Number(q.difficulty)<=(c.hardMode?5:3)
    &&(gradingModeFor(q)!=='peer'||markschemeFor(q).length>0));
};
matchingPracticePool=function(c=state.practiceConfig){
  return state.banks.practice.filter(q=>q.subject===c.subject&&questionMatchesLevel(q,c.level)&&questionMatchesTopics(q,c.topics)&&questionMatchesSubtopics(q,c.subtopics)
    &&gradingModeFor(q)!=='peer'&&(c.difficulty==='mixed'||Number(q.difficulty)===Number(c.difficulty)));
};

function renderChoiceChips(rootSelector,items,selected,onChange,allLabel='Mixed / All'){
  const root=$(rootSelector); if(!root)return; const all=!selected?.length||selected.length===items.length;
  root.innerHTML=`<button class="chip all-chip ${all?'selected':''}" data-all="1">${esc(allLabel)}</button>`+items.map(t=>`<button class="chip ${!all&&selected.includes(t)?'selected':''}" data-value="${esc(t)}">${esc(t)}</button>`).join('');
  $('[data-all]',root)?.addEventListener('click',()=>onChange([]));
  $$('[data-value]',root).forEach(b=>b.addEventListener('click',()=>{
    const value=b.dataset.value; let next=all?[]:[...selected];
    next=next.includes(value)?next.filter(x=>x!==value):[...next,value];
    onChange(next);
  }));
}

renderSetup=function(){
  const c=state.config; const topics=availableTopics('race',c.subject,c.level); if(!Array.isArray(c.topics))c.topics=[]; if(!Array.isArray(c.subtopics))c.subtopics=[];
  if(c.topics.some(t=>!topics.includes(t)))c.topics=[];
  const subtopics=availableSubtopics('race',c.subject,c.level,c.topics);
  if(c.subtopics.some(t=>!subtopics.includes(t)))c.subtopics=[];
  $('#screen-setup').innerHTML=`
    <div class="backline"><button class="btn ghost" id="setup-back">← Home</button></div>
    <div class="setup-grid"><div class="panel">
      <div class="panel-head"><div><h2>Build a race</h2><p>Mix the whole course, or combine exactly the topics and subtopics you want.</p></div></div>
      <div class="setup-section"><div class="label">Subject</div><div class="subject-grid" id="subject-grid"></div></div>
      <div class="setup-section"><div class="label">Level</div><div class="segmented" id="level-toggle"><button class="seg-btn ${c.level==='SL'?'selected':''}" data-level="SL">SL</button><button class="seg-btn ${c.level==='HL'?'selected':''}" data-level="HL">HL</button></div></div>
      <div class="setup-section"><div class="label">Race mode</div><div class="segmented" id="hard-toggle"><button class="seg-btn ${!c.hardMode?'selected':''}" data-hard="false">Normal · 1 pt</button><button class="seg-btn ${c.hardMode?'selected':''}" data-hard="true">🔥 Hard · +2 / −1</button></div></div>
      <div class="setup-section"><div class="label">Topics</div><div class="topic-grid" id="topic-grid"></div></div>
      <div class="setup-section"><div class="label">Subtopics</div><div class="topic-grid" id="subtopic-grid"></div><div class="muted filter-help">“Mixed / All” draws across every matching subtopic. You can also select several subtopics together.</div></div>
      <div class="form-grid">
        <div class="field"><label>Your name</label><input id="host-name" class="input" maxlength="22" value="${esc(state.playerName==='Player'?'':state.playerName)}" placeholder="e.g. Neil"></div>
        <div class="field"><label>Players</label><select id="max-players" class="select">${[2,3,4,5,6].map(n=>`<option value="${n}" ${c.maxPlayers===n?'selected':''}>Up to ${n}</option>`).join('')}</select></div>
        <div class="field"><label>Questions</label><select id="race-count" class="select">${[1,3,5,10,15,20,25,30].map(n=>`<option value="${n}" ${c.count===n?'selected':''}>${n}</option>`).join('')}</select></div>
        <div class="field"><label>Timer</label><select id="race-time" class="select">${[[0,'No timer'],[180,'3 min'],[300,'5 min'],[600,'10 min'],[900,'15 min']].map(([v,t])=>`<option value="${v}" ${c.time===v?'selected':''}>${t}</option>`).join('')}</select></div>
      </div><div id="setup-error" class="error-text"></div>
    </div><aside class="summary-box"><h3>Race preview</h3><div class="summary-list" id="setup-summary"></div><div class="bank-note" id="setup-bank-note"></div><button class="btn primary full" id="create-room" style="margin-top:15px">Create room →</button></aside></div>`;
  renderSubjectButtons('#subject-grid',c.subject,key=>{c.subject=key;c.topics=[];c.subtopics=[];renderSetup();});
  renderChoiceChips('#topic-grid',topics,c.topics,next=>{c.topics=next;c.subtopics=[];renderSetup();},'Mixed / All topics');
  renderChoiceChips('#subtopic-grid',subtopics,c.subtopics,next=>{c.subtopics=next;renderSetup();},'Mixed / All subtopics');
  $('#setup-back').addEventListener('click',leaveToHome);
  $$('#level-toggle [data-level]').forEach(b=>b.addEventListener('click',()=>{c.level=b.dataset.level;c.topics=[];c.subtopics=[];renderSetup();}));
  $$('#hard-toggle [data-hard]').forEach(b=>b.addEventListener('click',()=>{c.hardMode=b.dataset.hard==='true';renderSetup();}));
  $('#max-players').addEventListener('change',e=>{c.maxPlayers=Number(e.target.value);updateSetupSummary();}); $('#race-count').addEventListener('change',e=>{c.count=Number(e.target.value);updateSetupSummary();}); $('#race-time').addEventListener('change',e=>{c.time=Number(e.target.value);updateSetupSummary();});
  $('#host-name').addEventListener('input',e=>state.playerName=e.target.value.trim()||'Player'); $('#create-room').addEventListener('click',createRoom); updateSetupSummary();
};
updateSetupSummary=function(){
  const c=state.config, bank=matchingRacePool(c), topics=availableTopics('race',c.subject,c.level), subs=availableSubtopics('race',c.subject,c.level,c.topics);
  if($('#setup-summary'))$('#setup-summary').innerHTML=`<div class="summary-row"><span>Subject</span><b>${esc(SUBJECTS[c.subject].short)} ${c.level}</b></div><div class="summary-row"><span>Mode</span><b>${c.hardMode?'🔥 Hard':'Normal'}</b></div><div class="summary-row"><span>Topics</span><b>${c.topics?.length?`${c.topics.length} selected`:`Mixed · ${topics.length}`}</b></div><div class="summary-row"><span>Subtopics</span><b>${c.subtopics?.length?`${c.subtopics.length} selected`:`Mixed · ${subs.length}`}</b></div><div class="summary-row"><span>Lobby</span><b>${c.maxPlayers} players max</b></div><div class="summary-row"><span>Questions</span><b>${c.count}</b></div><div class="summary-row"><span>Time</span><b>${c.time?prettyTime(c.time):'∞'}</b></div>`;
  if($('#setup-bank-note'))$('#setup-bank-note').innerHTML=state.bankStatus.race==='ok'?`<b>${bank.length}</b> matching ${c.level} race questions available.${bank.length<c.count?'<br><span style="color:#ffb2be">Pick Mixed/fewer filters, choose fewer questions, or import more questions.</span>':''}`:`Race bank is not ready. ${esc(state.bankErrors.race||'Check questionbank-config.js.')}`;
};

renderPractice=function(){
  const c=state.practiceConfig; if(!Array.isArray(c.topics))c.topics=[];if(!Array.isArray(c.subtopics))c.subtopics=[];
  const topics=availableTopics('practice',c.subject,c.level); const subs=availableSubtopics('practice',c.subject,c.level,c.topics);
  if(c.topics.some(t=>!topics.includes(t)))c.topics=[]; if(c.subtopics.some(t=>!subs.includes(t)))c.subtopics=[];
  $('#screen-practice').innerHTML=`<div class="backline"><button class="btn ghost" id="practice-back">← Home</button></div><div class="practice-layout"><aside class="sidebar wide-filters">
    <div class="label">Subject</div><select id="practice-subject" class="select">${Object.entries(SUBJECTS).map(([k,s])=>`<option value="${k}" ${c.subject===k?'selected':''}>${esc(s.short)}</option>`).join('')}</select>
    <div class="setup-section" style="margin-top:14px"><div class="label">Level</div><div class="segmented" id="practice-level"><button class="seg-btn ${c.level==='SL'?'selected':''}" data-level="SL">SL</button><button class="seg-btn ${c.level==='HL'?'selected':''}" data-level="HL">HL</button></div></div>
    <div class="setup-section"><div class="label">Difficulty</div><select id="practice-difficulty" class="select"><option value="mixed">Mixed 1–5</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${String(c.difficulty)===String(n)?'selected':''}>${n} · ${['Foundation','Standard','Challenging','Hard','Brutal'][n-1]}</option>`).join('')}</select></div>
    <div class="setup-section"><div class="label">Topics</div><div class="topic-grid compact" id="practice-topics"></div></div><div class="setup-section"><div class="label">Subtopics</div><div class="topic-grid compact" id="practice-subtopics"></div></div>
    <div class="setup-section"><div class="label">Questions</div><select id="practice-count" class="select">${[1,3,5,10,15,20,30].map(n=>`<option value="${n}" ${c.count===n?'selected':''}>${n}</option>`).join('')}</select></div><div id="practice-pool" class="bank-note"></div><button class="btn primary full" id="practice-start" style="margin-top:14px">Start practice →</button>
    </aside><main class="practice-workspace" id="practice-workspace"></main></div>`;
  renderChoiceChips('#practice-topics',topics,c.topics,next=>{c.topics=next;c.subtopics=[];renderPractice();},'Mixed / All'); renderChoiceChips('#practice-subtopics',subs,c.subtopics,next=>{c.subtopics=next;renderPractice();},'Mixed / All');
  $('#practice-back').addEventListener('click',()=>{stopPracticeTimer();renderHome();setScreen('home');}); $('#practice-subject').addEventListener('change',e=>{c.subject=e.target.value;c.topics=[];c.subtopics=[];renderPractice();});
  $$('#practice-level [data-level]').forEach(b=>b.addEventListener('click',()=>{c.level=b.dataset.level;c.topics=[];c.subtopics=[];renderPractice();})); $('#practice-difficulty').addEventListener('change',e=>{c.difficulty=e.target.value;renderPracticePoolInfo();}); $('#practice-count').addEventListener('change',e=>{c.count=Number(e.target.value);renderPracticePoolInfo();}); $('#practice-start').addEventListener('click',startPractice);
  renderPracticePoolInfo(); if(state.practice.active)renderPracticeQuestion();else renderPracticeEmpty();
};

questionHint=function(q){ if(typeof q.hint==='string')return q.hint; if(q.hint&&typeof q.hint==='object')return q.hint.formula||q.hint.content||q.hint.text||''; return q.formula||''; };
displayAnswer=function(q){ if(q.answerDisplay!==undefined)return String(q.answerDisplay); if(Array.isArray(q.options)&&typeof q.answer==='string'&&/^[A-D]$/i.test(q.answer)){const i=q.answer.toUpperCase().charCodeAt(0)-65;return `${q.answer.toUpperCase()} — ${q.options[i]??''}`;} return q.answer===undefined?'Peer graded':String(q.answer); };

function normalizeAnswerNotation(v){ return String(v??'').trim().replace(/[×·]/g,'*').replace(/÷/g,'/').replace(/[−–—]/g,'-').replace(/π/g,'pi').replace(/√/g,'sqrt').replace(/²/g,'^2').replace(/³/g,'^3'); }
function symbolicEquivalent(a,b){
  if(!window.math)return false; const left=normalizeAnswerNotation(a),right=normalizeAnswerNotation(b); if(!left||!right)return false;
  try{ const d=window.math.simplify(`(${left})-(${right})`).toString().replace(/\s+/g,''); if(d==='0')return true; }catch{}
  try{
    const ast1=window.math.parse(left),ast2=window.math.parse(right); const vars=[...new Set([...ast1.filter(n=>n.isSymbolNode).map(n=>n.name),...ast2.filter(n=>n.isSymbolNode).map(n=>n.name)])].filter(x=>!['e','pi','i'].includes(x));
    const f1=ast1.compile(),f2=ast2.compile(); const samples=[-2.3,-0.7,0.4,1.6,3.1]; let compared=0;
    for(let i=0;i<samples.length;i++){const scope={};vars.forEach((v,j)=>scope[v]=samples[(i+j)%samples.length]);let x,y;try{x=Number(f1.evaluate(scope));y=Number(f2.evaluate(scope));}catch{continue;}if(!Number.isFinite(x)||!Number.isFinite(y))continue;compared++;if(Math.abs(x-y)>1e-7*Math.max(1,Math.abs(x),Math.abs(y)))return false;} return compared>=3;
  }catch{return false;}
}
answerIsCorrect=function(q,raw){
  if(gradingModeFor(q)==='peer')return false; if(raw===undefined||raw===null||String(raw).trim()==='')return false;
  const answerType=String(q.answerType||q.type||'').toLowerCase(); const accepted=[q.answer,...(q.acceptedAnswers||q.aliases||[])].filter(v=>v!==undefined&&v!==null);
  if(typeof q.answer==='number'||answerType==='numeric'){
    let val;try{val=calcEvaluate(String(raw),state.calc.angle);}catch{try{val=Number(normalizeAnswerNotation(raw));}catch{return false;}}
    const ans=Number(q.answer);if(!Number.isFinite(val)||!Number.isFinite(ans))return false;const tol=Math.max(Number(q.tolerance)||0,Math.abs(ans)*1e-6);return Math.abs(val-ans)<=tol;
  }
  const value=normalizeText(raw); const normalized=accepted.map(normalizeText); if(normalized.includes(value))return true;
  if(Array.isArray(q.options)){ const letter=String(raw).trim().toUpperCase(); if(/^[A-Z]$/.test(letter)&&letter===String(q.answer).trim().toUpperCase())return true; const idx=String(q.answer).trim().toUpperCase().charCodeAt(0)-65;if(idx>=0&&idx<q.options.length&&normalizeText(q.options[idx])===value)return true; }
  if(['expression','algebraic','exact'].includes(answerType)&&!q.requireExact){ return accepted.some(a=>symbolicEquivalent(raw,a)); }
  return false;
};

renderRace=function(){
  const q=state.race.questions[state.race.index];if(!q){finishLocalRace();return;} const cfg=state.room?.config||state.config,subject=SUBJECTS[cfg.subject],peer=gradingModeFor(q)==='peer';
  $('#screen-race').innerHTML=`<div class="race-layout"><main><div class="race-top"><div class="race-meta"><span class="tag">${esc(subject?.short||cfg.subject)} ${esc(cfg.level)}</span><span class="tag">${esc(q.topic||'Mixed')}</span>${q.subtopic?`<span class="tag">${esc(q.subtopic)}</span>`:''}${peer?'<span class="tag peer-tag">✎ peer marked</span>':''}${cfg.hardMode?'<span class="tag hard">🔥 HARD</span>':''}<span class="tag">Q${state.race.index+1}/${state.race.questions.length}</span></div><div style="display:flex;align-items:center;gap:8px"><button class="btn secondary" id="race-calc">⌨ Calculator</button><span class="timer" id="race-timer">${cfg.time?'--:--':'∞'}</span></div></div>
    <section class="question-card"><div class="question-kicker">Difficulty ${q.difficulty}/5 · ${peer?`${maxMarksFor(q)} mark written response`:q.type==='mcq'?'multiple choice':q.type||'question'}</div><div class="question-prompt">${renderQuestionPrompt(q)}</div>${renderQuestionExpression(q)}<div id="race-answer-area"></div><div class="question-tools">${questionHint(q)?`<button class="btn secondary" id="race-hint" ${state.race.hintUsed?'disabled':''}>💡 ${state.race.hintUsed?'Hint used · max 0.6 pt':'Show hint / formula'}</button>`:''}</div>${state.race.hintUsed?`<div class="hint-box"><b>Hint</b><br>${renderHintContent(q)}<br><small>This question is capped at 0.6 race points.</small></div>`:''}<div id="race-feedback"></div></section></main><aside class="leaderboard"><h3>Live standings</h3><div id="leaderboard-list"></div></aside></div>`;
  renderAnswerArea(q,'race');renderLeaderboard();updateRaceTimer();$('#race-calc').addEventListener('click',openCalculator);$('#race-hint')?.addEventListener('click',()=>{if(state.race.submitted)return;state.race.hintUsed=true;renderRace();updateOwn({status:`Q${state.race.index+1} · used hint`}).catch(()=>{});});
};

renderAnswerArea=function(q,mode){
  const target=mode==='race'?$('#race-answer-area'):$('#practice-answer-area');if(!target)return; const current=mode==='race'?state.race:state.practice.questions[state.practice.index]; const submitted=mode==='race'?state.race.submitted:!!current.submitted;
  if(mode==='race'&&gradingModeFor(q)==='peer'){
    target.innerHTML=`<div class="peer-submit"><div class="peer-submit-copy"><b>Working required</b><span>Upload a clear photo of your proof/working. It locks when submitted and another racer marks it from the markscheme after the race.</span></div><input id="peer-image" class="file-input" type="file" accept="image/*" capture="environment" ${submitted?'disabled':''}><div id="peer-preview" class="peer-preview"></div><div class="answer-row"><button class="btn secondary" id="peer-skip" ${submitted?'disabled':''}>Skip</button><button class="btn primary" id="peer-submit" ${submitted?'disabled':''}>Submit photo</button></div></div>`;
    let data=''; const input=$('#peer-image',target); input?.addEventListener('change',async()=>{const f=input.files?.[0];if(!f)return;try{data=await compressImage(f);state.race.peerDraftData=data;$('#peer-preview',target).innerHTML=`<img src="${data}" alt="Your uploaded working preview">`;}catch(e){toast(String(e.message||e));}});
    $('#peer-submit',target)?.addEventListener('click',()=>submitPeerRaceAnswer(state.race.peerDraftData||data,false)); $('#peer-skip',target)?.addEventListener('click',()=>submitPeerRaceAnswer('',true)); return;
  }
  const selected=mode==='race'?state.race.selectedAnswer:current.selectedAnswer;
  if(Array.isArray(q.options)&&q.options.length){
    target.innerHTML=`<div class="answer-stack">${q.options.map((opt,i)=>{const letter=String.fromCharCode(65+i);let cls=selected===letter?'selected':'';if(submitted){const correct=answerIsCorrect(q,letter);if(correct)cls+=' correct';else if(selected===letter)cls+=' wrong';}return `<button class="choice ${cls}" data-choice="${letter}" ${submitted?'disabled':''}><span class="choice-letter">${letter}</span><span>${renderRichText(opt)}</span></button>`;}).join('')}</div>${!submitted?'<button class="btn primary" id="submit-choice" disabled>Submit answer</button>':''}`;
    $$('[data-choice]',target).forEach(b=>b.addEventListener('click',()=>{if(mode==='race'){state.race.selectedAnswer=b.dataset.choice;renderAnswerArea(q,'race');}else{current.selectedAnswer=b.dataset.choice;renderAnswerArea(q,'practice');}}));const submit=$('#submit-choice',target);if(submit){submit.disabled=!selected;submit.addEventListener('click',()=>mode==='race'?submitRaceAnswer(selected):submitPracticeAnswer(selected));}
  }else{
    const existing=mode==='race'?(state.race.typedAnswer||''):(current.typedAnswer||'');target.innerHTML=`<div class="answer-row"><input class="input" id="typed-answer" autocomplete="off" ${submitted?'disabled':''} value="${esc(existing)}" placeholder="Type your final answer…"><button class="btn primary" id="submit-typed" ${submitted?'disabled':''}>Submit</button></div>`;const input=$('#typed-answer',target);input?.addEventListener('input',e=>{if(mode==='race')state.race.typedAnswer=e.target.value;else current.typedAnswer=e.target.value;});input?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!submitted){e.preventDefault();mode==='race'?submitRaceAnswer(input.value):submitPracticeAnswer(input.value);}});$('#submit-typed',target)?.addEventListener('click',()=>mode==='race'?submitRaceAnswer(input?.value||''):submitPracticeAnswer(input?.value||''));if(mode==='race'&&!submitted)setTimeout(()=>input?.focus(),0);
  }
};

async function compressImage(file){
  if(!file?.type?.startsWith('image/'))throw new Error('Choose an image file.'); const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
  const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=data;}); const max=1300,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const out=canvas.toDataURL('image/jpeg',.72);if(out.length>900000)throw new Error('That photo is still too large after compression. Crop it closer to the working and retry.');return out;
}
function advanceRaceAfterSubmit(delay=650){setTimeout(()=>{state.race.index++;state.race.hintUsed=false;state.race.submitted=false;state.race.selectedAnswer='';state.race.typedAnswer='';state.race.peerDraftData='';if(state.race.index>=state.race.questions.length)finishLocalRace();else{updateOwn({status:`On Q${state.race.index+1}`,question:state.race.index+1}).catch(()=>{});renderRace();}},delay);}
async function submitPeerRaceAnswer(imageData,skipped=false){
  if(state.race.submitted)return;const q=state.race.questions[state.race.index];if(!q||gradingModeFor(q)!=='peer')return;if(!skipped&&!imageData){toast('Upload a photo first.');return;}state.race.submitted=true;const qkey=safeFirebaseKey(q.id);const submission={questionId:q.id,questionIndex:state.race.index,submitterKey:state.playerKey,submitterName:state.playerName,imageData:skipped?'':imageData,skipped:!!skipped,hintUsed:!!state.race.hintUsed,maxMarks:maxMarksFor(q),submittedAt:Date.now(),locked:true};
  try{await state.roomRef.child(`peerSubmissions/${qkey}/${state.playerKey}`).set(submission);state.race.answered.push({id:q.id,topic:q.topic,subtopic:q.subtopic,peer:true,raw:skipped?'Skipped':'Photo submitted',answer:'Peer graded',delta:0,hintUsed:state.race.hintUsed});await updateOwn({status:skipped?`Q${state.race.index+1} skipped`:`Q${state.race.index+1} photo locked`,question:state.race.index+1});renderRace();const fb=$('#race-feedback');if(fb)fb.innerHTML=`<div class="feedback ${skipped?'bad':'good'}"><b>${skipped?'Skipped':'Photo submitted & locked ✓'}</b>${!skipped?'<br>Your peer will mark it against the markscheme after the race.':''}</div>`;advanceRaceAfterSubmit();}catch(e){state.race.submitted=false;toast(firebaseMessage(e));renderRace();}
}
submitRaceAnswer=function(raw){
  if(state.race.submitted)return;const q=state.race.questions[state.race.index];if(!q)return;if(gradingModeFor(q)==='peer'){toast('Upload your working for this question.');return;}const ok=answerIsCorrect(q,raw),cfg=state.room?.config||state.config;let delta=ok?(state.race.hintUsed?0.6:(cfg.hardMode?2:1)):(cfg.hardMode?-1:0);state.race.score=round(Math.max(0,state.race.score+delta),2);state.race.submitted=true;state.race.answered.push({id:q.id,topic:q.topic,subtopic:q.subtopic,ok,raw,answer:displayAnswer(q),delta,hintUsed:state.race.hintUsed});updateOwn({score:state.race.score,status:ok?`Q${state.race.index+1} correct +${delta}`:`Q${state.race.index+1} submitted`,question:state.race.index+1}).catch(()=>{});renderRace();const fb=$('#race-feedback');if(fb)fb.innerHTML=`<div class="feedback ${ok?'good':'bad'}"><b>${ok?'Correct ✓':`Incorrect · ${delta<0?'−1 point':'0 points'}`}</b>${ok&&state.race.hintUsed?'<br>Hint used: +0.6 points.':''}${!ok?`<br>Correct answer: ${renderRichText(displayAnswer(q))}`:''}</div>`;advanceRaceAfterSubmit(850);
};

renderPracticeQuestion=function(){
  const q=state.practice.questions[state.practice.index];if(!q){renderPracticeSummary();return;}const attempted=state.practice.questions.filter(x=>x.submitted).length,correct=state.practice.questions.filter(x=>x.submitted&&x._correct).length,elapsed=Math.floor((Date.now()-state.practice.startedAt)/1000);
  $('#practice-workspace').innerHTML=`<div class="session-header"><div class="race-meta"><span class="tag">${esc(SUBJECTS[q.subject]?.short||q.subject)} ${esc(state.practiceConfig.level)}</span><span class="tag">${esc(q.topic||'Mixed')}</span>${q.subtopic?`<span class="tag">${esc(q.subtopic)}</span>`:''}<span class="tag">Difficulty ${q.difficulty}/5</span></div><div class="session-stats"><span class="stat-pill"><b id="practice-correct">${correct}</b> correct</span><span class="stat-pill"><b id="practice-attempted">${attempted}</b> attempted</span><span class="stat-pill" id="practice-clock">${prettyTime(elapsed)}</span></div></div><section class="question-card"><div class="question-kicker">Question ${state.practice.index+1} of ${state.practice.questions.length}</div><div class="question-prompt">${renderQuestionPrompt(q)}</div>${renderQuestionExpression(q)}<div id="practice-answer-area"></div><div class="question-tools">${questionHint(q)?`<button class="btn secondary" id="practice-hint">💡 ${q.hintShown?'Hint shown':'Show hint / formula'}</button>`:''}<button class="btn secondary" id="practice-flag">${q.flagged?'⚑ Flagged':'⚐ Flag'}</button><button class="btn secondary" id="practice-calc">⌨ Calculator</button></div>${q.hintShown?`<div class="hint-box"><b>Hint</b><br>${renderHintContent(q)}</div>`:''}${q.submitted?`<div class="feedback ${q._correct?'good':'bad'}"><b>${q._correct?'Correct ✓':'Incorrect'}</b>${!q._correct?`<br>Correct answer: ${renderRichText(displayAnswer(q))}`:''}${q.explanation?`<br><br>${renderRichText(q.explanation)}`:''}</div>`:''}<div class="nav-dots" id="practice-nav">${state.practice.questions.map((x,i)=>`<button class="qdot ${i===state.practice.index?'current':''} ${x.submitted?(x._correct?'correct':'wrong'):''} ${x.flagged?'flagged':''}" data-index="${i}">${i+1}</button>`).join('')}</div><div style="display:flex;justify-content:space-between;gap:8px;margin-top:18px;flex-wrap:wrap"><button class="btn secondary" id="practice-prev" ${state.practice.index===0?'disabled':''}>← Previous</button><div style="display:flex;gap:8px"><button class="btn danger" id="practice-finish">Finish set</button><button class="btn primary" id="practice-next">${state.practice.index===state.practice.questions.length-1?'Finish':'Next →'}</button></div></div></section>`;
  renderAnswerArea(q,'practice');$('#practice-hint')?.addEventListener('click',()=>{q.hintShown=true;renderPracticeQuestion();});$('#practice-flag').addEventListener('click',()=>{q.flagged=!q.flagged;renderPracticeQuestion();});$('#practice-calc').addEventListener('click',openCalculator);$('#practice-prev').addEventListener('click',()=>{state.practice.index--;renderPracticeQuestion();});$('#practice-next').addEventListener('click',()=>{if(state.practice.index>=state.practice.questions.length-1)renderPracticeSummary();else{state.practice.index++;renderPracticeQuestion();}});$('#practice-finish').addEventListener('click',renderPracticeSummary);$$('#practice-nav [data-index]').forEach(b=>b.addEventListener('click',()=>{state.practice.index=Number(b.dataset.index);renderPracticeQuestion();}));
};

hostStartRace=async function(){
  try{const room=state.room;if(!state.isHost)return;const players=connectedPlayers(room);if(players.length<2)throw new Error('At least two players are required.');await state.roomRef.update({status:'started',startedAt:firebase.database.ServerValue.TIMESTAMP,racePlayerKeys:players.map(p=>p.key)});}catch(e){const el=$('#lobby-error');if(el)el.textContent=firebaseMessage(e);}
};
function peerQuestions(){return state.race.questions.filter(q=>gradingModeFor(q)==='peer');}
function ensurePeerScreen(){let s=$('#screen-peer-grade');if(!s){s=document.createElement('section');s.id='screen-peer-grade';s.className='screen';s.dataset.screen='peer-grade';$('#screen-results')?.before(s);}return s;}
function participantKeys(){const fixed=Array.isArray(state.room?.racePlayerKeys)?state.room.racePlayerKeys:connectedPlayers(state.room).map(p=>p.key);return fixed.filter(Boolean);}
function assignedSubmissionFor(q){const keys=participantKeys();if(keys.length<2)return null;const i=keys.indexOf(state.playerKey);if(i<0)return null;const submitter=keys[(i-1+keys.length)%keys.length];const qkey=safeFirebaseKey(q.id);return {submitter,qkey,submission:state.room?.peerSubmissions?.[qkey]?.[submitter]||null,grade:state.room?.peerGrades?.[qkey]?.[submitter]||null};}
function scorePeerMarks(q,marks,hintUsed){const ratio=clamp(Number(marks)/maxMarksFor(q),0,1),base=(state.room?.config?.hardMode?2:1),raw=ratio*base;return round(hintUsed?Math.min(raw,.6):raw,2);}

function renderPeerGrading(){
  ensurePeerScreen();const qs=peerQuestions();if(!qs.length){completePeerGrading();return;}const assignments=qs.map(q=>({q,...assignedSubmissionFor(q)}));const todo=assignments.find(a=>!a.grade&&a.submission&&!a.submission.skipped);const waiting=assignments.some(a=>!a.grade&&!a.submission);const skipped=assignments.filter(a=>a.submission?.skipped&&!a.grade);
  skipped.forEach(a=>recordSkippedPeerGrade(a.q,a.submitter,a.qkey).catch(()=>{}));
  if(!todo){
    if(waiting){$('#screen-peer-grade').innerHTML=`<div class="panel peer-wait"><div class="result-icon">✎</div><h2>Waiting for written submissions</h2><p class="muted">You finished solving. As soon as the racer assigned to you submits or skips their proof question, their photo and markscheme will appear here.</p><div class="grading-progress">${assignments.filter(a=>a.grade||a.submission?.skipped).length}/${assignments.length} grading tasks resolved</div></div>`;setScreen('peer-grade');return;}
    completePeerGrading();return;
  }
  const q=todo.q,sub=todo.submission,scheme=markschemeFor(q);const playerName=state.room?.players?.[todo.submitter]?.name||'Peer';
  $('#screen-peer-grade').innerHTML=`<div class="backline"><span class="tag peer-tag">Peer grading · ${assignments.filter(a=>a.grade).length+1}/${assignments.length}</span></div><div class="grading-layout"><section class="question-card"><div class="question-kicker">Grade ${esc(playerName)} · ${maxMarksFor(q)} marks</div><div class="question-prompt">${renderQuestionPrompt(q)}</div>${renderQuestionExpression(q)}<div class="submission-photo"><img src="${sub.imageData}" alt="Uploaded handwritten response from ${esc(playerName)}"></div></section><aside class="grading-card"><div class="grading-lock">🔒 Markscheme revealed only after submissions were locked.</div><h3>Markscheme</h3><div class="markscheme-list">${scheme.map((m,i)=>`<div class="mark-row"><div><b>${esc(m.code||`M${i+1}`)}</b><span>${renderRichText(m.text||m.criterion||'')}</span></div><select class="select mark-select" data-marks="${Math.max(1,Number(m.marks)||1)}">${Array.from({length:Math.max(1,Number(m.marks)||1)+1},(_,v)=>`<option value="${v}">${v}/${Math.max(1,Number(m.marks)||1)}</option>`).join('')}</select></div>`).join('')}</div><div class="grade-total">Award <b id="grade-total">0</b> / ${maxMarksFor(q)} marks</div>${sub.hintUsed?'<div class="bank-note">Hint was used: race score from this response is capped at <b>0.6</b>.</div>':''}<button class="btn primary full" id="submit-grade">Lock grade →</button></aside></div>`;
  setScreen('peer-grade');$$('.mark-select').forEach(x=>x.addEventListener('change',()=>{$('#grade-total').textContent=$$('.mark-select').reduce((s,e)=>s+Number(e.value),0);}));$('#submit-grade').addEventListener('click',()=>submitPeerGrade(q,todo.submitter,todo.qkey,sub));
}
async function recordSkippedPeerGrade(q,submitter,qkey){const ref=state.roomRef.child(`peerGrades/${qkey}/${submitter}`);const tx=await ref.transaction(v=>v||{graderKey:state.playerKey,marksAwarded:0,maxMarks:maxMarksFor(q),delta:0,skipped:true,gradedAt:Date.now()},undefined,false);return tx.committed;}
async function submitPeerGrade(q,submitter,qkey,submission){
  const marks=$$('.mark-select').reduce((s,e)=>s+Number(e.value),0),max=maxMarksFor(q),delta=scorePeerMarks(q,marks,submission.hintUsed);const ref=state.roomRef.child(`peerGrades/${qkey}/${submitter}`);const grade={graderKey:state.playerKey,marksAwarded:marks,maxMarks:max,delta,hintUsed:!!submission.hintUsed,gradedAt:Date.now()};
  try{const tx=await ref.transaction(v=>v||grade,undefined,false);if(!tx.committed){toast('This response was already graded.');return;}await state.roomRef.child(`players/${submitter}/score`).transaction(v=>round(Math.max(0,(Number(v)||0)+delta),2));await state.roomRef.child(`peerSubmissions/${qkey}/${submitter}`).update({graded:true});renderPeerGrading();}catch(e){toast(firebaseMessage(e));}
}
async function completePeerGrading(){try{await updateOwn({gradingDone:true,finished:true,status:'Finished'});}catch{}renderResults();setScreen('results');}

finishLocalRace=function(){
  clearInterval(state.race.timer);state.race.timer=null;updateOwn({autoFinished:true,status:peerQuestions().length?'Ready to grade':'Finished',score:state.race.score,question:state.race.questions.length,...(peerQuestions().length?{}:{gradingDone:true,finished:true})}).catch(()=>{});if(peerQuestions().length){ensurePeerScreen();renderPeerGrading();}else{renderResults();setScreen('results');}
};

const syncRoomBase=syncRoom;
syncRoom=function(room){
  if(!room){toast('Room closed.');leaveToHome();return;}state.room=room;if(room.config)state.config={...state.config,...room.config};if(state.screen==='lobby')renderLobby();if(state.screen==='race')renderLeaderboard();if(state.screen==='peer-grade')renderPeerGrading();if(state.screen==='results')renderResults();const round=Number(room.round)||1;if(room.status==='started'&&state.activeRound!==round){state.activeRound=round;startLocalRace(room);}if(room.status==='lobby'&&state.activeRound!==null&&state.activeRound!==round){state.activeRound=null;resetLocalRace();renderLobby();setScreen('lobby');}
};

renderResults=function(){
  const players=(state.room?.racePlayerKeys||connectedPlayers(state.room).map(p=>p.key)).map(k=>({...state.room?.players?.[k],key:k})).filter(p=>p.name).sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));const me=players.find(p=>p.key===state.playerKey),rank=Math.max(1,players.findIndex(p=>p.key===state.playerKey)+1),allFinished=players.length>0&&players.every(p=>p.finished);const peerGrades=state.room?.peerGrades||{};
  $('#screen-results').innerHTML=`<div class="panel"><div class="result-hero"><div class="result-icon">${rank===1?'🏆':'⚡'}</div><div class="eyebrow">${allFinished?'race complete':'results updating'}</div><h2>${rank===1?'You are currently #1':`You are currently #${rank}`}</h2><p class="muted">Your score: <b style="color:var(--text)">${formatScore(me?.score??state.race.score)}</b>${!allFinished?' · waiting for remaining peer grades':''}</p></div><div class="podium">${players.slice(0,3).map((p,i)=>`<div class="podium-card"><div style="font-size:1.5rem">${['🥇','🥈','🥉'][i]}</div><b>${esc(p.name)}</b><div style="font-size:1.5rem;font-weight:950;margin-top:8px">${formatScore(p.score)}</div><small class="muted">${esc(p.status||'')}</small></div>`).join('')}</div><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn secondary" id="results-home">Leave room</button>${state.isHost?`<button class="btn primary" id="rematch" ${allFinished?'':'disabled'}>${allFinished?'Rematch →':'Waiting for grading…'}</button>`:''}</div><div class="review-list">${state.race.answered.map((a,i)=>{let delta=a.delta,mark='';if(a.peer){const g=peerGrades?.[safeFirebaseKey(a.id)]?.[state.playerKey];delta=g?.delta??0;mark=g?`${g.marksAwarded}/${g.maxMarks} marks`:'pending peer grade';}return `<div class="review-item"><span class="review-mark ${a.peer?(mark.startsWith('pending')?'':'ok'):(a.ok?'ok':'no')}">${a.peer?'✎':a.ok?'✓':'×'}</span><span><b>Q${i+1} · ${esc(a.topic||'')}${a.subtopic?` · ${esc(a.subtopic)}`:''}</b><br><small class="muted">${a.peer?mark:`Your answer: ${esc(a.raw||'—')}`}${a.hintUsed?' · hint used':''}</small></span><span style="font-weight:900">${delta>0?'+':''}${formatScore(delta)}</span></div>`;}).join('')}</div></div>`;$('#results-home').addEventListener('click',leaveRoom);$('#rematch')?.addEventListener('click',hostRematch);
};

/* ------------------------- BOOT ------------------------- */
renderShell();
loadQuestionBanks();

})();

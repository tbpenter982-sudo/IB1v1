const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const TOPICS = {
  math: ['Algebra','Functions','Trigonometry','Calculus','Vectors','Probability'],
  physics: ['Mechanics','Waves','Fields','Electricity','Thermal','Nuclear']
};
const SUBJECT_NAMES = { math:'Math AA HL', physics:'Physics HL' };

let mode = null;
let db = null;
let roomRef = null;
let roomListener = null;
let roomCode = null;
let role = null;
let activeRound = null;
let config = {subject:'math',topics:[...TOPICS.math],count:10,time:300};
let questions = [], qIndex = 0, score = 0, oppScore = 0, answered = [], timerId = null, timeLeft = 0, raceEnded = false;

function show(id){ $$('.screen').forEach(x=>x.classList.remove('active')); $('#screen-'+id).classList.add('active'); }
function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
function round(n,d=3){ const p=10**d; return Math.round((n+Number.EPSILON)*p)/p; }
function safeCode(){ return Math.random().toString(36).slice(2,8).toUpperCase().padEnd(6,'X').slice(0,6); }
function prettyTime(s){ if(s<=0)return '00:00'; return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

function firebaseReady(){
  const c = window.IBRACE_FIREBASE_CONFIG;
  return !!(window.firebase && c && c.apiKey && c.databaseURL && !String(c.apiKey).includes('PASTE_') && !String(c.databaseURL).includes('PASTE_'));
}
function initFirebase(){
  if(db) return db;
  if(!firebaseReady()) throw new Error('Firebase is not configured yet. Open firebase-config.js in GitHub and paste your Firebase web config.');
  if(!firebase.apps.length) firebase.initializeApp(window.IBRACE_FIREBASE_CONFIG);
  db = firebase.database();
  return db;
}
function firebaseErrorText(err){
  const msg = String(err?.message || err || 'Unknown Firebase error');
  if(msg.toLowerCase().includes('permission_denied') || msg.toLowerCase().includes('permission denied')) return 'Firebase denied access. Paste the included firebase-rules.json rules into Realtime Database → Rules and publish them.';
  if(msg.toLowerCase().includes('network')) return 'Could not reach Firebase from this network. Check internet access and try again.';
  return msg;
}

function buildTopics(){
  const box=$('#topic-list'); box.innerHTML='';
  TOPICS[config.subject].forEach(t=>{
    const b=document.createElement('button'); b.type='button'; b.className='topic-chip selected'; b.textContent=t;
    b.onclick=()=>{ b.classList.toggle('selected'); syncTopics(); };
    box.appendChild(b);
  });
  syncTopics();
}
function syncTopics(){ config.topics=$$('#topic-list .topic-chip.selected').map(x=>x.textContent); }

function generateQuestion(subject, topic){ return subject==='math' ? generateMath(topic) : generatePhysics(topic); }
function generateMath(topic){
  let a,b,c,n,x,ans;
  switch(topic){
    case 'Algebra':
      a=rand(2,8); b=rand(-12,12); c=rand(-15,15); x=rand(-6,6); ans=a*x*x+b*x+c;
      return q(topic,`Evaluate the quadratic at x = ${x}.`,`f(x) = ${a}x² ${signed(b)}x ${signed(c)}`,ans,0);
    case 'Functions':
      a=rand(2,7); b=rand(-8,8); x=rand(-5,5); ans=a*(x+b);
      return q(topic,`For f(x) = ${a}(x ${signed(b)}), find f(${x}).`,'',ans,0);
    case 'Trigonometry': {
      x=pick([30,45,60]); const trig=pick(['sin','cos']);
      ans=trig==='sin'?({30:.5,45:Math.SQRT1_2,60:Math.sqrt(3)/2}[x]):({30:Math.sqrt(3)/2,45:Math.SQRT1_2,60:.5}[x]);
      return q(topic,`Give ${trig}(${x}°) as a decimal to 3 s.f.`,'',round(ans,3),.002);
    }
    case 'Calculus':
      a=rand(2,7); n=rand(2,5); x=rand(1,4); ans=a*n*(x**(n-1));
      return q(topic,`Given f(x) = ${a}x^${n}, find f′(${x}).`,'',ans,0);
    case 'Vectors': {
      a=rand(-6,6); b=rand(-6,6); c=rand(-6,6); const d=rand(-6,6),e=rand(-6,6),f=rand(-6,6); ans=a*d+b*e+c*f;
      return q(topic,`Find the dot product of the vectors.`,`⟨${a}, ${b}, ${c}⟩ · ⟨${d}, ${e}, ${f}⟩`,ans,0);
    }
    case 'Probability':
      a=rand(2,8); b=rand(2,8); ans=a/(a+b);
      return q(topic,`A bag has ${a} red and ${b} blue counters. One is chosen at random. Find P(red), to 3 d.p.`,'',round(ans,3),.0015);
    default: throw new Error(`Unknown Math topic: ${topic}`);
  }
}
function generatePhysics(topic){
  let a,b,c,ans;
  switch(topic){
    case 'Mechanics':
      a=rand(2,20); b=rand(2,12); ans=.5*a*b*b;
      return q(topic,`A ${a} kg object moves at ${b} m s⁻¹. Find its kinetic energy in joules.`,'Eₖ = ½mv²',ans,.02);
    case 'Waves':
      a=rand(2,20)*10; b=rand(2,12); ans=a/b;
      return q(topic,`A wave has speed ${a} m s⁻¹ and frequency ${b} Hz. Find its wavelength in metres.`,'v = fλ',round(ans,3),.01);
    case 'Fields':
      a=rand(2,15); b=rand(1,10); ans=a*b;
      return q(topic,`A ${a} C charge is in a uniform electric field of ${b} N C⁻¹. Find the force in newtons.`,'F = qE',ans,.01);
    case 'Electricity':
      a=rand(2,24); b=rand(2,12); ans=a/b;
      return q(topic,`A resistor has ${a} V across it and current ${b} A. Find its resistance in ohms.`,'R = V / I',round(ans,3),.01);
    case 'Thermal':
      a=rand(1,5); b=rand(5,40); c=4200; ans=a*c*b;
      return q(topic,`${a} kg of water is heated by ${b} °C. Using c = 4200 J kg⁻¹ K⁻¹, find the energy transferred in joules.`,'Q = mcΔT',ans,1);
    case 'Nuclear':
      a=rand(1,4); b=rand(1,5); ans=a*(.5**b);
      return q(topic,`A sample initially has activity ${a} kBq. After ${b} half-lives, what is its activity in kBq?`,'A = A₀(½)ⁿ',round(ans,4),.0005);
    default: throw new Error(`Unknown Physics topic: ${topic}`);
  }
}
function q(topic,prompt,expression,answer,tolerance){ return {topic,prompt,expression,answer,tolerance}; }
function signed(n){ return n>=0?`+ ${n}`:`− ${Math.abs(n)}`; }
function makeQuestions(){
  const seedTopics=config.topics.length?config.topics:TOPICS[config.subject];
  questions=Array.from({length:config.count},(_,i)=>generateQuestion(config.subject,seedTopics[i%seedTopics.length]));
}

async function roomExists(code){
  const snap = await initFirebase().ref(`rooms/${code}`).once('value');
  return snap.exists();
}
async function makeUniqueRoomCode(){
  for(let i=0;i<12;i++){
    const code=safeCode();
    if(!(await roomExists(code))) return code;
  }
  throw new Error('Could not generate a unique room code. Try again.');
}
function detachRoom(){
  if(roomRef && roomListener) roomRef.off('value', roomListener);
  roomListener=null; roomRef=null;
}
function attachRoom(code){
  detachRoom();
  roomRef=initFirebase().ref(`rooms/${code}`);
  roomListener=snap=>syncRoomState(snap.val());
  roomRef.on('value', roomListener, err=>{
    $('#lobby-note').textContent=firebaseErrorText(err);
  });
}
function ownKey(){ return role==='host'?'host':'guest'; }
function oppKey(){ return role==='host'?'guest':'host'; }
async function updateOwn(patch){
  if(!roomRef || !role) return;
  await roomRef.child(`players/${ownKey()}`).update(patch);
}

function setOpponentReady(ready=true){
  const slot=$('#opponent-slot');
  if(ready){
    slot.classList.add('ready'); slot.querySelector('.avatar').textContent='O'; slot.querySelector('small').textContent='Ready'; slot.querySelector('.pulse')?.remove();
  } else {
    slot.classList.remove('ready'); slot.querySelector('.avatar').textContent='?'; slot.querySelector('small').textContent='Waiting…';
  }
}
function updateLobbySummary(){
  $('#race-summary').innerHTML=`<b>${SUBJECT_NAMES[config.subject]}</b><br>${config.topics.join(' • ')}<br>${config.count} questions • ${config.time?Math.round(config.time/60)+' min':'No timer'}`;
}
function syncRoomState(room){
  if(!room){
    if(mode==='join'){
      show('join'); $('#join-error').textContent='This room no longer exists.'; $('#join-error').classList.remove('hidden');
    }
    return;
  }

  if(room.config) config=room.config;
  if(Array.isArray(room.questions)) questions=room.questions;
  updateLobbySummary();

  const own=room.players?.[ownKey()] || {};
  const opp=room.players?.[oppKey()] || {};
  oppScore=Number(opp.score||0);
  if($('#screen-race').classList.contains('active') || $('#screen-results').classList.contains('active')) updateScores();
  if($('#screen-results').classList.contains('active')) refreshResultHeader();

  const opponentConnected=!!opp.connected;
  setOpponentReady(opponentConnected);
  if(mode==='host'){
    $('#btn-start').style.display='inline-block';
    $('#btn-start').disabled=!opponentConnected || room.status!=='lobby';
    if(room.status==='lobby') $('#lobby-title').textContent=opponentConnected?'Opponent connected':'Waiting for opponent';
  } else {
    $('#btn-start').style.display='none';
    if(room.status==='lobby'){
      $('#lobby-title').textContent='Connected';
      $('#lobby-note').textContent='Waiting for host to start the race.';
    }
  }

  const roundNo=Number(room.round||1);
  if(room.status==='started' && activeRound!==roundNo){
    activeRound=roundNo;
    startRace(false);
  }

  if(room.status==='lobby' && activeRound!==null && activeRound!==roundNo){
    activeRound=null;
    resetRace();
    show('lobby');
    $('#lobby-title').textContent=mode==='host'?(opponentConnected?'Opponent connected':'Waiting for opponent'):'Connected';
    $('#lobby-note').textContent=mode==='host'?'Start when both players are ready.':'Waiting for host to start the race.';
  }
}

function resetRace(){
  qIndex=0; score=0; oppScore=0; answered=[]; raceEnded=false; timeLeft=config.time;
  clearInterval(timerId); timerId=null; updateScores();
}
function startRace(){
  resetRace(); show('race');
  $('#race-subject').textContent=SUBJECT_NAMES[config.subject];
  $('#timer').textContent=config.time?prettyTime(timeLeft):'∞';
  renderQuestion();
  updateOwn({score:0,status:'Solving…',finished:false,connected:true}).catch(()=>{});
  if(config.time){
    timerId=setInterval(()=>{ timeLeft--; $('#timer').textContent=prettyTime(timeLeft); if(timeLeft<=0){ clearInterval(timerId); endRace(); } },1000);
  }
}
function renderQuestion(){
  if(qIndex>=questions.length){ endRace(); return; }
  const cur=questions[qIndex];
  $('#question-index').textContent=`${qIndex+1} / ${questions.length}`;
  $('#race-topic').textContent=cur.topic; $('#q-topic').textContent=cur.topic;
  $('#q-prompt').textContent=cur.prompt; $('#q-expression').textContent=cur.expression||'';
  $('#answer-input').value=''; $('#answer-input').disabled=false; $('#feedback').className='feedback hidden';
  $('#answer-input').focus(); $('#your-status').textContent='Solving…';
  updateOwn({status:`On Q${qIndex+1}`,score,finished:false}).catch(()=>{});
}
function markAnswer(raw){
  const cur=questions[qIndex]; const normalized=raw.trim().replace(',','.'); const val=Number(normalized);
  const ok=Number.isFinite(val)&&Math.abs(val-cur.answer)<=Math.max(cur.tolerance||0,Math.abs(cur.answer)*0.000001);
  answered.push({q:qIndex+1,topic:cur.topic,ok,yours:raw,answer:cur.answer});
  if(ok) score++;
  updateScores(); updateOwn({score,status:ok?'Correct':'Submitted'}).catch(()=>{});
  const fb=$('#feedback'); fb.className='feedback '+(ok?'correct':'wrong'); fb.textContent=ok?'Correct ✓':`Not quite. Correct answer: ${cur.answer}`;
  $('#answer-input').disabled=true; $('#your-status').textContent=ok?'Correct':'Submitted';
  setTimeout(()=>{ qIndex++; renderQuestion(); },650);
}
function updateScores(){
  $('#your-score').textContent=score; $('#opp-score').textContent=oppScore;
  $('#your-progress').style.width=`${config.count?Math.min(100,(score/config.count)*100):0}%`;
  $('#opp-progress').style.width=`${config.count?Math.min(100,(oppScore/config.count)*100):0}%`;
  if($('#screen-results').classList.contains('active')){
    $('#final-your-score').textContent=score; $('#final-opp-score').textContent=oppScore;
  }
}
function endRace(){
  if(raceEnded)return; raceEnded=true; clearInterval(timerId); timerId=null;
  updateOwn({score,status:'Finished',finished:true}).catch(()=>{});
  showResults();
}
function refreshResultHeader(){
  let title='Draw', icon='🤝', sub='Same score — rematch?';
  if(score>oppScore){title='You win';icon='🏆';sub=`You finished ${score} / ${config.count}.`}
  if(score<oppScore){title='Opponent leads';icon='⚡';sub=`You finished ${score} / ${config.count}.`}
  $('#result-title').textContent=title; $('#result-icon').textContent=icon; $('#result-sub').textContent=sub;
}
function showResults(){
  show('results'); updateScores(); refreshResultHeader();
  $('#review-list').innerHTML=answered.map(x=>`<div class="review-item"><span class="${x.ok?'ok':'no'}">${x.ok?'✓':'✕'}</span><span>Q${x.q} • ${x.topic}<br><small>Your answer: ${esc(x.yours||'—')}</small></span><b>${x.answer}</b></div>`).join('');
  $('#btn-rematch').style.display=mode==='host'?'inline-block':'none';
}

$('#btn-create').onclick=()=>{
  mode='host'; role='host'; $('#btn-start').style.display='inline-block'; buildTopics(); show('setup');
};
$('#btn-join').onclick=()=>{
  mode='join'; role='guest'; show('join'); $('#join-code').focus();
};
$$('[data-back]').forEach(b=>b.onclick=()=>show('home'));
$('#subject-toggle').onclick=e=>{
  if(!e.target.dataset.subject)return;
  $$('#subject-toggle button').forEach(b=>b.classList.remove('selected')); e.target.classList.add('selected');
  config.subject=e.target.dataset.subject; config.topics=[...TOPICS[config.subject]]; buildTopics();
};

$('#btn-host').onclick=async()=>{
  $('#setup-error').classList.add('hidden');
  try{
    initFirebase();
    syncTopics(); config.count=Number($('#question-count').value); config.time=Number($('#race-time').value);
    if(!config.topics.length) throw new Error('Select at least one topic.');
    makeQuestions();
    roomCode=await makeUniqueRoomCode();
    const ref=initFirebase().ref(`rooms/${roomCode}`);
    await ref.set({
      status:'lobby', round:1, createdAt:firebase.database.ServerValue.TIMESTAMP,
      config, questions,
      players:{host:{connected:true,score:0,status:'Ready',finished:false},guest:{connected:false,score:0,status:'Waiting',finished:false}}
    });
    await ref.child('players/host/connected').onDisconnect().set(false);
    $('#room-code-value').textContent=roomCode; updateLobbySummary(); show('lobby');
    $('#btn-start').disabled=true; $('#lobby-title').textContent='Waiting for opponent'; $('#lobby-note').textContent='Room is online. Share the code with your opponent.';
    attachRoom(roomCode);
  }catch(e){
    $('#setup-error').textContent=firebaseErrorText(e); $('#setup-error').classList.remove('hidden');
  }
};

$('#btn-connect').onclick=async()=>{
  $('#join-error').classList.add('hidden');
  const code=$('#join-code').value.trim().toUpperCase();
  if(!/^[A-Z0-9]{6}$/.test(code)){
    $('#join-error').textContent='Enter the full 6-character room code.'; $('#join-error').classList.remove('hidden'); return;
  }
  try{
    initFirebase();
    const ref=initFirebase().ref(`rooms/${code}`);
    const snap=await ref.once('value');
    if(!snap.exists()) throw new Error('Room not found. Check the code and make sure the host still has the lobby open.');
    const room=snap.val();
    if(room.status!=='lobby') throw new Error('That race has already started. Ask the host to create a new room or rematch.');
    if(room.players?.guest?.connected) throw new Error('This room already has two players.');
    roomCode=code; role='guest'; mode='join';
    await ref.child('players/guest').update({connected:true,score:0,status:'Ready',finished:false});
    await ref.child('players/guest/connected').onDisconnect().set(false);
    $('#room-code-value').textContent=code; $('#btn-start').style.display='none'; show('lobby');
    $('#lobby-title').textContent='Connected'; $('#lobby-note').textContent='Waiting for host to start the race.';
    attachRoom(code);
  }catch(e){
    show('join'); $('#join-error').textContent=firebaseErrorText(e); $('#join-error').classList.remove('hidden');
  }
};

$('#copy-code').onclick=async()=>{
  try{await navigator.clipboard.writeText(roomCode);$('#copy-code small').textContent='copied!';setTimeout(()=>$('#copy-code small').textContent='click to copy',1200)}catch{}
};
$('#btn-start').onclick=async()=>{
  if(mode!=='host' || !roomRef) return;
  try{
    const snap=await roomRef.once('value'); const room=snap.val();
    if(!room?.players?.guest?.connected) throw new Error('Opponent is not connected yet.');
    await roomRef.update({status:'started',startedAt:firebase.database.ServerValue.TIMESTAMP});
  }catch(e){ $('#lobby-note').textContent=firebaseErrorText(e); }
};
$('#answer-form').onsubmit=e=>{e.preventDefault(); if($('#answer-input').disabled)return; markAnswer($('#answer-input').value)};
$('#btn-rematch').onclick=async()=>{
  if(mode!=='host' || !roomRef) return;
  try{
    makeQuestions();
    const snap=await roomRef.once('value'); const room=snap.val()||{}; const nextRound=Number(room.round||1)+1;
    await roomRef.update({
      status:'lobby',round:nextRound,questions,config,
      'players/host/score':0,'players/host/status':'Ready','players/host/finished':false,'players/host/connected':true,
      'players/guest/score':0,'players/guest/status':'Ready','players/guest/finished':false
    });
  }catch(e){ $('#result-sub').textContent=firebaseErrorText(e); }
};
$('#btn-home').onclick=async()=>{
  try{ await updateOwn({connected:false}); }catch{}
  detachRoom(); clearInterval(timerId); timerId=null; activeRound=null; show('home');
};

buildTopics();

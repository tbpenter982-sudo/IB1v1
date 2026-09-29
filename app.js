const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const TOPICS = {
  math: ['Algebra','Functions','Trigonometry','Calculus','Vectors','Probability'],
  physics: ['Mechanics','Waves','Fields','Electricity','Thermal','Nuclear']
};

const SUBJECT_NAMES = { math:'Math AA HL', physics:'Physics HL' };
let mode = null, peer = null, conn = null, roomCode = null;
let config = {subject:'math',topics:[...TOPICS.math],count:10,time:300};
let questions = [], qIndex = 0, score = 0, oppScore = 0, answered = [], timerId = null, timeLeft = 0, raceEnded = false;

function show(id){ $$('.screen').forEach(x=>x.classList.remove('active')); $('#screen-'+id).classList.add('active'); }
function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
function round(n,d=3){ const p=10**d; return Math.round((n+Number.EPSILON)*p)/p; }
function safeCode(){ return Math.random().toString(36).slice(2,8).toUpperCase(); }
function prettyTime(s){ if(s<=0)return '00:00'; return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }

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

function generateQuestion(subject, topic){
  if(subject==='math') return generateMath(topic);
  return generatePhysics(topic);
}
function generateMath(topic){
  let a,b,c,n,x,ans;
  switch(topic){
    case 'Algebra':
      a=rand(2,8); b=rand(-12,12); c=rand(-15,15); x=rand(-6,6); ans=a*x*x+b*x+c;
      return q(topic,`Evaluate the quadratic at x = ${x}.`,`f(x) = ${a}x² ${signed(b)}x ${signed(c)}`,ans,0);
    case 'Functions':
      a=rand(2,7); b=rand(-8,8); x=rand(-5,5); ans=a*(x+b);
      return q(topic,`For f(x) = ${a}(x ${signed(b)}), find f(${x}).`,'',ans,0);
    case 'Trigonometry':
      x=pick([30,45,60]); const trig=pick(['sin','cos']); ans= trig==='sin'?({30:.5,45:Math.SQRT1_2,60:Math.sqrt(3)/2}[x]):({30:Math.sqrt(3)/2,45:Math.SQRT1_2,60:.5}[x]);
      return q(topic,`Give ${trig}(${x}°) as a decimal to 3 s.f.`,'',round(ans,3),.002);
    case 'Calculus':
      a=rand(2,7); n=rand(2,5); x=rand(1,4); ans=a*n*(x**(n-1));
      return q(topic,`Given f(x) = ${a}x^${n}, find f′(${x}).`,'',ans,0);
    case 'Vectors':
      a=rand(-6,6); b=rand(-6,6); c=rand(-6,6); const d=rand(-6,6),e=rand(-6,6),f=rand(-6,6); ans=a*d+b*e+c*f;
      return q(topic,`Find the dot product of the vectors.`,`⟨${a}, ${b}, ${c}⟩ · ⟨${d}, ${e}, ${f}⟩`,ans,0);
    case 'Probability':
      a=rand(2,8); b=rand(2,8); ans=a/(a+b);
      return q(topic,`A bag has ${a} red and ${b} blue counters. One is chosen at random. Find P(red), to 3 d.p.`,'',round(ans,3),.0015);
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
  }
}
function q(topic,prompt,expression,answer,tolerance){ return {topic,prompt,expression,answer,tolerance}; }
function signed(n){ return n>=0?`+ ${n}`:`− ${Math.abs(n)}`; }
function makeQuestions(){
  const seedTopics=config.topics.length?config.topics:TOPICS[config.subject];
  questions=Array.from({length:config.count},(_,i)=>generateQuestion(config.subject,seedTopics[i%seedTopics.length]));
}

function peerIdFromCode(code){ return `ib-race-${code.toLowerCase()}`; }

const PEER_OPTIONS = {
  debug: 1,
  secure: true,
  host: '0.peerjs.com',
  port: 443,
  path: '/',
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
};

function connectionErrorText(err){
  const type = err?.type || '';
  if(type === 'peer-unavailable') return 'Room not found. Check the code and make sure the host still has the lobby open.';
  if(type === 'unavailable-id') return 'That room code is already in use. Go back and create a new room.';
  if(type === 'network' || type === 'server-error' || type === 'socket-error') return 'The multiplayer service could not be reached from this network. Try another network or disable a restrictive VPN/firewall.';
  if(type === 'webrtc') return 'The browsers found each other, but WebRTC could not make a direct connection on this network.';
  return err?.message ? `Connection failed: ${err.message}` : 'Connection failed. Check the room code and try again.';
}

function setupPeer(isHost, code, timeoutMs=12000){
  return new Promise((resolve,reject)=>{
    if(typeof Peer === 'undefined'){
      reject(new Error('PeerJS library did not load.'));
      return;
    }

    let settled=false;
    let timeout=null;
    const finish=(fn,val)=>{
      if(settled) return;
      settled=true;
      clearTimeout(timeout);
      fn(val);
    };

    try{
      peer = isHost ? new Peer(peerIdFromCode(code), PEER_OPTIONS) : new Peer(undefined, PEER_OPTIONS);

      timeout=setTimeout(()=>{
        try{ peer?.destroy(); }catch{}
        finish(reject,new Error(isHost ? 'Timed out opening the room.' : 'Timed out connecting to the host.'));
      }, timeoutMs);

      peer.on('error',err=>finish(reject,err));

      peer.on('disconnected',()=>{
        if(!raceEnded && $('#screen-lobby').classList.contains('active')){
          $('#lobby-note').textContent='Connection to the multiplayer service was interrupted.';
        }
      });

      peer.on('open',()=>{
        if(isHost){
          $('#lobby-note').textContent='Room is online. Share the code with your opponent.';
          peer.on('connection', c=>{
            if(conn && conn.open){ c.close(); return; }
            attachConn(c);
            c.on('open',()=>finish(resolve,c));
            c.on('error',err=>finish(reject,err));
          });
          // Host is successfully registered even though an opponent has not joined yet.
          clearTimeout(timeout);
          settled=true;
          resolve(null);
        } else {
          const c=peer.connect(peerIdFromCode(code),{reliable:true,serialization:'json'});
          attachConn(c);
          c.on('open',()=>finish(resolve,c));
          c.on('error',err=>finish(reject,err));
          c.on('close',()=>{
            if(!settled) finish(reject,new Error('The host closed the room before the connection completed.'));
          });
        }
      });
    }catch(e){
      finish(reject,e);
    }
  });
}

function attachConn(c){
  conn=c;
  c.on('data',handleMessage);
  c.on('close',()=>{
    if(!raceEnded && $('#screen-race').classList.contains('active')) $('#opp-status').textContent='Disconnected';
    if($('#screen-lobby').classList.contains('active') && mode==='join'){
      $('#lobby-title').textContent='Disconnected';
      $('#lobby-note').textContent='The host closed the room.';
    }
  });
  c.on('error',err=>{
    if($('#screen-lobby').classList.contains('active')) $('#lobby-note').textContent=connectionErrorText(err);
  });
}
function send(type,payload={}){ if(conn?.open) conn.send({type,...payload}); }
function handleMessage(m){
  if(!m||!m.type)return;
  if(m.type==='hello'){
    if(mode==='host'){ send('config',{config,questions}); setOpponentReady(); }
  }
  if(m.type==='config'){
    config=m.config; questions=m.questions; updateLobbySummary(); setOpponentReady(); $('#btn-start').disabled=true; $('#lobby-note').textContent='Waiting for host to start the race.';
  }
  if(m.type==='start') startRace(false);
  if(m.type==='score'){ oppScore=m.score; updateScores(); }
  if(m.type==='status'){ $('#opp-status').textContent=m.status; }
  if(m.type==='finish'){ oppScore=m.score; updateScores(); maybeFinish(); }
  if(m.type==='rematch') startRace(false,true);
}
function setOpponentReady(){
  $('#opponent-slot').classList.add('ready'); $('#opponent-slot .avatar').textContent='O'; $('#opponent-slot small').textContent='Ready';
  $('#opponent-slot .pulse')?.remove();
  if(mode==='host'){ $('#btn-start').disabled=false; $('#lobby-title').textContent='Opponent connected'; }
}
function updateLobbySummary(){
  $('#race-summary').innerHTML=`<b>${SUBJECT_NAMES[config.subject]}</b><br>${config.topics.join(' • ')}<br>${config.count} questions • ${config.time?Math.round(config.time/60)+' min':'No timer'}`;
}

function resetRace(){
  qIndex=0; score=0; oppScore=0; answered=[]; raceEnded=false; timeLeft=config.time;
  clearInterval(timerId); updateScores();
}
function startRace(sendStart=true, rematch=false){
  resetRace(); if(sendStart) send(rematch?'rematch':'start'); show('race');
  $('#race-subject').textContent=SUBJECT_NAMES[config.subject];
  $('#timer').textContent=config.time?prettyTime(timeLeft):'∞';
  renderQuestion();
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
  $('#answer-input').focus(); $('#your-status').textContent='Solving…'; send('status',{status:`On Q${qIndex+1}`});
}
function markAnswer(raw){
  const cur=questions[qIndex]; const normalized=raw.trim().replace(',','.'); const val=Number(normalized);
  const ok=Number.isFinite(val)&&Math.abs(val-cur.answer)<=Math.max(cur.tolerance||0,Math.abs(cur.answer)*0.000001);
  answered.push({q:qIndex+1,topic:cur.topic,ok,yours:raw,answer:cur.answer});
  if(ok) score++;
  updateScores(); send('score',{score});
  const fb=$('#feedback'); fb.className='feedback '+(ok?'correct':'wrong'); fb.textContent=ok?'Correct ✓':`Not quite. Correct answer: ${cur.answer}`;
  $('#answer-input').disabled=true; $('#your-status').textContent=ok?'Correct':'Submitted';
  setTimeout(()=>{ qIndex++; renderQuestion(); },650);
}
function updateScores(){
  $('#your-score').textContent=score; $('#opp-score').textContent=oppScore;
  $('#your-progress').style.width=`${(score/config.count)*100}%`; $('#opp-progress').style.width=`${(oppScore/config.count)*100}%`;
}
function endRace(){
  if(raceEnded)return; raceEnded=true; clearInterval(timerId); send('finish',{score}); maybeFinish(true);
}
function maybeFinish(force=false){
  if(!force && !raceEnded)return;
  show('results'); $('#final-your-score').textContent=score; $('#final-opp-score').textContent=oppScore;
  let title='Draw', icon='🤝', sub='Same score — rematch?';
  if(score>oppScore){title='You win';icon='🏆';sub=`You finished ${score} / ${config.count}.`}
  if(score<oppScore){title='Opponent wins';icon='⚡';sub=`You finished ${score} / ${config.count}.`}
  $('#result-title').textContent=title; $('#result-icon').textContent=icon; $('#result-sub').textContent=sub;
  $('#review-list').innerHTML=answered.map(x=>`<div class="review-item"><span class="${x.ok?'ok':'no'}">${x.ok?'✓':'✕'}</span><span>Q${x.q} • ${x.topic}<br><small>Your answer: ${esc(x.yours||'—')}</small></span><b>${x.answer}</b></div>`).join('');
  $('#btn-rematch').style.display=mode==='host'?'inline-block':'none';
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

$('#btn-create').onclick=()=>{mode='host';buildTopics();show('setup')};
$('#btn-join').onclick=()=>{mode='join';show('join');$('#join-code').focus()};
$$('[data-back]').forEach(b=>b.onclick=()=>show('home'));
$('#subject-toggle').onclick=e=>{if(!e.target.dataset.subject)return; $$('#subject-toggle button').forEach(b=>b.classList.remove('selected'));e.target.classList.add('selected');config.subject=e.target.dataset.subject;config.topics=[...TOPICS[config.subject]];buildTopics()};
$('#btn-host').onclick=async()=>{
  syncTopics(); config.count=Number($('#question-count').value); config.time=Number($('#race-time').value);
  if(!config.topics.length){$('#setup-error').textContent='Select at least one topic.';$('#setup-error').classList.remove('hidden');return}
  makeQuestions(); roomCode=safeCode(); $('#room-code-value').textContent=roomCode; updateLobbySummary(); show('lobby');
  $('#btn-start').disabled=true; $('#lobby-title').textContent='Waiting for opponent'; $('#lobby-note').textContent='The host starts when both players are connected.';
  try{ await setupPeer(true,roomCode); }catch(e){ $('#lobby-title').textContent='Could not create room'; $('#lobby-note').textContent=connectionErrorText(e); $('#btn-start').disabled=true; }
};
$('#btn-connect').onclick=async()=>{
  const code=$('#join-code').value.trim().toUpperCase(); if(code.length!==6){$('#join-error').textContent='Enter the full 6-character room code.';$('#join-error').classList.remove('hidden');return}
  roomCode=code; $('#room-code-value').textContent=code; show('lobby'); $('#lobby-title').textContent='Connecting…'; $('#btn-start').style.display='none'; $('#lobby-note').textContent='Connecting to host…';
  try{ await setupPeer(false,code); send('hello'); $('#lobby-title').textContent='Connected'; $('#lobby-note').textContent='Waiting for host to start the race.'; }
  catch(e){ show('join'); $('#join-error').textContent=connectionErrorText(e);$('#join-error').classList.remove('hidden'); }
};
$('#copy-code').onclick=async()=>{try{await navigator.clipboard.writeText(roomCode);$('#copy-code small').textContent='copied!';setTimeout(()=>$('#copy-code small').textContent='click to copy',1200)}catch{}};
$('#btn-start').onclick=()=>startRace(true);
$('#answer-form').onsubmit=e=>{e.preventDefault(); if($('#answer-input').disabled)return; markAnswer($('#answer-input').value)};
$('#btn-rematch').onclick=()=>{ makeQuestions(); send('config',{config,questions}); startRace(true,true) };
$('#btn-home').onclick=()=>{ try{conn?.close();peer?.destroy()}catch{}; show('home') };

buildTopics();

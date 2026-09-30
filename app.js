const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* =========================================================
   IB RACE — expanded objective/problem-solving subjects
   Subjects: Math AA, Math AI, Physics, Chemistry, Biology,
             Economics, ESS
   Each subject supports SL / HL + optional HARD MODE.
   ========================================================= */

const SUBJECTS = {
  mathAA: {
    name: 'Mathematics: Analysis & Approaches',
    short: 'Math AA',
    icon: '∫',
    topics: ['Algebra','Functions','Trigonometry','Calculus','Vectors','Probability & Statistics']
  },
  mathAI: {
    name: 'Mathematics: Applications & Interpretation',
    short: 'Math AI',
    icon: 'Σ',
    topics: ['Number & Algebra','Functions','Geometry & Trigonometry','Statistics & Probability','Calculus','Financial Mathematics']
  },
  physics: {
    name: 'Physics',
    short: 'Physics',
    icon: '⚛',
    topics: ['Mechanics','Waves','Fields','Electricity','Thermal','Nuclear']
  },
  chemistry: {
    name: 'Chemistry',
    short: 'Chemistry',
    icon: '🧪',
    topics: ['Stoichiometry','Atomic Structure','Bonding','Energetics','Kinetics','Equilibrium','Acids & Bases','Redox','Organic']
  },
  biology: {
    name: 'Biology',
    short: 'Biology',
    icon: '🧬',
    topics: ['Cell Biology','Molecular Biology','Genetics','Metabolism','Ecology','Evolution','Human Physiology']
  },
  economics: {
    name: 'Economics',
    short: 'Economics',
    icon: '📈',
    topics: ['Microeconomics','Macroeconomics','Global Economy','Development']
  },
  ess: {
    name: 'Environmental Systems & Societies',
    short: 'ESS',
    icon: '🌍',
    topics: ['Ecosystems','Biodiversity','Pollution','Climate Change','Water & Food','Energy & Resources','Sustainability']
  }
};

const SUBJECT_NAMES = Object.fromEntries(
  Object.entries(SUBJECTS).map(([key, value]) => [key, value.short])
);

let mode = null;
let db = null;
let roomRef = null;
let roomListener = null;
let roomCode = null;
let role = null;
let activeRound = null;
let config = {
  subject: 'mathAA',
  level: 'HL',
  hardMode: false,
  topics: [...SUBJECTS.mathAA.topics],
  count: 10,
  time: 300
};
let questions = [];
let qIndex = 0;
let score = 0;
let oppScore = 0;
let answered = [];
let timerId = null;
let timeLeft = 0;
let raceEnded = false;
let streak = 0;

/* ------------------------- utilities ------------------------- */
function show(id){
  $$('.screen').forEach(x => x.classList.remove('active'));
  const screen = $('#screen-' + id);
  if(screen) screen.classList.add('active');
}
function rand(min,max){ return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(a){ return a[Math.floor(Math.random() * a.length)]; }
function round(n,d=3){ const p=10**d; return Math.round((n + Number.EPSILON) * p) / p; }
function safeCode(){ return Math.random().toString(36).slice(2,8).toUpperCase().padEnd(6,'X').slice(0,6); }
function prettyTime(s){ if(s<=0) return '00:00'; return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function esc(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function signed(n){ return n>=0 ? `+ ${n}` : `− ${Math.abs(n)}`; }
function gcd(a,b){ a=Math.abs(a); b=Math.abs(b); while(b){ [a,b]=[b,a%b]; } return a || 1; }
function normalizeText(s){
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[−–—]/g,'-')
    .replace(/\s+/g,' ')
    .replace(/[.,;:!?]+$/g,'');
}
function subjectLabel(){
  const s=SUBJECTS[config.subject];
  return `${s ? s.short : config.subject} ${config.level || 'SL'}${config.hardMode ? ' • HARD' : ''}`;
}
function maxPossibleScore(){ return config.hardMode ? config.count * 2 : config.count; }

/* --------------------------- UI boost --------------------------- */
function injectUpgradeStyles(){
  if($('#ibrace-upgrade-styles')) return;
  const style=document.createElement('style');
  style.id='ibrace-upgrade-styles';
  style.textContent=`
    #subject-toggle.ibrace-subject-grid{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
    #subject-toggle.ibrace-subject-grid button{min-height:58px;padding:9px 10px;display:flex;align-items:center;justify-content:center;gap:8px;line-height:1.15}
    .ib-subject-icon{font-size:1.2rem}
    .ibrace-switch-row{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px}
    .ibrace-switch-row button{flex:1;min-width:92px}
    .ibrace-mini-label{font-size:.76rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-top:14px;margin-bottom:6px}
    .hard-toggle.selected,.hard-badge{box-shadow:0 0 0 1px rgba(255,77,77,.45),0 0 22px rgba(255,77,77,.25)}
    .hard-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;font-weight:900;font-size:.75rem;letter-spacing:.06em;background:rgba(255,70,70,.13)}
    .race-meta-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:6px;font-size:.82rem;opacity:.82}
    .streak-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;background:rgba(255,170,0,.12);font-weight:800}
    #hard-rules{margin-top:6px;font-size:.78rem;opacity:.72}
  `;
  document.head.appendChild(style);
}

function ensureSetupControls(){
  const subjectToggle=$('#subject-toggle');
  if(!subjectToggle) return;
  subjectToggle.classList.add('ibrace-subject-grid');

  if(!$('#level-toggle')){
    const levelLabel=document.createElement('div');
    levelLabel.className='ibrace-mini-label';
    levelLabel.textContent='IB level';
    const level=document.createElement('div');
    level.id='level-toggle';
    level.className='ibrace-switch-row';
    level.innerHTML='<button type="button" data-level="SL">SL</button><button type="button" data-level="HL">HL</button>';
    subjectToggle.insertAdjacentElement('afterend', level);
    subjectToggle.insertAdjacentElement('afterend', levelLabel);
  }

  if(!$('#difficulty-toggle')){
    const topicList=$('#topic-list');
    const difficultyLabel=document.createElement('div');
    difficultyLabel.className='ibrace-mini-label';
    difficultyLabel.textContent='Difficulty';
    const difficulty=document.createElement('div');
    difficulty.id='difficulty-toggle';
    difficulty.className='ibrace-switch-row';
    difficulty.innerHTML=`
      <button type="button" data-hard="false">Normal</button>
      <button type="button" class="hard-toggle" data-hard="true">🔥 HARD MODE</button>
      <div id="hard-rules" style="flex-basis:100%">Hard mode: harder/multi-step questions, no formula hints, +2 correct, −1 wrong.</div>`;
    if(topicList){
      topicList.insertAdjacentElement('beforebegin', difficulty);
      difficulty.insertAdjacentElement('beforebegin', difficultyLabel);
    } else {
      $('#screen-setup')?.append(difficultyLabel,difficulty);
    }
  }

  if(!$('#race-mode-meta')){
    const raceSubject=$('#race-subject');
    if(raceSubject){
      const meta=document.createElement('div');
      meta.id='race-mode-meta';
      meta.className='race-meta-line';
      raceSubject.insertAdjacentElement('afterend',meta);
    }
  }
}

function buildSubjectPicker(){
  const box=$('#subject-toggle');
  if(!box) return;
  box.innerHTML='';
  for(const [key,s] of Object.entries(SUBJECTS)){
    const b=document.createElement('button');
    b.type='button';
    b.dataset.subject=key;
    b.innerHTML=`<span class="ib-subject-icon">${s.icon}</span><span>${esc(s.short)}</span>`;
    if(key===config.subject) b.classList.add('selected');
    b.onclick=()=>{
      config.subject=key;
      config.topics=[...SUBJECTS[key].topics];
      $$('#subject-toggle button').forEach(x=>x.classList.toggle('selected',x===b));
      buildTopics();
    };
    box.appendChild(b);
  }
  syncToggleUI();
}

function syncToggleUI(){
  $$('#level-toggle [data-level]').forEach(b=>b.classList.toggle('selected',b.dataset.level===config.level));
  $$('#difficulty-toggle [data-hard]').forEach(b=>b.classList.toggle('selected',String(config.hardMode)===b.dataset.hard));
}

function buildTopics(){
  const box=$('#topic-list');
  const subject=SUBJECTS[config.subject];
  if(!box || !subject) return;
  box.innerHTML='';
  subject.topics.forEach(t=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='topic-chip selected';
    b.textContent=t;
    b.onclick=()=>{ b.classList.toggle('selected'); syncTopics(); };
    box.appendChild(b);
  });
  syncTopics();
}
function syncTopics(){ config.topics=$$('#topic-list .topic-chip.selected').map(x=>x.textContent); }

/* ---------------------- question data model ---------------------- */
function q(topic,prompt,expression,answer,tolerance=0,aliases=[]){
  return {topic,prompt,expression,answer,tolerance,aliases};
}
function mcq(topic,prompt,choices,correctIndex){
  const letters=['A','B','C','D'];
  return q(topic,`${prompt} Answer A, B, C or D.`,choices.map((c,i)=>`${letters[i]}. ${c}`).join('   '),letters[correctIndex],0,[choices[correctIndex]]);
}
function isHard(){ return !!config.hardMode; }
function isHL(){ return config.level==='HL'; }
function maybeHint(normalHint){ return isHard() ? '' : normalHint; }

/* ----------------------- Math AA generator ----------------------- */
function generateMathAA(topic){
  let a,b,c,n,x,ans;
  switch(topic){
    case 'Algebra':
      if(isHard() || isHL()){
        a=rand(2,6); b=rand(-8,8); x=rand(-5,5); c=rand(-10,10);
        ans=a*x*x+b*x+c;
        return q(topic,`For f(x) = ${a}x² ${signed(b)}x ${signed(c)}, evaluate f(${x}). Then subtract f(0).`,'',ans-c,0);
      }
      a=rand(2,8); b=rand(-12,12); c=rand(-15,15); x=rand(-6,6); ans=a*x*x+b*x+c;
      return q(topic,`Evaluate the quadratic at x = ${x}.`,`f(x) = ${a}x² ${signed(b)}x ${signed(c)}`,ans,0);
    case 'Functions':
      if(isHard()){
        a=rand(2,6); b=rand(-6,6); c=rand(1,5); x=rand(-4,4); ans=a*(c*x+b);
        return q(topic,`Let f(x)=${a}x and g(x)=${c}x ${signed(b)}. Find (f∘g)(${x}).`,'',ans,0);
      }
      a=rand(2,7); b=rand(-8,8); x=rand(-5,5); ans=a*(x+b);
      return q(topic,`For f(x) = ${a}(x ${signed(b)}), find f(${x}).`,'',ans,0);
    case 'Trigonometry': {
      if(isHard() || isHL()){
        const opp=rand(3,15), adj=rand(3,15);
        ans=round(Math.atan2(opp,adj)*180/Math.PI,1);
        return q(topic,`In a right triangle, relative to angle θ, opposite = ${opp} and adjacent = ${adj}. Find θ in degrees to 1 d.p.`,'',ans,.11);
      }
      x=pick([30,45,60]); const trig=pick(['sin','cos']);
      ans=trig==='sin'?({30:.5,45:Math.SQRT1_2,60:Math.sqrt(3)/2}[x]):({30:Math.sqrt(3)/2,45:Math.SQRT1_2,60:.5}[x]);
      return q(topic,`Give ${trig}(${x}°) as a decimal to 3 s.f.`,'',round(ans,3),.002);
    }
    case 'Calculus':
      if(isHard()){
        a=rand(2,5); n=rand(2,4); b=rand(-6,6); x=rand(1,4); ans=a*n*(x**(n-1))+b;
        return q(topic,`Given f(x)=${a}x^${n} ${signed(b)}x, find f′(${x}).`,'',ans,0);
      }
      a=rand(2,7); n=rand(2,5); x=rand(1,4); ans=a*n*(x**(n-1));
      return q(topic,`Given f(x) = ${a}x^${n}, find f′(${x}).`,'',ans,0);
    case 'Vectors': {
      a=rand(-6,6); b=rand(-6,6); c=rand(-6,6);
      if(a===0 && b===0 && c===0) a=1;
      let d=rand(-6,6),e=rand(-6,6),f=rand(-6,6);
      if(d===0 && e===0 && f===0) d=1;
      if(isHard()){
        const dot=a*d+b*e+c*f;
        const mag=Math.sqrt(a*a+b*b+c*c)*Math.sqrt(d*d+e*e+f*f);
        ans=round(Math.acos(Math.max(-1,Math.min(1,dot/mag)))*180/Math.PI,1);
        return q(topic,'Find the angle between the vectors, in degrees to 1 d.p.',`⟨${a}, ${b}, ${c}⟩ and ⟨${d}, ${e}, ${f}⟩`,ans,.11);
      }
      ans=a*d+b*e+c*f;
      return q(topic,'Find the dot product of the vectors.',`⟨${a}, ${b}, ${c}⟩ · ⟨${d}, ${e}, ${f}⟩`,ans,0);
    }
    case 'Probability & Statistics':
      if(isHard() || isHL()){
        const p=pick([0.2,0.25,0.3,0.4,0.5,0.6]); n=rand(3,7); const k=rand(1,n-1);
        const comb=factorial(n)/(factorial(k)*factorial(n-k));
        ans=round(comb*(p**k)*((1-p)**(n-k)),4);
        return q(topic,`X ~ B(${n}, ${p}). Find P(X = ${k}) to 4 d.p.`,'',ans,.00011);
      }
      a=rand(2,8); b=rand(2,8); ans=a/(a+b);
      return q(topic,`A bag has ${a} red and ${b} blue counters. One is chosen at random. Find P(red), to 3 d.p.`,'',round(ans,3),.0015);
    default: throw new Error(`Unknown Math AA topic: ${topic}`);
  }
}
function factorial(n){ let out=1; for(let i=2;i<=n;i++) out*=i; return out; }

/* ----------------------- Math AI generator ----------------------- */
function generateMathAI(topic){
  let a,b,x,ans;
  switch(topic){
    case 'Number & Algebra': {
      const p=rand(3,9), years=rand(2,8), rate=pick([2,3,4,5,6,7])/100;
      ans=round(p*1000*((1+rate)**years),2);
      return q(topic,`€${p*1000} grows at ${rate*100}% compound interest for ${years} years. Find the final value to the nearest cent.`,maybeHint('A=P(1+r)ⁿ'),ans,.011);
    }
    case 'Functions':
      a=rand(2,7); b=rand(-8,8); x=rand(-5,5); ans=a*x+b;
      return q(topic,`A linear model is y=${a}x ${signed(b)}. Predict y when x=${x}.`,'',ans,0);
    case 'Geometry & Trigonometry': {
      const r=rand(2,12), deg=pick([30,45,60,90,120,150]);
      ans=round((deg/360)*Math.PI*r*r,2);
      return q(topic,`Find the area of a sector with radius ${r} and central angle ${deg}°, to 2 d.p.`,'',ans,.011);
    }
    case 'Statistics & Probability': {
      const vals=Array.from({length:5},()=>rand(2,20));
      ans=round(vals.reduce((s,v)=>s+v,0)/vals.length,2);
      if(isHard()){
        const squared=vals.reduce((s,v)=>s+v*v,0)/vals.length;
        const mean=vals.reduce((s,v)=>s+v,0)/vals.length;
        ans=round(Math.sqrt(squared-mean*mean),2);
        return q(topic,`For the population data ${vals.join(', ')}, find the population standard deviation to 2 d.p.`,'',ans,.011);
      }
      return q(topic,`Find the mean of: ${vals.join(', ')}.`,'',ans,.011);
    }
    case 'Calculus':
      a=rand(2,6); b=rand(-6,6); x=rand(1,5); ans=2*a*x+b;
      return q(topic,`For C(x)=${a}x² ${signed(b)}x + ${rand(1,8)}, find the marginal cost C′(${x}).`,'',ans,0);
    case 'Financial Mathematics': {
      const principal=rand(2,12)*1000; const rate=pick([2,2.5,3,3.5,4,5])/100; const years=rand(2,7);
      ans=round(principal/((1+rate)**years),2);
      return q(topic,`A payment of €${principal} is due in ${years} years. At ${rate*100}% annual interest, find its present value to 2 d.p.`,'',ans,.011);
    }
    default: throw new Error(`Unknown Math AI topic: ${topic}`);
  }
}

/* ------------------------ Physics generator ------------------------ */
function generatePhysics(topic){
  let a,b,c,ans;
  switch(topic){
    case 'Mechanics':
      if(isHard() || isHL()){
        const u=rand(1,12), v=rand(u+1,u+15), t=rand(2,8), m=rand(2,15);
        ans=round(m*(v-u)/t,2);
        return q(topic,`A ${m} kg object changes speed uniformly from ${u} to ${v} m s⁻¹ in ${t} s. Find the resultant force in N.`,'',ans,.011);
      }
      a=rand(2,20); b=rand(2,12); ans=.5*a*b*b;
      return q(topic,`A ${a} kg object moves at ${b} m s⁻¹. Find its kinetic energy in joules.`,maybeHint('Eₖ = ½mv²'),ans,.02);
    case 'Waves':
      if(isHard()){
        const f=rand(2,15)*10, wavelength=pick([0.25,0.5,0.75,1.2,1.5,2]);
        ans=round(f*wavelength,3);
        return q(topic,`A wave has frequency ${f} Hz and wavelength ${wavelength} m. It enters a medium where its frequency is unchanged and wavelength halves. Find the new wave speed in m s⁻¹.`,'',round(ans/2,3),.011);
      }
      a=rand(2,20)*10; b=rand(2,12); ans=a/b;
      return q(topic,`A wave has speed ${a} m s⁻¹ and frequency ${b} Hz. Find its wavelength in metres.`,maybeHint('v = fλ'),round(ans,3),.01);
    case 'Fields':
      if(isHard() || isHL()){
        const q1=rand(1,8)*1e-6, q2=rand(1,8)*1e-6, r=pick([0.1,0.2,0.25,0.4,0.5]);
        ans=round(8.99e9*q1*q2/(r*r),3);
        return q(topic,`Two point charges of ${round(q1*1e6,0)} μC and ${round(q2*1e6,0)} μC are ${r} m apart. Find the electrostatic force magnitude in N. Use k=8.99×10⁹.`,'',ans,.002);
      }
      a=rand(2,15); b=rand(1,10); ans=a*b;
      return q(topic,`A ${a} C charge is in a uniform electric field of ${b} N C⁻¹. Find the force in newtons.`,maybeHint('F = qE'),ans,.01);
    case 'Electricity':
      if(isHard()){
        const r1=rand(2,12), r2=rand(2,12), v=rand(6,24);
        const req=(r1*r2)/(r1+r2); ans=round(v/req,3);
        return q(topic,`Resistors ${r1} Ω and ${r2} Ω are connected in parallel across ${v} V. Find the total current in A.`,'',ans,.002);
      }
      a=rand(2,24); b=rand(2,12); ans=a/b;
      return q(topic,`A resistor has ${a} V across it and current ${b} A. Find its resistance in ohms.`,maybeHint('R = V / I'),round(ans,3),.01);
    case 'Thermal':
      if(isHard()){
        const m=rand(1,4), csp=pick([420,900,2100,4200]), dt=rand(10,50), efficiency=pick([0.6,0.7,0.75,0.8,0.9]);
        ans=round(m*csp*dt/efficiency,1);
        return q(topic,`${m} kg of material (c=${csp} J kg⁻¹ K⁻¹) is heated by ${dt} K by a heater of efficiency ${efficiency*100}%. Find the electrical energy supplied in J.`,'',ans,.11);
      }
      a=rand(1,5); b=rand(5,40); c=4200; ans=a*c*b;
      return q(topic,`${a} kg of water is heated by ${b} °C. Using c = 4200 J kg⁻¹ K⁻¹, find the energy transferred in joules.`,maybeHint('Q = mcΔT'),ans,1);
    case 'Nuclear':
      if(isHard() || isHL()){
        const half=rand(2,8), time=half*rand(2,5), initial=rand(2,12)*100;
        ans=round(initial*(0.5**(time/half)),3);
        return q(topic,`A source has activity ${initial} Bq and half-life ${half} h. Find its activity after ${time} h.`,'',ans,.002);
      }
      a=rand(1,4); b=rand(1,5); ans=a*(.5**b);
      return q(topic,`A sample initially has activity ${a} kBq. After ${b} half-lives, what is its activity in kBq?`,maybeHint('A = A₀(½)ⁿ'),round(ans,4),.0005);
    default: throw new Error(`Unknown Physics topic: ${topic}`);
  }
}

/* ----------------------- Chemistry generator ----------------------- */
function generateChemistry(topic){
  switch(topic){
    case 'Stoichiometry': {
      const moles=pick([0.1,0.2,0.25,0.5,0.75,1.2]); const mr=rand(20,180);
      return q(topic,`A sample contains ${moles} mol of a substance with Mᵣ=${mr}. Find its mass in g.`,maybeHint('m = nM'),round(moles*mr,3),.002);
    }
    case 'Atomic Structure': {
      const z=rand(3,20), mass=z+rand(1,24), charge=pick([-1,0,1,2]);
      const electrons=z-charge;
      return q(topic,`An ion has atomic number ${z}, mass number ${mass}, and charge ${charge>=0?'+':''}${charge}. How many electrons does it contain?`,'',electrons,0);
    }
    case 'Bonding':
      return mcq(topic,'Which species is expected to have the strongest intermolecular forces?',
        isHard()?['CH₄','HCl','NH₃','H₂O']:['Ne','CH₄','H₂O','CO₂'],
        isHard()?3:2);
    case 'Energetics': {
      const broken=rand(200,700), formed=rand(300,900);
      const ans=broken-formed;
      return q(topic,`Total bond enthalpy required to break bonds is ${broken} kJ mol⁻¹; total released on bond formation is ${formed} kJ mol⁻¹. Estimate ΔH in kJ mol⁻¹.`,maybeHint('ΔH = bonds broken − bonds formed'),ans,.01);
    }
    case 'Kinetics': {
      const c1=pick([0.1,0.2,0.25,0.5]), c2=round(c1*2,2);
      if(isHard()) return q(topic,`Doubling [A] from ${c1} to ${c2} mol dm⁻³ causes rate to increase by a factor of 4. What is the order with respect to A?`,'',2,0);
      return mcq(topic,'Which change normally increases reaction rate without changing the equilibrium constant?',['Lower temperature','Add a catalyst','Decrease concentration','Increase activation energy'],1);
    }
    case 'Equilibrium': {
      const aConc=pick([0.2,0.4,0.5,0.8]);
      const ratio=rand(2,5);
      const bConc=round(aConc*ratio,2);
      return q(topic,`For A ⇌ B, an equilibrium mixture contains [A]=${aConc} mol dm⁻³ and [B]=${bConc} mol dm⁻³. Find Kc=[B]/[A].`,'',round(bConc/aConc,3),.002);
    }
    case 'Acids & Bases': {
      const ph=rand(1,6);
      if(isHard() || isHL()){
        const h=10**(-ph); return q(topic,`A strong monoprotic acid has pH ${ph}. Find [H⁺] in mol dm⁻³. Enter in scientific notation or decimal.`,'',h,Math.max(1e-12,h*0.002));
      }
      return q(topic,`A solution has [H⁺] = 1×10⁻${ph} mol dm⁻³. Find its pH.`,'',ph,0);
    }
    case 'Redox': {
      const charge=pick([1,2,3]);
      return q(topic,`An atom loses ${charge} electron${charge===1?'':'s'}. What charge does the resulting ion have? Enter the signed integer.`,'',charge,0,[`+${charge}`]);
    }
    case 'Organic':
      return mcq(topic,'Which functional group defines an alcohol?',['–CHO','–COOH','–OH','–NH₂'],2);
    default: throw new Error(`Unknown Chemistry topic: ${topic}`);
  }
}

/* ------------------------ Biology generator ------------------------ */
function generateBiology(topic){
  switch(topic){
    case 'Cell Biology':
      return mcq(topic,'Which structure is present in prokaryotic cells?',['Nucleus','80S ribosomes','70S ribosomes','Mitochondria'],2);
    case 'Molecular Biology':
      return mcq(topic,'Which base pairs with adenine in DNA?',['Uracil','Cytosine','Guanine','Thymine'],3);
    case 'Genetics': {
      if(isHard() || isHL()){
        return q(topic,'In a monohybrid cross Aa × Aa, what percentage of offspring are expected to show the recessive phenotype?','',25,.01,['25%']);
      }
      return q(topic,'In a monohybrid cross Aa × aa, what percentage of offspring are expected to have genotype aa?','',50,.01,['50%']);
    }
    case 'Metabolism':
      return mcq(topic,'Which molecule is the immediate energy currency of the cell?',['DNA','ATP','Glucose','NADP'],1);
    case 'Ecology': {
      const captured=rand(20,80), marked2=rand(20,80), recaptured=rand(5,Math.min(captured,marked2));
      const ans=round(captured*marked2/recaptured,1);
      return q(topic,`Lincoln index: ${captured} animals are marked first. Later ${marked2} are caught, of which ${recaptured} are marked. Estimate population size to 1 d.p.`,'',ans,.11);
    }
    case 'Evolution':
      return mcq(topic,'Natural selection directly acts on differences in which property?',['Genotype frequency only','Phenotype','Mutation rate','Species age'],1);
    case 'Human Physiology':
      if(isHard()) return mcq(topic,'Where does ultrafiltration of blood occur in the nephron?',['Loop of Henle','Collecting duct','Glomerulus/Bowman’s capsule','Distal convoluted tubule'],2);
      return mcq(topic,'Which chamber pumps oxygenated blood into the systemic circulation?',['Right atrium','Right ventricle','Left atrium','Left ventricle'],3);
    default: throw new Error(`Unknown Biology topic: ${topic}`);
  }
}

/* ----------------------- Economics generator ----------------------- */
function generateEconomics(topic){
  switch(topic){
    case 'Microeconomics': {
      if(isHard() || isHL()){
        const q1=rand(80,140), q2=rand(40,75), p1=rand(8,14), p2=p1+rand(2,6);
        const ped=((q2-q1)/((q1+q2)/2))/((p2-p1)/((p1+p2)/2));
        return q(topic,`Price rises from ${p1} to ${p2}; quantity demanded falls from ${q1} to ${q2}. Using the midpoint method, find PED to 2 d.p. Keep the sign.`,'',round(ped,2),.011);
      }
      const units=rand(20,80), p=rand(2,12);
      return q(topic,`A firm sells ${units} units at €${p} each. Find total revenue in €.`,'',units*p,0);
    }
    case 'Macroeconomics': {
      const nominal=rand(200,900), deflator=pick([90,95,100,105,110,120,125]);
      return q(topic,`Nominal GDP is ${nominal} billion and the GDP deflator is ${deflator}. Find real GDP in billions to 2 d.p.`,'Real GDP = nominal GDP ÷ (deflator/100)',round(nominal/(deflator/100),2),.011);
    }
    case 'Global Economy': {
      const old=pick([1.05,1.1,1.2,1.25]), now=round(old*pick([0.8,0.9,1.1,1.2]),2);
      return mcq(topic,`The exchange rate moves from 1 EUR = ${old} USD to 1 EUR = ${now} USD. Relative to the USD, the euro has…`,
        now>old?['appreciated','depreciated','experienced inflation','become a tariff']:['depreciated','appreciated','experienced deflation','become a quota'],0);
    }
    case 'Development':
      return mcq(topic,'Which variable is directly included in the Human Development Index?',['Military spending','Life expectancy','Trade balance','Inflation rate'],1);
    default: throw new Error(`Unknown Economics topic: ${topic}`);
  }
}

/* --------------------------- ESS generator --------------------------- */
function generateESS(topic){
  switch(topic){
    case 'Ecosystems': {
      const input=rand(500,2000), output=rand(30,200);
      return q(topic,`A trophic level receives ${input} kJ m⁻² yr⁻¹ and transfers ${output} kJ m⁻² yr⁻¹ to the next level. Find ecological efficiency (%) to 1 d.p.`,'',round(100*output/input,1),.11,['%']);
    }
    case 'Biodiversity':
      return mcq(topic,'Which index increases when both species richness and evenness increase?',['Biochemical oxygen demand','Simpson diversity index','Carbon footprint','Ecological footprint'],1);
    case 'Pollution':
      return mcq(topic,'Which process most directly causes eutrophication in freshwater?',['Nutrient enrichment','Ozone depletion','Thermal inversion','Desertification'],0);
    case 'Climate Change': {
      const initial=rand(100,500), pct=rand(5,30);
      return q(topic,`Annual emissions fall from ${initial} Mt by ${pct}%. Find the new emissions level in Mt.`,'',round(initial*(1-pct/100),2),.011);
    }
    case 'Water & Food': {
      const used=rand(200,900), replenished=rand(100,700);
      return q(topic,`A groundwater store receives ${replenished} million m³ yr⁻¹ but withdrawals are ${used} million m³ yr⁻¹. Find the annual net change in storage (recharge − withdrawal).`,'',replenished-used,0);
    }
    case 'Energy & Resources': {
      const input=rand(100,1000), eff=pick([20,25,30,35,40,45])/100;
      return q(topic,`A power system receives ${input} MJ and operates at ${eff*100}% efficiency. Find useful output energy in MJ.`,'',round(input*eff,2),.011);
    }
    case 'Sustainability':
      return mcq(topic,'Which action most directly represents a circular-economy strategy?',['Landfilling usable materials','Designing products for repair and reuse','Increasing single-use packaging','Extracting more virgin raw material'],1);
    default: throw new Error(`Unknown ESS topic: ${topic}`);
  }
}

function generateQuestion(subject, topic){
  switch(subject){
    case 'mathAA': return generateMathAA(topic);
    case 'mathAI': return generateMathAI(topic);
    case 'physics': return generatePhysics(topic);
    case 'chemistry': return generateChemistry(topic);
    case 'biology': return generateBiology(topic);
    case 'economics': return generateEconomics(topic);
    case 'ess': return generateESS(topic);
    default: throw new Error(`Unknown subject: ${subject}`);
  }
}

function makeQuestions(){
  const subject=SUBJECTS[config.subject];
  if(!subject) throw new Error('Choose a valid subject.');
  const seedTopics=config.topics.length ? config.topics : subject.topics;
  questions=Array.from({length:config.count},(_,i)=>generateQuestion(config.subject,seedTopics[i%seedTopics.length]));
}

/* ------------------------- answer marking ------------------------- */
function parseNumeric(raw){
  const cleaned=String(raw).trim().replace(',','.').replace(/%$/,'').replace(/×10\^?/i,'e').replace(/\s/g,'');
  const fraction=cleaned.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if(fraction){
    const den=Number(fraction[2]);
    if(den!==0) return Number(fraction[1])/den;
  }
  const v=Number(cleaned);
  return Number.isFinite(v)?v:null;
}
function answerIsCorrect(cur,raw){
  if(typeof cur.answer==='number'){
    const val=parseNumeric(raw);
    if(val===null) return false;
    const tol=Math.max(cur.tolerance||0,Math.abs(cur.answer)*0.000001);
    return Math.abs(val-cur.answer)<=tol;
  }
  const value=normalizeText(raw);
  const accepted=[cur.answer,...(cur.aliases||[])].map(normalizeText);
  return accepted.includes(value);
}

/* --------------------------- Firebase --------------------------- */
function firebaseReady(){
  const c=window.IBRACE_FIREBASE_CONFIG;
  return !!(window.firebase && c && c.apiKey && c.databaseURL && !String(c.apiKey).includes('PASTE_') && !String(c.databaseURL).includes('PASTE_'));
}
function initFirebase(){
  if(db) return db;
  if(!firebaseReady()) throw new Error('Firebase is not configured yet. Open firebase-config.js in GitHub and paste your Firebase web config.');
  if(!firebase.apps.length) firebase.initializeApp(window.IBRACE_FIREBASE_CONFIG);
  db=firebase.database();
  return db;
}
function firebaseErrorText(err){
  const msg=String(err?.message || err || 'Unknown Firebase error');
  if(msg.toLowerCase().includes('permission_denied') || msg.toLowerCase().includes('permission denied')) return 'Firebase denied access. Paste the included firebase-rules.json rules into Realtime Database → Rules and publish them.';
  if(msg.toLowerCase().includes('network')) return 'Could not reach Firebase from this network. Check internet access and try again.';
  return msg;
}
async function roomExists(code){ const snap=await initFirebase().ref(`rooms/${code}`).once('value'); return snap.exists(); }
async function makeUniqueRoomCode(){
  for(let i=0;i<12;i++){ const code=safeCode(); if(!(await roomExists(code))) return code; }
  throw new Error('Could not generate a unique room code. Try again.');
}
function detachRoom(){ if(roomRef && roomListener) roomRef.off('value',roomListener); roomListener=null; roomRef=null; }
function attachRoom(code){
  detachRoom();
  roomRef=initFirebase().ref(`rooms/${code}`);
  roomListener=snap=>syncRoomState(snap.val());
  roomRef.on('value',roomListener,err=>{ if($('#lobby-note')) $('#lobby-note').textContent=firebaseErrorText(err); });
}
function ownKey(){ return role==='host'?'host':'guest'; }
function oppKey(){ return role==='host'?'guest':'host'; }
async function updateOwn(patch){ if(roomRef && role) await roomRef.child(`players/${ownKey()}`).update(patch); }

/* ------------------------ lobby + race UI ------------------------ */
function setOpponentReady(ready=true){
  const slot=$('#opponent-slot'); if(!slot) return;
  if(ready){
    slot.classList.add('ready');
    const avatar=slot.querySelector('.avatar'); if(avatar) avatar.textContent='O';
    const small=slot.querySelector('small'); if(small) small.textContent='Ready';
    slot.querySelector('.pulse')?.remove();
  } else {
    slot.classList.remove('ready');
    const avatar=slot.querySelector('.avatar'); if(avatar) avatar.textContent='?';
    const small=slot.querySelector('small'); if(small) small.textContent='Waiting…';
  }
}
function updateLobbySummary(){
  const el=$('#race-summary'); if(!el) return;
  const hard=config.hardMode?'<br><span class="hard-badge">🔥 HARD MODE</span>':'';
  el.innerHTML=`<b>${esc(subjectLabel())}</b>${hard}<br>${config.topics.map(esc).join(' • ')}<br>${config.count} questions • ${config.time?Math.round(config.time/60)+' min':'No timer'}`;
}
function normalizeIncomingConfig(incoming){
  const next={...config,...incoming};
  if(!SUBJECTS[next.subject]) next.subject='mathAA';
  if(!['SL','HL'].includes(next.level)) next.level='HL';
  next.hardMode=!!next.hardMode;
  const allowed=SUBJECTS[next.subject].topics;
  next.topics=Array.isArray(next.topics)?next.topics.filter(t=>allowed.includes(t)):[];
  if(!next.topics.length) next.topics=[...allowed];
  next.count=Math.max(1,Math.min(100,Number(next.count)||10));
  next.time=Math.max(0,Number(next.time)||0);
  return next;
}
function syncRoomState(room){
  if(!room){
    if(mode==='join'){
      show('join');
      if($('#join-error')){ $('#join-error').textContent='This room no longer exists.'; $('#join-error').classList.remove('hidden'); }
    }
    return;
  }

  if(room.config) config=normalizeIncomingConfig(room.config);
  if(Array.isArray(room.questions)) questions=room.questions;
  updateLobbySummary();

  const opp=room.players?.[oppKey()] || {};
  oppScore=Number(opp.score||0);
  if($('#screen-race')?.classList.contains('active') || $('#screen-results')?.classList.contains('active')) updateScores();
  if($('#screen-results')?.classList.contains('active')) refreshResultHeader();

  const opponentConnected=!!opp.connected;
  setOpponentReady(opponentConnected);
  if(mode==='host'){
    if($('#btn-start')){
      $('#btn-start').style.display='inline-block';
      $('#btn-start').disabled=!opponentConnected || room.status!=='lobby';
    }
    if(room.status==='lobby' && $('#lobby-title')) $('#lobby-title').textContent=opponentConnected?'Opponent connected':'Waiting for opponent';
  } else {
    if($('#btn-start')) $('#btn-start').style.display='none';
    if(room.status==='lobby'){
      if($('#lobby-title')) $('#lobby-title').textContent='Connected';
      if($('#lobby-note')) $('#lobby-note').textContent='Waiting for host to start the race.';
    }
  }

  const roundNo=Number(room.round||1);
  if(room.status==='started' && activeRound!==roundNo){ activeRound=roundNo; startRace(); }

  if(room.status==='lobby' && activeRound!==null && activeRound!==roundNo){
    activeRound=null; resetRace(); show('lobby');
    if($('#lobby-title')) $('#lobby-title').textContent=mode==='host'?(opponentConnected?'Opponent connected':'Waiting for opponent'):'Connected';
    if($('#lobby-note')) $('#lobby-note').textContent=mode==='host'?'Start when both players are ready.':'Waiting for host to start the race.';
  }
}

function resetRace(){
  qIndex=0; score=0; oppScore=0; answered=[]; streak=0; raceEnded=false; timeLeft=config.time;
  clearInterval(timerId); timerId=null; updateScores();
}
function startRace(){
  resetRace(); show('race');
  if($('#race-subject')) $('#race-subject').textContent=subjectLabel();
  if($('#race-mode-meta')) $('#race-mode-meta').innerHTML=`<span>${config.level}</span>${config.hardMode?'<span class="hard-badge">🔥 HARD</span>':''}<span id="streak-pill" class="streak-pill">⚡ 0 streak</span>`;
  if($('#timer')) $('#timer').textContent=config.time?prettyTime(timeLeft):'∞';
  renderQuestion();
  updateOwn({score:0,status:'Solving…',finished:false,connected:true}).catch(()=>{});
  if(config.time){
    timerId=setInterval(()=>{
      timeLeft--; if($('#timer')) $('#timer').textContent=prettyTime(timeLeft);
      if(timeLeft<=0){ clearInterval(timerId); endRace(); }
    },1000);
  }
}
function renderQuestion(){
  if(qIndex>=questions.length){ endRace(); return; }
  const cur=questions[qIndex];
  if($('#question-index')) $('#question-index').textContent=`${qIndex+1} / ${questions.length}`;
  if($('#race-topic')) $('#race-topic').textContent=cur.topic;
  if($('#q-topic')) $('#q-topic').textContent=cur.topic;
  if($('#q-prompt')) $('#q-prompt').textContent=cur.prompt;
  if($('#q-expression')) $('#q-expression').textContent=cur.expression||'';
  if($('#answer-input')){
    $('#answer-input').value='';
    $('#answer-input').disabled=false;
    $('#answer-input').placeholder=typeof cur.answer==='number'?'Enter answer…':'Enter answer / A–D…';
    $('#answer-input').focus();
  }
  if($('#feedback')) $('#feedback').className='feedback hidden';
  if($('#your-status')) $('#your-status').textContent='Solving…';
  updateOwn({status:`On Q${qIndex+1}`,score,finished:false}).catch(()=>{});
}
function markAnswer(raw){
  const cur=questions[qIndex];
  const ok=answerIsCorrect(cur,raw);
  let delta=0;
  if(ok){
    streak++;
    delta=config.hardMode?2:1;
    score+=delta;
  } else {
    streak=0;
    delta=config.hardMode?-1:0;
    score=Math.max(0,score+delta);
  }
  answered.push({q:qIndex+1,topic:cur.topic,ok,yours:raw,answer:cur.answer,delta});
  updateScores();
  updateOwn({score,status:ok?`Correct +${delta}`:(config.hardMode?'Wrong −1':'Submitted')}).catch(()=>{});

  const streakPill=$('#streak-pill'); if(streakPill) streakPill.textContent=`⚡ ${streak} streak`;
  const fb=$('#feedback');
  if(fb){
    fb.className='feedback '+(ok?'correct':'wrong');
    fb.textContent=ok ? `Correct ✓${config.hardMode?'  +2':''}` : `Not quite.${config.hardMode?' −1 point.':''} Correct answer: ${cur.answer}`;
  }
  if($('#answer-input')) $('#answer-input').disabled=true;
  if($('#your-status')) $('#your-status').textContent=ok?'Correct':'Submitted';
  setTimeout(()=>{ qIndex++; renderQuestion(); },650);
}
function updateScores(){
  if($('#your-score')) $('#your-score').textContent=score;
  if($('#opp-score')) $('#opp-score').textContent=oppScore;
  const max=Math.max(1,maxPossibleScore());
  if($('#your-progress')) $('#your-progress').style.width=`${Math.min(100,(score/max)*100)}%`;
  if($('#opp-progress')) $('#opp-progress').style.width=`${Math.min(100,(oppScore/max)*100)}%`;
  if($('#screen-results')?.classList.contains('active')){
    if($('#final-your-score')) $('#final-your-score').textContent=score;
    if($('#final-opp-score')) $('#final-opp-score').textContent=oppScore;
  }
}
function endRace(){
  if(raceEnded) return;
  raceEnded=true; clearInterval(timerId); timerId=null;
  updateOwn({score,status:'Finished',finished:true}).catch(()=>{});
  showResults();
}
function refreshResultHeader(){
  let title='Draw',icon='🤝',sub='Same score — rematch?';
  if(score>oppScore){ title='You win'; icon='🏆'; sub=`You scored ${score} point${score===1?'':'s'}.`; }
  if(score<oppScore){ title='Opponent leads'; icon='⚡'; sub=`You scored ${score} point${score===1?'':'s'}.`; }
  if($('#result-title')) $('#result-title').textContent=title;
  if($('#result-icon')) $('#result-icon').textContent=icon;
  if($('#result-sub')) $('#result-sub').textContent=sub;
}
function showResults(){
  show('results'); updateScores(); refreshResultHeader();
  if($('#review-list')){
    $('#review-list').innerHTML=answered.map(x=>`<div class="review-item"><span class="${x.ok?'ok':'no'}">${x.ok?'✓':'✕'}</span><span>Q${x.q} • ${esc(x.topic)}<br><small>Your answer: ${esc(x.yours||'—')}${config.hardMode?` • ${x.delta>0?'+':''}${x.delta} pt`:''}</small></span><b>${esc(x.answer)}</b></div>`).join('');
  }
  if($('#btn-rematch')) $('#btn-rematch').style.display=mode==='host'?'inline-block':'none';
}

/* --------------------------- events --------------------------- */
function bindEvents(){
  if($('#btn-create')) $('#btn-create').onclick=()=>{
    mode='host'; role='host';
    if($('#btn-start')) $('#btn-start').style.display='inline-block';
    buildSubjectPicker(); buildTopics(); syncToggleUI(); show('setup');
  };
  if($('#btn-join')) $('#btn-join').onclick=()=>{ mode='join'; role='guest'; show('join'); $('#join-code')?.focus(); };
  $$('[data-back]').forEach(b=>b.onclick=()=>show('home'));

  $('#level-toggle')?.addEventListener('click',e=>{
    const btn=e.target.closest('[data-level]'); if(!btn) return;
    config.level=btn.dataset.level; syncToggleUI();
  });
  $('#difficulty-toggle')?.addEventListener('click',e=>{
    const btn=e.target.closest('[data-hard]'); if(!btn) return;
    config.hardMode=btn.dataset.hard==='true'; syncToggleUI();
  });

  if($('#btn-host')) $('#btn-host').onclick=async()=>{
    $('#setup-error')?.classList.add('hidden');
    try{
      initFirebase(); syncTopics();
      config.count=Math.max(1,Math.min(100,Number($('#question-count')?.value)||10));
      config.time=Math.max(0,Number($('#race-time')?.value)||0);
      if(!config.topics.length) throw new Error('Select at least one topic.');
      makeQuestions();
      roomCode=await makeUniqueRoomCode();
      const ref=initFirebase().ref(`rooms/${roomCode}`);
      await ref.set({
        status:'lobby',round:1,createdAt:firebase.database.ServerValue.TIMESTAMP,
        config,questions,
        players:{host:{connected:true,score:0,status:'Ready',finished:false},guest:{connected:false,score:0,status:'Waiting',finished:false}}
      });
      await ref.child('players/host/connected').onDisconnect().set(false);
      if($('#room-code-value')) $('#room-code-value').textContent=roomCode;
      updateLobbySummary(); show('lobby');
      if($('#btn-start')) $('#btn-start').disabled=true;
      if($('#lobby-title')) $('#lobby-title').textContent='Waiting for opponent';
      if($('#lobby-note')) $('#lobby-note').textContent='Room is online. Share the code with your opponent.';
      attachRoom(roomCode);
    }catch(e){
      if($('#setup-error')){ $('#setup-error').textContent=firebaseErrorText(e); $('#setup-error').classList.remove('hidden'); }
    }
  };

  if($('#btn-connect')) $('#btn-connect').onclick=async()=>{
    $('#join-error')?.classList.add('hidden');
    const code=$('#join-code')?.value.trim().toUpperCase() || '';
    if(!/^[A-Z0-9]{6}$/.test(code)){
      if($('#join-error')){ $('#join-error').textContent='Enter the full 6-character room code.'; $('#join-error').classList.remove('hidden'); }
      return;
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
      if($('#room-code-value')) $('#room-code-value').textContent=code;
      if($('#btn-start')) $('#btn-start').style.display='none';
      show('lobby');
      if($('#lobby-title')) $('#lobby-title').textContent='Connected';
      if($('#lobby-note')) $('#lobby-note').textContent='Waiting for host to start the race.';
      attachRoom(code);
    }catch(e){
      show('join');
      if($('#join-error')){ $('#join-error').textContent=firebaseErrorText(e); $('#join-error').classList.remove('hidden'); }
    }
  };

  if($('#copy-code')) $('#copy-code').onclick=async()=>{
    try{
      await navigator.clipboard.writeText(roomCode);
      const small=$('#copy-code small');
      if(small){ small.textContent='copied!'; setTimeout(()=>small.textContent='click to copy',1200); }
    }catch{}
  };

  if($('#btn-start')) $('#btn-start').onclick=async()=>{
    if(mode!=='host' || !roomRef) return;
    try{
      const snap=await roomRef.once('value'); const room=snap.val();
      if(!room?.players?.guest?.connected) throw new Error('Opponent is not connected yet.');
      await roomRef.update({status:'started',startedAt:firebase.database.ServerValue.TIMESTAMP});
    }catch(e){ if($('#lobby-note')) $('#lobby-note').textContent=firebaseErrorText(e); }
  };

  if($('#answer-form')) $('#answer-form').onsubmit=e=>{
    e.preventDefault();
    if($('#answer-input')?.disabled) return;
    markAnswer($('#answer-input')?.value || '');
  };

  if($('#btn-rematch')) $('#btn-rematch').onclick=async()=>{
    if(mode!=='host' || !roomRef) return;
    try{
      makeQuestions();
      const snap=await roomRef.once('value'); const room=snap.val()||{}; const nextRound=Number(room.round||1)+1;
      await roomRef.update({
        status:'lobby',round:nextRound,questions,config,
        'players/host/score':0,'players/host/status':'Ready','players/host/finished':false,'players/host/connected':true,
        'players/guest/score':0,'players/guest/status':'Ready','players/guest/finished':false
      });
    }catch(e){ if($('#result-sub')) $('#result-sub').textContent=firebaseErrorText(e); }
  };

  if($('#btn-home')) $('#btn-home').onclick=async()=>{
    try{ await updateOwn({connected:false}); }catch{}
    detachRoom(); clearInterval(timerId); timerId=null; activeRound=null; show('home');
  };
}

/* =========================================================
   PRACTICE LAB — independent question bank + calculator
   IMPORTANT: Practice questions are generated only by
   generatePracticeQuestion(). Race questions continue to use
   generateQuestion(), so the two banks never share generators.
   ========================================================= */

const PRACTICE_CONFIG = {
  subject: 'mathAA',
  level: 'HL',
  topic: 'All topics',
  difficulty: 'mixed',
  count: 10
};

const practiceState = {
  active: false,
  questions: [],
  index: 0,
  correct: 0,
  attempted: 0,
  streak: 0,
  bestStreak: 0,
  startedAt: 0,
  elapsedTimer: null
};

function practiceQuestion(topic,difficulty,prompt,answer,options={}){
  return {
    bank: 'practice',
    topic,
    difficulty,
    prompt,
    expression: options.expression || '',
    answer,
    tolerance: options.tolerance || 0,
    aliases: options.aliases || [],
    choices: null,
    solution: options.solution || `Answer: ${answer}`,
    level: options.level || PRACTICE_CONFIG.level
  };
}

function practiceMCQ(topic,difficulty,prompt,choices,correctIndex,solution){
  const letters=['A','B','C','D'];
  return {
    bank: 'practice',
    topic,
    difficulty,
    prompt,
    expression: '',
    answer: letters[correctIndex],
    tolerance: 0,
    aliases: [choices[correctIndex]],
    choices: choices.map((text,i)=>({letter:letters[i],text})),
    solution: solution || `The correct option is ${letters[correctIndex]}.`,
    level: PRACTICE_CONFIG.level
  };
}

function practiceDifficultyValue(){
  if(PRACTICE_CONFIG.difficulty==='mixed') return rand(1,5);
  return Math.max(1,Math.min(5,Number(PRACTICE_CONFIG.difficulty)||3));
}

function practiceHL(){ return PRACTICE_CONFIG.level==='HL'; }

/* This is deliberately independent from the 1v1 race generators above. */
function generatePracticeQuestion(subject,topic,difficulty=practiceDifficultyValue()){
  const d=Math.max(1,Math.min(5,Number(difficulty)||3));
  switch(subject){
    case 'mathAA': return generatePracticeMathAA(topic,d);
    case 'mathAI': return generatePracticeMathAI(topic,d);
    case 'physics': return generatePracticePhysics(topic,d);
    case 'chemistry': return generatePracticeChemistry(topic,d);
    case 'biology': return generatePracticeBiology(topic,d);
    case 'economics': return generatePracticeEconomics(topic,d);
    case 'ess': return generatePracticeESS(topic,d);
    default: throw new Error(`Unknown practice subject: ${subject}`);
  }
}

function generatePracticeMathAA(topic,d){
  switch(topic){
    case 'Algebra': {
      if(d>=4){
        const r1=rand(-7,2), r2=rand(3,9);
        const sum=r1+r2, product=r1*r2;
        return practiceQuestion(topic,d,`The equation x² ${signed(-sum)}x ${signed(product)} = 0 has two real roots. Find the larger root.`,r2,{
          solution:`Factorise as (x ${signed(-r1)})(x ${signed(-r2)}) = 0. The roots are ${r1} and ${r2}, so the larger root is ${r2}.`
        });
      }
      const x=rand(-8,8), a=rand(2,8), b=rand(-12,12), rhs=a*x+b;
      return practiceQuestion(topic,d,`Solve ${a}x ${signed(b)} = ${rhs}.`,x,{solution:`Subtract ${b} and divide by ${a}: x = ${x}.`});
    }
    case 'Functions': {
      const a=rand(2,6), b=rand(-8,8), y=rand(-5,8), out=a*y+b;
      if(d>=4){
        return practiceQuestion(topic,d,`For f(x) = ${a}x ${signed(b)}, find f⁻¹(${out}).`,y,{solution:`Set ${out}=${a}x ${signed(b)} and solve. This gives x=${y}.`});
      }
      return practiceQuestion(topic,d,`For f(x) = ${a}x ${signed(b)}, find f(${y}).`,out,{solution:`Substitute x=${y}: f(${y})=${a}(${y}) ${signed(b)}=${out}.`});
    }
    case 'Trigonometry': {
      if(d>=4){
        const a=rand(4,14), b=rand(4,14), C=pick([30,45,60,75,90,120]);
        const c=Math.sqrt(a*a+b*b-2*a*b*Math.cos(C*Math.PI/180));
        const ans=round(c,2);
        return practiceQuestion(topic,d,`Two sides of a triangle are ${a} and ${b}, with included angle ${C}°. Find the third side to 2 d.p.`,ans,{tolerance:.011,solution:`Use the cosine rule: c²=${a}²+${b}²−2(${a})(${b})cos(${C}°). Hence c≈${ans}.`});
      }
      const opp=rand(3,12), hyp=opp+rand(2,10), ans=round(Math.asin(opp/hyp)*180/Math.PI,1);
      return practiceQuestion(topic,d,`In a right triangle, opposite = ${opp} and hypotenuse = ${hyp}. Find θ to 1 d.p.`,ans,{tolerance:.11,solution:`sin θ=${opp}/${hyp}. Therefore θ=sin⁻¹(${opp}/${hyp})≈${ans}°.`});
    }
    case 'Calculus': {
      const a=rand(2,7), n=rand(2,5), x=rand(1,4);
      if(d>=4){
        const b=rand(-5,5), ans=a*n*(x**(n-1))+2*b*x;
        return practiceQuestion(topic,d,`Given f(x)=${a}x^${n} ${signed(b)}x², find f′(${x}).`,ans,{solution:`f′(x)=${a*n}x^${n-1} ${signed(2*b)}x. Substituting x=${x} gives ${ans}.`});
      }
      const ans=a*n*(x**(n-1));
      return practiceQuestion(topic,d,`Given f(x)=${a}x^${n}, find f′(${x}).`,ans,{solution:`f′(x)=${a*n}x^${n-1}; at x=${x}, f′=${ans}.`});
    }
    case 'Vectors': {
      const ax=rand(-6,6), ay=rand(-6,6), bx=rand(-6,6), by=rand(-6,6);
      if(d>=4){
        const dot=ax*bx+ay*by;
        return practiceQuestion(topic,d,`Find a·b for a=⟨${ax},${ay}⟩ and b=⟨${bx},${by}⟩.`,dot,{solution:`a·b=(${ax})(${bx})+(${ay})(${by})=${dot}.`});
      }
      const ans=round(Math.sqrt(ax*ax+ay*ay),2);
      return practiceQuestion(topic,d,`Find |a| for a=⟨${ax},${ay}⟩ to 2 d.p.`,ans,{tolerance:.011,solution:`|a|=√(${ax}²+${ay}²)≈${ans}.`});
    }
    case 'Probability & Statistics': {
      if(d>=4 || practiceHL()){
        const n=rand(4,8), p=pick([0.2,0.25,0.3,0.4,0.5,0.6]), k=rand(1,n-1);
        const comb=factorial(n)/(factorial(k)*factorial(n-k));
        const ans=round(comb*(p**k)*((1-p)**(n-k)),4);
        return practiceQuestion(topic,d,`X ~ B(${n}, ${p}). Find P(X=${k}) to 4 d.p.`,ans,{tolerance:.00011,solution:`P(X=${k}) = C(${n},${k})(${p})^${k}(${round(1-p,2)})^${n-k} ≈ ${ans}.`});
      }
      const red=rand(2,9), blue=rand(2,9), ans=round(red/(red+blue),3);
      return practiceQuestion(topic,d,`A bag contains ${red} red and ${blue} blue counters. Find P(red) to 3 d.p.`,ans,{tolerance:.0011,solution:`P(red)=${red}/${red+blue}≈${ans}.`});
    }
    default: throw new Error(`Unknown Math AA practice topic: ${topic}`);
  }
}

function generatePracticeMathAI(topic,d){
  switch(topic){
    case 'Number & Algebra': {
      const principal=rand(2,15)*1000, rate=pick([2,3,4,5,6,7])/100, years=rand(2,8);
      const ans=round(principal*((1+rate)**years),2);
      return practiceQuestion(topic,d,`€${principal} is invested at ${rate*100}% compound interest for ${years} years. Find the final value to 2 d.p.`,ans,{tolerance:.011,solution:`A=P(1+r)^n=${principal}(1+${rate})^${years}≈€${ans}.`});
    }
    case 'Functions': {
      const m=rand(-5,8), c=rand(-10,10), x=rand(-6,8), ans=m*x+c;
      return practiceQuestion(topic,d,`A model is y=${m}x ${signed(c)}. Find y when x=${x}.`,ans,{solution:`Substitute x=${x}: y=${m}(${x}) ${signed(c)}=${ans}.`});
    }
    case 'Geometry & Trigonometry': {
      const r=rand(3,14), angle=pick([30,45,60,90,120,150]);
      if(d>=4){
        const ans=round((angle/360)*2*Math.PI*r,2);
        return practiceQuestion(topic,d,`Find the arc length of a sector with radius ${r} and angle ${angle}°, to 2 d.p.`,ans,{tolerance:.011,solution:`Arc length=(${angle}/360)·2π·${r}≈${ans}.`});
      }
      const ans=round((angle/360)*Math.PI*r*r,2);
      return practiceQuestion(topic,d,`Find the area of a sector with radius ${r} and angle ${angle}°, to 2 d.p.`,ans,{tolerance:.011,solution:`Area=(${angle}/360)π(${r})²≈${ans}.`});
    }
    case 'Statistics & Probability': {
      const vals=Array.from({length:d>=4?7:5},()=>rand(2,24)).sort((a,b)=>a-b);
      if(d>=4){
        const mean=vals.reduce((s,v)=>s+v,0)/vals.length;
        const variance=vals.reduce((s,v)=>s+(v-mean)**2,0)/vals.length;
        const ans=round(Math.sqrt(variance),2);
        return practiceQuestion(topic,d,`Find the population standard deviation of ${vals.join(', ')} to 2 d.p.`,ans,{tolerance:.011,solution:`Using σ=√(Σ(x−μ)²/n), the population standard deviation is ${ans}.`});
      }
      const ans=vals[Math.floor(vals.length/2)];
      return practiceQuestion(topic,d,`Find the median of ${vals.join(', ')}.`,ans,{solution:`The ordered middle value is ${ans}.`});
    }
    case 'Calculus': {
      const a=rand(1,6), b=rand(-8,8), x=rand(1,6), ans=2*a*x+b;
      return practiceQuestion(topic,d,`For C(x)=${a}x² ${signed(b)}x + ${rand(1,10)}, find C′(${x}).`,ans,{solution:`C′(x)=${2*a}x ${signed(b)}. At x=${x}, C′=${ans}.`});
    }
    case 'Financial Mathematics': {
      const future=rand(5,25)*1000, r=pick([2,3,4,5,6])/100, n=rand(2,8);
      const ans=round(future/((1+r)**n),2);
      return practiceQuestion(topic,d,`Find the present value of €${future} due in ${n} years at ${r*100}% annual interest, to 2 d.p.`,ans,{tolerance:.011,solution:`PV=FV/(1+r)^n=${future}/(1+${r})^${n}≈€${ans}.`});
    }
    default: throw new Error(`Unknown Math AI practice topic: ${topic}`);
  }
}

function generatePracticePhysics(topic,d){
  switch(topic){
    case 'Mechanics': {
      if(d>=4){
        const u=rand(1,12), a=rand(2,6), t=rand(2,7), ans=u*t+0.5*a*t*t;
        return practiceQuestion(topic,d,`An object starts at ${u} m s⁻¹ and accelerates uniformly at ${a} m s⁻² for ${t} s. Find its displacement in m.`,ans,{solution:`s=ut+½at²=${u}(${t})+½(${a})(${t}²)=${ans} m.`});
      }
      const m=rand(2,20), v=rand(2,12), ans=.5*m*v*v;
      return practiceQuestion(topic,d,`A ${m} kg object moves at ${v} m s⁻¹. Find its kinetic energy in J.`,ans,{solution:`Eₖ=½mv²=½(${m})(${v}²)=${ans} J.`});
    }
    case 'Waves': {
      const f=rand(2,20)*10, lambda=pick([0.2,0.25,0.4,0.5,0.75,1.2]);
      const ans=round(f*lambda,2);
      return practiceQuestion(topic,d,`A wave has frequency ${f} Hz and wavelength ${lambda} m. Find its speed in m s⁻¹.`,ans,{tolerance:.011,solution:`v=fλ=${f}×${lambda}=${ans} m s⁻¹.`});
    }
    case 'Fields': {
      if(d>=4 || practiceHL()){
        const m=rand(2,12), r=rand(2,8), g=round(6.67e-11*5.97e24/((r*1e6)**2),3);
        const ans=round(m*g,3);
        return practiceQuestion(topic,d,`At a point ${r}×10⁶ m from Earth's centre, take Earth mass as 5.97×10²⁴ kg. Find the gravitational force on a ${m} kg mass. Use G=6.67×10⁻¹¹.`,ans,{tolerance:.002,solution:`g=GM/r²≈${g} N kg⁻¹, so F=mg≈${ans} N.`});
      }
      const qv=rand(2,12), E=rand(2,20), ans=qv*E;
      return practiceQuestion(topic,d,`A ${qv} C charge is in an electric field of ${E} N C⁻¹. Find the force in N.`,ans,{solution:`F=qE=${qv}×${E}=${ans} N.`});
    }
    case 'Electricity': {
      if(d>=4){
        const r1=rand(3,15), r2=rand(3,15), V=rand(6,24);
        const req=(r1*r2)/(r1+r2), ans=round(V/req,3);
        return practiceQuestion(topic,d,`${r1} Ω and ${r2} Ω resistors are in parallel across ${V} V. Find total current to 3 d.p.`,ans,{tolerance:.0011,solution:`R_eq=(${r1}×${r2})/(${r1}+${r2})≈${round(req,3)} Ω; I=V/R≈${ans} A.`});
      }
      const V=rand(4,24), I=pick([0.5,1,1.5,2,2.5,3]), ans=round(V/I,2);
      return practiceQuestion(topic,d,`A component has ${V} V across it and current ${I} A. Find resistance in Ω.`,ans,{tolerance:.011,solution:`R=V/I=${V}/${I}=${ans} Ω.`});
    }
    case 'Thermal': {
      const m=rand(1,4), c=pick([420,900,2100,4200]), dt=rand(5,40), ans=m*c*dt;
      return practiceQuestion(topic,d,`${m} kg of material with c=${c} J kg⁻¹ K⁻¹ warms by ${dt} K. Find energy transferred in J.`,ans,{solution:`Q=mcΔT=${m}×${c}×${dt}=${ans} J.`});
    }
    case 'Nuclear': {
      const initial=rand(2,15)*100, halves=rand(1,d>=4?6:4), ans=round(initial*(0.5**halves),3);
      return practiceQuestion(topic,d,`A source starts at ${initial} Bq. What is its activity after ${halves} half-lives?`,ans,{tolerance:.002,solution:`A=A₀(½)^n=${initial}(½)^${halves}=${ans} Bq.`});
    }
    default: throw new Error(`Unknown Physics practice topic: ${topic}`);
  }
}

function generatePracticeChemistry(topic,d){
  switch(topic){
    case 'Stoichiometry': {
      if(d>=4){
        const c=pick([0.1,0.2,0.25,0.5,0.75]), v=pick([20,25,40,50,100])/1000;
        const ans=round(c*v,4);
        return practiceQuestion(topic,d,`${Math.round(v*1000)} cm³ of a ${c} mol dm⁻³ solution is used. Find the amount of solute in mol.`,ans,{tolerance:.00011,solution:`n=cV=${c}×${v}=${ans} mol (volume converted to dm³).`});
      }
      const n=pick([0.1,0.2,0.25,0.5,0.75]), mr=rand(20,160), ans=round(n*mr,2);
      return practiceQuestion(topic,d,`Find the mass of ${n} mol of a substance with Mᵣ=${mr}.`,ans,{tolerance:.011,solution:`m=nM=${n}×${mr}=${ans} g.`});
    }
    case 'Atomic Structure': {
      const z=rand(3,20), neutrons=rand(3,24), charge=pick([-1,0,1,2]);
      const electrons=z-charge;
      return practiceQuestion(topic,d,`An ion has ${z} protons, ${neutrons} neutrons and charge ${charge>=0?'+':''}${charge}. How many electrons does it have?`,electrons,{solution:`Charge = protons − electrons, so electrons=${z}−(${charge})=${electrons}.`});
    }
    case 'Bonding':
      return practiceMCQ(topic,d,'Which substance can form hydrogen bonds between its molecules?',['CH₄','H₂O','CO₂','Cl₂'],1,'Hydrogen bonding occurs when H is covalently bonded to a highly electronegative atom such as O, N or F.');
    case 'Energetics': {
      const broken=rand(300,900), formed=rand(300,1000), ans=broken-formed;
      return practiceQuestion(topic,d,`Bond breaking requires ${broken} kJ mol⁻¹ and bond formation releases ${formed} kJ mol⁻¹. Estimate ΔH.`,ans,{solution:`ΔH=ΣE(bonds broken)−ΣE(bonds formed)=${broken}−${formed}=${ans} kJ mol⁻¹.`});
    }
    case 'Kinetics': {
      if(d>=4){
        const factor=pick([2,3]); const rateFactor=factor**2;
        return practiceQuestion(topic,d,`Increasing [A] by a factor of ${factor} increases rate by a factor of ${rateFactor}. Find the order with respect to A.`,2,{solution:`rate ∝ [A]^n, so ${factor}^n=${rateFactor}; n=2.`});
      }
      return practiceMCQ(topic,d,'Which change increases reaction rate but does not change the equilibrium position?',['Adding a catalyst','Lowering temperature','Removing reactant','Increasing product concentration'],0,'A catalyst lowers activation energy for both forward and reverse reactions equally, changing rate but not equilibrium position.');
    }
    case 'Equilibrium': {
      const a=pick([0.2,0.25,0.4,0.5,0.8]), ratio=rand(2,6), b=round(a*ratio,2), ans=round(b/a,3);
      return practiceQuestion(topic,d,`For A ⇌ B, [A]=${a} mol dm⁻³ and [B]=${b} mol dm⁻³ at equilibrium. Find Kc=[B]/[A].`,ans,{tolerance:.002,solution:`Kc=${b}/${a}=${ans}.`});
    }
    case 'Acids & Bases': {
      if(d>=4 || practiceHL()){
        const pH=rand(1,5), ans=10**(-pH);
        return practiceQuestion(topic,d,`A solution has pH ${pH}. Find [H⁺] in mol dm⁻³.`,ans,{tolerance:Math.max(1e-12,ans*.002),solution:`[H⁺]=10^(−pH)=10^−${pH}=${ans}.`});
      }
      const pH=rand(1,6);
      return practiceQuestion(topic,d,`A solution has [H⁺]=1×10⁻${pH} mol dm⁻³. Find its pH.`,pH,{solution:`pH=−log₁₀[H⁺]=${pH}.`});
    }
    case 'Redox':
      return practiceMCQ(topic,d,'Oxidation is best defined as…',['gain of electrons','loss of electrons','gain of protons','loss of neutrons'],1,'Oxidation is loss of electrons; reduction is gain of electrons.');
    case 'Organic':
      return practiceMCQ(topic,d,'Which functional group is present in a carboxylic acid?',['–OH only','–CHO','–COOH','–NH₂'],2,'Carboxylic acids contain the –COOH functional group.');
    default: throw new Error(`Unknown Chemistry practice topic: ${topic}`);
  }
}

function generatePracticeBiology(topic,d){
  switch(topic){
    case 'Cell Biology':
      return practiceMCQ(topic,d,'Which organelle is the main site of aerobic respiration in eukaryotic cells?',['Ribosome','Mitochondrion','Golgi apparatus','Lysosome'],1,'Aerobic respiration is primarily carried out in mitochondria.');
    case 'Molecular Biology':
      return practiceMCQ(topic,d,'During DNA replication, which enzyme separates the two DNA strands?',['DNA ligase','Helicase','RNA polymerase','Peptidase'],1,'Helicase unwinds the double helix and separates the strands by breaking hydrogen bonds.');
    case 'Genetics': {
      const pct=d>=4?25:50;
      const cross=d>=4?'Aa × Aa':'Aa × aa';
      return practiceQuestion(topic,d,`For the cross ${cross}, what percentage of offspring are expected to have genotype aa?`,pct,{aliases:[`${pct}%`],solution:d>=4?'Aa × Aa gives AA:Aa:aa in a 1:2:1 ratio, so aa=25%.':'Aa × aa gives Aa and aa in a 1:1 ratio, so aa=50%.'});
    }
    case 'Metabolism':
      return practiceMCQ(topic,d,'Which molecule directly transfers usable chemical energy in cells?',['ATP','DNA','Cellulose','Oxygen'],0,'ATP is the immediate energy-transfer molecule used by cells.');
    case 'Ecology': {
      const first=rand(20,80), second=rand(20,80), rec=rand(5,Math.min(first,second)), ans=round(first*second/rec,1);
      return practiceQuestion(topic,d,`Mark–recapture: ${first} are marked first; later ${second} are caught and ${rec} are marked. Estimate population size to 1 d.p.`,ans,{tolerance:.11,solution:`N≈(first catch × second catch)/recaptured = ${first}×${second}/${rec}≈${ans}.`});
    }
    case 'Evolution':
      return practiceMCQ(topic,d,'Which condition is required for natural selection to cause evolutionary change?',['No variation','Heritable variation affecting reproductive success','Identical survival of all phenotypes','No reproduction'],1,'Natural selection requires heritable variation associated with differences in survival or reproduction.');
    case 'Human Physiology':
      return d>=4
        ? practiceMCQ(topic,d,'Where does ultrafiltration occur in a nephron?',['Collecting duct','Loop of Henle','Glomerulus into Bowman’s capsule','Distal convoluted tubule'],2,'High hydrostatic pressure in the glomerulus drives ultrafiltration into Bowman’s capsule.')
        : practiceMCQ(topic,d,'Which chamber pumps oxygenated blood into the aorta?',['Right atrium','Right ventricle','Left atrium','Left ventricle'],3,'The left ventricle pumps oxygenated blood into the systemic circulation through the aorta.');
    default: throw new Error(`Unknown Biology practice topic: ${topic}`);
  }
}

function generatePracticeEconomics(topic,d){
  switch(topic){
    case 'Microeconomics': {
      if(d>=4 || practiceHL()){
        const q1=rand(90,150), q2=rand(45,85), p1=rand(5,12), p2=p1+rand(2,6);
        const ped=((q2-q1)/((q1+q2)/2))/((p2-p1)/((p1+p2)/2));
        const ans=round(ped,2);
        return practiceQuestion(topic,d,`Price rises from €${p1} to €${p2}; quantity demanded falls from ${q1} to ${q2}. Using the midpoint method, calculate PED to 2 d.p.`,ans,{tolerance:.011,solution:`PED=(%ΔQ using midpoint)/(%ΔP using midpoint)≈${ans}.`});
      }
      const q=rand(20,100), p=rand(2,15), ans=q*p;
      return practiceQuestion(topic,d,`A firm sells ${q} units at €${p} each. Calculate total revenue.`,ans,{solution:`TR=P×Q=${p}×${q}=€${ans}.`});
    }
    case 'Macroeconomics': {
      const nominal=rand(200,900), deflator=pick([90,95,100,105,110,120]), ans=round(nominal/(deflator/100),2);
      return practiceQuestion(topic,d,`Nominal GDP is ${nominal} billion and the GDP deflator is ${deflator}. Calculate real GDP to 2 d.p.`,ans,{tolerance:.011,solution:`Real GDP=nominal GDP/(deflator/100)=${nominal}/${deflator/100}≈${ans} billion.`});
    }
    case 'Global Economy': {
      const old=pick([1.05,1.1,1.2,1.25]), factor=pick([0.85,0.9,1.1,1.15]), now=round(old*factor,2);
      const appreciated=now>old;
      return practiceMCQ(topic,d,`The rate changes from €1 = $${old} to €1 = $${now}. The euro has…`,appreciated?['appreciated','depreciated','caused a tariff','become inflationary']:['depreciated','appreciated','become a quota','caused deflation'],0,appreciated?'One euro now buys more US dollars, so the euro appreciated against the dollar.':'One euro now buys fewer US dollars, so the euro depreciated against the dollar.');
    }
    case 'Development':
      return practiceMCQ(topic,d,'Which is one of the dimensions used in the Human Development Index?',['Military expenditure','Health/life expectancy','Current-account balance','Interest rate'],1,'HDI combines health, education and income dimensions.');
    default: throw new Error(`Unknown Economics practice topic: ${topic}`);
  }
}

function generatePracticeESS(topic,d){
  switch(topic){
    case 'Ecosystems': {
      const input=rand(600,2000), output=rand(40,240), ans=round(100*output/input,1);
      return practiceQuestion(topic,d,`A trophic level receives ${input} kJ m⁻² yr⁻¹ and passes ${output} kJ m⁻² yr⁻¹ onward. Calculate ecological efficiency to 1 d.p.`,ans,{tolerance:.11,aliases:[`${ans}%`],solution:`Efficiency=(output/input)×100=(${output}/${input})×100≈${ans}%.`});
    }
    case 'Biodiversity':
      return practiceMCQ(topic,d,'Which change would normally increase biodiversity in a habitat?',['Greater habitat variety','Removal of all decomposers','Elimination of genetic variation','Complete monoculture'],0,'Greater habitat variety creates more niches and can support more species.');
    case 'Pollution':
      return practiceMCQ(topic,d,'Which input is most directly associated with freshwater eutrophication?',['Nitrates and phosphates','CFCs','Carbon monoxide only','Sand'],0,'Nitrate and phosphate enrichment can stimulate algal blooms and eutrophication.');
    case 'Climate Change': {
      const base=rand(100,600), pct=rand(5,35), ans=round(base*(1-pct/100),2);
      return practiceQuestion(topic,d,`Emissions of ${base} Mt are reduced by ${pct}%. Calculate the new annual emissions.`,ans,{tolerance:.011,solution:`New value=${base}(1−${pct}/100)=${ans} Mt.`});
    }
    case 'Water & Food': {
      const recharge=rand(150,800), use=rand(200,900), ans=recharge-use;
      return practiceQuestion(topic,d,`An aquifer receives ${recharge} million m³ yr⁻¹ and withdrawals are ${use} million m³ yr⁻¹. Calculate net storage change (recharge − withdrawal).`,ans,{solution:`Net change=${recharge}−${use}=${ans} million m³ yr⁻¹.`});
    }
    case 'Energy & Resources': {
      const input=rand(100,1200), eff=pick([20,25,30,35,40,45,50])/100, ans=round(input*eff,2);
      return practiceQuestion(topic,d,`An energy system receives ${input} MJ at ${eff*100}% efficiency. Calculate useful output energy.`,ans,{tolerance:.011,solution:`Useful output=${input}×${eff}=${ans} MJ.`});
    }
    case 'Sustainability':
      return practiceMCQ(topic,d,'Which action best fits a circular-economy model?',['Designing products for repair and reuse','Maximising single-use materials','Landfilling reusable products','Increasing virgin-resource extraction'],0,'Circular-economy strategies keep products and materials in use through durability, repair, reuse and recycling.');
    default: throw new Error(`Unknown ESS practice topic: ${topic}`);
  }
}

function injectPracticeStyles(){
  if($('#ibrace-practice-styles')) return;
  const style=document.createElement('style');
  style.id='ibrace-practice-styles';
  style.textContent=`
    #screen-practice{max-width:1180px!important;width:min(1180px,96vw)!important;margin:0 auto!important;padding:18px!important}
    .practice-topbar{display:flex;align-items:center;gap:12px;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap}
    .practice-topbar-left{display:flex;align-items:center;gap:10px;min-width:0}.practice-title{font-weight:900;font-size:1.25rem}.practice-subtitle{opacity:.65;font-size:.82rem}
    .practice-layout{display:grid;grid-template-columns:minmax(230px,280px) minmax(0,1fr);gap:18px;align-items:start}
    .practice-sidebar,.practice-main-card,.practice-summary-card{border:1px solid rgba(127,127,127,.22);border-radius:18px;background:rgba(127,127,127,.045)}
    .practice-sidebar{padding:16px;position:sticky;top:12px}.practice-main-card{padding:22px;min-height:500px}
    .practice-section-label{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;font-weight:900;opacity:.6;margin:14px 0 7px}.practice-section-label:first-child{margin-top:0}
    .practice-select{width:100%;min-height:42px;border-radius:10px;border:1px solid rgba(127,127,127,.28);background:transparent;color:inherit;padding:8px 10px;font:inherit}
    .practice-levels{display:grid;grid-template-columns:1fr 1fr;gap:7px}.practice-levels button,.practice-topic-grid button{border:1px solid rgba(127,127,127,.24);background:transparent;color:inherit;border-radius:10px;min-height:40px;padding:7px 8px;font:inherit;cursor:pointer}
    .practice-levels button.selected,.practice-topic-grid button.selected{background:var(--accent,#7357ff);color:#fff;border-color:transparent}
    .practice-topic-grid{display:grid;grid-template-columns:1fr;gap:6px;max-height:220px;overflow:auto;padding-right:2px}.practice-topic-grid button{text-align:left;font-size:.85rem}
    .practice-start{width:100%;margin-top:15px;min-height:46px;border:0;border-radius:12px;background:var(--accent,#7357ff);color:#fff;font-weight:900;cursor:pointer}
    .practice-session-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-bottom:15px;border-bottom:1px solid rgba(127,127,127,.18)}
    .practice-tags{display:flex;gap:7px;flex-wrap:wrap}.practice-tag{font-size:.75rem;font-weight:800;border:1px solid rgba(127,127,127,.22);padding:5px 9px;border-radius:999px;opacity:.85}
    .practice-stats{display:flex;gap:14px;flex-wrap:wrap;font-size:.8rem}.practice-stats b{font-size:1rem}
    .practice-question-number{margin-top:20px;font-size:.78rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;opacity:.55}
    .practice-prompt{font-size:1.18rem;line-height:1.55;font-weight:750;margin:12px 0}.practice-expression{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:1.05rem;line-height:1.6;padding:13px 15px;border-radius:12px;background:rgba(127,127,127,.08);white-space:pre-wrap;margin-bottom:16px}
    .practice-choices{display:grid;gap:9px;margin:15px 0}.practice-choice{display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:center;text-align:left;min-height:48px;padding:8px 11px;border:1px solid rgba(127,127,127,.25);background:transparent;color:inherit;border-radius:12px;font:inherit;cursor:pointer}.practice-choice .letter{font-weight:900;opacity:.7}.practice-choice.selected{border-color:var(--accent,#7357ff);box-shadow:inset 0 0 0 1px var(--accent,#7357ff)}.practice-choice.correct{border-color:#2e9b61;background:rgba(46,155,97,.1)}.practice-choice.wrong{border-color:#c85151;background:rgba(200,81,81,.1)}
    .practice-answer-row{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}.practice-answer-input{flex:1;min-width:180px;min-height:46px;border-radius:11px;border:1px solid rgba(127,127,127,.28);background:transparent;color:inherit;padding:9px 12px;font:inherit;font-size:1rem}.practice-primary,.practice-secondary{min-height:44px;border-radius:11px;padding:8px 15px;font-weight:850;cursor:pointer}.practice-primary{border:0;background:var(--accent,#7357ff);color:#fff}.practice-secondary{border:1px solid rgba(127,127,127,.28);background:transparent;color:inherit}
    .practice-feedback{margin-top:16px;padding:14px 15px;border-radius:13px;line-height:1.5}.practice-feedback.correct{background:rgba(46,155,97,.11);border:1px solid rgba(46,155,97,.34)}.practice-feedback.wrong{background:rgba(200,81,81,.1);border:1px solid rgba(200,81,81,.3)}.practice-feedback strong{display:block;margin-bottom:5px}
    .practice-nav-wrap{margin-top:22px;padding-top:16px;border-top:1px solid rgba(127,127,127,.18)}.practice-nav{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.practice-nav button{width:36px;height:36px;border-radius:9px;border:1px solid rgba(127,127,127,.22);background:transparent;color:inherit;font-weight:800;cursor:pointer}.practice-nav button.current{outline:2px solid var(--accent,#7357ff);outline-offset:1px}.practice-nav button.done{background:rgba(46,155,97,.12)}.practice-nav button.wrong{background:rgba(200,81,81,.11)}.practice-nav button.flagged::after{content:'•';color:#e0a31a;position:absolute}.practice-nav button{position:relative}
    .practice-empty{display:grid;place-items:center;min-height:420px;text-align:center;padding:30px}.practice-empty-icon{font-size:2.4rem;margin-bottom:10px}.practice-empty h2{margin:0 0 8px}.practice-empty p{max-width:520px;opacity:.7;line-height:1.5}
    .practice-summary-card{padding:24px;text-align:center}.practice-summary-score{font-size:3rem;font-weight:950;line-height:1}.practice-summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:20px 0}.practice-summary-grid>div{padding:14px;border-radius:12px;background:rgba(127,127,127,.07)}.practice-summary-grid b{display:block;font-size:1.2rem}
    .practice-home-btn{display:inline-flex!important;align-items:center;justify-content:center;gap:8px}.practice-tools{display:flex;gap:8px;flex-wrap:wrap}
    .calc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px}.calc-overlay.open{display:flex}.calc-panel{width:min(360px,96vw);border-radius:18px;background:#17171b;color:#f7f7f8;border:1px solid #35353d;padding:14px;box-shadow:0 20px 70px rgba(0,0,0,.35)}.calc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.calc-title{font-weight:900}.calc-close,.calc-mode{border:1px solid #41414a;background:#24242b;color:#fff;border-radius:9px;min-height:36px;padding:6px 10px;cursor:pointer}.calc-display{min-height:78px;border-radius:12px;background:#0f0f12;border:1px solid #303038;padding:11px;margin-bottom:10px;text-align:right;overflow:hidden}.calc-expression{font-family:ui-monospace,monospace;font-size:.9rem;opacity:.6;min-height:21px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.calc-result{font-family:ui-monospace,monospace;font-size:1.55rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.calc-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.calc-key{min-height:44px;border:1px solid #383842;background:#25252c;color:#fff;border-radius:10px;font-size:.95rem;font-weight:750;cursor:pointer}.calc-key.op{background:#31313b}.calc-key.equals{background:#6d55e8;border-color:#6d55e8}.calc-key.wide{grid-column:span 2}
    @media(max-width:760px){#screen-practice{width:100%!important;padding:10px!important}.practice-layout{grid-template-columns:1fr}.practice-sidebar{position:static}.practice-main-card{padding:16px;min-height:420px}.practice-topic-grid{grid-template-columns:repeat(2,minmax(0,1fr));max-height:none}.practice-summary-grid{grid-template-columns:1fr}.practice-stats{gap:9px}.practice-answer-row>*{width:100%}}
  `;
  document.head.appendChild(style);
}

function ensurePracticeUI(){
  if(!$('#screen-practice')){
    const screen=document.createElement('section');
    screen.id='screen-practice';
    screen.className='screen';
    screen.innerHTML=`
      <div class="practice-topbar">
        <div class="practice-topbar-left">
          <button type="button" id="practice-back" class="practice-secondary">← Home</button>
          <div><div class="practice-title">Practice Lab</div><div class="practice-subtitle">Independent practice bank — separate from 1v1 races</div></div>
        </div>
        <div class="practice-tools">
          <button type="button" id="practice-calculator-btn" class="practice-secondary">⌨ Calculator</button>
          <button type="button" id="practice-finish" class="practice-secondary" style="display:none">Finish session</button>
        </div>
      </div>
      <div class="practice-layout">
        <aside class="practice-sidebar">
          <div class="practice-section-label">Subject</div>
          <select id="practice-subject" class="practice-select"></select>
          <div class="practice-section-label">Level</div>
          <div class="practice-levels" id="practice-levels"><button type="button" data-level="SL">SL</button><button type="button" data-level="HL">HL</button></div>
          <div class="practice-section-label">Difficulty</div>
          <select id="practice-difficulty" class="practice-select"><option value="mixed">Mixed 1–5</option><option value="1">1 — Foundation</option><option value="2">2 — Standard</option><option value="3">3 — Challenging</option><option value="4">4 — Hard</option><option value="5">5 — Brutal</option></select>
          <div class="practice-section-label">Questions</div>
          <select id="practice-count" class="practice-select"><option value="5">5</option><option value="10" selected>10</option><option value="20">20</option><option value="30">30</option></select>
          <div class="practice-section-label">Topic</div>
          <div id="practice-topics" class="practice-topic-grid"></div>
          <button type="button" id="practice-start" class="practice-start">Start practice</button>
        </aside>
        <main id="practice-workspace" class="practice-main-card"></main>
      </div>`;
    document.body.appendChild(screen);
  }

  if(!$('#btn-practice') && $('#btn-create')){
    const b=document.createElement('button');
    b.id='btn-practice'; b.type='button';
    b.className=($('#btn-create').className||'')+' practice-home-btn';
    b.innerHTML='<span>◎</span><span>Practice questions</span>';
    $('#btn-create').insertAdjacentElement('afterend',b);
  }

  if(!$('#race-calculator-btn') && $('#timer')){
    const b=document.createElement('button');
    b.id='race-calculator-btn'; b.type='button'; b.className='practice-secondary'; b.textContent='⌨ Calculator';
    $('#timer').insertAdjacentElement('afterend',b);
  }

  if(!$('#calculator-overlay')){
    const overlay=document.createElement('div');
    overlay.id='calculator-overlay'; overlay.className='calc-overlay';
    overlay.innerHTML=`
      <div class="calc-panel" role="dialog" aria-modal="true" aria-label="Scientific calculator">
        <div class="calc-head"><div class="calc-title">Calculator</div><div><button type="button" id="calc-mode" class="calc-mode">DEG</button> <button type="button" id="calc-close" class="calc-close">✕</button></div></div>
        <div class="calc-display"><div id="calc-expression" class="calc-expression">0</div><div id="calc-result" class="calc-result">0</div></div>
        <div class="calc-grid" id="calc-grid">
          <button class="calc-key op" data-token="sin(">sin</button><button class="calc-key op" data-token="cos(">cos</button><button class="calc-key op" data-token="tan(">tan</button><button class="calc-key op" data-token="sqrt(">√</button><button class="calc-key op" data-action="clear">AC</button>
          <button class="calc-key op" data-token="ln(">ln</button><button class="calc-key op" data-token="log(">log</button><button class="calc-key op" data-token="^">xʸ</button><button class="calc-key op" data-token="(">(</button><button class="calc-key op" data-token=")">)</button>
          <button class="calc-key" data-token="7">7</button><button class="calc-key" data-token="8">8</button><button class="calc-key" data-token="9">9</button><button class="calc-key op" data-token="/">÷</button><button class="calc-key op" data-action="back">⌫</button>
          <button class="calc-key" data-token="4">4</button><button class="calc-key" data-token="5">5</button><button class="calc-key" data-token="6">6</button><button class="calc-key op" data-token="*">×</button><button class="calc-key op" data-token="pi">π</button>
          <button class="calc-key" data-token="1">1</button><button class="calc-key" data-token="2">2</button><button class="calc-key" data-token="3">3</button><button class="calc-key op" data-token="-">−</button><button class="calc-key op" data-token="e">e</button>
          <button class="calc-key wide" data-token="0">0</button><button class="calc-key" data-token=".">.</button><button class="calc-key op" data-token="+">+</button><button class="calc-key equals" data-action="equals">=</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  populatePracticeSubjects();
  renderPracticeTopics();
  syncPracticeFilters();
  renderPracticeEmpty();
}

function populatePracticeSubjects(){
  const select=$('#practice-subject'); if(!select) return;
  select.innerHTML=Object.entries(SUBJECTS).map(([key,s])=>`<option value="${key}">${esc(s.short)}</option>`).join('');
  select.value=PRACTICE_CONFIG.subject;
}

function renderPracticeTopics(){
  const box=$('#practice-topics'); if(!box) return;
  const topics=SUBJECTS[PRACTICE_CONFIG.subject]?.topics || [];
  const all=['All topics',...topics];
  if(!all.includes(PRACTICE_CONFIG.topic)) PRACTICE_CONFIG.topic='All topics';
  box.innerHTML='';
  all.forEach(topic=>{
    const b=document.createElement('button'); b.type='button'; b.textContent=topic; b.dataset.topic=topic;
    b.classList.toggle('selected',topic===PRACTICE_CONFIG.topic);
    b.addEventListener('click',()=>{ PRACTICE_CONFIG.topic=topic; renderPracticeTopics(); });
    box.appendChild(b);
  });
}

function syncPracticeFilters(){
  if($('#practice-subject')) $('#practice-subject').value=PRACTICE_CONFIG.subject;
  if($('#practice-difficulty')) $('#practice-difficulty').value=String(PRACTICE_CONFIG.difficulty);
  if($('#practice-count')) $('#practice-count').value=String(PRACTICE_CONFIG.count);
  $$('#practice-levels [data-level]').forEach(b=>b.classList.toggle('selected',b.dataset.level===PRACTICE_CONFIG.level));
}

function renderPracticeEmpty(){
  const box=$('#practice-workspace'); if(!box || practiceState.active) return;
  box.innerHTML=`<div class="practice-empty"><div><div class="practice-empty-icon">◎</div><h2>Build a focused practice set</h2><p>Choose a subject, level, difficulty and topic. Questions here come from a dedicated practice bank and are never pulled from the 1v1 race bank.</p><button type="button" id="practice-quick-start" class="practice-primary">Start with current filters</button></div></div>`;
  $('#practice-quick-start')?.addEventListener('click',startPracticeSession);
}

function startPracticeSession(){
  const subject=SUBJECTS[PRACTICE_CONFIG.subject];
  if(!subject) return;
  const topics=PRACTICE_CONFIG.topic==='All topics' ? subject.topics : [PRACTICE_CONFIG.topic];
  practiceState.questions=Array.from({length:PRACTICE_CONFIG.count},(_,i)=>{
    const topic=topics[i%topics.length];
    const question=generatePracticeQuestion(PRACTICE_CONFIG.subject,topic,practiceDifficultyValue());
    return {...question,response:'',submitted:false,ok:false,flagged:false};
  });
  /* Shuffle only when practicing all topics, while preserving a balanced spread. */
  if(PRACTICE_CONFIG.topic==='All topics'){
    for(let i=practiceState.questions.length-1;i>0;i--){ const j=rand(0,i); [practiceState.questions[i],practiceState.questions[j]]=[practiceState.questions[j],practiceState.questions[i]]; }
  }
  practiceState.active=true; practiceState.index=0; practiceState.correct=0; practiceState.attempted=0; practiceState.streak=0; practiceState.bestStreak=0; practiceState.startedAt=Date.now();
  clearInterval(practiceState.elapsedTimer);
  practiceState.elapsedTimer=setInterval(updatePracticeClock,1000);
  if($('#practice-finish')) $('#practice-finish').style.display='inline-block';
  renderPracticeQuestion();
}

function practiceElapsed(){ return practiceState.startedAt ? Math.max(0,Math.floor((Date.now()-practiceState.startedAt)/1000)) : 0; }
function updatePracticeClock(){ const el=$('#practice-time'); if(el) el.textContent=prettyTime(practiceElapsed()); }
function practiceAccuracy(){ return practiceState.attempted ? Math.round(100*practiceState.correct/practiceState.attempted) : 0; }

function renderPracticeQuestion(){
  const box=$('#practice-workspace'); if(!box || !practiceState.active) return;
  const cur=practiceState.questions[practiceState.index];
  if(!cur){ finishPracticeSession(); return; }
  const answerUI=cur.choices
    ? `<div class="practice-choices" id="practice-choices">${cur.choices.map(c=>`<button type="button" class="practice-choice${cur.response===c.letter?' selected':''}" data-letter="${c.letter}" ${cur.submitted?'disabled':''}><span class="letter">${c.letter}</span><span>${esc(c.text)}</span></button>`).join('')}</div><input type="hidden" id="practice-answer" value="${esc(cur.response)}">`
    : `<input id="practice-answer" class="practice-answer-input" autocomplete="off" inputmode="decimal" placeholder="Enter your answer" value="${esc(cur.response)}" ${cur.submitted?'disabled':''}>`;
  box.innerHTML=`
    <div class="practice-session-meta">
      <div class="practice-tags"><span class="practice-tag">${esc(SUBJECTS[PRACTICE_CONFIG.subject].short)} ${esc(PRACTICE_CONFIG.level)}</span><span class="practice-tag">${esc(cur.topic)}</span><span class="practice-tag">Difficulty ${cur.difficulty}/5</span></div>
      <div class="practice-stats"><span><b>${practiceState.correct}/${practiceState.attempted}</b> correct</span><span><b>${practiceAccuracy()}%</b> accuracy</span><span><b>${practiceState.streak}</b> streak</span><span><b id="practice-time">${prettyTime(practiceElapsed())}</b></span></div>
    </div>
    <div class="practice-question-number">Question ${practiceState.index+1} of ${practiceState.questions.length}</div>
    <div class="practice-prompt">${esc(cur.prompt)}</div>
    ${cur.expression?`<div class="practice-expression">${esc(cur.expression)}</div>`:''}
    ${answerUI}
    <div class="practice-answer-row">
      ${cur.submitted?`<button type="button" id="practice-next" class="practice-primary">${practiceState.index===practiceState.questions.length-1?'Finish':'Next question →'}</button>`:'<button type="button" id="practice-submit" class="practice-primary">Check answer</button>'}
      <button type="button" id="practice-flag" class="practice-secondary">${cur.flagged?'★ Flagged':'☆ Flag'}</button>
      ${!cur.submitted?'<button type="button" id="practice-skip" class="practice-secondary">Skip →</button>':''}
    </div>
    ${cur.submitted?`<div class="practice-feedback ${cur.ok?'correct':'wrong'}"><strong>${cur.ok?'Correct ✓':'Not quite ✕'}${cur.ok?'':` — answer: ${esc(cur.answer)}`}</strong><span>${esc(cur.solution)}</span></div>`:''}
    <div class="practice-nav-wrap"><div class="practice-section-label">Question navigator</div><div class="practice-nav" id="practice-nav">${practiceState.questions.map((qv,i)=>`<button type="button" data-index="${i}" class="${i===practiceState.index?'current ':''}${qv.submitted?(qv.ok?'done':'wrong'):''} ${qv.flagged?'flagged':''}">${i+1}</button>`).join('')}</div></div>`;

  $$('#practice-choices .practice-choice').forEach(btn=>btn.addEventListener('click',()=>{
    if(cur.submitted) return;
    cur.response=btn.dataset.letter;
    renderPracticeQuestion();
  }));
  $('#practice-answer')?.addEventListener('input',e=>{ if(!cur.choices) cur.response=e.target.value; });
  $('#practice-answer')?.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!cur.submitted){ e.preventDefault(); submitPracticeAnswer(); } });
  $('#practice-submit')?.addEventListener('click',submitPracticeAnswer);
  $('#practice-next')?.addEventListener('click',()=>{
    if(practiceState.index>=practiceState.questions.length-1) finishPracticeSession();
    else { practiceState.index++; renderPracticeQuestion(); }
  });
  $('#practice-skip')?.addEventListener('click',()=>{
    practiceState.index=(practiceState.index+1)%practiceState.questions.length; renderPracticeQuestion();
  });
  $('#practice-flag')?.addEventListener('click',()=>{ cur.flagged=!cur.flagged; renderPracticeQuestion(); });
  $$('#practice-nav [data-index]').forEach(btn=>btn.addEventListener('click',()=>{ practiceState.index=Number(btn.dataset.index); renderPracticeQuestion(); }));
  if(!cur.choices && !cur.submitted) $('#practice-answer')?.focus();
}

function submitPracticeAnswer(){
  const cur=practiceState.questions[practiceState.index]; if(!cur || cur.submitted) return;
  const raw=cur.choices ? cur.response : ($('#practice-answer')?.value ?? cur.response);
  if(String(raw).trim()===''){
    const input=$('#practice-answer'); if(input){ input.focus(); input.style.borderColor='#c85151'; setTimeout(()=>{ if(input) input.style.borderColor=''; },700); }
    return;
  }
  cur.response=String(raw); cur.ok=answerIsCorrect(cur,cur.response); cur.submitted=true;
  practiceState.attempted++;
  if(cur.ok){ practiceState.correct++; practiceState.streak++; practiceState.bestStreak=Math.max(practiceState.bestStreak,practiceState.streak); }
  else practiceState.streak=0;
  renderPracticeQuestion();
}

function finishPracticeSession(){
  if(!practiceState.active) return;
  practiceState.active=false;
  clearInterval(practiceState.elapsedTimer); practiceState.elapsedTimer=null;
  if($('#practice-finish')) $('#practice-finish').style.display='none';
  const box=$('#practice-workspace'); if(!box) return;
  const elapsed=practiceElapsed();
  const wrong=practiceState.questions.filter(x=>x.submitted&&!x.ok).length;
  const unanswered=practiceState.questions.filter(x=>!x.submitted).length;
  box.innerHTML=`<div class="practice-summary-card"><div class="practice-section-label">Session complete</div><div class="practice-summary-score">${practiceAccuracy()}%</div><p>${practiceState.correct} correct from ${practiceState.attempted} attempted</p><div class="practice-summary-grid"><div><b>${practiceState.bestStreak}</b>best streak</div><div><b>${prettyTime(elapsed)}</b>time</div><div><b>${wrong}</b>incorrect</div></div>${unanswered?`<p style="opacity:.7">${unanswered} question${unanswered===1?' was':'s were'} left unanswered.</p>`:''}<div class="practice-answer-row" style="justify-content:center"><button type="button" id="practice-new" class="practice-primary">New practice set</button>${wrong?'<button type="button" id="practice-review-wrong" class="practice-secondary">Review mistakes</button>':''}</div><div id="practice-mistakes"></div></div>`;
  $('#practice-new')?.addEventListener('click',()=>{ renderPracticeEmpty(); });
  $('#practice-review-wrong')?.addEventListener('click',renderPracticeMistakes);
}

function renderPracticeMistakes(){
  const target=$('#practice-mistakes'); if(!target) return;
  const wrong=practiceState.questions.filter(x=>x.submitted&&!x.ok);
  target.innerHTML=`<div style="text-align:left;margin-top:20px">${wrong.map((x,i)=>`<div class="practice-feedback wrong" style="margin-top:10px"><strong>${i+1}. ${esc(x.topic)} — your answer: ${esc(x.response||'—')}</strong><div>${esc(x.prompt)}</div><div style="margin-top:6px"><b>Correct:</b> ${esc(x.answer)} · ${esc(x.solution)}</div></div>`).join('')}</div>`;
}

/* ----------------------- scientific calculator ----------------------- */
const calculatorState={expression:'',result:'0',angleMode:'DEG'};

function calcTokenize(input){
  const s=input.replace(/\s+/g,'');
  const tokens=[]; let i=0;
  while(i<s.length){
    const ch=s[i];
    if(/[0-9.]/.test(ch)){
      let j=i+1; while(j<s.length&&/[0-9.]/.test(s[j])) j++;
      const raw=s.slice(i,j); if((raw.match(/\./g)||[]).length>1) throw new Error('Invalid number');
      const num=Number(raw); if(!Number.isFinite(num)) throw new Error('Invalid number'); tokens.push({type:'number',value:num}); i=j; continue;
    }
    if(/[+\-*/^()]/.test(ch)){ tokens.push({type:ch,value:ch}); i++; continue; }
    if(ch==='π'){ tokens.push({type:'number',value:Math.PI}); i++; continue; }
    if(/[a-z]/i.test(ch)){
      let j=i+1; while(j<s.length&&/[a-z]/i.test(s[j])) j++;
      const name=s.slice(i,j).toLowerCase();
      if(name==='pi') tokens.push({type:'number',value:Math.PI});
      else if(name==='e') tokens.push({type:'number',value:Math.E});
      else if(['sin','cos','tan','sqrt','ln','log'].includes(name)) tokens.push({type:'func',value:name});
      else throw new Error('Unknown function');
      i=j; continue;
    }
    throw new Error('Invalid character');
  }
  return tokens;
}

function calcEvaluate(input,angleMode='DEG'){
  const tokens=calcTokenize(input); let pos=0;
  const peek=()=>tokens[pos]; const take=type=>{ if(peek()?.type===type) return tokens[pos++]; return null; };
  function primary(){
    const n=take('number'); if(n) return n.value;
    const fn=take('func');
    if(fn){
      if(!take('(')) throw new Error('Expected (');
      const v=expr(); if(!take(')')) throw new Error('Expected )');
      const trig=x=>angleMode==='DEG'?x*Math.PI/180:x;
      if(fn.value==='sin') return Math.sin(trig(v));
      if(fn.value==='cos') return Math.cos(trig(v));
      if(fn.value==='tan') return Math.tan(trig(v));
      if(fn.value==='sqrt'){ if(v<0) throw new Error('Domain error'); return Math.sqrt(v); }
      if(fn.value==='ln'){ if(v<=0) throw new Error('Domain error'); return Math.log(v); }
      if(fn.value==='log'){ if(v<=0) throw new Error('Domain error'); return Math.log10(v); }
    }
    if(take('(')){ const v=expr(); if(!take(')')) throw new Error('Expected )'); return v; }
    throw new Error('Expected value');
  }
  function power(){ const left=primary(); if(take('^')) return left**unary(); return left; }
  function unary(){ if(take('+')) return unary(); if(take('-')) return -unary(); return power(); }
  function term(){ let v=unary(); while(true){ if(take('*')) v*=unary(); else if(take('/')){ const d=unary(); if(d===0) throw new Error('Cannot divide by zero'); v/=d; } else return v; } }
  function expr(){ let v=term(); while(true){ if(take('+')) v+=term(); else if(take('-')) v-=term(); else return v; } }
  if(!tokens.length) return 0;
  const out=expr(); if(pos!==tokens.length) throw new Error('Check expression');
  if(!Number.isFinite(out)) throw new Error('Math error');
  return Math.abs(out)<1e-14?0:out;
}

function renderCalculator(){
  if($('#calc-expression')) $('#calc-expression').textContent=calculatorState.expression||'0';
  if($('#calc-result')) $('#calc-result').textContent=calculatorState.result;
  if($('#calc-mode')) $('#calc-mode').textContent=calculatorState.angleMode;
}
function openCalculator(){ $('#calculator-overlay')?.classList.add('open'); renderCalculator(); }
function closeCalculator(){ $('#calculator-overlay')?.classList.remove('open'); }
function calculatorInput(token){ calculatorState.expression+=token; renderCalculator(); }
function calculatorEquals(){
  try{
    const value=calcEvaluate(calculatorState.expression,calculatorState.angleMode);
    calculatorState.result=Number.isInteger(value)?String(value):String(round(value,10));
  }catch(e){ calculatorState.result=e.message||'Error'; }
  renderCalculator();
}

function bindPracticeEvents(){
  $('#btn-practice')?.addEventListener('click',()=>{ mode='practice'; show('practice'); if(!practiceState.active) renderPracticeEmpty(); });
  $('#practice-back')?.addEventListener('click',()=>{ clearInterval(practiceState.elapsedTimer); practiceState.elapsedTimer=null; practiceState.active=false; show('home'); });
  $('#practice-subject')?.addEventListener('change',e=>{ PRACTICE_CONFIG.subject=e.target.value; PRACTICE_CONFIG.topic='All topics'; renderPracticeTopics(); });
  $('#practice-levels')?.addEventListener('click',e=>{ const b=e.target.closest('[data-level]'); if(!b)return; PRACTICE_CONFIG.level=b.dataset.level; syncPracticeFilters(); });
  $('#practice-difficulty')?.addEventListener('change',e=>{ PRACTICE_CONFIG.difficulty=e.target.value; });
  $('#practice-count')?.addEventListener('change',e=>{ PRACTICE_CONFIG.count=Math.max(1,Math.min(30,Number(e.target.value)||10)); });
  $('#practice-start')?.addEventListener('click',startPracticeSession);
  $('#practice-finish')?.addEventListener('click',finishPracticeSession);
  $('#practice-calculator-btn')?.addEventListener('click',openCalculator);
  $('#race-calculator-btn')?.addEventListener('click',openCalculator);
  $('#calc-close')?.addEventListener('click',closeCalculator);
  $('#calculator-overlay')?.addEventListener('click',e=>{ if(e.target.id==='calculator-overlay') closeCalculator(); });
  $('#calc-mode')?.addEventListener('click',()=>{ calculatorState.angleMode=calculatorState.angleMode==='DEG'?'RAD':'DEG'; renderCalculator(); });
  $('#calc-grid')?.addEventListener('click',e=>{
    const b=e.target.closest('.calc-key'); if(!b)return;
    const action=b.dataset.action;
    if(action==='clear'){ calculatorState.expression=''; calculatorState.result='0'; renderCalculator(); return; }
    if(action==='back'){ calculatorState.expression=calculatorState.expression.slice(0,-1); renderCalculator(); return; }
    if(action==='equals'){ calculatorEquals(); return; }
    const token=b.dataset.token;
    if(token) calculatorInput(token==='pi'?'π':token);
  });
}


/* --------------------------- boot --------------------------- */
injectUpgradeStyles();
injectPracticeStyles();
ensureSetupControls();
ensurePracticeUI();
buildSubjectPicker();
buildTopics();
syncToggleUI();
bindEvents();
bindPracticeEvents();

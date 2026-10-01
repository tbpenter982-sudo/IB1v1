import json, math, random
from pathlib import Path

OUT=Path('/mnt/data/ibrace_v5')

def r(x,d=3): return round(x,d)

def make_bank(seed,prefix):
    rng=random.Random(seed); Q=[]
    def add(subject,topic,difficulty,prompt,answer,**kw):
        q={
            'id':f'{prefix}-{subject}-{len(Q)+1:04d}', 'subject':subject,
            'level':kw.pop('level','Both'),'topic':topic,'difficulty':difficulty,
            'prompt':prompt,'answer':answer
        }
        q.update(kw); Q.append(q)

    # We intentionally use several different question forms per subject. These
    # are starter/demo items, not a licensed or exhaustive IB bank.
    for cycle in range(2):
        # -------- Math AA --------
        a=rng.randint(2,8); x=rng.randint(-4,6); b=rng.randint(-9,9); c=rng.randint(-12,12)
        add('mathAA','Algebra',2,f'Evaluate f(x) = {a}x² {b:+d}x {c:+d} at x = {x}.',a*x*x+b*x+c,expression='Give an exact numerical answer.',hint='Substitute the given x-value into the polynomial.')
        p=rng.randint(3,9); qv=rng.randint(2,7); root=rng.randint(-5,6)
        add('mathAA','Algebra',4,f'The equation {p}x + {qv} = {p*root+qv}. Find x.',root,hint=f'Rearrange ax+b=c: x=(c-b)/a.',explanation='Isolate x by subtracting the constant term, then divide by the coefficient.')
        m=rng.randint(2,7); shift=rng.randint(-5,5); z=rng.randint(-4,5)
        add('mathAA','Functions',2,f'For f(x) = {m}(x {shift:+d}), find f({z}).',m*(z+shift),hint='Substitute the input into the function.')
        A=rng.randint(2,5); n=rng.randint(2,5); xv=rng.randint(1,4)
        add('mathAA','Calculus',3,f'Given f(x) = {A}x^{n}, find f′({xv}).',A*n*(xv**(n-1)),hint='d/dx(axⁿ) = anxⁿ⁻¹.')
        k=rng.randint(1,6); upper=rng.randint(2,5)
        add('mathAA','Calculus',5,f'Evaluate ∫₀^{upper} {k}x² dx.',r(k*upper**3/3,4),tolerance=.001,hint='∫x²dx = x³/3, then apply the limits.')
        v1=[rng.randint(-5,5) for _ in range(3)]; v2=[rng.randint(-5,5) for _ in range(3)]; dot=sum(a*b for a,b in zip(v1,v2))
        add('mathAA','Vectors',3,f'Find the scalar product of a = {tuple(v1)} and b = {tuple(v2)}.',dot,hint='a·b = a₁b₁ + a₂b₂ + a₃b₃.')
        sides=[rng.randint(3,10) for _ in range(2)]; ang=rng.choice([30,45,60,75]); third=math.sqrt(sides[0]**2+sides[1]**2-2*sides[0]*sides[1]*math.cos(math.radians(ang)))
        add('mathAA','Trigonometry',4,f'Two sides of a triangle are {sides[0]} and {sides[1]} with included angle {ang}°. Find the third side to 3 d.p.',r(third,3),tolerance=.002,hint='Use the cosine rule: c²=a²+b²−2ab cos C.')
        ntr=rng.randint(6,12); pprob=rng.choice([.2,.25,.3,.4]); kval=rng.randint(1,ntr-1); prob=math.comb(ntr,kval)*(pprob**kval)*((1-pprob)**(ntr-kval))
        add('mathAA','Probability & Statistics',5,f'X ~ B({ntr}, {pprob}). Find P(X = {kval}) to 4 d.p.',r(prob,4),tolerance=.00015,hint='P(X=k)=C(n,k)pᵏ(1−p)ⁿ⁻ᵏ.')
        add('mathAA','Functions',4,'Which transformation maps y=f(x) to y=f(x−3)+2?','B',options=['3 left, 2 up','3 right, 2 up','3 right, 2 down','3 left, 2 down'],hint='Horizontal changes inside the function act in the opposite direction.')
        add('mathAA','Trigonometry',2,'What is sin(30°)?',0.5,tolerance=.00001,hint='Use the exact special-angle values.')
        add('mathAA','Probability & Statistics',3,'A fair die is rolled twice. What is the probability that both results are even?',0.25,tolerance=.00001,hint='P(even)=3/6 for one roll; independent probabilities multiply.')
        add('mathAA','Algebra',5,'If log₂(x)=7, find x.',128,hint='Rewrite the logarithmic equation in exponential form.')

        # -------- Math AI --------
        P=rng.randint(10,40)*100; rate=rng.choice([2,3,4,5,6])/100; years=rng.randint(2,6); future=P*(1+rate)**years
        add('mathAI','Financial Mathematics',3,f'€{P} is invested at {int(rate*100)}% compound interest annually for {years} years. Find the final value to the nearest euro.',round(future),tolerance=.51,hint='A=P(1+r)ⁿ.')
        dep=rng.choice([8,10,12,15])/100; initial=rng.randint(18,45)*1000; yrs=rng.randint(2,5); val=initial*(1-dep)**yrs
        add('mathAI','Financial Mathematics',4,f'A car worth €{initial} depreciates by {int(dep*100)}% per year for {yrs} years. Find its value to the nearest euro.',round(val),tolerance=.51,hint='Repeated percentage decrease: V=P(1−r)ⁿ.')
        data=[rng.randint(2,20) for _ in range(5)]; mean=sum(data)/len(data)
        add('mathAI','Statistics & Probability',2,f'Find the mean of {data}.',r(mean,2),tolerance=.001,hint='Mean = sum of values ÷ number of values.')
        aa=rng.randint(2,8); bb=rng.randint(-7,7); xx=rng.randint(-5,6)
        add('mathAI','Functions',2,f'For y = {aa}x {bb:+d}, find y when x = {xx}.',aa*xx+bb,hint='Substitute x into the linear model.')
        d=rng.randint(4,12); theta=rng.choice([25,35,40,50,60]); height=d*math.tan(math.radians(theta))
        add('mathAI','Geometry & Trigonometry',4,f'From a point {d} m from a vertical wall, the angle of elevation to the top is {theta}°. Find the wall height to 3 d.p.',r(height,3),tolerance=.002,hint='tan θ = opposite/adjacent.')
        add('mathAI','Number & Algebra',3,'Write 0.000472 in scientific notation.','4.72e-4',aliases=['4.72×10^-4','4.72 x 10^-4','4.72*10^-4'],hint='Move the decimal point until one non-zero digit remains before it.')
        x0=rng.randint(1,4); k2=rng.randint(2,6)
        add('mathAI','Calculus',5,f'The rate of change is f′(x) = {k2}x + 3. Find f′({x0}).',k2*x0+3,hint='Evaluate the derivative function at the given x-value.')
        add('mathAI','Statistics & Probability',4,'Which measure is most resistant to a single extreme outlier?','C',options=['Mean','Standard deviation','Median','Range'],hint='Think about which statistic depends mainly on the middle position rather than magnitude.')
        add('mathAI','Geometry & Trigonometry',3,'A map scale is 1:50 000. A distance of 6 cm on the map represents how many kilometres in reality?',3,tolerance=.00001,hint='6×50,000 cm = 300,000 cm = 3 km.')
        add('mathAI','Number & Algebra',5,'Solve 3^(x+1)=81.',3,hint='Write 81 as a power of 3.')
        add('mathAI','Functions',4,'For the model y=120(0.85)^t, what percentage decrease occurs each time t increases by 1?',15,tolerance=.00001,hint='A multiplier of 0.85 leaves 85%, so the decrease is 15%.')
        add('mathAI','Calculus',2,'If f(x)=5x², find f′(2).',20,hint='Differentiate first, then substitute x=2.')

        # -------- Physics --------
        mass=rng.randint(2,15); speed=rng.randint(3,18); ke=.5*mass*speed**2
        add('physics','Mechanics',2,f'A {mass} kg object moves at {speed} m s⁻¹. Find its kinetic energy in J.',ke,hint='Eₖ = ½mv².')
        u=rng.randint(0,8); acc=rng.randint(2,6); t=rng.randint(2,5); v=u+acc*t
        add('physics','Mechanics',4,f'An object has initial speed {u} m s⁻¹ and constant acceleration {acc} m s⁻² for {t} s. Find its final speed.',v,hint='v=u+at.')
        freq=rng.randint(2,20)*10; wave=rng.choice([1.5,2,2.5,3,4]); vel=freq*wave
        add('physics','Waves',2,f'A wave has frequency {freq} Hz and wavelength {wave} m. Find its speed in m s⁻¹.',vel,hint='v=fλ.')
        V=rng.randint(6,30); I=rng.choice([.5,1,1.5,2,2.5]); R=V/I
        add('physics','Electricity',3,f'A component has potential difference {V} V and current {I} A. Find its resistance in Ω.',r(R,3),tolerance=.002,hint='R=V/I.')
        charge=rng.randint(2,9)*1e-6; field=rng.randint(2,12)*1e4; force=charge*field
        add('physics','Fields',4,f'A charge of {charge:.0e} C is in a uniform electric field of {field:.0e} N C⁻¹. Find the electric force in N.',r(force,5),tolerance=1e-5,hint='F=qE.')
        mkg=rng.choice([.2,.3,.5,.8,1.2]); dT=rng.randint(5,30); energy=mkg*4200*dT
        add('physics','Thermal',3,f'{mkg} kg of water is heated by {dT} K. Take c=4200 J kg⁻¹ K⁻¹. Find the energy transferred.',round(energy),tolerance=.5,hint='Q=mcΔT.')
        a0=rng.randint(4,20); halves=rng.randint(2,5); rem=a0*(.5**halves)
        add('physics','Nuclear',3,f'A sample has activity {a0} kBq. What is its activity after {halves} half-lives?',r(rem,4),tolerance=.0001,hint='A=A₀(1/2)ⁿ.')
        pwr=rng.randint(20,100); time=rng.randint(30,120); en=pwr*time
        add('physics','Electricity',4,f'A device transfers {pwr} W for {time} s. How much energy is transferred in J?',en,hint='E=Pt.')
        lam=rng.choice([400,450,500,600,650])*1e-9; h=6.63e-34;c0=3e8; Eph=h*c0/lam
        add('physics','Waves',5,f'A photon has wavelength {lam/1e-9:.0f} nm. Using h=6.63×10⁻³⁴ J s and c=3.00×10⁸ m s⁻¹, find its energy in J to 3 s.f.',float(f'{Eph:.3g}'),tolerance=abs(Eph)*.002,hint='E=hc/λ. Convert nm to m.')
        add('physics','Mechanics',5,'A net force of 18 N acts on a 3 kg object initially at rest for 4 s. Find the final momentum in kg m s⁻¹.',72,hint='Impulse FΔt equals change in momentum.')
        add('physics','Nuclear',4,'Which radiation has the greatest ionising ability in matter?','A',options=['Alpha','Beta','Gamma','X-ray'],hint='Consider charge, mass and how strongly each interacts with matter.')
        add('physics','Fields',2,'Which quantity is measured in N C⁻¹?','B',options=['Electric potential','Electric field strength','Charge','Resistance'],hint='Force per unit charge defines this quantity.')

        # -------- Chemistry --------
        mol=rng.choice([.2,.25,.5,.75,1.2]); mm=rng.choice([18,40,44,58.5,98]); massc=mol*mm
        add('chemistry','Stoichiometry',2,f'How many grams are in {mol} mol of a substance with molar mass {mm} g mol⁻¹?',r(massc,3),tolerance=.002,hint='m=nM.')
        n=rng.choice([.1,.2,.35,.5]); vol=rng.choice([.25,.5,1,2]); conc=n/vol
        add('chemistry','Stoichiometry',3,f'{n} mol of solute is dissolved to make {vol} dm³ of solution. Find concentration in mol dm⁻³.',r(conc,3),tolerance=.002,hint='c=n/V.')
        ph=rng.choice([2,3,4,5]); hconc=10**(-ph)
        add('chemistry','Acids & Bases',2,f'A solution has pH {ph}. Find [H⁺] in mol dm⁻³. Use scientific notation.',hconc,tolerance=hconc*.001,hint='[H⁺]=10⁻ᵖᴴ.')
        add('chemistry','Bonding',3,'Which species has a tetrahedral electron-domain geometry around the central atom?','B',options=['CO₂','CH₄','BF₃','BeCl₂'],hint='Four electron domains around carbon give a tetrahedral arrangement.')
        add('chemistry','Atomic Structure',4,'How many neutrons are in ³⁷Cl⁻?','C',options=['17','18','20','37'],hint='Neutrons = mass number − atomic number. Charge does not change the nucleus.')
        dh=rng.choice([-286,-92,-44,178]); moles=rng.choice([.5,1.5,2]); total=dh*moles
        add('chemistry','Energetics',3,f'A reaction has ΔH = {dh} kJ mol⁻¹. What is the enthalpy change for {moles} mol?',r(total,2),tolerance=.01,hint='Multiply molar enthalpy change by amount in moles.')
        k=rng.choice([2,4,5,10]); Aeq=rng.choice([.2,.4,.5]); Beq=rng.choice([.1,.2,.25]); Kc=B_eq=None
        # simple A <-> B, Kc=[B]/[A]
        Kc=Beq/Aeq
        add('chemistry','Equilibrium',4,f'For A ⇌ B, equilibrium concentrations are [A]={Aeq} mol dm⁻³ and [B]={Beq} mol dm⁻³. Find Kc.',r(Kc,4),tolerance=.0001,hint='For A ⇌ B, Kc=[B]/[A].')
        t1=rng.randint(20,50); t2=rng.randint(5,15); factor=t1/t2
        add('chemistry','Kinetics',4,f'A fixed amount of product forms in {t1} s under condition 1 and {t2} s under condition 2. By what factor is the average rate larger under condition 2?',r(factor,3),tolerance=.002,hint='For the same amount, rate is inversely proportional to time.')
        add('chemistry','Redox',3,'What is the oxidation state of sulfur in SO₄²⁻?','+6',aliases=['6','+ 6'],hint='Let sulfur be x: x + 4(−2) = −2.')
        add('chemistry','Organic',3,'What is the product of complete oxidation of a primary alcohol?','carboxylic acid',aliases=['a carboxylic acid'],hint='Primary alcohol → aldehyde → carboxylic acid under complete oxidation.')
        add('chemistry','Acids & Bases',5,'A strong acid has [H⁺] = 2.5×10⁻⁴ mol dm⁻³. Find pH to 3 d.p.',r(-math.log10(2.5e-4),3),tolerance=.002,hint='pH=−log₁₀[H⁺].')
        add('chemistry','Bonding',5,'Which intermolecular force is present between all molecular substances?','D',options=['Ionic bonding','Hydrogen bonding','Permanent dipole forces','London dispersion forces'],hint='Instantaneous dipoles can arise in every electron cloud.')

        # -------- Biology --------
        img=rng.choice([20,40,60,80]); actual=rng.choice([2,4,5,10]); mag=img/actual
        add('biology','Cell Biology',2,f'A cell image measures {img} mm while the actual cell length is {actual} μm. Find the magnification.',mag*1000,tolerance=.01,hint='Convert both lengths to the same unit before using magnification=image size/actual size.')
        add('biology','Molecular Biology',3,'Which bond joins complementary bases across the two DNA strands?','C',options=['Peptide bond','Phosphodiester bond','Hydrogen bond','Glycosidic bond'],hint='Base pairs are held together by relatively weak bonds that allow strand separation.')
        add('biology','Genetics',3,'In a monohybrid cross Aa × Aa, what is the probability of genotype aa?',0.25,tolerance=.00001,hint='Use a 2×2 Punnett square.')
        add('biology','Metabolism',4,'Where does the light-independent stage of photosynthesis occur in a chloroplast?','B',options=['Thylakoid lumen','Stroma','Cristae','Cytosol'],hint='The Calvin cycle enzymes are located in the fluid surrounding the thylakoids.')
        add('biology','Ecology',3,'Producers contain 18 000 kJ of energy. If 12% is transferred to primary consumers, how much energy reaches them?',2160,hint='Multiply by the transfer efficiency as a decimal.')
        add('biology','Evolution',4,'Which process directly changes allele frequencies because individuals move between populations?','C',options=['Mutation','Genetic drift','Gene flow','Stabilizing selection'],hint='Movement of alleles between populations accompanies migration.')
        add('biology','Human Physiology',2,'Which chamber pumps blood into the systemic circulation?','D',options=['Right atrium','Right ventricle','Left atrium','Left ventricle'],hint='Systemic circulation begins at the chamber connected to the aorta.')
        pA=rng.choice([.4,.5,.6,.7]); qA=1-pA; het=2*pA*qA
        add('biology','Genetics',5,f'In a Hardy–Weinberg population, allele frequencies are p={pA} and q={r(qA,1)}. Find the expected heterozygote frequency.',r(het,3),tolerance=.001,hint='Heterozygote frequency = 2pq.')
        add('biology','Cell Biology',4,'A cube-shaped cell doubles its side length. By what factor does its surface-area-to-volume ratio change?','halves',aliases=['1/2','0.5','decreases by half'],hint='For a cube, SA:V is proportional to 1/side length.')
        add('biology','Molecular Biology',5,'Which enzyme synthesizes RNA from a DNA template during transcription?','RNA polymerase',aliases=['rna polymerase'],hint='The enzyme moves along DNA while joining RNA nucleotides.')
        add('biology','Metabolism',3,'Which molecule is the immediate energy currency used by cells?','ATP',aliases=['adenosine triphosphate'],hint='It transfers energy through phosphorylation reactions.')
        add('biology','Ecology',5,'A quadrat survey finds 42 individuals in 7 quadrats of 0.5 m² each. Estimate density in individuals per m².',12,tolerance=.001,hint='Density = total individuals / total sampled area.')

        # -------- Economics --------
        q1=rng.randint(80,120); q2=q1+rng.randint(10,30); p1=rng.randint(10,20); p2=p1-rng.randint(2,5)
        ped=((q2-q1)/((q1+q2)/2))/((p2-p1)/((p1+p2)/2))
        add('economics','Microeconomics',4,f'Price falls from {p1} to {p2} while quantity demanded rises from {q1} to {q2}. Using the midpoint method, calculate PED to 2 d.p.',r(abs(ped),2),tolerance=.015,hint='PED = %ΔQd / %ΔP using midpoint percentage changes.')
        c=rng.choice([.6,.7,.75,.8]); mult=1/(1-c)
        add('economics','Macroeconomics',3,f'If the marginal propensity to consume is {c}, calculate the simple Keynesian multiplier.',r(mult,2),tolerance=.01,hint='Multiplier = 1/(1−MPC).')
        nom=rng.randint(500,900); defl=rng.choice([105,110,120,125]); real=nom/(defl/100)
        add('economics','Macroeconomics',4,f'Nominal GDP is {nom} billion and the GDP deflator is {defl}. Find real GDP in billions to 1 d.p.',r(real,1),tolerance=.06,hint='Real GDP = nominal GDP ÷ (deflator/100).')
        exp=rng.randint(200,500); imp=rng.randint(150,450); nx=exp-imp
        add('economics','Global Economy',2,f'Exports are ${exp} bn and imports are ${imp} bn. Find net exports in $bn.',nx,hint='Net exports = exports − imports.')
        add('economics','Development',3,'Which measure combines health, education and income dimensions?','B',options=['Gini coefficient','Human Development Index','Consumer Price Index','Current account balance'],hint='This composite index is published as a broad development indicator.')
        add('economics','Microeconomics',2,'If PED = 0.4, demand is best described as:','A',options=['Price inelastic','Unit elastic','Price elastic','Perfectly elastic'],hint='Compare the absolute PED value with 1.')
        old=rng.randint(100,180); new=old+rng.randint(5,25); infl=(new-old)/old*100
        add('economics','Macroeconomics',3,f'A price index rises from {old} to {new}. Calculate the percentage inflation over the period to 2 d.p.',r(infl,2),tolerance=.015,hint='Percentage change = (new−old)/old ×100.')
        add('economics','Global Economy',4,'A currency appreciation, ceteris paribus, tends to make the country’s exports:','C',options=['Cheaper to foreigners','Unaffected','More expensive to foreigners','Always larger in quantity'],hint='Foreign buyers must give up more of their currency for each unit of the appreciated currency.')
        tax=rng.randint(2,8); pre=rng.randint(10,20); consumer=pre+rng.randint(1,tax); producer=consumer-tax
        add('economics','Microeconomics',5,f'A per-unit tax of ${tax} raises the consumer price from ${pre} to ${consumer}. What tax burden per unit falls on producers?',r(pre-producer,2),tolerance=.001,hint='Producer burden = original producer price − new net price received by producers.')
        add('economics','Development',4,'A Gini coefficient closer to 1 indicates:','D',options=['Lower inflation','Higher life expectancy','More equal income distribution','Greater income inequality'],hint='The coefficient ranges from perfect equality toward maximum inequality.')
        add('economics','Macroeconomics',5,'If MPC = 0.75 and autonomous spending rises by $20 bn, what is the simple-model change in equilibrium national income?',80,tolerance=.001,hint='Multiplier=1/(1−MPC)=4, then multiply by the spending change.')
        add('economics','Global Economy',3,'If an exchange rate moves from 1.20 to 1.32 units of foreign currency per domestic currency, by what percentage has the domestic currency appreciated?',10,tolerance=.001,hint='Percentage change=(1.32−1.20)/1.20×100.')

        # -------- ESS --------
        gpp=rng.randint(800,1600); resp=rng.randint(200,700); npp=gpp-resp
        add('ess','Ecosystems',2,f'An ecosystem has GPP={gpp} kJ m⁻² yr⁻¹ and respiratory losses={resp} kJ m⁻² yr⁻¹. Find NPP.',npp,hint='NPP = GPP − respiration.')
        inpute=rng.randint(500,1500); useful=rng.randint(100,int(inpute*.7)); eff=useful/inpute*100
        add('ess','Energy & Resources',3,f'A system receives {inpute} kJ and delivers {useful} kJ of useful energy. Calculate efficiency to 1 d.p.',r(eff,1),tolerance=.06,hint='Efficiency = useful output/input ×100%.')
        pop=rng.randint(10000,50000); rate=rng.choice([1.5,2,2.5,3])/100; growth=pop*rate
        add('ess','Sustainability',3,f'A population of {pop} grows by {rate*100:g}% in one year. Estimate the numerical increase.',round(growth),tolerance=.51,hint='Increase = population × growth rate as a decimal.')
        add('ess','Climate Change',2,'Which gas is the largest direct anthropogenic contributor among these to long-lived greenhouse forcing?','A',options=['Carbon dioxide','Oxygen','Nitrogen','Argon'],hint='Consider major long-lived greenhouse gases released by fossil-fuel combustion.')
        add('ess','Biodiversity',4,'Which index increases when both species richness and evenness increase?','B',options=['Biochemical oxygen demand','Diversity index','Ecological footprint','Carbon intensity'],hint='The metric is designed to represent biological diversity.')
        add('ess','Pollution',3,'High biochemical oxygen demand in water most directly indicates:','C',options=['Low organic matter','High salinity','High biodegradable organic pollution','High dissolved oxygen'],hint='Microorganisms consume oxygen while decomposing biodegradable material.')
        add('ess','Water & Food',3,'A farm uses 900 m³ of water and 630 m³ reaches crops effectively. Find irrigation efficiency as a percentage.',70,tolerance=.001,hint='Efficiency=useful water/input water×100%.')
        add('ess','Energy & Resources',4,'Which energy source is renewable on human timescales?','D',options=['Coal','Natural gas','Uranium ore','Wind'],hint='Choose the source replenished continuously by natural processes.')
        area=rng.randint(20,80); footprint=rng.choice([1.5,2,2.5,3]); people=area*100/footprint
        add('ess','Sustainability',5,f'A region has {area*100} global hectares of biocapacity. If average ecological footprint is {footprint} gha per person, how many people could be supported at that footprint?',round(people),tolerance=.51,hint='Supported population = total biocapacity ÷ footprint per person.')
        add('ess','Ecosystems',4,'If only 10% of trophic-level energy is transferred, how much of 25 000 kJ at producers is expected at secondary consumers?',250,tolerance=.001,hint='Apply 10% transfer twice: producer → primary → secondary.')
        add('ess','Climate Change',5,'Which feedback is positive?','A',options=['Ice melts, lowering albedo and increasing absorption','More cloud always reflects all sunlight','Reforestation removes CO₂','Higher efficiency reduces fuel use'],hint='A positive feedback amplifies the original change.')
        add('ess','Pollution',4,'A pollutant concentration is 80 mg L⁻¹ and falls by half every 5 days. What is the concentration after 15 days?',10,tolerance=.001,hint='15 days is three half-lives: multiply by (1/2)³.')

    return {'metadata':{'name':f'IB Race {prefix.title()} Starter Bank','version':1,'note':'Original starter/demo questions. Replace with your own reviewed bank for production.'},'questions':Q}

for seed,prefix,file in [(20261001,'race','race-questionbank.json'),(20261002,'practice','practice-questionbank.json')]:
    bank=make_bank(seed,prefix)
    (OUT/file).write_text(json.dumps(bank,indent=2,ensure_ascii=False),encoding='utf-8')
    print(file,len(bank['questions']))

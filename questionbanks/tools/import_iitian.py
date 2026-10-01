#!/usr/bin/env python3
"""Authorized IITian Academy -> IB Race question-bank importer.

This is intentionally a build-time importer, not a fake browser API URL.
It crawls authorized IITian Academy pages, normalizes questions into the v5.2
schema, and merges them into questionbanks/race.json + practice.json.

Examples:
  python tools/import_iitian.py --url https://www.iitianacademy.com/ibdp-maths/ \
      --subject mathAA --level HL --crawl 2

  IITIAN_COOKIE='wordpress_logged_in_...=...' python tools/import_iitian.py \
      --url 'https://www.iitianacademy.com/your-authorized-question-page/' \
      --subject physics --level HL

The cookie is optional and is read only from the environment. Never hard-code it.
Because page templates can change, always review the generated questions before use.
"""
from __future__ import annotations
import argparse, hashlib, json, os, re, sys, time
from collections import deque
from pathlib import Path
from urllib.parse import urljoin, urlparse, urldefrag

try:
    import requests
    from bs4 import BeautifulSoup, NavigableString, Tag
except ImportError:
    raise SystemExit('Install dependencies first: pip install requests beautifulsoup4')

ROOT = Path(__file__).resolve().parents[1]
RACE = ROOT / 'questionbanks' / 'race.json'
PRACTICE = ROOT / 'questionbanks' / 'practice.json'
ALLOWED_SUBJECTS = {'mathAA','mathAI','physics','chemistry','biology','economics','ess'}
QUESTION_RE = re.compile(r'^(?:question|q(?:uestion)?)[\s.:#-]*(\d+[a-z]?)?\b', re.I)
ANSWER_RE = re.compile(r'^(?:answer|ans\.?|correct answer)\s*[:.-]?\s*(.*)$', re.I)
SOLUTION_RE = re.compile(r'^(?:solution|markscheme|mark scheme|worked solution)\s*[:.-]?\s*(.*)$', re.I)
METHOD_WORDS = re.compile(r'\b(prove|show that|show,|demonstrate|derive|hence show)\b', re.I)
MARK_CODE_RE = re.compile(r'\b([MABR]\d+)\b\s*[:.-]?\s*(.*)', re.I)
LINK_HINT_RE = re.compile(r'(question|paper|style|bank|topic)', re.I)


def clean(s: str) -> str:
    return re.sub(r'\s+', ' ', s or '').strip()


def math_aware_text(node: Tag) -> str:
    """Preserve common TeX carriers before flattening the page to text."""
    node = BeautifulSoup(str(node), 'html.parser')
    for script in node.find_all('script'):
        typ=(script.get('type') or '').lower()
        if 'math/tex' in typ:
            tex=clean(script.get_text(' ', strip=True))
            script.replace_with(f' $${tex}$$ ' if 'mode=display' in typ else f' ${tex}$ ')
    for img in node.find_all('img'):
        alt=clean(img.get('alt') or '')
        img.replace_with(f' {alt} ' if alt else ' ')
    return clean(node.get_text(' ', strip=True))


def normalized_url(base: str, href: str) -> str | None:
    if not href:return None
    u=urldefrag(urljoin(base,href))[0]
    p=urlparse(u)
    if p.scheme not in {'http','https'} or p.netloc.lower() not in {'iitianacademy.com','www.iitianacademy.com'}:
        return None
    return u


def fetch(session: requests.Session, url: str) -> str:
    r=session.get(url,timeout=25)
    r.raise_for_status()
    return r.text


def crawl_urls(session: requests.Session, starts: list[str], depth: int, limit: int) -> list[str]:
    seen=set(); out=[]; q=deque((u,0) for u in starts)
    while q and len(out)<limit:
        url,d=q.popleft()
        if url in seen:continue
        seen.add(url)
        try:html=fetch(session,url)
        except Exception as e:
            print(f'[warn] {url}: {e}',file=sys.stderr);continue
        out.append(url)
        if d>=depth:continue
        soup=BeautifulSoup(html,'html.parser')
        for a in soup.find_all('a',href=True):
            nxt=normalized_url(url,a['href'])
            if not nxt or nxt in seen:continue
            label=clean(a.get_text(' ',strip=True))+' '+nxt
            if LINK_HINT_RE.search(label) and '/ib' in urlparse(nxt).path.lower():q.append((nxt,d+1))
        time.sleep(.05)
    return out


def page_blocks(html: str) -> list[str]:
    soup=BeautifulSoup(html,'html.parser')
    root=soup.find('main') or soup.find('article') or soup.body or soup
    selectors=['h2','h3','h4','h5','p','li','table','div.elementor-widget-text-editor','div.wp-block-group']
    blocks=[]
    for node in root.select(','.join(selectors)):
        txt=math_aware_text(node)
        if txt and (not blocks or txt!=blocks[-1]):blocks.append(txt)
    return blocks


def split_questions(blocks: list[str]) -> list[dict]:
    result=[]; current=None; mode='question'
    def flush():
        nonlocal current
        if current and clean(' '.join(current['q'])):
            result.append(current)
        current=None
    for b in blocks:
        qm=QUESTION_RE.match(b)
        if qm:
            flush(); current={'q':[QUESTION_RE.sub('',b,1).strip(' :-')],'answer':[],'solution':[]};mode='question';continue
        if current is None:continue
        am=ANSWER_RE.match(b)
        if am:mode='answer'; rest=clean(am.group(1)); current['answer'] += [rest] if rest else [];continue
        sm=SOLUTION_RE.match(b)
        if sm:mode='solution';rest=clean(sm.group(1));current['solution'] += [rest] if rest else [];continue
        current[{'question':'q','answer':'answer','solution':'solution'}[mode]].append(b)
    flush();return result


def parse_options(prompt: str):
    # Common flattened form: A. ... B. ... C. ... D. ...
    matches=list(re.finditer(r'(?:^|\s)([A-D])[).:]\s+',prompt))
    if len(matches)<2:return prompt,None
    stem=prompt[:matches[0].start()].strip(); opts=[]
    for i,m in enumerate(matches):
        end=matches[i+1].start() if i+1<len(matches) else len(prompt)
        opts.append(prompt[m.end():end].strip())
    return stem,opts


def markscheme(solution: str):
    rows=[]
    for part in re.split(r'(?=\b[MABR]\d+\b)',solution):
        m=MARK_CODE_RE.search(part)
        if m and clean(m.group(2)):
            rows.append({'code':m.group(1).upper(),'text':clean(m.group(2)),'marks':1})
    return rows


def infer_topic(url: str, prompt: str, supplied: str | None) -> str:
    if supplied:return supplied
    slug=urlparse(url).path.strip('/').split('/')[-1].replace('-',' ')
    return clean(slug.title()) or 'Imported'


def infer_subtopic(topic: str, supplied: str | None) -> str:
    return supplied or topic


def final_answer(answer_text: str, solution: str):
    text=clean(answer_text)
    if text:
        m=re.search(r'\b([A-D])\b(?:\s|$)',text,re.I)
        if m and len(text)<80:return m.group(1).upper()
        num=re.fullmatch(r'[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?',text.replace(',',''))
        if num:return float(text) if any(c in text for c in '.eE') else int(text)
        return text
    # Conservative fallback: only capture an explicit final-answer phrase.
    m=re.search(r'(?:therefore|hence|answer\s*[:=])\s*([^.;]{1,80})',solution,re.I)
    return clean(m.group(1)) if m else None


def make_id(subject,level,url,prompt):
    h=hashlib.sha1((url+'\n'+prompt).encode()).hexdigest()[:12]
    return f'iitian-{subject}-{level.lower()}-{h}'


def convert(page_url: str, raw: dict, args) -> dict | None:
    prompt=clean(' '.join(raw['q']))
    if len(prompt)<8:return None
    prompt,opts=parse_options(prompt)
    answer_text=clean(' '.join(raw['answer']));solution=clean(' '.join(raw['solution']))
    peer=bool(METHOD_WORDS.search(prompt)); scheme=markscheme(solution)
    answer=final_answer(answer_text,solution)
    if peer and not scheme:
        # Keep it for practice/source review, but do not put an ungradable written response in races.
        race_eligible=False
    else:
        race_eligible=peer or answer is not None
    q={'id':make_id(args.subject,args.level,page_url,prompt),'subject':args.subject,'levels':[args.level],
       'topic':infer_topic(page_url,prompt,args.topic),'subtopic':infer_subtopic(infer_topic(page_url,prompt,args.topic),args.subtopic),
       'difficulty':args.difficulty,'prompt':prompt,'gradingMode':'peer' if peer else 'auto','source':'IITian Academy','sourceUrl':page_url,
       'raceEligible':race_eligible}
    if opts:q['options']=opts;q['type']='mcq'
    if peer:
        q['marks']=sum(x['marks'] for x in scheme) or 1;q['markscheme']=scheme
        if solution:q['explanation']=solution
    else:
        if answer is None:return None
        q['answer']=answer
        if isinstance(answer,(int,float)):q['type']='numeric';q['tolerance']=max(abs(float(answer))*1e-6,1e-9)
        if solution:q['explanation']=solution
    return q


def load_bank(path: Path):
    d=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'metadata':{},'questions':[]}
    return d if isinstance(d,dict) else {'metadata':{},'questions':d}


def merge(path: Path, incoming: list[dict], predicate=lambda q:True):
    bank=load_bank(path);byid={q['id']:q for q in bank.get('questions',[]) if q.get('id')}
    for q in incoming:
        if predicate(q):byid[q['id']]=q
    bank['questions']=list(byid.values());bank.setdefault('metadata',{})['authorizedImport']='IITian Academy';
    path.write_text(json.dumps(bank,ensure_ascii=False,indent=2),encoding='utf-8');return len(bank['questions'])


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--url',action='append',required=True,help='Authorized IITian page/index; repeat for more than one')
    ap.add_argument('--subject',required=True,choices=sorted(ALLOWED_SUBJECTS));ap.add_argument('--level',required=True,choices=['SL','HL'])
    ap.add_argument('--topic');ap.add_argument('--subtopic');ap.add_argument('--difficulty',type=int,default=3,choices=range(1,6));ap.add_argument('--crawl',type=int,default=0,help='Internal link crawl depth (0 = only supplied pages)');ap.add_argument('--limit',type=int,default=250);ap.add_argument('--dry-run',action='store_true')
    args=ap.parse_args()
    sess=requests.Session();sess.headers['User-Agent']='IB-Race-authorized-import/1.0 (+private study group)'
    cookie=os.getenv('IITIAN_COOKIE');
    if cookie:sess.headers['Cookie']=cookie
    urls=crawl_urls(sess,args.url,args.crawl,args.limit) if args.crawl else args.url
    questions=[]
    for url in urls:
        try:html=fetch(sess,url)
        except Exception as e:print(f'[warn] {url}: {e}',file=sys.stderr);continue
        for raw in split_questions(page_blocks(html)):
            q=convert(url,raw,args)
            if q:questions.append(q)
        print(f'[scan] {url}: total normalized so far {len(questions)}',file=sys.stderr)
    # Stable de-dup by ID
    questions=list({q['id']:q for q in questions}.values())
    if args.dry_run:
        print(json.dumps({'questions':questions},ensure_ascii=False,indent=2));return
    practice_count=merge(PRACTICE,questions)
    race_count=merge(RACE,questions,lambda q:q.get('raceEligible',False))
    print(f'Imported {len(questions)} normalized questions. Banks now: race={race_count}, practice={practice_count}.')

if __name__=='__main__':main()

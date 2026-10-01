#!/usr/bin/env python3
"""IITian Academy -> IB Race authorized question-bank importer (v2).

Purpose
-------
Build-time importer for a private/authorized IB Race project. It does NOT make
up an API endpoint and the browser never scrapes IITian directly. The importer
reads IITian's real topic/question pages, converts supported questions to the
IB Race v5.2 schema, and merges them into questionbanks/practice.json and
questionbanks/race.json.

Quick use:
  python tools/import_iitian.py --all
  python tools/import_iitian.py --course physics-HL
  python tools/import_iitian.py --course mathAA-HL --dry-run

Full-access pages (optional):
  Set IITIAN_COOKIE in your local environment or as a GitHub Actions secret.
  The cookie value is sent only to iitianacademy.com and is never written to
  the output JSON.

Notes
-----
* Ordinary MCQ / clearly extractable final-answer questions are auto-graded.
* "prove/show/derive" questions are Race-eligible only when an explicit
  criterion-style markscheme can be extracted. Otherwise they remain out of
  Race rather than being graded unreliably.
* The importer is deliberately conservative: unsupported questions are skipped
  rather than inventing an answer.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin, urlparse, urldefrag

try:
    import requests
    from bs4 import BeautifulSoup, Tag
except ImportError:
    raise SystemExit("Missing dependencies. Run: pip install requests beautifulsoup4")

ROOT = Path(__file__).resolve().parents[1]
RACE = ROOT / "questionbanks" / "race.json"
PRACTICE = ROOT / "questionbanks" / "practice.json"
DOMAIN = {"iitianacademy.com", "www.iitianacademy.com"}

@dataclass(frozen=True)
class Course:
    key: str
    subject: str
    level: str
    roots: tuple[str, ...]
    link_pattern: str

# Real IITian Academy question-bank index pages verified 2026-10-01.
COURSES = {
    "mathAA-HL": Course("mathAA-HL", "mathAA", "HL", (
        "https://www.iitianacademy.com/ib-dp-maths-slhl-past-years-question-bank-with-solution/",
        "https://www.iitianacademy.com/ib-dp-maths-hl-past-years-question-bank-with-solution-paper-2/",
        "https://www.iitianacademy.com/ib-dp-maths-hl-past-years-question-bank-with-solution-paper-3/",
    ), r"\b(?:SL|AHL)\s*\d+\.\d+\b|paper\s*3"),
    "mathAA-SL": Course("mathAA-SL", "mathAA", "SL", (
        "https://www.iitianacademy.com/ib-dp-maths-sl-past-years-question-bank-with-solution-paper-1/",
        "https://www.iitianacademy.com/ib-dp-maths-sl-past-years-question-bank-with-solution-paper-2/",
    ), r"\bSL\s*\d+\.\d+\b"),
    "mathAI-HL": Course("mathAI-HL", "mathAI", "HL", (
        "https://www.iitianacademy.com/ib-dp-further-mathematics-hl-past-years-question-bank-with-solution-paper-1/",
        "https://www.iitianacademy.com/ib-dp-further-mathematics-hl-past-years-question-bank-with-solution-paper-2/",
        "https://www.iitianacademy.com/ibdp-maths-applications-and-interpretation-ib-style-question-bank-hl-paper-3/",
    ), r"\b(?:SL|AHL)\s*\d+\.\d+\b|paper\s*3"),
    "mathAI-SL": Course("mathAI-SL", "mathAI", "SL", (
        "https://www.iitianacademy.com/ib-dp-mathematical-studies-sl-past-years-question-bank-with-solution-paper-1/",
        "https://www.iitianacademy.com/ib-dp-mathematical-studies-past-years-question-bank-with-solution-paper-2/",
    ), r"\bSL\s*\d+\.\d+\b"),
    "physics-HL": Course("physics-HL", "physics", "HL", (
        "https://www.iitianacademy.com/ibdp-physics-hl-ib-style-questions-bank-hl-papers-first-assessment-2025/",
    ), r"\b[A-E]\.\s*\d+\b|data[- ]based"),
    "physics-SL": Course("physics-SL", "physics", "SL", (
        "https://www.iitianacademy.com/ibdp/ibdp-physics/sl-2025/ibdp-physics-slhl-ib-style-questions-bank-all-papers-first-assessment-2025/",
    ), r"\b[A-E]\.\s*\d+\b|data[- ]based"),
    "chemistry-HL": Course("chemistry-HL", "chemistry", "HL", (
        "https://www.iitianacademy.com/ib-dp-chemistry-ib-style-questions-bank-hl-paper-1-2-first-assessment-2025/",
    ), r"\b(?:Structure|Reactivity)\s*\d+\.\d+\b|data[- ]based"),
    "chemistry-SL": Course("chemistry-SL", "chemistry", "SL", (
        "https://www.iitianacademy.com/ibdp/ibdp-chemistry/ib-dp-chemistry-sl-2025/ib-dp-chemistry-ib-style-questions-bank-sl-paper-12-first-assessment-2025/",
    ), r"\b(?:Structure|Reactivity)\s*\d+\.\d+\b|data[- ]based"),
    "biology-HL": Course("biology-HL", "biology", "HL", (
        "https://www.iitianacademy.com/ibdp-biology-hl-ib-style-questions-bank-all-papers-first-assessment-2025/",
    ), r"\b[A-D]\d+\.\d+\b|data[- ]based"),
    "biology-SL": Course("biology-SL", "biology", "SL", (
        "https://www.iitianacademy.com/ibdp/ibdp-biology/sl-2025/ibdp-biology-slhl-ib-style-questions-bank-all-papers-first-assessment-2025/",
    ), r"\b[A-D]\d+\.\d+\b|data[- ]based"),
    "economics-HL": Course("economics-HL", "economics", "HL", (
        "https://www.iitianacademy.com/ibdp-economics/hl/",
    ), r"\b[1-4]\.\d+\b"),
    "economics-SL": Course("economics-SL", "economics", "SL", (
        "https://www.iitianacademy.com/ibdp-economics/sl/",
    ), r"\b[1-4]\.\d+\b"),
}

# Top-level IB Race topic labels for imported courses.
TOPIC_PREFIX = {
    "mathAA": {"1": "Number & Algebra", "2": "Functions", "3": "Geometry & Trigonometry", "4": "Statistics & Probability", "5": "Calculus"},
    "mathAI": {"1": "Number & Algebra", "2": "Functions", "3": "Geometry & Trigonometry", "4": "Statistics & Probability", "5": "Calculus"},
    "physics": {"A": "Space, time and motion", "B": "Particulate nature of matter", "C": "Wave behaviour", "D": "Fields", "E": "Nuclear and quantum physics"},
    "biology": {"A": "Unity and diversity", "B": "Form and function", "C": "Interaction and interdependence", "D": "Continuity and change"},
    "economics": {"1": "Introduction to economics", "2": "Microeconomics", "3": "Macroeconomics", "4": "Global economy"},
    "chemistry": {"Structure 1": "Structure 1 — Particulate nature of matter", "Structure 2": "Structure 2 — Bonding and structure", "Structure 3": "Structure 3 — Classification of matter", "Reactivity 1": "Reactivity 1 — Drivers of chemical reactions", "Reactivity 2": "Reactivity 2 — Amount, rate and extent", "Reactivity 3": "Reactivity 3 — Mechanisms of chemical change"},
}

QUESTION_HEADING_RE = re.compile(r"^\s*(?:question|q(?:uestion)?)[\s.:#-]*(\d+[a-z]?)?\s*$", re.I)
ANSWER_HEADING_RE = re.compile(r"(?:answer\s*/?\s*explanation|answer|solution|worked solution|mark\s*scheme|markscheme)", re.I)
METHOD_RE = re.compile(r"\b(prove|show\s+that|hence\s+show|derive|demonstrate|justify)\b", re.I)
MARK_RE = re.compile(r"\b([MABR]\d+)\b\s*[:.\-–—]?\s*(.+)", re.I)
CORRECT_LETTER_RE = re.compile(r"(?:correct\s+answer|answer)\s*[:=]?\s*(?:\\\(\s*)?(?:\\boxed\{)?(?:\\mathbf\{)?\(?\s*([A-D])\s*\)?", re.I)
MCQ_OPTION_RE = re.compile(r"^\s*\(?([A-D])\)?[.):]?\s+(.+)$", re.I)


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def same_domain(url: str) -> bool:
    return urlparse(url).netloc.lower() in DOMAIN


def normalize_url(base: str, href: str | None) -> str | None:
    if not href:
        return None
    u = urldefrag(urljoin(base, href))[0]
    p = urlparse(u)
    if p.scheme not in {"http", "https"} or p.netloc.lower() not in DOMAIN:
        return None
    return u


def session_from_env() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": "IB-Race-authorized-import/2.0 (+private study group)",
        "Accept-Language": "en-GB,en;q=0.9",
    })
    cookie = os.getenv("IITIAN_COOKIE", "").strip()
    if cookie:
        s.headers["Cookie"] = cookie
    return s


def fetch(session: requests.Session, url: str) -> str:
    r = session.get(url, timeout=35)
    r.raise_for_status()
    return r.text


def html_fragment_text(node: Tag) -> str:
    """Flatten a content element while preserving MathJax/TeX carriers."""
    frag = BeautifulSoup(str(node), "html.parser")
    for script in frag.find_all("script"):
        typ = (script.get("type") or "").lower()
        if "math/tex" in typ:
            tex = clean(script.get_text(" ", strip=True))
            script.replace_with(f"\\[{tex}\\]" if "display" in typ else f"\\({tex}\\)")
        else:
            script.decompose()
    for img in frag.find_all("img"):
        alt = clean(img.get("alt") or "")
        src = img.get("src") or img.get("data-src") or ""
        replacement = f"[Image: {alt}]" if alt else (f"[Image: {src}]" if src else "[Image]")
        img.replace_with(replacement)
    return clean(frag.get_text("\n", strip=True))


def content_root(soup: BeautifulSoup) -> Tag:
    return soup.find("main") or soup.find("article") or soup.find(class_=re.compile(r"entry-content|post-content", re.I)) or soup.body or soup


def ordered_blocks(html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    root = content_root(soup)
    # Avoid broad div selectors: parent+child duplication breaks question boundaries.
    nodes = root.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "table", "figure", "blockquote"])
    out: list[str] = []
    for node in nodes:
        text = html_fragment_text(node)
        if text and (not out or text != out[-1]):
            out.append(text)
    return out


def split_question_sections(html: str) -> list[dict]:
    """Split IITian's repeated Question -> Answer/Explanation sections."""
    blocks = ordered_blocks(html)
    sections: list[dict] = []
    cur: dict | None = None
    mode = "prompt"

    def flush():
        nonlocal cur
        if cur and clean("\n".join(cur["prompt"])):
            sections.append(cur)
        cur = None

    for block in blocks:
        plain = clean(block.replace("▶️", "").replace("✅", ""))
        if QUESTION_HEADING_RE.match(plain):
            flush()
            cur = {"prompt": [], "solution": []}
            mode = "prompt"
            continue
        if cur is None:
            continue
        # IITian uses headings such as '▶️ Answer/Explanation'. Do not
        # mistake content lines like 'Correct Answer: B' for a heading.
        if ANSWER_HEADING_RE.fullmatch(plain) or (len(plain) <= 40 and '/' in plain and ANSWER_HEADING_RE.search(plain)):
            mode = "solution"
            continue
        cur[mode].append(block)
    flush()
    return sections


def discover_leaf_pages(session: requests.Session, course: Course, max_pages: int, delay: float) -> list[tuple[str, str]]:
    """Return (url, anchor label) leaf question pages from verified course roots."""
    rx = re.compile(course.link_pattern, re.I)
    seen: set[str] = set()
    leaves: list[tuple[str, str]] = []
    for root_url in course.roots:
        try:
            soup = BeautifulSoup(fetch(session, root_url), "html.parser")
        except Exception as e:
            print(f"[warn] index fetch failed {root_url}: {e}", file=sys.stderr)
            continue
        root = content_root(soup)
        # Some IITian paper pages contain questions directly rather than only
        # linking to subtopic pages (notably some Paper 3 layouts).
        if split_question_sections(str(root)):
            title = clean((soup.find('h1') or soup.title or root).get_text(' ', strip=True))
            if root_url not in seen:
                seen.add(root_url); leaves.append((root_url, title or course.key))
                if len(leaves) >= max_pages:
                    return leaves
        for a in root.find_all("a", href=True):
            label = clean(a.get_text(" ", strip=True))
            if not rx.search(label):
                continue
            u = normalize_url(root_url, a.get("href"))
            if not u or u in seen or u.rstrip("/") == root_url.rstrip("/"):
                continue
            # Exclude obvious account/course-sales links even if labels happen to match.
            low = (label + " " + urlparse(u).path).lower()
            if any(x in low for x in ["full-access", "checkout", "cart", "login", "sign-up", "study-notes", "flashcard"]):
                continue
            seen.add(u)
            leaves.append((u, label))
            if len(leaves) >= max_pages:
                return leaves
        time.sleep(delay)
    return leaves


def infer_topic(course: Course, label: str, url: str) -> tuple[str, str]:
    text = clean(label)
    if course.subject in {"mathAA", "mathAI"}:
        m = re.search(r"(?:SL|AHL)\s*(\d+)\.(\d+)\s*(.*?)(?:\s+(?:AA|AI)\b|\s+Paper\b|$)", text, re.I)
        if m:
            topic = TOPIC_PREFIX[course.subject].get(m.group(1), f"Topic {m.group(1)}")
            sub = clean(f"{m.group(1)}.{m.group(2)} {m.group(3)}")
            return topic, sub or text
    elif course.subject == "physics":
        m = re.search(r"([A-E])\.\s*(\d+)\s*(.*?)(?:\s+(?:HL|SL)\b|\s+Paper\b|$)", text, re.I)
        if m:
            key = m.group(1).upper()
            return TOPIC_PREFIX["physics"].get(key, key), clean(f"{key}.{m.group(2)} {m.group(3)}")
    elif course.subject == "biology":
        m = re.search(r"([A-D])(\d+)\.(\d+)\s*(.*?)(?:\s*\[HL only\])?(?:\s+(?:HL|SL)\b|\s+Paper\b|$)", text, re.I)
        if m:
            key = m.group(1).upper()
            return TOPIC_PREFIX["biology"].get(key, key), clean(f"{key}{m.group(2)}.{m.group(3)} {m.group(4)}")
    elif course.subject == "economics":
        m = re.search(r"([1-4])\.(\d+)\s*(.*?)(?:\s*\(HL only\))?(?:\s+(?:HL|SL)\b|\s+Paper\b|$)", text, re.I)
        if m:
            return TOPIC_PREFIX["economics"].get(m.group(1), f"Unit {m.group(1)}"), clean(f"{m.group(1)}.{m.group(2)} {m.group(3)}")
    elif course.subject == "chemistry":
        m = re.search(r"(Structure|Reactivity)\s*(\d+)\.(\d+)\s*(.*?)(?:\s+(?:HL|SL)\b|\s+Paper\b|$)", text, re.I)
        if m:
            prefix = f"{m.group(1).title()} {m.group(2)}"
            return TOPIC_PREFIX["chemistry"].get(prefix, prefix), clean(f"{m.group(1).title()} {m.group(2)}.{m.group(3)} {m.group(4)}")
    # Safe fallback keeps imported content selectable even if IITian renames a heading.
    slug = urlparse(url).path.strip("/").split("/")[-1].replace("-", " ")
    return "Imported IITian", text or clean(slug.title())


def extract_options(prompt_blocks: list[str]) -> tuple[str, list[str] | None]:
    joined = "\n".join(prompt_blocks)
    lines = [clean(x) for x in joined.splitlines() if clean(x)]
    opts: dict[str, str] = {}
    stem: list[str] = []
    for line in lines:
        m = MCQ_OPTION_RE.match(line)
        if m:
            opts[m.group(1).upper()] = clean(m.group(2))
        else:
            stem.append(line)
    if len(opts) >= 2:
        options = [opts.get(letter, "") for letter in "ABCD"]
        if all(options):
            return "\n".join(stem), options
    # Fallback: options may have been flattened into one paragraph.
    mlist = list(re.finditer(r"(?:^|\s)\(?([A-D])\)?[.):]\s+", joined))
    if len(mlist) >= 2:
        stem_text = joined[:mlist[0].start()].strip()
        by_letter = {}
        for i, m in enumerate(mlist):
            end = mlist[i + 1].start() if i + 1 < len(mlist) else len(joined)
            by_letter[m.group(1).upper()] = clean(joined[m.end():end])
        options = [by_letter.get(letter, "") for letter in "ABCD"]
        if all(options):
            return stem_text, options
    return clean(joined), None


def extract_explicit_markscheme(solution: str) -> list[dict]:
    rows: list[dict] = []
    for line in re.split(r"[\n;]+", solution):
        m = MARK_RE.search(clean(line))
        if m:
            rows.append({"code": m.group(1).upper(), "text": clean(m.group(2)), "marks": 1})
    return rows


def extract_answer(solution: str, options: list[str] | None):
    # Normalize IITian's common TeX wrappers around answer letters, e.g.
    # Correct Answer: \\( \\boxed{\\mathrm{B}} \\).
    plain = solution
    for _ in range(3):
        plain = re.sub(r'\\(?:boxed|mathrm|mathbf|text)\{([^{}]*)\}', r'\1', plain)
    plain = plain.replace('\\(', ' ').replace('\\)', ' ').replace('\\[', ' ').replace('\\]', ' ')
    plain = plain.replace('{', ' ').replace('}', ' ')
    plain = clean(plain)
    if options:
        for pat in [
            r'correct\s+answer\s*[:=]\s*\(?\s*([A-D])\s*\)?',
            r'(?:✅\s*)?answer\s*[:=]\s*\(?\s*([A-D])\s*\)?',
            r'correct\s+answer\s+(?:is\s+)?\(?\s*([A-D])\s*\)?',
        ]:
            m = re.search(pat, plain, re.I)
            if m:
                return m.group(1).upper(), 'mcq'
        return None, None

    # Numeric boxed answer, conservative and math.js friendly.
    boxes = re.findall(r"\\boxed\{([^{}]{1,120})\}", solution)
    if boxes:
        raw = clean(boxes[-1]).replace(",", "")
        if re.fullmatch(r"[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?", raw):
            return (float(raw) if any(c in raw for c in ".eE") else int(raw)), "numeric"
        # Preserve exact/simple expressions for symbolic grading.
        if len(raw) <= 80 and not re.search(r"\\text|\\begin|\\end", raw):
            mathjs = (raw.replace("\\frac", "frac")  # handled below for very simple fractions
                          .replace("\\pi", "pi"))
            fm = re.fullmatch(r"frac\{([^{}]+)\}\{([^{}]+)\}", mathjs)
            if fm:
                return f"({fm.group(1)})/({fm.group(2)})", "expression"
    # Explicit simple final numeric answer.
    m = re.search(r"(?:answer|therefore|hence)\s*[:=]?\s*\(?\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*\)?", solution, re.I)
    if m:
        raw = m.group(1)
        return (float(raw) if any(c in raw for c in ".eE") else int(raw)), "numeric"
    return None, None


def question_id(course: Course, url: str, prompt: str) -> str:
    digest = hashlib.sha1((course.key + "\n" + url + "\n" + prompt).encode("utf-8")).hexdigest()[:14]
    return f"iitian-{course.subject}-{course.level.lower()}-{digest}"


def inferred_difficulty(course: Course, label: str, prompt: str, options, peer: bool, default: int) -> int:
    if peer:
        return 5
    text = f'{label} {prompt}'.lower()
    if course.level == 'HL' and ('ahl' in text or '[hl only]' in text or 'hl only' in text):
        return 4
    if len(prompt) > 650 or '(a)' in prompt.lower() and '(b)' in prompt.lower():
        return 4
    if options:
        return max(2, min(3, default))
    return default


def convert_section(course: Course, url: str, label: str, section: dict, difficulty: int) -> dict | None:
    prompt, options = extract_options(section["prompt"])
    solution_raw = "\n".join(section["solution"])
    solution = clean(solution_raw)
    if len(clean(prompt)) < 8 or not solution:
        return None
    topic, subtopic = infer_topic(course, label, url)
    peer = bool(METHOD_RE.search(prompt))
    markscheme = extract_explicit_markscheme(solution_raw)
    answer, answer_type = extract_answer(solution, options)

    # Race policy requested by user: peer grading only when method/proof itself is required.
    if peer:
        race_eligible = bool(markscheme)
        grading_mode = "peer"
    else:
        race_eligible = answer is not None
        grading_mode = "auto"
        if answer is None:
            return None

    effective_difficulty = inferred_difficulty(course, label, prompt, options, peer, difficulty)
    q = {
        "id": question_id(course, url, prompt),
        "subject": course.subject,
        "levels": [course.level],
        "topic": topic,
        "subtopic": subtopic,
        "difficulty": effective_difficulty,
        "prompt": prompt,
        "gradingMode": grading_mode,
        "source": "IITian Academy",
        "sourceUrl": url,
        "raceEligible": race_eligible,
        "explanation": solution,
    }
    if options:
        q["options"] = options
    if peer:
        q["marks"] = sum(int(x.get("marks", 1)) for x in markscheme) or 1
        q["markscheme"] = markscheme
    else:
        q["answer"] = answer
        q["type"] = answer_type or ("mcq" if options else "text")
        q["answerType"] = q["type"]
        if q["type"] == "numeric":
            q["tolerance"] = max(abs(float(answer)) * 1e-6, 1e-9)
    return q


def load_bank(path: Path) -> dict:
    if not path.exists():
        return {"metadata": {}, "questions": []}
    obj = json.loads(path.read_text(encoding="utf-8"))
    return obj if isinstance(obj, dict) else {"metadata": {}, "questions": obj}


def merge_bank(path: Path, incoming: list[dict], race_only: bool) -> tuple[int, int]:
    bank = load_bank(path)
    existing = {q.get("id"): q for q in bank.get("questions", []) if q.get("id")}
    before = len(existing)
    for q in incoming:
        if race_only and not q.get("raceEligible"):
            continue
        existing[q["id"]] = q
    questions = list(existing.values())
    bank["questions"] = questions
    meta = bank.setdefault("metadata", {})
    meta["authorizedImport"] = "IITian Academy"
    meta["iitianImportedQuestions"] = sum(1 for q in questions if q.get("source") == "IITian Academy")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(bank, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(questions), len(questions) - before


def run_course(session: requests.Session, course: Course, args) -> list[dict]:
    leaves = discover_leaf_pages(session, course, args.max_pages, args.delay)
    print(f"[{course.key}] discovered {len(leaves)} topic/question pages", file=sys.stderr)
    out: dict[str, dict] = {}
    for idx, (url, label) in enumerate(leaves, 1):
        try:
            html = fetch(session, url)
            sections = split_question_sections(html)
        except Exception as e:
            print(f"[warn] {course.key} {url}: {e}", file=sys.stderr)
            continue
        made = 0
        for section in sections:
            q = convert_section(course, url, label, section, args.difficulty)
            if q:
                out[q["id"]] = q
                made += 1
        print(f"[{course.key}] {idx}/{len(leaves)} {label[:65]} -> {made}", file=sys.stderr)
        time.sleep(args.delay)
    return list(out.values())


def main() -> None:
    ap = argparse.ArgumentParser(description="Authorized IITian Academy -> IB Race importer")
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true", help="Import all supported IB Race courses")
    group.add_argument("--course", action="append", choices=sorted(COURSES), help="Course key; repeatable")
    ap.add_argument("--max-pages", type=int, default=500, help="Maximum topic pages per course root set")
    ap.add_argument("--difficulty", type=int, default=3, choices=range(1, 6), help="Default imported difficulty")
    ap.add_argument("--delay", type=float, default=0.12, help="Delay between requests in seconds")
    ap.add_argument("--dry-run", action="store_true", help="Do not change banks; print summary")
    args = ap.parse_args()

    keys = list(COURSES) if args.all else args.course
    session = session_from_env()
    all_questions: dict[str, dict] = {}
    stats = {}
    for key in keys:
        qs = run_course(session, COURSES[key], args)
        stats[key] = len(qs)
        for q in qs:
            all_questions[q["id"]] = q

    questions = list(all_questions.values())
    race_ready = sum(1 for q in questions if q.get("raceEligible"))
    peer_ready = sum(1 for q in questions if q.get("gradingMode") == "peer" and q.get("raceEligible"))
    print(json.dumps({"normalized": len(questions), "raceEligible": race_ready, "peerRaceEligible": peer_ready, "courses": stats}, indent=2), file=sys.stderr)

    if args.dry_run:
        print(json.dumps({"metadata": {"source": "IITian Academy", "stats": stats}, "questions": questions}, ensure_ascii=False, indent=2))
        return

    practice_total, practice_added = merge_bank(PRACTICE, questions, race_only=False)
    race_total, race_added = merge_bank(RACE, questions, race_only=True)
    print(f"Done. Added/updated import set. Banks now: race={race_total} (+{race_added}), practice={practice_total} (+{practice_added}).")


if __name__ == "__main__":
    main()

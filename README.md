# IB Race ⚡

A lightweight head-to-head study racing app for IB students. The trial version includes **Mathematics: Analysis and Approaches HL** and **Physics HL**.

## Features

- Two-player online races via room code
- No account or custom backend required
- Choose subject, topics, number of questions, and race time
- Same generated questions for both players
- Automatic numeric marking
- Live score/progress updates
- End-of-race answer review
- Responsive UI for desktop and mobile
- Original practice-question generators (not copied from IB exams)

## Run locally

Because multiplayer uses browser networking, run it from a local web server instead of double-clicking `index.html`.

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Open another browser/device to test multiplayer.

## Publish on GitHub Pages

1. Create a new GitHub repository, e.g. `ib-race`.
2. Upload `index.html`, `styles.css`, `app.js`, and `README.md` to the repository root.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main** and folder **/(root)**.
6. Save. GitHub will provide a public URL such as `https://YOURNAME.github.io/ib-race/`.

## Multiplayer note

The trial uses **PeerJS** in the browser to connect the two players directly. That keeps GitHub Pages deployment simple and avoids requiring your own database/backend. For a larger public version, you would normally replace this with a persistent service such as Firebase, Supabase, or a small WebSocket server, which would allow matchmaking, accounts, rankings, race history, anti-cheat controls, and more reliable scaling.

## Question-bank architecture

Questions are generated in `app.js`. Each question object contains:

```js
{
  topic: "Calculus",
  prompt: "...",
  expression: "...",
  answer: 12,
  tolerance: 0.01
}
```

You can expand each topic by adding more generator templates. For production use, consider a versioned JSON question bank with tags such as:

- subject
- topic
- subtopic
- difficulty
- calculator / non-calculator
- expected answer type
- markscheme/explanation

## Academic / copyright note

The included questions are original practice questions generated for this demo. They are **not official IB questions** and should not be represented as such. If you later add official or third-party question-bank content, make sure you have the necessary rights/licence.

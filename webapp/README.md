# Glass-Box Chess — web app (Netlify-ready)

A chess game where the **engine runs entirely in your browser** (a JavaScript
port of the C++ negamax + alpha-beta + evaluation), plus a **grounded coach**
that explains every move and position using the engine's *actual* computed
numbers — so it can't hallucinate.

This folder is a self-contained static site. It deploys to Netlify with no build
step. An optional serverless function adds natural-language coaching via Gemini.

## What makes it different

Regular engines tell you *what* (a number, a move). This one shows *why*:

- **Move review** after every move: Best / Good / Inaccuracy / Mistake / Blunder,
  with the eval swing and the opponent's refutation ("after this, …xd5 wins your
  knight").
- **Explain position**: the eval broken into material / piece activity / king
  safety / bishop pair, plus the engine's plan (best move + principal variation).
- **Graduated hints**: tap once for a nudge, again for the motif, again for the
  move — so you can get *just enough* help.
- **Blunder alert** (optional "training wheels"): warns you *before* you commit a
  losing move.
- **Ask the coach**: a chat box. With a Gemini key it answers in natural language,
  grounded in the engine's facts; without a key it falls back to the deterministic
  explanations. Either way it never makes up chess.

Modes: play vs the computer (pick colour + strength) or two-player hotseat.

## Files

```
webapp/
├── index.html      UI: board (drag/tap), coach panel, chat
├── chess.js        rules (move gen, legality, FEN, SAN)
├── engine.js       search + evaluation with component breakdown
├── coach.js        grounded explanations, hints, Gemini client
├── netlify.toml    Netlify config (static + function)
└── netlify/functions/coach.js   optional Gemini proxy
```

## Run locally

It's static, so any local server works:

```
cd webapp
python -m http.server 8000
# open http://localhost:8000
```

(The Ask-coach chat works locally too — just enter your Gemini key; it calls
Google directly. Everything else — play, review, hints, blunder alert — works
fully offline.)

## Deploy to Netlify

**Option A — drag and drop (fastest):**
1. Go to Netlify → "Add new site" → "Deploy manually".
2. Drag the **`webapp`** folder onto the drop zone.
3. Done — you get a public URL. The in-browser engine and the deterministic
   coach work immediately.

**Option B — Git (recommended for updates):**
1. Push the repo to GitHub.
2. In Netlify "Import from Git", pick the repo.
3. Set **Base directory** to `webapp` (or set publish/functions to match if the
   repo root differs). The included `netlify.toml` handles the rest.

### Gemini AI coach — each user brings their own key

There is **nothing to configure on the server**, and you spend none of your own
Gemini quota. Each visitor enters their own free Gemini API key in the app:

1. In the Coach panel, paste a Gemini API key (from Google AI Studio) and click
   **Save**. The app verifies it and shows ✓ (works) or ✗ (invalid).
2. The key is stored only in that visitor's browser (`localStorage`) and is sent
   straight from their browser to Google using their own quota — it never touches
   your site's server.
3. Without a key, the chat still answers using the deterministic, engine-grounded
   explanations.

The included Netlify function is only a fallback proxy for browsers that block the
direct Google call; it, too, uses the key from the request, not a server key. To
change the model, edit `GEMINI_MODEL` in `coach.js` (default `gemini-2.0-flash`).

## Notes / tuning

- Engine strength = think time per move (the "Engine strength" dropdown). The
  search depth cap is set in `index.html` (`ENGINE_DEPTH`).
- The engine runs on the main thread; on "Max" it may briefly pause the page
  while thinking. Moving the search into a Web Worker is the natural next step.
- The JS rules are a direct port of the perft-verified C++ generator; run
  `node test_perft.js` in the sibling `web/` folder to sanity-check the shared
  logic.

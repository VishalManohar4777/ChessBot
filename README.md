# Glass-Box Chess

A from-scratch chess engine with a web front-end that doesn't just *play* you —
it **explains** every move and position using the engine's own calculations.

The project has three parts:

| Folder | What it is | Runs where |
|--------|-----------|------------|
| [`src/`](src) | The chess **engine in C++** — negamax + alpha-beta + quiescence search, with a material / piece-square / king-safety evaluation. Speaks UCI. | Desktop (compiled) |
| [`web/`](web) | A browser board that talks to the **compiled C++ engine** through a small Python bridge (UCI over stdio). | Local only (needs Python) |
| [`webapp/`](webapp) | The **deployable** app: the engine ported to JavaScript (runs in the browser) plus a **grounded AI coach**. Pure static — deploys to Netlify. | Anywhere / Netlify |

If you just want to play online, use **`webapp/`**. If you want the real C++ binary
as the opponent on your own machine, use **`web/`**.

## The standout feature — a grounded coach

Most engines give you a number. This one opens the black box: because we wrote the
engine, the UI can show the **actual** facts it computed and explain them in plain
language — so it never makes up chess.

- **Move review** after every move: Best / Good / Inaccuracy / Mistake / Blunder,
  with the eval swing and the opponent's refutation.
- **Explain position**: eval split into material / activity / king safety / bishop
  pair, plus the engine's plan and principal variation.
- **Graduated hints**: nudge → motif → the move.
- **Blunder alert**: optional warning *before* you commit a losing move.
- **Ask the coach** chat: natural-language answers via Gemini, grounded in the
  engine's facts. Each user supplies their **own** Gemini key (entered in the app,
  stored only in their browser) — so no server key and no shared quota. Without a
  key it falls back to the deterministic explanations.

## Quick starts

### Play online build locally (`webapp/`)
```
cd webapp
python -m http.server 8000      # then open http://localhost:8000
```
Static site — also deployable to Netlify (see below).

### Build & run the C++ engine (`src/`)
```
g++ -std=c++17 -O2 src/*.cpp -o chess.exe
./chess.exe                # play in the terminal
./chess.exe perft 5        # verify move generation (expect 4865609)
./chess.exe uci            # UCI mode (used by the bridge / chess GUIs)
```
On Windows + VS Code: open the folder and press **Ctrl+Shift+B** (build task in
`.vscode/`). Full notes in [`webapp/README.md`](webapp/README.md) and the build
section below.

### Browser board + real C++ engine (`web/`)
```
g++ -std=c++17 -O2 src/*.cpp -o chess.exe   # build first
cd web
python server.py            # then open http://localhost:8000
```

## Deploy `webapp/` to Netlify

Drag-and-drop or Git — see [`webapp/README.md`](webapp/README.md) for the full
walkthrough. Summary: connect the repo in Netlify and set **Base directory =
`webapp`**; the included `webapp/netlify.toml` handles the rest. No environment
variables are required (users bring their own Gemini key).

## Verifying correctness

The C++ move generator is validated with `perft` against known node counts
(startpos depth 5 = 4,865,609; plus Kiwipete and en-passant positions). The JS
port shares the same logic — run `node web/test_perft.js` to check it.

## License

Personal/educational project — use it however you like.

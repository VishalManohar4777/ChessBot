# C++ Chess Engine

An intermediate-level chess engine written in modern C++ (C++17). It plays a
full game of chess against a human in the terminal using **negamax search with
alpha-beta pruning**, a **quiescence search**, **iterative deepening**, and an
evaluation that combines **material, piece-square tables, and king safety**.

This is a teaching/hobby engine — strong enough to beat casual players, but
intentionally not a Stockfish-class engine.

## Features

- **Board representation:** 8x8 mailbox with a 10x12 border for fast
  off-board detection during move generation and attack checks.
- **Move generation:** all rules implemented — castling, en passant,
  promotions, double pawn pushes. Pseudo-legal generation plus a legality
  filter (make move → test own king → unmake).
- **Search:**
  - Negamax with alpha-beta pruning
  - Iterative deepening with a soft time limit
  - Quiescence search (captures/promotions) to avoid the horizon effect
  - MVV-LVA capture ordering + principal-variation move first
- **Evaluation:**
  - Material values
  - Piece-square tables (tapered king table for middlegame/endgame)
  - Bishop-pair bonus
  - Pawn-shield king-safety term
- **Tooling:** `perft` for move-generation verification and a `selfplay`
  mode for quick sanity checks.

## Project layout

```
ChessEngine/
├── src/
│   ├── types.h        # piece encoding, Move struct, constants
│   ├── mailbox.h      # 10x12 mailbox tables and movement offsets
│   ├── board.h/.cpp   # board state, make/unmake, attacks, FEN
│   ├── movegen.h/.cpp # pseudo-legal + legal move generation
│   ├── evaluation.h/.cpp
│   ├── search.h/.cpp  # negamax + alpha-beta + quiescence
│   └── main.cpp       # CLI game loop, perft, selfplay
├── CMakeLists.txt
├── .vscode/           # build task, debug config, IntelliSense
└── README.md
```

## Building on Windows + VS Code

You need a C++ toolchain. Two common options:

### Option A — MinGW-w64 (g++), the simplest

1. Install MinGW-w64 (e.g. via [MSYS2](https://www.msys2.org/): `pacman -S
   mingw-w64-ucrt-x86_64-gcc`) and add its `bin` folder to your `PATH`.
2. Open the `ChessEngine` folder in VS Code.
3. Install the **C/C++** extension (Microsoft).
4. Press **Ctrl+Shift+B** to run the build task → produces `chess.exe`.
5. Run it from the integrated terminal:
   ```
   .\chess.exe
   ```

Or build manually from any terminal:
```
g++ -std=c++17 -O2 src/*.cpp -o chess.exe
```

### Option B — CMake (works with MSVC or MinGW)

1. Install the **CMake Tools** extension in VS Code (plus CMake itself).
2. Open the folder, pick a kit (Visual Studio or GCC) when prompted.
3. Build with the CMake status-bar button, or:
   ```
   cmake -S . -B build
   cmake --build build --config Release
   ```
   The executable lands in `build/` (or `build/Release/` with MSVC).

## Running

Play a game (you choose color and the engine's thinking time):
```
.\chess.exe
```

Enter moves in coordinate notation: `e2e4`, `g1f3`, `e1g1` (castling),
`e7e8q` (promotion). Type `quit` to exit, `fen` to print the position.

Verify move generation with perft (compare against known values):
```
.\chess.exe perft 5
```
Expected from the starting position:

| depth | nodes      |
|-------|------------|
| 1     | 20         |
| 2     | 400        |
| 3     | 8,902      |
| 4     | 197,281    |
| 5     | 4,865,609  |

Quick engine-vs-engine sanity check (200 ms/move, 30 moves):
```
.\chess.exe selfplay 200 30
```

## Ideas for going further

Transposition tables (Zobrist hashing), killer/history move ordering, null-move
pruning, late-move reductions, a small opening book, and a UCI interface so the
engine can plug into GUIs like Arena or CuteChess.

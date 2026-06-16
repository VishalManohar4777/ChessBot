/* ------------------------------------------------------------------
 * engine.js — search + evaluation, ported from the C++ engine.
 *
 * Adds a "glass box" layer on top of the classic engine:
 *   - evalDetailed(): the evaluation split into material / position /
 *     king-safety / bishop-pair components (the coach's ground truth).
 *   - analyze():  best move, score, principal variation, eval breakdown.
 *   - classify(): rates a played move (best/good/…/blunder) by the
 *     eval swing vs. the engine's best, plus the refutation line.
 *
 * Depends on chess.js (window.Chess).
 * ------------------------------------------------------------------ */
(function (root) {
  "use strict";
  const C = root.Chess || (typeof require !== "undefined" ? require("./chess.js") : null);
  const now = (typeof performance !== "undefined" && performance.now)
    ? () => performance.now() : () => Date.now();

  const INF = 1000000, MATE = 100000;
  const MAT = [0, 100, 320, 330, 500, 900, 0];          // by PieceType
  const ORDER = [0, 100, 320, 330, 500, 900, 20000];    // for MVV-LVA

  // Piece-square tables (a8-first). White reads [sq^56], Black reads [sq].
  const PST_PAWN = [
    0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10,
    5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5,
    5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0
  ];
  const PST_KNIGHT = [
    -50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30,
    -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30,
    -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50
  ];
  const PST_BISHOP = [
    -20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10,
    -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10,
    -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20
  ];
  const PST_ROOK = [
    0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5,
    -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
    -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0
  ];
  const PST_QUEEN = [
    -20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10,
    -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10,
    -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20
  ];
  const PST_KING_MG = [
    -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
    20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20
  ];
  const PST_KING_EG = [
    -50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30,
    -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30,
    -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50
  ];
  const pst = (table, sq, color) => (color === C.WHITE ? table[sq ^ 56] : table[sq]);

  function gamePhase(s) {
    let phase = 0;
    for (let i = 0; i < 64; i++) {
      switch (C.pieceType(s.board[i])) {
        case C.KNIGHT: case C.BISHOP: phase += 1; break;
        case C.ROOK: phase += 2; break;
        case C.QUEEN: phase += 4; break;
      }
    }
    return phase > 24 ? 24 : phase;
  }

  function pawnShield(s, color) {
    const ksq = C.kingSquare(s, color);
    if (ksq < 0) return 0;
    const kfile = ksq % 8, krank = ksq >> 3;
    if (color === C.WHITE && krank > 2) return 0;
    if (color === C.BLACK && krank < 5) return 0;
    const dir = color === C.WHITE ? 8 : -8;
    const pawn = color === C.WHITE ? C.PAWN : -C.PAWN;
    let bonus = 0;
    for (let df = -1; df <= 1; df++) {
      const f = kfile + df; if (f < 0 || f > 7) continue;
      const front = ksq + dir + df;
      if (front >= 0 && front < 64 && s.board[front] === pawn) bonus += 10;
    }
    return bonus;
  }

  // Fast white-relative evaluation (search hot path).
  function evalWhite(s) {
    let score = 0; const phase = gamePhase(s);
    let wb = 0, bb = 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = s.board[sq]; if (p === 0) continue;
      const type = C.pieceType(p), color = C.pieceColor(p), sign = color === C.WHITE ? 1 : -1;
      let val = MAT[type];
      switch (type) {
        case C.PAWN:   val += pst(PST_PAWN, sq, color); break;
        case C.KNIGHT: val += pst(PST_KNIGHT, sq, color); break;
        case C.BISHOP: val += pst(PST_BISHOP, sq, color); (color === C.WHITE ? wb++ : bb++); break;
        case C.ROOK:   val += pst(PST_ROOK, sq, color); break;
        case C.QUEEN:  val += pst(PST_QUEEN, sq, color); break;
        case C.KING: {
          const mg = pst(PST_KING_MG, sq, color), eg = pst(PST_KING_EG, sq, color);
          val += Math.trunc((mg * phase + eg * (24 - phase)) / 24); break;
        }
      }
      score += sign * val;
    }
    if (wb >= 2) score += 30;
    if (bb >= 2) score -= 30;
    score += Math.trunc((pawnShield(s, C.WHITE) - pawnShield(s, C.BLACK)) * phase / 24);
    return score;
  }

  // Detailed breakdown for the coach (white-relative components, cp).
  function evalDetailed(s) {
    const phase = gamePhase(s);
    const mat = { w: 0, b: 0 }, posn = { w: 0, b: 0 };
    let wb = 0, bb = 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = s.board[sq]; if (p === 0) continue;
      const type = C.pieceType(p), color = C.pieceColor(p);
      const side = color === C.WHITE ? "w" : "b";
      mat[side] += MAT[type];
      let pv = 0;
      switch (type) {
        case C.PAWN: pv = pst(PST_PAWN, sq, color); break;
        case C.KNIGHT: pv = pst(PST_KNIGHT, sq, color); break;
        case C.BISHOP: pv = pst(PST_BISHOP, sq, color); (color === C.WHITE ? wb++ : bb++); break;
        case C.ROOK: pv = pst(PST_ROOK, sq, color); break;
        case C.QUEEN: pv = pst(PST_QUEEN, sq, color); break;
        case C.KING: {
          const mg = pst(PST_KING_MG, sq, color), eg = pst(PST_KING_EG, sq, color);
          pv = Math.trunc((mg * phase + eg * (24 - phase)) / 24); break;
        }
      }
      posn[side] += pv;
    }
    const bishop = { w: wb >= 2 ? 30 : 0, b: bb >= 2 ? 30 : 0 };
    const ks = {
      w: Math.trunc(pawnShield(s, C.WHITE) * phase / 24),
      b: Math.trunc(pawnShield(s, C.BLACK) * phase / 24)
    };
    const whiteCp = (mat.w - mat.b) + (posn.w - posn.b) + (bishop.w - bishop.b) + (ks.w - ks.b);
    return { phase, whiteCp, material: mat, position: posn, bishopPair: bishop, kingSafety: ks };
  }

  const evalStm = (s) => (s.side === C.WHITE ? evalWhite(s) : -evalWhite(s));

  function scoreAndSort(moves) {
    for (const m of moves) {
      if (m.captured) m.score = ORDER[C.pieceType(m.captured)] * 10 - ORDER[C.pieceType(m.piece)];
      else if (m.flag === C.FLAG_PROMO) m.score = ORDER[m.promotion];
      else m.score = 0;
    }
    moves.sort((a, b) => b.score - a.score);
  }
  const sameMove = (a, b) => a && b && a.from === b.from && a.to === b.to && a.promotion === b.promotion;

  function quiesce(s, alpha, beta, ctx) {
    ctx.nodes++;
    let stand = evalStm(s);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    const caps = C.generate(s, true); scoreAndSort(caps);
    for (const m of caps) {
      const ns = C.makeMove(s, m);
      if (C.isSquareAttacked(ns, C.kingSquare(ns, s.side), ns.side)) continue;
      const sc = -quiesce(ns, -beta, -alpha, ctx);
      if (ctx.stop) return 0;
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  function negamax(s, depth, alpha, beta, ply, ctx) {
    if ((++ctx.nodes & 1023) === 0 && now() > ctx.deadline) ctx.stop = true;
    if (ctx.stop) return 0;
    if (depth === 0) return quiesce(s, alpha, beta, ctx);
    const moves = C.generate(s, false); scoreAndSort(moves);
    let legal = 0, best = -INF;
    for (const m of moves) {
      const ns = C.makeMove(s, m);
      if (C.isSquareAttacked(ns, C.kingSquare(ns, s.side), ns.side)) continue;
      legal++;
      const sc = -negamax(ns, depth - 1, -beta, -alpha, ply + 1, ctx);
      if (ctx.stop) return 0;
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    if (legal === 0) return C.inCheck(s, s.side) ? -MATE + ply : 0;
    return best;
  }

  // Root search with iterative deepening. opts: {depth, timeMs}
  function search(s, opts) {
    opts = opts || {};
    const maxDepth = opts.depth || 4, timeMs = opts.timeMs || 800;
    const ctx = { nodes: 0, deadline: now() + timeMs, stop: false };
    const root = C.legalMoves(s);
    if (root.length === 0) return { move: null, scoreStm: 0, depth: 0, nodes: 0 };

    let bestMove = root[0], bestScore = -INF, doneDepth = 0;
    for (let depth = 1; depth <= maxDepth; depth++) {
      let alpha = -INF, beta = INF, localBest = bestMove, localScore = -INF;
      scoreAndSort(root);
      for (const m of root) if (sameMove(m, bestMove)) m.score += 1e7;
      root.sort((a, b) => b.score - a.score);
      for (const m of root) {
        const ns = C.makeMove(s, m);
        const sc = -negamax(ns, depth - 1, -beta, -alpha, 1, ctx);
        if (ctx.stop) break;
        if (sc > localScore) { localScore = sc; localBest = m; }
        if (sc > alpha) alpha = sc;
      }
      if (!ctx.stop) { bestMove = localBest; bestScore = localScore; doneDepth = depth; }
      if (ctx.stop) break;
      if (bestScore > MATE - 1000 || bestScore < -MATE + 1000) break;
    }
    return { move: bestMove, scoreStm: bestScore, depth: doneDepth, nodes: ctx.nodes };
  }

  function mateInfo(scoreStm) {
    if (scoreStm > MATE - 1000) return { side: 1, plies: MATE - scoreStm };
    if (scoreStm < -MATE + 1000) return { side: -1, plies: MATE + scoreStm };
    return null;
  }

  const PIECE_NAME = { 1: "pawn", 2: "knight", 3: "bishop", 4: "rook", 5: "queen", 6: "king" };

  // Full analysis of a position (for "Explain" / hints / engine narration).
  function analyze(s, opts) {
    opts = opts || {};
    const res = search(s, { depth: opts.depth || 4, timeMs: opts.timeMs || 800 });
    const st = C.status(s);
    if (!res.move) return { none: true, status: st, detail: evalDetailed(s) };

    const bestSan = C.toSAN(s, res.move);
    const scoreWhite = s.side === C.WHITE ? res.scoreStm : -res.scoreStm;
    const mate = mateInfo(res.scoreStm);

    // Principal variation via short follow-up searches (kept cheap).
    const pv = [];
    let cur = s;
    for (let i = 0; i < 6; i++) {
      const r = search(cur, { depth: Math.min(3, opts.depth || 4), timeMs: 120 });
      if (!r.move) break;
      pv.push(C.toSAN(cur, r.move));
      cur = C.makeMove(cur, r.move);
      if (C.status(cur).over) break;
    }
    return {
      none: false, status: st, bestMove: res.move, bestSan,
      scoreWhite, scoreStm: res.scoreStm, depth: res.depth, mate, pv,
      detail: evalDetailed(s)
    };
  }

  // Rate a played move against the engine's best. opts: {depth, timeMs}
  function classify(sBefore, move, opts) {
    opts = opts || {};
    const d = opts.depth || 3, t = opts.timeMs || 350;
    const player = sBefore.side;

    const best = search(sBefore, { depth: d, timeMs: t });
    const bestStm = best.scoreStm; // player's perspective

    const after = C.makeMove(sBefore, move);
    const stAfter = C.status(after);
    let afterForPlayer, refMove = null, refSan = null, refCapture = null;

    if (stAfter.over && stAfter.reason === "checkmate") {
      afterForPlayer = MATE;            // player just delivered mate
    } else if (stAfter.over) {
      afterForPlayer = 0;               // stalemate / draw
    } else {
      const reply = search(after, { depth: d, timeMs: t });
      afterForPlayer = -reply.scoreStm; // opponent best -> player's eval
      if (reply.move) {
        refMove = reply.move;
        refSan = C.toSAN(after, reply.move);
        if (reply.move.captured) refCapture = PIECE_NAME[C.pieceType(reply.move.captured)];
      }
    }

    const loss = Math.max(0, Math.round(bestStm - afterForPlayer));
    let quality;
    if (sameMove(move, best.move)) quality = "best";
    else if (loss < 25) quality = "good";
    else if (loss < 90) quality = "inaccuracy";
    else if (loss < 250) quality = "mistake";
    else quality = "blunder";

    const bestScoreWhite = player === C.WHITE ? bestStm : -bestStm;
    return {
      quality, lossCp: loss,
      bestMove: best.move, bestSan: best.move ? C.toSAN(sBefore, best.move) : null,
      bestScoreWhite,
      playedSan: C.toSAN(sBefore, move),
      refMove, refSan, refCapture,
      gaveMate: stAfter.over && stAfter.reason === "checkmate",
      mate: mateInfo(bestStm)
    };
  }

  const API = { evalWhite, evalDetailed, search, analyze, classify, mateInfo, PIECE_NAME, MAT };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.Engine = API;
})(typeof window !== "undefined" ? window : globalThis);

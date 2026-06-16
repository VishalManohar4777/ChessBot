/* ------------------------------------------------------------------
 * coach.js — turns engine analysis into human guidance.
 *
 * Everything here is GROUNDED: it only ever describes numbers and lines
 * the engine actually computed (eval components, best move, refutation,
 * principal variation), so it cannot hallucinate chess.
 *
 * Two layers:
 *   - Deterministic text (always available, zero config).
 *   - Optional Gemini polish via the Netlify function (if a key is set).
 *
 * Depends on chess.js and engine.js.
 * ------------------------------------------------------------------ */
(function (root) {
  "use strict";
  const C = root.Chess, E = root.Engine;

  const QUALITY = {
    best:       { label: "Best", symbol: "★", cls: "q-best" },
    good:       { label: "Good", symbol: "✓", cls: "q-good" },
    inaccuracy: { label: "Inaccuracy", symbol: "?!", cls: "q-inacc" },
    mistake:    { label: "Mistake", symbol: "?", cls: "q-mist" },
    blunder:    { label: "Blunder", symbol: "??", cls: "q-blun" }
  };

  function pawns(cp) {
    const v = (Math.abs(cp) / 100).toFixed(1);
    return v;
  }

  function evalPhrase(cpWhite) {
    const a = Math.abs(cpWhite);
    if (a < 30) return "The position is roughly equal";
    const who = cpWhite > 0 ? "White" : "Black";
    let mag;
    if (a < 90) mag = "is slightly better";
    else if (a < 200) mag = "is better";
    else if (a < 500) mag = "is clearly better";
    else mag = "is winning";
    return `${who} ${mag} (${cpWhite > 0 ? "+" : "−"}${pawns(cpWhite)})`;
  }

  function givesCheck(s, move) {
    const ns = C.makeMove(s, move);
    return C.inCheck(ns, ns.side);
  }

  // ---- Feedback on a move that was just played -------------------
  function explainMove(cls, sBefore) {
    const q = QUALITY[cls.quality];
    if (cls.gaveMate) return { q, text: `Checkmate — clean finish! (${cls.playedSan})` };

    if (cls.quality === "best")
      return { q, text: `${cls.playedSan} — best move. ${E ? "" : ""}You found the engine's top choice.` };

    let text = `${cls.playedSan} is ${q.label.toLowerCase()}`;
    if (cls.lossCp >= 25) text += ` (gives up about ${pawns(cls.lossCp)} pawns)`;
    text += ". ";

    if (cls.refCapture)
      text += `After it, your opponent's ${cls.refSan} wins your ${cls.refCapture}. `;
    else if (cls.refSan)
      text += `Your opponent's strongest reply is ${cls.refSan}. `;

    if (cls.bestSan && cls.bestSan !== cls.playedSan)
      text += `The engine preferred ${cls.bestSan}.`;
    return { q, text: text.trim() };
  }

  // ---- Explain the current position ------------------------------
  function explainPosition(an) {
    if (an.none) {
      if (an.status.reason === "checkmate") return "Checkmate — the game is over.";
      if (an.status.reason === "stalemate") return "Stalemate — it's a draw.";
      return "No legal moves — the game is over.";
    }
    const d = an.detail;
    let text = evalPhrase(d.whiteCp) + ". ";

    // Name the dominant factor (largest white-relative component gap).
    const factors = [
      ["material", d.material.w - d.material.b],
      ["piece activity", d.position.w - d.position.b],
      ["king safety", d.kingSafety.w - d.kingSafety.b],
      ["the bishop pair", d.bishopPair.w - d.bishopPair.b]
    ].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (Math.abs(factors[0][1]) >= 20) {
      const f = factors[0];
      const who = f[1] > 0 ? "White" : "Black";
      text += `The main factor is ${f[0]} (favouring ${who}). `;
    }

    if (an.mate) {
      const side = an.mate.side > 0 ? "the side to move" : "the opponent";
      text += `There is a forced mate in ${Math.ceil(an.mate.plies / 2)} for ${side}. `;
    }
    text += `The engine suggests ${an.bestSan}`;
    if (an.pv && an.pv.length > 1) text += `, expecting: ${an.pv.join(" ")}`;
    text += ".";
    return text;
  }

  // ---- Graduated hints (1 = nudge, 2 = motif, 3 = the move) ------
  function hint(level, an, sBefore) {
    if (an.none) return "The game is over — no hint to give.";
    const bm = an.bestMove;
    const pieceName = E.PIECE_NAME[C.pieceType(bm.piece)];
    const fromSq = C.squareName(bm.from);
    const isCap = !!bm.captured;
    const isCheck = givesCheck(sBefore, bm);
    const isCastle = bm.flag === C.FLAG_CASTLE_K || bm.flag === C.FLAG_CASTLE_Q;

    if (level <= 1) {
      if (an.mate) return "Hint: there's a forcing sequence here — look for checks and captures.";
      if (isCastle) return "Hint: think about getting your king to safety.";
      if (isCap) return "Hint: there's a favourable capture available — look for it.";
      if (isCheck) return "Hint: a checking move is strong in this position.";
      const d = an.detail;
      const meKS = sBefore.side === C.WHITE ? d.kingSafety.w : d.kingSafety.b;
      if (meKS <= 0 && d.phase > 10) return "Hint: your king could be safer — consider castling or shoring up its pawns.";
      return `Hint: your most promising piece to improve is the ${pieceName}.`;
    }
    if (level === 2) {
      let t = `Hint: look at your ${pieceName} on ${fromSq}`;
      if (isCap) t += " — it can win material";
      else if (isCheck) t += " — it can deliver a check";
      else if (isCastle) t += " — castling is the idea";
      return t + ".";
    }
    return `Hint: the engine plays ${an.bestSan} (${C.moveToUci(bm)}).`;
  }

  // ---- Facts payload for the optional LLM ------------------------
  function buildFacts(an, lastCls) {
    const facts = { engine: "in-browser negamax+alpha-beta, depth-limited" };
    if (!an.none) {
      const d = an.detail;
      facts.sideToMove = an.status ? null : null;
      facts.evalWhitePawns = +(d.whiteCp / 100).toFixed(2);
      facts.evalSummary = evalPhrase(d.whiteCp);
      facts.components = {
        materialDiff: d.material.w - d.material.b,
        activityDiff: d.position.w - d.position.b,
        kingSafetyDiff: d.kingSafety.w - d.kingSafety.b,
        bishopPairDiff: d.bishopPair.w - d.bishopPair.b
      };
      facts.engineBestMove = an.bestSan;
      facts.principalVariation = an.pv;
      if (an.mate) facts.forcedMateInMoves = Math.ceil(an.mate.plies / 2) * an.mate.side;
    }
    if (lastCls) {
      facts.lastMove = {
        san: lastCls.playedSan, quality: lastCls.quality,
        pawnsLost: +(lastCls.lossCp / 100).toFixed(2),
        enginePreferred: lastCls.bestSan,
        opponentRefutation: lastCls.refSan || null,
        refutationWinsYour: lastCls.refCapture || null
      };
    }
    return facts;
  }

  // ---- Gemini coach (each user supplies their OWN API key) ------
  // The key is entered in the UI and sent straight from the browser to
  // Google with the user's own quota — your deployment stores no key.
  const GEMINI_MODEL = "gemini-2.0-flash";
  const SYSTEM =
    "You are a friendly, concise chess coach for a club-level player. " +
    "Use ONLY the FACTS below — they come from a chess engine and are correct. " +
    "Never invent moves, evaluations, or variations not in FACTS. " +
    "If FACTS don't answer the question, give general guidance from the eval components. " +
    "Keep replies under 90 words, concrete and encouraging. Use standard notation.";

  function buildPrompt(question, facts) {
    return `${SYSTEM}\n\nFACTS (JSON):\n${JSON.stringify(facts, null, 2)}\n\n` +
           `PLAYER QUESTION: ${question || "Coach me on this position."}`;
  }
  function extractText(data) {
    try { return (data.candidates[0].content.parts || []).map((p) => p.text).join("").trim(); }
    catch (e) { return ""; }
  }

  // Returns { status: 'ok'|'nokey'|'badkey'|'error', text?, detail? }
  async function askLLM(question, facts, apiKey) {
    if (!apiKey) return { status: "nokey" };
    const prompt = buildPrompt(question, facts);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 300 }
    };
    // 1) Direct browser -> Gemini (uses the user's own key/quota).
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (r.status === 400 || r.status === 403) return { status: "badkey", detail: (await r.text()).slice(0, 160) };
      if (!r.ok) return { status: "error", detail: "HTTP " + r.status };
      return { status: "ok", text: extractText(await r.json()) };
    } catch (e) {
      // 2) Fallback through the Netlify function if direct calls are blocked.
      try {
        const r2 = await fetch("/.netlify/functions/coach", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, facts, apiKey })
        });
        if (r2.status === 400 || r2.status === 403) return { status: "badkey" };
        if (!r2.ok) return { status: "error", detail: "HTTP " + r2.status };
        const data = await r2.json();
        return { status: "ok", text: data.text };
      } catch (e2) {
        return { status: "error", detail: String(e) };
      }
    }
  }

  // Quick connectivity/validity check for a key (uses a tiny request).
  const validateKey = (apiKey) => askLLM("Reply with the single word OK.", { test: true }, apiKey);

  root.Coach = { QUALITY, evalPhrase, explainMove, explainPosition, hint, buildFacts, askLLM, validateKey, pawns };
})(typeof window !== "undefined" ? window : globalThis);

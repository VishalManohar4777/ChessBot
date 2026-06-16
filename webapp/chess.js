/* ------------------------------------------------------------------
 * chess.js — full chess rules (move generation, legality, FEN).
 * Direct port of the C++ engine's mailbox generator.
 * Piece encoding: white = +1..+6, black = -1..-6, 0 empty.
 * Exposes pseudo-move generation (`generate`) so engine.js can search
 * efficiently (one board clone per move via make + king-safety test).
 * ------------------------------------------------------------------ */
(function (root) {
  "use strict";

  const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  const WHITE = 0, BLACK = 1;
  const FLAG_NORMAL = 0, FLAG_DOUBLE = 1, FLAG_ENPASSANT = 2,
        FLAG_CASTLE_K = 3, FLAG_CASTLE_Q = 4, FLAG_PROMO = 5;
  const C_WK = 1, C_WQ = 2, C_BK = 4, C_BQ = 8;

  const MAILBOX = [
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    -1,  0,  1,  2,  3,  4,  5,  6,  7, -1,
    -1,  8,  9, 10, 11, 12, 13, 14, 15, -1,
    -1, 16, 17, 18, 19, 20, 21, 22, 23, -1,
    -1, 24, 25, 26, 27, 28, 29, 30, 31, -1,
    -1, 32, 33, 34, 35, 36, 37, 38, 39, -1,
    -1, 40, 41, 42, 43, 44, 45, 46, 47, -1,
    -1, 48, 49, 50, 51, 52, 53, 54, 55, -1,
    -1, 56, 57, 58, 59, 60, 61, 62, 63, -1,
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1
  ];
  const MAILBOX64 = [
    21, 22, 23, 24, 25, 26, 27, 28,
    31, 32, 33, 34, 35, 36, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48,
    51, 52, 53, 54, 55, 56, 57, 58,
    61, 62, 63, 64, 65, 66, 67, 68,
    71, 72, 73, 74, 75, 76, 77, 78,
    81, 82, 83, 84, 85, 86, 87, 88,
    91, 92, 93, 94, 95, 96, 97, 98
  ];
  const KNIGHT_OFF = [-21, -19, -12, -8, 8, 12, 19, 21];
  const KING_OFF   = [-11, -10, -9, -1, 1, 9, 10, 11];
  const BISHOP_OFF = [-11, -9, 9, 11];
  const ROOK_OFF   = [-10, -1, 1, 10];
  const QUEEN_OFF  = [-11, -10, -9, -1, 1, 9, 10, 11];

  const pieceType  = (p) => (p < 0 ? -p : p);
  const pieceColor = (p) => (p > 0 ? WHITE : BLACK);
  const squareName = (sq) =>
    String.fromCharCode(97 + (sq % 8)) + String.fromCharCode(49 + (sq >> 3));

  function newState() {
    return { board: new Int8Array(64), side: WHITE, castling: 0, ep: -1, halfmove: 0, fullmove: 1 };
  }
  function cloneState(s) {
    return { board: Int8Array.from(s.board), side: s.side, castling: s.castling,
             ep: s.ep, halfmove: s.halfmove, fullmove: s.fullmove };
  }
  function startPosition() {
    const s = newState(); const b = s.board;
    b[0]=ROOK;b[1]=KNIGHT;b[2]=BISHOP;b[3]=QUEEN;b[4]=KING;b[5]=BISHOP;b[6]=KNIGHT;b[7]=ROOK;
    for (let i=8;i<16;i++) b[i]=PAWN;
    b[56]=-ROOK;b[57]=-KNIGHT;b[58]=-BISHOP;b[59]=-QUEEN;b[60]=-KING;b[61]=-BISHOP;b[62]=-KNIGHT;b[63]=-ROOK;
    for (let i=48;i<56;i++) b[i]=-PAWN;
    s.castling = C_WK|C_WQ|C_BK|C_BQ;
    return s;
  }

  function kingSquare(s, color) {
    const target = color === WHITE ? KING : -KING;
    for (let i=0;i<64;i++) if (s.board[i]===target) return i;
    return -1;
  }

  function isSquareAttacked(s, square, byColor) {
    const b = s.board, f = square % 8;
    if (byColor === WHITE) {
      if (f>0 && square-9>=0 && b[square-9]===PAWN) return true;
      if (f<7 && square-7>=0 && b[square-7]===PAWN) return true;
    } else {
      if (f<7 && square+9<64 && b[square+9]===-PAWN) return true;
      if (f>0 && square+7<64 && b[square+7]===-PAWN) return true;
    }
    const base = MAILBOX64[square];
    const knight = byColor===WHITE ? KNIGHT : -KNIGHT;
    for (let i=0;i<8;i++){ const n=MAILBOX[base+KNIGHT_OFF[i]]; if (n!==-1 && b[n]===knight) return true; }
    const king = byColor===WHITE ? KING : -KING;
    for (let i=0;i<8;i++){ const n=MAILBOX[base+KING_OFF[i]]; if (n!==-1 && b[n]===king) return true; }
    for (let i=0;i<4;i++){ let idx=base; while(true){ idx+=BISHOP_OFF[i]; const n=MAILBOX[idx]; if(n===-1)break; const p=b[n];
      if(p!==0){ if(pieceColor(p)===byColor){ const t=pieceType(p); if(t===BISHOP||t===QUEEN) return true; } break; } } }
    for (let i=0;i<4;i++){ let idx=base; while(true){ idx+=ROOK_OFF[i]; const n=MAILBOX[idx]; if(n===-1)break; const p=b[n];
      if(p!==0){ if(pieceColor(p)===byColor){ const t=pieceType(p); if(t===ROOK||t===QUEEN) return true; } break; } } }
    return false;
  }
  const inCheck = (s, color) => isSquareAttacked(s, kingSquare(s, color), color ^ 1);

  function mk(from,to,piece,captured,flag,promotion){
    return { from, to, piece, captured: captured||0, flag: flag||0, promotion: promotion||0 };
  }

  function generate(s, capturesOnly) {
    const b = s.board, us = s.side, them = us ^ 1, moves = [];
    for (let from=0; from<64; from++) {
      const p = b[from];
      if (p===0 || pieceColor(p)!==us) continue;
      const type = pieceType(p), base = MAILBOX64[from], file = from%8, rank = from>>3;

      if (type===PAWN) {
        const dir = us===WHITE?8:-8, startRank = us===WHITE?1:6, promoRank = us===WHITE?6:1;
        const one = from+dir;
        if (one>=0 && one<64 && b[one]===0) {
          const promo = rank===promoRank;
          if (!capturesOnly || promo) {
            if (promo) for (let pt=QUEEN; pt>=KNIGHT; pt--) moves.push(mk(from,one,p,0,FLAG_PROMO,pt));
            else moves.push(mk(from,one,p,0,FLAG_NORMAL,0));
          }
          if (!capturesOnly && rank===startRank) { const two=from+2*dir; if (b[two]===0) moves.push(mk(from,two,p,0,FLAG_DOUBLE,0)); }
        }
        const caps=[dir-1,dir+1], guard=[file>0,file<7];
        for (let i=0;i<2;i++){ if(!guard[i])continue; const to=from+caps[i]; if(to<0||to>=64)continue;
          const target=b[to];
          if (target!==0 && pieceColor(target)===them) {
            const promo = rank===promoRank;
            if (promo) for (let pt=QUEEN; pt>=KNIGHT; pt--) moves.push(mk(from,to,p,target,FLAG_PROMO,pt));
            else moves.push(mk(from,to,p,target,FLAG_NORMAL,0));
          } else if (to===s.ep && s.ep!==-1) {
            moves.push(mk(from,to,p, us===WHITE?-PAWN:PAWN, FLAG_ENPASSANT,0));
          }
        }
      } else if (type===KNIGHT) {
        for (let i=0;i<8;i++){ const n=MAILBOX[base+KNIGHT_OFF[i]]; if(n===-1)continue; const t=b[n];
          if(t===0){ if(!capturesOnly) moves.push(mk(from,n,p,0,FLAG_NORMAL,0)); }
          else if(pieceColor(t)===them) moves.push(mk(from,n,p,t,FLAG_NORMAL,0)); }
      } else if (type===KING) {
        for (let i=0;i<8;i++){ const n=MAILBOX[base+KING_OFF[i]]; if(n===-1)continue; const t=b[n];
          if(t===0){ if(!capturesOnly) moves.push(mk(from,n,p,0,FLAG_NORMAL,0)); }
          else if(pieceColor(t)===them) moves.push(mk(from,n,p,t,FLAG_NORMAL,0)); }
        if (!capturesOnly) {
          if (us===WHITE && from===4) {
            if ((s.castling&C_WK) && b[5]===0 && b[6]===0 && b[7]===ROOK &&
                !isSquareAttacked(s,4,them)&&!isSquareAttacked(s,5,them)&&!isSquareAttacked(s,6,them))
              moves.push(mk(4,6,p,0,FLAG_CASTLE_K,0));
            if ((s.castling&C_WQ) && b[3]===0 && b[2]===0 && b[1]===0 && b[0]===ROOK &&
                !isSquareAttacked(s,4,them)&&!isSquareAttacked(s,3,them)&&!isSquareAttacked(s,2,them))
              moves.push(mk(4,2,p,0,FLAG_CASTLE_Q,0));
          }
          if (us===BLACK && from===60) {
            if ((s.castling&C_BK) && b[61]===0 && b[62]===0 && b[63]===-ROOK &&
                !isSquareAttacked(s,60,them)&&!isSquareAttacked(s,61,them)&&!isSquareAttacked(s,62,them))
              moves.push(mk(60,62,p,0,FLAG_CASTLE_K,0));
            if ((s.castling&C_BQ) && b[59]===0 && b[58]===0 && b[57]===0 && b[56]===-ROOK &&
                !isSquareAttacked(s,60,them)&&!isSquareAttacked(s,59,them)&&!isSquareAttacked(s,58,them))
              moves.push(mk(60,58,p,0,FLAG_CASTLE_Q,0));
          }
        }
      } else {
        let off, n;
        if (type===BISHOP){off=BISHOP_OFF;n=4;} else if (type===ROOK){off=ROOK_OFF;n=4;} else {off=QUEEN_OFF;n=8;}
        for (let i=0;i<n;i++){ let idx=base; while(true){ idx+=off[i]; const t=MAILBOX[idx]; if(t===-1)break;
          const target=b[t];
          if(target===0){ if(!capturesOnly) moves.push(mk(from,t,p,0,FLAG_NORMAL,0)); }
          else { if(pieceColor(target)===them) moves.push(mk(from,t,p,target,FLAG_NORMAL,0)); break; } } }
      }
    }
    return moves;
  }

  function makeMove(s, m) {
    const ns = cloneState(s), b = ns.board, color = s.side, from = m.from, to = m.to;
    ns.ep = -1; b[from] = 0;
    if (m.flag===FLAG_ENPASSANT){ const capSq = color===WHITE?to-8:to+8; b[capSq]=0; }
    if (m.flag===FLAG_PROMO) b[to] = color===WHITE ? m.promotion : -m.promotion; else b[to] = m.piece;
    if (m.flag===FLAG_CASTLE_K){ if(color===WHITE){b[5]=b[7];b[7]=0;}else{b[61]=b[63];b[63]=0;} }
    else if (m.flag===FLAG_CASTLE_Q){ if(color===WHITE){b[3]=b[0];b[0]=0;}else{b[59]=b[56];b[56]=0;} }
    if (m.flag===FLAG_DOUBLE) ns.ep = color===WHITE ? from+8 : from-8;
    if (pieceType(m.piece)===KING){ if(color===WHITE) ns.castling&=~(C_WK|C_WQ); else ns.castling&=~(C_BK|C_BQ); }
    const touch=(sq)=>{ if(sq===0)ns.castling&=~C_WQ; else if(sq===7)ns.castling&=~C_WK; else if(sq===56)ns.castling&=~C_BQ; else if(sq===63)ns.castling&=~C_BK; };
    touch(from); touch(to);
    if (pieceType(m.piece)===PAWN || m.captured!==0) ns.halfmove=0; else ns.halfmove++;
    if (color===BLACK) ns.fullmove++;
    ns.side = color ^ 1;
    return ns;
  }

  function legalMoves(s) {
    const out = [], pseudo = generate(s, false), mover = s.side;
    for (const m of pseudo) { const ns = makeMove(s, m);
      if (!isSquareAttacked(ns, kingSquare(ns, mover), ns.side)) out.push(m); }
    return out;
  }
  const legalMovesFrom = (s, from) => legalMoves(s).filter((m) => m.from === from);

  function status(s) {
    const moves = legalMoves(s), check = inCheck(s, s.side);
    if (moves.length === 0) {
      if (check) return { over:true, reason:"checkmate", winner: s.side^1, check:true };
      return { over:true, reason:"stalemate", winner:-1, check:false };
    }
    if (s.halfmove >= 100) return { over:true, reason:"fifty-move", winner:-1, check };
    return { over:false, reason:"", winner:-1, check };
  }

  function pieceToChar(p) {
    let c="."; switch(pieceType(p)){case PAWN:c="p";break;case KNIGHT:c="n";break;case BISHOP:c="b";break;
      case ROOK:c="r";break;case QUEEN:c="q";break;case KING:c="k";break;default:return ".";}
    return p>0 ? c.toUpperCase() : c;
  }
  function toFEN(s) {
    let fen="";
    for (let rank=7; rank>=0; rank--){ let empty=0;
      for (let file=0; file<8; file++){ const p=s.board[rank*8+file];
        if(p===0) empty++; else { if(empty){fen+=empty;empty=0;} fen+=pieceToChar(p); } }
      if(empty)fen+=empty; if(rank)fen+="/"; }
    fen += s.side===WHITE ? " w " : " b ";
    let c=""; if(s.castling&C_WK)c+="K"; if(s.castling&C_WQ)c+="Q"; if(s.castling&C_BK)c+="k"; if(s.castling&C_BQ)c+="q";
    fen += c||"-"; fen += " " + (s.ep===-1?"-":squareName(s.ep)); fen += " " + s.halfmove + " " + s.fullmove;
    return fen;
  }

  function moveToUci(m) {
    let s = squareName(m.from)+squareName(m.to);
    if (m.flag===FLAG_PROMO) s += ({[QUEEN]:"q",[ROOK]:"r",[BISHOP]:"b",[KNIGHT]:"n"})[m.promotion]||"q";
    return s;
  }
  function moveFromUci(s, uci) {
    if (!uci || uci.length<4) return null;
    const from=(uci.charCodeAt(0)-97)+(uci.charCodeAt(1)-49)*8;
    const to=(uci.charCodeAt(2)-97)+(uci.charCodeAt(3)-49)*8;
    const map={q:QUEEN,r:ROOK,b:BISHOP,n:KNIGHT};
    for (const m of legalMoves(s)) if (m.from===from && m.to===to){
      if (m.flag===FLAG_PROMO){ const want=uci[4]?map[uci[4]]:QUEEN; if(m.promotion!==want) continue; }
      return m;
    }
    return null;
  }

  // Standard Algebraic Notation for a (legal) move in state s.
  function toSAN(s, move) {
    const decorate = (str) => {
      const ns = makeMove(s, move), st = status(ns);
      if (st.over && st.reason === "checkmate") return str + "#";
      if (st.check) return str + "+";
      return str;
    };
    if (move.flag === FLAG_CASTLE_K) return decorate("O-O");
    if (move.flag === FLAG_CASTLE_Q) return decorate("O-O-O");
    const type = pieceType(move.piece), dest = squareName(move.to), capture = move.captured !== 0;
    if (type === PAWN) {
      let str = capture ? squareName(move.from)[0] + "x" + dest : dest;
      if (move.flag === FLAG_PROMO) str += "=" + "NBRQ"[move.promotion - 2];
      return decorate(str);
    }
    const letter = "NBRQK"[type - 2];
    let sameFile=false, sameRank=false, ambig=false;
    for (const m of legalMoves(s)) {
      if (m.to===move.to && m.from!==move.from && pieceType(m.piece)===type) {
        ambig = true;
        if (m.from%8===move.from%8) sameFile=true;
        if (m.from>>3===move.from>>3) sameRank=true;
      }
    }
    let dis="";
    if (ambig) { if(!sameFile) dis=squareName(move.from)[0]; else if(!sameRank) dis=squareName(move.from)[1]; else dis=squareName(move.from); }
    return decorate(letter + dis + (capture ? "x" : "") + dest);
  }

  function perft(s, depth) {
    if (depth === 0) return 1;
    let nodes = 0; const pseudo = generate(s, false), mover = s.side;
    for (const m of pseudo) { const ns = makeMove(s, m);
      if (isSquareAttacked(ns, kingSquare(ns, mover), ns.side)) continue;
      nodes += perft(ns, depth - 1); }
    return nodes;
  }

  const API = {
    PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE, BLACK,
    FLAG_NORMAL, FLAG_DOUBLE, FLAG_ENPASSANT, FLAG_CASTLE_K, FLAG_CASTLE_Q, FLAG_PROMO,
    pieceType, pieceColor, squareName,
    startPosition, cloneState, kingSquare, isSquareAttacked, inCheck,
    generate, legalMoves, legalMovesFrom, makeMove, status, toFEN, toSAN,
    moveToUci, moveFromUci, perft
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.Chess = API;
})(typeof window !== "undefined" ? window : globalThis);

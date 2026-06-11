#include "evaluation.h"

// ------------------------------------------------------------------
// Material values (centipawns)
// ------------------------------------------------------------------
static const int MAT[7] = { 0, 100, 320, 330, 500, 900, 0 }; // index by PieceType

// ------------------------------------------------------------------
// Piece-square tables (Tomasz Michniewski's "simplified evaluation").
// Stored a8-first (visual reading order). White reads table[sq ^ 56],
// Black reads table[sq] so the board is mirrored for each side.
// ------------------------------------------------------------------
static const int PST_PAWN[64] = {
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0
};
static const int PST_KNIGHT[64] = {
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
};
static const int PST_BISHOP[64] = {
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
};
static const int PST_ROOK[64] = {
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0
};
static const int PST_QUEEN[64] = {
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
};
static const int PST_KING_MG[64] = {
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20
};
static const int PST_KING_EG[64] = {
    -50,-40,-30,-20,-20,-30,-40,-50,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50
};

static inline int pstValue(const int* table, int sq, int color) {
    return (color == WHITE) ? table[sq ^ 56] : table[sq];
}

// Game phase: 0 (endgame) .. 24 (opening), based on non-pawn material.
static int gamePhase(const Board& b) {
    int phase = 0;
    for (int i = 0; i < 64; ++i) {
        switch (pieceType(b.sq[i])) {
            case KNIGHT: case BISHOP: phase += 1; break;
            case ROOK:               phase += 2; break;
            case QUEEN:              phase += 4; break;
            default: break;
        }
    }
    return phase > 24 ? 24 : phase;
}

// Simple pawn-shield king-safety bonus: reward friendly pawns sitting
// directly in front of (and diagonally ahead of) the king.
static int pawnShield(const Board& b, int color) {
    int ksq = b.kingSquare(color);
    if (ksq < 0) return 0;
    int kfile = ksq % 8;
    int krank = ksq / 8;
    // Only meaningful while the king is near its own back rank.
    if (color == WHITE && krank > 2) return 0;
    if (color == BLACK && krank < 5) return 0;

    int dir = (color == WHITE) ? 8 : -8;
    int friendlyPawn = (color == WHITE) ? PAWN : -PAWN;
    int bonus = 0;
    for (int df = -1; df <= 1; ++df) {
        int f = kfile + df;
        if (f < 0 || f > 7) continue;
        int front = ksq + dir + df;
        if (front >= 0 && front < 64 && b.sq[front] == friendlyPawn)
            bonus += 10;
    }
    return bonus;
}

int evaluate(const Board& b) {
    int score = 0; // positive = good for White
    int phase = gamePhase(b);

    int whiteBishops = 0, blackBishops = 0;

    for (int sq = 0; sq < 64; ++sq) {
        int p = b.sq[sq];
        if (p == 0) continue;
        int type  = pieceType(p);
        int color = pieceColor(p);
        int sign  = (color == WHITE) ? 1 : -1;

        int val = MAT[type];

        switch (type) {
            case PAWN:   val += pstValue(PST_PAWN,   sq, color); break;
            case KNIGHT: val += pstValue(PST_KNIGHT, sq, color); break;
            case BISHOP: val += pstValue(PST_BISHOP, sq, color);
                         (color == WHITE ? whiteBishops : blackBishops)++; break;
            case ROOK:   val += pstValue(PST_ROOK,   sq, color); break;
            case QUEEN:  val += pstValue(PST_QUEEN,  sq, color); break;
            case KING: {
                int mg = pstValue(PST_KING_MG, sq, color);
                int eg = pstValue(PST_KING_EG, sq, color);
                val += (mg * phase + eg * (24 - phase)) / 24;
                break;
            }
        }
        score += sign * val;
    }

    // Bishop-pair bonus
    if (whiteBishops >= 2) score += 30;
    if (blackBishops >= 2) score -= 30;

    // King safety (weighted down in the endgame via the phase scalar)
    score += (pawnShield(b, WHITE) - pawnShield(b, BLACK)) * phase / 24;

    // Return from the perspective of the side to move (negamax convention)
    return (b.side == WHITE) ? score : -score;
}

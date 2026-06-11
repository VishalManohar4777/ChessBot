#include "movegen.h"
#include "mailbox.h"

// Append a move, expanding promotions into four entries.
static void addPawnMove(std::vector<Move>& moves, int from, int to,
                        int piece, int captured, int flag, bool promo) {
    if (promo) {
        for (int pt = QUEEN; pt >= KNIGHT; --pt) {
            Move m;
            m.from = from; m.to = to; m.piece = piece;
            m.captured = captured; m.promotion = pt; m.flag = FLAG_PROMO;
            moves.push_back(m);
        }
    } else {
        Move m;
        m.from = from; m.to = to; m.piece = piece;
        m.captured = captured; m.flag = flag;
        moves.push_back(m);
    }
}

static void addMove(std::vector<Move>& moves, int from, int to,
                    int piece, int captured, int flag) {
    Move m;
    m.from = from; m.to = to; m.piece = piece;
    m.captured = captured; m.flag = flag;
    moves.push_back(m);
}

// capturesOnly => only generate captures/promotions (quiescence)
static void generate(const Board& b, std::vector<Move>& moves, bool capturesOnly) {
    int us  = b.side;
    int them = us ^ 1;

    for (int from = 0; from < 64; ++from) {
        int p = b.sq[from];
        if (p == 0 || pieceColor(p) != us) continue;
        int type = pieceType(p);
        int base = MAILBOX64[from];
        int file = from % 8;
        int rank = from / 8;

        if (type == PAWN) {
            int dir       = (us == WHITE) ? 8 : -8;
            int startRank = (us == WHITE) ? 1 : 6;
            int promoRank = (us == WHITE) ? 6 : 1; // rank of pawn just before promotion
            int one = from + dir;

            // Quiet pushes (skipped in captures-only mode unless a promotion)
            if (one >= 0 && one < 64 && b.sq[one] == 0) {
                bool promo = (rank == promoRank);
                if (!capturesOnly || promo)
                    addPawnMove(moves, from, one, p, 0, FLAG_NORMAL, promo);

                // Double push
                if (!capturesOnly && rank == startRank) {
                    int two = from + 2 * dir;
                    if (b.sq[two] == 0)
                        addMove(moves, from, two, p, 0, FLAG_DOUBLE);
                }
            }

            // Captures (diagonals)
            int caps[2] = { dir - 1, dir + 1 };
            int fileGuard[2] = { file > 0, file < 7 };
            for (int i = 0; i < 2; ++i) {
                if (!fileGuard[i]) continue;
                int to = from + caps[i];
                if (to < 0 || to >= 64) continue;
                int target = b.sq[to];
                if (target != 0 && pieceColor(target) == them) {
                    bool promo = (rank == promoRank);
                    addPawnMove(moves, from, to, p, target, FLAG_NORMAL, promo);
                } else if (to == b.epSquare && b.epSquare != -1) {
                    addMove(moves, from, to, p,
                            (us == WHITE) ? -PAWN : PAWN, FLAG_ENPASSANT);
                }
            }
        }
        else if (type == KNIGHT) {
            for (int i = 0; i < 8; ++i) {
                int n = MAILBOX[base + KNIGHT_OFF[i]];
                if (n == -1) continue;
                int target = b.sq[n];
                if (target == 0) {
                    if (!capturesOnly) addMove(moves, from, n, p, 0, FLAG_NORMAL);
                } else if (pieceColor(target) == them) {
                    addMove(moves, from, n, p, target, FLAG_NORMAL);
                }
            }
        }
        else if (type == KING) {
            for (int i = 0; i < 8; ++i) {
                int n = MAILBOX[base + KING_OFF[i]];
                if (n == -1) continue;
                int target = b.sq[n];
                if (target == 0) {
                    if (!capturesOnly) addMove(moves, from, n, p, 0, FLAG_NORMAL);
                } else if (pieceColor(target) == them) {
                    addMove(moves, from, n, p, target, FLAG_NORMAL);
                }
            }

            // Castling (never a capture, so skipped in quiescence)
            if (!capturesOnly) {
                if (us == WHITE && from == 4) {
                    if ((b.castling & CASTLE_WK) &&
                        b.sq[5] == 0 && b.sq[6] == 0 && b.sq[7] == ROOK &&
                        !b.isSquareAttacked(4, them) &&
                        !b.isSquareAttacked(5, them) &&
                        !b.isSquareAttacked(6, them))
                        addMove(moves, 4, 6, p, 0, FLAG_CASTLE_K);
                    if ((b.castling & CASTLE_WQ) &&
                        b.sq[3] == 0 && b.sq[2] == 0 && b.sq[1] == 0 && b.sq[0] == ROOK &&
                        !b.isSquareAttacked(4, them) &&
                        !b.isSquareAttacked(3, them) &&
                        !b.isSquareAttacked(2, them))
                        addMove(moves, 4, 2, p, 0, FLAG_CASTLE_Q);
                }
                if (us == BLACK && from == 60) {
                    if ((b.castling & CASTLE_BK) &&
                        b.sq[61] == 0 && b.sq[62] == 0 && b.sq[63] == -ROOK &&
                        !b.isSquareAttacked(60, them) &&
                        !b.isSquareAttacked(61, them) &&
                        !b.isSquareAttacked(62, them))
                        addMove(moves, 60, 62, p, 0, FLAG_CASTLE_K);
                    if ((b.castling & CASTLE_BQ) &&
                        b.sq[59] == 0 && b.sq[58] == 0 && b.sq[57] == 0 && b.sq[56] == -ROOK &&
                        !b.isSquareAttacked(60, them) &&
                        !b.isSquareAttacked(59, them) &&
                        !b.isSquareAttacked(58, them))
                        addMove(moves, 60, 58, p, 0, FLAG_CASTLE_Q);
                }
            }
        }
        else {
            // Sliding pieces: bishop, rook, queen
            const int* off; int n;
            if (type == BISHOP)      { off = BISHOP_OFF; n = 4; }
            else if (type == ROOK)   { off = ROOK_OFF;   n = 4; }
            else                     { off = QUEEN_OFF;  n = 8; } // QUEEN

            for (int i = 0; i < n; ++i) {
                int idx = base;
                while (true) {
                    idx += off[i];
                    int t = MAILBOX[idx];
                    if (t == -1) break;
                    int target = b.sq[t];
                    if (target == 0) {
                        if (!capturesOnly) addMove(moves, from, t, p, 0, FLAG_NORMAL);
                    } else {
                        if (pieceColor(target) == them)
                            addMove(moves, from, t, p, target, FLAG_NORMAL);
                        break;
                    }
                }
            }
        }
    }
}

void generateMoves(const Board& b, std::vector<Move>& moves) {
    generate(b, moves, false);
}

void generateCaptures(const Board& b, std::vector<Move>& moves) {
    generate(b, moves, true);
}

bool isLegal(Board& b, const Move& m) {
    int mover = b.side;
    b.makeMove(m);
    bool ok = !b.isSquareAttacked(b.kingSquare(mover), b.side);
    b.unmakeMove(m);
    return ok;
}

void generateLegalMoves(Board& b, std::vector<Move>& moves) {
    std::vector<Move> pseudo;
    pseudo.reserve(64);
    generateMoves(b, pseudo);
    for (const Move& m : pseudo)
        if (isLegal(b, m)) moves.push_back(m);
}

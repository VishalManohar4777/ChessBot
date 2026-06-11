#pragma once
#include <string>

// ------------------------------------------------------------------
// Basic engine types
// ------------------------------------------------------------------

enum Color { WHITE = 0, BLACK = 1 };

enum PieceType {
    NO_TYPE = 0,
    PAWN    = 1,
    KNIGHT  = 2,
    BISHOP  = 3,
    ROOK    = 4,
    QUEEN   = 5,
    KING    = 6
};

// Board piece encoding:
//   white pieces are positive ( 1..6 )
//   black pieces are negative (-1..-6 )
//   empty square is 0
inline int pieceType(int p)  { return p < 0 ? -p : p; }
inline int pieceColor(int p) { return p > 0 ? WHITE : BLACK; } // only valid when p != 0

// Move flags
enum MoveFlag {
    FLAG_NORMAL    = 0,
    FLAG_DOUBLE    = 1, // double pawn push (sets en-passant square)
    FLAG_ENPASSANT = 2,
    FLAG_CASTLE_K  = 3, // king-side castle
    FLAG_CASTLE_Q  = 4, // queen-side castle
    FLAG_PROMO     = 5
};

struct Move {
    int from      = 0;
    int to        = 0;
    int piece     = 0; // moving piece (signed)
    int captured  = 0; // captured piece (signed), 0 if none
    int promotion = 0; // promoted-to type (KNIGHT..QUEEN), 0 if none
    int flag      = FLAG_NORMAL;
    int score     = 0; // used for move ordering

    bool operator==(const Move& o) const {
        return from == o.from && to == o.to && promotion == o.promotion;
    }
};

// Castling-rights bit flags
enum {
    CASTLE_WK = 1,
    CASTLE_WQ = 2,
    CASTLE_BK = 4,
    CASTLE_BQ = 8
};

// Convert a 0..63 square index to algebraic notation, e.g. 0 -> "a1"
inline std::string squareName(int sq) {
    std::string s;
    s += char('a' + (sq % 8));
    s += char('1' + (sq / 8));
    return s;
}

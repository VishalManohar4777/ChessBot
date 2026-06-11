#pragma once
#include "types.h"
#include <vector>
#include <string>

// Information needed to undo a move.
struct Undo {
    int castling;
    int epSquare;
    int halfmove;
};

class Board {
public:
    int sq[64];                 // piece on every square (signed encoding)
    int side;                   // side to move (WHITE / BLACK)
    int castling;               // castling-rights bit flags
    int epSquare;               // en-passant target square, -1 if none
    int halfmove;               // halfmove clock (for 50-move rule)
    int fullmove;               // full-move counter
    std::vector<Undo> history;  // stack used by make/unmake

    Board();

    void setStartPos();
    bool setFEN(const std::string& fen);
    std::string toFEN() const;

    int  kingSquare(int color) const;
    bool isSquareAttacked(int square, int byColor) const;
    bool inCheck(int color) const;

    void makeMove(const Move& m);
    void unmakeMove(const Move& m);

    void print() const;
};

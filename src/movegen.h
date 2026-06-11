#pragma once
#include "board.h"
#include <vector>

// Generate all pseudo-legal moves (may leave own king in check).
void generateMoves(const Board& b, std::vector<Move>& moves);

// Generate only captures and promotions (used by quiescence search).
void generateCaptures(const Board& b, std::vector<Move>& moves);

// Returns true if making `m` leaves the mover's own king safe.
bool isLegal(Board& b, const Move& m);

// Generate the list of fully-legal moves.
void generateLegalMoves(Board& b, std::vector<Move>& moves);

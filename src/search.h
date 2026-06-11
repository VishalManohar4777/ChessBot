#pragma once
#include "board.h"

struct SearchResult {
    Move best;
    int  score = 0;
    int  depth = 0;
    long nodes = 0;
};

// Search the position with iterative deepening, bounded by maxDepth and
// a soft time limit (milliseconds). Returns the best move found.
SearchResult search(Board& b, int maxDepth, int timeMs);

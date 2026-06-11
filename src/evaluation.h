#pragma once
#include "board.h"

// Static evaluation from the perspective of the side to move
// (positive = good for the side to move). Suitable for negamax.
int evaluate(const Board& b);

#pragma once

// ------------------------------------------------------------------
// 10x12 "mailbox" board representation used for fast off-board
// detection during move generation and attack detection.
//
//  - MAILBOX[120]  : maps a 120-index back to a 0..63 square, or -1 if
//                    the index is part of the border (off the board).
//  - MAILBOX64[64] : maps a 0..63 square to its 120-index.
//
// C++17 inline variables let us define these in a header that is shared
// across translation units without a separate .cpp.
// ------------------------------------------------------------------

inline const int MAILBOX[120] = {
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
};

inline const int MAILBOX64[64] = {
    21, 22, 23, 24, 25, 26, 27, 28,
    31, 32, 33, 34, 35, 36, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48,
    51, 52, 53, 54, 55, 56, 57, 58,
    61, 62, 63, 64, 65, 66, 67, 68,
    71, 72, 73, 74, 75, 76, 77, 78,
    81, 82, 83, 84, 85, 86, 87, 88,
    91, 92, 93, 94, 95, 96, 97, 98
};

// Movement offsets in 120-space.
inline const int KNIGHT_OFF[8] = { -21, -19, -12, -8, 8, 12, 19, 21 };
inline const int KING_OFF[8]   = { -11, -10, -9, -1, 1, 9, 10, 11 };
inline const int BISHOP_OFF[4] = { -11, -9, 9, 11 };
inline const int ROOK_OFF[4]   = { -10, -1, 1, 10 };
inline const int QUEEN_OFF[8]  = { -11, -10, -9, -1, 1, 9, 10, 11 };

#include "search.h"
#include "movegen.h"
#include "evaluation.h"
#include <algorithm>
#include <chrono>
#include <vector>

using Clock = std::chrono::steady_clock;

static const int INF  = 1000000;
static const int MATE = 100000; // mate score base

namespace {
    long g_nodes;
    Clock::time_point g_start;
    int  g_timeMs;
    bool g_stop;

    bool timeUp() {
        if (g_stop) return true;
        // Check the clock every so often to avoid syscall overhead.
        if ((g_nodes & 2047) == 0) {
            auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                               Clock::now() - g_start).count();
            if (elapsed >= g_timeMs) g_stop = true;
        }
        return g_stop;
    }
}

// MVV-LVA: order captures by (most valuable victim, least valuable attacker).
static const int PIECE_ORDER[7] = { 0, 100, 320, 330, 500, 900, 20000 };

static void scoreMoves(std::vector<Move>& moves) {
    for (Move& m : moves) {
        if (m.captured != 0)
            m.score = PIECE_ORDER[pieceType(m.captured)] * 10
                    - PIECE_ORDER[pieceType(m.piece)];
        else if (m.flag == FLAG_PROMO)
            m.score = PIECE_ORDER[m.promotion];
        else
            m.score = 0;
    }
}

// Selection sort step: bring the best-scoring move to position `i`.
static void pickMove(std::vector<Move>& moves, int i) {
    int best = i;
    for (int j = i + 1; j < (int)moves.size(); ++j)
        if (moves[j].score > moves[best].score) best = j;
    if (best != i) std::swap(moves[i], moves[best]);
}

// Quiescence search: only explores captures/promotions to reach a
// "quiet" position before evaluating, avoiding the horizon effect.
static int quiescence(Board& b, int alpha, int beta) {
    g_nodes++;
    if (timeUp()) return 0;

    int stand = evaluate(b);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;

    std::vector<Move> moves;
    moves.reserve(32);
    generateCaptures(b, moves);
    scoreMoves(moves);

    for (int i = 0; i < (int)moves.size(); ++i) {
        pickMove(moves, i);
        const Move& m = moves[i];
        if (!isLegal(b, m)) continue;

        b.makeMove(m);
        int sc = -quiescence(b, -beta, -alpha);
        b.unmakeMove(m);

        if (g_stop) return 0;
        if (sc >= beta)  return beta;
        if (sc > alpha)  alpha = sc;
    }
    return alpha;
}

// Negamax with alpha-beta pruning.
static int negamax(Board& b, int depth, int alpha, int beta, int ply) {
    g_nodes++;
    if (timeUp()) return 0;

    if (depth == 0)
        return quiescence(b, alpha, beta);

    std::vector<Move> moves;
    moves.reserve(64);
    generateMoves(b, moves);
    scoreMoves(moves);

    int legal = 0;
    int bestScore = -INF;

    for (int i = 0; i < (int)moves.size(); ++i) {
        pickMove(moves, i);
        const Move& m = moves[i];
        if (!isLegal(b, m)) continue;
        legal++;

        b.makeMove(m);
        int sc = -negamax(b, depth - 1, -beta, -alpha, ply + 1);
        b.unmakeMove(m);

        if (g_stop) return 0;

        if (sc > bestScore) bestScore = sc;
        if (sc > alpha)     alpha = sc;
        if (alpha >= beta)  break; // beta cutoff
    }

    // No legal moves: checkmate or stalemate.
    if (legal == 0) {
        if (b.inCheck(b.side)) return -MATE + ply; // prefer faster mates
        return 0;                                   // stalemate
    }
    return bestScore;
}

SearchResult search(Board& b, int maxDepth, int timeMs) {
    g_nodes  = 0;
    g_start  = Clock::now();
    g_timeMs = timeMs;
    g_stop   = false;

    SearchResult result;

    // Root move list.
    std::vector<Move> rootMoves;
    generateLegalMoves(b, rootMoves);
    if (rootMoves.empty()) return result;
    result.best = rootMoves[0];

    // Iterative deepening: search progressively deeper, keeping the best
    // move from the last completed depth.
    for (int depth = 1; depth <= maxDepth; ++depth) {
        int alpha = -INF, beta = INF;
        Move bestThisDepth = rootMoves[0];
        int  bestScore = -INF;

        scoreMoves(rootMoves);
        // Search the previous best move first for better pruning.
        for (int i = 0; i < (int)rootMoves.size(); ++i)
            if (rootMoves[i] == result.best) rootMoves[i].score += 1000000;

        for (int i = 0; i < (int)rootMoves.size(); ++i) {
            pickMove(rootMoves, i);
            const Move& m = rootMoves[i];

            b.makeMove(m);
            int sc = -negamax(b, depth - 1, -beta, -alpha, 1);
            b.unmakeMove(m);

            if (g_stop) break;

            if (sc > bestScore) {
                bestScore     = sc;
                bestThisDepth = m;
            }
            if (sc > alpha) alpha = sc;
        }

        if (!g_stop) {
            result.best  = bestThisDepth;
            result.score = bestScore;
            result.depth = depth;
            result.nodes = g_nodes;
        }

        if (g_stop) break;

        // Stop early on a found mate.
        if (bestScore > MATE - 1000 || bestScore < -MATE + 1000) break;
    }

    result.nodes = g_nodes;
    return result;
}

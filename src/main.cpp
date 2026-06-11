#include "board.h"
#include "movegen.h"
#include "search.h"
#include "evaluation.h"

#include <iostream>
#include <string>
#include <vector>
#include <chrono>

// ------------------------------------------------------------------
// perft: counts the number of leaf nodes at a given depth. Used to
// verify the correctness of move generation against known values.
// ------------------------------------------------------------------
static long perft(Board& b, int depth) {
    if (depth == 0) return 1;
    std::vector<Move> moves;
    generateMoves(b, moves);
    long nodes = 0;
    for (const Move& m : moves) {
        if (!isLegal(b, m)) continue;
        b.makeMove(m);
        nodes += perft(b, depth - 1);
        b.unmakeMove(m);
    }
    return nodes;
}

// Parse user input like "e2e4" or "e7e8q" into a legal move, or return
// false if it does not match any legal move in the position.
static bool parseMove(Board& b, const std::string& in, Move& out) {
    if (in.size() < 4) return false;
    int fromFile = in[0] - 'a', fromRank = in[1] - '1';
    int toFile   = in[2] - 'a', toRank   = in[3] - '1';
    if (fromFile < 0 || fromFile > 7 || fromRank < 0 || fromRank > 7) return false;
    if (toFile   < 0 || toFile   > 7 || toRank   < 0 || toRank   > 7) return false;

    int from = fromRank * 8 + fromFile;
    int to   = toRank   * 8 + toFile;
    int promo = 0;
    if (in.size() >= 5) {
        switch (in[4]) {
            case 'q': promo = QUEEN;  break;
            case 'r': promo = ROOK;   break;
            case 'b': promo = BISHOP; break;
            case 'n': promo = KNIGHT; break;
        }
    }

    std::vector<Move> legal;
    generateLegalMoves(b, legal);
    for (const Move& m : legal) {
        if (m.from == from && m.to == to) {
            if (m.flag == FLAG_PROMO) {
                if (promo == 0) promo = QUEEN; // default promotion
                if (m.promotion != promo) continue;
            }
            out = m;
            return true;
        }
    }
    return false;
}

static std::string moveToStr(const Move& m) {
    std::string s = squareName(m.from) + squareName(m.to);
    if (m.flag == FLAG_PROMO) {
        char c = 'q';
        switch (m.promotion) {
            case ROOK:   c = 'r'; break;
            case BISHOP: c = 'b'; break;
            case KNIGHT: c = 'n'; break;
        }
        s += c;
    }
    return s;
}

static bool gameOver(Board& b) {
    std::vector<Move> legal;
    generateLegalMoves(b, legal);
    if (legal.empty()) {
        if (b.inCheck(b.side))
            std::cout << "\nCheckmate! "
                      << (b.side == WHITE ? "Black" : "White") << " wins.\n";
        else
            std::cout << "\nStalemate. Draw.\n";
        return true;
    }
    if (b.halfmove >= 100) {
        std::cout << "\nDraw by 50-move rule.\n";
        return true;
    }
    return false;
}

static void playGame() {
    Board b;
    b.setStartPos();

    std::cout << "==============================================\n";
    std::cout << "          C++ Chess Engine\n";
    std::cout << "==============================================\n";
    std::cout << "Enter moves in coordinate form, e.g. e2e4, e7e8q.\n";
    std::cout << "Commands: undo, board, fen, quit\n\n";

    std::cout << "Play as (w/b)? ";
    std::string colorChoice;
    std::getline(std::cin, colorChoice);
    int humanColor = (!colorChoice.empty() && (colorChoice[0] == 'b' || colorChoice[0] == 'B'))
                         ? BLACK : WHITE;

    std::cout << "Engine thinking time per move in ms (e.g. 2000)? ";
    std::string t;
    std::getline(std::cin, t);
    int timeMs = 2000;
    try { if (!t.empty()) timeMs = std::stoi(t); } catch (...) {}
    if (timeMs < 100) timeMs = 100;

    const int maxDepth = 64; // bounded by the time limit in practice

    while (true) {
        b.print();
        if (gameOver(b)) break;

        if (b.side == humanColor) {
            std::cout << "\nYour move: ";
            std::string in;
            if (!std::getline(std::cin, in)) break;

            if (in == "quit") break;
            if (in == "board") continue;
            if (in == "fen") { std::cout << b.toFEN() << "\n"; continue; }
            if (in == "undo") {
                // Undo requires the move history; this simple CLI re-plays
                // from the start position would be needed for a full undo.
                std::cout << "Undo is not supported in this simple CLI.\n";
                continue;
            }

            Move m;
            if (!parseMove(b, in, m)) {
                std::cout << "Illegal or unrecognized move. Try again.\n";
                continue;
            }
            b.makeMove(m);
        } else {
            std::cout << "\nEngine is thinking (" << timeMs << " ms)...\n";
            auto t0 = std::chrono::steady_clock::now();
            SearchResult r = search(b, maxDepth, timeMs);
            auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                          std::chrono::steady_clock::now() - t0).count();

            if (r.best.from == 0 && r.best.to == 0 && r.nodes == 0) {
                // No move available (should be caught by gameOver()).
                break;
            }
            std::cout << "Engine plays: " << moveToStr(r.best)
                      << "  (depth " << r.depth
                      << ", score " << r.score
                      << ", " << r.nodes << " nodes, " << ms << " ms)\n";
            b.makeMove(r.best);
        }
    }
    std::cout << "\nThanks for playing!\n";
}

int main(int argc, char** argv) {
    // perft mode:  chess perft <depth> [fen]
    if (argc >= 3 && std::string(argv[1]) == "perft") {
        Board b;
        int depth = std::stoi(argv[2]);
        if (argc >= 4) {
            std::string fen;
            for (int i = 3; i < argc; ++i) { fen += argv[i]; if (i + 1 < argc) fen += " "; }
            b.setFEN(fen);
        } else {
            b.setStartPos();
        }
        auto t0 = std::chrono::steady_clock::now();
        long n = perft(b, depth);
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                      std::chrono::steady_clock::now() - t0).count();
        std::cout << "perft(" << depth << ") = " << n
                  << "  (" << ms << " ms)\n";
        return 0;
    }

    // selfplay mode:  chess selfplay [timeMs] [maxMoves]
    if (argc >= 2 && std::string(argv[1]) == "selfplay") {
        Board b; b.setStartPos();
        int timeMs   = (argc >= 3) ? std::stoi(argv[2]) : 200;
        int maxMoves = (argc >= 4) ? std::stoi(argv[3]) : 40;
        for (int i = 0; i < maxMoves; ++i) {
            std::vector<Move> legal;
            generateLegalMoves(b, legal);
            if (legal.empty()) { std::cout << "Game ended.\n"; break; }
            SearchResult r = search(b, 64, timeMs);
            std::cout << (i + 1) << ". " << moveToStr(r.best)
                      << " (d" << r.depth << " sc" << r.score << ")\n";
            b.makeMove(r.best);
        }
        b.print();
        return 0;
    }

    playGame();
    return 0;
}

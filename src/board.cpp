#include "board.h"
#include "mailbox.h"
#include <iostream>
#include <sstream>
#include <cctype>

Board::Board() {
    setStartPos();
}

void Board::setStartPos() {
    for (int i = 0; i < 64; ++i) sq[i] = 0;

    // White back rank (a1..h1)
    sq[0] = ROOK;  sq[1] = KNIGHT; sq[2] = BISHOP; sq[3] = QUEEN;
    sq[4] = KING;  sq[5] = BISHOP; sq[6] = KNIGHT; sq[7] = ROOK;
    for (int i = 8; i < 16; ++i) sq[i] = PAWN;

    // Black back rank (a8..h8)
    sq[56] = -ROOK;  sq[57] = -KNIGHT; sq[58] = -BISHOP; sq[59] = -QUEEN;
    sq[60] = -KING;  sq[61] = -BISHOP; sq[62] = -KNIGHT; sq[63] = -ROOK;
    for (int i = 48; i < 56; ++i) sq[i] = -PAWN;

    side     = WHITE;
    castling = CASTLE_WK | CASTLE_WQ | CASTLE_BK | CASTLE_BQ;
    epSquare = -1;
    halfmove = 0;
    fullmove = 1;
    history.clear();
}

int Board::kingSquare(int color) const {
    int target = (color == WHITE) ? KING : -KING;
    for (int i = 0; i < 64; ++i)
        if (sq[i] == target) return i;
    return -1; // should never happen in a legal position
}

bool Board::isSquareAttacked(int square, int byColor) const {
    int f = square % 8;

    // Pawn attacks
    if (byColor == WHITE) {
        if (f > 0 && square - 9 >= 0 && sq[square - 9] == PAWN) return true;
        if (f < 7 && square - 7 >= 0 && sq[square - 7] == PAWN) return true;
    } else {
        if (f < 7 && square + 9 < 64 && sq[square + 9] == -PAWN) return true;
        if (f > 0 && square + 7 < 64 && sq[square + 7] == -PAWN) return true;
    }

    int base = MAILBOX64[square];

    // Knight attacks
    int knight = (byColor == WHITE) ? KNIGHT : -KNIGHT;
    for (int i = 0; i < 8; ++i) {
        int n = MAILBOX[base + KNIGHT_OFF[i]];
        if (n != -1 && sq[n] == knight) return true;
    }

    // King attacks
    int king = (byColor == WHITE) ? KING : -KING;
    for (int i = 0; i < 8; ++i) {
        int n = MAILBOX[base + KING_OFF[i]];
        if (n != -1 && sq[n] == king) return true;
    }

    // Diagonal sliders (bishop / queen)
    for (int i = 0; i < 4; ++i) {
        int idx = base;
        while (true) {
            idx += BISHOP_OFF[i];
            int n = MAILBOX[idx];
            if (n == -1) break;
            int p = sq[n];
            if (p != 0) {
                if (pieceColor(p) == byColor) {
                    int t = pieceType(p);
                    if (t == BISHOP || t == QUEEN) return true;
                }
                break;
            }
        }
    }

    // Orthogonal sliders (rook / queen)
    for (int i = 0; i < 4; ++i) {
        int idx = base;
        while (true) {
            idx += ROOK_OFF[i];
            int n = MAILBOX[idx];
            if (n == -1) break;
            int p = sq[n];
            if (p != 0) {
                if (pieceColor(p) == byColor) {
                    int t = pieceType(p);
                    if (t == ROOK || t == QUEEN) return true;
                }
                break;
            }
        }
    }

    return false;
}

bool Board::inCheck(int color) const {
    return isSquareAttacked(kingSquare(color), color ^ 1);
}

void Board::makeMove(const Move& m) {
    history.push_back(Undo{ castling, epSquare, halfmove });

    int from   = m.from;
    int to     = m.to;
    int moving = m.piece;
    int color  = side;

    epSquare = -1; // reset; possibly set again on a double push

    // Remove moving piece from origin
    sq[from] = 0;

    // En-passant capture removes the pawn behind the target square
    if (m.flag == FLAG_ENPASSANT) {
        int capSq = (color == WHITE) ? to - 8 : to + 8;
        sq[capSq] = 0;
    }

    // Place the piece (handle promotion)
    if (m.flag == FLAG_PROMO) {
        sq[to] = (color == WHITE) ? m.promotion : -m.promotion;
    } else {
        sq[to] = moving;
    }

    // Castling: move the rook too
    if (m.flag == FLAG_CASTLE_K) {
        if (color == WHITE) { sq[5]  = sq[7];  sq[7]  = 0; }
        else                { sq[61] = sq[63]; sq[63] = 0; }
    } else if (m.flag == FLAG_CASTLE_Q) {
        if (color == WHITE) { sq[3]  = sq[0];  sq[0]  = 0; }
        else                { sq[59] = sq[56]; sq[56] = 0; }
    }

    // Double pawn push exposes an en-passant square
    if (m.flag == FLAG_DOUBLE) {
        epSquare = (color == WHITE) ? from + 8 : from - 8;
    }

    // Update castling rights if a king moved
    if (pieceType(moving) == KING) {
        if (color == WHITE) castling &= ~(CASTLE_WK | CASTLE_WQ);
        else                castling &= ~(CASTLE_BK | CASTLE_BQ);
    }

    // Update castling rights if a rook left or was captured on its home square
    auto touch = [&](int s) {
        if      (s == 0)  castling &= ~CASTLE_WQ;
        else if (s == 7)  castling &= ~CASTLE_WK;
        else if (s == 56) castling &= ~CASTLE_BQ;
        else if (s == 63) castling &= ~CASTLE_BK;
    };
    touch(from);
    touch(to);

    // Halfmove clock and full-move counter
    if (pieceType(moving) == PAWN || m.captured != 0) halfmove = 0;
    else                                              halfmove++;
    if (color == BLACK) fullmove++;

    side ^= 1;
}

void Board::unmakeMove(const Move& m) {
    Undo u = history.back();
    history.pop_back();

    side ^= 1;
    int color = side;
    int from  = m.from;
    int to    = m.to;

    castling = u.castling;
    epSquare = u.epSquare;
    halfmove = u.halfmove;
    if (color == BLACK) fullmove--;

    // Restore the moving piece on its origin
    sq[from] = m.piece;

    if (m.flag == FLAG_ENPASSANT) {
        sq[to] = 0;
        int capSq = (color == WHITE) ? to - 8 : to + 8;
        sq[capSq] = (color == WHITE) ? -PAWN : PAWN;
    } else {
        sq[to] = m.captured; // restores a captured piece, or empties the square
    }

    // Undo the rook movement from castling
    if (m.flag == FLAG_CASTLE_K) {
        if (color == WHITE) { sq[7]  = sq[5];  sq[5]  = 0; }
        else                { sq[63] = sq[61]; sq[61] = 0; }
    } else if (m.flag == FLAG_CASTLE_Q) {
        if (color == WHITE) { sq[0]  = sq[3];  sq[3]  = 0; }
        else                { sq[56] = sq[59]; sq[59] = 0; }
    }
}

// ------------------------------------------------------------------
// FEN handling
// ------------------------------------------------------------------

static int charToPiece(char c) {
    int sign = std::isupper((unsigned char)c) ? 1 : -1;
    switch (std::tolower((unsigned char)c)) {
        case 'p': return sign * PAWN;
        case 'n': return sign * KNIGHT;
        case 'b': return sign * BISHOP;
        case 'r': return sign * ROOK;
        case 'q': return sign * QUEEN;
        case 'k': return sign * KING;
    }
    return 0;
}

static char pieceToChar(int p) {
    char c = '.';
    switch (pieceType(p)) {
        case PAWN:   c = 'p'; break;
        case KNIGHT: c = 'n'; break;
        case BISHOP: c = 'b'; break;
        case ROOK:   c = 'r'; break;
        case QUEEN:  c = 'q'; break;
        case KING:   c = 'k'; break;
        default:     return '.';
    }
    if (p > 0) c = char(std::toupper((unsigned char)c));
    return c;
}

bool Board::setFEN(const std::string& fen) {
    for (int i = 0; i < 64; ++i) sq[i] = 0;

    std::istringstream ss(fen);
    std::string placement, stm, castle, ep;
    int hm = 0, fm = 1;
    if (!(ss >> placement >> stm >> castle >> ep)) return false;
    ss >> hm >> fm; // optional

    int rank = 7, file = 0;
    for (char c : placement) {
        if (c == '/') { rank--; file = 0; }
        else if (std::isdigit((unsigned char)c)) { file += c - '0'; }
        else {
            if (rank < 0 || file > 7) return false;
            sq[rank * 8 + file] = charToPiece(c);
            file++;
        }
    }

    side     = (stm == "w") ? WHITE : BLACK;
    castling = 0;
    if (castle.find('K') != std::string::npos) castling |= CASTLE_WK;
    if (castle.find('Q') != std::string::npos) castling |= CASTLE_WQ;
    if (castle.find('k') != std::string::npos) castling |= CASTLE_BK;
    if (castle.find('q') != std::string::npos) castling |= CASTLE_BQ;

    if (ep == "-" || ep.size() < 2) epSquare = -1;
    else epSquare = (ep[0] - 'a') + (ep[1] - '1') * 8;

    halfmove = hm;
    fullmove = fm;
    history.clear();
    return true;
}

std::string Board::toFEN() const {
    std::string fen;
    for (int rank = 7; rank >= 0; --rank) {
        int empty = 0;
        for (int file = 0; file < 8; ++file) {
            int p = sq[rank * 8 + file];
            if (p == 0) empty++;
            else {
                if (empty) { fen += char('0' + empty); empty = 0; }
                fen += pieceToChar(p);
            }
        }
        if (empty) fen += char('0' + empty);
        if (rank) fen += '/';
    }
    fen += side == WHITE ? " w " : " b ";
    std::string c;
    if (castling & CASTLE_WK) c += 'K';
    if (castling & CASTLE_WQ) c += 'Q';
    if (castling & CASTLE_BK) c += 'k';
    if (castling & CASTLE_BQ) c += 'q';
    fen += c.empty() ? "-" : c;
    fen += ' ';
    fen += (epSquare == -1) ? "-" : squareName(epSquare);
    fen += " " + std::to_string(halfmove) + " " + std::to_string(fullmove);
    return fen;
}

void Board::print() const {
    std::cout << "\n";
    for (int rank = 7; rank >= 0; --rank) {
        std::cout << "  " << (rank + 1) << "  ";
        for (int file = 0; file < 8; ++file) {
            std::cout << pieceToChar(sq[rank * 8 + file]) << ' ';
        }
        std::cout << "\n";
    }
    std::cout << "\n     a b c d e f g h\n";
    std::cout << "  Side to move: " << (side == WHITE ? "White" : "Black") << "\n";
}

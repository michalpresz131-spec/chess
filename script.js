const boardElement = document.querySelector("#board");
const statusElement = document.querySelector("#status");
const turnTextElement = document.querySelector("#turn-text");
const turnIndicatorElement = document.querySelector("#turn-indicator");
const promotionBackdrop = document.querySelector("#promotion-backdrop");
const promotionOptionsElement = document.querySelector("#promotion-options");
const leaderboardStorageKey = "chess-leaderboard";
const leaderboard = loadLeaderboard();

const pieceSymbols = {
  K: "♚",
  Q: "♛",
  R: "♜",
  B: "♝",
  N: "♞",
  P: "♟",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};
const promotionPieces = ["Q", "R", "B", "N"];
const files = "abcdefgh";

let game;
let selectedSquare = null;
let selectedMoves = [];
let lastMove = null;
let pendingPromotion = null;
let gameResultRecorded = false;

function loadLeaderboard() {
  const saved = localStorage.getItem(leaderboardStorageKey);
  if (!saved) {
    return {
      w: { name: "", wins: 0, draws: 0, losses: 0 },
      b: { name: "", wins: 0, draws: 0, losses: 0 },
    };
  }
  return JSON.parse(saved);
}

function saveLeaderboard() {
  localStorage.setItem(leaderboardStorageKey, JSON.stringify(leaderboard));
}

function playerName(color) {
  const defaultName = color === "w" ? "White" : "Black";
  return leaderboard[color].name.trim() || defaultName;
}

function renderLeaderboard() {
  for (const color of ["w", "b"]) {
    const side = color === "w" ? "white" : "black";
    const player = leaderboard[color];
    document.querySelector(`#${side}-name`).value = player.name;
    document.querySelector(`#${side}-player-name`).textContent = playerName(color);
    document.querySelector(`#${side}-board-name`).textContent = playerName(color);
    document.querySelector(`#${side}-points`).textContent = String(player.wins + player.draws / 2);
    document.querySelector(`#${side}-record`).textContent = `${player.wins}-${player.draws}-${player.losses}`;
  }
}

function recordGameResult(winner) {
  if (gameResultRecorded) return;
  gameResultRecorded = true;
  if (winner) {
    leaderboard[winner].wins += 1;
    leaderboard[winner === "w" ? "b" : "w"].losses += 1;
  } else {
    leaderboard.w.draws += 1;
    leaderboard.b.draws += 1;
  }
  saveLeaderboard();
  renderLeaderboard();
}

function initialGame() {
  return {
    board: [
      [..."rnbqkbnr"],
      [..."pppppppp"],
      ...Array.from({ length: 4 }, () => Array(8).fill(null)),
      [..."PPPPPPPP"],
      [..."RNBQKBNR"],
    ],
    turn: "w",
    castling: { K: true, Q: true, k: true, q: true },
    enPassant: null,
  };
}

function colorOf(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? "w" : "b";
}

function inside(row, column) {
  return row >= 0 && row < 8 && column >= 0 && column < 8;
}

function sameColor(first, second) {
  return first && second && colorOf(first) === colorOf(second);
}

function squareName(row, column) {
  return `${files[column]}${8 - row}`;
}

function cloneGame(position) {
  return {
    board: position.board.map((row) => row.slice()),
    turn: position.turn,
    castling: { ...position.castling },
    enPassant: position.enPassant ? { ...position.enPassant } : null,
  };
}

function addMove(moves, fromRow, fromColumn, toRow, toColumn, extra = {}) {
  if (!inside(toRow, toColumn)) return;
  moves.push({
    from: [fromRow, fromColumn],
    to: [toRow, toColumn],
    ...extra,
  });
}

function findKing(position, color) {
  const king = color === "w" ? "K" : "k";
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      if (position.board[row][column] === king) return [row, column];
    }
  }
  return null;
}

function isSquareAttacked(position, row, column, byColor) {
  const board = position.board;
  const pawnRow = row + (byColor === "w" ? 1 : -1);
  const pawn = byColor === "w" ? "P" : "p";
  for (const pawnColumn of [column - 1, column + 1]) {
    if (inside(pawnRow, pawnColumn) && board[pawnRow][pawnColumn] === pawn) {
      return true;
    }
  }

  const knight = byColor === "w" ? "N" : "n";
  for (const [rowOffset, columnOffset] of [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ]) {
    const targetRow = row + rowOffset;
    const targetColumn = column + columnOffset;
    if (inside(targetRow, targetColumn) && board[targetRow][targetColumn] === knight) {
      return true;
    }
  }

  const king = byColor === "w" ? "K" : "k";
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (!rowOffset && !columnOffset) continue;
      const targetRow = row + rowOffset;
      const targetColumn = column + columnOffset;
      if (inside(targetRow, targetColumn) && board[targetRow][targetColumn] === king) {
        return true;
      }
    }
  }

  const rays = [
    { row: -1, column: 0, pieces: ["q", "r"] },
    { row: 1, column: 0, pieces: ["q", "r"] },
    { row: 0, column: -1, pieces: ["q", "r"] },
    { row: 0, column: 1, pieces: ["q", "r"] },
    { row: -1, column: -1, pieces: ["q", "b"] },
    { row: -1, column: 1, pieces: ["q", "b"] },
    { row: 1, column: -1, pieces: ["q", "b"] },
    { row: 1, column: 1, pieces: ["q", "b"] },
  ];
  for (const ray of rays) {
    let targetRow = row + ray.row;
    let targetColumn = column + ray.column;
    while (inside(targetRow, targetColumn)) {
      const piece = board[targetRow][targetColumn];
      if (piece) {
        if (
          colorOf(piece) === byColor
          && ray.pieces.includes(piece.toLowerCase())
        ) return true;
        break;
      }
      targetRow += ray.row;
      targetColumn += ray.column;
    }
  }
  return false;
}

function isInCheck(position, color) {
  const king = findKing(position, color);
  return king ? isSquareAttacked(position, king[0], king[1], color === "w" ? "b" : "w") : false;
}

function pseudoMoves(position, row, column) {
  const board = position.board;
  const piece = board[row][column];
  if (!piece) return [];
  const color = colorOf(piece);
  const moves = [];

  if (piece.toLowerCase() === "p") {
    const direction = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;
    const promotionRow = color === "w" ? 0 : 7;
    const oneRow = row + direction;
    if (inside(oneRow, column) && !board[oneRow][column]) {
      addMove(moves, row, column, oneRow, column, oneRow === promotionRow ? { promotion: true } : {});
      const twoRow = row + direction * 2;
      if (row === startRow && !board[twoRow][column]) {
        addMove(moves, row, column, twoRow, column);
      }
    }
    for (const targetColumn of [column - 1, column + 1]) {
      const targetRow = row + direction;
      if (!inside(targetRow, targetColumn)) continue;
      const target = board[targetRow][targetColumn];
      if (target && colorOf(target) !== color && target.toLowerCase() !== "k") {
        addMove(moves, row, column, targetRow, targetColumn, targetRow === promotionRow ? { promotion: true } : {});
      } else if (
        position.enPassant
        && position.enPassant.row === targetRow
        && position.enPassant.column === targetColumn
      ) {
        addMove(moves, row, column, targetRow, targetColumn, { enPassant: true });
      }
    }
    return moves;
  }

  if (piece.toLowerCase() === "n") {
    for (const [rowOffset, columnOffset] of [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ]) {
      const targetRow = row + rowOffset;
      const targetColumn = column + columnOffset;
      if (
        inside(targetRow, targetColumn)
        && !sameColor(piece, board[targetRow][targetColumn])
        && board[targetRow][targetColumn]?.toLowerCase() !== "k"
      ) addMove(moves, row, column, targetRow, targetColumn);
    }
    return moves;
  }

  const directions = [];
  if (["b", "q"].includes(piece.toLowerCase())) {
    directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
  }
  if (["r", "q"].includes(piece.toLowerCase())) {
    directions.push([-1, 0], [1, 0], [0, -1], [0, 1]);
  }
  if (piece.toLowerCase() === "k") {
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        if (rowOffset || columnOffset) directions.push([rowOffset, columnOffset, true]);
      }
    }
  }

  for (const [rowOffset, columnOffset, isKingStep] of directions) {
    let targetRow = row + rowOffset;
    let targetColumn = column + columnOffset;
    while (inside(targetRow, targetColumn)) {
      const target = board[targetRow][targetColumn];
      if (sameColor(piece, target) || target?.toLowerCase() === "k") break;
      addMove(moves, row, column, targetRow, targetColumn);
      if (target || isKingStep) break;
      targetRow += rowOffset;
      targetColumn += columnOffset;
    }
  }

  if (piece.toLowerCase() === "k" && !isInCheck(position, color)) {
    const homeRow = color === "w" ? 7 : 0;
    const kingSide = color === "w" ? "K" : "k";
    const queenSide = color === "w" ? "Q" : "q";
    if (
      row === homeRow && column === 4 && position.castling[kingSide]
      && !board[homeRow][5] && !board[homeRow][6]
      && board[homeRow][7] === (color === "w" ? "R" : "r")
      && !isSquareAttacked(position, homeRow, 5, color === "w" ? "b" : "w")
      && !isSquareAttacked(position, homeRow, 6, color === "w" ? "b" : "w")
    ) addMove(moves, row, column, homeRow, 6, { castle: "king" });
    if (
      row === homeRow && column === 4 && position.castling[queenSide]
      && !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3]
      && board[homeRow][0] === (color === "w" ? "R" : "r")
      && !isSquareAttacked(position, homeRow, 3, color === "w" ? "b" : "w")
      && !isSquareAttacked(position, homeRow, 2, color === "w" ? "b" : "w")
    ) addMove(moves, row, column, homeRow, 2, { castle: "queen" });
  }

  return moves;
}

function applyMove(position, move, promotion = "Q") {
  const next = cloneGame(position);
  const [fromRow, fromColumn] = move.from;
  const [toRow, toColumn] = move.to;
  const piece = next.board[fromRow][fromColumn];
  const capturedPiece = move.enPassant
    ? next.board[toRow - (position.turn === "w" ? -1 : 1)][toColumn]
    : next.board[toRow][toColumn];

  next.board[fromRow][fromColumn] = null;
  if (move.enPassant) {
    next.board[toRow - (position.turn === "w" ? -1 : 1)][toColumn] = null;
  }
  next.board[toRow][toColumn] = move.promotion
    ? (position.turn === "w" ? promotion : promotion.toLowerCase())
    : piece;

  if (move.castle) {
    const rookFrom = move.castle === "king" ? 7 : 0;
    const rookTo = move.castle === "king" ? 5 : 3;
    next.board[toRow][rookTo] = next.board[toRow][rookFrom];
    next.board[toRow][rookFrom] = null;
  }

  if (piece === "K") {
    next.castling.K = false;
    next.castling.Q = false;
  } else if (piece === "k") {
    next.castling.k = false;
    next.castling.q = false;
  }
  if (piece === "R" && fromRow === 7 && fromColumn === 0) next.castling.Q = false;
  if (piece === "R" && fromRow === 7 && fromColumn === 7) next.castling.K = false;
  if (piece === "r" && fromRow === 0 && fromColumn === 0) next.castling.q = false;
  if (piece === "r" && fromRow === 0 && fromColumn === 7) next.castling.k = false;
  if (capturedPiece === "R" && toRow === 7 && toColumn === 0) next.castling.Q = false;
  if (capturedPiece === "R" && toRow === 7 && toColumn === 7) next.castling.K = false;
  if (capturedPiece === "r" && toRow === 0 && toColumn === 0) next.castling.q = false;
  if (capturedPiece === "r" && toRow === 0 && toColumn === 7) next.castling.k = false;

  next.enPassant = Math.abs(toRow - fromRow) === 2
    ? { row: (toRow + fromRow) / 2, column: fromColumn }
    : null;
  next.turn = position.turn === "w" ? "b" : "w";
  return next;
}

function legalMoves(position, row, column) {
  const piece = position.board[row][column];
  if (!piece || colorOf(piece) !== position.turn) return [];
  return pseudoMoves(position, row, column).filter((move) => (
    !isInCheck(applyMove(position, move), position.turn)
  ));
}

function allLegalMoves(position, color = position.turn) {
  const moves = [];
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      if (colorOf(position.board[row][column]) !== color) continue;
      moves.push(...legalMoves(position, row, column));
    }
  }
  return moves;
}

function renderBoard() {
  const checkedKing = isInCheck(game, game.turn) ? findKing(game, game.turn) : null;
  boardElement.replaceChildren();

  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const square = document.createElement("button");
      const piece = game.board[row][column];
      const moveTarget = selectedMoves.some((move) => move.to[0] === row && move.to[1] === column);
      const isLastMove = lastMove?.some(([moveRow, moveColumn]) => moveRow === row && moveColumn === column);
      square.type = "button";
      square.className = `square ${(row + column) % 2 === 0 ? "light" : "dark"}`;
      square.setAttribute("role", "gridcell");
      square.setAttribute(
        "aria-label",
        `${squareName(row, column)}${piece ? ` ${colorOf(piece) === "w" ? "white" : "black"} ${pieceName(piece)}` : ""}${moveTarget ? ", legal move" : ""}`,
      );
      if (piece) {
        const pieceElement = document.createElement("span");
        pieceElement.className = `piece ${colorOf(piece) === "w" ? "white" : "black"}`;
        pieceElement.setAttribute("aria-hidden", "true");
        pieceElement.textContent = pieceSymbols[piece];
        square.append(pieceElement);
      }
      if (selectedSquare?.[0] === row && selectedSquare?.[1] === column) square.classList.add("selected");
      if (isLastMove) square.classList.add("last-move");
      if (moveTarget) {
        square.classList.add(piece ? "legal-capture" : "legal-move");
        if (piece) square.setAttribute("aria-label", `${square.getAttribute("aria-label")}, capture`);
      }
      if (checkedKing?.[0] === row && checkedKing?.[1] === column) square.classList.add("in-check");
      if (column === 0) {
        const rank = document.createElement("span");
        rank.className = "rank-label";
        rank.setAttribute("aria-hidden", "true");
        rank.textContent = String(8 - row);
        square.append(rank);
      }
      if (row === 7) {
        const file = document.createElement("span");
        file.className = "file-label";
        file.setAttribute("aria-hidden", "true");
        file.textContent = files[column];
        square.append(file);
      }
      square.addEventListener("click", () => handleSquareClick(row, column));
      boardElement.append(square);
    }
  }
}

function pieceName(piece) {
  return ({
    k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn",
  })[piece.toLowerCase()];
}

function renderStatus() {
  const checked = isInCheck(game, game.turn);
  const hasMoves = allLegalMoves(game).length > 0;
  const player = playerName(game.turn);
  turnTextElement.textContent = hasMoves ? player : "Game over";
  turnIndicatorElement.classList.toggle("black", game.turn === "b");
  if (!hasMoves) {
    const winner = checked ? (game.turn === "w" ? "b" : "w") : null;
    recordGameResult(winner);
    statusElement.textContent = checked
      ? `Checkmate — ${playerName(winner)} wins`
      : "Draw — stalemate";
    return;
  }
  statusElement.textContent = checked ? `${player} is in check` : `${player} to move`;
}

function render() {
  renderBoard();
  renderStatus();
}

function handleSquareClick(row, column) {
  if (pendingPromotion) return;
  const targetMove = selectedMoves.find((move) => move.to[0] === row && move.to[1] === column);
  if (targetMove) {
    if (targetMove.promotion) {
      showPromotion(targetMove);
    } else {
      completeMove(targetMove);
    }
    return;
  }

  if (colorOf(game.board[row][column]) === game.turn) {
    selectedSquare = [row, column];
    selectedMoves = legalMoves(game, row, column);
  } else {
    selectedSquare = null;
    selectedMoves = [];
  }
  renderBoard();
}

function showPromotion(move) {
  pendingPromotion = move;
  promotionOptionsElement.replaceChildren();
  const color = game.turn;
  for (const piece of promotionPieces) {
    const button = document.createElement("button");
    const symbol = color === "w" ? piece : piece.toLowerCase();
    button.type = "button";
    button.setAttribute("aria-label", `Promote to ${pieceName(piece)}`);
    button.innerHTML = `<span class="promotion-piece" aria-hidden="true">${pieceSymbols[symbol]}</span><span class="promotion-name">${pieceName(piece)}</span>`;
    button.addEventListener("click", () => {
      const chosenMove = pendingPromotion;
      pendingPromotion = null;
      promotionBackdrop.hidden = true;
      completeMove(chosenMove, piece);
    });
    promotionOptionsElement.append(button);
  }
  promotionBackdrop.hidden = false;
  promotionOptionsElement.querySelector("button").focus();
}

function completeMove(move, promotion) {
  game = applyMove(game, move, promotion);
  lastMove = [move.from, move.to];
  selectedSquare = null;
  selectedMoves = [];
  render();
}

function startNewGame() {
  game = initialGame();
  selectedSquare = null;
  selectedMoves = [];
  lastMove = null;
  pendingPromotion = null;
  gameResultRecorded = false;
  promotionBackdrop.hidden = true;
  render();
}

document.querySelector("#reset-button").addEventListener("click", startNewGame);
for (const color of ["w", "b"]) {
  const side = color === "w" ? "white" : "black";
  const nameInput = document.querySelector(`#${side}-name`);
  nameInput.addEventListener("input", () => {
    leaderboard[color].name = nameInput.value;
    saveLeaderboard();
    document.querySelector(`#${side}-player-name`).textContent = playerName(color);
    document.querySelector(`#${side}-board-name`).textContent = playerName(color);
    renderStatus();
  });
}
renderLeaderboard();
startNewGame();

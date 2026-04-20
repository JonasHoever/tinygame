const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function createInitialGame() {
  return {
    type: "tic-tac-toe",
    board: Array(9).fill(null),
    currentTurn: "X",
    winner: null,
    isDraw: false,
    rematchVotes: new Set(),
    statusText: "Warten auf zweiten Spieler…",
  };
}

function checkWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function isBoardFull(board) {
  return board.every(Boolean);
}

module.exports = {
  createInitialGame,
  checkWinner,
  isBoardFull,
};

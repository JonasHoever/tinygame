const { createInitialGame, checkWinner, isBoardFull } = require("./ticTacToe");

const MAX_PLAYERS = 2;
const rooms = new Map();

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createRoom(username) {
  let roomCode = generateRoomCode();
  while (rooms.has(roomCode)) roomCode = generateRoomCode();

  rooms.set(roomCode, {
    code: roomCode,
    users: [],
    score: {},
    game: createInitialGame(),
  });

  return { roomCode, username };
}

function roomExists(roomCode) {
  return rooms.has(roomCode);
}

function getRoom(roomCode) {
  return rooms.get(roomCode);
}

function addUserToRoom({ roomCode, socketId, username }) {
  const room = rooms.get(roomCode);
  if (!room) return { error: "Raum existiert nicht." };

  const already = room.users.find((u) => u.id === socketId);
  if (already) return { room, user: already };

  if (room.users.filter((u) => u.symbol).length >= MAX_PLAYERS) {
    room.users.push({ id: socketId, username, symbol: null, connected: true });
    return { room, user: room.users.at(-1) };
  }

  const symbol = room.users.some((u) => u.symbol === "X") ? "O" : "X";
  const user = { id: socketId, username, symbol, connected: true };
  room.users.push(user);
  room.score[user.id] = room.score[user.id] || 0;

  if (room.users.filter((u) => u.symbol).length === 2) {
    room.game.statusText = `Am Zug: ${room.game.currentTurn}`;
  }

  return { room, user };
}

function serializeRoom(room, currentUserId) {
  const currentUser = room.users.find((u) => u.id === currentUserId);
  return {
    roomCode: room.code,
    symbol: currentUser?.symbol || null,
    users: room.users.map((u) => ({
      username: u.username,
      symbol: u.symbol,
      connected: u.connected,
      score: room.score[u.id] || 0,
    })),
    game: {
      ...room.game,
      rematchVotes: undefined,
    },
  };
}

function applyMove(room, socketId, index) {
  const user = room.users.find((u) => u.id === socketId);
  if (!user || !user.symbol) return { error: "Nur aktive Spieler dürfen ziehen." };
  if (room.game.winner || room.game.isDraw) return { error: "Runde ist beendet." };
  if (room.game.currentTurn !== user.symbol) return { error: "Du bist nicht am Zug." };
  if (index < 0 || index > 8 || room.game.board[index]) return { error: "Ungültiger Zug." };

  room.game.board[index] = user.symbol;

  const winner = checkWinner(room.game.board);
  if (winner) {
    room.game.winner = winner;
    room.game.statusText = `Gewinner: ${winner}`;
    room.score[socketId] = (room.score[socketId] || 0) + 1;
    return { ok: true };
  }

  if (isBoardFull(room.game.board)) {
    room.game.isDraw = true;
    room.game.statusText = "Unentschieden";
    return { ok: true };
  }

  room.game.currentTurn = room.game.currentTurn === "X" ? "O" : "X";
  room.game.statusText = `Am Zug: ${room.game.currentTurn}`;
  return { ok: true };
}

function markDisconnected(socketId) {
  for (const room of rooms.values()) {
    const user = room.users.find((u) => u.id === socketId);
    if (user) {
      user.connected = false;
      room.game.statusText = `${user.username} getrennt`;
      return { room, user };
    }
  }
  return null;
}

function removeUser(socketId) {
  for (const room of rooms.values()) {
    const idx = room.users.findIndex((u) => u.id === socketId);
    if (idx !== -1) {
      const [leftUser] = room.users.splice(idx, 1);
      delete room.score[socketId];
      if (room.users.length === 0) rooms.delete(room.code);
      return { room, leftUser };
    }
  }
  return null;
}

function requestRematch(room, socketId) {
  room.game.rematchVotes.add(socketId);

  const activePlayers = room.users.filter((u) => u.symbol).map((u) => u.id);
  const allVoted = activePlayers.length === 2 && activePlayers.every((id) => room.game.rematchVotes.has(id));

  if (allVoted) {
    const newGame = createInitialGame();
    newGame.statusText = `Am Zug: ${newGame.currentTurn}`;
    room.game = newGame;
    return { restarted: true };
  }

  return { restarted: false };
}

module.exports = {
  createRoom,
  roomExists,
  getRoom,
  addUserToRoom,
  serializeRoom,
  applyMove,
  markDisconnected,
  removeUser,
  requestRematch,
};

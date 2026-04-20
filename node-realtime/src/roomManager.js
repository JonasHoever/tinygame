const { createInitialGame, checkWinner, isBoardFull } = require("./ticTacToe");

const MAX_PLAYERS = 2;
const rooms = new Map();

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom() {
  let roomCode = generateRoomCode();
  while (rooms.has(roomCode)) roomCode = generateRoomCode();

  rooms.set(roomCode, {
    code: roomCode,
    users: [],
    score: {},
    game: createInitialGame(),
  });

  return { roomCode };
}

function roomExists(roomCode) {
  return rooms.has(roomCode);
}

function getRoom(roomCode) {
  return rooms.get(roomCode);
}

function findRoomBySocketId(socketId) {
  for (const room of rooms.values()) {
    if (room.users.some((u) => u.id === socketId)) return room;
  }
  return null;
}

function addUserToRoom({ roomCode, socketId, sessionId, username }) {
  const room = rooms.get(roomCode);
  if (!room) return { error: "Raum existiert nicht." };

  const existingSession = room.users.find((u) => u.sessionId === sessionId);
  if (existingSession) {
    existingSession.id = socketId;
    existingSession.username = username;
    existingSession.connected = true;
    return { room, user: existingSession };
  }

  const activePlayers = room.users.filter((u) => u.symbol && u.connected);
  if (activePlayers.length >= MAX_PLAYERS) {
    const watcher = { id: socketId, sessionId, username, symbol: null, connected: true };
    room.users.push(watcher);
    return { room, user: watcher };
  }

  const connectedSymbols = new Set(room.users.filter((u) => u.connected).map((u) => u.symbol));
  const symbol = connectedSymbols.has("X") ? "O" : "X";
  const user = { id: socketId, sessionId, username, symbol, connected: true };
  room.users.push(user);
  room.score[user.sessionId] = room.score[user.sessionId] || 0;

  if (room.users.filter((u) => u.symbol && u.connected).length === 2) {
    room.game.statusText = `Am Zug: ${room.game.currentTurn}`;
  }

  return { room, user };
}

function serializeRoom(room, currentUserSessionId) {
  const currentUser = room.users.find((u) => u.sessionId === currentUserSessionId);
  return {
    roomCode: room.code,
    symbol: currentUser?.symbol || null,
    users: room.users.map((u) => ({
      username: u.username,
      symbol: u.symbol,
      connected: u.connected,
      score: room.score[u.sessionId] || 0,
    })),
    game: {
      ...room.game,
      rematchVotes: undefined,
    },
  };
}

function applyMove(room, sessionId, index) {
  const user = room.users.find((u) => u.sessionId === sessionId);
  if (!user || !user.symbol) return { error: "Nur aktive Spieler dürfen ziehen." };
  if (room.game.winner || room.game.isDraw) return { error: "Runde ist beendet." };
  if (room.game.currentTurn !== user.symbol) return { error: "Du bist nicht am Zug." };
  if (index < 0 || index > 8 || room.game.board[index]) return { error: "Ungültiger Zug." };

  room.game.board[index] = user.symbol;

  const winner = checkWinner(room.game.board);
  if (winner) {
    room.game.winner = winner;
    room.game.statusText = `Gewinner: ${winner}`;
    room.score[sessionId] = (room.score[sessionId] || 0) + 1;
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
  const room = findRoomBySocketId(socketId);
  if (!room) return null;

  const user = room.users.find((u) => u.id === socketId);
  if (!user) return null;

  user.connected = false;
  room.game.statusText = `${user.username} getrennt`;
  return { room, user };
}

function removeUser(socketId) {
  const room = findRoomBySocketId(socketId);
  if (!room) return null;

  const idx = room.users.findIndex((u) => u.id === socketId);
  if (idx === -1) return null;

  const [leftUser] = room.users.splice(idx, 1);
  delete room.score[leftUser.sessionId];

  if (room.users.filter((u) => u.symbol && u.connected).length < 2) {
    room.game.statusText = "Warten auf zweiten Spieler…";
  }

  if (room.users.length === 0) rooms.delete(room.code);
  return { room, leftUser };
}

function requestRematch(room, sessionId) {
  room.game.rematchVotes.add(sessionId);

  const activePlayers = room.users.filter((u) => u.symbol && u.connected).map((u) => u.sessionId);
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
  findRoomBySocketId,
  addUserToRoom,
  serializeRoom,
  applyMove,
  markDisconnected,
  removeUser,
  requestRematch,
};

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const {
  createRoom,
  roomExists,
  findRoomBySocketId,
  addUserToRoom,
  serializeRoom,
  applyMove,
  markDisconnected,
  removeUser,
  requestRematch,
} = require("./src/roomManager");

const app = express();
app.use(cors());
app.use(express.json());

let matchmakingQueue = null;

app.post("/rooms", (_req, res) => {
  const result = createRoom();
  return res.status(201).json({ roomCode: result.roomCode });
});

app.post("/rooms/join", (req, res) => {
  const roomCode = (req.body.roomCode || "").toString().trim().toUpperCase();
  if (!roomCode || !roomExists(roomCode)) {
    return res.status(404).json({ error: "Raumcode ungültig oder nicht gefunden." });
  }
  return res.status(200).json({ roomCode });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

function getSessionId(payload, socket) {
  const incoming = (payload?.sessionId || "").toString().trim();
  if (incoming.length > 0) {
    socket.data.sessionId = incoming;
    return incoming;
  }

  if (socket.data.sessionId) return socket.data.sessionId;

  socket.data.sessionId = socket.id;
  return socket.id;
}

function broadcastRoomState(room) {
  room.users.forEach((user) => {
    if (!user.connected) return;
    io.to(user.id).emit("room:state", serializeRoom(room, user.sessionId));
  });
}

function attachSocketToRoom(socket, roomCode, username, sessionId) {
  const { room, user, error } = addUserToRoom({
    roomCode,
    socketId: socket.id,
    sessionId,
    username: (username || "Player").toString().slice(0, 16),
  });

  if (error) return { error };

  socket.join(roomCode);
  socket.data.roomCode = roomCode;
  io.to(roomCode).emit("notice", `${user.username} verbunden`);
  broadcastRoomState(room);
  return { room, user };
}

function runMatchmaking(socket, username, sessionId) {
  if (matchmakingQueue?.sessionId === sessionId) {
    socket.emit("matchmaking:status", { status: "waiting" });
    return;
  }

  if (!matchmakingQueue) {
    matchmakingQueue = { socketId: socket.id, sessionId, username };
    socket.emit("matchmaking:status", { status: "waiting" });
    return;
  }

  const opponentSocket = io.sockets.sockets.get(matchmakingQueue.socketId);
  if (!opponentSocket) {
    matchmakingQueue = { socketId: socket.id, sessionId, username };
    socket.emit("matchmaking:status", { status: "waiting" });
    return;
  }

  const roomCode = createRoom().roomCode;
  const playerA = {
    socket: opponentSocket,
    username: matchmakingQueue.username,
    sessionId: matchmakingQueue.sessionId,
  };
  const playerB = { socket, username, sessionId };
  matchmakingQueue = null;

  attachSocketToRoom(playerA.socket, roomCode, playerA.username, playerA.sessionId);
  attachSocketToRoom(playerB.socket, roomCode, playerB.username, playerB.sessionId);

  playerA.socket.emit("matchmaking:matched", { roomCode });
  playerB.socket.emit("matchmaking:matched", { roomCode });
}

io.on("connection", (socket) => {
  socket.on("room:join", (payload = {}) => {
    const normalizedCode = (payload.roomCode || "").toUpperCase();
    if (!roomExists(normalizedCode)) return socket.emit("error:message", "Raum existiert nicht.");

    const sessionId = getSessionId(payload, socket);
    const result = attachSocketToRoom(socket, normalizedCode, payload.username, sessionId);
    if (result.error) socket.emit("error:message", result.error);
  });

  socket.on("matchmaking:join", (payload = {}) => {
    const sessionId = getSessionId(payload, socket);
    runMatchmaking(socket, (payload.username || "Player").toString().trim() || "Player", sessionId);
  });

  socket.on("matchmaking:leave", () => {
    if (matchmakingQueue?.socketId === socket.id || matchmakingQueue?.sessionId === socket.data.sessionId) {
      matchmakingQueue = null;
    }
    socket.emit("matchmaking:status", { status: "idle" });
  });

  socket.on("game:move", ({ index }) => {
    const room = findRoomBySocketId(socket.id);
    if (!room) return;

    const result = applyMove(room, socket.data.sessionId, Number(index));
    if (result.error) return socket.emit("error:message", result.error);

    broadcastRoomState(room);
  });

  socket.on("chat:send", ({ text }) => {
    const room = findRoomBySocketId(socket.id);
    if (!room) return;

    const user = room.users.find((u) => u.id === socket.id);
    if (!user) return;

    io.to(room.code).emit("chat:new", {
      username: user.username,
      text: (text || "").toString().slice(0, 140),
    });
  });

  socket.on("rematch:request", () => {
    const room = findRoomBySocketId(socket.id);
    if (!room) return;

    const result = requestRematch(room, socket.data.sessionId);
    if (!result.restarted) {
      socket.emit("notice", "Rematch angefragt. Warte auf Gegner.");
      return;
    }

    io.to(room.code).emit("notice", "Rematch gestartet!");
    broadcastRoomState(room);
  });

  socket.on("room:leave", () => {
    const removed = removeUser(socket.id);
    if (!removed?.room) return;

    socket.leave(removed.room.code);
    socket.data.roomCode = null;
    io.to(removed.room.code).emit("notice", `${removed.leftUser.username} hat den Raum verlassen`);
    broadcastRoomState(removed.room);
  });

  socket.on("disconnect", () => {
    if (matchmakingQueue?.socketId === socket.id || matchmakingQueue?.sessionId === socket.data.sessionId) {
      matchmakingQueue = null;
    }

    const marked = markDisconnected(socket.id);
    if (marked?.room) {
      io.to(marked.room.code).emit("notice", `${marked.user.username} getrennt`);
      broadcastRoomState(marked.room);
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Realtime server listening on :${PORT}`);
});

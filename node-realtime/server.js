const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const {
  createRoom,
  roomExists,
  getRoom,
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

// REST API used by Flask as gateway.
app.post("/rooms", (req, res) => {
  const username = (req.body.username || "Player").toString().trim();
  const result = createRoom(username);
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
const io = new Server(server, {
  cors: { origin: "*" },
});

function broadcastRoomState(room) {
  room.users.forEach((user) => {
    io.to(user.id).emit("room:state", serializeRoom(room, user.id));
  });
}

io.on("connection", (socket) => {
  socket.on("room:join", ({ roomCode, username }) => {
    const normalizedCode = (roomCode || "").toUpperCase();
    if (!roomExists(normalizedCode)) {
      return socket.emit("error:message", "Raum existiert nicht.");
    }

    const { room, user, error } = addUserToRoom({
      roomCode: normalizedCode,
      socketId: socket.id,
      username: (username || "Player").toString().slice(0, 16),
    });

    if (error) return socket.emit("error:message", error);

    socket.join(normalizedCode);
    io.to(normalizedCode).emit("notice", `${user.username} verbunden`);
    broadcastRoomState(room);
  });

  socket.on("game:move", ({ index }) => {
    const roomData = [...io.sockets.adapter.rooms.entries()].find(([, ids]) => ids.has(socket.id));
    if (!roomData) return;
    const [roomCode] = roomData;
    const room = getRoom(roomCode);
    if (!room) return;

    const result = applyMove(room, socket.id, Number(index));
    if (result.error) return socket.emit("error:message", result.error);

    broadcastRoomState(room);
  });

  socket.on("chat:send", ({ text }) => {
    const roomData = [...io.sockets.adapter.rooms.entries()].find(([, ids]) => ids.has(socket.id));
    if (!roomData) return;
    const [roomCode] = roomData;
    const room = getRoom(roomCode);
    if (!room) return;

    const user = room.users.find((u) => u.id === socket.id);
    if (!user) return;

    io.to(roomCode).emit("chat:new", {
      username: user.username,
      text: (text || "").toString().slice(0, 140),
    });
  });

  socket.on("rematch:request", () => {
    const roomData = [...io.sockets.adapter.rooms.entries()].find(([, ids]) => ids.has(socket.id));
    if (!roomData) return;
    const [roomCode] = roomData;
    const room = getRoom(roomCode);
    if (!room) return;

    const result = requestRematch(room, socket.id);
    if (!result.restarted) {
      socket.emit("notice", "Rematch angefragt. Warte auf Gegner.");
      return;
    }

    io.to(roomCode).emit("notice", "Rematch gestartet!");
    broadcastRoomState(room);
  });

  socket.on("room:leave", () => {
    const removed = removeUser(socket.id);
    if (!removed?.room) return;
    io.to(removed.room.code).emit("notice", `${removed.leftUser.username} hat den Raum verlassen`);
    broadcastRoomState(removed.room);
  });

  socket.on("disconnect", () => {
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

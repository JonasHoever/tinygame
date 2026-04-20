const state = {
  socket: null,
  socketUrl: null,
  roomCode: null,
  playerId: null,
  symbol: null,
  board: Array(9).fill(null),
  users: [],
};

const els = {
  username: document.getElementById("username"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  lobbyStatus: document.getElementById("lobbyStatus"),
  gamePanel: document.getElementById("game-panel"),
  lobbyPanel: document.getElementById("lobby-panel"),
  roomCodeText: document.getElementById("roomCodeText"),
  playerSymbol: document.getElementById("playerSymbol"),
  turnInfo: document.getElementById("turnInfo"),
  board: document.getElementById("board"),
  rematchBtn: document.getElementById("rematchBtn"),
  leaveBtn: document.getElementById("leaveBtn"),
  playersList: document.getElementById("playersList"),
  chatPanel: document.getElementById("chat-panel"),
  chatMessages: document.getElementById("chatMessages"),
  chatInput: document.getElementById("chatInput"),
  sendChatBtn: document.getElementById("sendChatBtn"),
};

async function init() {
  const configResponse = await fetch("/api/config");
  const config = await configResponse.json();
  state.socketUrl = config.socketUrl;
  renderBoard();
  bindEvents();
}

function bindEvents() {
  els.createRoomBtn.addEventListener("click", async () => {
    const payload = { username: getUsername() };
    const response = await postJson("/api/rooms", payload);
    if (!response.ok) return setStatus(response.data.error || "Raum erstellen fehlgeschlagen");
    connectSocket(response.data.roomCode);
  });

  els.joinRoomBtn.addEventListener("click", async () => {
    const roomCode = els.roomCodeInput.value.trim().toUpperCase();
    const payload = { username: getUsername(), roomCode };
    const response = await postJson("/api/rooms/join", payload);
    if (!response.ok) return setStatus(response.data.error || "Beitritt fehlgeschlagen");
    connectSocket(roomCode);
  });

  els.rematchBtn.addEventListener("click", () => emit("rematch:request", {}));
  els.leaveBtn.addEventListener("click", leaveRoom);
  els.sendChatBtn.addEventListener("click", sendChatMessage);
}

function connectSocket(roomCode) {
  if (state.socket) state.socket.disconnect();

  const socket = io(state.socketUrl, { transports: ["websocket"] });
  state.socket = socket;
  state.roomCode = roomCode;

  socket.on("connect", () => {
    state.playerId = socket.id;
    setStatus("Verbunden. Trete Raum bei …");
    emit("room:join", { roomCode, username: getUsername() });
  });

  socket.on("room:state", (payload) => {
    state.symbol = payload.symbol;
    state.board = payload.game.board;
    state.users = payload.users;

    els.roomCodeText.textContent = payload.roomCode;
    els.playerSymbol.textContent = state.symbol;
    els.turnInfo.textContent = payload.game.statusText;
    els.gamePanel.classList.remove("hidden");
    els.chatPanel.classList.remove("hidden");

    renderBoard(payload.game);
    renderPlayers();
  });

  socket.on("chat:new", (msg) => appendChat(`${msg.username}: ${msg.text}`));
  socket.on("notice", (text) => appendChat(`⚡ ${text}`));
  socket.on("error:message", (text) => setStatus(text));
  socket.on("disconnect", () => setStatus("Verbindung getrennt"));
}

function renderBoard(game = { board: state.board, statusText: "Warten…" }) {
  els.board.innerHTML = "";
  game.board.forEach((value, idx) => {
    const btn = document.createElement("button");
    btn.className = `cell ${value ? "played" : ""}`;
    btn.textContent = value || "";
    btn.disabled = Boolean(value);
    btn.addEventListener("click", () => emit("game:move", { index: idx }));
    els.board.appendChild(btn);
  });

  els.turnInfo.textContent = game.statusText;
}

function renderPlayers() {
  els.playersList.innerHTML = "";
  state.users.forEach((user) => {
    const li = document.createElement("li");
    const onlineDot = user.connected ? "🟢" : "⚫";
    li.textContent = `${onlineDot} ${user.username} (${user.symbol || "Zuschauer"})`;
    els.playersList.appendChild(li);
  });
}

function sendChatMessage() {
  const text = els.chatInput.value.trim();
  if (!text) return;
  emit("chat:send", { text });
  els.chatInput.value = "";
}

function appendChat(text) {
  const p = document.createElement("p");
  p.className = "chat-line";
  p.textContent = text;
  els.chatMessages.appendChild(p);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function leaveRoom() {
  if (state.socket) {
    emit("room:leave", {});
    state.socket.disconnect();
    state.socket = null;
  }

  state.roomCode = null;
  state.symbol = null;
  state.board = Array(9).fill(null);
  els.gamePanel.classList.add("hidden");
  els.chatPanel.classList.add("hidden");
  renderBoard();
  setStatus("Raum verlassen");
}

function emit(event, payload) {
  if (!state.socket) return;
  state.socket.emit(event, payload);
}

function getUsername() {
  return els.username.value.trim() || `Player-${Math.floor(Math.random() * 1000)}`;
}

function setStatus(text) {
  els.lobbyStatus.textContent = text;
}

async function postJson(url, body) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return { ok: response.ok, data: await response.json() };
  } catch (error) {
    return { ok: false, data: { error: "Server nicht erreichbar" } };
  }
}

init();

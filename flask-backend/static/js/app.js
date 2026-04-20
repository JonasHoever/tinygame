const state = {
  socket: null,
  socketUrl: null,
  roomCode: null,
  symbol: null,
  board: Array(9).fill(null),
  users: [],
  user: null,
  matchmaking: false,
  sessionId: null,
};

const STORAGE_KEYS = {
  user: "tinygame.user",
  room: "tinygame.room",
  session: "tinygame.session",
};

const els = {
  username: document.getElementById("username"),
  pin: document.getElementById("pin"),
  registerBtn: document.getElementById("registerBtn"),
  loginBtn: document.getElementById("loginBtn"),
  guestBtn: document.getElementById("guestBtn"),
  authStatus: document.getElementById("authStatus"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  matchmakingBtn: document.getElementById("matchmakingBtn"),
  lobbyStatus: document.getElementById("lobbyStatus"),
  gamePanel: document.getElementById("game-panel"),
  roomCodeText: document.getElementById("roomCodeText"),
  playerSymbol: document.getElementById("playerSymbol"),
  turnInfo: document.getElementById("turnInfo"),
  inviteLink: document.getElementById("inviteLink"),
  copyInviteBtn: document.getElementById("copyInviteBtn"),
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

  hydrateSession();
  hydrateSavedUser();
  applyInviteFromUrl();
  ensureSocket();
  renderBoard();
  bindEvents();
}

function bindEvents() {
  els.registerBtn.addEventListener("click", () => registerUser());
  els.loginBtn.addEventListener("click", () => loginUser());
  els.guestBtn.addEventListener("click", setGuestMode);

  els.createRoomBtn.addEventListener("click", async () => {
    if (!ensureUser()) return;
    const response = await postJson("/api/rooms", {});
    if (!response.ok) return setStatus(response.data.error || "Raum erstellen fehlgeschlagen");
    joinRoomRealtime(response.data.roomCode);
  });

  els.joinRoomBtn.addEventListener("click", async () => {
    if (!ensureUser()) return;
    const roomCode = els.roomCodeInput.value.trim().toUpperCase();
    const response = await postJson("/api/rooms/join", { roomCode });
    if (!response.ok) return setStatus(response.data.error || "Beitritt fehlgeschlagen");
    joinRoomRealtime(roomCode);
  });

  els.matchmakingBtn.addEventListener("click", toggleMatchmaking);
  els.rematchBtn.addEventListener("click", () => emit("rematch:request", {}));
  els.leaveBtn.addEventListener("click", leaveRoom);
  els.sendChatBtn.addEventListener("click", sendChatMessage);
  els.copyInviteBtn.addEventListener("click", copyInviteLink);
}

function hydrateSession() {
  const existing = window.localStorage.getItem(STORAGE_KEYS.session);
  state.sessionId = existing || `sess-${crypto.randomUUID()}`;
  if (!existing) window.localStorage.setItem(STORAGE_KEYS.session, state.sessionId);

  const lastRoom = window.localStorage.getItem(STORAGE_KEYS.room);
  if (lastRoom) {
    state.roomCode = lastRoom;
    els.roomCodeInput.value = lastRoom;
  }
}

function hydrateSavedUser() {
  const raw = window.localStorage.getItem(STORAGE_KEYS.user);
  if (!raw) return;

  try {
    state.user = JSON.parse(raw);
    els.username.value = state.user.username;
    setAuthStatus(`Angemeldet: ${state.user.username} (${state.user.mode})`);
  } catch {
    window.localStorage.removeItem(STORAGE_KEYS.user);
  }
}

function applyInviteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const inviteCode = params.get("invite");
  if (!inviteCode) return;

  const normalized = inviteCode.toUpperCase();
  els.roomCodeInput.value = normalized;
  state.roomCode = normalized;
  persistRoom(normalized);
}

function ensureSocket() {
  if (state.socket?.connected) return;

  const socket = io(state.socketUrl, { transports: ["websocket"] });
  state.socket = socket;

  socket.on("connect", () => {
    setStatus("Lobby verbunden");
    tryResumeRoom();
  });

  socket.on("room:state", (payload) => {
    state.symbol = payload.symbol;
    state.board = payload.game.board;
    state.users = payload.users;

    state.roomCode = payload.roomCode;
    persistRoom(payload.roomCode);

    els.roomCodeText.textContent = payload.roomCode;
    els.playerSymbol.textContent = state.symbol || "Zuschauer";
    els.turnInfo.textContent = payload.game.statusText;
    els.inviteLink.value = `${window.location.origin}/?invite=${payload.roomCode}`;

    state.matchmaking = false;
    els.matchmakingBtn.textContent = "Matchmaking starten";
    setStatus("Im Raum verbunden");

    els.gamePanel.classList.remove("hidden");
    els.chatPanel.classList.remove("hidden");
    renderBoard(payload.game);
    renderPlayers();
  });

  socket.on("matchmaking:status", ({ status }) => {
    if (status === "waiting") {
      state.matchmaking = true;
      setStatus("Matchmaking: Warte auf Gegner…");
      els.matchmakingBtn.textContent = "Matchmaking abbrechen";
      return;
    }

    state.matchmaking = false;
    els.matchmakingBtn.textContent = "Matchmaking starten";
  });

  socket.on("matchmaking:matched", ({ roomCode }) => {
    joinRoomRealtime(roomCode);
    setStatus(`Gegner gefunden! Verbinde Raum ${roomCode} ...`);
  });

  socket.on("chat:new", (msg) => appendChat(`${msg.username}: ${msg.text}`));
  socket.on("notice", (text) => appendChat(`⚡ ${text}`));
  socket.on("error:message", (text) => setStatus(text));
  socket.on("disconnect", () => setStatus("Verbindung getrennt"));
}

function tryResumeRoom() {
  if (!state.user?.username || !state.roomCode) return;
  emit("room:join", { roomCode: state.roomCode, username: state.user.username, sessionId: state.sessionId });
}

function joinRoomRealtime(roomCode) {
  ensureSocket();
  state.roomCode = roomCode;
  persistRoom(roomCode);
  emit("room:join", { roomCode, username: state.user.username, sessionId: state.sessionId });
}

function renderBoard(game = { board: state.board, statusText: "Warten…" }) {
  els.board.innerHTML = "";
  game.board.forEach((value, idx) => {
    const btn = document.createElement("button");
    btn.className = `cell ${value ? "played" : ""}`;
    btn.textContent = value || "";
    btn.disabled = Boolean(value) || !state.roomCode;
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
    li.textContent = `${onlineDot} ${user.username} (${user.symbol || "Zuschauer"}) • Score ${user.score || 0}`;
    els.playersList.appendChild(li);
  });
}

function toggleMatchmaking() {
  if (!ensureUser()) return;
  ensureSocket();

  if (!state.matchmaking) {
    emit("matchmaking:join", { username: state.user.username, sessionId: state.sessionId });
    return;
  }

  emit("matchmaking:leave", {});
  setStatus("Matchmaking abgebrochen");
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
  emit("room:leave", {});
  state.roomCode = null;
  state.symbol = null;
  state.board = Array(9).fill(null);
  clearPersistedRoom();

  els.gamePanel.classList.add("hidden");
  els.chatPanel.classList.add("hidden");
  renderBoard();
  setStatus("Raum verlassen");
}

function copyInviteLink() {
  if (!els.inviteLink.value) return;
  navigator.clipboard.writeText(els.inviteLink.value);
  setStatus("Invite-Link kopiert");
}

async function registerUser() {
  const username = els.username.value.trim();
  const pin = els.pin.value.trim();
  const response = await postJson("/api/auth/register", { username, pin });
  if (!response.ok) return setAuthStatus(response.data.error || "Registrierung fehlgeschlagen", true);

  state.user = response.data.user;
  persistUser();
  setAuthStatus(`Registriert: ${state.user.username}`);
  tryResumeRoom();
}

async function loginUser() {
  const username = els.username.value.trim();
  const pin = els.pin.value.trim();
  const response = await postJson("/api/auth/login", { username, pin });
  if (!response.ok) return setAuthStatus(response.data.error || "Login fehlgeschlagen", true);

  state.user = response.data.user;
  persistUser();
  setAuthStatus(`Angemeldet: ${state.user.username}`);
  tryResumeRoom();
}

function setGuestMode() {
  const value = els.username.value.trim();
  state.user = {
    username: value || `Gast-${Math.floor(Math.random() * 10000)}`,
    mode: "guest",
  };
  persistUser();
  setAuthStatus(`Gast-Modus: ${state.user.username}`);
  tryResumeRoom();
}

function ensureUser() {
  if (state.user?.username) return true;
  setAuthStatus("Bitte zuerst anmelden oder Gast wählen.", true);
  return false;
}

function persistUser() {
  window.localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(state.user));
}

function persistRoom(roomCode) {
  window.localStorage.setItem(STORAGE_KEYS.room, roomCode);
}

function clearPersistedRoom() {
  window.localStorage.removeItem(STORAGE_KEYS.room);
}

function emit(event, payload) {
  if (!state.socket) return;
  state.socket.emit(event, payload);
}

function setStatus(text) {
  els.lobbyStatus.textContent = text;
}

function setAuthStatus(text, isError = false) {
  els.authStatus.textContent = text;
  els.authStatus.style.color = isError ? "#ff8ea5" : "#9da7c2";
}

async function postJson(url, body) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: response.ok, data: await response.json() };
  } catch {
    return { ok: false, data: { error: "Server nicht erreichbar" } };
  }
}

init();

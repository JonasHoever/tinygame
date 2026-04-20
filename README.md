# TinyGame Arena

Vollständig lauffähiges Multiplayer-Minigame-Projekt mit **Flask** (Backend/UI Gateway) und **Node.js + Socket.IO** (Realtime-Engine).

## Features

- Raum erstellen / Raum beitreten per Room-Code
- Invite-Link Funktion (`/?invite=ROOMCODE`)
- Fester User-Login (Username + PIN via Flask + SQLite) oder Gastmodus
- Matchmaking (automatische Gegner-Suche)
- Session-Reconnect: Reload hält Spieler im Raum
- Live-Status: Spieler verbunden/getrennt
- Tic Tac Toe als erstes Minigame (modular erweiterbar)
- Serverseitige Zugvalidierung, Winner Detection, Draw Detection
- Rematch-System
- Ingame-Chat + Score je Spieler pro Raum
- Modernes Dark-Mode UI, responsive + kleine Move-Animation

## Architektur

```text
/workspace/tinygame
├── flask-backend
│   ├── app.py                 # Flask App + REST-Gateway + Auth (SQLite)
│   ├── requirements.txt
│   ├── templates/
│   │   └── index.html
│   └── static/
│       ├── css/styles.css
│       └── js/app.js
├── node-realtime
│   ├── package.json
│   ├── server.js              # REST + Socket.IO + Matchmaking
│   └── src/
│       ├── roomManager.js     # Room-/Spieler-/Match-Lifecycle
│       └── ticTacToe.js       # Spielregeln + Gewinnerprüfung
└── install.bat                # One-click Setup für Windows
```

## Start (lokal)

> Voraussetzungen: Python 3.10+ und Node.js 18+

### Optional (Windows One-Click Setup)

```bat
install.bat
```

Das Skript installiert automatisch:
- `node-realtime` Abhängigkeiten via `npm install`
- Python-Venv in `flask-backend/.venv`
- `pip install -r requirements.txt`

### 1) Realtime-Server starten

```bash
cd node-realtime
npm install
npm run start
```

Läuft standardmäßig auf `http://localhost:4000`.

### 2) Flask-Server starten (in zweitem Terminal)

```bash
cd flask-backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Flask läuft auf `http://localhost:5000`.

### 3) Spiel öffnen

- Öffne `http://localhost:5000` in zwei Browser-Tabs oder auf zwei Geräten.
- Wähle Login als fester User (registrieren/einloggen) oder Gastmodus.
- Entweder Raum erstellen/beitreten oder Matchmaking starten.
- Invite-Link kann direkt geteilt werden.

## Erweiterbarkeit

- Neue Games können als eigenes Modul in `node-realtime/src/` implementiert werden.
- `room.game.type` erlaubt Routing auf unterschiedliche Game-Engines.
- Frontend rendert aktuell Tic Tac Toe, kann aber um weitere Boards erweitert werden.

## Kommunikation Flask <-> Node

- **REST via Flask**: Lobby-Aktionen (`/api/rooms`, `/api/rooms/join`) und Auth (`/api/auth/register`, `/api/auth/login`).
- **WebSocket direkt zum Node-Server**: Game-State, Chat, Invite/Room-Events, Matchmaking-Events und Session-basierter Rejoin bei Reload.

# TinyGame Arena

Vollständig lauffähiges Multiplayer-Minigame-Projekt mit **Flask** (Backend/UI Gateway) und **Node.js + Socket.IO** (Realtime-Engine).

## Features

- Raum erstellen / Raum beitreten per Room-Code
- Live-Status: Spieler verbunden/getrennt
- Tic Tac Toe als erstes Minigame (modular erweiterbar)
- Serverseitige Zugvalidierung, Winner Detection, Draw Detection
- Rematch-System
- Einfacher Ingame-Chat
- Score je Spieler pro Raum
- Modernes Dark-Mode UI, responsive + kleine Move-Animation

## Architektur

```text
/workspace/tinygame
├── flask-backend
│   ├── app.py                 # Flask App + REST-Gateway + UI
│   ├── requirements.txt
│   ├── templates/
│   │   └── index.html
│   └── static/
│       ├── css/styles.css
│       └── js/app.js
└── node-realtime
    ├── package.json
    ├── server.js              # REST + Socket.IO Server
    └── src/
        ├── roomManager.js     # Room-/Spieler-/Match-Lifecycle
        └── ticTacToe.js       # Spielregeln + Gewinnerprüfung
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
- Spieler A erstellt einen Raum.
- Spieler B tritt mit Room-Code bei.
- Sofortiges Live-Gameplay ohne Reload.

## Erweiterbarkeit

- Neue Games können als eigenes Modul in `node-realtime/src/` implementiert werden.
- `room.game.type` erlaubt Routing auf unterschiedliche Game-Engines.
- Frontend rendert aktuell Tic Tac Toe, kann aber um weitere Boards erweitert werden.

## Hinweise zu sauberer Kommunikation Flask <-> Node

- **REST**: Flask nimmt Lobby-Aktionen entgegen (`/api/rooms`, `/api/rooms/join`) und leitet intern an Node weiter.
- **WebSocket**: Browser verbindet direkt mit Socket.IO für Game-State & Events.
- Dadurch bleiben HTTP/UI und Realtime-Logik klar getrennt.

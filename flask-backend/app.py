import os
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

import requests
from flask import Flask, jsonify, render_template, request


def create_app() -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")
    socket_rest_base = os.getenv("SOCKET_REST_BASE", "http://localhost:4000")

    db_path = Path(__file__).with_name("users.db")

    def _get_db() -> sqlite3.Connection:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db() -> None:
        with _get_db() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    username TEXT PRIMARY KEY,
                    pin TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )

    _init_db()

    @app.get("/")
    def index() -> str:
        return render_template("index.html")

    @app.get("/api/config")
    def config() -> Any:
        return jsonify(
            {
                "socketUrl": os.getenv("SOCKET_PUBLIC_URL", "http://localhost:4000"),
                "apiBase": "/api",
            }
        )

    @app.post("/api/auth/register")
    def auth_register() -> Any:
        payload: Dict[str, Any] = request.get_json(silent=True) or {}
        username = str(payload.get("username", "")).strip()
        pin = str(payload.get("pin", "")).strip()

        if len(username) < 3:
            return jsonify({"error": "Username muss mindestens 3 Zeichen haben."}), 400
        if len(pin) < 4:
            return jsonify({"error": "PIN muss mindestens 4 Zeichen haben."}), 400

        try:
            with _get_db() as conn:
                conn.execute(
                    "INSERT INTO users(username, pin, created_at) VALUES (?, ?, ?)",
                    (username, pin, datetime.utcnow().isoformat()),
                )
        except sqlite3.IntegrityError:
            return jsonify({"error": "Username bereits vergeben."}), 409

        return jsonify({"ok": True, "user": {"username": username, "mode": "registered"}}), 201

    @app.post("/api/auth/login")
    def auth_login() -> Any:
        payload: Dict[str, Any] = request.get_json(silent=True) or {}
        username = str(payload.get("username", "")).strip()
        pin = str(payload.get("pin", "")).strip()

        with _get_db() as conn:
            row = conn.execute("SELECT username, pin FROM users WHERE username = ?", (username,)).fetchone()

        if row is None or row["pin"] != pin:
            return jsonify({"error": "Login fehlgeschlagen. Username/PIN prüfen."}), 401

        return jsonify({"ok": True, "user": {"username": row["username"], "mode": "registered"}})

    @app.post("/api/rooms")
    def create_room() -> Any:
        payload: Dict[str, Any] = request.get_json(silent=True) or {}
        return _proxy_to_socket_server("/rooms", payload)

    @app.post("/api/rooms/join")
    def join_room() -> Any:
        payload: Dict[str, Any] = request.get_json(silent=True) or {}
        return _proxy_to_socket_server("/rooms/join", payload)

    def _proxy_to_socket_server(path: str, payload: Dict[str, Any]) -> Any:
        try:
            response = requests.post(f"{socket_rest_base}{path}", json=payload, timeout=3)
            return jsonify(response.json()), response.status_code
        except requests.RequestException:
            return (
                jsonify(
                    {
                        "error": "Realtime server is unreachable.",
                        "hint": "Start node-realtime server on port 4000.",
                    }
                ),
                503,
            )

    return app


if __name__ == "__main__":
    application = create_app()
    application.run(host="0.0.0.0", port=5000, debug=True)

import os
from typing import Any, Dict

import requests
from flask import Flask, jsonify, render_template, request


def create_app() -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")

    socket_rest_base = os.getenv("SOCKET_REST_BASE", "http://localhost:4000")

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/config")
    def config() -> Any:
        """Expose frontend runtime config without hardcoding service URLs in JS."""
        return jsonify(
            {
                "socketUrl": os.getenv("SOCKET_PUBLIC_URL", "http://localhost:4000"),
                "apiBase": "/api",
            }
        )

    @app.post("/api/rooms")
    def create_room() -> Any:
        payload: Dict[str, Any] = request.get_json(silent=True) or {}
        return _proxy_to_socket_server("/rooms", payload)

    @app.post("/api/rooms/join")
    def join_room() -> Any:
        payload: Dict[str, Any] = request.get_json(silent=True) or {}
        return _proxy_to_socket_server("/rooms/join", payload)

    def _proxy_to_socket_server(path: str, payload: Dict[str, Any]) -> Any:
        """Keep room/game authority in Node while Flask stays as HTTP gateway + UI server."""
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

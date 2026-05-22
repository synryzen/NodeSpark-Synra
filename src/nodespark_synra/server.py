from __future__ import annotations

import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .app import SynraApp


class SynraHTTPServer(ThreadingHTTPServer):
    def __init__(self, server_address: tuple[str, int], handler_class: type[SimpleHTTPRequestHandler], app: SynraApp, web_root: Path):
        super().__init__(server_address, handler_class)
        self.app = app
        self.web_root = web_root


class SynraRequestHandler(SimpleHTTPRequestHandler):
    server: SynraHTTPServer

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/state":
            self._json({"ok": True, "state": self.server.app.state.snapshot()})
            return
        if path == "/api/health":
            self._json({"ok": True, **self.server.app.health_snapshot()})
            return
        if path == "/api/workflows":
            self._json({"ok": True, "workflows": self.server.app.list_workflows()})
            return
        if path == "/api/tts/status":
            self._json({"ok": True, **self.server.app.tts.status()})
            return
        if path == "/api/local-ai/status":
            self._json({"ok": True, **self.server.app.local_ai.status()})
            return
        if path == "/api/live2d":
            self._json({"ok": True, "live2d": live2d_status(self.server.web_root)})
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        payload = self._read_json()
        if path == "/api/state":
            state = self.server.app.state.set_state(payload)
            self._json({"ok": True, "state": state})
            return
        if path == "/api/command":
            self._json(self.server.app.handle_command(payload, ack=False))
            return
        if path == "/api/connect":
            base_url = str(payload.get("baseUrl") or payload.get("hubUrl") or "")
            try:
                health = self.server.app.connect_hub(base_url)
                self._json({"ok": True, "health": health})
            except Exception as exc:
                self._json({"ok": False, "error": str(exc)}, status=400)
            return
        if path == "/api/pair":
            code = str(payload.get("code") or "")
            try:
                response = self.server.app.pair(code)
                self._json({"ok": True, "response": response})
            except Exception as exc:
                self._json({"ok": False, "error": str(exc)}, status=400)
            return
        if path == "/api/tts":
            text = str(payload.get("text") or "")
            voice = str(payload.get("voice") or "cute")
            try:
                result = self.server.app.tts.synthesize(text, voice)
                self._binary(result.audio, result.content_type, {
                    "X-Synra-TTS-Provider": result.provider,
                    "X-Synra-TTS-Voice": result.voice,
                })
            except Exception as exc:
                self._json({"ok": False, "error": str(exc), **self.server.app.tts.status()}, status=503)
            return
        self._json({"ok": False, "error": f"Unknown API path: {path}"}, status=404)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[http] {self.address_string()} - {fmt % args}")

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        body = self.rfile.read(length)
        try:
            data = json.loads(body.decode("utf-8"))
        except ValueError:
            return {}
        return data if isinstance(data, dict) else {}

    def _json(self, data: dict[str, Any], status: int = 200) -> None:
        encoded = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def _binary(self, data: bytes, content_type: str, headers: dict[str, str] | None = None, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)


def serve(app: SynraApp, host: str, port: int) -> None:
    web_root = Path(__file__).resolve().parents[2] / "web"
    handler = partial(SynraRequestHandler, directory=str(web_root))
    httpd = SynraHTTPServer((host, port), handler, app, web_root)
    print(f"[synra] serving monitor UI at http://{host}:{port}")
    httpd.serve_forever()


def live2d_status(web_root: Path) -> dict[str, Any]:
    model_root = web_root / "assets" / "live2d" / "synra"
    vendor_root = web_root / "assets" / "vendor" / "live2d"
    model_file = model_root / "synra.model3.json"
    vendor_files = {
        "live2dcubismcore": vendor_root / "live2dcubismcore.min.js",
        "pixi": vendor_root / "pixi.min.js",
        "pixiLive2DDisplay": vendor_root / "pixi-live2d-display.min.js",
    }
    status: dict[str, Any] = {
        "modelReady": model_file.is_file(),
        "runtimeReady": all(path.is_file() for path in vendor_files.values()),
        "modelPath": "/assets/live2d/synra/synra.model3.json",
        "vendor": {name: path.is_file() for name, path in vendor_files.items()},
        "missing": [],
    }

    if not model_file.is_file():
        status["missing"].append("web/assets/live2d/synra/synra.model3.json")
    for path in vendor_files.values():
        if not path.is_file():
            status["missing"].append(str(path.relative_to(web_root)))

    if model_file.is_file():
        try:
            model = json.loads(model_file.read_text(encoding="utf-8"))
            refs = model.get("FileReferences") or {}
            status["modelReferences"] = {
                "textures": len(refs.get("Textures") or []),
                "expressions": len(refs.get("Expressions") or []),
                "motionGroups": sorted((refs.get("Motions") or {}).keys()),
                "hasPhysics": bool(refs.get("Physics")),
                "hasPose": bool(refs.get("Pose")),
            }
        except Exception as exc:
            status["modelError"] = str(exc)

    return status

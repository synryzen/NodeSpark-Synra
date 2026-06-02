#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from glob import glob
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


APP_DIR = Path(__file__).resolve().parents[1]
DIST_DIR = APP_DIR / "dist"
STARTED_AT = time.time()


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class SynraHandler(SimpleHTTPRequestHandler):
    server_version = "SynraStandalone/0.1"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def end_headers(self) -> None:
        request_path = self.path.split("?", 1)[0]
        no_store = self.path.startswith("/api/") or request_path in {"/", "/index.html"}
        self.send_header("Cache-Control", "no-store" if no_store else "public, max-age=300")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_GET(self) -> None:
        if self.path.startswith("/api/health"):
            vision = vision_public_status()
            self.send_json(
                200,
                {
                    "ok": True,
                    "service": "synra-standalone",
                    "uptimeSeconds": round(time.time() - STARTED_AT, 1),
                    "modelConfigured": bool(model_endpoint() and model_name()),
                    "model": public_model_name(),
                    "localTools": ["health", "model-status", "smart-home", "vision-status"],
                    "smartHomeConfigured": smart_home_configured(),
                    "cameraDevices": vision["cameraDevices"],
                    "cameraDeviceCount": vision["cameraDeviceCount"],
                    "mediaDeviceCount": vision["mediaDeviceCount"],
                    "videoDeviceCount": vision["videoDeviceCount"],
                },
            )
            return
        if self.path.startswith("/api/model/public"):
            self.send_json(
                200,
                {
                    "configured": bool(model_endpoint() and model_name()),
                    "model": public_model_name(),
                    "endpointLabel": endpoint_label(model_endpoint()),
                    "serverSideCredentials": bool(os.environ.get("SYNRA_MODEL_API_KEY", "").strip()),
                },
            )
            return
        if self.path.startswith("/api/vision/public"):
            self.send_json(200, vision_public_status())
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path.startswith("/api/chat"):
            self.handle_chat()
            return
        if self.path.startswith("/api/tools/smart-home"):
            self.handle_smart_home()
            return
        self.send_json(404, {"ok": False, "error": "Unknown Synra API route."})

    def handle_chat(self) -> None:
        endpoint = model_endpoint()
        model = model_name()
        if not endpoint or not model:
            self.send_json(200, {"ok": False, "error": "No server-side Synra model is configured."})
            return

        try:
            body = self.read_json_body()
            messages = body.get("messages", [])
            memory = body.get("memory", {})
            payload = {
                "model": model,
                "temperature": float(os.environ.get("SYNRA_MODEL_TEMPERATURE", "0.7")),
                "messages": [
                    {
                        "role": "system",
                        "content": system_prompt(memory),
                    },
                    *normalize_messages(messages),
                ],
            }
            response = post_json(endpoint, payload, os.environ.get("SYNRA_MODEL_API_KEY", "").strip())
            text = extract_model_text(response)
            if not text:
                self.send_json(200, {"ok": False, "error": "Model returned no assistant text."})
                return
            self.send_json(200, {"ok": True, "text": text, "model": public_model_name()})
        except urllib.error.HTTPError as error:
            self.send_json(200, {"ok": False, "error": f"Model endpoint returned HTTP {error.code}."})
        except urllib.error.URLError as error:
            self.send_json(200, {"ok": False, "error": f"Model endpoint is unreachable: {error.reason}."})
        except Exception as error:
            self.send_json(200, {"ok": False, "error": str(error)})

    def handle_smart_home(self) -> None:
        try:
            body = self.read_json_body()
            action = str(body.get("action") or "").strip().lower()
            entity_id = str(body.get("entityId") or os.environ.get("SYNRA_HOME_ASSISTANT_DEFAULT_LIGHT", "")).strip()
            if action not in {"turn_on", "turn_off", "toggle"}:
                self.send_json(400, {"ok": False, "error": "Unsupported smart-home action."})
                return
            if not smart_home_configured():
                self.send_json(
                    200,
                    {
                        "ok": False,
                        "configured": False,
                        "error": "Smart home is not configured. Set SYNRA_SMART_HOME_ENABLED=true plus Home Assistant URL, token, and default light entity.",
                    },
                )
                return
            if not entity_id:
                self.send_json(200, {"ok": False, "configured": True, "error": "No light entity is configured."})
                return
            response = call_home_assistant_light(action, entity_id)
            self.send_json(200, {"ok": True, "configured": True, "action": action, "entityId": entity_id, "response": response})
        except urllib.error.HTTPError as error:
            self.send_json(200, {"ok": False, "configured": True, "error": f"Home Assistant returned HTTP {error.code}."})
        except urllib.error.URLError as error:
            self.send_json(200, {"ok": False, "configured": True, "error": f"Home Assistant is unreachable: {error.reason}."})
        except Exception as error:
            self.send_json(200, {"ok": False, "configured": smart_home_configured(), "error": str(error)})

    def read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def model_endpoint() -> str:
    return os.environ.get("SYNRA_MODEL_ENDPOINT", "http://127.0.0.1:11434/v1/chat/completions").strip()


def model_name() -> str:
    return os.environ.get("SYNRA_MODEL_NAME", "llama3.2").strip()


def public_model_name() -> str:
    return os.environ.get("SYNRA_MODEL_LABEL", model_name() or "Not configured").strip()


def smart_home_configured() -> bool:
    return (
        env_bool("SYNRA_SMART_HOME_ENABLED", False)
        and bool(os.environ.get("SYNRA_HOME_ASSISTANT_URL", "").strip())
        and bool(os.environ.get("SYNRA_HOME_ASSISTANT_TOKEN", "").strip())
    )


def camera_devices() -> list[dict[str, Any]]:
    configured = os.environ.get("SYNRA_CAMERA_DEVICE", "").strip()
    paths = sorted(set([*glob("/dev/video*"), *glob("/dev/media*"), *([configured] if configured else [])]))
    devices: list[dict[str, Any]] = []
    for path in paths:
        if not path:
            continue
        devices.append(
            {
                "path": path,
                "exists": Path(path).exists(),
                "configured": bool(configured and path == configured),
                "kind": "video" if Path(path).name.startswith("video") else "media",
            }
        )
    return devices


def vision_public_status() -> dict[str, Any]:
    devices = camera_devices()
    video_count = len([device for device in devices if device["kind"] == "video" and device["exists"]])
    media_count = len([device for device in devices if device["kind"] == "media" and device["exists"]])
    return {
        "ok": True,
        "configuredDevice": os.environ.get("SYNRA_CAMERA_DEVICE", "").strip(),
        "cameraDevices": devices,
        "cameraDeviceCount": video_count,
        "videoDeviceCount": video_count,
        "mediaDeviceCount": media_count,
        "note": "Device-path diagnostics only. Synra does not capture or store camera frames from this endpoint.",
    }


def call_home_assistant_light(action: str, entity_id: str) -> Any:
    base_url = os.environ.get("SYNRA_HOME_ASSISTANT_URL", "").strip().rstrip("/")
    token = os.environ.get("SYNRA_HOME_ASSISTANT_TOKEN", "").strip()
    if not base_url or not token:
        raise ValueError("Home Assistant URL or token is missing.")
    endpoint = f"{base_url}/api/services/light/{action}"
    payload = {"entity_id": entity_id}
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(endpoint, data=data, method="POST")
    request.add_header("Content-Type", "application/json")
    request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=float(os.environ.get("SYNRA_TOOL_TIMEOUT_SECONDS", "12"))) as response:
        raw = response.read().decode("utf-8").strip()
        return json.loads(raw) if raw else []


def endpoint_label(endpoint: str) -> str:
    if not endpoint:
        return "Not configured"
    if "127.0.0.1" in endpoint or "localhost" in endpoint:
        return "Local model endpoint"
    return "Remote model endpoint"


def system_prompt(memory: dict[str, Any]) -> str:
    style = str(memory.get("style") or "warm, direct, and useful")
    preferred_name = str(memory.get("preferredName") or "").strip()
    facts = memory.get("savedFacts") if isinstance(memory.get("savedFacts"), list) else []
    remembered = "; ".join(str(fact)[:220] for fact in facts[-8:])
    parts = [
        "You are Synra, a warm, vivid, practical companion AI assistant.",
        "Be concise, emotionally present, and useful.",
        "Never claim to control devices unless a configured tool confirms it.",
        "Do not expose secrets, tokens, API keys, or private credentials.",
        f"User style preference: {style}.",
    ]
    if preferred_name:
        parts.append(f"Preferred user name: {preferred_name}.")
    if remembered:
        parts.append(f"Remembered facts: {remembered}")
    return "\n".join(parts)


def normalize_messages(messages: Any) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    if not isinstance(messages, list):
        return normalized
    for item in messages[-10:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "user")
        content = str(item.get("text") or item.get("content") or "").strip()
        if not content:
            continue
        if role == "synra":
            role = "assistant"
        if role not in {"user", "assistant", "system"}:
            role = "user"
        normalized.append({"role": role, "content": content[:4000]})
    return normalized


def post_json(endpoint: str, payload: dict[str, Any], api_key: str) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(endpoint, data=data, method="POST")
    request.add_header("Content-Type", "application/json")
    if api_key:
        request.add_header("Authorization", f"Bearer {api_key}")
    with urllib.request.urlopen(request, timeout=float(os.environ.get("SYNRA_MODEL_TIMEOUT_SECONDS", "45"))) as response:
        return json.loads(response.read().decode("utf-8"))


def extract_model_text(response: dict[str, Any]) -> str:
    choices = response.get("choices")
    if isinstance(choices, list) and choices:
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        if isinstance(message, dict):
            return str(message.get("content") or "").strip()
        text = choices[0].get("text") if isinstance(choices[0], dict) else None
        if text:
            return str(text).strip()
    if "response" in response:
        return str(response.get("response") or "").strip()
    return ""


def main() -> None:
    host = os.environ.get("SYNRA_HOST", "0.0.0.0")
    port = int(os.environ.get("SYNRA_PORT", "5191"))
    if not DIST_DIR.exists():
        raise SystemExit(f"Missing built Synra dist directory: {DIST_DIR}")
    server = ThreadingHTTPServer((host, port), SynraHandler)
    print(f"Synra Standalone server listening on http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

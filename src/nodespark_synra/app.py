from __future__ import annotations

import threading
import time
from typing import Any
from urllib.parse import urlparse

from .config import AppConfig, StateStore
from .hub import HubClient
from .state import SynraStateMachine
from .tts import TTSService


def local_assistant_reply(text: str, hub_configured: bool) -> tuple[str, str, str]:
    request = text.strip()
    lowered = request.lower()
    if any(word in lowered for word in ("run", "start", "workflow", "automate", "automation")):
        if hub_configured:
            return (
                "focused",
                "Workflow standby",
                "I can stage that workflow from here. Tell me the workflow name and the inputs, and I'll hand it to NodeSparkHub."
            )
        return (
            "raised_brow",
            "Hub setup needed",
            "I can stage the request, but NodeSparkHub is not connected yet. Set the Hub URL and I'll be able to run workflows from this monitor."
        )
    if any(word in lowered for word in ("camera", "cam", "see", "look")):
        return (
            "look_left",
            "Camera check",
            "Camera awareness is ready on the kiosk path. Once the monitor browser has camera permission, I can use it to react to presence."
        )
    if any(word in lowered for word in ("mic", "microphone", "voice", "hear", "listen")):
        return (
            "attentive",
            "Voice check",
            "Voice input works best from the kiosk monitor because remote HTTP pages can block microphone permission."
        )
    if any(word in lowered for word in ("who are you", "what are you", "synra")):
        return (
            "bright",
            "Synra",
            "I'm Synra, the NodeSparkHub monitor assistant. I show workflow state, speak replies, and help you drive tasks from this screen."
        )
    return (
        "bright",
        "Local assistant",
        "I'm online locally and ready. Connect the NodeSparkHub assistant endpoint when you want me to send this request to the full AI brain."
    )


class SynraApp:
    def __init__(self, cfg: AppConfig, store: StateStore):
        self.cfg = cfg
        self.store = store
        self.state = SynraStateMachine()
        stored_hub_url = store.hub_base_url
        if stored_hub_url:
            cfg.hub.base_url = stored_hub_url
        self.hub = HubClient(
            cfg.hub.base_url,
            store.device_id,
            cfg.device.name,
            store.token,
            timeout=max(1.0, float(cfg.hub.timeout_seconds)),
        )
        self.tts = TTSService(cfg.tts)
        self.running = False
        self._thread: threading.Thread | None = None
        self._hub_offline_until = 0.0
        self._hub_last_error = ""
        self._hub_health: dict[str, Any] = {}
        self._workflow_cache: list[str] = list(cfg.hub.favorite_workflows)

    def hub_can_try(self) -> bool:
        return self.hub.configured() and time.time() >= self._hub_offline_until

    def hub_ready_for_actions(self) -> bool:
        return self.hub_can_try() and bool(self.store.token)

    def hub_offline_detail(self) -> str:
        if not self.hub.configured():
            return "NodeSparkHub URL is not configured."
        if not self.store.token:
            return "Synra is not paired with NodeSparkHub yet."
        if time.time() < self._hub_offline_until:
            return self._hub_last_error or "NodeSparkHub is cooling down after a failed request."
        return ""

    def health_snapshot(self) -> dict[str, Any]:
        selected_model = self._selected_model_name(self._hub_health)
        return {
            "deviceId": self.store.device_id,
            "deviceName": self.cfg.device.name,
            "hubConfigured": self.hub.configured(),
            "hubPaired": bool(self.store.token),
            "hubCanTry": self.hub_can_try(),
            "hubLastError": self.hub_offline_detail(),
            "hubUrl": self.cfg.hub.base_url,
            "defaultWorkflow": self.cfg.hub.default_workflow,
            "favoriteWorkflows": list(self._workflow_cache or self.cfg.hub.favorite_workflows),
            "assistantEndpoint": "/wisp/assistant",
            "assistantModel": selected_model or "NodeSparkHub default",
            "usesHubDefaultModel": True,
        }

    def connect_hub(self, base_url: str) -> dict[str, Any]:
        normalized = self._normalize_base_url(base_url)
        self.cfg.hub.base_url = normalized
        self.store.set_hub_base_url(normalized)
        self.hub.set_base_url(normalized)
        self.mark_hub_ok()
        try:
            self._hub_health = self.hub.health()
            self.mark_hub_ok()
            message = "NodeSparkHub is reachable. Enter a pairing code when you are ready."
            expression = "bright"
            style = "success"
        except Exception as exc:
            self.mark_hub_error(exc)
            message = "I saved the Hub URL, but I cannot reach NodeSparkHub yet."
            expression = "concerned"
            style = "warning"
        self.state.set_state({
            "mode": "success" if style == "success" else "warning",
            "expression": expression,
            "message": message,
            "subtitle": "Hub connection",
            "card": {
                "title": "NodeSparkHub",
                "body": normalized,
                "detail": self.hub_offline_detail() or "Ready to pair",
                "style": style,
            },
        })
        return self.health_snapshot()

    def mark_hub_ok(self) -> None:
        self._hub_offline_until = 0.0
        self._hub_last_error = ""

    def mark_hub_error(self, exc: Exception) -> None:
        self._hub_last_error = str(exc)
        cooldown = max(5, int(self.cfg.hub.offline_cooldown_seconds))
        self._hub_offline_until = time.time() + cooldown

    def start_background(self) -> None:
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._loop, name="synra-hub-loop", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self.running = False
        if self._thread:
            self._thread.join(timeout=2)

    def pair(self, code: str) -> dict[str, Any]:
        response = self.hub.pair(code)
        token = str(response.get("deviceToken", ""))
        if token:
            self.store.set_pairing(str(response.get("hubId", "")), token, response.get("expiresAt"))
            self.hub.token = token
            self.state.set_state({
                "mode": "success",
                "expression": "bright",
                "message": "NodeSparkHub is linked. I can use the Hub AI and workflows now.",
                "subtitle": "Paired",
                "card": {
                    "title": "NodeSparkHub Linked",
                    "body": "Synra is connected.",
                    "detail": "Assistant requests use the Hub default AI model.",
                    "style": "success",
                    "progress": 1,
                },
            })
        return response

    def list_workflows(self) -> list[str]:
        if self.hub_ready_for_actions():
            try:
                workflows = self.hub.list_workflows()
                self.mark_hub_ok()
                if workflows:
                    self._workflow_cache = workflows
                    return workflows
            except Exception as exc:
                self.mark_hub_error(exc)
                print(f"[hub] workflow list failed: {exc}")
        return list(self._workflow_cache or self.cfg.hub.favorite_workflows)

    def handle_command(self, command: dict[str, Any], ack: bool = False) -> dict[str, Any]:
        command_id = str(command.get("id") or command.get("commandId") or "")
        kind = str(command.get("type", "showCard")).strip().lower()

        if kind in {"assistant", "ask", "askai"}:
            text = str(command.get("text") or command.get("body") or "Help me from NodeSpark Synra.")
            self.state.set_state({
                "mode": "thinking",
                "expression": "focused",
                "message": f"Thinking about: {text}",
                "subtitle": "Synra Assistant",
                "card": {
                    "title": "Voice Request",
                    "body": text,
                    "detail": "Sending to NodeSparkHub",
                    "style": "thinking",
                },
            })
            if not self.hub.configured() or not self.hub_ready_for_actions():
                expression, subtitle, reply = local_assistant_reply(text, self.hub.configured())
                if self.hub.configured() and not self.store.token:
                    expression, subtitle, reply = (
                        "raised_brow",
                        "Pair Synra",
                        "I can use NodeSparkHub's default AI model after you pair this monitor with the Hub."
                    )
                if self.hub.configured() and self.store.token:
                    reply = f"{reply} I'm staying in local mode while NodeSparkHub comes back online."
                self.state.apply_command({
                    "type": "speak",
                    "title": "Synra",
                    "text": reply,
                    "subtitle": subtitle,
                    "expression": expression,
                    "detail": self.hub_offline_detail(),
                    "style": "warning" if self.hub.configured() else "voice",
                    "id": command_id,
                })
                result = reply[:240]
            else:
                try:
                    response = self.hub.ask_assistant(text)
                    self.mark_hub_ok()
                    reply = str(response.get("displayText") or response.get("reply") or response.get("message") or "No assistant reply.")
                    model = self._selected_model_name(response) or self._selected_model_name(self._hub_health) or "Hub default AI model"
                    self.state.apply_command({
                        "type": "speak",
                        "title": "Synra",
                        "text": reply,
                        "subtitle": "NodeSparkHub AI",
                        "detail": f"Model: {model}",
                        "id": command_id,
                    })
                    result = reply[:240]
                except Exception as exc:
                    self.mark_hub_error(exc)
                    expression, subtitle, reply = local_assistant_reply(text, True)
                    reply = f"{reply} I could not reach NodeSparkHub yet, so I'm staying in local mode."
                    self.state.apply_command({
                        "type": "speak",
                        "title": "Synra",
                        "text": reply,
                        "subtitle": subtitle,
                        "expression": expression,
                        "detail": str(exc),
                        "style": "warning",
                        "id": command_id,
                    })
                    result = reply[:240]
        elif kind in {"runworkflow", "run", "workflow"}:
            workflow = str(command.get("workflowName") or command.get("workflow") or self.cfg.hub.default_workflow)
            self.state.apply_command({**command, "workflowName": workflow})
            payload = command.get("payload") if isinstance(command.get("payload"), dict) else {}
            payload.setdefault("source", "synra")
            payload.setdefault("deviceId", self.store.device_id)
            if not self.hub.configured() or not self.hub_ready_for_actions():
                result = f"Workflow staged locally: {workflow}. Configure hub.base_url to run it."
                if self.hub.configured():
                    result = f"I staged {workflow} locally. Pair Synra with NodeSparkHub to run it from this monitor."
                self.state.apply_command({
                    "type": "speak",
                    "title": "Workflow Staged",
                    "text": result,
                    "subtitle": workflow,
                    "expression": "raised_brow",
                    "detail": self.hub_offline_detail(),
                    "style": "warning" if self.hub.configured() else "voice",
                    "id": command_id,
                })
            else:
                try:
                    response = self.hub.run_workflow_async(workflow, payload)
                    self.mark_hub_ok()
                    result = f"runId={response.get('runId', '')}"
                except Exception as exc:
                    self.mark_hub_error(exc)
                    result = f"I staged {workflow}, but NodeSparkHub did not accept the run yet. I'll keep the request visible while the Hub comes back online."
                    self.state.apply_command({
                        "type": "speak",
                        "title": "Workflow Staged",
                        "text": result,
                        "subtitle": workflow,
                        "expression": "concerned",
                        "detail": str(exc),
                        "style": "warning",
                        "id": command_id,
                    })
        else:
            result, _snapshot = self.state.apply_command(command)

        if ack and command_id and self.hub_can_try():
            try:
                self.hub.ack_command(command_id, "completed", result)
                self.mark_hub_ok()
            except Exception as exc:
                self.mark_hub_error(exc)
                print(f"[hub] command ack failed: {exc}")

        return {"ok": True, "result": result, "state": self.state.snapshot()}

    def _loop(self) -> None:
        next_checkin = 0.0
        next_poll = 0.0
        while self.running:
            now = time.time()
            if self.hub.configured() and self.hub.token and now >= next_checkin:
                self._checkin()
                next_checkin = now + max(15, int(self.cfg.device.checkin_interval_seconds))
            if self.hub.configured() and self.hub.token and now >= next_poll:
                self._poll_commands()
                next_poll = now + max(1, int(self.cfg.device.command_poll_interval_seconds))
            time.sleep(0.25)

    def _checkin(self) -> None:
        try:
            self.hub.checkin()
            try:
                self._hub_health = self.hub.health()
            except Exception:
                pass
            self.mark_hub_ok()
        except Exception as exc:
            self.mark_hub_error(exc)
            print(f"[hub] checkin failed: {exc}")

    def _poll_commands(self) -> None:
        try:
            commands = self.hub.poll_commands()
            self.mark_hub_ok()
        except Exception as exc:
            self.mark_hub_error(exc)
            print(f"[hub] command poll failed: {exc}")
            return
        for command in commands:
            self.handle_command(command, ack=True)

    @staticmethod
    def _normalize_base_url(value: str) -> str:
        text = value.strip().rstrip("/")
        parsed = urlparse(text)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Enter a full NodeSparkHub URL, for example http://192.168.1.100:8787")
        return text

    @staticmethod
    def _selected_model_name(values: dict[str, Any]) -> str:
        for key in ("selectedModel", "defaultModel", "aiModel", "model", "modelName"):
            value = values.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
            if isinstance(value, dict):
                name = value.get("name") or value.get("id") or value.get("model")
                if isinstance(name, str) and name.strip():
                    return name.strip()
        return ""

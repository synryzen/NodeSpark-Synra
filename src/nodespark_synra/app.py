from __future__ import annotations

import threading
import time
from typing import Any
from urllib.parse import urlencode, urlparse

from .assistant_router import classify_assistant_request, extract_preferred_name
from .config import AppConfig, StateStore
from .hub import HubClient
from .local_ai import LocalAIService
from .state import SynraStateMachine
from .tts import TTSService


def local_assistant_reply(text: str, hub_configured: bool) -> tuple[str, str, str]:
    request = text.strip()
    lowered = request.lower()
    if any(word == lowered for word in ("hi", "hello", "hey", "yo")):
        return (
            "wave",
            "Synra",
            "Hi. I’m here, awake, and ready to help with NodeSparkHub or anything else you want to think through."
        )
    if any(word in lowered for word in ("thanks", "thank you", "appreciate")):
        return (
            "delighted",
            "Synra",
            "You’re welcome. I’m glad I could help, and I’m ready for the next move."
        )
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
            assistant_timeout=max(5.0, float(cfg.hub.assistant_timeout_seconds)),
        )
        self.local_ai = LocalAIService(cfg.local_ai)
        self.tts = TTSService(cfg.tts)
        self.running = False
        self._thread: threading.Thread | None = None
        self._hub_offline_until = 0.0
        self._hub_last_error = ""
        self._hub_health: dict[str, Any] = {}
        self._assistant_model = ""
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
        selected_model = self._assistant_model or self._selected_model_name(self._hub_health)
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
            "localAI": self.local_ai.status(),
            "setup": self.setup_status(),
            "memory": self.public_memory(),
            "uiSettings": self.store.ui_settings,
            "privacy": self.privacy_snapshot(),
            "pairing": self.pairing_snapshot(),
            "operations": self.operations_snapshot(),
            "activity": self.public_activity(),
            "stagedWorkflows": self.public_staged_workflows(),
        }

    def public_memory(self) -> dict[str, Any]:
        memory = self.store.memory
        recent_turns = memory.get("recentTurns", [])
        return {
            "preferredName": str(memory.get("preferredName", "")),
            "profileNote": str(memory.get("profileNote", "")),
            "lastAssistantRoute": str(memory.get("lastAssistantRoute", "")),
            "lastReplySource": str(memory.get("lastReplySource", "")),
            "assistantTurns": int(memory.get("assistantTurns", 0) or 0),
            "recentTurns": recent_turns if isinstance(recent_turns, list) else [],
        }

    def public_activity(self) -> list[dict[str, Any]]:
        return [
            item for item in self.store.activity[:12]
            if isinstance(item, dict)
        ]

    def public_staged_workflows(self) -> list[dict[str, Any]]:
        return [
            item for item in self.store.staged_workflows[:8]
            if isinstance(item, dict)
        ]

    def record_activity(self, label: str, body: str, style: str = "info", kind: str = "event", detail: str = "") -> None:
        self.store.append_activity({
            "at": int(time.time()),
            "kind": kind[:40],
            "label": label[:80],
            "body": " ".join(body.split())[:220],
            "detail": " ".join(detail.split())[:220],
            "style": style[:32],
        })

    def privacy_snapshot(self) -> dict[str, Any]:
        tts_status = self.tts.status()
        local_status = self.local_ai.status()
        provider = str(tts_status.get("provider") or "browser")
        return {
            "localFirst": bool(self.cfg.local_ai.enabled),
            "localAIProvider": str(local_status.get("provider") or self.cfg.local_ai.provider),
            "localAIAvailable": bool(local_status.get("available")),
            "visionLocal": bool(local_status.get("visionAvailable")),
            "voiceProvider": provider,
            "voiceLocal": provider in {"browser", "kokoro", "voicebox"},
            "hubRequiredForWorkflows": True,
            "memoryStoredLocally": True,
        }

    def pairing_snapshot(self) -> dict[str, Any]:
        params = {
            "deviceId": self.store.device_id,
            "name": self.cfg.device.name,
            "hub": self.cfg.hub.base_url,
            "platform": "NodeSpark Synra",
        }
        if not self.hub.configured():
            status = "hub_url_needed"
            next_action = "Save the NodeSparkHub URL for this monitor."
        elif not self.store.token:
            status = "pair_code_needed"
            next_action = "Create a pair code in NodeSparkHub, then enter it here."
        elif not self.hub_can_try():
            status = "hub_check_needed"
            next_action = self.hub_offline_detail() or "Check the Hub connection."
        else:
            status = "linked"
            next_action = "Synra is paired and ready for Hub AI and workflows."
        return {
            "deviceId": self.store.device_id,
            "deviceName": self.cfg.device.name,
            "hubUrl": self.cfg.hub.base_url,
            "paired": bool(self.store.token),
            "canPair": self.hub.configured() and not bool(self.store.token),
            "status": status,
            "nextAction": next_action,
            "pairingUri": f"nodesparkhub-device://pair?{urlencode(params)}",
        }

    def operations_snapshot(self) -> dict[str, Any]:
        state = self.state.snapshot()
        card = state.get("card") if isinstance(state.get("card"), dict) else {}
        memory = self.store.memory
        hub_state = "linked" if self.hub_ready_for_actions() else self.pairing_snapshot()["status"]
        return {
            "currentMode": str(state.get("mode") or "idle"),
            "currentExpression": str(state.get("expression") or "soft_smile"),
            "currentMessage": str(state.get("message") or ""),
            "currentDetail": str(card.get("detail") or state.get("subtitle") or ""),
            "hubState": hub_state,
            "activeWorkflow": str(card.get("body") or self.cfg.hub.default_workflow) if state.get("mode") == "workflow_running" else "",
            "lastRoute": str(memory.get("lastAssistantRoute", "")),
            "lastReplySource": str(memory.get("lastReplySource", "")),
            "assistantTurns": int(memory.get("assistantTurns", 0) or 0),
            "activityCount": len(self.store.activity),
            "stagedWorkflowCount": len(self.store.staged_workflows),
        }

    def stage_workflow(self, workflow: str, payload: dict[str, Any] | None = None, reason: str = "") -> dict[str, Any]:
        item = {
            "id": f"stage-{int(time.time() * 1000)}",
            "workflowName": workflow,
            "payload": payload or {},
            "reason": reason or self.hub_offline_detail() or "Waiting for NodeSparkHub.",
            "status": "staged",
            "createdAt": int(time.time()),
        }
        self.store.append_staged_workflow(item)
        return item

    def run_staged_workflow(self, workflow_id: str = "") -> dict[str, Any]:
        staged = self.public_staged_workflows()
        item = next((entry for entry in staged if str(entry.get("id")) == workflow_id), None) if workflow_id else (staged[0] if staged else None)
        if not item:
            raise ValueError("No staged workflow is waiting.")
        if not self.hub_ready_for_actions():
            raise RuntimeError(self.hub_offline_detail() or "NodeSparkHub is not ready yet.")
        workflow = str(item.get("workflowName") or self.cfg.hub.default_workflow)
        payload = item.get("payload") if isinstance(item.get("payload"), dict) else {}
        result = self.handle_command({
            "id": f"staged-{item.get('id')}",
            "type": "runWorkflow",
            "workflowName": workflow,
            "payload": payload,
            "text": f"Running staged workflow {workflow}.",
        }, ack=False)
        self.store.remove_staged_workflow(str(item.get("id")))
        self.record_activity("Staged workflow sent", workflow, "workflow", "workflow", "Sent to NodeSparkHub.")
        return {"result": result, "stagedWorkflows": self.public_staged_workflows(), "health": self.health_snapshot()}

    def clear_staged_workflows(self) -> dict[str, Any]:
        count = len(self.store.staged_workflows)
        self.store.clear_staged_workflows()
        self.record_activity("Queue cleared", f"Cleared {count} staged workflow request{'s' if count != 1 else ''}.", "success", "workflow")
        self.state.apply_command({
            "type": "speak",
            "title": "Queue Cleared",
            "text": f"Cleared {count} staged workflow request{'s' if count != 1 else ''}.",
            "subtitle": "Workflow queue",
            "expression": "soft_smile",
            "detail": "Staged workflow queue",
            "style": "success",
        })
        return {"stagedWorkflows": self.public_staged_workflows(), "health": self.health_snapshot(), "state": self.state.snapshot()}

    def hub_diagnostics(self) -> dict[str, Any]:
        snapshot = self.health_snapshot()
        result: dict[str, Any] = {
            "configured": self.hub.configured(),
            "paired": bool(self.store.token),
            "url": self.cfg.hub.base_url,
            "reachable": False,
            "detail": self.hub_offline_detail(),
            "health": {},
            "snapshot": snapshot,
        }
        if not self.hub.configured():
            result["detail"] = "NodeSparkHub URL is not configured."
            return result
        try:
            health = self.hub.health()
            self._hub_health = health
            self.mark_hub_ok()
            result.update({
                "reachable": True,
                "detail": "NodeSparkHub health endpoint answered.",
                "health": health,
                "snapshot": self.health_snapshot(),
            })
        except Exception as exc:
            self.mark_hub_error(exc)
            result.update({
                "reachable": False,
                "detail": str(exc),
                "snapshot": self.health_snapshot(),
            })
        return result

    def setup_status(self) -> dict[str, Any]:
        local_status = self.local_ai.status()
        tts_status = self.tts.status()
        steps = [
            {
                "id": "hub_url",
                "label": "Hub URL",
                "done": self.hub.configured(),
                "detail": self.cfg.hub.base_url or "Not set",
            },
            {
                "id": "pairing",
                "label": "Pairing",
                "done": bool(self.store.token),
                "detail": "Linked" if self.store.token else "Waiting for pair code",
            },
            {
                "id": "local_ai",
                "label": "Local AI",
                "done": bool(local_status.get("available")),
                "detail": str(local_status.get("model") or local_status.get("detail") or "Ollama"),
            },
            {
                "id": "vision",
                "label": "Vision",
                "done": bool(local_status.get("visionAvailable")),
                "detail": str(local_status.get("visionModel") or "vision model"),
            },
            {
                "id": "voice",
                "label": "Voice",
                "done": bool(tts_status.get("available")) or tts_status.get("provider") == "browser",
                "detail": str(tts_status.get("provider") or "browser"),
            },
            {
                "id": "workflows",
                "label": "Workflows",
                "done": bool(self._workflow_cache or self.cfg.hub.favorite_workflows),
                "detail": self.cfg.hub.default_workflow,
            },
        ]
        complete = sum(1 for step in steps if step["done"])
        return {
            "complete": complete,
            "total": len(steps),
            "ready": complete == len(steps),
            "steps": steps,
        }

    def connect_hub(self, base_url: str) -> dict[str, Any]:
        normalized = self._normalize_base_url(base_url)
        changed_hub = bool(self.cfg.hub.base_url) and normalized != self.cfg.hub.base_url.rstrip("/")
        self.cfg.hub.base_url = normalized
        self.store.set_hub_base_url(normalized)
        self.hub.set_base_url(normalized)
        if changed_hub and self.store.token:
            self.store.clear_pairing()
            self.hub.token = ""
        self.mark_hub_ok()
        try:
            self._hub_health = self.hub.health()
            self.mark_hub_ok()
            message = "NodeSparkHub is reachable. Enter a pairing code when you are ready."
            if changed_hub:
                message = "I updated the NodeSparkHub URL. Please pair this monitor with the new Hub."
            expression = "bright"
            style = "success"
        except Exception as exc:
            self.mark_hub_error(exc)
            message = "I saved the Hub URL, but I cannot reach NodeSparkHub yet."
            if changed_hub:
                message = "I changed the Hub URL, but I cannot reach the new NodeSparkHub yet."
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
        self.record_activity("Hub URL", message, style, "hub", normalized)
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
            queued = len(self.store.staged_workflows)
            queue_message = f" I also found {queued} staged workflow request{'s' if queued != 1 else ''} ready to run." if queued else ""
            self.state.set_state({
                "mode": "success",
                "expression": "bright",
                "message": f"NodeSparkHub is linked. I can use the Hub AI and workflows now.{queue_message}",
                "subtitle": "Paired",
                "card": {
                    "title": "NodeSparkHub Linked",
                    "body": "Synra is connected.",
                    "detail": "Use Run next for staged workflows." if queued else "Assistant requests use the Hub default AI model.",
                    "style": "success",
                    "progress": 1,
                },
            })
            self.record_activity("Hub paired", "Synra linked to NodeSparkHub.", "success", "pairing", self.cfg.hub.base_url)
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

    def update_settings(self, values: dict[str, Any]) -> dict[str, Any]:
        return self.store.update_ui_settings(values)

    def update_memory_settings(self, values: dict[str, Any]) -> dict[str, Any]:
        if values.get("clear") is True:
            memory = self.store.clear_memory()
            self.record_activity("Memory cleared", "Synra local memory was cleared.", "success", "memory")
            return memory
        updates: dict[str, Any] = {}
        if "preferredName" in values:
            name = str(values.get("preferredName") or "").strip()[:80]
            updates["preferredName"] = name or None
        if "profileNote" in values:
            note = str(values.get("profileNote") or "").strip()[:240]
            updates["profileNote"] = note or None
        memory = self.store.update_memory(updates)
        if updates:
            self.record_activity("Memory saved", "Synra updated local personality memory.", "success", "memory")
        return memory

    def handle_command(self, command: dict[str, Any], ack: bool = False) -> dict[str, Any]:
        command_id = str(command.get("id") or command.get("commandId") or "")
        kind = str(command.get("type", "showCard")).strip().lower()

        if kind in {"assistant", "ask", "askai"}:
            text = str(command.get("text") or command.get("body") or "Help me from NodeSpark Synra.")
            image = str(command.get("image") or command.get("imageBase64") or "")
            route = classify_assistant_request(text, self.cfg.hub.default_workflow)
            self.store.update_memory({"lastAssistantRoute": route.route if not route.tool else f"{route.route}:{route.tool}"})
            self.record_activity("User request", text, "thinking", "assistant", route.detail)
            if image or route.route == "vision":
                result = self._handle_vision_request(text, image, command_id)
                if ack and command_id and self.hub_can_try():
                    try:
                        self.hub.ack_command(command_id, "completed", result)
                        self.mark_hub_ok()
                    except Exception as exc:
                        self.mark_hub_error(exc)
                        print(f"[hub] command ack failed: {exc}")
                return {"ok": True, "result": result, "state": self.state.snapshot()}
            tool_result = self._try_tool_route(text, route, command_id)
            if tool_result is not None:
                result = tool_result
                if ack and command_id and self.hub_can_try():
                    try:
                        self.hub.ack_command(command_id, "completed", result)
                        self.mark_hub_ok()
                    except Exception as exc:
                        self.mark_hub_error(exc)
                        print(f"[hub] command ack failed: {exc}")
                return {"ok": True, "result": result, "state": self.state.snapshot()}

            local_candidate = route.route == "local" and self.local_ai.should_answer_locally(text)
            self.state.set_state({
                "mode": "thinking",
                "expression": route.expression or "focused",
                "message": f"Thinking about: {text}",
                "subtitle": "Synra Local AI" if local_candidate else "Synra Assistant",
                "card": {
                    "title": "Voice Request",
                    "body": text,
                    "detail": route.detail or ("Thinking locally" if local_candidate else "Sending to NodeSparkHub"),
                    "style": "thinking",
                },
            })
            local_answered = False
            if local_candidate:
                try:
                    local = self.local_ai.answer(text, self._local_context())
                    reply = _synra_identity_reply(local.text)
                    self.state.apply_command({
                        "type": "speak",
                        "title": "Synra",
                        "text": reply,
                        "subtitle": "Local AI",
                        "expression": _expression_for_reply(reply, "bright"),
                        "mode": "speaking",
                        "style": "voice",
                        "detail": f"Model: {local.model}",
                        "id": command_id,
                    })
                    result = reply[:240]
                    self._remember_turn(text, reply, "local")
                    local_answered = True
                except Exception as exc:
                    print(f"[local-ai] local answer failed: {exc}")

            if local_answered:
                pass
            elif not self.hub.configured() or not self.hub_ready_for_actions():
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
                self._remember_turn(text, reply, "fallback")
            else:
                try:
                    response = self.hub.ask_assistant(text, self._hub_context(route.route, route.tool))
                    self.mark_hub_ok()
                    reply = str(response.get("displayText") or response.get("reply") or response.get("message") or "No assistant reply.")
                    reply = _synra_identity_reply(reply)
                    model = self._selected_model_name(response) or self._selected_model_name(self._hub_health) or "Hub default AI model"
                    self._assistant_model = model
                    reply_failed = _assistant_reply_failed(reply)
                    self.state.apply_command({
                        "type": "speak",
                        "title": "Synra",
                        "text": reply,
                        "subtitle": "NodeSparkHub AI",
                        "expression": "concerned" if reply_failed else _expression_for_reply(reply, "bright"),
                        "mode": "warning" if reply_failed else "speaking",
                        "style": "warning" if reply_failed else "voice",
                        "detail": f"Model: {model}",
                        "id": command_id,
                    })
                    result = reply[:240]
                    self._remember_turn(text, reply, "hub")
                except Exception as exc:
                    self.mark_hub_error(exc)
                    expression, subtitle, reply = self._fallback_assistant_reply(text, True)
                    reply = f"{reply} I could not reach NodeSparkHub yet, so I’m staying useful in local mode."
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
                    self._remember_turn(text, reply, "fallback")
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
                staged = self.stage_workflow(workflow, payload, self.hub_offline_detail())
                self.record_activity("Workflow staged", workflow, "warning", "workflow", self.hub_offline_detail())
                self.state.apply_command({
                    "type": "speak",
                    "title": "Workflow Staged",
                    "text": result,
                    "subtitle": workflow,
                    "expression": "raised_brow",
                    "detail": f"Queued as {staged.get('id')}",
                    "style": "warning" if self.hub.configured() else "voice",
                    "id": command_id,
                })
            else:
                try:
                    response = self.hub.run_workflow_async(workflow, payload)
                    self.mark_hub_ok()
                    result = f"runId={response.get('runId', '')}"
                    run_id = str(response.get("runId", "")).strip()
                    reply = f"I started {workflow}."
                    if run_id:
                        reply = f"I started {workflow}. Run ID {run_id}."
                    self.record_activity("Workflow running", workflow, "workflow", "workflow", run_id or "NodeSparkHub accepted the run request")
                    self.state.apply_command({
                        "type": "speak",
                        "title": "Workflow Running",
                        "text": reply,
                        "subtitle": workflow,
                        "expression": "determined",
                        "detail": "NodeSparkHub accepted the run request",
                        "style": "workflow",
                        "id": command_id,
                    })
                except Exception as exc:
                    self.mark_hub_error(exc)
                    result = f"I staged {workflow}, but NodeSparkHub did not accept the run yet. I'll keep the request visible while the Hub comes back online."
                    staged = self.stage_workflow(workflow, payload, str(exc))
                    self.record_activity("Workflow staged", workflow, "warning", "workflow", str(exc))
                    self.state.apply_command({
                        "type": "speak",
                        "title": "Workflow Staged",
                        "text": result,
                        "subtitle": workflow,
                        "expression": "concerned",
                        "detail": f"Queued as {staged.get('id')}",
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

    def _try_tool_route(self, text: str, route, command_id: str) -> str | None:
        if route.tool == "greeting":
            expression, subtitle, reply = local_assistant_reply(text, self.hub.configured())
            self._speak_tool_reply(command_id, reply, subtitle, expression, "Synra greeting", "voice")
            self._remember_turn(text, reply, "local")
            return reply
        if route.route != "tool":
            return None
        if route.tool == "remember_user":
            name = extract_preferred_name(text)
            if not name:
                return None
            self.store.update_memory({"preferredName": name})
            reply = f"Nice to meet you, {name}. I’ll remember that."
            self.record_activity("Memory saved", f"Preferred name: {name}", "success", "memory")
            self._speak_tool_reply(command_id, reply, "Memory", "bright", "Saved locally", "success")
            return reply
        if route.tool == "setup_status":
            setup = self.setup_status()
            missing = [step["label"] for step in setup["steps"] if not step["done"]]
            if missing:
                reply = f"Setup is {setup['complete']} of {setup['total']} ready. Next I’d fix {', '.join(missing[:2])}."
            else:
                reply = "Setup is complete. Local AI, voice, Hub pairing, vision, and workflows are ready."
            self._speak_tool_reply(command_id, reply, "Setup", "attentive", "Synra readiness", "info")
            return reply
        if route.tool == "status":
            setup = self.setup_status()
            local = "ready" if self.local_ai.status().get("available") else "standby"
            if self.hub_ready_for_actions():
                hub = "linked"
            elif not self.hub.configured():
                hub = "waiting for a Hub URL"
            elif not self.store.token:
                hub = "waiting for pairing"
            else:
                hub = "temporarily offline"
            reply = f"Synra status: local AI is {local}, NodeSparkHub is {hub}, setup is {setup['complete']} of {setup['total']}."
            self.record_activity("Status", reply, "info", "status")
            self._speak_tool_reply(command_id, reply, "Status", "attentive", "Local monitor status", "info")
            return reply
        if route.tool == "list_workflows":
            workflows = self.list_workflows()
            visible = ", ".join(workflows[:5]) if workflows else "no workflows yet"
            more = f" plus {len(workflows) - 5} more" if len(workflows) > 5 else ""
            reply = f"I found {visible}{more}."
            self.record_activity("Workflows listed", visible, "workflow", "workflow")
            self._speak_tool_reply(command_id, reply, "Workflows", "focused", "NodeSparkHub workflow list", "workflow")
            return reply
        if route.tool == "run_workflow":
            workflow = route.workflow_name or self.cfg.hub.default_workflow
            result = self.handle_command({
                "id": command_id,
                "type": "runWorkflow",
                "workflowName": workflow,
                "text": f"Running {workflow}.",
            }, ack=False)
            state = result.get("state", {})
            if state.get("mode") == "workflow_running":
                reply = f"I started {workflow}."
                self.state.apply_command({
                    "type": "speak",
                    "title": "Workflow Running",
                    "text": reply,
                    "subtitle": workflow,
                    "expression": "determined",
                    "detail": "NodeSparkHub accepted the run request",
                    "style": "workflow",
                    "id": command_id,
                })
                return reply
            return str(result.get("result", "Workflow request staged."))
        return None

    def _handle_vision_request(self, text: str, image: str, command_id: str) -> str:
        if not image:
            reply = "I can use camera vision, but I need the kiosk camera active first. Tap Cam, then ask me what I see."
            self._speak_tool_reply(command_id, reply, "Camera vision", "raised_brow", "No camera frame received", "warning")
            return reply
        self.state.set_state({
            "mode": "thinking",
            "expression": "look_left",
            "message": "Looking through the camera.",
            "subtitle": "Vision",
            "card": {
                "title": "Camera Vision",
                "body": text or "What do you see?",
                "detail": "Analyzing the latest frame locally",
                "style": "thinking",
            },
        })
        try:
            local = self.local_ai.answer_vision(text or "What do you see?", image, self._local_context())
            reply = _synra_identity_reply(local.text)
            self.record_activity("Vision", reply, "voice", "vision", f"Model: {local.model}")
            self.state.apply_command({
                "type": "speak",
                "title": "Synra Vision",
                "text": reply,
                "subtitle": "Camera Vision",
                "expression": "explain",
                "mode": "speaking",
                "style": "voice",
                "detail": f"Model: {local.model}",
                "id": command_id,
            })
            return reply[:240]
        except Exception as exc:
            reply = "I tried to look, but my vision model is not ready yet. Install or pull the local vision model and I can use the camera."
            self.record_activity("Vision unavailable", str(exc), "warning", "vision")
            self.state.apply_command({
                "type": "speak",
                "title": "Vision Unavailable",
                "text": reply,
                "subtitle": "Camera Vision",
                "expression": "concerned",
                "detail": str(exc),
                "style": "warning",
                "id": command_id,
            })
            return reply

    def _speak_tool_reply(self, command_id: str, reply: str, subtitle: str, expression: str, detail: str, style: str) -> None:
        self.state.apply_command({
            "type": "speak",
            "title": "Synra",
            "text": reply,
            "subtitle": subtitle,
            "expression": expression,
            "detail": detail,
            "style": style,
            "id": command_id,
        })

    def _local_context(self) -> str:
        memory = self.store.memory
        name = str(memory.get("preferredName") or "").strip()
        parts = []
        if name:
            parts.append(f"The user's preferred name is {name}.")
        profile_note = str(memory.get("profileNote") or "").strip()
        if profile_note:
            parts.append(f"User profile note: {profile_note}.")
        recent = memory.get("recentTurns", [])
        if isinstance(recent, list) and recent:
            compact = []
            for item in recent[-3:]:
                if not isinstance(item, dict):
                    continue
                user = str(item.get("user") or "").strip()
                assistant = str(item.get("assistant") or "").strip()
                if user and assistant:
                    compact.append(f"User: {user} / Synra: {assistant}")
            if compact:
                parts.append("Recent conversation: " + " | ".join(compact))
        last_request = str(memory.get("lastUserRequest") or "").strip()
        last_reply = str(memory.get("lastAssistantReply") or "").strip()
        if last_request and last_reply:
            parts.append(f"Previous turn: user asked '{last_request}', and Synra replied '{last_reply}'.")
        return " ".join(parts)

    def _hub_context(self, route: str, tool: str) -> dict[str, Any]:
        return {
            "route": route,
            "tool": tool,
            "memory": self.public_memory(),
            "localContext": self._local_context(),
            "setup": self.setup_status(),
            "favoriteWorkflows": list(self._workflow_cache or self.cfg.hub.favorite_workflows),
            "defaultWorkflow": self.cfg.hub.default_workflow,
        }

    def _remember_turn(self, user_text: str, assistant_reply: str, source: str) -> None:
        memory = self.store.memory
        turns = int(memory.get("assistantTurns", 0) or 0) + 1
        recent_turns = memory.get("recentTurns", [])
        if not isinstance(recent_turns, list):
            recent_turns = []
        recent_turns = [
            item for item in recent_turns[-5:]
            if isinstance(item, dict) and (item.get("user") or item.get("assistant"))
        ]
        recent_turns.append({
            "user": user_text.strip()[:180],
            "assistant": assistant_reply.strip()[:220],
            "source": source,
            "at": int(time.time()),
        })
        self.store.update_memory({
            "lastUserRequest": user_text.strip()[:240],
            "lastAssistantReply": assistant_reply.strip()[:240],
            "lastReplySource": source,
            "assistantTurns": turns,
            "recentTurns": recent_turns[-6:],
        })
        label = {
            "hub": "Hub reply",
            "local": "Local reply",
            "fallback": "Fallback reply",
        }.get(source, "Synra reply")
        style = "voice" if source in {"hub", "local"} else "warning"
        self.record_activity(label, assistant_reply, style, "assistant", user_text)

    def _fallback_assistant_reply(self, text: str, hub_configured: bool) -> tuple[str, str, str]:
        try:
            if self.local_ai.available():
                local = self.local_ai.answer(text, self._local_context())
                reply = _synra_identity_reply(local.text)
                return _expression_for_reply(reply, "bright"), "Local AI", reply
        except Exception as exc:
            print(f"[local-ai] fallback failed: {exc}")
        return local_assistant_reply(text, hub_configured)

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


def _synra_identity_reply(text: str) -> str:
    return (
        text.replace("NodeSpark Wisp", "Synra")
        .replace("NodeSparkWisp", "Synra")
        .replace(" Wisp ", " Synra ")
    )


def _expression_for_reply(text: str, fallback: str = "bright") -> str:
    lowered = text.lower()
    if any(token in lowered for token in ("haha", "fun", "joke", "playful", "little grin")):
        return "playful"
    if any(token in lowered for token in ("awesome", "love", "amazing", "excited", "perfect", "beautiful")):
        return "delighted"
    if any(token in lowered for token in ("started", "running", "workflow", "automating", "accepted the run")):
        return "determined"
    if any(token in lowered for token in ("sorry", "blocked", "failed", "cannot", "can't", "error", "not ready")):
        return "concerned"
    if any(token in lowered for token in ("not sure", "unclear", "maybe", "which one", "do you mean")):
        return "confused"
    if any(token in lowered for token in ("i can see", "look", "camera", "vision")):
        return "curious"
    if any(token in lowered for token in ("done", "ready", "great", "nice", "perfect", "absolutely")):
        return "wink"
    if any(token in lowered for token in ("here's", "first", "next", "because", "walk through")):
        return "explain"
    return fallback


def _assistant_reply_failed(text: str) -> bool:
    lowered = text.lower()
    return any(token in lowered for token in ("model call failed", "invalid response", "server returned an invalid", "could not reach"))

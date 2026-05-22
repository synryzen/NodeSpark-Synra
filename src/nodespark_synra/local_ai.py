from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import LocalAIConfig


class LocalAIError(RuntimeError):
    pass


@dataclass(frozen=True)
class LocalAIReply:
    text: str
    model: str
    provider: str


class LocalAIService:
    def __init__(self, cfg: LocalAIConfig):
        self.cfg = cfg

    def status(self) -> dict[str, Any]:
        if not self.cfg.enabled:
            return {"enabled": False, "available": False, "provider": self.cfg.provider, "model": self.cfg.model}
        if self.cfg.provider != "ollama":
            return {
                "enabled": True,
                "available": False,
                "provider": self.cfg.provider,
                "model": self.cfg.model,
                "detail": "Unsupported local AI provider.",
            }
        try:
            data = self._request("GET", "/api/tags")
            models = [str(item.get("name", "")) for item in data.get("models", []) if isinstance(item, dict)]
            return {
                "enabled": True,
                "available": self.cfg.model in models,
                "provider": "ollama",
                "model": self.cfg.model,
                "models": models,
                "detail": "Local model is ready." if self.cfg.model in models else "Ollama is running, but Synra's model is not pulled yet.",
            }
        except Exception as exc:
            return {
                "enabled": True,
                "available": False,
                "provider": "ollama",
                "model": self.cfg.model,
                "detail": str(exc),
            }

    def available(self) -> bool:
        return bool(self.status().get("available"))

    def should_answer_locally(self, text: str) -> bool:
        if not self.cfg.enabled:
            return False
        lowered = text.lower()
        if _is_hub_action(lowered):
            return False
        if _looks_like_workflow_request(lowered):
            return False
        if self.cfg.route_short_inputs_locally and len(text.strip()) <= 120:
            return True
        return self.cfg.route_general_locally

    def answer(self, text: str) -> LocalAIReply:
        if self.cfg.provider != "ollama":
            raise LocalAIError(f"Unsupported local AI provider: {self.cfg.provider}")
        prompt = " ".join(text.split())[: max(80, int(self.cfg.max_prompt_chars))]
        payload = {
            "model": self.cfg.model,
            "stream": False,
            "options": {
                "temperature": 0.55,
                "num_predict": 140,
                "top_p": 0.9,
            },
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are Synra, a warm anime AI assistant on a NodeSparkHub monitor. "
                        "Answer quick greetings, simple questions, personality chat, and basic planning directly. "
                        "Be concise, friendly, and never call yourself Wisp. "
                        "If the user asks to run, change, save, inspect, or operate NodeSparkHub workflows/devices, "
                        "tell them you will hand that action to NodeSparkHub."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        }
        response = self._request("POST", "/api/chat", payload)
        message = response.get("message") if isinstance(response.get("message"), dict) else {}
        reply = str(message.get("content") or response.get("response") or "").strip()
        if not reply:
            raise LocalAIError("Local model returned an empty reply.")
        return LocalAIReply(reply, self.cfg.model, self.cfg.provider)

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(
            f"{self.cfg.base_url.rstrip('/')}{path}",
            data=body,
            method=method,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "nodespark-synra-local-ai",
            },
        )
        try:
            with urlopen(request, timeout=max(1.0, float(self.cfg.timeout_seconds))) as response:
                text = response.read().decode("utf-8", errors="replace").strip()
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise LocalAIError(f"Ollama HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise LocalAIError(f"Could not reach Ollama at {self.cfg.base_url}: {exc}") from exc
        except TimeoutError as exc:
            raise LocalAIError("Local AI timed out.") from exc
        if not text:
            return {}
        try:
            data = json.loads(text)
        except ValueError as exc:
            raise LocalAIError(f"Ollama returned non-JSON: {text[:500]}") from exc
        if isinstance(data, dict):
            return data
        return {"value": data}


def _is_hub_action(lowered: str) -> bool:
    action_words = (
        "run",
        "start",
        "launch",
        "execute",
        "stop",
        "pause",
        "resume",
        "create",
        "save",
        "delete",
        "send",
        "post",
        "check",
        "connect",
        "configure",
        "pair",
    )
    hub_words = ("workflow", "hub", "device", "integration", "slack", "email", "summary", "automation")
    return any(word in lowered for word in action_words) and any(word in lowered for word in hub_words)


def _looks_like_workflow_request(lowered: str) -> bool:
    return any(word in lowered for word in ("workflow", "automation", "integration", "trigger", "nodesparkhub", "device"))

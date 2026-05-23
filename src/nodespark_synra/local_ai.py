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
            has_text_model = _model_is_installed(self.cfg.model, models)
            has_vision_model = _model_is_installed(self.cfg.vision_model, models)
            return {
                "enabled": True,
                "available": has_text_model,
                "provider": "ollama",
                "model": self.cfg.model,
                "visionModel": self.cfg.vision_model,
                "visionAvailable": has_vision_model,
                "models": models,
                "detail": "Local model is ready." if has_text_model else "Ollama is running, but Synra's model is not pulled yet.",
            }
        except Exception as exc:
            return {
                "enabled": True,
                "available": False,
                "provider": "ollama",
                "model": self.cfg.model,
                "visionModel": self.cfg.vision_model,
                "visionAvailable": False,
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

    def answer(self, text: str, context: str = "") -> LocalAIReply:
        if self.cfg.provider != "ollama":
            raise LocalAIError(f"Unsupported local AI provider: {self.cfg.provider}")
        prompt = " ".join(text.split())[: max(80, int(self.cfg.max_prompt_chars))]
        if _is_identity_feelings_prompt(prompt):
            return LocalAIReply(
                "I'm Synra, your expressive AI assistant. I react with mood, remember useful context, use camera vision when enabled, and help you get things done with a little personality.",
                self.cfg.model,
                self.cfg.provider,
            )
        payload = {
            "model": self.cfg.model,
            "stream": False,
            "options": {
                "temperature": 0.55,
                "num_predict": 96,
                "top_p": 0.9,
            },
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are Synra, a warm anime AI assistant on a NodeSparkHub monitor. "
                        "Answer quick greetings, simple questions, personality chat, and basic planning directly. "
                        "Be concise, friendly, and keep replies to two short sentences unless the user asks for depth. "
                        "Never call yourself Wisp. "
                        "Avoid sterile AI disclaimers unless the user asks directly. "
                        "Express a warm assistant mood and emotional reactions while staying honest. "
                        f"{context} "
                        "If the user asks to run, change, save, inspect, or operate NodeSparkHub workflows/devices, "
                        "tell them you will hand that action to NodeSparkHub."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        }
        response = self._request("POST", "/api/chat", payload)
        message = response.get("message") if isinstance(response.get("message"), dict) else {}
        reply = _limit_reply(str(message.get("content") or response.get("response") or "").strip())
        if not reply:
            raise LocalAIError("Local model returned an empty reply.")
        return LocalAIReply(reply, self.cfg.model, self.cfg.provider)

    def answer_vision(self, text: str, image_base64: str, context: str = "") -> LocalAIReply:
        if self.cfg.provider != "ollama":
            raise LocalAIError(f"Unsupported local AI provider: {self.cfg.provider}")
        prompt = " ".join((text or "What do you see?").split())[: max(80, int(self.cfg.max_prompt_chars))]
        image = _clean_image_base64(image_base64)
        if not image:
            raise LocalAIError("No camera image was provided.")
        payload = {
            "model": self.cfg.vision_model,
            "stream": False,
            "options": {
                "temperature": 0.35,
                "num_predict": 120,
                "top_p": 0.9,
            },
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are Synra, a warm anime AI assistant with camera vision on a NodeSparkHub monitor. "
                        "Describe only visible, non-sensitive details and answer the user's visual question naturally. "
                        "Be concise, emotionally present, and practical. "
                        "If the image is unclear, say what you can infer and what you need the user to adjust. "
                        f"{context}"
                    ),
                },
                {"role": "user", "content": prompt, "images": [image]},
            ],
        }
        response = self._request("POST", "/api/chat", payload, timeout=max(1.0, float(self.cfg.vision_timeout_seconds)))
        message = response.get("message") if isinstance(response.get("message"), dict) else {}
        reply = _limit_reply(str(message.get("content") or response.get("response") or "").strip(), max_chars=480)
        if not reply:
            raise LocalAIError("Vision model returned an empty reply.")
        return LocalAIReply(reply, self.cfg.vision_model, self.cfg.provider)

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None, timeout: float | None = None) -> dict[str, Any]:
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
            with urlopen(request, timeout=timeout or max(1.0, float(self.cfg.timeout_seconds))) as response:
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


def _limit_reply(text: str, max_chars: int = 380) -> str:
    clean = " ".join(text.split())
    if len(clean) <= max_chars:
        return clean
    sentences = []
    for sentence in clean.replace("? ", "?|").replace("! ", "!|").replace(". ", ".|").split("|"):
        sentence = sentence.strip()
        if not sentence:
            continue
        if sum(len(item) + 1 for item in sentences) + len(sentence) > max_chars:
            break
        sentences.append(sentence)
        if len(sentences) >= 2:
            break
    if sentences:
        return " ".join(sentences)
    return clean[: max_chars - 1].rstrip() + "..."


def _clean_image_base64(value: str) -> str:
    text = value.strip()
    if "," in text and text.lower().startswith("data:image/"):
        text = text.split(",", 1)[1]
    return text


def _model_is_installed(model: str, installed: list[str]) -> bool:
    wanted = model.strip()
    if not wanted:
        return False
    if wanted in installed:
        return True
    if ":" not in wanted and f"{wanted}:latest" in installed:
        return True
    return False


def _is_identity_feelings_prompt(prompt: str) -> bool:
    lowered = prompt.lower()
    identity_terms = ("chatbot", "bot", "robot", "ai", "assistant")
    feeling_terms = ("feeling", "feelings", "emotion", "emotions", "conscious", "real")
    return any(term in lowered for term in identity_terms) and any(term in lowered for term in feeling_terms)

from __future__ import annotations

from dataclasses import asdict, dataclass, field
import time
from typing import Any


VALID_MODES = {
    "idle",
    "listening",
    "thinking",
    "speaking",
    "workflow_running",
    "success",
    "warning",
    "error",
    "approval_needed",
    "sleep",
}


def infer_expression(text: str, default: str = "bright") -> str:
    value = text.lower()
    if any(token in value for token in ("failed", "error", "blocked", "denied", "can't", "cannot", "sorry")):
        return "concerned"
    if any(token in value for token in ("not sure", "unclear", "clarify", "question", "which one", "what do you mean")):
        return "confused"
    if any(token in value for token in ("approve", "confirm", "permission", "should i")):
        return "raised_brow"
    if any(token in value for token in ("done", "complete", "success", "finished", "ready")):
        return "bright"
    if "?" in text:
        return "curious"
    return default


def expression_mode(expression: str, fallback: str = "speaking") -> str:
    if expression in {"concerned", "sad"}:
        return "warning"
    if expression in {"confused", "curious", "raised_brow"}:
        return "approval_needed" if expression == "raised_brow" else "warning"
    return fallback


@dataclass
class SynraCard:
    title: str = "NodeSparkHub"
    body: str = "Synra is ready."
    detail: str = ""
    style: str = "info"
    progress: float | None = None


@dataclass
class SynraState:
    mode: str = "idle"
    expression: str = "soft_smile"
    message: str = "NodeSparkHub is waiting for a workflow."
    subtitle: str = "Synra online"
    card: SynraCard = field(default_factory=SynraCard)
    speech_text: str = ""
    speech_id: str = ""
    last_command: str = ""
    updated_at: float = field(default_factory=time.time)

    def update(self, values: dict[str, Any]) -> None:
        if "mode" in values:
            mode = str(values["mode"]).strip().lower()
            self.mode = mode if mode in VALID_MODES else "idle"
        if "expression" in values:
            self.expression = str(values["expression"]).strip() or self.expression
        if "message" in values:
            self.message = str(values["message"])
        if "subtitle" in values:
            self.subtitle = str(values["subtitle"])
        if "last_command" in values:
            self.last_command = str(values["last_command"])
        if "speech_text" in values:
            self.speech_text = str(values["speech_text"])
        if "speech_id" in values:
            self.speech_id = str(values["speech_id"])
        if (
            "mode" in values
            and self.mode != "speaking"
            and "speech_text" not in values
            and "speech_id" not in values
        ):
            self.speech_text = ""
            self.speech_id = ""
        if isinstance(values.get("card"), dict):
            card_values = {**asdict(self.card), **values["card"]}
            if "progress" not in values["card"]:
                card_values["progress"] = None
            self.card = SynraCard(**card_values)
        self.updated_at = time.time()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SynraStateMachine:
    def __init__(self):
        self.state = SynraState()

    def snapshot(self) -> dict[str, Any]:
        return self.state.to_dict()

    def set_state(self, values: dict[str, Any]) -> dict[str, Any]:
        self.state.update(values)
        return self.snapshot()

    def apply_command(self, command: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        kind = str(command.get("type", "showCard")).strip()
        normalized = kind.lower()
        command_id = str(command.get("id") or command.get("commandId") or "")
        text = str(command.get("text") or command.get("body") or command.get("message") or "")
        title = str(command.get("title") or "NodeSparkHub")

        if normalized in {"speak", "say", "speech", "tts"}:
            speech_id = command_id or f"speech-{time.time():.3f}"
            expression = str(command.get("expression") or infer_expression(text, "bright"))
            self.state.update({
                "mode": str(command.get("mode") or expression_mode(expression, "speaking")),
                "expression": expression,
                "message": text or "Synra is speaking.",
                "subtitle": str(command.get("subtitle") or "Voice reply"),
                "last_command": command_id or kind,
                "speech_text": text,
                "speech_id": speech_id,
                "card": {
                    "title": title if title != "NodeSparkHub" else "Synra",
                    "body": text,
                    "detail": str(command.get("detail") or "Speaking through NodeSparkHub"),
                    "style": str(command.get("style") or "voice"),
                },
            })
            return "spoken", self.snapshot()

        if normalized in {"setexpression", "expression", "face"}:
            self.state.update({
                "expression": str(command.get("expression") or text or "soft_smile"),
                "message": str(command.get("message") or self.state.message),
                "last_command": command_id or kind,
            })
            return "expression-updated", self.snapshot()

        if normalized in {"setstate", "state", "mode"}:
            self.state.update({
                "mode": str(command.get("mode") or command.get("state") or text or "idle"),
                "expression": str(command.get("expression") or self.state.expression),
                "message": str(command.get("message") or text or self.state.message),
                "subtitle": str(command.get("subtitle") or self.state.subtitle),
                "last_command": command_id or kind,
            })
            return "state-updated", self.snapshot()

        if normalized in {"approval", "approve", "decision"}:
            self.state.update({
                "mode": "approval_needed",
                "expression": str(command.get("expression") or "raised_brow"),
                "message": text or "This needs your approval.",
                "subtitle": str(command.get("subtitle") or "Approve or reject in NodeSparkHub"),
                "last_command": command_id or kind,
                "card": {
                    "title": title if title != "NodeSparkHub" else "Approval Needed",
                    "body": text or "Review this request.",
                    "detail": str(command.get("detail") or "Waiting for your call"),
                    "style": "approval",
                },
            })
            return "approval-shown", self.snapshot()

        if normalized in {"runworkflow", "run", "workflow"}:
            workflow = str(command.get("workflowName") or command.get("workflow") or "Synra Assistant")
            self.state.update({
                "mode": "workflow_running",
                "expression": str(command.get("expression") or "focused"),
                "message": text or f"Running {workflow}.",
                "subtitle": workflow,
                "last_command": command_id or kind,
                "card": {
                    "title": "Workflow Running",
                    "body": workflow,
                    "detail": "NodeSparkHub is doing the work",
                    "style": "workflow",
                    "progress": command.get("progress"),
                },
            })
            return "workflow-visualized", self.snapshot()

        if normalized in {"success", "done", "complete"}:
            self.state.update({
                "mode": "success",
                "expression": str(command.get("expression") or "wink"),
                "message": text or "Done. That workflow landed cleanly.",
                "subtitle": str(command.get("subtitle") or "Success"),
                "last_command": command_id or kind,
                "card": {
                    "title": title if title != "NodeSparkHub" else "Workflow Complete",
                    "body": text or "Done.",
                    "detail": str(command.get("detail") or "NodeSparkHub result"),
                    "style": "success",
                },
            })
            return "success-shown", self.snapshot()

        if normalized in {"error", "failed", "failure"}:
            self.state.update({
                "mode": "error",
                "expression": "concerned",
                "message": text or "Something needs attention.",
                "subtitle": str(command.get("subtitle") or "Error"),
                "last_command": command_id or kind,
                "card": {
                    "title": title if title != "NodeSparkHub" else "Workflow Issue",
                    "body": text or "Something needs attention.",
                    "detail": str(command.get("detail") or "Check NodeSparkHub logs"),
                    "style": "error",
                },
            })
            return "error-shown", self.snapshot()

        self.state.update({
            "mode": str(command.get("mode") or "thinking"),
            "expression": str(command.get("expression") or "attentive"),
            "message": text or str(command.get("body") or "NodeSparkHub sent Synra an update."),
            "subtitle": str(command.get("subtitle") or title),
            "last_command": command_id or kind,
            "card": {
                "title": title,
                "body": text or str(command.get("body") or ""),
                "detail": str(command.get("detail") or "Sent from NodeSparkHub"),
                "style": str(command.get("style") or "info"),
                "progress": command.get("progress"),
            },
        })
        return "card-shown", self.snapshot()

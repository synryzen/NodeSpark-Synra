from __future__ import annotations

from dataclasses import dataclass
import json as jsonlib
from typing import Any
from urllib.parse import quote
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from . import __version__


class HubError(RuntimeError):
    pass


@dataclass
class HubClient:
    base_url: str
    device_id: str
    device_name: str
    token: str = ""
    timeout: float = 20.0

    def __post_init__(self) -> None:
        self.base_url = self.base_url.rstrip("/")

    def configured(self) -> bool:
        return bool(self.base_url)

    def set_base_url(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def health(self) -> dict[str, Any]:
        return self._request("GET", "/health", auth=False)

    def pair(self, code: str) -> dict[str, Any]:
        payload = {
            "code": code.strip(),
            "deviceId": self.device_id,
            "deviceName": self.device_name,
            "platform": "NVIDIA Jetson Orin Nano / NodeSpark Synra",
            "osVersion": "Linux",
            "appVersion": f"nodespark-synra/{__version__}",
        }
        return self._request("POST", "/pair", json=payload, auth=False)

    def checkin(self) -> dict[str, Any]:
        payload = {
            "deviceId": self.device_id,
            "name": self.device_name,
            "platform": "NVIDIA Jetson Orin Nano / NodeSpark Synra",
            "osVersion": "Linux",
            "appVersion": f"nodespark-synra/{__version__}",
            "firmwareVersion": f"nodespark-synra/{__version__}",
            "lastStatus": "Synra monitor companion online",
            "capabilities": [
                "avatar",
                "expressions",
                "display",
                "speaker",
                "microphone",
                "camera",
                "assistant",
                "voice",
                "vision",
                "workflows",
                "deviceCommands",
                "pairing",
                "approval",
                "dashboard",
                "localLLM",
                "jetson",
            ],
        }
        return self._request("POST", "/devices/checkin", json=payload)

    def list_workflows(self) -> list[str]:
        response = self._request("GET", "/workflows")
        workflows = response.get("workflows", [])
        if not isinstance(workflows, list):
            raise HubError("Hub returned an unexpected workflows response.")
        return [str(item) for item in workflows]

    def run_workflow_async(self, workflow: str, payload: dict[str, Any]) -> dict[str, Any]:
        encoded = quote(workflow, safe="")
        return self._request("POST", f"/workflows/{encoded}/run?async=1", json=payload)

    def ask_assistant(self, text: str) -> dict[str, Any]:
        payload = {
            "deviceId": self.device_id,
            "deviceName": self.device_name,
            "text": text,
            "source": "synra-jetson",
            "platform": "NVIDIA Jetson Orin Nano / NodeSpark Synra",
            "sessionId": f"synra:{self.device_id}",
            "voice": True,
            "assistantMode": "general_and_workflow_operator",
            "useDefaultModel": True,
            "modelPreference": "nodesparkhub-default",
            "intent": _assistant_intent(text),
            "capabilities": [
                "generalQuestions",
                "workflowPlanning",
                "workflowSetup",
                "workflowRunRequests",
                "avatar",
                "expressions",
                "display",
                "speaker",
                "microphone",
                "camera",
                "workflow",
            ],
            "systemContext": {
                "identity": "Synra is the NodeSparkHub monitor AI assistant.",
                "routing": "Use the NodeSparkHub selected default AI model for general Q&A, workflow help, and workflow setup guidance.",
                "behavior": "Answer ordinary questions naturally. When the user asks to automate, build, configure, or run a workflow, help clarify inputs and route actions through NodeSparkHub.",
            },
        }
        return self._request("POST", "/wisp/assistant", json=payload)

    def poll_commands(self, limit: int = 10) -> list[dict[str, Any]]:
        response = self._request("GET", f"/devices/{quote(self.device_id, safe='')}/commands/poll?limit={limit}")
        commands = response.get("commands", [])
        if isinstance(commands, list):
            return [item for item in commands if isinstance(item, dict)]
        return []

    def ack_command(self, command_id: str, status: str = "completed", result: str = "") -> dict[str, Any]:
        payload = {"status": status, "result": result}
        return self._request("POST", f"/devices/{quote(self.device_id, safe='')}/commands/{quote(command_id, safe='')}/ack", json=payload)

    def _request(self, method: str, path: str, json: Any | None = None, auth: bool = True) -> dict[str, Any]:
        if not self.base_url:
            raise HubError("Hub base_url is not configured.")
        headers = {
            "Accept": "application/json",
            "User-Agent": f"nodespark-synra/{__version__}",
            "X-NodeSparkHub-Device-ID": self.device_id,
            "X-NodeSparkHub-Device-Name": self.device_name,
        }
        if json is not None:
            headers["Content-Type"] = "application/json"
        if auth and self.token:
            headers["Authorization"] = f"Bearer {self.token}"
            headers["X-NodeSparkHub-Token"] = self.token

        url = f"{self.base_url}{path}"
        body = None
        if json is not None:
            body = jsonlib.dumps(json).encode("utf-8")
        request = Request(url, data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=self.timeout) as resp:
                status = int(resp.status)
                text = resp.read().decode("utf-8", errors="replace").strip()
        except HTTPError as exc:
            text = exc.read().decode("utf-8", errors="replace").strip()
            raise HubError(f"NodeSparkHub HTTP {exc.code}: {text[:500]}") from exc
        except URLError as exc:
            raise HubError(f"Could not reach NodeSparkHub at {url}: {exc}") from exc

        if not (200 <= status < 300):
            raise HubError(f"NodeSparkHub HTTP {status}: {text[:500]}")
        if not text:
            return {}
        try:
            data = jsonlib.loads(text)
        except ValueError as exc:
            raise HubError(f"NodeSparkHub returned non-JSON: {text[:500]}") from exc
        if isinstance(data, dict):
            return data
        return {"value": data}


def _assistant_intent(text: str) -> str:
    lowered = text.lower()
    if any(token in lowered for token in ("run", "start", "launch", "execute")) and "workflow" in lowered:
        return "workflow_run"
    if any(token in lowered for token in ("workflow", "automate", "automation", "trigger", "integration", "setup", "configure")):
        return "workflow_help"
    return "general_question"

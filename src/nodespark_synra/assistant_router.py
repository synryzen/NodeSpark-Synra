from __future__ import annotations

from dataclasses import dataclass
import re


HUB_TERMS = {
    "automation",
    "device",
    "devices",
    "hub",
    "integration",
    "integrations",
    "nodespark",
    "nodesparkhub",
    "pair",
    "runtime",
    "trigger",
    "workflow",
    "workflows",
    "wisp",
}

ACTION_TERMS = {
    "build",
    "configure",
    "connect",
    "create",
    "delete",
    "execute",
    "launch",
    "make",
    "pause",
    "resume",
    "run",
    "save",
    "send",
    "set",
    "setup",
    "start",
    "stop",
}


@dataclass(frozen=True)
class AssistantRoute:
    route: str
    tool: str = ""
    expression: str = "bright"
    detail: str = ""
    workflow_name: str = ""
    confidence: float = 0.5


def classify_assistant_request(text: str, default_workflow: str = "Synra Assistant") -> AssistantRoute:
    clean = " ".join(text.strip().split())
    lowered = clean.lower()

    if not clean:
        return AssistantRoute("local", "empty", "concerned", "No input.", confidence=1.0)
    if _matches_name_memory(lowered):
        return AssistantRoute("tool", "remember_user", "bright", "Remember the user's preferred name.", confidence=0.92)
    if _looks_like_setup(lowered):
        return AssistantRoute("tool", "setup_status", "attentive", "Guide NodeSparkHub setup.", confidence=0.88)
    if _looks_like_health(lowered):
        return AssistantRoute("tool", "status", "attentive", "Summarize local, Hub, voice, and workflow readiness.", confidence=0.86)
    if _looks_like_workflow_list(lowered):
        return AssistantRoute("tool", "list_workflows", "focused", "List workflows from NodeSparkHub.", confidence=0.9)
    if _looks_like_workflow_run(lowered):
        workflow = extract_workflow_name(clean) or default_workflow
        return AssistantRoute("tool", "run_workflow", "focused", "Run a NodeSparkHub workflow.", workflow, confidence=0.9)
    if _hub_related(lowered):
        return AssistantRoute("hub", "assistant", "focused", "Use NodeSparkHub context and the selected Hub model.", confidence=0.78)
    return AssistantRoute("local", "chat", infer_route_expression(lowered), "Use Synra's local model.", confidence=0.72)


def infer_route_expression(lowered: str) -> str:
    if any(token in lowered for token in ("sad", "upset", "failed", "broken", "bad", "angry", "worried")):
        return "concerned"
    if any(token in lowered for token in ("why", "how", "what", "explain", "teach", "help")):
        return "curious"
    if any(token in lowered for token in ("thank", "great", "awesome", "love", "cute", "nice")):
        return "bright"
    return "soft_smile"


def extract_preferred_name(text: str) -> str:
    patterns = (
        r"\bmy name is\s+([A-Za-z][A-Za-z0-9 _'-]{1,36})",
        r"\bcall me\s+([A-Za-z][A-Za-z0-9 _'-]{1,36})",
        r"\bi am\s+([A-Za-z][A-Za-z0-9 _'-]{1,36})",
        r"\bi'm\s+([A-Za-z][A-Za-z0-9 _'-]{1,36})",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return _clean_name(match.group(1))
    return ""


def extract_workflow_name(text: str) -> str:
    quoted = re.search(r"['\"]([^'\"]{2,80})['\"]", text)
    if quoted:
        return quoted.group(1).strip()

    clean = " ".join(text.strip().split())
    lowered = clean.lower()
    for marker in (" workflow called ", " workflow named ", " workflow ", " automation called ", " automation named "):
        index = lowered.find(marker)
        if index >= 0:
            candidate = clean[index + len(marker):]
            return _clean_workflow(candidate)
    for verb in ("run ", "start ", "launch ", "execute "):
        if lowered.startswith(verb):
            return _clean_workflow(clean[len(verb):])
    return ""


def _clean_name(value: str) -> str:
    text = re.split(r"\b(?:and|but|because|please|thanks|thank you)\b", value, maxsplit=1, flags=re.IGNORECASE)[0]
    text = re.sub(r"[^A-Za-z0-9 _'-]", "", text).strip(" _'-")
    words = text.split()
    return " ".join(words[:3]).strip()


def _clean_workflow(value: str) -> str:
    text = re.split(r"\b(?:with|using|for|please|now|and then|then)\b", value, maxsplit=1, flags=re.IGNORECASE)[0]
    text = text.strip(" .,:;!?")
    text = re.sub(r"\b(the|a|an)\b\s+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+\b(workflow|automation)\b$", "", text, flags=re.IGNORECASE)
    return text[:80].strip()


def _matches_name_memory(lowered: str) -> bool:
    return any(token in lowered for token in ("my name is ", "call me ", "i am ", "i'm "))


def _looks_like_setup(lowered: str) -> bool:
    return any(token in lowered for token in ("setup", "set up", "connect", "pair", "configure")) and any(
        token in lowered for token in ("hub", "nodespark", "synra", "monitor", "app")
    )


def _looks_like_health(lowered: str) -> bool:
    return any(token in lowered for token in ("status", "health", "online", "ready", "connected")) and any(
        token in lowered for token in ("hub", "synra", "local", "voice", "workflow", "device", "model")
    )


def _looks_like_workflow_list(lowered: str) -> bool:
    return any(token in lowered for token in ("list", "show", "what", "which", "available")) and "workflow" in lowered


def _looks_like_workflow_run(lowered: str) -> bool:
    return any(token in lowered for token in ("run", "start", "launch", "execute")) and any(
        token in lowered for token in ("workflow", "automation", "daily-summary", "synra assistant")
    )


def _hub_related(lowered: str) -> bool:
    words = set(re.findall(r"[a-z0-9_-]+", lowered))
    if words & HUB_TERMS:
        return True
    return bool((words & ACTION_TERMS) and (words & HUB_TERMS))

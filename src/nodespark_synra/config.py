from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import uuid

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover
    tomllib = None


APP_DIR = "nodespark-synra"


@dataclass
class HubConfig:
    base_url: str = ""
    default_workflow: str = "Synra Assistant"
    favorite_workflows: list[str] = field(default_factory=lambda: ["Synra Assistant"])
    timeout_seconds: float = 4.0
    offline_cooldown_seconds: int = 30


@dataclass
class DeviceConfig:
    name: str = "NodeSpark Synra"
    checkin_interval_seconds: int = 60
    command_poll_interval_seconds: int = 2


@dataclass
class ServerConfig:
    host: str = "0.0.0.0"
    port: int = 8788
    open_browser: bool = False


@dataclass
class AvatarConfig:
    name: str = "Synra"
    personality: str = "Confident, warm, playful, and workflow-smart."
    accent_primary: str = "#4cc9ff"
    accent_secondary: str = "#9b5cff"
    accent_success: str = "#40f0a0"
    accent_warning: str = "#ffd166"
    accent_error: str = "#ff4d6d"


@dataclass
class AppConfig:
    hub: HubConfig = field(default_factory=HubConfig)
    device: DeviceConfig = field(default_factory=DeviceConfig)
    server: ServerConfig = field(default_factory=ServerConfig)
    avatar: AvatarConfig = field(default_factory=AvatarConfig)


def default_config_paths() -> list[Path]:
    return [
        Path.cwd() / "config.toml",
        Path.home() / ".config" / APP_DIR / "config.toml",
        Path("/etc") / APP_DIR / "config.toml",
    ]


def state_path() -> Path:
    override = os.environ.get("NODESPARK_SYNRA_STATE")
    if override:
        return Path(override)
    return Path.home() / ".local" / "share" / APP_DIR / "state.json"


def load_config(path: str | None = None) -> AppConfig:
    raw: dict = {}
    candidates = [Path(path)] if path else default_config_paths()
    for candidate in candidates:
        if candidate.exists():
            if tomllib is not None:
                with candidate.open("rb") as fh:
                    raw = tomllib.load(fh)
            else:
                raw = _load_simple_toml(candidate)
            break

    cfg = AppConfig()
    _merge_dataclass(cfg.hub, raw.get("hub", {}))
    _merge_dataclass(cfg.device, raw.get("device", {}))
    _merge_dataclass(cfg.server, raw.get("server", {}))
    _merge_dataclass(cfg.avatar, raw.get("avatar", {}))
    cfg.hub.base_url = os.environ.get("NODESPARK_HUB_URL", cfg.hub.base_url).rstrip("/")
    return cfg


def _merge_dataclass(obj: object, values: dict) -> None:
    for key, value in values.items():
        if hasattr(obj, key):
            setattr(obj, key, value)


def _load_simple_toml(path: Path) -> dict:
    raw: dict = {}
    current: dict | None = None
    for line in path.read_text(encoding="utf-8").splitlines():
        text = line.strip()
        if not text or text.startswith("#"):
            continue
        if text.startswith("[") and text.endswith("]"):
            section = text[1:-1].strip()
            current = raw.setdefault(section, {})
            continue
        if current is None or "=" not in text:
            continue
        key, value = [part.strip() for part in text.split("=", 1)]
        current[key] = _parse_simple_toml_value(value)
    return raw


def _parse_simple_toml_value(value: str):
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1]
    if value in {"true", "false"}:
        return value == "true"
    if value.startswith("[") and value.endswith("]"):
        body = value[1:-1].strip()
        if not body:
            return []
        return [_parse_simple_toml_value(item.strip()) for item in body.split(",")]
    try:
        return int(value)
    except ValueError:
        return value


class StateStore:
    def __init__(self, path: Path | None = None):
        self.path = path or state_path()
        self.data = self._load()
        if not self.data.get("device_id"):
            self.data["device_id"] = str(uuid.uuid4())
            self.save()

    @property
    def device_id(self) -> str:
        return str(self.data["device_id"])

    @property
    def token(self) -> str:
        return str(self.data.get("device_token", ""))

    @token.setter
    def token(self, value: str) -> None:
        self.data["device_token"] = value
        self.save()

    def set_pairing(self, hub_id: str, token: str, expires_at: str | None = None) -> None:
        self.data["hub_id"] = hub_id
        self.data["device_token"] = token
        self.data["token_expires_at"] = expires_at
        self.save()

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, indent=2, sort_keys=True) + "\n")
        try:
            self.path.chmod(0o600)
        except OSError:
            pass

    def _load(self) -> dict:
        if not self.path.exists():
            return {}
        try:
            return json.loads(self.path.read_text())
        except Exception:
            return {}

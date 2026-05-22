from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil
import socket
import subprocess


@dataclass
class SystemStatus:
    ip: str = ""
    wifi: str = ""
    battery: str = ""
    temperature: str = ""


def read_status() -> SystemStatus:
    return SystemStatus(
        ip=_ip_address(),
        wifi=_wifi_name(),
        battery=_battery_status(),
        temperature=_temperature(),
    )


def _ip_address() -> str:
    if shutil.which("hostname"):
        try:
            out = subprocess.check_output(["hostname", "-I"], text=True, timeout=2, stderr=subprocess.DEVNULL).strip()
            for value in out.split():
                if "." in value and not value.startswith("127."):
                    return value
        except Exception:
            pass

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except Exception:
        return ""


def _wifi_name() -> str:
    if shutil.which("iwgetid"):
        try:
            out = subprocess.check_output(["iwgetid", "-r"], text=True, timeout=2, stderr=subprocess.DEVNULL).strip()
            if out:
                return out
        except Exception:
            pass

    if shutil.which("nmcli"):
        try:
            out = subprocess.check_output(
                ["nmcli", "-t", "-f", "active,ssid", "dev", "wifi"],
                text=True,
                timeout=2,
                stderr=subprocess.DEVNULL,
            )
            for line in out.splitlines():
                active, _, ssid = line.partition(":")
                if active == "yes" and ssid:
                    return ssid
        except Exception:
            pass
    return ""


def _battery_status() -> str:
    for path in Path("/sys/class/power_supply").glob("*/capacity"):
        try:
            value = path.read_text().strip()
            if value.isdigit():
                return f"{value}%"
        except Exception:
            pass
    return ""


def _temperature() -> str:
    for path in (
        Path("/sys/class/thermal/thermal_zone0/temp"),
        Path("/sys/devices/virtual/thermal/thermal_zone0/temp"),
    ):
        try:
            raw = path.read_text().strip()
            if raw.isdigit():
                return f"{int(raw) / 1000:.0f}C"
        except Exception:
            pass
    return ""


def percent_int(value: str) -> int | None:
    digits = "".join(ch for ch in value if ch.isdigit())
    if not digits:
        return None
    return max(0, min(100, int(digits)))

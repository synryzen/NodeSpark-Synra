from __future__ import annotations

from dataclasses import dataclass
import io
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from .config import TTSConfig


class TTSError(RuntimeError):
    pass


@dataclass(frozen=True)
class TTSResult:
    audio: bytes
    content_type: str
    provider: str
    voice: str


class TTSService:
    def __init__(self, cfg: TTSConfig):
        self.cfg = cfg
        self._kokoro_pipeline: Any | None = None

    def status(self) -> dict[str, Any]:
        provider = self._selected_provider()
        return {
            "provider": provider or "browser",
            "available": bool(provider),
            "fallback": "browser",
            "voices": self._voice_catalog(provider),
            "detail": self._status_detail(provider),
        }

    def synthesize(self, text: str, voice: str = "cute") -> TTSResult:
        text = self._clean_text(text)
        provider = self._selected_provider()
        if provider == "voicebox":
            return self._voicebox(text, voice)
        if provider == "elevenlabs":
            return self._elevenlabs(text, voice)
        if provider == "kokoro":
            return self._kokoro(text, voice)
        raise TTSError("No natural TTS provider is configured. Browser voice fallback is available.")

    def _selected_provider(self) -> str:
        requested = (self.cfg.provider or "auto").strip().lower()
        if requested in {"browser", "off", "none"}:
            return ""
        if requested == "voicebox":
            return "voicebox" if self._voicebox_available() else ""
        if requested == "elevenlabs":
            return "elevenlabs" if self.cfg.elevenlabs_api_key else ""
        if requested == "kokoro":
            return "kokoro" if self._kokoro_available() else ""
        if self.cfg.voicebox_enabled and self._voicebox_available():
            return "voicebox"
        if self.cfg.elevenlabs_api_key:
            return "elevenlabs"
        if self._kokoro_available():
            return "kokoro"
        return ""

    def _status_detail(self, provider: str) -> str:
        if provider == "voicebox":
            return "Voicebox expressive local voice server is available."
        if provider == "elevenlabs":
            return "ElevenLabs neural voice is configured."
        if provider == "kokoro":
            return "Kokoro local neural voice is available."
        if (self.cfg.provider or "auto").strip().lower() == "voicebox":
            return "Start Voicebox on the configured URL to enable Synra's expressive anime voice."
        if (self.cfg.provider or "auto").strip().lower() == "elevenlabs":
            return "Set ELEVENLABS_API_KEY to enable ElevenLabs."
        if (self.cfg.provider or "auto").strip().lower() == "kokoro":
            return "Install kokoro, soundfile, and torch in the Synra virtualenv to enable Kokoro."
        return "No neural provider is configured yet."

    def _clean_text(self, text: str) -> str:
        cleaned = " ".join(str(text or "").split())
        if not cleaned:
            raise TTSError("No text supplied for speech.")
        limit = max(80, int(self.cfg.max_text_chars))
        return cleaned[:limit]

    def _elevenlabs(self, text: str, voice: str) -> TTSResult:
        api_key = self.cfg.elevenlabs_api_key.strip()
        voice_id = self._elevenlabs_voice_for(voice)
        if not api_key or not voice_id:
            raise TTSError("ElevenLabs API key or voice id is missing.")
        payload = {
            "text": text,
            "model_id": self.cfg.elevenlabs_model_id or "eleven_multilingual_v2",
            "voice_settings": {
                "stability": float(self.cfg.elevenlabs_stability),
                "similarity_boost": float(self.cfg.elevenlabs_similarity_boost),
                "style": float(self.cfg.elevenlabs_style),
                "use_speaker_boost": True,
            },
        }
        encoded = json.dumps(payload).encode("utf-8")
        request = Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            data=encoded,
            method="POST",
            headers={
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": api_key,
                "User-Agent": "nodespark-synra",
            },
        )
        try:
            with urlopen(request, timeout=max(1.0, float(self.cfg.timeout_seconds))) as response:
                return TTSResult(response.read(), response.headers.get_content_type() or "audio/mpeg", "elevenlabs", voice_id)
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise TTSError(f"ElevenLabs HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise TTSError(f"Could not reach ElevenLabs: {exc}") from exc

    def _elevenlabs_voice_for(self, voice: str) -> str:
        if voice.startswith("elevenlabs:"):
            return voice.split(":", 1)[1].strip()
        return self.cfg.elevenlabs_voice_id.strip()

    def _voicebox_available(self) -> bool:
        if not self.cfg.voicebox_enabled:
            return False
        try:
            self._voicebox_json("GET", "/health", timeout=0.75)
        except Exception:
            try:
                self._voicebox_json("GET", "/", timeout=0.75)
            except Exception:
                return False
        return True

    def _voicebox(self, text: str, voice: str) -> TTSResult:
        preset = self._voicebox_preset_for(voice)
        profile_id = self._voicebox_profile_id(preset)
        payload = {
            "profile_id": profile_id,
            "text": text,
            "language": preset["language"],
            "engine": "qwen_custom_voice",
            "model_size": self.cfg.voicebox_model_size or "0.6B",
            "instruct": preset["instruct"],
            "normalize": True,
            "max_chunk_chars": 700,
            "crossfade_ms": 65,
        }
        audio, content_type = self._voicebox_bytes("POST", "/generate/stream", payload, timeout=self.cfg.voicebox_timeout_seconds)
        return TTSResult(audio, content_type or "audio/wav", "voicebox", preset["id"])

    def _voicebox_profile_id(self, preset: dict[str, str]) -> str:
        profiles = self._voicebox_json("GET", "/profiles", timeout=max(1.0, float(self.cfg.timeout_seconds)))
        rows = profiles if isinstance(profiles, list) else profiles.get("profiles", [])
        for row in rows if isinstance(rows, list) else []:
            if not isinstance(row, dict):
                continue
            if row.get("id") == preset["profile"] or str(row.get("name") or "").lower() == preset["profile"].lower():
                return str(row["id"])
        if not self.cfg.voicebox_auto_create_profiles:
            raise TTSError(f"Voicebox profile '{preset['profile']}' was not found.")
        created = self._voicebox_json(
            "POST",
            "/profiles",
            {
                "name": preset["profile"],
                "description": preset["description"],
                "language": preset["language"],
                "voice_type": "preset",
                "preset_engine": "qwen_custom_voice",
                "preset_voice_id": preset["preset_voice_id"],
                "default_engine": "qwen_custom_voice",
                "personality": (
                    "Synra is a realistic anime-style AI assistant: bright, warm, emotionally expressive, "
                    "quick with a little playful charm, and never robotic."
                ),
            },
            timeout=max(2.0, float(self.cfg.timeout_seconds)),
        )
        profile_id = str(created.get("id") or "")
        if not profile_id:
            raise TTSError("Voicebox did not return a profile id.")
        return profile_id

    def _voicebox_preset_for(self, voice: str) -> dict[str, str]:
        key = voice.split(":", 1)[1] if voice.startswith("voicebox:") else voice
        presets = {item["id"]: item for item in self._voicebox_presets()}
        return presets.get(key, presets["anime"])

    def _voicebox_presets(self) -> list[dict[str, str]]:
        return [
            {
                "id": "anime",
                "profile": "Synra Anime",
                "name": "Synra Anime",
                "style": "playful realistic anime female",
                "language": "en",
                "preset_voice_id": "Ono_Anna",
                "description": "Playful anime-girl voice powered by Voicebox Qwen CustomVoice.",
                "instruct": "Speak in English as a realistic anime girl: cute, bright, emotional, lively, and natural. Avoid a robotic or announcer tone.",
            },
            {
                "id": "soft",
                "profile": "Synra Soft",
                "name": "Synra Soft",
                "style": "gentle emotional female",
                "language": "en",
                "preset_voice_id": "Serena",
                "description": "Soft expressive female voice powered by Voicebox Qwen CustomVoice.",
                "instruct": "Speak softly with warm emotion, natural breath, and a caring anime-assistant personality. Keep it realistic.",
            },
            {
                "id": "bright",
                "profile": "Synra Bright",
                "name": "Synra Bright",
                "style": "bright energetic female",
                "language": "en",
                "preset_voice_id": "Vivian",
                "description": "Bright young female voice powered by Voicebox Qwen CustomVoice.",
                "instruct": "Speak with upbeat youthful energy, subtle anime charm, clear emotion, and natural pacing. Do not sound robotic.",
            },
            {
                "id": "emotional",
                "profile": "Synra Emotional",
                "name": "Synra Emotional",
                "style": "warm expressive female",
                "language": "en",
                "preset_voice_id": "Sohee",
                "description": "Warm emotional female voice powered by Voicebox Qwen CustomVoice.",
                "instruct": "Speak with rich feeling, gentle confidence, and realistic conversational timing. Keep the voice cute but human.",
            },
        ]

    def _voicebox_json(self, method: str, path: str, payload: dict[str, Any] | None = None, timeout: float | None = None) -> Any:
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(
            self._voicebox_url(path),
            data=data,
            method=method,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "nodespark-synra",
            },
        )
        try:
            with urlopen(request, timeout=timeout or max(1.0, float(self.cfg.timeout_seconds))) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise TTSError(f"Voicebox HTTP {exc.code}: {detail}") from exc
        except (URLError, TimeoutError, ValueError) as exc:
            raise TTSError(f"Could not reach Voicebox: {exc}") from exc

    def _voicebox_bytes(self, method: str, path: str, payload: dict[str, Any], timeout: float | None = None) -> tuple[bytes, str]:
        request = Request(
            self._voicebox_url(path),
            data=json.dumps(payload).encode("utf-8"),
            method=method,
            headers={
                "Accept": "audio/wav",
                "Content-Type": "application/json",
                "User-Agent": "nodespark-synra",
            },
        )
        try:
            with urlopen(request, timeout=timeout or max(1.0, float(self.cfg.voicebox_timeout_seconds))) as response:
                return response.read(), response.headers.get_content_type() or "audio/wav"
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise TTSError(f"Voicebox HTTP {exc.code}: {detail}") from exc
        except (URLError, TimeoutError) as exc:
            raise TTSError(f"Could not reach Voicebox: {exc}") from exc

    def _voicebox_url(self, path: str) -> str:
        base = (self.cfg.voicebox_base_url or "http://127.0.0.1:17493").rstrip("/") + "/"
        return urljoin(base, path.lstrip("/"))

    def _kokoro_available(self) -> bool:
        try:
            import kokoro  # noqa: F401
            import soundfile  # noqa: F401
        except Exception:
            return False
        return True

    def _kokoro(self, text: str, voice: str) -> TTSResult:
        try:
            import soundfile as sf
            from kokoro import KPipeline
        except Exception as exc:
            raise TTSError("Kokoro is not installed in the Synra virtualenv.") from exc

        if self._kokoro_pipeline is None:
            self._kokoro_pipeline = KPipeline(lang_code=self.cfg.kokoro_lang_code or "a")
        selected_voice = self._kokoro_voice_for(voice)
        chunks = []
        for _gs, _ps, audio in self._kokoro_pipeline(text, voice=selected_voice):
            chunks.append(audio)
        if not chunks:
            raise TTSError("Kokoro did not return audio.")

        try:
            import numpy as np

            audio_data = np.concatenate(chunks)
        except Exception:
            audio_data = chunks[0]

        buffer = io.BytesIO()
        sf.write(buffer, audio_data, 24000, format="WAV")
        return TTSResult(buffer.getvalue(), "audio/wav", "kokoro", selected_voice)

    def _kokoro_voice_for(self, voice: str) -> str:
        if voice.startswith("kokoro:"):
            return voice.split(":", 1)[1].strip()
        if voice.startswith("af_") or voice.startswith("bf_"):
            return voice.strip()
        mapping = {
            "cute": self.cfg.kokoro_voice or "af_heart",
            "soft": self.cfg.kokoro_voice_soft or "af_nicole",
            "bright": self.cfg.kokoro_voice_bright or "af_bella",
            "calm": self.cfg.kokoro_voice_calm or "af_sarah",
        }
        return mapping.get(voice, self.cfg.kokoro_voice or "af_heart")

    def _voice_catalog(self, provider: str) -> list[dict[str, str]]:
        if provider == "voicebox":
            return [
                {"id": f"voicebox:{preset['id']}", "name": preset["name"], "style": preset["style"], "provider": "voicebox"}
                for preset in self._voicebox_presets()
            ]
        if provider == "kokoro":
            return [
                {"id": "kokoro:af_heart", "name": "Synra Heart", "style": "warm natural female", "provider": "kokoro"},
                {"id": "kokoro:af_nicole", "name": "Synra Nicole", "style": "soft realistic female", "provider": "kokoro"},
                {"id": "kokoro:af_bella", "name": "Synra Bella", "style": "bright anime female", "provider": "kokoro"},
                {"id": "kokoro:af_sarah", "name": "Synra Sarah", "style": "calm assistant female", "provider": "kokoro"},
                {"id": "kokoro:af_sky", "name": "Synra Sky", "style": "light natural female", "provider": "kokoro"},
                {"id": "kokoro:af_nova", "name": "Synra Nova", "style": "confident female", "provider": "kokoro"},
            ]
        if provider == "elevenlabs":
            return [
                {"id": "cute", "name": "ElevenLabs natural", "style": "configured neural female", "provider": "elevenlabs"},
            ]
        return [
            {"id": "cute", "name": "Browser natural", "style": "filtered female browser voice", "provider": "browser"},
            {"id": "soft", "name": "Browser soft", "style": "filtered female browser voice", "provider": "browser"},
            {"id": "calm", "name": "Browser calm", "style": "filtered female browser voice", "provider": "browser"},
        ]

from __future__ import annotations

from dataclasses import dataclass
import importlib.util
import io
import json
import time
import threading
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
        self._qwen_model: Any | None = None
        self._qwen_model_size: str = ""
        self._qwen_lock = threading.Lock()
        self._kokoro_pipeline: Any | None = None
        self._status_cache: tuple[float, dict[str, Any]] | None = None
        self._audio_cache: dict[tuple[str, str, str], TTSResult] = {}
        self._audio_cache_order: list[tuple[str, str, str]] = []
        self._cache_lock = threading.Lock()
        self._voicebox_profiles: dict[str, str] = {}
        self._prime_lock = threading.Lock()
        self._prime_inflight: set[tuple[str, str, str]] = set()
        self._provider_cache: tuple[float, str] | None = None

    def status(self) -> dict[str, Any]:
        now = time.monotonic()
        if self._status_cache and now - self._status_cache[0] < 4:
            return dict(self._status_cache[1])
        provider = self._selected_provider()
        status = {
            "provider": provider or "browser",
            "available": bool(provider),
            "fallback": "browser",
            "voices": self._voice_catalog(provider),
            "detail": self._status_detail(provider),
        }
        self._status_cache = (now, dict(status))
        return status

    def synthesize(self, text: str, voice: str = "cute") -> TTSResult:
        text = self._clean_text(text)
        provider = self._provider_for_voice(voice)
        key = self._cache_key(provider, voice, text)
        cached = self._cached_key(key)
        if cached:
            return cached
        if provider == "qwen":
            result = self._qwen(text, voice)
            self._store_cached(key, result)
            return result
        if provider == "voicebox":
            result = self._voicebox(text, voice)
            self._store_cached(key, result)
            return result
        if provider == "elevenlabs":
            result = self._elevenlabs(text, voice)
            self._store_cached(key, result)
            return result
        if provider == "kokoro":
            result = self._kokoro(text, voice)
            self._store_cached(key, result)
            return result
        raise TTSError("No natural TTS provider is configured. Browser voice fallback is available.")

    def cached(self, text: str, voice: str = "cute") -> TTSResult | None:
        text = self._clean_text(text)
        provider = self._provider_for_voice(voice)
        return self._cached_key(self._cache_key(provider, voice, text))

    def prime_async(self, voices: list[str] | None = None, texts: list[str] | None = None) -> bool:
        voice_list = [voice for voice in (voices or []) if voice]
        if not voice_list:
            voice_list = ["cute", "soft", "bright"]
        text_list = texts or ["On it.", "I’m listening.", "Hi. I’m here."]
        jobs: list[tuple[str, str, tuple[str, str, str]]] = []
        with self._prime_lock:
            for voice in voice_list[:4]:
                provider = self._provider_for_voice(voice)
                if not provider:
                    continue
                for text in text_list[:4]:
                    clean_text = self._clean_text(text)
                    key = self._cache_key(provider, voice, clean_text)
                    if self._cached_key(key) or key in self._prime_inflight:
                        continue
                    self._prime_inflight.add(key)
                    jobs.append((voice, clean_text, key))
        if not jobs:
            return False
        threading.Thread(
            target=self._prime_worker,
            args=(jobs,),
            name="synra-tts-prime",
            daemon=True,
        ).start()
        return True

    def _prime_worker(self, jobs: list[tuple[str, str, tuple[str, str, str]]]) -> None:
        for voice, text, key in jobs:
            try:
                self.synthesize(text, voice)
            except Exception as exc:
                print(f"[tts] prime skipped {voice}: {exc}")
            finally:
                with self._prime_lock:
                    self._prime_inflight.discard(key)

    def _cache_key(self, provider: str, voice: str, text: str) -> tuple[str, str, str]:
        return (provider or "browser", voice or "cute", text)

    def _cached_key(self, key: tuple[str, str, str]) -> TTSResult | None:
        with self._cache_lock:
            result = self._audio_cache.get(key)
            if result and key in self._audio_cache_order:
                self._audio_cache_order.remove(key)
                self._audio_cache_order.append(key)
            return result

    def _store_cached(self, key: tuple[str, str, str], result: TTSResult) -> None:
        with self._cache_lock:
            self._audio_cache[key] = result
            if key in self._audio_cache_order:
                self._audio_cache_order.remove(key)
            self._audio_cache_order.append(key)
            while len(self._audio_cache_order) > 32:
                old = self._audio_cache_order.pop(0)
                self._audio_cache.pop(old, None)

    def _selected_provider(self) -> str:
        now = time.monotonic()
        if self._provider_cache and now - self._provider_cache[0] < 4:
            return self._provider_cache[1]
        provider = self._selected_provider_uncached()
        self._provider_cache = (now, provider)
        return provider

    def _provider_for_voice(self, voice: str) -> str:
        requested = (voice or "").split(":", 1)[0].strip().lower()
        if requested == "qwen" and self._qwen_available():
            return "qwen"
        if requested == "voicebox" and self._voicebox_available():
            return "voicebox"
        if requested == "elevenlabs" and self.cfg.elevenlabs_api_key:
            return "elevenlabs"
        if requested == "kokoro" and self._kokoro_available():
            return "kokoro"
        return self._selected_provider()

    def _selected_provider_uncached(self) -> str:
        requested = (self.cfg.provider or "auto").strip().lower()
        if requested in {"browser", "off", "none"}:
            return ""
        if requested == "qwen":
            return "qwen" if self._qwen_available() else ""
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
        if self.cfg.qwen_enabled and self._qwen_available():
            return "qwen"
        return ""

    def _status_detail(self, provider: str) -> str:
        if provider == "qwen":
            return "Qwen CustomVoice expressive local anime voice is available."
        if provider == "voicebox":
            return "Voicebox expressive local voice server is available."
        if provider == "elevenlabs":
            return "ElevenLabs neural voice is configured."
        if provider == "kokoro":
            return "Kokoro local neural voice is available."
        if (self.cfg.provider or "auto").strip().lower() == "qwen":
            return "Install qwen-tts with working CUDA, or set NODESPARK_SYNRA_QWEN_TTS_ALLOW_CPU=true for slow CPU testing."
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

    def _qwen_available(self) -> bool:
        if not self.cfg.qwen_enabled:
            return False
        if not importlib.util.find_spec("qwen_tts"):
            return False
        if not importlib.util.find_spec("soundfile"):
            return False
        return bool(importlib.util.find_spec("torch"))

    def _qwen(self, text: str, voice: str) -> TTSResult:
        try:
            import soundfile as sf
            import torch
        except Exception as exc:
            raise TTSError("Qwen TTS dependencies are not installed in the Synra virtualenv.") from exc

        preset = self._qwen_preset_for(voice)
        model = self._qwen_model_for_size(self.cfg.qwen_model_size or "0.6B")
        language = self._qwen_language_name(preset["language"])
        kwargs = {
            "text": text,
            "language": language,
            "speaker": preset["preset_voice_id"],
            "instruct": preset["instruct"],
        }

        with self._qwen_lock:
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            wavs, sample_rate = model.generate_custom_voice(**kwargs)

        audio = wavs[0] if isinstance(wavs, (list, tuple)) else wavs
        buffer = io.BytesIO()
        sf.write(buffer, audio, int(sample_rate or 24000), format="WAV")
        return TTSResult(buffer.getvalue(), "audio/wav", "qwen", preset["id"])

    def _qwen_model_for_size(self, model_size: str) -> Any:
        normalized = model_size if model_size in {"0.6B", "1.7B"} else "0.6B"
        if self._qwen_model is not None and self._qwen_model_size == normalized:
            return self._qwen_model

        with self._qwen_lock:
            if self._qwen_model is not None and self._qwen_model_size == normalized:
                return self._qwen_model

            import torch
            from qwen_tts import Qwen3TTSModel

            repo = {
                "0.6B": "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
                "1.7B": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
            }[normalized]
            if self._qwen_model is not None:
                del self._qwen_model
                self._qwen_model = None
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

            dtype = (self.cfg.qwen_torch_dtype or "auto").lower()
            if dtype == "float32":
                torch_dtype = torch.float32
            elif dtype in {"float16", "fp16"}:
                torch_dtype = torch.float16
            elif dtype in {"bfloat16", "bf16"}:
                torch_dtype = torch.bfloat16
            else:
                torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

            if torch.cuda.is_available():
                self._qwen_model = Qwen3TTSModel.from_pretrained(repo, device_map="cuda", torch_dtype=torch_dtype)
            else:
                self._qwen_model = Qwen3TTSModel.from_pretrained(repo, torch_dtype=torch.float32, low_cpu_mem_usage=False)
            self._qwen_model_size = normalized
            return self._qwen_model

    def _qwen_language_name(self, language: str) -> str:
        mapping = {
            "en": "English",
            "ja": "Japanese",
            "ko": "Korean",
            "zh": "Chinese",
            "es": "Spanish",
            "fr": "French",
            "de": "German",
            "it": "Italian",
            "pt": "Portuguese",
            "ru": "Russian",
        }
        return mapping.get(language, "Auto")

    def _qwen_preset_for(self, voice: str) -> dict[str, str]:
        key = voice.split(":", 1)[1] if voice.startswith("qwen:") else voice
        presets = {item["id"]: item for item in self._qwen_presets()}
        return presets.get(key, presets["anime"])

    def _qwen_presets(self) -> list[dict[str, str]]:
        return [
            {
                "id": "anime",
                "name": "Synra Anime",
                "style": "playful realistic anime female",
                "language": "en",
                "preset_voice_id": "Ono_Anna",
                "instruct": "Speak in English as a realistic anime girl: cute, bright, emotional, lively, and natural. Avoid a robotic or announcer tone.",
            },
            {
                "id": "soft",
                "name": "Synra Soft",
                "style": "gentle emotional female",
                "language": "en",
                "preset_voice_id": "Serena",
                "instruct": "Speak softly with warm emotion, natural breath, and a caring anime-assistant personality. Keep it realistic.",
            },
            {
                "id": "bright",
                "name": "Synra Bright",
                "style": "bright energetic female",
                "language": "en",
                "preset_voice_id": "Vivian",
                "instruct": "Speak with upbeat youthful energy, subtle anime charm, clear emotion, and natural pacing. Do not sound robotic.",
            },
            {
                "id": "emotional",
                "name": "Synra Emotional",
                "style": "warm expressive female",
                "language": "en",
                "preset_voice_id": "Sohee",
                "instruct": "Speak with rich feeling, gentle confidence, and realistic conversational timing. Keep the voice cute but human.",
            },
        ]

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
        cached = self._voicebox_profiles.get(preset["profile"])
        if cached:
            return cached
        profiles = self._voicebox_json("GET", "/profiles", timeout=max(1.0, float(self.cfg.timeout_seconds)))
        rows = profiles if isinstance(profiles, list) else profiles.get("profiles", [])
        for row in rows if isinstance(rows, list) else []:
            if not isinstance(row, dict):
                continue
            if row.get("id") == preset["profile"] or str(row.get("name") or "").lower() == preset["profile"].lower():
                profile_id = str(row["id"])
                self._voicebox_profiles[preset["profile"]] = profile_id
                return profile_id
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
        self._voicebox_profiles[preset["profile"]] = profile_id
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
        return bool(importlib.util.find_spec("kokoro") and importlib.util.find_spec("soundfile"))

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
        voices: list[dict[str, str]] = []
        if provider == "qwen":
            voices.extend([
                {"id": f"qwen:{preset['id']}", "name": preset["name"], "style": preset["style"], "provider": "qwen"}
                for preset in self._qwen_presets()
            ])
        if provider == "voicebox":
            voices.extend([
                {"id": f"voicebox:{preset['id']}", "name": preset["name"], "style": preset["style"], "provider": "voicebox"}
                for preset in self._voicebox_presets()
            ])
        if provider == "kokoro" or self._kokoro_available():
            voices.extend([
                {"id": "kokoro:af_heart", "name": "Synra Heart", "style": "warm natural female", "provider": "kokoro"},
                {"id": "kokoro:af_nicole", "name": "Synra Nicole", "style": "soft realistic female", "provider": "kokoro"},
                {"id": "kokoro:af_bella", "name": "Synra Bella", "style": "bright anime female", "provider": "kokoro"},
                {"id": "kokoro:af_sarah", "name": "Synra Sarah", "style": "calm assistant female", "provider": "kokoro"},
                {"id": "kokoro:af_sky", "name": "Synra Sky", "style": "light natural female", "provider": "kokoro"},
                {"id": "kokoro:af_nova", "name": "Synra Nova", "style": "confident female", "provider": "kokoro"},
            ])
        if provider == "elevenlabs":
            voices.extend([
                {"id": "cute", "name": "ElevenLabs natural", "style": "configured neural female", "provider": "elevenlabs"},
            ])
        if voices:
            return voices
        return [
            {"id": "cute", "name": "Browser natural", "style": "filtered female browser voice", "provider": "browser"},
            {"id": "soft", "name": "Browser soft", "style": "filtered female browser voice", "provider": "browser"},
            {"id": "calm", "name": "Browser calm", "style": "filtered female browser voice", "provider": "browser"},
        ]

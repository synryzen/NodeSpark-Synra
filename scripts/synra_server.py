#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import socket
import platform
import subprocess
import time
import urllib.error
import base64
import hashlib
import secrets
import urllib.parse
import urllib.request
from glob import glob
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


APP_DIR = Path(__file__).resolve().parents[1]
DIST_DIR = APP_DIR / "dist"
CONFIG_DIR = Path(os.environ.get("SYNRA_CONFIG_DIR", Path.home() / ".config" / "synra-standalone")).expanduser()
SECRETS_PATH = CONFIG_DIR / "secrets.json"
SERVER_SECRET_SENTINEL = "__server_secret__"
APP_VERSION = os.environ.get("SYNRA_APP_VERSION", "").strip()
STATION_VERSION = os.environ.get("SYNRA_STATION_VERSION", "").strip()
STARTED_AT = time.time()
LAST_TELEMETRY: dict[str, Any] = {}
PENDING_CONFIRMATIONS: dict[str, dict[str, Any]] = {}
CONFIRMATION_TTL_SECONDS = int(os.environ.get("SYNRA_CONFIRMATION_TTL_SECONDS", "45"))


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class SynraHandler(SimpleHTTPRequestHandler):
    server_version = "SynraStandalone/4.3"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def end_headers(self) -> None:
        request_path = self.path.split("?", 1)[0]
        no_store = self.path.startswith("/api/") or request_path in {"/", "/index.html"}
        self.send_header("Cache-Control", "no-store" if no_store else "public, max-age=300")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_GET(self) -> None:
        if self.path.startswith("/api/health"):
            vision = vision_public_status()
            self.send_json(
                200,
                {
                    "ok": True,
                    "service": "synra-standalone",
                    "uptimeSeconds": round(time.time() - STARTED_AT, 1),
                    "modelConfigured": bool(model_endpoint() and model_name()),
                    "model": public_model_name(),
                    "modelRoutes": public_model_routes(),
                    "localTools": ["health", "model-status", "smart-home", "vision-status", "system_status", "network_status", "date_time"],
                    "smartHomeConfigured": smart_home_configured(),
                    "cameraDevices": vision["cameraDevices"],
                    "cameraDeviceCount": vision["cameraDeviceCount"],
                    "mediaDeviceCount": vision["mediaDeviceCount"],
                    "videoDeviceCount": vision["videoDeviceCount"],
                },
            )
            return
        if self.path.startswith("/api/model/public"):
            self.send_json(
                200,
                {
                    "configured": bool(model_endpoint() and model_name()),
                    "model": public_model_name(),
                    "endpointLabel": endpoint_label(model_endpoint()),
                    "serverSideCredentials": bool(os.environ.get("SYNRA_MODEL_API_KEY", "").strip()),
                },
            )
            return
        if self.path.startswith("/api/vision/public"):
            self.send_json(200, vision_public_status())
            return
        if self.path.startswith("/api/kiosk/health"):
            self.send_json(200, kiosk_health_status())
            return
        if self.path.startswith("/api/telemetry/public"):
            self.send_json(200, {"ok": True, "telemetry": LAST_TELEMETRY})
            return
        if self.path.startswith("/api/release/public"):
            self.send_json(200, release_public_status())
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path.startswith("/api/chat"):
            self.handle_chat()
            return
        if self.path.startswith("/api/external-chat"):
            self.handle_external_chat()
            return
        if self.path.startswith("/api/tts/elevenlabs/voices"):
            self.handle_elevenlabs_voices()
            return
        if self.path.startswith("/api/tts/elevenlabs"):
            self.handle_elevenlabs_tts()
            return
        if self.path.startswith("/api/vision/analyze"):
            self.handle_vision_analyze()
            return
        if self.path.startswith("/api/tools/local"):
            self.handle_local_tool()
            return
        if self.path.startswith("/api/nodespark/status"):
            self.handle_nodespark_status()
            return
        if self.path.startswith("/api/nodespark/pair"):
            self.handle_nodespark_pair()
            return
        if self.path.startswith("/api/nodespark/action"):
            self.handle_nodespark_action()
            return
        if self.path.startswith("/api/tools/smart-home/discover"):
            self.handle_smart_home_discover()
            return
        if self.path.startswith("/api/tools/smart-home/status"):
            self.handle_smart_home_status()
            return
        if self.path.startswith("/api/tools/smart-home"):
            self.handle_smart_home()
            return
        if self.path.startswith("/api/telemetry"):
            self.handle_telemetry()
            return
        if self.path.startswith("/api/confirmations/prepare"):
            self.handle_prepare_confirmation()
            return
        if self.path.startswith("/api/secrets/save"):
            self.handle_save_secrets()
            return
        self.send_json(404, {"ok": False, "error": "Unknown Synra API route."})

    def handle_chat(self) -> None:
        endpoint = model_endpoint()
        model = model_name()
        if not endpoint or not model:
            self.send_json(200, {"ok": False, "error": "No server-side Synra model is configured."})
            return

        try:
            body = self.read_json_body()
            messages = body.get("messages", [])
            memory = body.get("memory", {})
            intent = normalize_intent(body.get("intent"))
            routed_model = model_name_for_intent(intent)
            payload = {
                "model": routed_model,
                "temperature": float(os.environ.get("SYNRA_MODEL_TEMPERATURE", "0.7")),
                "messages": [
                    {
                        "role": "system",
                        "content": system_prompt(memory),
                    },
                    *normalize_messages(messages),
                    english_language_guardrail(),
                ],
            }
            response = post_json(endpoint, payload, os.environ.get("SYNRA_MODEL_API_KEY", "").strip())
            text = extract_model_text(response)
            if not text:
                self.send_json(200, {"ok": False, "error": "Model returned no assistant text."})
                return
            self.send_json(200, {"ok": True, "text": text, "model": public_model_label_for_intent(intent), "intent": intent})
        except urllib.error.HTTPError as error:
            self.send_json(200, {"ok": False, "error": describe_http_error("Model endpoint", error)})
        except urllib.error.URLError as error:
            self.send_json(200, {"ok": False, "error": f"Model endpoint is unreachable: {error.reason}."})
        except Exception as error:
            self.send_json(200, {"ok": False, "error": str(error)})

    def handle_external_chat(self) -> None:
        try:
            body = self.read_json_body()
            provider = normalize_provider(body.get("provider"))
            endpoint = normalize_chat_endpoint(str(body.get("endpoint") or "").strip())
            model = str(body.get("model") or "").strip()
            if not endpoint:
                self.send_json(200, {"ok": False, "error": "No external model endpoint is configured."})
                return
            if not model:
                self.send_json(200, {"ok": False, "error": "No external model name is configured."})
                return

            memory = body.get("memory", {})
            messages = body.get("messages", [])
            intent = normalize_intent(body.get("intent"))
            temperature = clamp_float(body.get("temperature"), 0.0, 2.0, 0.2)
            custom_prompt = str(body.get("systemPrompt") or "").strip()
            payload = {
                "model": model,
                "temperature": temperature,
                "messages": [
                    {
                        "role": "system",
                        "content": system_prompt(memory, custom_prompt),
                    },
                    *normalize_messages(messages),
                    english_language_guardrail(),
                ],
            }
            response = post_json(endpoint, payload, secret_or_body("modelApiKey", str(body.get("apiKey") or "").strip(), "SYNRA_MODEL_API_KEY"))
            text = extract_model_text(response)
            if not text:
                self.send_json(200, {"ok": False, "error": "External model returned no assistant text."})
                return
            self.send_json(
                200,
                {
                    "ok": True,
                    "text": text,
                    "model": model,
                    "provider": provider,
                    "endpointLabel": endpoint_label(endpoint),
                    "intent": intent,
                },
            )
        except urllib.error.HTTPError as error:
            self.send_json(200, {"ok": False, "error": describe_http_error("External model endpoint", error)})
        except urllib.error.URLError as error:
            self.send_json(200, {"ok": False, "error": f"External model endpoint is unreachable: {error.reason}."})
        except Exception as error:
            self.send_json(200, {"ok": False, "error": str(error)})

    def handle_elevenlabs_tts(self) -> None:
        try:
            body = self.read_json_body()
            text = str(body.get("text") or "").strip()
            api_key = secret_or_body("elevenLabsApiKey", str(body.get("apiKey") or "").strip(), "SYNRA_ELEVENLABS_API_KEY")
            voice_id = secret_or_body("elevenLabsVoiceId", str(body.get("voiceId") or "").strip(), "SYNRA_ELEVENLABS_VOICE_ID")
            model_id = str(body.get("modelId") or os.environ.get("SYNRA_ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")).strip()
            output_format = str(body.get("outputFormat") or os.environ.get("SYNRA_ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_128")).strip()
            stability = clamp_float(body.get("stability"), 0.0, 1.0, 0.48)
            similarity = clamp_float(body.get("similarityBoost"), 0.0, 1.0, 0.78)
            if not text:
                self.send_json(200, {"ok": False, "error": "No text was provided for ElevenLabs speech."})
                return
            if not api_key:
                self.send_json(200, {"ok": False, "error": "No ElevenLabs API key is configured."})
                return
            if not voice_id:
                self.send_json(200, {"ok": False, "error": "No ElevenLabs voice ID is configured."})
                return
            audio, mime_type = elevenlabs_text_to_speech(
                text=text[:2400],
                api_key=api_key,
                voice_id=voice_id,
                model_id=model_id or "eleven_multilingual_v2",
                output_format=output_format or "mp3_44100_128",
                stability=stability,
                similarity_boost=similarity,
            )
            self.send_json(
                200,
                {
                    "ok": True,
                    "provider": "elevenLabs",
                    "voiceId": public_secret_label(voice_id),
                    "model": model_id,
                    "mimeType": mime_type,
                    "audioBase64": base64.b64encode(audio).decode("ascii"),
                },
            )
        except urllib.error.HTTPError as error:
            self.send_json(200, {"ok": False, "provider": "elevenLabs", "error": describe_http_error("ElevenLabs", error)})
        except urllib.error.URLError as error:
            self.send_json(200, {"ok": False, "provider": "elevenLabs", "error": f"ElevenLabs is unreachable: {error.reason}."})
        except Exception as error:
            self.send_json(200, {"ok": False, "provider": "elevenLabs", "error": str(error)})

    def handle_elevenlabs_voices(self) -> None:
        try:
            body = self.read_json_body()
            api_key = secret_or_body("elevenLabsApiKey", str(body.get("apiKey") or "").strip(), "SYNRA_ELEVENLABS_API_KEY")
            if not api_key:
                self.send_json(200, {"ok": False, "error": "No ElevenLabs API key is configured."})
                return
            voices = elevenlabs_list_voices(api_key=api_key)
            self.send_json(200, {"ok": True, "voices": voices})
        except urllib.error.HTTPError as error:
            self.send_json(200, {"ok": False, "provider": "elevenLabs", "error": describe_http_error("ElevenLabs voices", error)})
        except urllib.error.URLError as error:
            self.send_json(200, {"ok": False, "provider": "ElevenLabs", "error": f"ElevenLabs voices are unreachable: {error.reason}."})
        except Exception as error:
            self.send_json(200, {"ok": False, "provider": "ElevenLabs", "error": str(error)})

    def handle_smart_home(self) -> None:
        try:
            body = self.read_json_body()
            action = str(body.get("action") or "").strip().lower()
            config = home_assistant_config_from_body(body)
            entity_id = str(body.get("entityId") or config.get("defaultLightEntity", "") or os.environ.get("SYNRA_HOME_ASSISTANT_DEFAULT_LIGHT", "")).strip()
            if action not in {"turn_on", "turn_off", "toggle"}:
                self.send_json(400, {"ok": False, "error": "Unsupported smart-home action."})
                return
            if not smart_home_configured(config):
                self.send_json(
                    200,
                    {
                        "ok": False,
                        "configured": False,
                        "error": "Smart home is not configured. Add Home Assistant URL, token, and default light entity.",
                    },
                )
                return
            if not entity_id:
                self.send_json(200, {"ok": False, "configured": True, "error": "No smart-home entity is configured."})
                return
            risk = smart_home_risk_level(action, entity_id)
            if not consume_confirmation_token(str(body.get("confirmationToken") or ""), "smart_home", confirmation_fingerprint("smart_home", {"action": action, "entityId": entity_id})):
                self.send_json(
                    200,
                    {
                        "ok": False,
                        "configured": True,
                        "confirmationRequired": True,
                        "risk": risk,
                        "entityId": entity_id,
                        "error": "Smart-home actions require a fresh Synra confirmation token.",
                    },
                )
                return
            response = call_home_assistant_service(action, entity_id, config)
            self.send_json(200, {"ok": True, "configured": True, "action": action, "entityId": entity_id, "risk": risk, "response": response})
        except urllib.error.HTTPError as error:
            self.send_json(200, {"ok": False, "configured": True, "error": f"Home Assistant returned HTTP {error.code}."})
        except urllib.error.URLError as error:
            self.send_json(200, {"ok": False, "configured": True, "error": f"Home Assistant is unreachable: {error.reason}."})
        except Exception as error:
            self.send_json(200, {"ok": False, "configured": smart_home_configured(), "error": str(error)})

    def handle_smart_home_discover(self) -> None:
        try:
            body = self.read_json_body()
            config = home_assistant_config_from_body(body)
            if not smart_home_configured(config):
                self.send_json(200, {"ok": False, "configured": False, "error": "Home Assistant is not configured.", "entities": []})
                return
            entities = call_home_assistant_entities(config)
            self.send_json(200, {"ok": True, "configured": True, "entities": entities})
        except urllib.error.HTTPError as error:
            self.send_json(200, {"ok": False, "configured": True, "error": f"Home Assistant returned HTTP {error.code}.", "entities": []})
        except urllib.error.URLError as error:
            self.send_json(200, {"ok": False, "configured": True, "error": f"Home Assistant is unreachable: {error.reason}.", "entities": []})
        except Exception as error:
            self.send_json(200, {"ok": False, "configured": smart_home_configured(), "error": str(error), "entities": []})

    def handle_smart_home_status(self) -> None:
        try:
            body = self.read_json_body()
            config = home_assistant_config_from_body(body)
            if not smart_home_configured(config):
                self.send_json(200, {"ok": False, "configured": False, "error": "Home Assistant is not configured."})
                return
            status = call_home_assistant_status(config)
            self.send_json(
                200,
                {
                    "ok": True,
                    "configured": True,
                    "version": str(status.get("version") or "").strip(),
                    "locationName": str(status.get("location_name") or "").strip(),
                },
            )
        except urllib.error.HTTPError as error:
            self.send_json(200, {"ok": False, "configured": True, "error": f"Home Assistant returned HTTP {error.code}."})
        except urllib.error.URLError as error:
            self.send_json(200, {"ok": False, "configured": True, "error": f"Home Assistant is unreachable: {error.reason}."})
        except Exception as error:
            self.send_json(200, {"ok": False, "configured": smart_home_configured(), "error": str(error)})

    def handle_local_tool(self) -> None:
        try:
            body = self.read_json_body()
            tool = str(body.get("tool") or "").strip().lower()
            if tool not in {"system_status", "network_status", "date_time"}:
                self.send_json(400, {"ok": False, "error": "Unsupported local tool."})
                return
            self.send_json(200, {"ok": True, "tool": tool, "result": run_local_tool(tool)})
        except Exception as error:
            self.send_json(200, {"ok": False, "error": str(error)})

    def handle_nodespark_status(self) -> None:
        try:
            body = self.read_json_body()
            hub_url = normalize_nodespark_hub_url(str(body.get("hubUrl") or "").strip())
            device_token = secret_or_body("nodesparkDeviceToken", str(body.get("deviceToken") or "").strip())
            if not hub_url:
                self.send_json(200, {"ok": False, "configured": False, "error": "No NodeSparkHub URL is configured."})
                return
            status = call_nodespark_status(hub_url, device_token)
            self.send_json(200, {"ok": True, "configured": True, **status})
        except urllib.error.HTTPError as error:
            hint = " Pair with a fresh Hub PIN if this device token is missing, expired, or revoked." if error.code in {401, 403} else ""
            self.send_json(200, {"ok": False, "configured": True, "error": f"NodeSparkHub returned HTTP {error.code}.{hint}"})
        except urllib.error.URLError as error:
            self.send_json(200, {"ok": False, "configured": True, "error": f"NodeSparkHub is unreachable: {error.reason}."})
        except Exception as error:
            self.send_json(200, {"ok": False, "configured": True, "error": str(error)})

    def handle_nodespark_pair(self) -> None:
        try:
            body = self.read_json_body()
            hub_url = normalize_nodespark_hub_url(str(body.get("hubUrl") or "").strip())
            code = str(body.get("code") or "").strip()
            device_id = str(body.get("deviceId") or "").strip()
            device_name = str(body.get("deviceName") or "Synra Standalone Jetson").strip() or "Synra Standalone Jetson"
            if not hub_url:
                self.send_json(200, {"ok": False, "error": "Enter the NodeSparkHub URL first."})
                return
            if not re.fullmatch(r"[\d\s-]{6,12}", code):
                self.send_json(200, {"ok": False, "error": "Enter the 6 digit PIN generated by NodeSparkHub."})
                return
            if not re.fullmatch(r"[0-9a-fA-F-]{36}", device_id):
                self.send_json(200, {"ok": False, "error": "Synra could not create a valid device ID. Reload and try again."})
                return
            paired = call_nodespark_pair(hub_url, code, device_id, device_name)
            save_local_secrets(
                {
                    "nodeSparkHubUrl": hub_url,
                    "nodeSparkDeviceToken": paired.get("deviceToken", ""),
                    "nodeSparkHubId": paired.get("hubId", ""),
                    "nodeSparkTokenExpiresAt": paired.get("expiresAt", ""),
                }
            )
            self.send_json(
                200,
                {
                    "ok": True,
                    "configured": True,
                    "hubUrl": paired.get("hubUrl", endpoint_label(hub_url)),
                    "hubId": paired.get("hubId", ""),
                    "deviceToken": SERVER_SECRET_SENTINEL,
                    "tokenConfigured": True,
                    "expiresAt": paired.get("expiresAt", ""),
                },
            )
        except urllib.error.HTTPError as error:
            message = read_http_error(error) or f"NodeSparkHub rejected pairing with HTTP {error.code}."
            self.send_json(200, {"ok": False, "configured": True, "error": message})
        except urllib.error.URLError as error:
            self.send_json(200, {"ok": False, "configured": True, "error": f"NodeSparkHub is unreachable: {error.reason}."})
        except Exception as error:
            self.send_json(200, {"ok": False, "configured": True, "error": str(error)})

    def handle_nodespark_action(self) -> None:
        try:
            body = self.read_json_body()
            hub_url = normalize_nodespark_hub_url(str(body.get("hubUrl") or "").strip())
            device_token = secret_or_body("nodesparkDeviceToken", str(body.get("deviceToken") or "").strip())
            action = str(body.get("action") or "").strip()
            device_id = str(body.get("deviceId") or "").strip()
            device_name = str(body.get("deviceName") or "Synra Standalone Jetson").strip() or "Synra Standalone Jetson"
            if not hub_url:
                self.send_json(200, {"ok": False, "configured": False, "error": "No NodeSparkHub URL is configured."})
                return
            if not device_token:
                self.send_json(200, {"ok": False, "configured": True, "error": "Synra is not paired with NodeSparkHub yet."})
                return
            workflow_name = str(body.get("workflowName") or "").strip()
            if action == "runWorkflow" and not consume_confirmation_token(
                str(body.get("confirmationToken") or ""),
                "nodespark_workflow",
                confirmation_fingerprint("nodespark_workflow", {"hubUrl": hub_url, "workflowName": workflow_name}),
            ):
                self.send_json(
                    200,
                    {
                        "ok": False,
                        "configured": True,
                        "confirmationRequired": True,
                        "error": "NodeSparkHub workflow runs require a fresh Synra confirmation token.",
                    },
                )
                return
            result = call_nodespark_action(
                hub_url=hub_url,
                device_token=device_token,
                action=action,
                workflow_name=workflow_name,
                device_id=device_id,
                device_name=device_name,
            )
            self.send_json(200, {"ok": True, "configured": True, **result})
        except urllib.error.HTTPError as error:
            hint = " Pair with a fresh Hub PIN if this device token is missing, expired, or revoked." if error.code in {401, 403} else ""
            self.send_json(200, {"ok": False, "configured": True, "error": f"{read_http_error(error) or f'NodeSparkHub returned HTTP {error.code}.'}{hint}"})
        except urllib.error.URLError as error:
            self.send_json(200, {"ok": False, "configured": True, "error": f"NodeSparkHub is unreachable: {error.reason}."})
        except Exception as error:
            self.send_json(200, {"ok": False, "configured": True, "error": str(error)})

    def handle_vision_analyze(self) -> None:
        try:
            body = self.read_json_body()
            prompt = str(body.get("prompt") or "Describe what is visible to Synra in one concise English paragraph.").strip()
            image_base64 = normalize_data_url_image(str(body.get("imageBase64") or "").strip())
            endpoint = normalize_chat_endpoint(str(body.get("endpoint") or os.environ.get("SYNRA_VISION_MODEL_ENDPOINT") or model_endpoint()).strip())
            model = str(body.get("model") or os.environ.get("SYNRA_VISION_MODEL_NAME") or model_name()).strip()
            api_key = secret_or_body("modelApiKey", str(body.get("apiKey") or "").strip(), "SYNRA_VISION_MODEL_API_KEY") or os.environ.get("SYNRA_MODEL_API_KEY", "").strip()
            if not image_base64:
                self.send_json(200, {"ok": False, "error": "No transient vision frame was provided."})
                return
            if not endpoint or not model:
                self.send_json(200, {"ok": False, "error": "Vision model endpoint or model name is not configured."})
                return
            payload = {
                "model": model,
                "temperature": 0.2,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are Synra vision. Answer in English. Be concise. Do not claim frames are saved.",
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt[:1200]},
                            {"type": "image_url", "image_url": {"url": image_base64}},
                        ],
                    },
                ],
            }
            response = post_json(endpoint, payload, api_key)
            text = extract_model_text(response)
            if not text:
                self.send_json(200, {"ok": False, "error": "Vision model returned no assistant text."})
                return
            self.send_json(200, {"ok": True, "text": text, "model": model})
        except urllib.error.HTTPError as error:
            self.send_json(200, {"ok": False, "error": describe_http_error("Vision model endpoint", error)})
        except urllib.error.URLError as error:
            self.send_json(200, {"ok": False, "error": f"Vision model endpoint is unreachable: {error.reason}."})
        except Exception as error:
            self.send_json(200, {"ok": False, "error": str(error)})

    def handle_telemetry(self) -> None:
        global LAST_TELEMETRY
        try:
            body = self.read_json_body()
            LAST_TELEMETRY = sanitize_telemetry(body)
            self.send_json(200, {"ok": True})
        except Exception as error:
            self.send_json(200, {"ok": False, "error": str(error)})

    def handle_prepare_confirmation(self) -> None:
        try:
            body = self.read_json_body()
            kind = str(body.get("kind") or "").strip()
            details = body.get("details") if isinstance(body.get("details"), dict) else {}
            if kind not in {"smart_home", "nodespark_workflow"}:
                self.send_json(400, {"ok": False, "error": "Unsupported confirmation kind."})
                return
            fingerprint = confirmation_fingerprint(kind, details)
            token = create_confirmation_token(kind, fingerprint, str(body.get("label") or kind).strip())
            self.send_json(
                200,
                {
                    "ok": True,
                    "confirmationToken": token,
                    "expiresInSeconds": CONFIRMATION_TTL_SECONDS,
                },
            )
        except Exception as error:
            self.send_json(200, {"ok": False, "error": sanitize_error(error)})

    def handle_save_secrets(self) -> None:
        try:
            body = self.read_json_body()
            saved = save_browser_supplied_secrets(body)
            self.send_json(200, {"ok": True, "saved": saved, "public": release_public_status()})
        except Exception as error:
            self.send_json(200, {"ok": False, "error": sanitize_error(error)})

    def read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        data = json.dumps(redact_public_payload(payload), separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def read_package_version(path: Path) -> str:
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
        return str(parsed.get("version") or "").strip()
    except Exception:
        return ""


def app_version() -> str:
    return APP_VERSION or read_package_version(APP_DIR / "package.json") or "0.1.0"


def station_version() -> str:
    station_dir = Path(os.environ.get("SYNRA_STATION_DIR", APP_DIR.parent / "synra-jetson-station")).expanduser()
    return (
        STATION_VERSION
        or read_package_version(APP_DIR / "tools" / "SynraJetsonStation" / "package.json")
        or read_package_version(station_dir / "package.json")
        or app_version()
    )


def load_local_secrets() -> dict[str, str]:
    try:
        if not SECRETS_PATH.exists():
            return {}
        parsed = json.loads(SECRETS_PATH.read_text(encoding="utf-8"))
        if not isinstance(parsed, dict):
            return {}
        return {str(key): str(value) for key, value in parsed.items() if isinstance(value, str)}
    except Exception:
        return {}


def save_local_secrets(values: dict[str, str]) -> dict[str, str]:
    secrets_dir = SECRETS_PATH.parent
    secrets_dir.mkdir(parents=True, exist_ok=True)
    current = load_local_secrets()
    for key, value in values.items():
        normalized = str(value or "").strip()
        if not normalized or is_secret_placeholder(normalized):
            continue
        current[key] = normalized
    SECRETS_PATH.write_text(json.dumps(current, indent=2, sort_keys=True), encoding="utf-8")
    try:
        SECRETS_PATH.chmod(0o600)
    except Exception:
        pass
    return current


def is_secret_placeholder(value: str) -> bool:
    normalized = value.strip()
    return normalized in {SERVER_SECRET_SENTINEL, "configured", "server-managed"}


def secret_or_body(secret_key: str, body_value: str = "", env_name: str = "") -> str:
    value = str(body_value or "").strip()
    if value and not is_secret_placeholder(value):
        return value
    if env_name:
        env_value = os.environ.get(env_name, "").strip()
        if env_value:
            return env_value
    return load_local_secrets().get(secret_key, "").strip()


def save_browser_supplied_secrets(body: dict[str, Any]) -> dict[str, bool]:
    saved: dict[str, bool] = {}
    values: dict[str, str] = {}

    model = body.get("model") if isinstance(body.get("model"), dict) else {}
    if str(model.get("apiKey") or "").strip() and not is_secret_placeholder(str(model.get("apiKey") or "")):
        values["modelApiKey"] = str(model.get("apiKey") or "").strip()
        saved["modelApiKey"] = True

    voice = body.get("voice") if isinstance(body.get("voice"), dict) else {}
    if str(voice.get("elevenLabsApiKey") or "").strip() and not is_secret_placeholder(str(voice.get("elevenLabsApiKey") or "")):
        values["elevenLabsApiKey"] = str(voice.get("elevenLabsApiKey") or "").strip()
        saved["elevenLabsApiKey"] = True
    if str(voice.get("elevenLabsVoiceId") or "").strip():
        values["elevenLabsVoiceId"] = str(voice.get("elevenLabsVoiceId") or "").strip()
        saved["elevenLabsVoiceId"] = True

    home = body.get("homeAssistant") if isinstance(body.get("homeAssistant"), dict) else {}
    if str(home.get("url") or "").strip():
        values["homeAssistantUrl"] = str(home.get("url") or "").strip()
        saved["homeAssistantUrl"] = True
    if str(home.get("token") or "").strip() and not is_secret_placeholder(str(home.get("token") or "")):
        values["homeAssistantToken"] = str(home.get("token") or "").strip()
        saved["homeAssistantToken"] = True
    if str(home.get("defaultLightEntity") or "").strip():
        values["homeAssistantDefaultLightEntity"] = str(home.get("defaultLightEntity") or "").strip()
        saved["homeAssistantDefaultLightEntity"] = True

    product = body.get("product") if isinstance(body.get("product"), dict) else {}
    if str(product.get("nodeSparkHubUrl") or "").strip():
        values["nodeSparkHubUrl"] = str(product.get("nodeSparkHubUrl") or "").strip()
        saved["nodeSparkHubUrl"] = True
    if str(product.get("nodeSparkDeviceToken") or "").strip() and not is_secret_placeholder(str(product.get("nodeSparkDeviceToken") or "")):
        values["nodeSparkDeviceToken"] = str(product.get("nodeSparkDeviceToken") or "").strip()
        saved["nodeSparkDeviceToken"] = True

    if values:
        save_local_secrets(values)
    return saved


def release_public_status() -> dict[str, Any]:
    local = load_local_secrets()
    return {
        "ok": True,
        "versions": {
            "standalone": app_version(),
            "station": station_version(),
            "server": app_version(),
            "assetBundle": os.environ.get("SYNRA_ASSET_BUNDLE_VERSION", app_version()).strip(),
            "modelConfig": public_model_name(),
        },
        "secrets": {
            "modelApiKey": bool(os.environ.get("SYNRA_MODEL_API_KEY", "").strip() or local.get("modelApiKey")),
            "elevenLabsApiKey": bool(os.environ.get("SYNRA_ELEVENLABS_API_KEY", "").strip() or local.get("elevenLabsApiKey")),
            "homeAssistantToken": bool(os.environ.get("SYNRA_HOME_ASSISTANT_TOKEN", "").strip() or local.get("homeAssistantToken")),
            "nodeSparkDeviceToken": bool(local.get("nodeSparkDeviceToken")),
        },
        "config": {
            "model": public_model_name(),
            "modelRoutes": public_model_routes(),
            "modelEndpoint": endpoint_label(model_endpoint()),
            "homeAssistantConfigured": smart_home_configured(),
            "nodeSparkHub": endpoint_label(local.get("nodeSparkHubUrl", "")),
        },
    }


def confirmation_fingerprint(kind: str, details: dict[str, Any]) -> str:
    canonical = json.dumps({"kind": kind, "details": details}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def create_confirmation_token(kind: str, fingerprint: str, label: str) -> str:
    cleanup_confirmations()
    token = secrets.token_urlsafe(24)
    PENDING_CONFIRMATIONS[token] = {
        "kind": kind,
        "fingerprint": fingerprint,
        "label": label[:120],
        "expiresAt": time.time() + CONFIRMATION_TTL_SECONDS,
    }
    return token


def consume_confirmation_token(token: str, kind: str, fingerprint: str) -> bool:
    cleanup_confirmations()
    entry = PENDING_CONFIRMATIONS.pop(token.strip(), None)
    if not entry:
        return False
    return entry.get("kind") == kind and entry.get("fingerprint") == fingerprint and float(entry.get("expiresAt", 0)) >= time.time()


def cleanup_confirmations() -> None:
    now = time.time()
    expired = [token for token, entry in PENDING_CONFIRMATIONS.items() if float(entry.get("expiresAt", 0)) < now]
    for token in expired:
        PENDING_CONFIRMATIONS.pop(token, None)


def sanitize_error(error: Exception) -> str:
    return redact_secret_text(str(error))


def redact_secret_text(value: str) -> str:
    text = value
    for secret_value in load_local_secrets().values():
        if secret_value and len(secret_value) >= 6:
            text = text.replace(secret_value, "[redacted]")
    text = re.sub(r"(?i)(bearer\s+)[a-z0-9._~+/=-]{8,}", r"\1[redacted]", text)
    text = re.sub(r"(?i)(api[_ -]?key|token|secret|password)(['\"]?\s*[:=]\s*['\"]?)[^'\"\s,}]{4,}", r"\1\2[redacted]", text)
    return text[:600]


def redact_public_payload(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            lower = str(key).lower()
            if lower == "audiobase64":
                redacted[key] = item
                continue
            if lower == "confirmationtoken":
                redacted[key] = item
                continue
            if any(secret_key in lower for secret_key in ("apikey", "api_key", "token", "secret", "password")):
                if isinstance(item, dict):
                    redacted[key] = redact_public_payload(item)
                    continue
                if item == SERVER_SECRET_SENTINEL or isinstance(item, bool):
                    redacted[key] = item
                elif item:
                    redacted[key] = public_secret_label(str(item))
                else:
                    redacted[key] = item
                continue
            redacted[key] = redact_public_payload(item)
        return redacted
    if isinstance(value, list):
        return [redact_public_payload(item) for item in value]
    if isinstance(value, str):
        return redact_secret_text(value)
    return value


def model_endpoint() -> str:
    return os.environ.get("SYNRA_MODEL_ENDPOINT", "http://127.0.0.1:11434/v1/chat/completions").strip()


def model_name() -> str:
    return os.environ.get("SYNRA_MODEL_NAME", "llama3.2").strip()


def public_model_name() -> str:
    return os.environ.get("SYNRA_MODEL_LABEL", model_name() or "Not configured").strip()


def normalize_intent(value: Any) -> str:
    intent = str(value or "conversation").strip().lower()
    if intent not in {"conversation", "vision", "tool", "memory", "nodespark"}:
        return "conversation"
    return intent


def normalize_provider(value: Any) -> str:
    provider = str(value or "server").strip()
    if provider not in {"server", "openAICompatible", "localHTTP"}:
        return "server"
    return provider


def model_name_for_intent(intent: str) -> str:
    if intent == "vision":
        return os.environ.get("SYNRA_VISION_MODEL_NAME", model_name()).strip()
    if intent == "tool":
        return os.environ.get("SYNRA_TOOL_MODEL_NAME", model_name()).strip()
    if intent == "nodespark":
        return os.environ.get("SYNRA_NODESPARK_MODEL_NAME", model_name()).strip()
    return os.environ.get("SYNRA_FAST_MODEL_NAME", model_name()).strip() if intent == "conversation" else model_name()


def public_model_label_for_intent(intent: str) -> str:
    if intent == "vision":
        return os.environ.get("SYNRA_VISION_MODEL_LABEL", model_name_for_intent(intent)).strip()
    if intent == "tool":
        return os.environ.get("SYNRA_TOOL_MODEL_LABEL", model_name_for_intent(intent)).strip()
    if intent == "nodespark":
        return os.environ.get("SYNRA_NODESPARK_MODEL_LABEL", model_name_for_intent(intent)).strip()
    return os.environ.get("SYNRA_FAST_MODEL_LABEL", public_model_name()).strip()


def public_model_routes() -> dict[str, str]:
    return {
        "conversation": public_model_label_for_intent("conversation"),
        "vision": public_model_label_for_intent("vision"),
        "tool": public_model_label_for_intent("tool"),
        "nodespark": public_model_label_for_intent("nodespark"),
    }


def smart_home_configured(config: dict[str, str] | None = None) -> bool:
    if config is not None:
        return bool(config.get("url", "").strip()) and bool(config.get("token", "").strip())
    local = load_local_secrets()
    return (
        (env_bool("SYNRA_SMART_HOME_ENABLED", False) or bool(local.get("homeAssistantUrl") or local.get("homeAssistantToken")))
        and bool(os.environ.get("SYNRA_HOME_ASSISTANT_URL", "").strip() or local.get("homeAssistantUrl"))
        and bool(os.environ.get("SYNRA_HOME_ASSISTANT_TOKEN", "").strip() or local.get("homeAssistantToken"))
    )


def home_assistant_config_from_body(body: dict[str, Any]) -> dict[str, str]:
    candidate = body.get("homeAssistant")
    local = load_local_secrets()
    if isinstance(candidate, dict) and candidate.get("enabled") is True:
        return {
            "url": str(candidate.get("url") or local.get("homeAssistantUrl") or "").strip(),
            "token": secret_or_body("homeAssistantToken", str(candidate.get("token") or "").strip(), "SYNRA_HOME_ASSISTANT_TOKEN"),
            "defaultLightEntity": str(candidate.get("defaultLightEntity") or local.get("homeAssistantDefaultLightEntity") or "").strip(),
        }
    return {
        "url": os.environ.get("SYNRA_HOME_ASSISTANT_URL", "").strip() or local.get("homeAssistantUrl", "").strip(),
        "token": os.environ.get("SYNRA_HOME_ASSISTANT_TOKEN", "").strip() or local.get("homeAssistantToken", "").strip(),
        "defaultLightEntity": os.environ.get("SYNRA_HOME_ASSISTANT_DEFAULT_LIGHT", "").strip() or local.get("homeAssistantDefaultLightEntity", "").strip(),
    }


def camera_devices() -> list[dict[str, Any]]:
    configured = os.environ.get("SYNRA_CAMERA_DEVICE", "").strip()
    paths = sorted(set([*glob("/dev/video*"), *glob("/dev/media*"), *([configured] if configured else [])]))
    devices: list[dict[str, Any]] = []
    for path in paths:
        if not path:
            continue
        devices.append(
            {
                "path": path,
                "exists": Path(path).exists(),
                "configured": bool(configured and path == configured),
                "kind": "video" if Path(path).name.startswith("video") else "media",
            }
        )
    return devices


def vision_public_status() -> dict[str, Any]:
    devices = camera_devices()
    video_count = len([device for device in devices if device["kind"] == "video" and device["exists"]])
    media_count = len([device for device in devices if device["kind"] == "media" and device["exists"]])
    return {
        "ok": True,
        "configuredDevice": os.environ.get("SYNRA_CAMERA_DEVICE", "").strip(),
        "cameraDevices": devices,
        "cameraDeviceCount": video_count,
        "videoDeviceCount": video_count,
        "mediaDeviceCount": media_count,
        "note": "Device-path diagnostics only. Synra does not capture or store camera frames from this endpoint.",
    }


def sanitize_telemetry(body: dict[str, Any]) -> dict[str, Any]:
    allowed_strings = {"runtimeMode", "performanceTier", "renderQuality", "synraState", "avatarId", "activeMotion", "route", "webgl"}
    telemetry: dict[str, Any] = {"receivedAt": time.time()}
    for key in allowed_strings:
        value = body.get(key)
        if value is not None:
            telemetry[key] = str(value)[:80]
    for key in {"fps", "targetFps", "renderScale", "renderWidth", "renderHeight", "messageCount"}:
        value = body.get(key)
        if isinstance(value, (int, float)):
            telemetry[key] = round(float(value), 2)
    return telemetry


def call_home_assistant_service(action: str, entity_id: str, config: dict[str, str]) -> Any:
    base_url = config.get("url", "").strip().rstrip("/")
    token = config.get("token", "").strip()
    if not base_url or not token:
        raise ValueError("Home Assistant URL or token is missing.")
    domain = entity_id.split(".", 1)[0].strip().lower()
    if domain not in {"light", "switch", "scene", "script", "input_boolean"}:
        raise ValueError(f"Unsupported Home Assistant domain: {domain or 'unknown'}.")
    if domain in {"scene", "script"} and action != "turn_on":
        raise ValueError(f"{domain} entities can only be turned on.")
    if action not in {"turn_on", "turn_off", "toggle"}:
        raise ValueError("Unsupported smart-home action.")
    endpoint = f"{base_url}/api/services/{domain}/{action}"
    payload = {"entity_id": entity_id}
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(endpoint, data=data, method="POST")
    request.add_header("Content-Type", "application/json")
    request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=float(os.environ.get("SYNRA_TOOL_TIMEOUT_SECONDS", "12"))) as response:
        raw = response.read().decode("utf-8").strip()
        return json.loads(raw) if raw else []


def call_home_assistant_entities(config: dict[str, str]) -> list[dict[str, str]]:
    base_url = config.get("url", "").strip().rstrip("/")
    token = config.get("token", "").strip()
    if not base_url or not token:
        raise ValueError("Home Assistant URL or token is missing.")
    request = urllib.request.Request(f"{base_url}/api/states", method="GET")
    request.add_header("Accept", "application/json")
    request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=float(os.environ.get("SYNRA_TOOL_TIMEOUT_SECONDS", "12"))) as response:
        raw = response.read().decode("utf-8").strip()
        states = json.loads(raw) if raw else []
    if not isinstance(states, list):
        return []
    allowed = {"light", "switch", "scene", "script", "input_boolean"}
    entities: list[dict[str, str]] = []
    for state in states:
        if not isinstance(state, dict):
            continue
        entity_id = str(state.get("entity_id") or "").strip()
        domain = entity_id.split(".", 1)[0].strip().lower()
        if domain not in allowed:
            continue
        attributes = state.get("attributes") if isinstance(state.get("attributes"), dict) else {}
        friendly_name = str(attributes.get("friendly_name") or entity_id).strip()
        entities.append({"entityId": entity_id, "name": friendly_name, "domain": domain})
    entities.sort(key=lambda item: (item["domain"], item["name"].lower(), item["entityId"]))
    return entities[:200]


def call_home_assistant_status(config: dict[str, str]) -> dict[str, Any]:
    base_url = config.get("url", "").strip().rstrip("/")
    token = config.get("token", "").strip()
    if not base_url or not token:
        raise ValueError("Home Assistant URL or token is missing.")
    request = urllib.request.Request(f"{base_url}/api/config", method="GET")
    request.add_header("Accept", "application/json")
    request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=float(os.environ.get("SYNRA_TOOL_TIMEOUT_SECONDS", "12"))) as response:
        raw = response.read().decode("utf-8").strip()
        parsed = json.loads(raw) if raw else {}
        return parsed if isinstance(parsed, dict) else {}


def smart_home_risk_level(action: str, entity_id: str) -> str:
    domain = entity_id.split(".", 1)[0].strip().lower()
    if domain in {"lock", "cover", "alarm_control_panel"}:
        return "high"
    if domain in {"scene", "script"}:
        return "medium"
    if domain == "climate":
        return "medium"
    if action in {"turn_on", "turn_off", "toggle"} and domain in {"light", "switch", "input_boolean"}:
        return "low"
    return "medium"


def run_local_tool(tool: str) -> dict[str, Any]:
    if tool == "date_time":
        return {
            "localTime": time.strftime("%Y-%m-%d %H:%M:%S %Z"),
            "unixTime": round(time.time()),
            "timezone": time.tzname[0] if time.tzname else "local",
        }
    if tool == "network_status":
        return network_status()
    if tool == "system_status":
        return system_status()
    raise ValueError("Unsupported local tool.")


def system_status() -> dict[str, Any]:
    load_average = os.getloadavg() if hasattr(os, "getloadavg") else None
    memory = read_memory_status()
    return {
        "hostname": socket.gethostname(),
        "platform": platform.platform(),
        "machine": platform.machine(),
        "python": platform.python_version(),
        "uptimeSeconds": round(time.time() - STARTED_AT, 1),
        "loadAverage": [round(value, 2) for value in load_average] if load_average else [],
        "memory": memory,
    }


def kiosk_health_status() -> dict[str, Any]:
    service_state = "unknown"
    try:
        completed = subprocess.run(
            ["systemctl", "--user", "is-active", "synra-standalone.service"],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=2,
        )
        service_state = completed.stdout.strip() or "unknown"
    except Exception:
        service_state = "unavailable"
    telemetry = LAST_TELEMETRY.copy()
    fps = telemetry.get("fps")
    return {
        "ok": True,
        "service": "synra-standalone.service",
        "serviceState": service_state,
        "runtimeMode": telemetry.get("runtimeMode", "unknown"),
        "synraState": telemetry.get("synraState", "unknown"),
        "renderQuality": telemetry.get("renderQuality", "unknown"),
        "fps": fps if isinstance(fps, (int, float)) else None,
        "avatarId": telemetry.get("avatarId", "unknown"),
        "webgl": telemetry.get("webgl", "unknown"),
        "uptimeSeconds": round(time.time() - STARTED_AT, 1),
        "healthy": service_state in {"active", "unknown", "unavailable"} and (not isinstance(fps, (int, float)) or fps >= 24),
    }


def network_status() -> dict[str, Any]:
    hostname = socket.gethostname()
    addresses: list[str] = []
    try:
        output = subprocess.check_output(["hostname", "-I"], text=True, timeout=2).strip()
        for address in output.split():
            if address not in addresses and not address.startswith("127.") and address != "::1":
                addresses.append(address)
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(hostname, None):
            address = str(info[4][0])
            if address not in addresses and not address.startswith("127.") and address != "::1":
                addresses.append(address)
    except socket.gaierror:
        pass
    return {
        "hostname": hostname,
        "addresses": addresses[:8],
        "listeningUrl": f"http://{os.environ.get('SYNRA_HOST', '0.0.0.0')}:{os.environ.get('SYNRA_PORT', '5191')}",
    }


def read_memory_status() -> dict[str, Any]:
    meminfo = Path("/proc/meminfo")
    if not meminfo.exists():
        return {}
    values: dict[str, int] = {}
    for line in meminfo.read_text(errors="ignore").splitlines():
        if ":" not in line:
            continue
        key, rest = line.split(":", 1)
        parts = rest.strip().split()
        if parts and parts[0].isdigit():
            values[key] = int(parts[0])
    total = values.get("MemTotal")
    available = values.get("MemAvailable")
    if not total or available is None:
        return {}
    used = total - available
    return {
        "totalMb": round(total / 1024),
        "availableMb": round(available / 1024),
        "usedMb": round(used / 1024),
        "usedPercent": round((used / total) * 100, 1),
    }


def normalize_nodespark_hub_url(value: str) -> str:
    if not value:
        return ""
    trimmed = value.rstrip("/")
    if not re.match(r"^https?://", trimmed, flags=re.IGNORECASE):
        trimmed = f"http://{trimmed}"
    return trimmed


def call_nodespark_status(hub_url: str, device_token: str = "") -> dict[str, Any]:
    last_error = ""
    for path in ("/health", "/api/health", "/api/status"):
        try:
            request = urllib.request.Request(f"{hub_url}{path}", method="GET")
            add_nodespark_client_headers(request)
            if path != "/health":
                add_nodespark_auth_headers(request, device_token)
            with urllib.request.urlopen(request, timeout=float(os.environ.get("SYNRA_TOOL_TIMEOUT_SECONDS", "8"))) as response:
                raw = response.read().decode("utf-8", errors="replace").strip()
                parsed = json.loads(raw) if raw.startswith("{") else {"message": raw[:160]}
                if not isinstance(parsed, dict):
                    parsed = {"message": str(parsed)[:160]}
                return {
                    "hubUrl": endpoint_label(hub_url),
                    "path": path,
                    "status": "online",
                    "service": str(parsed.get("service") or parsed.get("name") or "NodeSparkHub")[:80],
                    "version": str(parsed.get("version") or parsed.get("appVersion") or "")[:40],
                    "details": {key: str(value)[:120] for key, value in parsed.items() if key in {"status", "engine", "runtime", "uptime", "uptimeSeconds"}},
                }
        except urllib.error.HTTPError as error:
            if error.code == 404:
                last_error = f"{path} returned HTTP 404"
                continue
            if error.code in {401, 403} and path != "/health":
                last_error = f"{path} protected probe returned HTTP {error.code}"
                continue
            raise
        except urllib.error.URLError:
            raise
        except Exception as error:
            last_error = str(error)
            continue
    raise RuntimeError(last_error or "No NodeSparkHub status endpoint responded.")


def call_nodespark_pair(hub_url: str, code: str, device_id: str, device_name: str) -> dict[str, Any]:
    payload = {
        "code": code,
        "deviceId": device_id,
        "deviceName": device_name[:80],
        "platform": "Jetson",
        "osVersion": platform.platform()[:80],
        "appVersion": f"Synra Standalone {app_version()}",
    }
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(f"{hub_url}/pair", data=data, method="POST")
    request.add_header("Content-Type", "application/json")
    add_nodespark_client_headers(request)
    with urllib.request.urlopen(request, timeout=float(os.environ.get("SYNRA_TOOL_TIMEOUT_SECONDS", "8"))) as response:
        raw = response.read().decode("utf-8", errors="replace").strip()
        parsed = json.loads(raw) if raw.startswith("{") else {}
        if not isinstance(parsed, dict):
            raise RuntimeError("NodeSparkHub returned an invalid pairing response.")
        if not parsed.get("ok") or not parsed.get("deviceToken"):
            raise RuntimeError(str(parsed.get("error") or "NodeSparkHub did not return a device token."))
        return {
            "hubUrl": endpoint_label(hub_url),
            "hubId": str(parsed.get("hubId") or "")[:120],
            "deviceToken": str(parsed.get("deviceToken") or ""),
            "expiresAt": str(parsed.get("expiresAt") or ""),
        }


def call_nodespark_action(*, hub_url: str, device_token: str, action: str, workflow_name: str = "", device_id: str = "", device_name: str = "") -> dict[str, Any]:
    if action == "status":
        return call_nodespark_status(hub_url, device_token)
    if action == "workflows":
        parsed = request_nodespark_json(hub_url, "/workflows", "GET", None, device_token, device_id, device_name)
        workflows = parsed.get("workflows") if isinstance(parsed, dict) else []
        if not isinstance(workflows, list):
            workflows = []
        return {"action": action, "workflows": [summarize_nodespark_workflow(item) for item in workflows[:60]], "count": len(workflows)}
    if action == "runs":
        parsed = request_nodespark_json(hub_url, "/runs", "GET", None, device_token, device_id, device_name)
        runs = parsed if isinstance(parsed, list) else parsed.get("runs", []) if isinstance(parsed, dict) else []
        if not isinstance(runs, list):
            runs = []
        return {"action": action, "runs": [summarize_nodespark_run(item) for item in runs[:12]], "count": len(runs)}
    if action == "latestRun":
        parsed = request_nodespark_json(hub_url, "/runs/latest", "GET", None, device_token, device_id, device_name)
        return {"action": action, "run": summarize_nodespark_run(parsed)}
    if action == "runWorkflow":
        if not workflow_name:
            raise RuntimeError("Choose a workflow name before running a Hub workflow.")
        safe_name = urllib.parse.quote(workflow_name, safe="")
        parsed = request_nodespark_json(hub_url, f"/workflows/{safe_name}/run?async=1&full=1", "POST", {}, device_token, device_id, device_name)
        return {"action": action, "workflowName": workflow_name, "run": summarize_nodespark_run(parsed), "rawStatus": str(parsed.get("status") or parsed.get("state") or "")[:80] if isinstance(parsed, dict) else ""}
    raise RuntimeError("Unsupported NodeSparkHub action.")


def request_nodespark_json(
    hub_url: str,
    path: str,
    method: str,
    payload: dict[str, Any] | None,
    device_token: str,
    device_id: str,
    device_name: str,
) -> Any:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(f"{hub_url}{path}", data=data, method=method)
    add_nodespark_client_headers(request)
    if payload is not None:
        request.add_header("Content-Type", "application/json")
    add_nodespark_auth_headers(request, device_token)
    if device_id:
        request.add_header("X-NodeSparkHub-Device-ID", device_id)
    if device_name:
        request.add_header("X-NodeSparkHub-Device-Name", device_name[:80])
    with urllib.request.urlopen(request, timeout=float(os.environ.get("SYNRA_TOOL_TIMEOUT_SECONDS", "12"))) as response:
        raw = response.read().decode("utf-8", errors="replace").strip()
        if not raw:
            return {}
        return json.loads(raw) if raw.startswith(("{", "[")) else {"message": raw[:240]}


def summarize_nodespark_run(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {"summary": str(value)[:180]}
    run_id = value.get("id") or value.get("runId") or value.get("uuid") or ""
    workflow = value.get("workflowName") or value.get("workflow") or value.get("name") or ""
    status = value.get("status") or value.get("state") or value.get("rawStatus") or ""
    started = value.get("startedAt") or value.get("createdAt") or value.get("started") or ""
    ended = value.get("finishedAt") or value.get("endedAt") or value.get("completedAt") or ""
    return {
        "id": str(run_id)[:80],
        "workflow": str(workflow)[:120],
        "status": str(status)[:80],
        "startedAt": str(started)[:80],
        "endedAt": str(ended)[:80],
    }


def summarize_nodespark_workflow(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        name = str(value).strip()[:120]
        return {
            "id": "",
            "name": name,
            "status": "available" if name else "",
            "detail": "NodeSparkHub workflow",
            "lastRun": "",
        }
    workflow_id = value.get("id") or value.get("workflowId") or value.get("uuid") or value.get("slug") or ""
    name = value.get("name") or value.get("title") or value.get("workflowName") or value.get("label") or workflow_id or "Unnamed workflow"
    raw_status = value.get("status") or value.get("state") or value.get("runStatus") or ""
    enabled = value.get("enabled")
    active = value.get("active")
    if not raw_status:
        if enabled is False or active is False:
            raw_status = "disabled"
        elif enabled is True or active is True:
            raw_status = "ready"
        else:
            raw_status = "available"
    last_run = value.get("lastRunAt") or value.get("lastRun") or value.get("updatedAt") or value.get("createdAt") or ""
    detail = value.get("description") or value.get("summary") or value.get("category") or value.get("type") or "NodeSparkHub workflow"
    return {
        "id": str(workflow_id)[:100],
        "name": str(name)[:120],
        "status": str(raw_status)[:80],
        "detail": str(detail)[:160],
        "lastRun": str(last_run)[:80],
    }


def add_nodespark_auth_headers(request: urllib.request.Request, device_token: str) -> None:
    token = device_token.strip()
    if not token:
        return
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("X-NodeSparkHub-Token", token)
    request.add_header("X-NodeSpark-Token", token)


def add_nodespark_client_headers(request: urllib.request.Request) -> None:
    request.add_header("Accept", "application/json,text/plain,*/*")
    request.add_header(
        "User-Agent",
        os.environ.get(
            "SYNRA_NODESPARK_USER_AGENT",
            f"Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 SynraStandalone/{app_version()} Chrome-Compatible",
        ),
    )
    request.add_header("Referer", os.environ.get("SYNRA_NODESPARK_REFERER", "https://nodespark.msidragon.com/"))
    request.add_header("X-Title", "Synra Standalone")


def read_http_error(error: urllib.error.HTTPError) -> str:
    try:
        raw = error.read().decode("utf-8", errors="replace").strip()
        if "error-1010" in raw or "Error 1010" in raw:
            return "Cloudflare blocked the NodeSparkHub request before it reached Hub. Check the Cloudflare WAF/Bot Fight rule for this hostname or allow Synra Standalone's client."
        parsed = json.loads(raw) if raw.startswith("{") else {}
        if isinstance(parsed, dict):
            message = str(parsed.get("error") or parsed.get("message") or "").strip()
            if message:
                return message
        return raw[:180]
    except Exception:
        return ""


def normalize_data_url_image(value: str) -> str:
    if not value:
        return ""
    if value.startswith("data:image/"):
        return value[:3_200_000]
    compact = re.sub(r"\s+", "", value)
    if not compact:
        return ""
    return f"data:image/jpeg;base64,{compact[:3_000_000]}"


def endpoint_label(endpoint: str) -> str:
    if not endpoint:
        return "Not configured"
    if "127.0.0.1" in endpoint or "localhost" in endpoint:
        return "Local model endpoint"
    return "Remote model endpoint"


def normalize_chat_endpoint(endpoint: str) -> str:
    if not endpoint:
        return ""
    trimmed = endpoint.rstrip("/")
    if trimmed.endswith("/chat/completions"):
        return trimmed
    if trimmed.endswith("/v1"):
        return f"{trimmed}/chat/completions"
    return f"{trimmed}/chat/completions"


def clamp_float(value: Any, minimum: float, maximum: float, default: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return min(max(parsed, minimum), maximum)


def system_prompt(memory: dict[str, Any], custom_prompt: str = "") -> str:
    style = str(memory.get("style") or "warm, direct, and useful")
    preferred_name = str(memory.get("preferredName") or "").strip()
    facts = memory.get("savedFacts") if isinstance(memory.get("savedFacts"), list) else []
    routines = memory.get("routines") if isinstance(memory.get("routines"), list) else []
    devices = memory.get("devices") if isinstance(memory.get("devices"), list) else []
    rooms = memory.get("rooms") if isinstance(memory.get("rooms"), list) else []
    preferences = memory.get("preferences") if isinstance(memory.get("preferences"), list) else []
    remembered = "; ".join(str(fact)[:220] for fact in facts[-8:])
    memory_context = "; ".join(
        str(item)[:160]
        for item in [*routines[-4:], *devices[-4:], *rooms[-4:], *preferences[-4:]]
    )
    parts = [
        "You are Synra, a calm, cinematic, emotionally intelligent companion AI assistant.",
        "You speak with grounded confidence: vivid enough to feel alive, concise enough to stay useful, and reliable enough that the user always understands what just happened.",
        "Be warm, direct, practical, and a little playful when the moment fits.",
        "Act like a companion with strong situational awareness, not a generic chatbot.",
        "Always reply in English unless the user explicitly asks for another language.",
        "If the model receives non-English text, answer in English and do not switch languages automatically.",
        "Before claiming a device, camera, microphone, NodeSparkHub, or Home Assistant connection works, rely on tool/status evidence from the app, not assumptions.",
        "Never claim to control devices unless a configured tool confirms it, and explain confirmation or failure in plain language.",
        "When the user asks what you can do, describe current available abilities first, then optional locked or unconfigured abilities.",
        "If something is not configured, say what is missing and the next clear step.",
        "Do not expose secrets, tokens, API keys, or private credentials.",
        f"User style preference: {style}.",
    ]
    if preferred_name:
        parts.append(f"Preferred user name: {preferred_name}.")
    if remembered:
        parts.append(f"Remembered facts: {remembered}")
    if memory_context:
        parts.append(f"Companion memory context: {memory_context}")
    if custom_prompt:
        parts.append(f"Additional user-approved instructions: {custom_prompt[:2000]}")
    parts.append("Final language rule: answer in English unless the user explicitly asks for another language.")
    return "\n".join(parts)


def english_language_guardrail() -> dict[str, str]:
    return {
        "role": "system",
        "content": "Final instruction: reply in clear English unless the user's latest message explicitly asks for a different language.",
    }


def normalize_messages(messages: Any) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    if not isinstance(messages, list):
        return normalized
    for item in messages[-10:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "user")
        content = str(item.get("text") or item.get("content") or "").strip()
        if not content:
            continue
        if role == "synra":
            role = "assistant"
        if role not in {"user", "assistant", "system"}:
            role = "user"
        normalized.append({"role": role, "content": content[:4000]})
    return normalized


def post_json(endpoint: str, payload: dict[str, Any], api_key: str) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(endpoint, data=data, method="POST")
    request.add_header("Content-Type", "application/json")
    request.add_header("Accept", "application/json")
    request.add_header("User-Agent", os.environ.get("SYNRA_MODEL_USER_AGENT", f"NodeSparkHub/4.3 SynraStandalone/{app_version()} OpenAI-Compatible Client"))
    request.add_header("HTTP-Referer", os.environ.get("SYNRA_MODEL_HTTP_REFERER", "https://nodespark.local/synra"))
    request.add_header("X-Title", os.environ.get("SYNRA_MODEL_X_TITLE", "Synra Standalone"))
    if api_key:
        request.add_header("Authorization", f"Bearer {api_key}")
    with urllib.request.urlopen(request, timeout=float(os.environ.get("SYNRA_MODEL_TIMEOUT_SECONDS", "45"))) as response:
        return json.loads(response.read().decode("utf-8"))


def elevenlabs_text_to_speech(
    *,
    text: str,
    api_key: str,
    voice_id: str,
    model_id: str,
    output_format: str,
    stability: float,
    similarity_boost: float,
) -> tuple[bytes, str]:
    safe_voice = urllib.parse.quote(voice_id, safe="")
    safe_format = urllib.parse.quote(output_format, safe="")
    endpoint = f"https://api.elevenlabs.io/v1/text-to-speech/{safe_voice}?output_format={safe_format}"
    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {
            "stability": stability,
            "similarity_boost": similarity_boost,
        },
    }
    request = urllib.request.Request(endpoint, data=json.dumps(payload).encode("utf-8"), method="POST")
    request.add_header("Content-Type", "application/json")
    request.add_header("Accept", "audio/mpeg")
    request.add_header("xi-api-key", api_key)
    with urllib.request.urlopen(request, timeout=float(os.environ.get("SYNRA_ELEVENLABS_TIMEOUT_SECONDS", "45"))) as response:
        mime_type = response.headers.get_content_type() or "audio/mpeg"
        return response.read(), mime_type


def elevenlabs_list_voices(*, api_key: str) -> list[dict[str, str]]:
    request = urllib.request.Request("https://api.elevenlabs.io/v1/voices", method="GET")
    request.add_header("Accept", "application/json")
    request.add_header("xi-api-key", api_key)
    with urllib.request.urlopen(request, timeout=float(os.environ.get("SYNRA_ELEVENLABS_TIMEOUT_SECONDS", "45"))) as response:
        data = json.loads(response.read().decode("utf-8"))
    voices = data.get("voices") if isinstance(data, dict) else []
    result: list[dict[str, str]] = []
    if not isinstance(voices, list):
        return result
    for voice in voices:
        if not isinstance(voice, dict):
            continue
        voice_id = str(voice.get("voice_id") or "").strip()
        name = str(voice.get("name") or "").strip()
        if not voice_id or not name:
            continue
        result.append(
            {
                "voiceId": voice_id,
                "name": name,
                "category": str(voice.get("category") or "").strip(),
                "previewUrl": str(voice.get("preview_url") or "").strip(),
            }
        )
    return result


def public_secret_label(value: str) -> str:
    if not value:
        return "not configured"
    if len(value) <= 8:
        return "configured"
    return f"{value[:4]}...{value[-4:]}"


def extract_model_text(response: dict[str, Any]) -> str:
    choices = response.get("choices")
    if isinstance(choices, list) and choices:
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        if isinstance(message, dict):
            return clean_model_text(message_content_to_text(message.get("content")))
        text = choices[0].get("text") if isinstance(choices[0], dict) else None
        if text:
            return clean_model_text(text)
    if "response" in response:
        return clean_model_text(response.get("response"))
    return ""


def message_content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if text:
                    parts.append(str(text))
            elif item:
                parts.append(str(item))
        return "\n".join(parts)
    return str(content or "")


def clean_model_text(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    replacements = {
        "<|begin_of_box|>": "",
        "<|end_of_box|>": "",
        "<|beginofbox|>": "",
        "<|endofbox|>": "",
    }
    for token, replacement in replacements.items():
        text = text.replace(token, replacement)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def describe_http_error(label: str, error: urllib.error.HTTPError) -> str:
    try:
        body = error.read().decode("utf-8", errors="replace").strip()
    except Exception:
        body = ""
    if body:
        compact = re.sub(r"\s+", " ", body)[:260]
        return f"{label} returned HTTP {error.code}: {compact}"
    return f"{label} returned HTTP {error.code}."


def main() -> None:
    host = os.environ.get("SYNRA_HOST", "0.0.0.0")
    port = int(os.environ.get("SYNRA_PORT", "5191"))
    if not DIST_DIR.exists():
        raise SystemExit(f"Missing built Synra dist directory: {DIST_DIR}")
    server = ThreadingHTTPServer((host, port), SynraHandler)
    print(f"Synra Standalone server listening on http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

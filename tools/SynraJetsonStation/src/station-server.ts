import fs from "node:fs";
import fsp from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StationCamera } from "./camera.js";
import { loadConfig, leastPrivilegePermissions, stationCapabilities } from "./config.js";
import { DeviceMeshClient } from "./device-mesh-client.js";
import { collectHealth, type HealthState } from "./health.js";
import { createLogger } from "./logger.js";
import { StationMicrophone } from "./microphone.js";
import { redactSecrets } from "./redaction.js";
import { SynraEventClient } from "./synra-event-client.js";
import {
  crossDeviceContractVersion,
  type PublicStationConfig,
  type StationBridgeMessageType,
  type StationConfig,
  type StationStatus,
  type SynraDeviceStatus,
  type SynraMeshEvent,
  type SynraSensorStatus
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger("station-server");
const config = loadConfig();
const capabilities = stationCapabilities(config);
const permissions = leastPrivilegePermissions(config);
const camera = new StationCamera(config.cameraEnabled);
const microphone = new StationMicrophone(config.microphoneEnabled);
const events = new SynraEventClient();
const mesh = new DeviceMeshClient(config, capabilities, permissions, createLogger("device-mesh"));
const publicDir = path.resolve(__dirname, "../public");
const synraDir = path.resolve(publicDir, "synra");
const startedAtMs = Date.now();

let stationState: SynraDeviceStatus["synraState"] = "idle";
let lastError: string | null = null;

function synraRuntimePresent(): boolean {
  return fs.existsSync(path.join(synraDir, "index.html")) && fs.existsSync(path.join(synraDir, "assets"));
}

function currentStatus(): SynraDeviceStatus {
  return mesh.deviceStatus(camera.status, microphone.status, stationState);
}

function healthState(): HealthState {
  return {
    startedAtMs,
    synraRuntimePresent: synraRuntimePresent(),
    hubConnected: mesh.state.hubConnected,
    hubBaseUrl: config.hubBaseUrl,
    lastHeartbeatAt: mesh.state.lastHeartbeatAt,
    lastHubError: mesh.state.lastError,
    mockMode: mesh.state.mockMode,
    lastError
  };
}

function publicConfig(): PublicStationConfig {
  return {
    crossDeviceContractVersion,
    deviceId: config.deviceId,
    displayName: config.displayName,
    deviceType: "jetson",
    platform: "Linux",
    appVersion: config.appVersion,
    hubBaseUrl: config.hubBaseUrl,
    capabilities,
    permissions,
    cameraStatus: camera.status,
    microphoneStatus: microphone.status,
    simulationMode: config.simulate
  };
}

function statusPayload(): StationStatus {
  return {
    device: mesh.deviceRecord(currentStatus()),
    hubConnected: mesh.state.hubConnected,
    mockMode: mesh.state.mockMode,
    lastHubError: mesh.state.lastError,
    eventQueueSize: events.size,
    lastEvent: events.last(),
    pendingConfirmation: mesh.state.pendingConfirmation
  };
}

async function stationIdentitySmokePayload() {
  const health = await collectHealth(config, healthState(), camera, microphone);
  return health.identitySmoke;
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const data = Buffer.from(JSON.stringify(redactSecrets(value), null, 2), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": data.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(data);
}

function sendText(res: ServerResponse, status: number, text: string, contentType = "text/plain; charset=utf-8"): void {
  const data = Buffer.from(text, "utf8");
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": data.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(data);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > 1024 * 1024) throw new Error("Request body too large");
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected JSON object");
  return parsed as Record<string, unknown>;
}

function mimeType(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".svg": return "image/svg+xml";
    case ".vrm":
    case ".vrma":
    case ".glb": return "model/gltf-binary";
    case ".wasm": return "application/wasm";
    default: return "application/octet-stream";
  }
}

async function serveStatic(baseDir: string, rawPath: string, res: ServerResponse): Promise<void> {
  const clean = decodeURIComponent(rawPath.split("?")[0] || "/").replace(/^\/+/, "");
  const target = path.resolve(baseDir, clean || "index.html");
  if (!target.startsWith(baseDir)) return sendJson(res, 403, { error: "Forbidden" });
  let file = target;
  try {
    const stat = await fsp.stat(file);
    if (stat.isDirectory()) file = path.join(file, "index.html");
  } catch {
    if (rawPath.startsWith("/synra/")) file = path.join(baseDir, "index.html");
  }
  try {
    const data = await fsp.readFile(file);
    res.writeHead(200, {
      "Content-Type": mimeType(file),
      "Content-Length": data.length,
      "Cache-Control": file.endsWith("index.html") ? "no-store" : "public, max-age=3600",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

async function handlePost(pathname: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  switch (pathname) {
    case "/station/user-message": {
      const text = String(body.text || "").trim();
      if (!text) return sendJson(res, 400, { error: "Missing text" });
      stationState = "thinking";
      const event = events.push("synra.userMessage", { text, source: "jetson-station", context: body.context || null }, { sourceKind: "user", sourceId: config.deviceId, targetKind: "hub" });
      const result = await mesh.sendUserMessage(text, { eventId: event.eventId });
      return sendJson(res, 200, { ok: true, event, hub: result });
    }
    case "/station/mic-status": {
      const status = sanitizeSensorStatus(body.status);
      microphone.setStatus(status);
      stationState = status === "active" ? "listening" : "idle";
      const event = events.push("synra.micStatus", { status, visibleIndicator: true }, { sourceId: config.deviceId, targetKind: "hub" });
      await mesh.sendEvent(event);
      return sendJson(res, 200, { ok: true, status: microphone.debug(), event });
    }
    case "/station/camera-status": {
      const status = sanitizeSensorStatus(body.status);
      camera.setStatus(status);
      const event = events.push("synra.visionRequest", { cameraStatus: status, visibleIndicator: true, noFrameCaptured: true }, { sourceId: config.deviceId, targetKind: "hub", permission: "execute" });
      await mesh.sendEvent(event);
      return sendJson(res, 200, { ok: true, status: camera.debug(), event });
    }
    case "/station/vision-summary": {
      const summary = String(body.summary || "").trim();
      if (!summary) return sendJson(res, 400, { error: "Missing summary" });
      const event = events.push("synra.visionSummary", { summary, rawFrameStored: false }, { sourceId: config.deviceId, targetKind: "hub" });
      await mesh.sendEvent(event);
      return sendJson(res, 200, { ok: true, event });
    }
    case "/station/confirmation": {
      const action = String(body.action || "").trim();
      if (action !== "accept" && action !== "cancel") return sendJson(res, 400, { error: "action must be accept or cancel" });
      const type = action === "accept" ? "confirmation.accepted" : "confirmation.denied";
      const event = events.push(type, { confirmationId: body.confirmationId || null, explicitUserAction: true }, { sourceKind: "user", sourceId: config.deviceId, targetKind: "hub", permission: "execute", requiresAck: true });
      mesh.state.pendingConfirmation = null;
      await mesh.sendEvent(event);
      return sendJson(res, 200, { ok: true, event });
    }
    case "/station/bridge": {
      return handleBridge(body, res);
    }
    default:
      return sendJson(res, 404, { error: "Not found" });
  }
}

async function handleBridge(body: Record<string, unknown>, res: ServerResponse): Promise<void> {
  const type = String(body.type || "") as StationBridgeMessageType;
  switch (type) {
    case "assistant.ask":
      return handlePost("/station/user-message", fakeRequest({ text: body.text || body.message || "" }), res);
    case "assistant.cancel":
      stationState = "idle";
      return sendJson(res, 200, { ok: true, state: stationState });
    case "device.status":
    case "debug.state":
    case "settings.get":
      return sendJson(res, 200, { ok: true, config: publicConfig(), status: statusPayload() });
    case "device.heartbeat": {
      const health = await collectHealth(config, healthState(), camera, microphone);
      const result = await mesh.heartbeat(health, currentStatus());
      return sendJson(res, 200, { ok: true, health, hub: result });
    }
    case "voice.status":
      microphone.setStatus(sanitizeSensorStatus(body.status));
      return sendJson(res, 200, { ok: true, microphone: microphone.debug() });
    case "voice.start":
      try {
        await microphone.startListening();
      } catch (error) {
        return sendJson(res, 409, { ok: false, error: error instanceof Error ? error.message : String(error), microphone: microphone.debug() });
      }
      break;
    case "voice.stop":
      microphone.setStatus(config.microphoneEnabled ? "available" : "unavailable");
      return sendJson(res, 200, { ok: true, microphone: microphone.debug() });
    case "camera.status":
      camera.setStatus(sanitizeSensorStatus(body.status));
      return sendJson(res, 200, { ok: true, camera: camera.debug() });
    case "camera.captureForVision":
      try {
        await camera.captureForVision();
      } catch (error) {
        return sendJson(res, 409, { ok: false, error: error instanceof Error ? error.message : String(error), camera: camera.debug() });
      }
      break;
    case "confirmation.accept":
      return handlePost("/station/confirmation", fakeRequest({ action: "accept", confirmationId: body.confirmationId }), res);
    case "confirmation.cancel":
      return handlePost("/station/confirmation", fakeRequest({ action: "cancel", confirmationId: body.confirmationId }), res);
    case "settings.update":
      return sendJson(res, 403, { ok: false, error: "Settings updates are disabled from the station until Hub-side permission UI is wired." });
    default:
      return sendJson(res, 400, { error: `Unsupported bridge message: ${type}` });
  }
}

function fakeRequest(body: Record<string, unknown>): IncomingMessage {
  const stream = new http.IncomingMessage(null as never);
  const json = Buffer.from(JSON.stringify(body));
  let sent = false;
  stream._read = function read() {
    if (sent) {
      this.push(null);
      return;
    }
    sent = true;
    this.push(json);
    this.push(null);
  };
  return stream;
}

function sanitizeSensorStatus(value: unknown): SynraSensorStatus {
  const status = String(value || "").trim();
  if (status === "available" || status === "active" || status === "permissionDenied" || status === "unavailable") return status;
  return "unavailable";
}

function stationShellHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Synra Jetson Station</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #05070b; color: #eef7ff; }
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #05070b; }
    iframe { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; background: #05070b; }
    .overlay { position: fixed; left: 16px; right: 16px; bottom: 16px; display: flex; align-items: end; justify-content: space-between; gap: 12px; pointer-events: none; }
    .panel { pointer-events: auto; max-width: min(520px, calc(100vw - 32px)); border: 1px solid rgba(137, 210, 255, .28); background: rgba(8, 12, 20, .76); box-shadow: 0 12px 40px rgba(0,0,0,.45); backdrop-filter: blur(14px); border-radius: 8px; padding: 12px 14px; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .pill { border: 1px solid rgba(255,255,255,.18); border-radius: 999px; padding: 5px 9px; font-size: 12px; font-weight: 700; }
    .ok { color: #87f59a; } .warn { color: #ffd166; } .bad { color: #ff7b8f; }
    button { border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.09); color: #fff; border-radius: 7px; padding: 8px 10px; font-weight: 800; }
    button:disabled { opacity: .45; }
    input { min-width: 260px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.08); color: #fff; border-radius: 7px; padding: 8px 10px; }
    .caption { margin-top: 8px; font-size: 13px; line-height: 1.35; color: rgba(238,247,255,.86); }
    .hint { position: fixed; right: 16px; top: 14px; font-size: 12px; color: rgba(238,247,255,.68); background: rgba(8,12,20,.56); border: 1px solid rgba(255,255,255,.13); border-radius: 999px; padding: 7px 10px; }
  </style>
</head>
<body>
  <iframe src="/synra/" title="Synra"></iframe>
  <div class="hint">Synra Jetson Station · press Esc to exit kiosk</div>
  <div class="overlay">
    <section class="panel">
      <div class="row">
        <span id="hub" class="pill warn">Hub checking</span>
        <span id="device" class="pill">Jetson station</span>
        <span id="camera" class="pill">Camera unavailable</span>
        <span id="mic" class="pill">Mic unavailable</span>
      </div>
      <div class="caption" id="caption">Synra station is starting.</div>
      <form id="askForm" class="row" style="margin-top:10px">
        <input id="askText" placeholder="Type to Synra through the Hub..." autocomplete="off" />
        <button type="submit">Send</button>
      </form>
    </section>
    <section class="panel" id="confirmation" style="display:none">
      <strong id="confirmationTitle">Confirmation required</strong>
      <div class="caption" id="confirmationBody"></div>
      <div class="row" style="margin-top:10px">
        <button id="confirmAccept">Confirm</button>
        <button id="confirmCancel">Cancel</button>
      </div>
    </section>
  </div>
  <script>
    let pendingConfirmation = null;
    async function json(path, options) {
      const response = await fetch(path, options);
      return response.json();
    }
    function pill(id, text, cls) {
      const el = document.getElementById(id);
      el.textContent = text;
      el.className = "pill " + (cls || "");
    }
    async function refresh() {
      try {
        const status = await json("/station/status");
        pill("hub", status.hubConnected ? "Hub connected" : (status.mockMode ? "Hub mock" : "Hub offline"), status.hubConnected ? "ok" : "warn");
        pill("device", status.device.displayName || "Jetson station", "ok");
        pill("camera", "Camera " + status.device.status.cameraStatus, status.device.status.cameraStatus === "active" ? "ok" : "");
        pill("mic", "Mic " + status.device.status.microphoneStatus, status.device.status.microphoneStatus === "active" ? "ok" : "");
        document.getElementById("caption").textContent = status.lastEvent ? status.lastEvent.type + " · " + new Date(status.lastEvent.timestamp).toLocaleTimeString() : "Synra station ready.";
        pendingConfirmation = status.pendingConfirmation || null;
        document.getElementById("confirmation").style.display = pendingConfirmation ? "block" : "none";
        if (pendingConfirmation) {
          document.getElementById("confirmationTitle").textContent = pendingConfirmation.title || "Confirmation required";
          document.getElementById("confirmationBody").textContent = pendingConfirmation.body || pendingConfirmation.text || "The Hub is asking for explicit confirmation.";
        }
      } catch (error) {
        pill("hub", "Station offline", "bad");
      }
    }
    document.getElementById("askForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.getElementById("askText");
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      await json("/station/user-message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      refresh();
    });
    document.getElementById("confirmAccept").onclick = async () => {
      await json("/station/confirmation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept", confirmationId: pendingConfirmation && pendingConfirmation.confirmationId }) });
      refresh();
    };
    document.getElementById("confirmCancel").onclick = async () => {
      await json("/station/confirmation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", confirmationId: pendingConfirmation && pendingConfirmation.confirmationId }) });
      refresh();
    };
    setInterval(refresh, 2500);
    refresh();
  </script>
</body>
</html>`;
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    res.end();
    return;
  }
  try {
    if (req.method === "GET" && url.pathname === "/") return sendText(res, 200, stationShellHtml(), "text/html; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/station/config") return sendJson(res, 200, publicConfig());
    if (req.method === "GET" && url.pathname === "/station/status") return sendJson(res, 200, statusPayload());
    if (req.method === "GET" && url.pathname === "/station/health") return sendJson(res, 200, await collectHealth(config, healthState(), camera, microphone));
    if (req.method === "GET" && url.pathname === "/station/identity-smoke") return sendJson(res, 200, await stationIdentitySmokePayload());
    if (req.method === "GET" && url.pathname === "/station/events") return sendJson(res, 200, { events: events.recent(Number(url.searchParams.get("limit") || 50)) });
    if (req.method === "GET" && url.pathname === "/station/events/stream") return void events.subscribe(res);
    if (req.method === "GET" && url.pathname.startsWith("/synra/")) return serveStatic(synraDir, url.pathname.slice("/synra/".length), res);
    if (req.method === "POST" && url.pathname.startsWith("/station/")) return handlePost(url.pathname, req, res);
    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    logger.error("Request failed", { path: url.pathname, error: lastError });
    return sendJson(res, 500, { error: lastError });
  }
}

async function boot(server: http.Server, cfg: StationConfig): Promise<void> {
  const health = await collectHealth(cfg, healthState(), camera, microphone);
  await mesh.register(currentStatus());
  await mesh.heartbeat(health, currentStatus());
  events.push("device.register", { deviceId: cfg.deviceId, displayName: cfg.displayName, simulationMode: cfg.simulate }, { sourceId: cfg.deviceId, targetKind: "hub" });
  const interval = setInterval(async () => {
    const nextHealth = await collectHealth(cfg, healthState(), camera, microphone);
    await mesh.heartbeat(nextHealth, currentStatus());
    events.push("device.heartbeat", { deviceId: cfg.deviceId, health: nextHealth.hub }, { sourceId: cfg.deviceId, targetKind: "hub" });
    const incoming = await mesh.pollEvents();
    for (const event of incoming) events.ingest(event);
  }, cfg.heartbeatIntervalMs);
  interval.unref();

  if (cfg.once) {
    const selfCheck = await fetch(`http://${cfg.host}:${cfg.port}/station/health`).then((response) => response.json());
    logger.info("Simulation self-check complete", selfCheck);
    clearInterval(interval);
    server.close();
  }
}

const server = http.createServer((req, res) => {
  void route(req, res);
});

server.listen(config.port, config.host, () => {
  logger.info("Synra Jetson Station listening", {
    url: `http://${config.host}:${config.port}/`,
    synraRuntimePresent: synraRuntimePresent(),
    simulationMode: config.simulate,
    hubAccessConfigured: Boolean(config.hubToken)
  });
  void boot(server, config);
});

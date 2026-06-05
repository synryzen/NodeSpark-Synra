import crypto from "node:crypto";
import type { ServerResponse } from "node:http";
import type { SynraMeshEvent, SynraMeshEventType, SynraPermission } from "./types.js";
import { redactSecrets } from "./redaction.js";

type Subscriber = {
  id: string;
  response: ServerResponse;
};

export class SynraEventClient {
  private readonly events: SynraMeshEvent[] = [];
  private readonly subscribers = new Map<string, Subscriber>();

  constructor(private readonly maxEvents = 200) {}

  push(
    type: SynraMeshEventType,
    payload: Record<string, unknown>,
    options: {
      sourceKind?: SynraMeshEvent["source"]["kind"];
      sourceId?: string;
      targetKind?: SynraMeshEvent["target"]["kind"];
      targetId?: string;
      permission?: SynraPermission;
      requiresAck?: boolean;
    } = {}
  ): SynraMeshEvent {
    const event: SynraMeshEvent = {
      eventId: crypto.randomUUID(),
      type,
      source: { kind: options.sourceKind || "device", id: options.sourceId || "jetson-station" },
      target: { kind: options.targetKind || "hub", id: options.targetId || "local" },
      timestamp: new Date().toISOString(),
      payload: redactSecrets(payload),
      requiresAck: Boolean(options.requiresAck),
      permission: options.permission || "read",
      redactionApplied: true
    };
    this.events.push(event);
    while (this.events.length > this.maxEvents) this.events.shift();
    this.broadcast(event);
    return event;
  }

  ingest(event: SynraMeshEvent): SynraMeshEvent {
    const redacted = { ...event, payload: redactSecrets(event.payload), redactionApplied: true };
    this.events.push(redacted);
    while (this.events.length > this.maxEvents) this.events.shift();
    this.broadcast(redacted);
    return redacted;
  }

  recent(limit = 50): SynraMeshEvent[] {
    return this.events.slice(-Math.max(1, Math.min(200, limit)));
  }

  last(): SynraMeshEvent | null {
    return this.events.at(-1) || null;
  }

  get size(): number {
    return this.events.length;
  }

  subscribe(response: ServerResponse): string {
    const id = crypto.randomUUID();
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    response.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    const subscriber = { id, response };
    this.subscribers.set(id, subscriber);
    response.on("close", () => {
      this.subscribers.delete(id);
    });
    return id;
  }

  private broadcast(event: SynraMeshEvent): void {
    const line = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const [id, subscriber] of this.subscribers) {
      try {
        subscriber.response.write(line);
      } catch {
        this.subscribers.delete(id);
      }
    }
  }
}

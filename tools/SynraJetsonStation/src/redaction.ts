const SECRET_KEY_RE = /(?:secret|token|password|api[_-]?key|authorization|cookie|credential|pairing)/i;
const SECRET_VALUE_RE =
  /(sk-[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{10,}|gh[pousr]_[A-Za-z0-9_]{20,}|gh[pousr]-[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+)/gi;

export function redactText(input: string): string {
  return input.replace(SECRET_VALUE_RE, "[redacted]");
}

export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_RE.test(key) ? redactSecretKeyValue(inner) : redactSecrets(inner);
    }
    return out as T;
  }
  return value;
}

function redactSecretKeyValue(value: unknown): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  return "[redacted]";
}

export function summarizeForLog(value: unknown): unknown {
  const redacted = redactSecrets(value);
  const text = JSON.stringify(redacted);
  if (text.length <= 4000) return redacted;
  return { summary: `${text.slice(0, 4000)}...[truncated]` };
}

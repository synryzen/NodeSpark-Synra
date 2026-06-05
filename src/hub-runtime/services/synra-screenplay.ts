import type { SynraExpression } from "../types/avatar";

export type SynraScreenplayCue = {
  text: string;
  expression?: SynraExpression;
  gesture?: string;
};

const EMOTION_TAGS: Record<string, SynraExpression> = {
  neutral: "soft_smile",
  calm: "soft_smile",
  soft: "soft_smile",
  happy: "happy",
  joy: "happy",
  cheerful: "happy",
  fun: "happy",
  playful: "happy",
  bright: "bright",
  excited: "delighted",
  delighted: "delighted",
  success: "delighted",
  sad: "reassure",
  sorry: "reassure",
  worried: "reassure",
  gentle: "reassure",
  relaxed: "relaxed",
  peaceful: "relaxed",
  angry: "focused",
  serious: "focused",
  focused: "focused",
  thinking: "thinking",
  attentive: "attentive",
  curious: "curious",
  confused: "confused",
  surprised: "surprised",
  blush: "blush",
  shy: "blush",
  reassure: "reassure"
};

const ACTION_TAGS: Record<string, string> = {
  greet: "wave",
  hello: "wave",
  hi: "wave",
  wave: "wave",
  big_wave: "wave_big",
  soft_wave: "wave_shy",
  bow: "bow",
  nod: "nod_yes",
  yes: "nod_yes",
  no: "shake_no",
  shake: "shake_no",
  point: "point",
  point_left: "point_left",
  point_right: "point_right",
  present: "present",
  explain: "explain",
  compare: "compare",
  look_left: "look_left",
  look_right: "look_right",
  look_up: "look_up",
  look_down: "look_down",
  look_center: "look_center",
  listen: "mic_listen",
  think: "thinking",
  celebrate: "celebrate",
  reassure: "reassure",
  cute: "cute_pose",
  wink: "wink_energy"
};

const TAG_PATTERN = /\[([a-zA-Z][a-zA-Z0-9_:-]{0,40})\]/g;

export function parseSynraScreenplay(rawValue: unknown, fallbackExpression?: SynraExpression): SynraScreenplayCue {
  const raw = String(rawValue || "").trim();
  if (!raw) return { text: "", expression: fallbackExpression };

  let expression = fallbackExpression;
  let gesture: string | undefined;
  const seenTags: string[] = [];

  for (const match of raw.matchAll(TAG_PATTERN)) {
    const tag = normalizeTag(match[1]);
    seenTags.push(tag);
    const parsed = parseTaggedDirective(tag);
    if (parsed.expression) expression = parsed.expression;
    if (parsed.gesture && !gesture) gesture = parsed.gesture;
  }

  const text = raw
    .replace(TAG_PATTERN, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  if (!expression) {
    const inferred = inferExpressionFromText(text || raw);
    if (inferred) expression = inferred;
  }

  if (!gesture) {
    gesture = inferGestureFromTags(seenTags);
  }

  return { text, expression, gesture };
}

export function stripSynraTags(rawValue: unknown): string {
  return parseSynraScreenplay(rawValue).text;
}

function parseTaggedDirective(tag: string): { expression?: SynraExpression; gesture?: string } {
  const [, prefix, value] = tag.match(/^(emotion|expression|face|action|gesture|motion):(.+)$/) || [];
  const key = normalizeTag(value || tag);

  if (prefix === "action" || prefix === "gesture" || prefix === "motion") {
    return { gesture: ACTION_TAGS[key] || key };
  }

  if (prefix === "emotion" || prefix === "expression" || prefix === "face") {
    return { expression: EMOTION_TAGS[key] };
  }

  return {
    expression: EMOTION_TAGS[key],
    gesture: ACTION_TAGS[key]
  };
}

function inferGestureFromTags(tags: string[]): string | undefined {
  for (const tag of tags) {
    const parsed = parseTaggedDirective(tag);
    if (parsed.gesture) return parsed.gesture;
  }
  return undefined;
}

function inferExpressionFromText(text: string): SynraExpression | undefined {
  const lower = text.toLowerCase();
  if (/\b(thank|great|awesome|perfect|nice|yay|love)\b/.test(lower)) return "happy";
  if (/\b(sorry|worried|sad|failed|error|afraid)\b/.test(lower)) return "reassure";
  if (/\b(why|how|let me think|thinking|compare|analyze)\b/.test(lower)) return "focused";
  if (/\?/.test(text)) return "curious";
  return undefined;
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/[\s-]+/g, "_").toLowerCase();
}

import { clamp } from "../core/math";
import { SynraBridgeClient } from "./native-bridge";
import { stripSynraTags } from "./synra-screenplay";

export interface SpeechVisemes {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
  open: number;
  meta?: SpeechVisemeMetadata;
}

export type SpeechUnit = "mbp" | "fv" | "th" | "sh" | "ch_j" | "oo" | "oh" | "ee" | "vowel" | "other" | "pause";
export type SpeechSentenceTone = "question" | "explain" | "reassure" | "celebrate" | "confirm" | "neutral";
export type SpeechGestureIntent = "question_lift" | "explain_beat" | "reassure_soft" | "celebrate_lift" | "confirm_nod" | "emphasis_beat" | "steady";

export interface SpeechVisemeMetadata {
  marker: "synra-phoneme-aware-speech-v1";
  charIndex: number;
  ratio: number;
  durationMs: number;
  unit: SpeechUnit;
  energy: number;
  phraseEmphasis: number;
  sentenceIndex: number;
  sentenceProgress: number;
  sentenceTone: SpeechSentenceTone;
  gestureIntent: SpeechGestureIntent;
  emphasisBeat: number;
  pauseStrength: number;
  source: "timer" | "boundary" | "manual";
}

interface SpeakHooks {
  onStart?: () => void;
  onViseme?: (viseme: SpeechVisemes) => void;
  onEnd?: () => void;
}

const EMPTY: SpeechVisemes = Object.freeze({
  aa: 0,
  ih: 0,
  ou: 0,
  ee: 0,
  oh: 0,
  open: 0
});
const NATIVE_SPEECH_IMMEDIATE_PROVIDERS = /ios|hub-audio|native/i;
const PLOSIVE_CLOSE = { aa: 0.003, ih: 0.001, ou: 0.001, ee: 0.001, oh: 0.001, open: 0.01 };
const SOFT_CLOSED = { aa: 0.004, ih: 0.002, ou: 0.002, ee: 0.002, oh: 0.002 };

export function estimateSpeechDurationMs(text: string): number {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return clamp(words * 330 + String(text || "").length * 20 + 820, 1200, 17000);
}

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let score = lang.startsWith("en") ? 20 : 0;
  if (voice.localService) score += 8;
  if (/(ava|zoe|samantha|nicky|serena|moira|tessa|karen|allison|susan)/.test(name)) score += 24;
  if (/(premium|enhanced|neural|natural)/.test(name)) score += 16;
  if (/(compact|default|novelty|fred|zarvox|trinoids|whisper|bells|boing)/.test(name)) score -= 30;
  return score;
}

async function resolveSynraVoice(): Promise<SpeechSynthesisVoice | null> {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;

  return await new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(null), 700);
    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(timeout);
      const loaded = window.speechSynthesis.getVoices();
      resolve([...loaded].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null);
    };
  });
}

function speechCharacterAt(text: string, rawIndex: number): string {
  const value = String(text || "");
  if (!value) return "";
  const index = clamp(Math.round(rawIndex), 0, value.length - 1);
  if (!/\s/.test(value[index] || "")) return value[index].toLowerCase();
  for (let offset = 1; offset < 6; offset += 1) {
    const right = value[index + offset];
    if (right && !/\s/.test(right)) return right.toLowerCase();
    const left = value[index - offset];
    if (left && !/\s/.test(left)) return left.toLowerCase();
  }
  return "";
}

function nextSpeechCharacter(text: string, rawIndex: number): string {
  const value = String(text || "");
  const index = clamp(Math.round(rawIndex), 0, Math.max(value.length - 1, 0));
  for (let offset = 1; offset < 8; offset += 1) {
    const char = value[index + offset];
    if (char && !/\s/.test(char)) return char.toLowerCase();
  }
  return "";
}

export function visemesForSpeechPosition(
  text: string,
  rawIndex: number,
  amplitude = 0.2,
  timing: Partial<Pick<SpeechVisemeMetadata, "ratio" | "durationMs" | "source">> = {}
): SpeechVisemes {
  const value = String(text || "");
  const char = speechCharacterAt(value, rawIndex);
  const nextChar = nextSpeechCharacter(value, rawIndex);
  const previousChar = previousSpeechCharacter(value, rawIndex);
  const index = clamp(Math.round(rawIndex), 0, Math.max(value.length - 1, 0));
  const neighborhood = value.slice(Math.max(0, index - 3), Math.min(value.length, index + 5)).toLowerCase();
  const unit = speechUnitAt(value, index);
  const punctuationEase = /[.,!?;:]/.test(char) ? 0.22 : 1;
  const phraseEmphasis = speechPhraseEmphasis(value, index);
  const dynamicAmplitude = speechAmplitudeAt(value, index, amplitude, unit);
  const syllablePulse = 0.82 + Math.sin(rawIndex * 1.82) * 0.12 + Math.sin(rawIndex * 0.47) * 0.06;
  const microPulse = 0.93 + Math.sin((rawIndex + phraseEmphasis) * 3.7) * 0.035;
  const energy = clamp(sigmoidSpeechEnergy(dynamicAmplitude) * syllablePulse * punctuationEase * phraseEmphasis * microPulse, 0, 0.92);
  const closed = { ...SOFT_CLOSED, open: 0.018 + energy * 0.052 };
  const meta = speechVisemeMetadata(value, index, rawIndex, !char || /[.,!?;:]/.test(char) ? "pause" : unit, energy, phraseEmphasis, timing);
  if (!char || /[.,!?;:]/.test(char)) return { ...closed, meta };

  let current: SpeechVisemes;
  let anticipation = 0.16;
  if (unit === "mbp") {
    current = { ...PLOSIVE_CLOSE, open: PLOSIVE_CLOSE.open + energy * 0.024 };
    anticipation = 0.22;
  } else if (unit === "fv" || unit === "th") {
    current = dominantViseme("ee", energy, unit === "th" ? 0.34 : 0.4);
    current.open = Math.min(current.open, 0.22 + energy * 0.12);
  } else if (unit === "sh" || unit === "ch_j") {
    current = blendVisemes(dominantViseme("ih", energy, 0.4), dominantViseme("ou", energy, 0.34), 0.34);
    current.open = clamp(current.open * 0.74, 0.04, 0.32);
  } else if (unit === "oo") {
    current = dominantViseme("ou", energy, 0.72);
  } else if (unit === "oh") {
    current = dominantViseme("oh", energy, 0.72);
  } else if (unit === "ee") {
    current = dominantViseme("ee", energy, 0.66);
  } else if (/[tdnszrl]/.test(char)) {
    current = dominantViseme("ih", energy, 0.46);
    anticipation = 0.14;
  } else if (/[kgchjyx]/.test(char)) {
    current = dominantViseme("ih", energy, 0.42);
    anticipation = 0.14;
  } else if (neighborhood.includes("oo") || neighborhood.includes("you") || neighborhood.includes("ew") || /[uwq]/.test(char)) {
    current = dominantViseme("ou", energy, 0.72);
  } else if (neighborhood.includes("oh") || neighborhood.includes("ow") || /[o]/.test(char)) {
    current = dominantViseme("oh", energy, 0.72);
  } else if (neighborhood.includes("ee") || neighborhood.includes("ea") || /[ey]/.test(char)) {
    current = dominantViseme("ee", energy, 0.66);
  } else if (/[i]/.test(char)) {
    current = dominantViseme("ih", energy, 0.62);
  } else if (/[a]/.test(char)) {
    current = dominantViseme("aa", energy, 0.74);
  } else {
    current = dominantViseme("aa", energy, 0.34);
    anticipation = 0.12;
  }

  const released = releasePlosive(previousChar, char, current, energy);
  return { ...anticipateNextViseme(nextChar, released, energy, anticipation), meta };
}

function previousSpeechCharacter(text: string, rawIndex: number): string {
  const value = String(text || "");
  const index = clamp(Math.round(rawIndex), 0, Math.max(value.length - 1, 0));
  for (let offset = 1; offset < 8; offset += 1) {
    const char = value[index - offset];
    if (char && !/\s/.test(char)) return char.toLowerCase();
  }
  return "";
}

function speechUnitAt(text: string, index: number): SpeechUnit {
  const char = (text[index] || "").toLowerCase();
  const pair = text.slice(index, index + 2).toLowerCase();
  const behind = text.slice(Math.max(0, index - 1), index + 1).toLowerCase();
  const neighborhood = text.slice(Math.max(0, index - 3), Math.min(text.length, index + 5)).toLowerCase();
  if (/[mbp]/.test(char)) return "mbp";
  if (/[fv]/.test(char)) return "fv";
  if (pair === "th" || behind === "th") return "th";
  if (pair === "sh" || behind === "sh") return "sh";
  if (pair === "ch" || behind === "ch" || /[j]/.test(char)) return "ch_j";
  if (neighborhood.includes("oo") || neighborhood.includes("you") || neighborhood.includes("ew") || /[uwq]/.test(char)) {
    return "oo";
  }
  if (pair === "oh" || pair === "ow" || behind === "oh" || behind === "ow" || /[o]/.test(char)) return "oh";
  if (pair === "ee" || pair === "ea" || behind === "ee" || behind === "ea" || /[eyi]/.test(char)) return "ee";
  if (/[aeiou]/.test(char)) return "vowel";
  return "other";
}

function speechVisemeMetadata(
  text: string,
  index: number,
  rawIndex: number,
  unit: SpeechUnit,
  energy: number,
  phraseEmphasis: number,
  timing: Partial<Pick<SpeechVisemeMetadata, "ratio" | "durationMs" | "source">>
): SpeechVisemeMetadata {
  const denominator = Math.max(1, text.length - 1);
  const sentence = speechSentenceContext(text, index);
  const gestureIntent = speechGestureIntent(text, index, sentence.tone, unit);
  const pauseStrength = /[.,!?;:]/.test(text[index] || "") ? sentence.terminal ? 1 : 0.62 : 0;
  return {
    marker: "synra-phoneme-aware-speech-v1",
    charIndex: index,
    ratio: clamp(timing.ratio ?? (rawIndex / denominator), 0, 1),
    durationMs: Math.max(0, Math.round(timing.durationMs ?? 0)),
    unit,
    energy: Number(clamp(energy, 0, 1).toFixed(3)),
    phraseEmphasis: Number(clamp(phraseEmphasis, 0.7, 1.25).toFixed(3)),
    sentenceIndex: sentence.index,
    sentenceProgress: Number(sentence.progress.toFixed(3)),
    sentenceTone: sentence.tone,
    gestureIntent,
    emphasisBeat: Number(speechEmphasisBeat(text, index, sentence.progress, sentence.tone).toFixed(3)),
    pauseStrength: Number(clamp(pauseStrength, 0, 1).toFixed(3)),
    source: timing.source ?? "manual"
  };
}

function speechSentenceContext(text: string, index: number): { index: number; progress: number; tone: SpeechSentenceTone; terminal: boolean } {
  const value = String(text || "");
  const sentenceStarts: number[] = [0];
  for (let i = 0; i < value.length; i += 1) {
    if (/[.!?]\s+/.test(value.slice(i, i + 2))) sentenceStarts.push(i + 2);
  }
  let sentenceIndex = 0;
  for (let i = 0; i < sentenceStarts.length; i += 1) {
    if (sentenceStarts[i] <= index) sentenceIndex = i;
  }
  const start = sentenceStarts[sentenceIndex] ?? 0;
  const nextTerminal = value.slice(start).search(/[.!?]/);
  const end = nextTerminal >= 0 ? start + nextTerminal : value.length;
  const sentence = value.slice(start, Math.max(start + 1, end + 1));
  const progress = clamp((index - start) / Math.max(1, end - start), 0, 1);
  return {
    index: sentenceIndex,
    progress,
    tone: speechSentenceTone(sentence),
    terminal: index >= end && /[.!?]/.test(value[index] || "")
  };
}

function speechSentenceTone(sentenceRaw: string): SpeechSentenceTone {
  const sentence = sentenceRaw.toLowerCase();
  if (/\?/.test(sentence) || /\b(why|how|what|when|where|should|could|would|can i|do you)\b/.test(sentence)) return "question";
  if (/\b(sorry|cannot|can't|failed|error|worried|stressed|safe|careful|okay)\b/.test(sentence)) return "reassure";
  if (/\b(done|great|perfect|success|awesome|love|nice|worked)\b|!/.test(sentence)) return "celebrate";
  if (/\b(yes|confirmed|sure|absolutely|got it|i can|i will)\b/.test(sentence)) return "confirm";
  if (/\b(first|next|then|because|explain|step|here's|here is|means|works|reason)\b/.test(sentence)) return "explain";
  return "neutral";
}

function speechGestureIntent(text: string, index: number, tone: SpeechSentenceTone, unit: SpeechUnit): SpeechGestureIntent {
  const word = currentSpeechWord(text, index).toLowerCase();
  if (tone === "question") return "question_lift";
  if (tone === "reassure") return "reassure_soft";
  if (tone === "celebrate") return "celebrate_lift";
  if (tone === "confirm") return "confirm_nod";
  if (tone === "explain") return "explain_beat";
  if (unit !== "pause" && /\b(important|really|next|first|done|now|yes|no|great|fix|ready)\b/.test(word)) return "emphasis_beat";
  return "steady";
}

function speechEmphasisBeat(text: string, index: number, sentenceProgress: number, tone: SpeechSentenceTone): number {
  const word = currentSpeechWord(text, index);
  const wordWeight = word.length >= 7 ? 0.32 : /\b(next|first|yes|no|done|now|great|fix|ready)\b/i.test(word) ? 0.42 : 0;
  const phraseBeat = Math.max(0, Math.sin(sentenceProgress * Math.PI * (tone === "explain" ? 5 : 3)));
  const toneWeight = tone === "question" ? 0.2 : tone === "celebrate" ? 0.34 : tone === "confirm" ? 0.28 : tone === "explain" ? 0.24 : 0.12;
  return clamp(wordWeight + phraseBeat * toneWeight, 0, 1);
}

function currentSpeechWord(text: string, index: number): string {
  const value = String(text || "");
  const left = value.slice(0, index + 1).search(/[^\s.,!?;:]+$/);
  const start = left < 0 ? index : left;
  const right = value.slice(index).search(/[\s.,!?;:]/);
  const end = right < 0 ? value.length : index + right;
  return value.slice(start, end);
}

function speechPhraseEmphasis(text: string, index: number): number {
  const start = Math.max(0, text.lastIndexOf(" ", index - 1) + 1);
  const endSpace = text.indexOf(" ", index);
  const end = endSpace < 0 ? text.length : endSpace;
  const word = text.slice(start, end);
  const wordProgress = word.length <= 1 ? 0.5 : clamp((index - start) / Math.max(1, word.length - 1), 0, 1);
  const wordPulse = 0.94 + Math.sin(wordProgress * Math.PI) * 0.12;
  const questionLift = /[?]($|\s)/.test(text.slice(index, Math.min(text.length, index + 18))) ? 1.04 : 1;
  const emphasis = word.length >= 7 ? 1.05 : word.length <= 2 ? 0.92 : 1;
  return clamp(wordPulse * questionLift * emphasis, 0.82, 1.14);
}

function speechAmplitudeAt(text: string, index: number, baseAmplitude: number, unit: SpeechUnit): number {
  const sentence = speechSentenceContext(text, index);
  const word = currentSpeechWord(text, index);
  const wordIndex = Math.max(0, index - Math.max(0, text.lastIndexOf(" ", index - 1) + 1));
  const wordProgress = clamp(word.length <= 1 ? 0.5 : wordIndex / Math.max(1, word.length - 1), 0, 1);
  const wordStress = word.length >= 8 ? 1.14 : word.length <= 2 ? 0.86 : 1;
  const toneLift = sentence.tone === "celebrate"
    ? 1.16
    : sentence.tone === "question"
      ? 1.08
      : sentence.tone === "explain"
        ? 1.06
        : sentence.tone === "reassure"
          ? 0.92
          : 1;
  const unitLift = unit === "mbp"
    ? 0.72
    : unit === "fv" || unit === "th"
      ? 0.82
      : unit === "oo" || unit === "oh" || unit === "ee" || unit === "vowel"
        ? 1.08
        : 0.96;
  const wordPulse = 0.9 + Math.sin(wordProgress * Math.PI) * 0.18;
  const sentencePulse = 0.96 + Math.max(0, Math.sin(sentence.progress * Math.PI * (sentence.tone === "explain" ? 4 : 2))) * 0.08;
  const punctuationDampen = /[.,!?;:]/.test(text[index] || "") ? 0.36 : 1;
  return clamp(baseAmplitude * wordStress * toneLift * unitLift * wordPulse * sentencePulse * punctuationDampen, 0.045, 0.34);
}

function releasePlosive(previousChar: string, char: string, current: SpeechVisemes, energy: number): SpeechVisemes {
  if (!/[mbp]/.test(previousChar) || /[mbp]/.test(char)) return current;
  return blendVisemes(current, dominantViseme("aa", energy * 0.88, 0.42), 0.18);
}

export class SynraSpeechOutput {
  private speaking = false;
  private timer = 0;
  private voice: SpeechSynthesisVoice | null = null;
  private readonly bridge = new SynraBridgeClient();

  stop(): void {
    this.speaking = false;
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = 0;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  async speak(textRaw: string, hooks: SpeakHooks = {}): Promise<void> {
    const text = stripSynraTags(textRaw).trim();
    if (!text) return;
    this.stop();
    this.speaking = true;
    hooks.onStart?.();

    const durationMs = estimateSpeechDurationMs(text);
    const startedAt = performance.now();

    this.timer = window.setInterval(() => {
      const ratio = clamp((performance.now() - startedAt) / Math.max(700, durationMs), 0, 1);
      const index = ratio * Math.max(0, text.length - 1);
      hooks.onViseme?.(visemesForSpeechPosition(text, index, 0.13, { ratio, durationMs, source: "timer" }));
      if (ratio >= 1) {
        if (this.timer) window.clearInterval(this.timer);
        this.timer = 0;
      }
    }, 32);

    try {
      const nativeSpeech = await this.bridge.speak(text);
      if (nativeSpeech.handled) {
        const nativeBridgeHoldForEstimatedSpeech = shouldHoldNativeVisemes(nativeSpeech.provider, nativeSpeech.bridgeElapsedMs, durationMs);
        if (nativeBridgeHoldForEstimatedSpeech && !nativeSpeech.duplicateSuppressed) {
          await sleep(Math.max(nativeSpeech.durationMs ?? durationMs, durationMs) - nativeSpeech.bridgeElapsedMs);
        }
        if (this.speaking) this.finishSpeech(hooks);
        return;
      }
    } catch {
      // Fall back to browser speech if native speech is unavailable or interrupted.
    }

    if ("speechSynthesis" in window) {
      this.voice = this.voice ?? await resolveSynraVoice();
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        if (this.voice) utterance.voice = this.voice;
        utterance.rate = 0.96;
        utterance.pitch = 1.18;
        utterance.volume = 0.96;
        utterance.onboundary = (event) => {
          if (!this.speaking) return;
          const charIndex = event?.charIndex || 0;
          const viseme = visemesForSpeechPosition(text, charIndex, 0.16, {
            ratio: charIndex / Math.max(1, text.length - 1),
            durationMs,
            source: "boundary"
          });
          hooks.onViseme?.(viseme);
        };
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    } else {
      await new Promise<void>((resolve) => window.setTimeout(resolve, durationMs));
    }

    this.finishSpeech(hooks);
  }

  private finishSpeech(hooks: SpeakHooks): void {
    this.speaking = false;
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = 0;
    }
    hooks.onViseme?.(EMPTY);
    hooks.onEnd?.();
  }
}

function shouldHoldNativeVisemes(provider: string | null, bridgeElapsedMs: number, estimatedDurationMs: number): boolean {
  if (bridgeElapsedMs > Math.max(900, estimatedDurationMs * 0.45)) return false;
  if (!provider) return bridgeElapsedMs < 700;
  return NATIVE_SPEECH_IMMEDIATE_PROVIDERS.test(provider);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
}

function sigmoidSpeechEnergy(amplitude: number): number {
  const cooked = 1 / (1 + Math.exp(-42 * clamp(amplitude, 0, 1) + 5));
  return cooked < 0.08 ? 0 : clamp(cooked, 0.04, 0.82);
}

function dominantViseme(name: Exclude<keyof SpeechVisemes, "open" | "meta">, energy: number, maxWeight: number): SpeechVisemes {
  const weight = clamp(0.08 + energy * maxWeight, 0, 0.86);
  const base = {
    aa: 0.006,
    ih: 0.004,
    ou: 0.004,
    ee: 0.004,
    oh: 0.004,
    open: clamp(0.06 + energy * 0.38, 0.025, 0.56)
  };
  base[name] = weight;
  return base;
}

function anticipateNextViseme(char: string, current: SpeechVisemes, energy: number, weight: number): SpeechVisemes {
  let next: SpeechVisemes | null = null;
  if (/[uwqo]/.test(char)) next = dominantViseme(/[o]/.test(char) ? "oh" : "ou", energy * 0.72, 0.54);
  else if (/[ey]/.test(char)) next = dominantViseme("ee", energy * 0.72, 0.48);
  else if (/[i]/.test(char)) next = dominantViseme("ih", energy * 0.72, 0.46);
  else if (/[a]/.test(char)) next = dominantViseme("aa", energy * 0.72, 0.52);
  if (!next) return current;
  return {
    aa: current.aa * (1 - weight) + next.aa * weight,
    ih: current.ih * (1 - weight) + next.ih * weight,
    ou: current.ou * (1 - weight) + next.ou * weight,
    ee: current.ee * (1 - weight) + next.ee * weight,
    oh: current.oh * (1 - weight) + next.oh * weight,
    open: current.open * (1 - weight) + next.open * weight
  };
}

function blendVisemes(a: SpeechVisemes, b: SpeechVisemes, weight: number): SpeechVisemes {
  const inverse = 1 - weight;
  return {
    aa: a.aa * inverse + b.aa * weight,
    ih: a.ih * inverse + b.ih * weight,
    ou: a.ou * inverse + b.ou * weight,
    ee: a.ee * inverse + b.ee * weight,
    oh: a.oh * inverse + b.oh * weight,
    open: a.open * inverse + b.open * weight
  };
}

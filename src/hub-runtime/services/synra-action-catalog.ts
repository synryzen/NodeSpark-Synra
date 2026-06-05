import type { SynraExpression, SynraMode } from "../types/avatar";

export type SynraMotionFamily =
  | "wave"
  | "look"
  | "nod"
  | "shake"
  | "point"
  | "bow"
  | "stretch"
  | "jump"
  | "walk"
  | "turn"
  | "celebrate"
  | "reassure"
  | "curious"
  | "explain"
  | "focus"
  | "listen"
  | "shy"
  | "think"
  | "idle"
  | "emote";

export type SynraActionDirection =
  | "left"
  | "right"
  | "up"
  | "down"
  | "center"
  | "forward"
  | "back"
  | "small"
  | "big";

export interface SynraActionDefinition {
  id: string;
  label: string;
  group: string;
  family: SynraMotionFamily;
  message: string;
  expression: SynraExpression;
  mode: SynraMode;
  direction?: SynraActionDirection;
  intensity?: number;
  tempo?: number;
}

export interface SynraActionIntent {
  id: string;
  family: SynraMotionFamily;
  direction: SynraActionDirection;
  intensity: number;
  tempo: number;
  expression: SynraExpression;
  mode: SynraMode;
  message: string;
}

export type SynraLocalMotionMappingQuality = "good" | "acceptable" | "bad_semantic_fit" | "needs_custom_motion" | "disabled";

export interface SynraLocalMotionMappingQualityEntry {
  actionId: string;
  clipId: string;
  quality: SynraLocalMotionMappingQuality;
  notes: string;
}

export type SynraAssistantMotionPresetUsage = "assistant" | "demoOnly";

export interface SynraAssistantMotionPreset {
  actionId: string;
  clipId: string;
  usage: SynraAssistantMotionPresetUsage;
  quality: SynraLocalMotionMappingQuality;
  proceduralFallback?: string;
  notes: string;
}

const ACTIONS: SynraActionDefinition[] = [
  { id: "wave", label: "Wave", group: "Greetings", family: "wave", message: "Hi. I'm right here.", expression: "happy", mode: "idle", intensity: 0.92 },
  { id: "wave_big", label: "Big wave", group: "Greetings", family: "wave", message: "Hi! I'm really here now.", expression: "delighted", mode: "idle", direction: "big", intensity: 1.18, tempo: 1.16 },
  { id: "wave_shy", label: "Soft wave", group: "Greetings", family: "wave", message: "Hi. I'm glad you're here.", expression: "blush", mode: "idle", direction: "small", intensity: 0.64, tempo: 0.78 },
  { id: "wave_quick", label: "Quick hi", group: "Greetings", family: "wave", message: "Quick hello.", expression: "bright", mode: "idle", intensity: 0.78, tempo: 1.35 },
  { id: "wave_slow", label: "Slow wave", group: "Greetings", family: "wave", message: "Hello. I'm listening.", expression: "soft_smile", mode: "idle", intensity: 0.72, tempo: 0.62 },
  { id: "wave_excited", label: "Excited hi", group: "Greetings", family: "wave", message: "Hey! I see you.", expression: "delighted", mode: "idle", direction: "big", intensity: 1.22, tempo: 1.32 },
  { id: "wave_polite", label: "Polite wave", group: "Greetings", family: "wave", message: "Hello.", expression: "soft_smile", mode: "idle", intensity: 0.72 },
  { id: "wave_camera", label: "Camera hello", group: "Greetings", family: "wave", message: "Hello, camera is active.", expression: "attentive", mode: "idle", intensity: 0.84 },
  { id: "greet_bow", label: "Greet bow", group: "Greetings", family: "bow", message: "Nice to meet you.", expression: "soft_smile", mode: "idle", intensity: 0.78 },
  { id: "hello_present", label: "Hello present", group: "Greetings", family: "explain", message: "I'm here to help.", expression: "bright", mode: "speaking", intensity: 0.72 },
  { id: "return_center", label: "Return center", group: "Greetings", family: "look", message: "Back with you.", expression: "attentive", mode: "idle", direction: "center", intensity: 0.76 },
  { id: "wake_ready", label: "Wake ready", group: "Greetings", family: "listen", message: "Ready.", expression: "attentive", mode: "listening", intensity: 0.8 },

  { id: "look_left", label: "Look left", group: "Gaze", family: "look", message: "Looking left.", expression: "curious", mode: "idle", direction: "left", intensity: 1 },
  { id: "look_right", label: "Look right", group: "Gaze", family: "look", message: "Looking right.", expression: "curious", mode: "idle", direction: "right", intensity: 1 },
  { id: "look_up", label: "Look up", group: "Gaze", family: "look", message: "Looking up.", expression: "curious", mode: "idle", direction: "up", intensity: 1 },
  { id: "look_down", label: "Look down", group: "Gaze", family: "look", message: "Looking down.", expression: "focused", mode: "idle", direction: "down", intensity: 1 },
  { id: "look_center", label: "Look center", group: "Gaze", family: "look", message: "Looking forward.", expression: "attentive", mode: "idle", direction: "center", intensity: 0.7 },
  { id: "look_scan_left", label: "Scan left", group: "Gaze", family: "look", message: "Scanning left.", expression: "focused", mode: "idle", direction: "left", intensity: 0.78, tempo: 0.7 },
  { id: "look_scan_right", label: "Scan right", group: "Gaze", family: "look", message: "Scanning right.", expression: "focused", mode: "idle", direction: "right", intensity: 0.78, tempo: 0.7 },
  { id: "look_camera", label: "Watch camera", group: "Gaze", family: "look", message: "Watching the camera.", expression: "attentive", mode: "listening", direction: "center", intensity: 0.92 },
  { id: "look_screen", label: "Read screen", group: "Gaze", family: "look", message: "Reading the screen.", expression: "focused", mode: "idle", direction: "down", intensity: 0.72 },
  { id: "look_user", label: "Look at user", group: "Gaze", family: "look", message: "Looking at you.", expression: "attentive", mode: "listening", direction: "center", intensity: 0.9 },
  { id: "lookaround", label: "Look around", group: "Gaze", family: "curious", message: "Looking around.", expression: "curious", mode: "idle", intensity: 0.82 },
  { id: "curious_peek", label: "Curious peek", group: "Gaze", family: "curious", message: "I'm checking that.", expression: "curious", mode: "idle", direction: "left", intensity: 0.72 },
  { id: "camera_check", label: "Camera check", group: "Gaze", family: "look", message: "Camera check.", expression: "attentive", mode: "listening", direction: "center", intensity: 0.82 },
  { id: "notice_alert", label: "Notice alert", group: "Gaze", family: "look", message: "I noticed that.", expression: "surprised" as SynraExpression, mode: "idle", direction: "up", intensity: 0.88 },

  { id: "nod_yes", label: "Yes", group: "Agreement", family: "nod", message: "Yes. I'm with you.", expression: "bright", mode: "idle", intensity: 0.94 },
  { id: "nod_soft", label: "Soft yes", group: "Agreement", family: "nod", message: "Yes.", expression: "soft_smile", mode: "idle", intensity: 0.58, tempo: 0.75 },
  { id: "nod_confirm", label: "Confirm", group: "Agreement", family: "nod", message: "Confirmed.", expression: "focused", mode: "idle", intensity: 0.82 },
  { id: "nod_fast", label: "Fast yes", group: "Agreement", family: "nod", message: "Absolutely.", expression: "delighted", mode: "idle", intensity: 1.05, tempo: 1.25 },
  { id: "soft_nod", label: "Soft nod", group: "Agreement", family: "nod", message: "I understand.", expression: "attentive", mode: "idle", intensity: 0.56, tempo: 0.65 },
  { id: "shake_no", label: "No", group: "Agreement", family: "shake", message: "No. That is not the right move.", expression: "confused", mode: "idle", intensity: 0.92 },
  { id: "shake_soft", label: "Soft no", group: "Agreement", family: "shake", message: "Not quite.", expression: "reassure", mode: "idle", intensity: 0.58, tempo: 0.8 },
  { id: "shake_alert", label: "Alert no", group: "Agreement", family: "shake", message: "Hold on.", expression: "focused", mode: "idle", intensity: 1.08, tempo: 1.2 },
  { id: "agree_present", label: "Agree present", group: "Agreement", family: "explain", message: "That works.", expression: "bright", mode: "speaking", intensity: 0.68 },
  { id: "disagree_gentle", label: "Gentle disagree", group: "Agreement", family: "reassure", message: "I would choose another path.", expression: "reassure", mode: "speaking", intensity: 0.72 },

  { id: "happy_bounce", label: "Happy bounce", group: "Emotion", family: "celebrate", message: "That went well.", expression: "happy", mode: "idle", intensity: 0.78 },
  { id: "celebrate", label: "Celebrate", group: "Emotion", family: "celebrate", message: "We did it.", expression: "delighted", mode: "idle", intensity: 1.04 },
  { id: "celebrate_big", label: "Big celebrate", group: "Emotion", family: "celebrate", message: "That was perfect.", expression: "delighted", mode: "idle", direction: "big", intensity: 1.22 },
  { id: "smile_soft", label: "Soft smile", group: "Emotion", family: "emote", message: "I'm here.", expression: "soft_smile", mode: "idle", intensity: 0.55 },
  { id: "smile_bright", label: "Bright smile", group: "Emotion", family: "emote", message: "I'm happy to help.", expression: "bright", mode: "idle", intensity: 0.74 },
  { id: "blush_smile", label: "Blush", group: "Emotion", family: "shy", message: "Thank you.", expression: "blush", mode: "idle", intensity: 0.7 },
  { id: "shy_smile", label: "Shy smile", group: "Emotion", family: "shy", message: "I'm glad.", expression: "blush", mode: "idle", intensity: 0.62 },
  { id: "confused_tilt", label: "Confused", group: "Emotion", family: "curious", message: "I'm not sure yet.", expression: "confused", mode: "idle", direction: "right", intensity: 0.82 },
  { id: "surprised_pop", label: "Surprised", group: "Emotion", family: "emote", message: "Oh.", expression: "curious", mode: "idle", direction: "up", intensity: 0.9 },
  { id: "reassure", label: "Reassure", group: "Emotion", family: "reassure", message: "I'm here with you.", expression: "reassure", mode: "speaking", intensity: 0.84 },
  { id: "comfort", label: "Comfort", group: "Emotion", family: "reassure", message: "We'll take it step by step.", expression: "reassure", mode: "speaking", intensity: 0.74 },
  { id: "concerned", label: "Concerned", group: "Emotion", family: "reassure", message: "I see the problem.", expression: "reassure", mode: "idle", intensity: 0.68 },
  { id: "focused_ready", label: "Focused", group: "Emotion", family: "focus", message: "I'm focused.", expression: "focused", mode: "thinking", intensity: 0.8 },
  { id: "thinking", label: "Thinking", group: "Emotion", family: "think", message: "Thinking.", expression: "thinking", mode: "thinking", intensity: 0.72 },
  { id: "attentive", label: "Attentive", group: "Emotion", family: "listen", message: "I'm listening.", expression: "attentive", mode: "listening", intensity: 0.78 },
  { id: "idle_breathe", label: "Idle alive", group: "Emotion", family: "idle", message: "Staying present.", expression: "soft_smile", mode: "idle", intensity: 0.5 },
  { id: "proud", label: "Proud", group: "Emotion", family: "celebrate", message: "Nice work.", expression: "delighted", mode: "idle", intensity: 0.76 },
  { id: "gentle", label: "Gentle", group: "Emotion", family: "reassure", message: "Gently.", expression: "reassure", mode: "idle", intensity: 0.58 },

  { id: "point", label: "Point", group: "Explain", family: "point", message: "Pointing it out.", expression: "focused", mode: "speaking", intensity: 0.9 },
  { id: "point_left", label: "Point left", group: "Explain", family: "point", message: "Over here.", expression: "focused", mode: "speaking", direction: "left", intensity: 0.82 },
  { id: "point_right", label: "Point right", group: "Explain", family: "point", message: "Over there.", expression: "focused", mode: "speaking", direction: "right", intensity: 0.82 },
  { id: "present", label: "Present", group: "Explain", family: "explain", message: "Here is what matters.", expression: "focused", mode: "speaking", intensity: 0.76 },
  { id: "attentive_present", label: "Task present", group: "Explain", family: "explain", message: "I'm focused on the task.", expression: "focused", mode: "speaking", intensity: 0.8 },
  { id: "explain", label: "Explain", group: "Explain", family: "explain", message: "Let me explain.", expression: "focused", mode: "speaking", intensity: 0.72 },
  { id: "explain_step", label: "Step explain", group: "Explain", family: "explain", message: "Step by step.", expression: "focused", mode: "speaking", intensity: 0.86, tempo: 0.86 },
  { id: "explain_big", label: "Big explain", group: "Explain", family: "explain", message: "This is important.", expression: "bright", mode: "speaking", intensity: 1.02 },
  { id: "show_screen", label: "Show screen", group: "Explain", family: "point", message: "Look at this part.", expression: "focused", mode: "speaking", direction: "down", intensity: 0.74 },
  { id: "show_panel", label: "Show panel", group: "Explain", family: "point", message: "This panel.", expression: "focused", mode: "speaking", direction: "right", intensity: 0.78 },
  { id: "teach", label: "Teach", group: "Explain", family: "explain", message: "I'll walk through it.", expression: "focused", mode: "speaking", intensity: 0.72 },
  { id: "answer", label: "Answer", group: "Explain", family: "explain", message: "Here is my answer.", expression: "bright", mode: "speaking", intensity: 0.66 },
  { id: "compare", label: "Compare", group: "Explain", family: "explain", message: "Comparing options.", expression: "focused", mode: "speaking", intensity: 0.78 },
  { id: "summarize", label: "Summarize", group: "Explain", family: "explain", message: "Quick summary.", expression: "attentive", mode: "speaking", intensity: 0.62 },
  { id: "ask_question", label: "Ask", group: "Explain", family: "curious", message: "I have a question.", expression: "curious", mode: "speaking", intensity: 0.72 },
  { id: "decision", label: "Decide", group: "Explain", family: "focus", message: "I made a decision.", expression: "focused", mode: "speaking", intensity: 0.8 },

  { id: "mic_listen", label: "Mic listen", group: "App Control", family: "listen", message: "Listening.", expression: "attentive", mode: "listening", intensity: 0.82 },
  { id: "mic_off_ack", label: "Mic off ack", group: "App Control", family: "nod", message: "Mic off.", expression: "soft_smile", mode: "idle", intensity: 0.48 },
  { id: "camera_on", label: "Camera on", group: "App Control", family: "look", message: "Camera on.", expression: "attentive", mode: "listening", direction: "center", intensity: 0.86 },
  { id: "camera_off", label: "Camera off", group: "App Control", family: "nod", message: "Camera off.", expression: "soft_smile", mode: "idle", intensity: 0.48 },
  { id: "device_scan", label: "Device scan", group: "App Control", family: "curious", message: "Scanning devices.", expression: "focused", mode: "thinking", intensity: 0.84 },
  { id: "workflow_start", label: "Workflow start", group: "App Control", family: "focus", message: "Starting workflow.", expression: "focused", mode: "thinking", intensity: 0.86 },
  { id: "workflow_done", label: "Workflow done", group: "App Control", family: "celebrate", message: "Workflow complete.", expression: "delighted", mode: "idle", intensity: 0.94 },
  { id: "settings_open", label: "Settings", group: "App Control", family: "point", message: "Opening settings.", expression: "focused", mode: "speaking", direction: "right", intensity: 0.72 },
  { id: "home_return", label: "Home", group: "App Control", family: "look", message: "Returning home.", expression: "attentive", mode: "idle", direction: "center", intensity: 0.7 },
  { id: "notify_user", label: "Notify", group: "App Control", family: "wave", message: "I have something for you.", expression: "attentive", mode: "idle", intensity: 0.66 },
  { id: "approval_needed", label: "Approval", group: "App Control", family: "reassure", message: "I need approval.", expression: "reassure", mode: "speaking", intensity: 0.72 },
  { id: "error_calm", label: "Error calm", group: "App Control", family: "reassure", message: "I found an error.", expression: "reassure", mode: "speaking", intensity: 0.82 },
  { id: "success_ping", label: "Success", group: "App Control", family: "celebrate", message: "Success.", expression: "bright", mode: "idle", intensity: 0.76 },
  { id: "wait_hold", label: "Wait", group: "App Control", family: "think", message: "Waiting.", expression: "thinking", mode: "thinking", intensity: 0.58 },

  { id: "walk", label: "Walk", group: "Body", family: "walk", message: "Stepping forward.", expression: "attentive", mode: "walking", intensity: 0.82 },
  { id: "walk_forward", label: "Walk forward", group: "Body", family: "walk", message: "Walking forward.", expression: "attentive", mode: "walking", direction: "forward", intensity: 0.9 },
  { id: "step_left", label: "Step left", group: "Body", family: "walk", message: "Step left.", expression: "attentive", mode: "walking", direction: "left", intensity: 0.64 },
  { id: "step_right", label: "Step right", group: "Body", family: "walk", message: "Step right.", expression: "attentive", mode: "walking", direction: "right", intensity: 0.64 },
  { id: "turn_left", label: "Turn left", group: "Body", family: "turn", message: "Turning left.", expression: "attentive", mode: "idle", direction: "left", intensity: 0.86 },
  { id: "turn_right", label: "Turn right", group: "Body", family: "turn", message: "Turning right.", expression: "attentive", mode: "idle", direction: "right", intensity: 0.86 },
  { id: "jump", label: "Jump", group: "Body", family: "jump", message: "Crouch. Launch. Land.", expression: "delighted", mode: "idle", intensity: 0.94 },
  { id: "hop_small", label: "Small hop", group: "Body", family: "jump", message: "Small hop.", expression: "happy", mode: "idle", direction: "small", intensity: 0.62 },
  { id: "stretch", label: "Stretch", group: "Body", family: "stretch", message: "Quick reset.", expression: "soft_smile", mode: "idle", intensity: 0.82 },
  { id: "stretch_big", label: "Big stretch", group: "Body", family: "stretch", message: "Big reset.", expression: "relaxed" as SynraExpression, mode: "idle", direction: "big", intensity: 1.06 },
  { id: "bow", label: "Bow", group: "Body", family: "bow", message: "Thank you.", expression: "soft_smile", mode: "idle", intensity: 0.8 },
  { id: "bow_deep", label: "Deep bow", group: "Body", family: "bow", message: "Thank you very much.", expression: "soft_smile", mode: "idle", direction: "big", intensity: 1.08 },
  { id: "balance_shift", label: "Balance shift", group: "Body", family: "idle", message: "Staying balanced.", expression: "soft_smile", mode: "idle", intensity: 0.58 },
  { id: "shoulder_shift", label: "Shoulder shift", group: "Body", family: "emote", message: "Adjusting.", expression: "attentive", mode: "idle", intensity: 0.62 },
  { id: "hand_fidget", label: "Hand fidget", group: "Body", family: "emote", message: "Thinking with my hands.", expression: "thinking", mode: "thinking", intensity: 0.58 },
  { id: "lean_in", label: "Lean in", group: "Body", family: "listen", message: "I'm paying attention.", expression: "attentive", mode: "listening", intensity: 0.84 },
  { id: "lean_back", label: "Lean back", group: "Body", family: "emote", message: "Taking a breath.", expression: "relaxed" as SynraExpression, mode: "idle", intensity: 0.58 },
  { id: "reset_pose", label: "Reset pose", group: "Body", family: "idle", message: "Pose reset.", expression: "soft_smile", mode: "idle", intensity: 0.5 },

  { id: "playful", label: "Playful", group: "Playful", family: "celebrate", message: "Let's make it fun.", expression: "happy", mode: "idle", intensity: 0.74 },
  { id: "tiny_dance", label: "Tiny dance", group: "Playful", family: "celebrate", message: "Tiny dance.", expression: "delighted", mode: "idle", intensity: 0.92, tempo: 1.18 },
  { id: "ta_da", label: "Ta da", group: "Playful", family: "celebrate", message: "Ta da.", expression: "delighted", mode: "idle", direction: "big", intensity: 1.06 },
  { id: "wink_energy", label: "Wink energy", group: "Playful", family: "emote", message: "I've got this.", expression: "happy", mode: "idle", intensity: 0.72 },
  { id: "cute_pose", label: "Cute pose", group: "Playful", family: "shy", message: "Cute pose.", expression: "blush", mode: "idle", intensity: 0.76 },
  { id: "ready_pose", label: "Ready pose", group: "Playful", family: "focus", message: "Ready.", expression: "attentive", mode: "idle", intensity: 0.72 },
  { id: "victory_small", label: "Small victory", group: "Playful", family: "celebrate", message: "Small victory.", expression: "bright", mode: "idle", intensity: 0.7 },
  { id: "victory_big", label: "Big victory", group: "Playful", family: "celebrate", message: "Big victory.", expression: "delighted", mode: "idle", direction: "big", intensity: 1.16 },
  { id: "spark_pose", label: "Spark pose", group: "Playful", family: "explain", message: "Spark mode.", expression: "bright", mode: "speaking", intensity: 0.82 },
  { id: "sign_off", label: "Sign off", group: "Playful", family: "wave", message: "I'll be right here.", expression: "soft_smile", mode: "idle", direction: "small", intensity: 0.62 }
];

const LOCAL_INSTALLED_ACTIONS: SynraActionDefinition[] = [
  { id: "local_stand_1", label: "Calm idle stance", group: "Installed VRMA: Core", family: "idle", message: "Installed calm idle stance.", expression: "soft_smile", mode: "idle" },
  { id: "local_stand_2", label: "Attentive listening stance", group: "Installed VRMA: Core", family: "listen", message: "Installed attentive listening stance.", expression: "attentive", mode: "listening" },
  { id: "local_stand_3", label: "Ready speaking stance", group: "Installed VRMA: Core", family: "idle", message: "Installed ready speaking stance.", expression: "bright", mode: "speaking" },
  { id: "local_head_in_hands", label: "Worried thinking pose", group: "Installed VRMA: Core", family: "think", message: "Installed worried thinking motion.", expression: "thinking", mode: "thinking" },
  { id: "local_vroid_greeting", label: "Friendly greeting wave", group: "Installed VRMA: Gestures", family: "wave", message: "Installed friendly greeting wave.", expression: "happy", mode: "idle" },
  { id: "local_vroid_peace_sign", label: "Peace-sign success", group: "Installed VRMA: Gestures", family: "celebrate", message: "Installed peace-sign success motion.", expression: "delighted", mode: "idle" },
  { id: "local_vroid_shoot", label: "Dramatic point forward", group: "Installed VRMA: Gestures", family: "point", message: "Installed dramatic point motion.", expression: "focused", mode: "speaking" },
  { id: "local_vroid_model_pose", label: "Presentation model pose", group: "Installed VRMA: Gestures", family: "explain", message: "Installed presentation model pose.", expression: "focused", mode: "speaking" },
  { id: "local_vroid_show_full_body", label: "Full-body showcase", group: "Installed VRMA: Gestures", family: "walk", message: "Installed full-body showcase motion.", expression: "attentive", mode: "walking" },
  { id: "local_vroid_spin", label: "Full-body spin", group: "Installed VRMA: Gestures", family: "turn", message: "Installed full-body spin motion.", expression: "delighted", mode: "idle" },
  { id: "local_vroid_squat", label: "Squat / lower-body test", group: "Installed VRMA: Gestures", family: "jump", message: "Installed squat motion.", expression: "focused", mode: "idle" },
  { id: "local_hello_1", label: "Casual hello wave", group: "Installed VRMA: Gestures", family: "wave", message: "Installed casual hello motion.", expression: "happy", mode: "idle" },
  { id: "local_arm_swing", label: "Big two-arm wave", group: "Installed VRMA: Gestures", family: "wave", message: "Installed big two-arm wave.", expression: "delighted", mode: "idle" },
  { id: "local_head_shake", label: "No / head shake", group: "Installed VRMA: Gestures", family: "shake", message: "Installed no/head-shake motion.", expression: "confused", mode: "idle" },
  { id: "local_encourage", label: "Encouraging cheer", group: "Installed VRMA: Gestures", family: "reassure", message: "Installed encouraging cheer motion.", expression: "reassure", mode: "speaking" },
  { id: "local_startle", label: "Startled alert", group: "Installed VRMA: Gestures", family: "emote", message: "Installed startled alert motion.", expression: "curious", mode: "idle" },
  { id: "local_head_tilt", label: "Confused head tilt", group: "Installed VRMA: Gestures", family: "curious", message: "Installed confused head tilt.", expression: "confused", mode: "idle" },
  { id: "local_smartphone", label: "Looking at phone/screen", group: "Installed VRMA: Gestures", family: "look", message: "Installed screen focus motion.", expression: "focused", mode: "idle" },
  { id: "local_motion_pose", label: "Explain / body-language pose", group: "Installed VRMA: Gestures", family: "explain", message: "Installed explain body-language pose.", expression: "focused", mode: "speaking" },
  { id: "local_dogeza", label: "Deep apology bow", group: "Installed VRMA: Gestures", family: "bow", message: "Installed deep apology bow.", expression: "soft_smile", mode: "idle" },
  { id: "local_humidai", label: "Step up / platform pose", group: "Installed VRMA: Gestures", family: "walk", message: "Installed step-up motion.", expression: "attentive", mode: "walking" },
  { id: "local_drinkwater", label: "Drink water", group: "Installed VRMA: Gestures", family: "emote", message: "Installed drink water motion.", expression: "relaxed" as SynraExpression, mode: "idle" },
  { id: "local_turn_1", label: "Look back left", group: "Installed VRMA: Gestures", family: "look", message: "Installed look-back-left turn.", expression: "curious", mode: "idle", direction: "left" },
  { id: "local_turn_2", label: "Look back right", group: "Installed VRMA: Gestures", family: "look", message: "Installed look-back-right turn.", expression: "curious", mode: "idle", direction: "right" },
  { id: "local_jump", label: "Straight jump", group: "Installed VRMA: Gestures", family: "jump", message: "Installed straight jump.", expression: "delighted", mode: "idle" },
  { id: "local_jump_2", label: "Energetic jump", group: "Installed VRMA: Gestures", family: "jump", message: "Installed energetic jump.", expression: "happy", mode: "idle" },
  { id: "local_stand_4", label: "Relaxed side stance", group: "Installed VRMA: Poses", family: "idle", message: "Installed relaxed side stance.", expression: "soft_smile", mode: "idle" },
  { id: "local_stand_5", label: "Casual hand pose", group: "Installed VRMA: Poses", family: "idle", message: "Installed casual hand pose.", expression: "soft_smile", mode: "idle" },
  { id: "local_stand_6", label: "Attentive hands-together pose", group: "Installed VRMA: Poses", family: "listen", message: "Installed attentive hands-together pose.", expression: "attentive", mode: "listening" },
  { id: "local_nio_dachi", label: "Confident power stance", group: "Installed VRMA: Poses", family: "celebrate", message: "Installed confident power stance.", expression: "delighted", mode: "idle" },
  { id: "local_nio_dachi_uchimata", label: "Cute inward-toe stance", group: "Installed VRMA: Poses", family: "shy", message: "Installed cute inward-toe stance.", expression: "blush", mode: "idle" },
  { id: "local_float_1", label: "Floating idle pose", group: "Installed VRMA: Poses", family: "idle", message: "Installed floating idle pose.", expression: "relaxed" as SynraExpression, mode: "idle" },
  { id: "local_float_2", label: "Floating hover pose", group: "Installed VRMA: Poses", family: "idle", message: "Installed floating hover pose.", expression: "relaxed" as SynraExpression, mode: "idle" },
  { id: "local_float_3", label: "Floating curled pose", group: "Installed VRMA: Poses", family: "idle", message: "Installed floating curled pose.", expression: "relaxed" as SynraExpression, mode: "idle" },
  { id: "local_sit_1", label: "Floor sitting pose", group: "Installed VRMA: Poses", family: "idle", message: "Installed floor sitting pose.", expression: "relaxed" as SynraExpression, mode: "idle" },
  { id: "local_sit_2", label: "Relaxed sitting pose", group: "Installed VRMA: Poses", family: "idle", message: "Installed relaxed sitting pose.", expression: "relaxed" as SynraExpression, mode: "idle" },
  { id: "local_sit_3", label: "Side sitting pose", group: "Installed VRMA: Poses", family: "idle", message: "Installed side sitting pose.", expression: "relaxed" as SynraExpression, mode: "idle" },
  { id: "local_relaxed_peace", label: "Relaxed peace sign", group: "Installed VRMA: Gestures", family: "celebrate", message: "Installed relaxed peace-sign pose.", expression: "happy", mode: "idle" },
  { id: "local_number_one_up", label: "Number-one pose upward", group: "Installed VRMA: Gestures", family: "celebrate", message: "Installed number-one-up pose.", expression: "delighted", mode: "idle" },
  { id: "local_number_one_front", label: "Number-one pose forward", group: "Installed VRMA: Gestures", family: "celebrate", message: "Installed number-one-forward pose.", expression: "bright", mode: "idle" },
  { id: "local_two_fist_ready", label: "Two-fist ready stance", group: "Installed VRMA: Gestures", family: "focus", message: "Installed two-fist ready stance.", expression: "focused", mode: "thinking" },
  { id: "local_ground_hand_stance", label: "One-hand ground stance", group: "Installed VRMA: Gestures", family: "focus", message: "Installed one-hand ground stance.", expression: "focused", mode: "thinking" },
  { id: "local_arm_guard", label: "Defensive arm guard", group: "Installed VRMA: Gestures", family: "reassure", message: "Installed defensive arm guard.", expression: "focused", mode: "idle" },
  { id: "local_roll_up_sleeves", label: "Roll-up-sleeves ready pose", group: "Installed VRMA: Gestures", family: "focus", message: "Installed roll-up-sleeves ready pose.", expression: "focused", mode: "thinking" },
  { id: "local_dash_run", label: "Dash running pose", group: "Installed VRMA: Gestures", family: "walk", message: "Installed dash running pose.", expression: "focused", mode: "walking" },
  { id: "local_running_loop", label: "Running loop", group: "Installed VRMA: Gestures", family: "walk", message: "Installed running loop.", expression: "attentive", mode: "walking" },
  { id: "local_cool_sit", label: "Cool sitting pose", group: "Installed VRMA: Poses", family: "idle", message: "Installed cool sitting pose.", expression: "relaxed" as SynraExpression, mode: "idle" },
  { id: "local_one_leg_balance", label: "One-leg balance pose", group: "Installed VRMA: Poses", family: "idle", message: "Installed one-leg balance pose.", expression: "attentive", mode: "idle" }
];

const ALL_ACTIONS = [...ACTIONS, ...LOCAL_INSTALLED_ACTIONS];
const MANUAL_CONTROL_GROUPS = new Set(["Greetings", "Gaze", "Agreement", "Installed VRMA: Core", "Installed VRMA: Gestures", "Installed VRMA: Poses"]);
const ACTION_MAP = new Map(ALL_ACTIONS.map((action) => [action.id, action]));
const HUMAN_ACTION_SPEED = 0.78;

const FALLBACK_BY_TOKEN: Array<[RegExp, Partial<SynraActionIntent>]> = [
  [/\bwave|hello|hi|greet\b/, { family: "wave", expression: "happy" }],
  [/\blook.*left|left\b/, { family: "look", direction: "left", expression: "curious" }],
  [/\blook.*right|right\b/, { family: "look", direction: "right", expression: "curious" }],
  [/\blook.*up|up\b/, { family: "look", direction: "up", expression: "curious" }],
  [/\blook.*down|down|screen\b/, { family: "look", direction: "down", expression: "focused" }],
  [/\bnod|yes|confirm|success\b/, { family: "nod", expression: "bright" }],
  [/\bshake|no|stop|error\b/, { family: "shake", expression: "confused" }],
  [/\bpoint|show\b/, { family: "point", expression: "focused", mode: "speaking" }],
  [/\bpresent|explain|teach|answer|talk\b/, { family: "explain", expression: "focused", mode: "speaking" }],
  [/\bbow|thanks|thank\b/, { family: "bow", expression: "soft_smile" }],
  [/\bstretch|reset\b/, { family: "stretch", expression: "soft_smile" }],
  [/\bjump|hop\b/, { family: "jump", expression: "happy" }],
  [/\bwalk|step\b/, { family: "walk", expression: "attentive", mode: "walking" }],
  [/\bturn\b/, { family: "turn", expression: "attentive" }],
  [/\bcelebrate|victory|done|complete\b/, { family: "celebrate", expression: "delighted" }],
  [/\breassure|comfort|sorry|failed\b/, { family: "reassure", expression: "reassure", mode: "speaking" }],
  [/\bcurious|confused|question\b/, { family: "curious", expression: "curious" }],
  [/\bfocus|workflow|task\b/, { family: "focus", expression: "focused", mode: "thinking" }],
  [/\blisten|mic|camera\b/, { family: "listen", expression: "attentive", mode: "listening" }],
  [/\bshy|blush|cute\b/, { family: "shy", expression: "blush" }],
  [/\bthink|wait\b/, { family: "think", expression: "thinking", mode: "thinking" }]
];

export const SYNRA_ACTION_CATALOG = ALL_ACTIONS;

const LOCAL_INSTALLED_CLIP_BY_ACTION: Record<string, string> = {
  local_arm_guard: "Local_Ten_ArmGuard",
  local_arm_swing: "Local_ArmSwing",
  local_cool_sit: "Local_Ten_CoolSit",
  local_dash_run: "Local_Ten_DashRun",
  local_dogeza: "Local_Fumi_Dogeza",
  local_drinkwater: "Local_Fumi_DrinkWater",
  local_encourage: "Local_Fumi_Encourage",
  local_float_1: "Local_Rolock_Float1",
  local_float_2: "Local_Rolock_Float2",
  local_float_3: "Local_Rolock_Float3",
  local_ground_hand_stance: "Local_Ten_GroundHandStance",
  local_head_in_hands: "Local_Rolock_HeadInHands",
  local_head_shake: "Local_Azuki_HeadShake",
  local_head_tilt: "Local_Rolock_HeadTilt",
  local_hello_1: "Local_Fumi_Hello",
  local_humidai: "Local_Fumi_Humidai",
  local_jump: "Local_Rolock_Jump",
  local_jump_2: "Local_Rolock_Jump2",
  local_motion_pose: "Local_Fumi_MotionPose",
  local_nio_dachi: "Local_Rolock_NioDachi",
  local_nio_dachi_uchimata: "Local_Rolock_NioDachiUchimata",
  local_number_one_front: "Local_Ten_NumberOneFront",
  local_number_one_up: "Local_Ten_NumberOneUp",
  local_one_leg_balance: "Local_Ten_OneLegBalance",
  local_relaxed_peace: "Local_Ten_RelaxedPeace",
  local_roll_up_sleeves: "Local_Ten_RollUpSleeves",
  local_running_loop: "Local_RunLoop",
  local_sit_1: "Local_Rolock_Sit1",
  local_sit_2: "Local_Rolock_Sit2",
  local_sit_3: "Local_Rolock_Sit3",
  local_smartphone: "Local_Fumi_Smartphone",
  local_stand_1: "Local_Rolock_Stand1",
  local_stand_2: "Local_Rolock_Stand2",
  local_stand_3: "Local_Rolock_Stand3",
  local_stand_4: "Local_Rolock_Stand4",
  local_stand_5: "Local_Rolock_Stand5",
  local_stand_6: "Local_Rolock_Stand6",
  local_startle: "Local_Fumi_Startle",
  local_turn_1: "Local_Rolock_Turn1",
  local_turn_2: "Local_Rolock_Turn2",
  local_two_fist_ready: "Local_Ten_DoubleFistReady",
  local_vroid_greeting: "Local_VRoid_Greeting",
  local_vroid_model_pose: "Local_VRoid_ModelPose",
  local_vroid_peace_sign: "Local_VRoid_PeaceSign",
  local_vroid_shoot: "Local_VRoid_Shoot",
  local_vroid_show_full_body: "Local_VRoid_ShowFullBody",
  local_vroid_spin: "Local_VRoid_Spin",
  local_vroid_squat: "Local_VRoid_Squat"
};

const LOCAL_INSTALLED_MAPPING_QUALITY: Record<string, SynraLocalMotionMappingQualityEntry> = {
  wave: { actionId: "wave", clipId: "Local_VRoid_Greeting", quality: "good", notes: "Reference-proven VRoid greeting motion; use full-body installed path." },
  wave_shy: { actionId: "wave_shy", clipId: "Local_VRoid_PeaceSign", quality: "acceptable", notes: "Readable friendly success/peace gesture; not a custom shy wave." },
  success: { actionId: "success", clipId: "Local_Ten_NumberOneUp", quality: "good", notes: "Clear positive acknowledgement without T-pose; falls back to peace only if manually selected." },
  proud: { actionId: "proud", clipId: "Local_Rolock_NioDachi", quality: "acceptable", notes: "Confident stance; monitor for over-strong posture." },
  present: { actionId: "present", clipId: "Talk_Present", quality: "acceptable", notes: "Assistant-specific chest-height present gesture; draft until visual QA is approved." },
  attentive_present: { actionId: "attentive_present", clipId: "Talk_Present", quality: "acceptable", notes: "Shares the assistant-specific present gesture for attentive speaking turns." },
  explain: { actionId: "explain", clipId: "Talk_Explain", quality: "acceptable", notes: "Assistant-specific explanation gesture; draft until visual QA is approved." },
  point: { actionId: "point", clipId: "Talk_PointRight", quality: "acceptable", notes: "Direct semantic point instead of the dramatic local-vendor shoot clip." },
  confirm: { actionId: "confirm", clipId: "Response_Confirm", quality: "acceptable", notes: "Readable assistant confirmation nod; draft until visual QA is approved." },
  thinking: { actionId: "thinking", clipId: "Local_Rolock_HeadInHands", quality: "acceptable", notes: "Readable thinking/worry pose; procedural thinking remains available if too heavy." },
  deny: { actionId: "deny", clipId: "Local_Azuki_HeadShake", quality: "good", notes: "Direct head-shake semantic fit." },
  confused: { actionId: "confused", clipId: "Emotion_ConfusedTilt", quality: "acceptable", notes: "Assistant-specific confused tilt with a clearer questioning cue." },
  idle: { actionId: "idle", clipId: "Local_Rolock_Stand1", quality: "good", notes: "Calm stance with runtime life overlays." },
  listening: { actionId: "listening", clipId: "Local_Rolock_Stand2", quality: "good", notes: "Attentive stance with gaze/life overlays." },
  speaking: { actionId: "speaking", clipId: "Local_Rolock_Stand3", quality: "acceptable", notes: "Stable speaking stance; gesture overlays/visemes carry speech." }
};

const SYNRA_ASSISTANT_MOTION_PRESET_MAP: Record<string, SynraAssistantMotionPreset> = {
  wave: {
    actionId: "wave",
    clipId: "Local_VRoid_Greeting",
    usage: "assistant",
    quality: "good",
    notes: "Primary greeting/wave preset; known-good VRoid motion and must play through localInstalledFullBody."
  },
  wave_big: {
    actionId: "wave_big",
    clipId: "Local_VRoid_Greeting",
    usage: "assistant",
    quality: "good",
    notes: "Use the same readable greeting motion rather than generated wave drafts."
  },
  wave_shy: {
    actionId: "wave_shy",
    clipId: "Local_VRoid_PeaceSign",
    usage: "assistant",
    quality: "acceptable",
    notes: "Friendly small-success/peace gesture; acceptable until a custom shy wave is chosen."
  },
  success: {
    actionId: "success",
    clipId: "Local_Ten_NumberOneUp",
    usage: "assistant",
    quality: "good",
    notes: "Warm success/proud acknowledgement with one-arm emphasis, no T-pose."
  },
  proud: {
    actionId: "proud",
    clipId: "Local_Ten_NumberOneUp",
    usage: "assistant",
    quality: "good",
    notes: "Use one-finger confident success pose instead of broad power/extreme poses."
  },
  present: {
    actionId: "present",
    clipId: "Talk_Present",
    usage: "assistant",
    quality: "acceptable",
    notes: "Assistant-specific chest-height present gesture; draft until visual QA is approved."
  },
  attentive_present: {
    actionId: "attentive_present",
    clipId: "Talk_Present",
    usage: "assistant",
    quality: "acceptable",
    notes: "Shares the assistant-specific present gesture for attentive speaking turns."
  },
  explain: {
    actionId: "explain",
    clipId: "Talk_Explain",
    usage: "assistant",
    quality: "acceptable",
    notes: "Assistant-specific explanation gesture; speaking visemes and gaze carry the rest."
  },
  point: {
    actionId: "point",
    clipId: "Talk_PointRight",
    usage: "assistant",
    quality: "acceptable",
    notes: "Direct semantic right-side point for app controls and panels."
  },
  point_left: {
    actionId: "point_left",
    clipId: "Talk_PointLeft",
    usage: "assistant",
    quality: "acceptable",
    notes: "Direct semantic left-side point for app surfaces."
  },
  point_right: {
    actionId: "point_right",
    clipId: "Talk_PointRight",
    usage: "assistant",
    quality: "acceptable",
    notes: "Direct semantic right-side point for app controls and panels."
  },
  confirm: {
    actionId: "confirm",
    clipId: "Response_Confirm",
    usage: "assistant",
    quality: "acceptable",
    notes: "Readable assistant confirmation nod; draft until visual QA is approved."
  },
  idle: {
    actionId: "idle",
    clipId: "Local_Rolock_Stand1",
    usage: "assistant",
    quality: "good",
    notes: "Calm base stance enhanced by living idle overlays."
  },
  listening: {
    actionId: "listening",
    clipId: "Local_Rolock_Stand2",
    usage: "assistant",
    quality: "good",
    notes: "Attentive stance for listening with independent gaze and life motion."
  },
  speaking: {
    actionId: "speaking",
    clipId: "Local_Rolock_Stand3",
    usage: "assistant",
    quality: "acceptable",
    notes: "Stable speaking stance; small gestures are layered through dispatcher/living state."
  },
  idle_breathe: {
    actionId: "idle_breathe",
    clipId: "Local_Rolock_Stand4",
    usage: "assistant",
    quality: "good",
    notes: "Visible but calm autonomous idle movement; keeps Synra from standing frozen."
  },
  shoulder_shift: {
    actionId: "shoulder_shift",
    clipId: "Local_Rolock_Stand4",
    usage: "assistant",
    quality: "good",
    notes: "Small posture change for autonomous idle life."
  },
  hand_fidget: {
    actionId: "hand_fidget",
    clipId: "Local_Rolock_HeadInHands",
    usage: "assistant",
    quality: "acceptable",
    notes: "Thoughtful hand motion for waiting/thinking moments."
  },
  lean_in: {
    actionId: "lean_in",
    clipId: "Local_Rolock_Stand6",
    usage: "assistant",
    quality: "good",
    notes: "Attentive lean for listening and engaged idle."
  },
  lean_back: {
    actionId: "lean_back",
    clipId: "Local_Rolock_Stand5",
    usage: "assistant",
    quality: "acceptable",
    notes: "Relaxed posture reset for autonomous idle variety."
  },
  nod_soft: {
    actionId: "nod_soft",
    clipId: "Local_Rolock_NioDachi",
    usage: "assistant",
    quality: "acceptable",
    notes: "Soft acknowledgement motion for ambient presence."
  },
  balance_shift: {
    actionId: "balance_shift",
    clipId: "Local_Rolock_Stand4",
    usage: "assistant",
    quality: "good",
    notes: "Subtle full-body weight shift for alive idle movement."
  },
  curious_peek: {
    actionId: "curious_peek",
    clipId: "Local_Rolock_HeadTilt",
    usage: "assistant",
    quality: "good",
    notes: "Small curious head/body movement for idle awareness."
  },
  thinking: {
    actionId: "thinking",
    clipId: "Local_Rolock_HeadInHands",
    usage: "assistant",
    quality: "acceptable",
    proceduralFallback: "thinking",
    notes: "Readable worried/thinking pose. Procedural thinking remains the fallback if it feels too heavy."
  },
  deny: {
    actionId: "deny",
    clipId: "Local_Azuki_HeadShake",
    usage: "assistant",
    quality: "good",
    notes: "Direct head-shake semantic fit."
  },
  confused: {
    actionId: "confused",
    clipId: "Emotion_ConfusedTilt",
    usage: "assistant",
    quality: "acceptable",
    notes: "Assistant-specific confused/head-tilt cue; draft until visual QA is approved."
  },
  reassure: {
    actionId: "reassure",
    clipId: "Local_Fumi_Encourage",
    usage: "assistant",
    quality: "acceptable",
    notes: "Encouraging support motion; use sparingly for reassurance."
  },
  alert: {
    actionId: "alert",
    clipId: "Local_Fumi_Startle",
    usage: "assistant",
    quality: "acceptable",
    notes: "Noticeable alert/startle motion; avoid repeating aggressively."
  },
  error: {
    actionId: "error",
    clipId: "Emotion_Concerned",
    usage: "assistant",
    quality: "acceptable",
    notes: "Concerned/error posture with visible hand cue. Use Local_Fumi_Dogeza only manually for severe apology."
  },
  severe_apology: {
    actionId: "severe_apology",
    clipId: "Local_Fumi_Dogeza",
    usage: "demoOnly",
    quality: "acceptable",
    notes: "Deep apology/bow is intentionally excluded from normal error states."
  },
  run: {
    actionId: "run",
    clipId: "Local_RunLoop",
    usage: "demoOnly",
    quality: "good",
    notes: "Locomotion demo only; never auto-route routine assistant states to running."
  },
  spin: {
    actionId: "spin",
    clipId: "Local_VRoid_Spin",
    usage: "demoOnly",
    quality: "good",
    notes: "Full-body spin stress test only; not a normal assistant success/turn."
  },
  squat: {
    actionId: "squat",
    clipId: "Local_VRoid_Squat",
    usage: "demoOnly",
    quality: "good",
    notes: "Lower-body stress test only."
  },
  jump: {
    actionId: "jump",
    clipId: "Local_Rolock_Jump",
    usage: "demoOnly",
    quality: "good",
    notes: "Jump demo only; keep out of normal assistant emotional states."
  },
  dash: {
    actionId: "dash",
    clipId: "Local_Ten_DashRun",
    usage: "demoOnly",
    quality: "good",
    notes: "Dash/run demo only."
  },
  one_leg_balance: {
    actionId: "one_leg_balance",
    clipId: "Local_Ten_OneLegBalance",
    usage: "demoOnly",
    quality: "good",
    notes: "Extreme balance pose demo only."
  },
  handstand: {
    actionId: "handstand",
    clipId: "Local_Ten_GroundHandStance",
    usage: "demoOnly",
    quality: "good",
    notes: "Extreme hand/ground stance demo only."
  },
  extreme_pose: {
    actionId: "extreme_pose",
    clipId: "Local_Rolock_Float3",
    usage: "demoOnly",
    quality: "acceptable",
    notes: "Extreme/floating pose family is demo-only."
  }
};

const SYNRA_DEMO_ONLY_CLIP_IDS = new Set(
  Object.values(SYNRA_ASSISTANT_MOTION_PRESET_MAP)
    .filter((preset) => preset.usage === "demoOnly")
    .map((preset) => preset.clipId)
);

export function getSynraLocalInstalledClipId(actionId: string): string | undefined {
  return LOCAL_INSTALLED_CLIP_BY_ACTION[actionId];
}

export function getSynraAssistantMotionPreset(actionId: string): SynraAssistantMotionPreset | undefined {
  return SYNRA_ASSISTANT_MOTION_PRESET_MAP[actionId];
}

export function getSynraAssistantMotionPresetByClipId(clipId: string): SynraAssistantMotionPreset | undefined {
  return Object.values(SYNRA_ASSISTANT_MOTION_PRESET_MAP).find((preset) => preset.clipId === clipId);
}

export function synraAssistantMotionPresetMap(): SynraAssistantMotionPreset[] {
  return Object.values(SYNRA_ASSISTANT_MOTION_PRESET_MAP);
}

export function isSynraDemoOnlyMotionClip(clipId: string): boolean {
  return SYNRA_DEMO_ONLY_CLIP_IDS.has(clipId);
}

export function getSynraLocalMotionMappingQuality(actionId: string): SynraLocalMotionMappingQualityEntry | undefined {
  return LOCAL_INSTALLED_MAPPING_QUALITY[actionId];
}

export function synraLocalMotionMappingQuality(): SynraLocalMotionMappingQualityEntry[] {
  return Object.values(LOCAL_INSTALLED_MAPPING_QUALITY);
}

export function getSynraAction(id: string): SynraActionDefinition | undefined {
  return ACTION_MAP.get(id);
}

export function synraActionGroups(): Array<{ group: string; actions: SynraActionDefinition[] }> {
  const groups: Array<{ group: string; actions: SynraActionDefinition[] }> = [];
  for (const action of ALL_ACTIONS) {
    if (!MANUAL_CONTROL_GROUPS.has(action.group)) continue;
    let group = groups.find((item) => item.group === action.group);
    if (!group) {
      group = { group: action.group, actions: [] };
      groups.push(group);
    }
    group.actions.push(action);
  }
  return groups;
}

export function resolveSynraActionIntent(idRaw: string): SynraActionIntent {
  const id = String(idRaw || "idle_breathe").trim() || "idle_breathe";
  const action = ACTION_MAP.get(id);
  if (action) return toIntent(action);

  const lower = id.toLowerCase();
  const fallback = FALLBACK_BY_TOKEN.find(([pattern]) => pattern.test(lower))?.[1] ?? {};
  return {
    id,
    family: fallback.family ?? "emote",
    direction: fallback.direction ?? (lower.includes("right") ? "right" : lower.includes("left") ? "left" : "center"),
    intensity: fallback.intensity ?? 0.68,
    tempo: fallback.tempo ?? 1,
    expression: fallback.expression ?? "soft_smile",
    mode: fallback.mode ?? "idle",
    message: readableMessage(id)
  };
}

export function synraActionDuration(id: string): number {
  const intent = resolveSynraActionIntent(id);
  const tempo = Math.min(1.05, Math.max(0.45, intent.tempo));
  const duration =
    intent.family === "wave" ? 2.9 :
      intent.family === "jump" ? 1.95 :
        intent.family === "walk" ? 5.2 :
          intent.family === "turn" ? 2.1 :
            intent.family === "look" ? 1.75 :
              intent.family === "point" ? 2.5 :
                intent.family === "bow" ? 2.25 :
                  intent.family === "stretch" ? 2.85 :
                    intent.family === "celebrate" ? 2.45 :
                      intent.family === "explain" ? 2.55 :
                        intent.family === "think" ? 2.3 :
                          intent.family === "listen" ? 2.0 :
                            intent.family === "curious" ? 2.2 :
                              intent.family === "reassure" ? 2.45 :
                                intent.family === "shy" ? 2.45 :
                                  intent.family === "nod" || intent.family === "shake" ? 1.8 : 2.1;
  return duration / tempo / HUMAN_ACTION_SPEED;
}

function toIntent(action: SynraActionDefinition): SynraActionIntent {
  return {
    id: action.id,
    family: action.family,
    direction: action.direction ?? "center",
    intensity: action.intensity ?? 0.75,
    tempo: action.tempo ?? 1,
    expression: action.expression,
    mode: action.mode,
    message: action.message
  };
}

function readableMessage(id: string): string {
  const readable = id.replace(/[_-]+/g, " ").trim();
  return readable ? `${readable.charAt(0).toUpperCase()}${readable.slice(1)}.` : "Ready.";
}

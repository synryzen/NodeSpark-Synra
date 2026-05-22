# Synra Experience Spec

Synra is the embodied face of NodeSparkHub. She is not a mascot, wallpaper, or
simple avatar. She is the operator presence that makes the Hub feel alive.

## North Star

The user should feel that NodeSparkHub has a real place in the room:

- Synra lives on the Jetson monitor as a persistent character stage.
- She keeps the same identity across NodeSparkHub, Wisp devices, and future
  hardware.
- She reacts to local context through webcam, microphone, workflow state, and
  approvals.
- She explains what she is doing without becoming noisy or cartoonish.
- She has agency and attitude, while still being useful and trustworthy.

## Character Look

Synra should remain close to the supplied reference image:

- Adult anime woman.
- Long black hair with layered strands and physics-ready movement.
- Violet eyes, confident expression, soft but sharp personality.
- Black NodeSparkHub outfit with purple accents, jewelry, and branded details.
- Premium developer-studio atmosphere instead of a generic sci-fi assistant.

The Live2D model must be rigged for real facial and body animation. PNG motion is
only a temporary fallback while the Cubism model is being built.

## Stage Feel

The monitor should feel like a dedicated AI stage:

- Cinematic full-screen composition.
- Character first, status panels second.
- Dark physical-space mood with restrained cyan, violet, and gold signal colors.
- Subtle camera-aware gaze and posture shifts.
- Workflow state shown as operational telemetry around her, not generic chat UI.

## Core Loops

```text
presence -> listen -> understand -> act -> report -> remember
```

The key user-facing loops:

- Voice request: user speaks, Synra listens, sends request to NodeSparkHub, then
  speaks and animates the reply.
- Workflow execution: Synra shifts into focused mode, shows progress, then
  celebrates or calmly explains failures.
- Approval: Synra asks clearly before sensitive or expensive actions.
- Local awareness: camera/mic state influences gaze, idle energy, and attention.
- Memory: repeated requests should become suggested workflows or skills.

## Animation Requirements

Minimum Live2D behavior:

- Breathing and idle body sway.
- Natural blinking and eye tracking.
- Mouth shapes driven by speech.
- Hair and accessory physics.
- Expression changes for neutral, attentive, focused, happy, concerned, curious,
  and wink.
- Motion groups for idle, listen, think, talk, success, concerned, and approval.

Future behavior:

- Audio-driven visemes instead of simple mouth-open values.
- Webcam-aware head/gaze movement.
- Gesture overlays for approvals, celebrations, and warnings.
- Memory-driven personalization of how Synra greets and responds.

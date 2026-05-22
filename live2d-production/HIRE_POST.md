# Live2D Artist/Rigger Posting

## Title

Live2D Cubism artist/rigger needed for adult anime AI assistant character

## Project

I am building NodeSpark Synra, the visual AI operator for NodeSparkHub. Synra
will run on a dedicated Jetson-powered monitor and act as a persistent,
voice-driven assistant with facial expressions, talking animation, idle motion,
camera-aware presence, and workflow state reactions.

I need a high-quality Live2D Cubism model that closely follows the provided
reference image:

- Adult anime woman.
- Long black hair.
- Violet eyes.
- Confident soft expression.
- Black NodeSparkHub outfit.
- Purple jewelry/accent lights.
- Premium developer-studio mood.

This is not a simple PNG animation job. I need layered source art and a real
Live2D rig.

## Required Deliverables

- Layered PSD source art.
- Live2D Cubism project source.
- Exported web/runtime model pack.
- Expressions:
  - neutral
  - happy
  - attentive
  - focused
  - curious
  - concerned
  - wink
- Motion groups:
  - idle
  - listen
  - think
  - talk
  - success
  - concerned
  - approval
- Physics:
  - hair
  - earrings
  - necklace/choker
  - subtle outfit movement
- Web runtime export:
  - `synra.model3.json`
  - `.moc3`
  - textures
  - motions
  - expressions
  - physics
  - pose, if used

## Technical Acceptance

The exported pack must pass the provided validator:

```bash
bash scripts/check_live2d_assets.sh
```

The model must run locally in a browser without relying on remote CDN assets.

## Portfolio Fit

Please send examples of:

- Anime Live2D characters.
- Hair and accessory physics.
- Facial expression rigs.
- Speaking/talking rigs.
- Runtime/web exports if available.

## Milestones

1. Character sketch or cleanup plan.
2. Layered PSD delivery.
3. Basic Cubism rig preview.
4. Expression and motion pass.
5. Runtime export and validator pass.
6. Final polish pass.

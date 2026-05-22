# Synra Art Brief

## Character Identity

NodeSpark Synra is the embodied operator for NodeSparkHub. She should feel like
an intelligent adult anime character who belongs in a premium developer studio:
confident, warm, sharp, attractive, capable, and slightly playful.

The supplied reference image is the visual anchor:

- Adult anime woman.
- Long black hair with individual strand movement.
- Violet eyes.
- Soft confident expression.
- Black outfit with NodeSparkHub branding.
- Purple gem jewelry and violet accent light.
- Premium studio/desk mood, not a generic sci-fi hologram.

## Art Style

- Polished modern anime rendering.
- Clean line work that supports Live2D deformation.
- High detail face, eyes, hair, outfit, jewelry, and hands.
- Slightly cinematic lighting: dark base, violet/cyan accents, warm skin tones.
- No chibi proportions.
- No simplified mascot style.
- No hardware-cube replacement for the character.

## Canvas

Recommended source art:

```text
4096 x 6144 px
transparent character pass
separate optional background pass
waist-up framing
```

The rig should support monitor framing from bust-up to upper-body. Keep enough
off-canvas margin around hair and arms so head turns and body sway do not clip.

## Required Layer Philosophy

Every part that should move independently needs its own layer. Do not merge
parts just because they look similar in the still image.

Important independent movement:

- Bangs and front hair strands.
- Side hair and back hair.
- Eyelids, irises, pupils, and highlights.
- Brows.
- Mouth shapes and inner mouth.
- Neck, head, torso, shoulders, arms, and hand.
- Shirt panels, collar, lace, folds, and logo.
- Earrings, choker gem, necklace, and pendant.

## Expression Goals

Synra needs expressions that read clearly at monitor distance:

- Neutral: calm, soft smile.
- Attentive: engaged listening, slightly widened eyes.
- Focused: narrowed eyes, lower brows, thinking posture.
- Happy: warm smile, brighter eyes.
- Curious: raised brow, small smile.
- Concerned: worried brows, restrained mouth.
- Wink: playful success moment.

## Notes For Artist

The final PSD should be organized, named, and grouped for rigging. Use the
included `layer_manifest.json` as the naming target. If a layer must be split
further for clean deformation, split it rather than forcing the rigger to paint
repairs later.

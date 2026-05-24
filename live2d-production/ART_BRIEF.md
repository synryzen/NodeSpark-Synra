# Synra Art Brief

## Character Identity

NodeSpark Synra is the embodied operator for NodeSparkHub. She should feel like
an intelligent adult anime character who belongs in a premium developer studio:
confident, warm, sharp, attractive, capable, and slightly playful.

The supplied references are the visual anchor:

- Adult anime woman.
- Long dark hair for Synra, with individual strand movement.
- Violet eyes.
- Soft confident expression.
- A pretty fantasy-idol dress inspired by the supplied blue-and-white dress
  reference, adapted for NodeSpark Synra.
- Purple/blue gem jewelry and violet/cyan accent light.
- Premium studio/desk mood, not a generic sci-fi hologram.

## Required Dress Direction

The dress must look like a polished Live2D character outfit, not a flat sticker
or apron. It should clearly follow the supplied dress reference:

- Blue fitted bodice with curved waist shaping.
- White sweetheart bust/chest panel with soft fabric highlights and lace edge.
- Small dark neck ribbon with a gem or gold center.
- Off-shoulder blue frilled sleeves with visible ruffle edges and bow ties.
- Layered flared skirt with a dark navy underskirt.
- Blue outer skirt panels with star/sparkle detail.
- Pale blue triangular folded panels along the front skirt.
- White ruffled petticoat/hem visible beneath the skirt.
- Small white waist bow at center front.
- Asymmetrical leg detail: one thigh garter/ribbon and one white striped thigh
  stocking, unless the final model framing makes full legs unnecessary.
- Dark shoes with bow or strap detail if legs are included.
- NodeSpark identity should be subtle: a small gem, logo charm, or tiny
  embroidered mark, not a large corporate patch.

Avoid boxy overlays, apron shapes, flat rectangles, block sleeves, or any
element that looks pasted on top of the body.

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
- Bodice panels, white bust panel, lace, neck ribbon, sleeve ruffles, sleeve
  bows, waist bow, skirt panels, underskirt, petticoat frills, garter, stocking
  stripes, shoes, jewelry, and subtle NodeSpark gem/logo detail.
- Earrings, choker gem, necklace, pendant, ribbon tails, and skirt/frill tips.

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

## Required Wave Pose Reference

The wave must match the supplied two-palms-forward reference:

- Both elbows slightly away from the body.
- Upper arms angle naturally down from the shoulder.
- Forearms are in front of the upper arms, not tucked behind the biceps.
- Forearms are near vertical.
- Wrists are straight and relaxed.
- Palms face the screen clearly.
- Fingers are spread evenly and readable.
- Thumb side and pinky side must look anatomically correct; no twisted wrists.
- Shoulder, chest, head, and hair should move subtly with the gesture.

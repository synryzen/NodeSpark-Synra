# Synra Live2D Acceptance Checklist

## Art

- [ ] Character still matches the supplied Synra reference.
- [ ] Adult anime proportions and polished rendering are preserved.
- [ ] Hair, eyes, outfit, jewelry, and NodeSpark branding are clear.
- [ ] Dress matches the supplied blue-and-white reference silhouette.
- [ ] Dress has a white sweetheart bust panel, blue bodice, off-shoulder frilled
      sleeves, layered blue skirt, dark underskirt, white ruffled petticoat,
      center bow, and sparkle/gem detail.
- [ ] Dress does not read as an apron, flat overlay, boxy panel, or simple
      shirt-and-skirt recolor.
- [ ] No important part clips during head or body movement.
- [ ] Texture quality holds up on a full-size monitor.

## Rig

- [ ] Head turns left and right smoothly.
- [ ] Head tilts up and down smoothly.
- [ ] Body follows head movement subtly.
- [ ] Breathing is visible but not exaggerated.
- [ ] Blinking is natural.
- [ ] Eye tracking works in both directions.
- [ ] Mouth opens and closes cleanly for speech.
- [ ] Hair physics feel soft and layered.
- [ ] Jewelry physics react without jitter.
- [ ] Clothing movement is subtle and premium.
- [ ] Wave motion matches the two-palms-forward reference.
- [ ] Wave elbows sit slightly out from the body with forearms in front of the
      upper arms.
- [ ] Wave palms face the screen with straight relaxed wrists and evenly spread
      fingers.
- [ ] No elbow cracks, forearms behind biceps, twisted wrists, or sideways palms
      during the wave.

## Expressions

- [ ] neutral
- [ ] soft_smile
- [ ] happy
- [ ] attentive
- [ ] focused
- [ ] curious
- [ ] concerned
- [ ] wink
- [ ] confused
- [ ] sad
- [ ] delighted
- [ ] playful
- [ ] determined
- [ ] look_left
- [ ] look_right
- [ ] look_up
- [ ] look_down

## Motions

- [ ] idle
- [ ] idle_shift
- [ ] listen
- [ ] think
- [ ] talk
- [ ] success
- [ ] concerned
- [ ] approval
- [ ] wave
- [ ] explain
- [ ] stretch
- [ ] delighted
- [ ] playful
- [ ] curious
- [ ] confused
- [ ] sad
- [ ] determined
- [ ] look_left
- [ ] look_right
- [ ] look_up
- [ ] look_down
- [ ] soft_nod
- [ ] hair_tuck

## App Integration

- [ ] `bash synra/scripts/check_live2d_assets.sh` passes.
- [ ] Synra replaces the PNG fallback in the monitor UI.
- [ ] Voice speech opens the mouth.
- [ ] Listening mode changes expression/motion.
- [ ] Thinking mode changes expression/motion.
- [ ] Success mode changes expression/motion.
- [ ] Error/warning mode changes expression/motion.
- [ ] Idle mode occasionally plays subtle idle_shift, soft_nod, hair_tuck, or
      stretch motion without interrupting active work.
- [ ] Speech combines mouth motion with expression and body movement.
- [ ] Model remains centered on the Jetson display.
- [ ] Model runs smoothly enough for the Jetson Orin Nano.

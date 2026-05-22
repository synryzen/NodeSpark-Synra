# Synra Live2D Acceptance Checklist

## Art

- [ ] Character still matches the supplied Synra reference.
- [ ] Adult anime proportions and polished rendering are preserved.
- [ ] Hair, eyes, outfit, jewelry, and NodeSpark branding are clear.
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

## Expressions

- [ ] neutral
- [ ] happy
- [ ] attentive
- [ ] focused
- [ ] curious
- [ ] concerned
- [ ] wink

## Motions

- [ ] idle
- [ ] listen
- [ ] think
- [ ] talk
- [ ] success
- [ ] concerned
- [ ] approval

## App Integration

- [ ] `bash synra/scripts/check_live2d_assets.sh` passes.
- [ ] Synra replaces the PNG fallback in the monitor UI.
- [ ] Voice speech opens the mouth.
- [ ] Listening mode changes expression/motion.
- [ ] Thinking mode changes expression/motion.
- [ ] Success mode changes expression/motion.
- [ ] Error/warning mode changes expression/motion.
- [ ] Model remains centered on the Jetson display.
- [ ] Model runs smoothly enough for the Jetson Orin Nano.

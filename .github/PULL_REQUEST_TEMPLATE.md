## Summary

Describe what changed and why.

## Area

- [ ] Avatar / motion
- [ ] Voice / lip sync
- [ ] Vision / camera
- [ ] Home Assistant
- [ ] NodeSparkHub
- [ ] Jetson deployment / performance
- [ ] UI / settings
- [ ] Documentation

## Verification

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run perf:smoke`
- [ ] `python3 -m py_compile scripts/synra_server.py`
- [ ] Station checks if relevant: `npm run station:typecheck && npm run station:test`

## Screenshots

Add screenshots or short clips for visible UI/avatar changes.

## Safety

- [ ] No secrets, tokens, private logs, raw camera frames, raw audio, or face samples are included.
- [ ] Smart-home and NodeSpark actions still require confirmation when relevant.
- [ ] Synra Classic remains the first/default avatar and no `.vrm` or `.vrma` assets were deleted.

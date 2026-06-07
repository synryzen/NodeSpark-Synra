# Security Policy

Synra handles local model endpoints, Home Assistant tokens, ElevenLabs credentials, optional NodeSparkHub pairing tokens, camera access, microphone access, local memory, and optional face samples. Please treat security and privacy issues carefully.

## Reporting Security Issues

Do not open a public GitHub issue for:

- Exposed credentials or tokens.
- Bypass of smart-home or NodeSpark confirmation flows.
- Camera, microphone, memory, or face-sample privacy bugs.
- Path traversal, command execution, local file disclosure, or service abuse.
- Deployment scripts that could leak secrets or overwrite user data.

Instead, contact the maintainer privately through the repository owner profile or App Store support channel. Include a concise description, affected commit/version, reproduction steps, and whether any secret or personal data may have been exposed.

## Supported Version

Security fixes are currently targeted at the latest `main` branch and the active App Store/Jetson release line.

## Safe Handling Rules

- Do not paste real API keys, Home Assistant tokens, ElevenLabs keys, NodeSpark tokens, or private IP credentials into issues or PRs.
- Redact logs before sharing them.
- Do not upload raw camera frames, raw audio, face samples, or private home-device names unless they are synthetic test data.
- Keep backup/restore changes secret-free by default.

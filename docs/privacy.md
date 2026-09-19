# Privacy

## MVP data inventory

| Data | Location | Retention |
| --- | --- | --- |
| Camera preview | Browser memory | Ends with the call |
| Microphone audio | WebRTC session with OpenAI | Governed by configured API controls |
| Bodyweight | Browser localStorage | Until cleared by the user/site data |
| OpenAI API key | Server process environment | Process lifetime |
| Transcript text | Visible browser state | Current page session only |

## Observer boundary

- Camera frames are processed in browser memory and are not uploaded or persisted.
- Small capture previews use temporary in-memory object URLs only for post-call review. They are revoked after confirmation, discard, or an incomplete call.
- Captures store derived quality values, pose values, and normalized landmarks only after user confirmation.
- The MediaPipe JavaScript/WASM runtime and face-landmark model are currently downloaded from pinned public asset URLs when the Observer first starts. Camera data is not sent to those hosts.
- A future packaging pass will bundle these runtime assets locally for fully offline model initialization.

## Current guarantees

- Camera tracks are not attached to the OpenAI peer connection.
- The server receives SDP signaling, not camera frames.
- The browser never receives the permanent OpenAI API key.
- Local history can be deleted from the interface.
- The server binds to `127.0.0.1` by default.
- `.env` files and common secret-bearing local files are ignored by Git.

## Deployment warning

This MVP is designed for localhost or a private authenticated network. The Realtime broker spends from the configured OpenAI account. Do not expose it directly on a public host without authentication, request quotas, abuse controls, and HTTPS.

## Known limitations

- Browser localStorage is not an encrypted health database.
- Clearing site data removes local history.
- Device backups and browser synchronization behavior depend on the browser/platform.
- The live audio path uses a cloud API and is therefore not fully local.
- This repository has not yet undergone an independent security audit.

## Planned privacy work

- Encrypted local structured storage
- Explicit export and full-reset controls
- Per-session data disclosure view
- Private-device authentication
- Retention controls for future checkpoint images
- Crash-safe deletion of temporary media buffers

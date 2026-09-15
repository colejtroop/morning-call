# Morning Call

A local-first, voice-led morning check-in for personal bio-optimization.

Morning Call combines a FaceTime-style camera interface with realtime AI conversation, structured bodyweight capture, and local history. It is the first working slice of a larger personal health-observation system built around one principle:

> Observe → remember → quantify → compare → infer → communicate → adapt

> [!NOTE]
> This is an early MVP for personal experimentation, not a medical device or diagnostic system.

## Overview

The user starts a call, grants camera and microphone access, and speaks naturally. The assistant asks for morning weight, records it through a typed function call, and keeps the interaction brief. Camera video remains in the browser; the current MVP does not perform visual measurement.

## Features

- Phone-first live camera call interface
- Low-latency AI voice over WebRTC
- Structured bodyweight capture from conversation
- Manual entry when voice is unavailable
- Local browser-based history
- Camera flip, microphone mute, timer, and offline states
- Server-side OpenAI API-key isolation
- Zero runtime dependencies

## Architecture

```text
┌──────────────────────── Browser ────────────────────────┐
│ Camera preview                 Local weight history     │
│ Microphone ── WebRTC ───────────────┐                   │
│ Data channel ◀── tool events ───────┤                   │
└─────────────────────────────────────┼───────────────────┘
                                      │ SDP only
┌──────────────────── Local server ───▼───────────────────┐
│ Static client  │  health endpoint  │  Realtime broker  │
│                                      API key stays here │
└─────────────────────────────────────┬───────────────────┘
                                      │
                              OpenAI Realtime API
```

The AI voice does not inspect camera frames or approve captures. A later deterministic Observer will own landmark detection, pose validation, and measurements.

See [Architecture](docs/architecture.md) and [Privacy](docs/privacy.md) for the design boundaries.

## Getting Started

### Requirements

- Node.js 20 or newer
- An OpenAI API key with API billing enabled
- A browser with WebRTC and `getUserMedia` support

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/morning-call.git
cd morning-call
```

Set the API key in your shell. Never place it in client code.

macOS/Linux:

```bash
export OPENAI_API_KEY="your-key"
npm start
```

PowerShell:

```powershell
$env:OPENAI_API_KEY = "your-key"
.\scripts\start.ps1
```

Open `http://127.0.0.1:8787`, press **CALL**, and allow camera and microphone access.

## Phone Testing

Mobile camera and microphone access require HTTPS. Keep the server bound to localhost and expose it through a private HTTPS route such as Tailscale Serve. Do not expose the Realtime broker directly to the public internet without authentication and rate limiting.

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Run the local server |
| `npm run dev` | Run with server reloads |
| `npm run check` | Syntax-check server and client entry points |
| `npm test` | Run the Node test suite |
| `npm run validate` | Run all repository checks |

## Project Structure

```text
.
├── docs/                 Architecture, privacy, and roadmap
├── scripts/              Local development helpers
├── src/
│   ├── client/           Browser UI and interaction logic
│   └── server/           HTTP server and Realtime broker
├── tests/                Server and domain tests
├── .env.example          Supported environment variables
├── LICENSE
├── package.json
└── README.md
```

## MVP Status

Implemented:

- Call shell and camera preview
- Realtime WebRTC negotiation boundary
- Voice-triggered weight tool
- Local history and manual fallback
- Offline/error behavior
- Automated HTTP and weight-domain tests

Still requiring device validation:

- Live voice call with a configured API key
- iPhone Safari camera/microphone behavior
- Private HTTPS phone access
- Audio interruption and spoken-weight accuracy

See the [Roadmap](docs/roadmap.md) for the next milestones.

## Privacy

Camera frames remain local in this MVP. Microphone audio is sent to an OpenAI Realtime session during a connected call, and bodyweight history is stored in the browser's local storage. Review [docs/privacy.md](docs/privacy.md) before deployment.

## License

Licensed under the [MIT License](LICENSE).

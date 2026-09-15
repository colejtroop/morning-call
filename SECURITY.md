# Security Policy

## Supported version

Morning Call is an early MVP. Security fixes target the latest commit on the default branch.

## Reporting a vulnerability

Please report vulnerabilities privately to the repository owner rather than opening a public issue. Include the affected component, reproduction steps, and potential impact without including real API keys, health data, recordings, or other sensitive information.

## Deployment scope

The current server is intended for localhost or a private authenticated network. It is not hardened for anonymous public deployment. In particular, the Realtime call endpoint can spend from the server owner's OpenAI account and must be protected before public hosting.

# shotbylove

Browser-first peer-to-peer file transfer.

**The file should not be uploaded to the application server.** The page introduces two browsers, establishes an encrypted WebRTC data channel, and moves file chunks directly between them whenever network topology allows it.

## v0

This is an architectural test build:

- GitHub Pages static frontend
- installable PWA shell
- 128-bit session secrets stored in the URL fragment
- HMAC-authenticated signaling envelopes
- WebRTC DataChannel
- chunked file transfer
- RTCDataChannel backpressure
- receiver approval before transfer
- OPFS streaming receive sink when available
- memory fallback for smaller files
- progress and throughput display
- native Share API and copyable join link

### Temporary signaling transport

v0 uses the public ntfy.sh service only as a signaling bus. The room topic is derived from a SHA-256 hash of the session secret, and signaling envelopes are authenticated with HMAC-SHA256 using that secret. The secret itself stays in the URL fragment.

**File bytes are never published to ntfy.**

The signaling layer is deliberately replaceable. A later version will use a dedicated service while the P2P transfer layer stays independent.

### Current network limitation

v0 has STUN but no TURN relay. Restrictive NAT/firewall combinations can therefore fail to connect. TURN is part of the production architecture.

## Run locally

Serve the repository over HTTP(S), not file://.

\`\`\`bash
python -m http.server 8080
\`\`\`

For cross-device testing, use the deployed HTTPS GitHub Pages site.

- Architecture: docs/ARCHITECTURE.md
- Protocol: docs/PROTOCOL.md
- Security: docs/SECURITY.md

## Status

Experimental v0. Do not depend on this build for the only copy of important data.

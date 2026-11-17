# Architecture (v0.2.0)

## Static application

GitHub Pages serves static HTML, CSS, JavaScript, QR libraries and the PWA service worker. No files are stored on the application server.

## QR-first pairing and session persistence

1. On first visit, the browser generates a random 128-bit secret, keeps it in local storage and immediately renders a QR for `#join/<secret>`.
2. A second browser scans the QR (external camera or bundled in-app scanner). The link immediately opens the same session.
3. A short display label is derived from SHA-256, but only the full secret or link can be used to join.
4. Each browser has a persistent local device identifier and a fresh random signaling client ID per tab.
5. Both browsers derive the same `ntfy.sh` topic and authenticate signaling envelopes with HMAC-SHA256.
6. Each browser announces its presence. An existing browser replies once to a new announcement.
7. The lexicographically smaller active client ID makes the Offer; the other answers. There is no durable host/guest role.
8. Targeted SDP/ICE messages are addressed to the active client ID.
9. After the DataChannel opens, files move over the WebRTC peer-to-peer connection.

## Reconnection

On RTC failure, disconnection or channel close, the browser discards its former RTCPeerConnection and any incomplete transfer sink, retains the session secret and initiates another handshake. A remaining browser does not endlessly publish presence messages; it listens for a newly joined browser.

Reloading a device preserves the locally stored secret and device identifier. A new tab ID differentiates old and new negotiations. An intentionally selected new code starts a separate room.

Browser sleep/background policies, signaling service unavailability and NAT restrictions can prevent timely reconnection.

## Transfer plane

The transfer protocol remains ordered/reliable RTCDataChannel binary chunks plus JSON control frames. File transfer interruption requires resend; offset resume is not implemented.

## Planned production work

- Dedicated signaling service and presence management
- Authenticated TURN relay with short-lived credentials
- Transfer checkpoint and resumable chunk protocol
- File integrity hash verification
- Browser/device compatibility tests

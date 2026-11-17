# shotbylove

QR-first, browser-to-browser file transfer.

Open **https://enzolisianthus.github.io/shotbylove/**. A pairing QR and **Scan QR code** button appear immediately. Scan the QR on another device (using its normal camera or the in-app scanner), and both devices join the same session automatically. No account, host selection, or separate room creation step is needed.

## v0.2.0 features

- QR code on the home screen, with built-in camera and image QR scanning
- automatic session creation and immediate joining from `#join/<secret>` links
- the same private session link saved locally for reopening/reconnecting
- a stable, locally generated device identifier to recognize a returning device
- symmetric peer discovery: either device can create the WebRTC offer
- reconnect the WebRTC session when the peer leaves, reconnects, or the data channel fails
- WebRTC DataChannel, chunking/backpressure, per-file consent, progress, OPFS sink and memory fallback
- copy/share link, installable PWA, and QR assets bundled locally

The short code displayed on screen is a **visual session label**, not a join key. To join manually, paste the **full link** or **22-character secret**. A displayed QR encodes the full link.

### How reconnect works

Both devices keep the same secret while in the session. If one goes offline or reloads, the remaining browser waits with the same QR. When the other device returns with that link, the browsers renegotiate WebRTC. The original sender/receiver role does not matter.

**An interrupted file must currently be selected and sent again.** This release reconnects the peer connection; it does not resume a partly transferred file.

### Temporary signaling and network limits

GitHub Pages only hosts static assets. The public `ntfy.sh` service exchanges HMAC-authenticated hello/offer/answer/ICE messages; file contents are not published there. Presence announcements happen at join/rejoin, not as a high-frequency background heartbeat. This is important because the public service enforces usage limits.

There is **STUN but no TURN relay**. Some NAT/firewall/mobile-network combinations will still fail regardless of reconnect attempts. A dedicated signaling service and TURN are needed for production-level connection reliability.

Session URLs/QRs are bearer secrets; anyone who possesses them can join. The secret is also kept in this browser's local storage so the session can be reopened.

### Run locally

Serve the repository over HTTP(S), not `file://`:

```bash
python -m http.server 8080
```

Cross-device camera pairing requires a secure context, so use the deployed HTTPS Pages site. QR libraries are included under `vendor/` with their respective licenses.

See `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md` and `docs/SECURITY.md`.

**Status:** Experimental v0.2.0. Do not rely on this build for the only copy of important data.

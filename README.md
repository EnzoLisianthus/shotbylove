# shotbylove

QR-first peer-to-peer file transfer with a focused, app-style mobile experience.

## v0.3.0

The UI has three distinct scenes:

1. **Pair:** Show your QR immediately, scan another device's QR, share the link, or enter a session link.
2. **Connecting:** Show matching, connection, and reconnection status, without the QR and transfer controls.
3. **Transfer:** Display the file picker, transfer progress, and incoming file requests after the WebRTC data channel opens.

You can reopen the QR from the connecting and transfer scenes without leaving the underlying session. Scanning a QR or opening an invite link automatically enters the same session.

### Installed mobile PWA

- iOS standalone metadata with a dedicated 180×180 Apple touch icon
- Installable Android manifest with 192×192 and 512×512 PNG icons
- Screen-height layouts adapted to small displays, landscape mode, display cutouts and safe areas
- Touch-sized controls, camera scanner overlay, native share/save actions and transitions
- Local PWA caching for offline app-shell loading (transfer requires network connectivity)
- Compact labels rather than long technical explanations

For iOS, install through Safari's **Share → Add to Home Screen**. For Android, use your browser's **Install app** action if supported.

### Connection and transfer

- No required host/guest choice
- Session key and local device identifier persist for reconnection
- Peer negotiation is rebuilt after a connection is interrupted
- The startup signaling race (signaling connected before the peer exists) is guarded
- HMAC-authenticated signaling through the temporary public `ntfy.sh` service
- Ordered WebRTC DataChannel, chunking/backpressure, receiving consent, OPFS/memory fallback and transfer progress

**Limitations:** STUN without TURN cannot connect every network pair. An interrupted file must be resent; partial-file resume is not implemented. The short display code is only a visual label, not an entry key. A full QR link or 22-character session secret is required.

### Development

Run from an HTTP(S) server, not `file://`:

```bash
python -m http.server 8080
```

For phone-to-phone testing, use the deployed HTTPS GitHub Pages application:

https://enzolisianthus.github.io/shotbylove/

See `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, and `docs/SECURITY.md`.

**Status:** Experimental. Do not use this as the sole means of transferring irreplaceable files.

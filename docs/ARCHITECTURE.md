# Architecture

## Static application

GitHub Pages hosts only static files. It does not run a signaling server, TURN server, file store, or authentication backend.

All deployed paths are relative so the application works under the project path /shotbylove/.

## Session establishment

1. Host generates a cryptographically random 128-bit session secret.
2. The secret is placed only in the URL fragment.
3. Both clients derive the same signaling topic from SHA-256 of the secret.
4. Each signaling message is authenticated with HMAC-SHA256 using the original secret.
5. The guest announces itself.
6. The host creates the WebRTC offer.
7. Offer, answer and ICE candidates pass through the signaling adapter.
8. Once the DataChannel is open, file data no longer uses signaling.

## v0 signaling adapter

NtfySignaling is a temporary transport adapter using ntfy.sh SSE plus its publish API. It lets a GitHub Pages-only v0 be exercised on real devices before a dedicated backend exists.

## Data plane

The data plane is a reliable ordered RTCDataChannel.

The sender slices the File, limits chunk size, watches bufferedAmount, pauses above a high-water mark, and resumes after bufferedamountlow.

The receiver prefers OPFS as a streaming temporary sink and falls back to memory only when needed.

## Production additions

- dedicated signaling service
- TURN with short-lived credentials
- resumable transfers
- multi-file and folder manifests
- end-to-end content hash verification
- connection recovery
- compatibility test matrix

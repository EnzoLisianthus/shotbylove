# Security

## Protected properties

WebRTC DataChannel traffic is encrypted in transit by the WebRTC transport stack.

v0 session secrets use crypto.getRandomValues and contain 128 bits of randomness.

The join secret lives in the URL fragment, which is not part of the HTTP request to GitHub Pages.

The public signaling topic is derived from a SHA-256 hash of the session secret. Signaling messages are additionally authenticated with HMAC-SHA256 using the original secret.

## Temporary signaling provider visibility

The v0 signaling provider can observe the derived topic identifier, signed signaling envelopes, SDP/ICE data required to introduce peers, timing, and network-level metadata.

It does not receive the application file payload.

## v0 limitations

- no TURN relay yet
- no cryptographic whole-file checksum yet
- the public signaling provider is a temporary development dependency
- session links are bearer secrets
- a compromised browser or device can access files selected by that browser

Use v0 for testing, not as the sole transport for irreplaceable data.

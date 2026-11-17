# Security (v0.2.0)

WebRTC DataChannel traffic is encrypted in transit by the WebRTC transport stack.

Session secrets are generated with `crypto.getRandomValues` and contain 128 bits of randomness. They are carried in URL fragments (not in the HTTP request to GitHub Pages). The QR includes the entire link and therefore reveals the bearer secret to anybody who can see or scan it.

The secret is also saved in the browser's local storage for later reconnection. A locally generated device ID is used only to recognize a returning browser, **not** as cryptographic device authentication.

Signaling topics are derived from SHA-256 of the secret. Signaling envelopes are authenticated with HMAC-SHA256 and include timestamps and replay-detection sequence numbers. The public `ntfy.sh` signaling service can observe the derived topic, the envelope contents, SDP/ICE data, timing and network metadata, but **not application file bytes**.

### Experimental limitations

- No TURN relay yet; restrictive network paths may be unavailable
- No independent whole-file content checksum
- The signaling provider is a temporary development dependency with public service limits
- Session links are bearer secrets; anyone with a full link can join a waiting session
- Browsers/devices compromised at the endpoint may access files selected there
- This release does not resume partially transferred files

Do not use the experimental build as the sole means of moving irreplaceable data.

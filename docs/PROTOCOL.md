# Protocol v0.2.0

## Signaling

Protocol envelope version `v=2`. Messages contain `v`, `room`, `from`, `seq`, `ts`, `type`, `payload` and `sig`. HMAC-SHA256 signs the ordered envelope fields. Timestamp rejects messages older than two minutes (assuming reasonably synchronized device clocks). Duplicate sequence numbers per sender are ignored, without assuming that asynchronous signature verification preserves arrival order.

- `hello`: room presence, local device identifier, optional response marker
- `offer`: targeted RTCSessionDescription
- `answer`: targeted RTCSessionDescription
- `ice`: targeted ICE candidate

A short display label does not grant access. Only the full 128-bit secret does.

## File transfer

One ordered reliable WebRTC DataChannel is used. Text frames are JSON control messages, and binary frames are payload chunks for the accepted incoming file.

- `file-offer`: file metadata and transfer UUID
- `file-accept`: receiver authorizes the file after preparing storage
- `file-reject`: receiver refuses or is busy
- `file-done`: sender queued every byte
- `file-received`: receiver finished storing and verified the byte count
- `cancel`: cancel the active transfer

## Limits

- One concurrent outbound file per peer
- Interrupted transfers are discarded, not resumed
- No whole-file cryptographic checksum yet
- Completion validates the byte count and receipt acknowledgment
- Only two participants are supported per session

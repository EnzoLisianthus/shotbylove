# Protocol v0

The v0 protocol uses one ordered reliable WebRTC DataChannel.

Text frames are JSON control messages. Binary frames are payload chunks for the currently accepted incoming file.

## Control messages

- file-offer: announces name, size, MIME type, lastModified, transfer UUID and chunk size
- file-accept: receiver has prepared storage and authorizes transfer
- file-reject: receiver declines or is busy
- file-done: sender has enqueued all file bytes
- cancel: either side cancels the active transfer

The receiver checks that the final received byte count exactly matches the announced file size before exposing the download.

## v0 limitations

- one outbound file per peer at a time
- no resume offset negotiation
- no whole-file cryptographic checksum yet
- completion validates byte count only
- binary chunks carry no per-chunk header because only one inbound file is active at a time

These limits are explicit so later protocol versions can evolve cleanly.

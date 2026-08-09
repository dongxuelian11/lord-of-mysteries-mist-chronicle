# WorldLedger Long-Run Integrity Boundary

## Bounded history

WorldLedger keeps at most 2,048 live events once a sufficiently recent verified snapshot exists. Older events are summarized into bounded segment metadata and replaced by one trusted checkpoint containing:

- the checkpoint projection and checksum;
- the sequence/week boundary;
- the final hash of the archived event prefix;
- bounded event-segment metadata.

Current-state replay and verification continue from that checkpoint. Requests for a week or sequence earlier than the trusted checkpoint return `null`; callers cannot branch from compacted history unless they retain an external archive.

## Verification cost

Verification reduces the retained chain once and validates each weekly commit checksum during that same pass. It no longer replays the complete retained history once per committed week. Snapshot-accelerated replay is still compared with the checkpoint-plus-events replay.

## Threat model

`ledgerChecksum` and the event hash chain use a stable non-cryptographic checksum. They detect ordinary corruption and accidental/non-adversarial mutation. They are not tamper-proof, do not authenticate an attacker, and must not be described as a cryptographic audit trail.

The archived prefix is explicitly a trusted checkpoint boundary. After compaction, verification checks the checkpoint's internal checksum and the retained chain after it; it cannot independently reconstruct or re-authenticate discarded events. A hostile-tamper threat model requires an external signed archive and a cryptographic hash such as SHA-256 or BLAKE3.

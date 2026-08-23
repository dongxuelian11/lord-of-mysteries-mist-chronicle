# PR4 · Desktop persistence lifecycle recovery

PR4 closes the missing local lifecycle proof between the PR2 persistence boundary and the PR3 packaged-startup probe. It launches the real Electron runtime twice against one isolated user-data directory:

1. a hidden renderer calls the production `preload.cjs` bridge to write `mist-chronicle-complete-v21` and append `mist-chronicle-recovery-v21`;
2. that Electron process exits and closes the SQLite store;
3. a second Electron process opens the same directory, reads both records through the same renderer bridge, and checks the marker;
4. the existing read-only persistence verifier confirms the resulting database is WAL-backed and has the PR2 schema.

Run it with:

```powershell
npm.cmd run release:persistence:lifecycle
```

Use `--keep` to retain the temporary user-data directory, or `--user-data <dir> --output <report.json>` to select durable evidence paths. The harness has no knowledge-seed dependency and never writes through a renderer filesystem API.

## Local result

- `node --test tests/release-persistence-lifecycle.test.mjs`: 2/2 passed.
- The real local run returned `status=PASS`, `evidenceLevel=local-electron`, `markerMatch=true`, `recoveryMatch=true`, `journalMode=wal`, and `readOnlyProbe=true`.

## Evidence boundary

This is a local Electron renderer → IPC → SQLite lifecycle qualification. It is not installer, clean-machine, cross-device, upgrade, production, or human long-play evidence. PR3's authorized seed blocker remains independent and unchanged.

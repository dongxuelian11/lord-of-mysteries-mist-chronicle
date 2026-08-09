# Real-model authority benchmark — 2026-08-09

## Scope and data handling

- A fresh three-week campaign was executed through the installed Electron secure-storage wrapper.
- The user explicitly authorized sending retrieved local private-RAG excerpts and game context to DeepSeek for this bounded run.
- The API key was injected into the child process environment only; the harness did not print or persist the plaintext key.
- Runtime RAG source: the installed 22,451-chunk index under the application's roaming-data directory.
- This document contains aggregate evidence only. It does not reproduce private corpus text or model prompts.

## Result

| Metric | Week 1 | Week 2 | Week 3 | Total / summary |
| --- | ---: | ---: | ---: | ---: |
| World phase | 35,635 ms | 38,143 ms | 38,229 ms | 112,007 ms |
| Literary phase | 9,099 ms | 7,500 ms | 8,477 ms | 25,076 ms |
| Whole generated turn | 44,734 ms | 45,643 ms | 46,706 ms | 137,083 ms |
| Accepted autonomous proposals | 12 | 12 | 12 | 36 |
| Accepted faction proposals | 8 | 8 | 8 | 24 |
| Faction recall receipts | 0 | 8 | 8 | 16 |
| Actor-private RAG calls | 6 | 4 | 4 | 14 |
| Faction-private RAG calls | 8 | 8 | 9 | 25 |
| World-internal RAG calls | 1 | 1 | 1 | 3 |
| Unauthorized non-public RAG returns | 0 | 0 | 0 | 0 |
| New private knowledge nodes | 0 | 0 | 0 | 0 |

Latency summary:

- Mean world phase: 37,336 ms; p50 38,143 ms; observed p95 38,229 ms.
- Mean literary phase: 8,359 ms; p50 8,477 ms; observed p95 9,099 ms.
- Mean total generated turn: 45,694 ms.

Planning summary:

- 36 accepted proposals used `planningSource=model`.
- 0 accepted proposals used `materiality-skip`.
- 0 accepted proposals used `deterministic-fallback`.
- There were 39 autonomous-agent planning attempts for 36 accepted proposals, consistent with three bounded local retries.
- All 24 expected faction proposals committed. Faction-private RAG ran 25 times and returned no unauthorized non-public chunks.
- Faction recall bookkeeping became active from week 2, producing 16 persisted recall receipts across weeks 2–3.

## Measurement correction

The first harness version checked the autonomous-agent prompt markers before the world-adjudicator markers. Because the world payload embeds autonomous proposals, its three world calls were labelled as autonomous calls. The corrected aggregate is:

- autonomous-agent: 39;
- world adjudicator: 3;
- literary: 3;
- other/local repair: 1.

This correction is independently cross-checked by the RAG audience counts: 14 actor-private plus 25 faction-private searches equal the 39 autonomous attempts, while the three world-internal searches equal the three world adjudications. The harness now checks world markers first, so future runs report these labels directly.

The low-level fetch timing measured time to response headers, not completion of streamed generation. It has been renamed `modelResponseHeaderLatencyMs`; authoritative user-visible latency remains the enclosing world and literary phase timing above.

## What this run proves

- The installed private RAG index is used by real actor, faction, and world-model calls.
- Faction cognition is not merely structural: faction proposals, private-RAG requests, and recall receipts all occur in a real multi-week model run.
- No unauthorized non-public RAG chunk was returned by the measured audience checks.
- All accepted proposals in this run were model-backed; no materiality reuse or deterministic fallback was needed.
- The post-materiality runtime remains slow: a generated week averaged about 45.7 seconds.

## What it does not prove

- The run produced no new private knowledge node. `KnowledgeGrant` coverage was therefore vacuously true and the positive real-model `event/observation -> grant -> holder` path was not exercised. Automated authority regressions cover it, but a future real-model investigation scenario still needs to demonstrate it.
- Three weeks is a bounded smoke/latency run, not a long-play evaluation of emergence, repetition, comprehension, or fun.
- Zero materiality skips in this changing early-game window does not establish the expected long-run skip rate.
- This run does not authorize or substitute for the registered human UAU protocol.


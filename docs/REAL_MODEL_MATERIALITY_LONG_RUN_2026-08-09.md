# Real-model organic Materiality long run (2026-08-09)

## Scope and evidence boundary

- Ran 10 consecutive, committed game weeks against the configured real model and the installed 22,451-chunk runtime RAG index.
- Every week used the state committed by the preceding week. The run alternated quiet weeks and normal player orders; it was not an unchanged-state or synthetic-reuse benchmark.
- The complete weekly path remained enabled: autonomous actor/faction planning, private RAG, world adjudication, public signals, snapshots, and literary chapter generation.
- No agent, event, signal, prose section, validation, or adjudication stage was removed to improve the result.
- Only aggregate counters and timings are recorded here. No private RAG passage, prompt, model response, or acquired private fact is persisted.

## Result

| Week | Accepted proposals | Model | Materiality skip | Fallback | Autonomous calls | Total time |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 12 | 12 | 0 | 0 | 13 | 40.924 s |
| 2 | 12 | 12 | 0 | 0 | 15 | 70.543 s |
| 3 | 12 | 12 | 0 | 0 | 13 | 40.264 s |
| 4 | 12 | 12 | 0 | 0 | 13 | 37.966 s |
| 5 | 12 | 12 | 0 | 0 | 12 | 65.402 s |
| 6 | 12 | 11 | 0 | 1 | 16 | 43.527 s |
| 7 | 12 | 12 | 0 | 0 | 12 | 37.593 s |
| 8 | 12 | 11 | 1 | 0 | 12 | 45.097 s |
| 9 | 12 | 12 | 0 | 0 | 13 | 41.643 s |
| 10 | 12 | 12 | 0 | 0 | 13 | 65.097 s |
| **Total** | **120** | **118** | **1** | **1** | **132** | **488.056 s** |

The organic Materiality reuse rate was therefore **1 / 120 = 0.83%** of committed planning decisions. It avoided one autonomous planning call. This is the measured long-run rate; the earlier 80% figure remains only a controlled unchanged-state result and must not be used as the organic product expectation.

The 132 autonomous HTTP calls produced 118 model-backed committed proposals. The remaining 14 calls were uncommitted retry/failure overhead, including the proposal that ultimately used deterministic fallback. This overhead is retained rather than hidden from the performance result.

## Experience and authority checks

- Final committed world signals: 39.
- Literary output: 10 chapters, 39 sections, 105 paragraphs.
- Faction proposals: 80.
- Faction recall receipts: 71.
- RAG calls: 47 actor-private, 85 faction-private, 10 world-simulation-internal.
- Unauthorized non-public RAG returns: 0.
- Successful-run outer world retries: 0; every week committed on its first complete world-pipeline attempt.
- Private knowledge nodes generated during this particular run: 0. KnowledgeGrant coverage remained valid, but the positive acquisition path is evidenced separately in the Batch 5 real-model run.

One earlier attempt aborted before committing its first week after the model twice returned an invalid world JSON envelope. The rejected state was not included in this 10-week sample. The benchmark harness now permits up to three full retries of an uncommitted week, keeps the same production validation rules, and reports those rejected attempts explicitly.

## Latency

- Mean complete week: **48.806 s**.
- Complete-week p50: **41.643 s**.
- Complete-week p95: **70.543 s**.
- Mean world pipeline: **39.446 s**; p50 32.863 s; p95 60.850 s.
- Mean literary pipeline: **9.360 s**; p50 8.903 s; p95 13.114 s.
- Model calls: 132 autonomous-agent, 19 world-category, and 10 literary.

This run does not support a claim that Materiality currently solves the latency problem. Organic reuse occurred, but at only 0.83%; the mean complete week was still higher than the earlier 45.7-second three-week baseline. Provider variance and retry overhead remain material product concerns.

## Interpretation

The gate is functioning in a changing world—it produced one real skip without freezing the game—but its current signature and naturally changing agent state make reuse rare. Further performance work should focus on safe plan continuation, tiered models, and narrower adjudication scopes. It should not reduce active agents or remove world/literary content merely to raise the measured skip rate.

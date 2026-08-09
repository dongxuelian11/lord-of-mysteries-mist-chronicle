# Batch 5 real-model and latency evidence — 2026-08-09

## Scope and privacy

- Runs used the installed 22,451-chunk runtime RAG index and DeepSeek through the existing secure Electron wrapper under the user's explicit authorization.
- The harness recorded only counts, timings, prompt/output sizes, and authorization outcomes. It did not print or persist private RAG excerpts, model prompts, or private knowledge text.
- Performance work obeyed a hard product constraint: no agent, world event, public signal, literary section, adjudication check, or required model stage was removed to make the benchmark faster.

## Private KnowledgeGrant positive path

The real-model path is no longer only an automated-test claim.

- An explicit authority scenario committed one private knowledge node with one holder.
- The holder had a persisted `KnowledgeGrant` whose source event, source observation, holder, and acquisition kind all matched.
- A later ordinary one-week run also produced one complete private acquisition chain without the authority supplement.
- Both runs returned zero unauthorized non-public RAG chunks.

Only aggregate chain counts are retained here; the private statement itself is intentionally omitted.

## Materiality reuse

A controlled unchanged-authority benchmark executed five planning cycles over the same authoritative state:

| Cycle | Accepted proposals | Model-backed | Materiality reuse | Model/RAG calls |
| --- | ---: | ---: | ---: | ---: |
| Initial | 12 | 12 | 0 | 12 / 12 |
| Repeated 2–5 | 48 | 0 | 48 | 0 / 0 |

- Observed reuse rate: 48 / 60 proposals = 80%.
- Avoided model calls: 48.
- Deterministic fallback proposals: 0.
- Unauthorized non-public RAG returns: 0.
- The signature excludes reflection bookkeeping time but retains semantic reflection content, so changing only `createdWeek` no longer forces a replan; changing an objective still does.

This is a controlled unchanged-state proof, not a claim that organic long-play will sustain an 80% skip rate.

## Latency without reducing experience

The original three-week baseline averaged 45.7 seconds per generated week. The main bottleneck was then isolated to the single central world-adjudication response.

The implementation now:

- plans up to eight independent agents concurrently while preserving all agent calls and validation;
- asks the world model for compact JSON without indentation or meaningless whitespace;
- stops requesting the unused `worldSummary.changes` duplicate because the same public changes are already persisted from `publicSignals`;
- retains the same world authority, KnowledgeGrant, perception, failure-isolation, public-news, and literary-continuity checks.

Two instrumented full-experience one-week observations around the compact-JSON change were:

| Metric | Before compact JSON | After compact JSON |
| --- | ---: | ---: |
| Accepted autonomous proposals | 12 | 12 |
| Deterministic fallbacks | 0 | 0 |
| Public signals | 4 | 4 |
| Literary structure | 3 sections / 6 paragraphs | 3 sections / 8 paragraphs |
| World output | 10,107 chars | 7,253 chars |
| World phase | 29,189 ms | 26,277 ms |
| Literary phase | 6,436 ms | 6,385 ms |
| Whole generated turn | 35,625 ms | 32,662 ms |

Observed changes were −28.2% world-output characters, −10.0% world-phase time, and −8.3% total time for these two runs. Provider variance and one extra autonomous retry in the first observation mean the latency percentages are evidence of improvement, not a deterministic performance guarantee. Compared with the original three-week mean, the best complete observation is 28.5% faster, but 32.7 seconds remains a material product-latency problem.

Prompt instrumentation also showed the largest world inputs remain `authorizedLore`, `adjudicatorWorld`, `factionStrategy`, and `organizationState`. Further optimization must remove proven duplication or overlap independent work; it must not reduce world breadth or player-visible prose.

## Continued decomposition

- `AgentPlanningService` owns independent planning frames, audience projections, bounded concurrency, retries, materiality reuse, failure isolation, and the uncommitted proposal cache.
- `world-adjudication-protocol.ts` owns kernel and organization output authority contracts.
- `game-session-controller.ts` owns save migration, active-save persistence, secure credential loading, AI settings persistence, and key clearing.
- `initial-world-seed.ts` owns initial factions, timeline anchors, and canonical actor seeds while preserving separate kernel and player-facing initial states.

The remaining files are still large; this batch establishes coherent boundaries rather than claiming the God-file problem is finished.

## Verification

- Production build succeeded.
- Full suite: 276 tests, 271 passed, 0 failed, 5 conditionally skipped because the public build uses a shell lore corpus.
- Dedicated architecture tests verify compact lossless world output instructions, protocol ownership, mutable-game isolation from initial seeds, and the relocated save/security boundaries.

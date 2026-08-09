# Authority Hardening Progress

## Objective

Complete the remaining correctness and long-run hardening work identified on 2026-08-09 without losing scope across context compaction.

The governing priority is:

1. Knowledge acquisition must have a rule-owned grant path.
2. Presence must not imply perception.
3. Agent replanning must react to every material state change, including faction risk posture.
4. Persistent entity references must resolve.
5. Accepted `usedMemoryIds` must update recalled bookkeeping.
6. Reflection provenance and long-run ledger verification should become more precise and bounded.

Product decisions about the Great Smog campaign mode and real human long-play validation remain explicit follow-up work; they must not be silently decided or represented as automated evidence.

## Baseline

- Starting commit: `2f9f026` (`docs: record world authority delivery`).
- Full baseline verification: production build succeeded; 267 tests, 262 passed, 0 failed, 5 conditionally skipped.
- Relevant authority/memory/ledger baseline: 54 tests passed.
- Existing unrelated worktree files: `.qa-prodserver3.err.log` and `.qa-prodserver3.out.log` are untracked and must not be modified.

## Confirmed Gaps

- The adjudicator can currently assign knowledge `holderIds`/`holderRefs` directly.
- Co-located actors and factions are currently added to `allowedTargetRefs` without a perception record.
- Planning signatures omit location risk/stability/mood/conditions, actor condition, faction suspicion, risk tolerance, and memory content changes.
- Existing faction profiles do not resynchronize `riskTolerance` after suspicion changes.
- Accepted autonomous proposals record `usedMemoryIds` in the world ledger but only submit delivered/presented memory receipts.
- Reflection conclusions share one coarse source set.
- Invalid actor locations and project owners can create orphan state; a default new game already has three actors at unresolved `tingen`.
- Ledger snapshots are bounded, but authoritative events and full-history verification cost are not.

## Execution Status

### Batch 6: Deeper application boundaries and organic Materiality evidence

- [x] Extract the literary generation pipeline from `game-engine.ts` behind a stable service/API boundary.
- [x] Extract another coherent controller boundary from `complete-game.tsx` without changing interaction semantics.
- [x] Extract initial-state construction responsibility from `game-model.ts` without changing seed values or save compatibility.
- [x] Run a real multi-week evolving-world Materiality benchmark and report model, reuse, fallback, retry, and leakage counts.
- [ ] Pass full verification, commit the complete authority/decomposition work, and push the current `main` branch to `origin`.

Batch 6 constraints:

- Do not reduce active agents, world events, public signals, literary length, or required validation to improve latency or reuse.
- Organic Materiality evidence must advance committed world state between weeks; the controlled unchanged-state benchmark is not a substitute.
- Private RAG/model content may be sent for this explicitly requested bounded long-run measurement, but only aggregate evidence may be persisted.
- Preserve unrelated untracked `.qa-prodserver3.*.log` files and do not include them in the commit.
- Context compaction must not change this objective or mark a step complete without code/evidence and verification.

### Batch 5: Real-model closure, latency, and continued decomposition

- [x] Produce at least one real-model private knowledge acquisition with a valid `event/observation -> KnowledgeGrant -> holder` chain.
- [x] Measure real-model Materiality Gate reuse on repeated unchanged planning state and record model-call avoidance.
- [x] Reduce generated-week latency without removing gameplay content, then remeasure.
- [x] Continue decomposing `game-engine.ts`, `complete-game.tsx`, and `game-model.ts` into explicit services without changing gameplay semantics.

Batch 5 acceptance constraints:

- Private RAG/model content may only be sent under explicit user authorization and must never be copied into aggregate evidence documents.
- KnowledgeGrant evidence is complete only when a real model result survives adapter and kernel validation and the committed holder has the matching persisted grant.
- A Materiality skip claim must count attempted planning cycles, model-backed accepted proposals, reused proposals, fallbacks, and actual avoided model calls.
- Latency improvement must compare like-for-like bounded runs and must not weaken authority validation, failure isolation, or literary continuity checks.
- God-file extraction must move ownership, tests, and cache/transaction boundaries together; moving text without a coherent service boundary does not count.

### Batch 1: Information authority and replanning

- [x] Add formal knowledge grant records and derive private knowledge holders only from validated acquisition evidence.
- [x] Add explicit perceived entity references to observations and remove location membership from target authorization.
- [x] Expand planning signatures and resynchronize faction risk tolerance.
- [x] Add negative and positive regression tests for all three boundaries.

### Batch 2: Referential integrity and memory activation

- [x] Reject or safely resolve invalid actor `locationId` values.
- [x] Reject projects whose `ownerId` does not resolve to an allowed owner kind.
- [x] Commit `usedMemoryIds` as recalled only after the proposal is accepted and the week commits.

### Batch 3: Provenance and ledger cost

- [x] Give each reflection conclusion/recommendation its own source references.
- [x] Introduce event segmentation, trusted checkpoints, and incremental verification with an explicit pre-checkpoint replay boundary.
- [x] Clearly retain the non-cryptographic threat-model boundary unless the hash algorithm is upgraded.

### Batch 4: Evidence and architecture

- [x] Re-run a bounded real-model latency measurement on the post-materiality implementation.
- [x] Continue extracting orchestration responsibilities from `game-engine.ts`, `complete-game.tsx`, and `game-model.ts` without changing gameplay semantics. **AgentPlanningService, world protocol, session controller, and initial world seed extracted**
- [ ] Obtain an explicit product decision for Great Smog campaign modes.
- [ ] Execute, do not simulate, the registered human long-play protocol.

## Design Constraints

- The world model may propose facts, observations, and transmissions, but rule code owns authorization and persistence.
- A private knowledge holder must be explainable through a persisted grant linked to an event/observation/communication/investigation/propagation source.
- A location stores authoritative presence only. Target authorization requires an explicit perception, prior relationship, owned project, or known knowledge subject.
- Materiality signatures must be deterministic and content-sensitive; unchanged state must still skip model calls.
- Failed validation must preserve the existing transactional retry/failure-isolation behavior.
- Existing user files and unrelated changes must not be reverted.

## Latest Progress

- Batch 1 implemented in `world-kernel`, `world-output-adapter`, `autonomous-agents`, and the adjudicator protocol.
- Private knowledge now persists a `KnowledgeGrant` linked to a matching observation and event; unsupported private holders are transactionally rejected.
- `perceivedRefs` is the explicit perception boundary; co-location no longer grants target authority.
- Materiality signatures now cover actor condition, relevant location state, faction suspicion/risk tolerance, reflection content, observation/knowledge content, and memory projection text.
- Focused regression suite: 23/23 passed. TypeScript check passed.
- Batch 2 implemented: output normalization drops unresolved new actors/projects; the kernel rejects direct orphan deltas transactionally; default `tingen` and degraded `unknown` locations are formal state entries.
- Accepted autonomous `usedMemoryIds` now submit a `recalled` receipt and update audience-scoped activation state after adjudication succeeds.
- Expanded focused regression suite: 46/46 passed.
- Reflection conclusions now carry their own `sourceRefs`/`sourceEventIds`; recommendations carry separate provenance and legacy string conclusions migrate safely.
- WorldLedger retains at most 2,048 live events once a suitable snapshot exists, archives bounded segment metadata plus a trusted checkpoint, and verifies weekly checksums in one retained-chain pass instead of repeated full replay.
- The checkpoint trade-off is explicit: replay/branching before the compacted boundary requires an external archive, and the checksum remains non-cryptographic.
- Batch 3 typecheck and focused tests passed, including a 2,600+ event long-run compaction case.
- Final authority review removed the last direct-kernel bypass: private knowledge cannot omit a grant, borrow a different holder's observation, or target an unresolved holder.
- Final production build passed. Full suite: 274 tests, 269 passed, 0 failed, 5 conditionally skipped. `git diff --check` passed (line-ending notices only).
- Remaining work is Batch 4 plus real-model faction/latency and human long-play evidence; these are not represented as completed by automated tests.
- Current continuation target (2026-08-09): instrument and execute a bounded real-model run against the installed 22,451-chunk runtime RAG index. Required evidence: per-week world/literary latency, model-call counts, model/materiality/fallback proposal counts, faction proposal/RAG audience coverage, private-RAG leakage count, KnowledgeGrant coverage, and memory recall receipts. Do not start God-file extraction until this run is recorded.
- The bounded benchmark harness is now instrumented and passes syntax/diff validation. It loads the installed runtime index in-process, records model/RAG latency and audience aggregates, checks private-KnowledgeGrant coverage, and fails on unauthorized non-public retrieval, missing faction proposals/RAG traffic, unloaded RAG, or failed model HTTP calls.
- **External-data gate resolved for the bounded three-week run:** after explicit informed user consent, the installed private RAG index and game context were used with DeepSeek. The plaintext key was neither printed nor persisted by the harness. Any expansion beyond that authorized scope still requires explicit consent.
- Post-instrumentation offline verification: 69/69 focused authority, autonomous-agent, transaction, ledger, RAG parity, and RAG permission tests passed. The bounded three-week consent gate was subsequently resolved; there was no local test failure.
- Three-week real-model evidence is recorded in `docs/REAL_MODEL_AUTHORITY_BENCHMARK_2026-08-09.md`: average generated turn 45.7s; 36 accepted model proposals; 24 faction proposals; 25 faction-private RAG calls; 16 faction recall receipts; zero unauthorized non-public RAG returns. No private knowledge node was generated, so positive real-model KnowledgeGrant acquisition remains unexercised rather than falsely counted as covered.
- The first run exposed and corrected two harness-label issues: world calls are now classified before embedded agent markers, and fetch timing is explicitly labelled response-header latency. A requested four-week rerun did not start because it exceeded the user's bounded three-week external-data authorization.
- Application-layer extraction has started with `app/agent-planning-service.ts`. It now owns active autonomous frame preparation, private planning projections, bounded parallel attempts, materiality/fallback policy, and the uncommitted weak proposal cache; `game-engine.ts` retains adjudication and commit orchestration and releases the service cache only after a successful week commit.
- Post-extraction verification passed: TypeScript check, 43 focused planning/transaction/three-week tests, production build, and the full 274-test suite (269 passed, 0 failed, 5 conditionally skipped). Static architecture assertions now verify the new boundary instead of requiring planner internals to remain in the God file.
- Batch 5 aggregate evidence is recorded in `docs/REAL_MODEL_BATCH5_EVIDENCE_2026-08-09.md`.
- Real-model KnowledgeGrant acquisition is positively exercised: both an explicit authority scenario and a later ordinary one-week run committed one private holder with a complete matching event, observation, grant, and acquisition-kind chain. Private text is not reproduced in evidence.
- Controlled Materiality evidence: five unchanged planning cycles accepted 60 proposals; 12 were initially model-backed and 48 were semantic plan reuses, avoiding 48 later model and RAG calls with zero fallbacks or unauthorized retrievals. This 80% controlled rate is not represented as an organic long-play rate.
- The planning signature now ignores reflection bookkeeping time such as `createdWeek` while retaining semantic reflection contents; an objective change still invalidates reuse.
- Latency work preserved the full experience. Agent planning concurrency increased from four to eight, and the world model now emits compact JSON and no longer repeats unused `worldSummary.changes`. A full run retained 12 accepted proposals, 4 public signals, and a 3-section/8-paragraph literary chapter while observing 32.7s total versus the original 45.7s mean. Provider variance remains, and latency is still an open product problem.
- Continued decomposition moved world/kernel organization protocols to `world-adjudication-protocol.ts`, browser save and secure-key lifecycle to `game-session-controller.ts`, and initial factions/timeline/canonical actors to `initial-world-seed.ts`. These are coherent ownership boundaries; the three application files remain candidates for further reduction.
- Final Batch 5 verification: production build succeeded; full suite 276 tests, 271 passed, 0 failed, 5 conditionally skipped.
- Batch 6 extracted literary generation into `literary-generation-service.ts`, dialogue/thread and screening transitions into `dialogue-session-controller.ts`, and organization-specific opening facts/evidence/resources into `opening-state-factory.ts`. The three source files fell to 1,701, 924, and 1,404 lines respectively without changing their public APIs or seed values.
- Organic Materiality evidence is recorded in `docs/REAL_MODEL_MATERIALITY_LONG_RUN_2026-08-09.md`: 10 consecutive committed weeks, 120 proposals, 118 model-backed decisions, 1 Materiality reuse, 1 deterministic fallback, and 132 autonomous calls. The measured organic reuse rate is 0.83%, not the 80% controlled unchanged-state rate.
- The full experience remained enabled across the run: final world state contained 39 signals and the literary path generated 10 chapters, 39 sections, and 105 paragraphs. The installed 22,451-chunk RAG produced 47 actor-private, 85 faction-private, and 10 world-internal calls with zero unauthorized non-public returns.
- Complete-week latency averaged 48.806s (p50 41.643s, p95 70.543s). Materiality is real but presently too rare to resolve product latency; no gameplay content was removed to improve the measurement.
- Batch 6 verification passed: production build, TypeScript, ESLint, script syntax, `git diff --check`, and the full 278-test suite (273 passed, 0 failed, 5 conditionally skipped).

# Personal sync Worker — local integration

The Workflows collection carries definitions and run history. Imported runs remain observation-only and cannot dispatch work on the receiving device. Jelly transfers the personal calendar, notes and their links; device-specific import receipts, undo history and previews stay local.

Rust/WASM + D1 transport for space-scoped incremental replication. Auth validates the Bearer token; the server derives the space from issuer, application and user. The request cannot choose another owner. No real cloud resources are created by these instructions.

Registered local business adapters currently cover Goals (project graph, work records and decisions), Pages, inline Artifacts, Form (including submissions), Dataset (including saved snapshots), PPT, Lingguang, Workflows, Jelly, Todo, Issues, Schedule conversation tasks, Character drafts and Feed capture rules. They share the opaque transport; Rust does not import plugin business schemas. Imported Schedule tasks and Feed rules are disabled until locally enabled. This is **not all-plugin or large binary-file synchronization**. Each record/aggregate is limited to 512 KiB; oversize records are reported and retained, never truncated. Full coverage and outstanding owners: `specs/personal-plugin-replication/spec.md`.

## Run locally

1. At repository root run `pnpm install --frozen-lockfile` and `pnpm build`.
2. Install Rust's `wasm32-unknown-unknown` target and `worker-build` 0.8.6 (`cargo install worker-build --version 0.8.6 --locked`).
3. In this directory run `npm install`.
4. In `wrangler.jsonc` set `APPLICATION_ID` to the Auth application's ID, not its login client ID. Keep `AUTH_ORIGIN` pointing to your local Auth instance.
5. Run `npm run db:migrate`, then `npm run dev`. This starts the isolated local Worker/D1 at `http://127.0.0.1:8788`.
6. Set `MOLIS_WORK_SYNC_LOCAL=1` in the local work launcher environment and restart molis-work. Log in, enter the personal space, then open **Settings → Sync**, select the desired collections (including Goals) and save.

The client accepts only the exact local endpoint above. Sync is off by default. Opening ordinary pages does not start uploads. Saving a policy or clicking Sync Now starts a 15-second loop for that active account until logout/server shutdown. After restarting, click Sync Now again. Cloud deployment and a production destination require separate approval and configuration.

## Delivered boundaries

- Pages documents and folders use a durable, transactional per-record queue, delete tombstones, replay-safe operation IDs and remote cursors.
- The setting belongs to the personal space and is stored in D1. Local-only spaces cannot upload. Turning off a collection does not delete data.
- Concurrent edits are retained as conflicts. Explicit local/remote resolution saves both versions in the local replica resolution journal.
- Artifacts uses an owner-validated bundle per artifact identity containing its immutable inline versions, producer provenance, digest, supersession and archive/unavailable state. Imports use the owner's commands and journal. No producer-specific transport adapter is needed for these inline artifacts; plugin drafts remain separate.
- Goals replicates a project-consistent aggregate of facts, relations, proposals, trusted decisions, Goal-associated ContextLedger references and owned history. Stable event IDs replace local sequence numbers in transit. Receiving facts does not execute proposals or start tasks. Concurrent changes conflict at the project aggregate, not at individual Goal fields.
- The receiving device creates minimal project identity/title when needed; full project metadata, unregistered plugins' private data, installation packages, running tasks and attachment objects are not replicated.
- References to missing Goals/Artifacts are durably held as **waiting for linked assets** and retried on subsequent cycles. They are never stripped or offered as destructive overwrite choices. Existing disabled plugins and deleted projects are not silently resurrected. An existing destination project with Artifacts disabled must be explicitly enabled before its artifact collection can be received.
- Goal and Artifact project databases have transactional, namespaced queues and receipts. The collection cursor advances only after the target project commits; a crash between commits safely replays its receipt. Host registration order places Goals before Artifacts before Pages regardless of checkbox order.
- Each uploaded record is limited to 512 KiB. The current Pages semantic validator also limits a project snapshot to 1,000 documents, 1,000 folders and 16 MiB. Artifact bundles include all versions (at most 1,000); an oversized bundle or a version requiring external content is rejected, not truncated. A rejected outgoing item stays queued and currently pauses that collection's upload; per-item quarantine/streaming remains future work.

Before public release: production endpoint approval, quotas/rate limiting, event retention/compaction, attachment storage, large Goal aggregate partitioning, complete project lifecycle and independent multi-device production acceptance are still required. This is not an all-asset personal edition.

## Verification

After a root build, run `node scripts/run-tests.mjs tests/personal-goals-sync.test.ts tests/personal-sync.test.ts tests/plugin-sync-foundation.test.ts tests/artifacts-replication.test.ts tests/replica-dependencies.test.ts tests/personal-sync.e2e.test.ts`.
Run `npm run build && npm test` here for actual Rust WASM + isolated D1 tests. The test uses synthetic Auth responses and temporary Homes, never live accounts. `MOLIS_WORK_WORKER_BUILD` and `MOLIS_SYNC_MINIFLARE_MODULE` optionally select existing local tooling.

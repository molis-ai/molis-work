# Personal plugin replication

状态：进行中（partial）。Pages、Artifacts、Goals、Form、Dataset、PPT、Lingguang、Workflows、Jelly、Todo、Issues、Schedule、Characters 与 Feed 捕捉规则已有本地同步适配器；全插件同步仍未完成，也未部署生产云端。

## Requested outcome

Portable business assets from every installed plugin can follow a personal account across devices. A plugin declares its collections and owns validation/restoration; the common engine owns delivery, durable receipts and conflicts. No arbitrary database, local directory, executable package, credential, running task or approval is copied implicitly.

## Acceptance invariants

- Only personal Home records in the selected collection and enabled project are transferred. Local/team homes are not admitted by this integration.
- A business write and its change journal commit together, including child records and tombstones. First installation seeds existing data once.
- Remote reconciliation is transactional; stable object/child IDs and ordering survive. Editor CAS versions are local and must advance on remote writes.
- Pending publication/execution is never transported or erased. Referenced fixed Artifact versions must exist before applying the dependent record.
- Cross-project ID collisions, unknown fields, malformed domain data and payloads over the current 512 KiB record limit fail without partial restoration.
- Concurrent edits preserve both sides for explicit resolution. Restore never calls a model, external API, scheduler or plugin installer.
- New plugin collections remain opt-in. Host exposes actual registered adapters, not manifest-only promises.
- Existing localhost-only transport and explicit Host opt-in remain unchanged. No production deployment or real-account upload is part of implementation tests.

## Work tracking (not a completion claim)

Implementation order for the remaining portable records: Schedule; Feed/Inbox; Images and binary transport; Cognia; Alchemist; Work/Coding; Shelf/Characters; Experiments/Plugin Builder; then independent plugin runtime registration. Each owner must pass isolated two-Home transfer, conflict, identity, restart and no-side-effect restoration tests before its row is marked complete.

- Existing: Pages documents/folders and inline Artifact versions.
- Implemented: reusable owner-declared aggregate journal and adapters for Form (including submissions), Dataset (including saved versions), PPT, Lingguang (including complete conversation turns and delivery idempotency).
- Remaining owner integrations: Images and binary attachment transport; Cognia; current Alchemist Studio; Feed/Inbox 的 Source、Signal、Feed Item、Attention 数据；其他执行型插件的可移植结果；独立插件数据注册。Goals is covered by [personal-goals-sync](../personal-goals-sync/spec.md).
- Files/Git/Coding local directories, secrets, process state and external authorizations require explicit scope; they are not blanket-uploaded.

## Verification

### Implemented slice: Workflows

Per-definition and per-instance replication, not one database snapshot. Preserves station/provider versions, link rules, frozen instance chains, handoff input/output, action receipts and uncertain-attempt history. Restored instances are observation-only: a durable local marker rejects continuation/stop/save before model or receiver dispatch; copying history never transfers execution authority. The originating device remains authoritative for ongoing runs. A remote replacement of an actively executing local instance is rejected even during manual conflict resolution. Definitions remain editable on both devices with normal conflicts and target-local revision high-water marks. Restored instances wait for their workflow definition; missing station content remains an exact reference, never a fabricated replacement. No model, installer or scheduler runs during restore.

Verified so far: two personal Homes, definition edits, active and stopped instance history, storage- and action-level execution rejection, local-active protection, dependency retry, payload rejection, restart and Host registration. Still to verify before claiming complete: uncertain action history and rollback. Existing local-space workflow behavior must remain unchanged.

### Implemented slice: Jelly

Personal Home calendar entries, notes and their relationships are transferred as a validated workspace aggregate. Import receipts with potentially device-specific source details are omitted; local undo history and confirmation previews are cleared when a remote workspace replaces local content, so they cannot apply against another device's state. The target's workspace and note editor revisions advance monotonically. A local conflicting edit preserves both sides for explicit resolution. A workspace larger than 512 KiB cannot upload yet; it remains local without truncation. This is not a per-item merge or large-attachment solution.

### Implemented slice: Todo

Personal and project-assigned Todo items are transferred per item, with their visible change history and request receipts. The selected Todo collection is personal-Home wide; destination projects are minimally provisioned when an incoming Todo references one. Imported historical changes are read-only for undo; target-local changes remain editable and undoable. Pending organizer review batches and source-memory deduplication remain local, and over-limit item histories remain queued rather than truncated.

### Implemented slice: Issues

Personal Issue records transfer per item with their owner identity, original context and inline images. The receiving device advances the editor version; a stale draft cannot overwrite the imported record. Records containing more than 512 KiB of images cannot upload until binary chunk transport exists, and remain intact locally.

Use two isolated personal Homes and synthetic identities; test create/update/delete, child history, restart, receipt loss, conflicts, account/project isolation, disabled collections, CAS invalidation, pending publication, dependency retries and malicious envelopes. Run repository build before regression; record actual results here.

## Coverage and remaining owner work

| Entry | Current support | Remaining work |
| --- | --- | --- |
| Pages | Documents/folders and inline bodies | Binary/local attachments; Goal dependencies wait rather than lose references |
| Artifacts | Inline fixed versions and lifecycle | `content_ref` / binary blobs |
| Form | Questions, captured submissions, request IDs, metadata | Large aggregates/chunk transport; automatic concurrent submission merge is not implemented |
| Dataset | Columns/rows, saved snapshots, metadata | Large aggregates; automatic row merge is not implemented |
| PPT | Slides, theme, notes, metadata | Large aggregates |
| Lingguang | Sparks, discard state, completed conversations, stable message ordering, delivery request IDs | Same-spark independently created conversations remain a conflict |
| Goals | Project-consistent facts, relations, work history, proposals, decisions and Goal-related ContextLedger edges | Local journal sequences use stable event anchors; same-project conflicts require explicit selection; 512 KiB aggregate limit, no execution state or attachment transfer |
| Feed / Inbox | Feed 捕捉规则逐条同步；接收端默认停用 | Source/Signal/Feed Item/Attention owner 历史、加密正文及引用；不传账号授权或实时拉取租约 |
| Images | Not implemented | Completed output bytes + history; connection credentials and executing requests remain local |
| Cognia | Not implemented | Knowledge material versions / attachments / citations; restore must invalidate local previews and editor revisions |
| Jelly | Calendar entries, notes and links in one personal workspace aggregate | Per-item merge and large workspaces; device-specific import receipts and undo previews intentionally remain local |
| Alchemist | Not implemented | Current `studio.sqlite` research/report/decision owners, NOT the obsolete read-only demo store |
| Workflows / Schedule | Workflows definitions/instance history and Schedule conversation tasks/turn history implemented locally | Restored Workflows instances are observation-only; received Schedule tasks are paused with no job binding. Plugin reminders, operation leases and execution authority remain local |
| Work / Coding | Not implemented | Finished session/report history and dependency refs; PTYs, active runs, local paths and approvals are not portable |
| Shelf / Characters | Character personal drafts, states and bounded import snapshots implemented; published inline Artifact versions use the Artifact owner | Shelf catalog and file bytes require attachment transport; oversize Character imports remain local |
| Experiments / Plugin Builder | Not implemented | Persisted experiment/build outputs; installation/executable activation remains explicit |
| Files / Git | Not implemented as directory sync | Only explicitly captured assets should be considered; do not upload local working trees by walking paths |
| Diff / Text Stats | No independent replicated business store | Recompute/present the owning snapshot; do not create duplicate authoritative assets |
| Todo | Personal/project-assigned items, change history and request receipts | Organizer review batches and source-memory deduplication remain local; over-limit history needs chunking |
| Issues | Per-item records, small inline images, owner isolation and editor CAS | Large inline images need binary chunk transport |
| External provider plugins | Not implemented | Replicate ingested business records through their owners, not OAuth tokens/cursors/leases |
| Independent plugins | Contract only, not automatically connected | Runtime adapter registration, permissions, migrations, attachment declaration and compatibility tests |

Current transfer limit is **512 KiB per aggregate**. An over-limit or unfinished-publication aggregate is retained locally and reported; this can pause uploads for that collection, while unrelated collections continue. No truncation or blanket database fallback is permitted.

## Verified delivery — 2026-09-30

- `pnpm build`: passed (existing xterm default-import warnings remain).
- `node scripts/check-package-boundaries.mjs`: 71 packages, 1,765 source files, zero errors.
- Targeted owner/Host/storage/authority/UI suite: **167 passed, 0 failed, 0 skipped** (`/private/tmp/molis-all-plugin-regression.log`). Includes four-plugin Host registration, complete submissions/snapshots/conversations, receipt loss, rollback, dependency retries, malformed payloads, identity collision, editor high-water versions, and original action/MCP behavior.
- Actual prebuilt Rust WASM + isolated D1: **1 integration test passed**, covering Pages, Artifact and all four newly registered plugins, cross-account denial and no replication echo (`/private/tmp/molis-all-plugin-rust.log`). Rust service source did not need a plugin-specific change.
- Real Chrome configuration interaction passed; inspected `.impeccable/qa/review/plugin-sync-1440.png` (light) and `plugin-sync-390.png` (dark). All six registered choices render; failed saves retain selections and retry succeeds.
- `git diff --check`: passed. No commit, push, production deployment, real-account upload or existing-service restart.

These results validate the implemented rows above; they are not evidence that the remaining plugins or production cloud sync are complete.

## Subsequent local verification — 2026-10-14

- Workflows, Jelly, Todo and Issues now have owner-scoped sync adapters and isolated transfer tests. The Host exposes their collections through the existing opt-in coordinator; Issues supplies its adapter through its built-in plugin declaration.
- `pnpm build` passed. `pnpm boundary:check` passed (72 packages, 1,968 source files, zero boundary errors). Biome passed for the new adapters and tests; `git diff --check` passed.
- Focused sync suite: 27 passed, 0 failed. Existing Workflows/Jelly/Todo behavior suite: 83 passed, 0 failed.
- `pnpm health:check` remains red because this worktree contains untracked pre-existing sync/spec files that its tracked-file gate cannot resolve. No newly introduced giant-class or plugin-boundary regression was reported. These files were not staged or committed by this verification.
- This is still a localhost-only, explicitly enabled pilot. Remaining rows in the coverage table, large/binary payload transport and production deployment are **not** complete.

### Schedule continuation

- Conversation task content and its saved turns replicate by project with transactional owner journals; first open seeds existing tasks.
- A received task is always disabled and has no scheduler job ID. A locally enabled task cannot be replaced by a remote task, including during conflict resolution. Reminder/install generations, timed operations and active execution leases never travel.
- Full workspace build, package boundaries, 2 focused adapter tests, 13 Host sync tests and 76 existing Schedule regression tests passed. The tracked-file health warnings above remain; the Schedule plugin-assembly metric did not regress.

### Character continuation

- Character drafts, disabled/tombstoned state and bounded import snapshots transfer per record with owner isolation and target-local revision checks. Published Character content remains owned by Artifacts; installing a Character or running it is never triggered by restore.
- Full build, 2 focused adapter tests, 17 existing Character tests and 13 Host sync tests passed after lint cleanup; package boundaries and Biome also passed.

### Feed capture rules continuation

- Each project capture rule now has an owner journal and one collection. The receiving device restores a rule disabled; an active local rule cannot be overwritten by remote restore. No connector credentials, polling leases or automatic capture runs are copied.
- Full build and 4 direct tests plus 13 Host sync tests passed. Feed behavior regression: 57 passed. Source, Signal, Feed Item and Attention business data remain separate owner work; this rule collection alone is not complete Feed/Inbox sync.

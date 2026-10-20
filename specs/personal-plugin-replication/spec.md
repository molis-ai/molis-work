# Personal plugin replication

状态：进行中（partial）。既有适配继续保留；2026-10-18 隔离工作树增加 Images/Cognia/Alchemist、Feed/Signal/来源/Inbox、Shelf、共用大对象传输及实际 Host 的独立 Runtime 发现，已有分项验证、尚未整合交付；Work/Coding/Plugin Builder、完整项目生命周期及生产验收未完成。

2026-10-17 用户已确认下一阶段的[联网个人版同步总规格](../personal-cloud-sync/spec.md)：D1/R2、设备自动与手动同步、完整插件范围、每账号 100 MB、删除保留 30 天。本文继续记录本机适配范围和历史证据；新阶段的实施、依赖与验收以总规格为准，不把需求确认当作功能交付。

## Requested outcome

Portable business assets from every installed plugin can follow a personal account across devices. A plugin declares its collections and owns validation/restoration; the common engine owns delivery, durable receipts and conflicts. No arbitrary database, local directory, executable package, credential, running task or approval is copied implicitly.

## Acceptance invariants

- Only personal Home records in the selected collection and enabled project are transferred. Local/team homes are not admitted by this integration.
- A business write and its change journal commit together, including child records and tombstones. First installation seeds existing data once.
- Remote reconciliation is transactional; stable object/child IDs and ordering survive. Editor CAS versions are local and must advance on remote writes.
- Pending publication/execution is never transported or erased. Referenced fixed Artifact versions must exist before applying the dependent record.
- Cross-project ID collisions, unknown fields, malformed domain data and oversized content fail without partial restoration. Current D1 metadata is capped at 512 KiB; connected owners slice larger portable content through private R2, within domain limits and the 100 MB account budget.
- Concurrent edits preserve both sides for explicit resolution. Restore never calls a model, external API, scheduler or plugin installer.
- New plugin collections remain opt-in. Host exposes actual registered adapters, not manifest-only promises.
- Explicit Host opt-in remains required. The approved cloud-sync phase adds trusted HTTPS or fixed localhost transport; no production deployment or real-account upload is part of implementation tests.

## Work tracking (not a completion claim)

Remaining portable-owner work is Work/Coding (including fixed process items) and Plugin Builder. Each owner must pass isolated two-Home transfer, conflict, identity, restart and no-side-effect restoration tests before its row is marked complete. Existing isolated evidence does not replace whole-set or production acceptance.

- Existing: Pages documents/folders and inline Artifact versions.
- Implemented: reusable owner-declared aggregate journal and adapters for Form (including submissions), Dataset (including saved versions), PPT, Lingguang (including complete conversation turns and delivery idempotency).
- Remaining owner integrations: Work/Coding 会话与草稿、固定过程项、Plugin Builder 可移植内容。Alchemist、Feed/Inbox、Shelf 及实际 Host 的独立 Runtime 接线已有分项证据，但全插件组合、项目生命周期、复制和正式验收未完成。Goals is covered by [personal-goals-sync](../personal-goals-sync/spec.md).
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
| Pages | Documents/folders, large portable bodies and raw embedded image bytes | Arbitrary local files are not scanned; Goal dependencies wait rather than lose references |
| Artifacts | Fixed versions, lifecycle, imported original file bytes and large immutable bodies | Unknown external `content_ref` refused; full project lifecycle remains separate |
| Form | Questions, captured submissions, request IDs, metadata and common large-content codec | Automatic concurrent submission merge is not implemented |
| Dataset | Columns/rows, saved snapshots, metadata and common large-content codec | Automatic row merge is not implemented |
| PPT | Slides, theme, notes, metadata and common large-content codec | Complete cross-owner dependencies still require acceptance |
| Lingguang | Sparks, discard state, completed conversations, stable message ordering, delivery request IDs | Same-spark independently created conversations remain a conflict |
| Goals | Project-consistent facts, relations, work history, proposals, decisions, Goal-related ContextLedger edges and large aggregate blocks | Stable event anchors and whole-project conflicts remain; execution state is not portable; full project lifecycle/copy is separate |
| Feed / Inbox | 捕捉规则、来源业务描述/历史；Feed 消息/材料、Signal 固定修订/事件及原始证据字节；Inbox 引用/处置/事件，实际 WASM/D1/R2 已验证 | 单位仍为 owner 项目一致图；嵌套 30 天业务回收/语义恢复与全插件验收未完。不传密钥、账号授权和拉取租约，接收不判断/执行 |
| Images | Saved terminal job records and validated PNG/JPEG/WebP bytes; isolated two-Home + real WASM/D1/R2 verified | No active job migration, credentials or runner; full plugin-set acceptance pending |
| Cognia | Owner-consistent domains/source descriptions/materials/fixed bytes/history/draft citations; isolated WASM/D1/R2 verified | Local scanner paths and unfinished previews stay local; no automatic scans/AI/adoption; latest v2 editor CAS has separate validation |
| Jelly | Calendar entries, notes and links in one personal workspace aggregate with common large-content codec | Per-item merge not implemented; device-specific import receipts and undo previews intentionally remain local |
| Alchemist | Current studio research graph, reports/evidence/decisions/playbook history, fixed versions and terminal observations; actual WASM/D1/R2 and stale editor CAS verified | Running work, execution inputs/checkpoints, connection settings and active jobs stay local; receive never starts execution |
| Workflows / Schedule | Workflows definitions/instance history and Schedule conversation tasks/turn history implemented locally | Restored Workflows instances are observation-only; received Schedule tasks are paused with no job binding. Plugin reminders, operation leases and execution authority remain local |
| Work | Private Session aggregate: complete event and Handoff bytes, typed reference history, per-Home encryption of owner and technical bodies, passive restores; actual Host/Rust/WASM/temporary D1/R2 verified | Active Native targets and unsettled dispatch reject replacement, even during manual conflict adoption. No native identities, workspace grants or send authority transfer. Nested recycling, orphan collection and whole-set acceptance remain |
| Coding | Fixed reports/process items retain original Artifact owners; saved sessions, complete plans, unsent text/question drafts and canonical SDK export event histories are portable | Real two-round SDK/SQL receiver, digest tampering, revoked/foreign reads and terminal pending protection pass locally (261); narrow renderer and independent history paging pass (264); actual production prepareUploads → real SDK → Host/WASM/D1/R2 passes (70). Active runs, paths, native bindings, checkpoints and approvals stay local |
| Shelf | Per-item materials/results and per-terminal-job keys; full text, original binary and explicit folder children through R2, strict catalog v2 with atomic file CAS | Final same-batch 20/20 files (including two Chrome files), 7 new security cases and 27/27 actual temporary WASM/D1/R2 cases passed. Unreferenced staging cleanup and whole-set acceptance remain; settings, clipboard, source paths and live execution stay local |
| Characters | Personal drafts, states and bounded import snapshots use common content slicing; published versions use the Artifact owner | Original Character domain bounds still apply; importing content never installs or executes it |
| Experiments / Plugin Builder | The original authoring private-KV owner transfers complete source, tests, creation history and saved publication bytes through the common codec; actual Host/WASM/D1/R2 verified | Installation, preview execution and publication authority remain explicit; received source must pass the original gates before executing |
| Files / Git | Device workspace browsers and commands have no saved content store to replicate; explicitly captured fixed files use Artifacts/Shelf owners | Arbitrary working directories, repository credentials and native grants remain on the device; no directory walking upload |
| Diff / Text Stats | No independent replicated business store | Recompute/present the owning snapshot; do not create duplicate authoritative assets |
| Todo | Personal/project-assigned items, change history and request receipts | Organizer review batches and source-memory deduplication remain local; over-limit history needs chunking |
| Issues | Per-item records, raw embedded image bytes, owner isolation and editor CAS | Original image/domain validation remains; no arbitrary local file scanning |
| External provider plugins | Ingested records use their Sources, Feed, Signal, Inbox and fixed Artifact owners above | OAuth tokens, device cursors, connection leases and live subscriptions stay local; they are not missing replicated business assets |
| Independent plugins | Actual Host discovers enabled Home/project Runtime owners. SDK-only sample includes a default PluginDefinition, declared CAS read/change actions, independent Node build and a minimal npm archive using only the two public packages | Clean offline build/pack, two-Home isolation, stale edits, foreign actors and stopped handles pass locally (261). No automatic install, re-enable or format opt-in. Updated sample also passed the actual Host/WASM/temporary D1/R2 binary round-trip (70) |

Current D1 metadata limit is **512 KiB**. Connected owners project portable content into 1 MiB R2 blocks (up to 100000000 bytes before domain/account constraints); original-file owners explicitly project raw bytes. An over-limit or unfinished-publication asset is retained locally and reported. Permanent malformed items are quarantined individually; temporary owner unavailability skips only that item for the current cycle. No truncation or blanket database fallback is permitted.

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

## Anti-corruption corrections — 2026-10-16

The review corrections and their authoritative evidence are recorded in [repository-anti-corruption](../repository-anti-corruption/spec.md), PERSAF-01–05. The earlier dated health-gate explanations above are historical results, not a waiver: the current tracked tree passes the merge-base health gate. This does not mark remaining owner integrations or public deployment complete.

- Offline identity survives an uncertain refresh across Host restart; the burned credential is not replayed and cannot authorize cloud operations. Explicit sign-out still revokes account leases.
- Pages incremental paths read/apply one owner-validated record, not a hidden whole-project snapshot; the regression transfers 170 documents exceeding 16 MiB and proves unrelated editor revisions stay unchanged.
- Current Store baselines now own their journal/editor-version tables and the sync policy store. No runtime ALTER or repair CREATE is used to upgrade an old sync schema. Versioned test fixtures were maintained without changing historical business facts; real Home data was not touched.
- Owner code uses Storage's journal ports. Built-in sync factories live in the existing plugin catalog, not a parallel Host plugin list. Explicit project-plugin removal remains a local choice; personal toolbar hiding is still not plugin disablement.
- Contracts retain types/schema, SDK owns declaration parsing/dependency expansion, sync-replication owns policy parsing, and errors use each owner's common ActionError. Account and sync UI use UiRequest without overriding global fetch.
- Rust source is in `apps/sync-worker`; its generated runtime is `dist`, while locked Node tools live in `examples/personal-sync-tools`. Actual rebuilt WASM plus isolated D1 tests passed, without changing the Rust business protocol or deploying resources.

Current build, boundary/API/version/health/resource gates, focused owner/security/contracts/install regression, desktop/narrow Chrome interaction and actual WASM/D1 integration have local evidence in the authoritative record. Full repository CI, real-data maintenance and production acceptance remain separate steps. The existing 512 KiB per-record bound, missing binary transport and outstanding owner rows are unchanged.
后续变化（2026-10-17）：[个人云同步 S3 首片](../personal-cloud-sync/spec.md#s3-首片记录2026-10-17) 已扩展私有 R2 公共传输及 Artifact 原件/较大正文；本文较早的 512 KiB 与缺二进制描述是当时范围。其他 owner 的大对象、全部附件、回收和正式验收仍未完成，不把新增阶段倒写为旧阶段证据。

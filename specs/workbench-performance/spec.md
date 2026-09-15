# Molis Work Workbench Performance

## Background and goal

Goal detail, Goal Tree, and Settings currently perform work at page or project scope even when the user changes one local surface. The problem becomes visible on established projects: a 197-Goal / 5,075-event project produced a 333 KB single-Goal document response and a 2.59 MB Goal Tree page with roughly 20,410 DOM elements.

This change reaches **Level 4: internal complete** for the affected read paths. Existing Goal, Feed, Settings, Runtime, accessibility, responsive, and write behavior remains intact, while routine navigation reads and renders only the content needed for the current surface.

## Current behavior and evidence

- `GET /api/goals/:id/document` calls the same whole-Board view builder as a full page.
- The view builder repeatedly scans Board-wide collections for every Goal and performs per-Goal lookups.
- A Goal document eagerly renders hidden Context, Progress, Relationships, and Quick Record forms. Large projects duplicate hundreds of Goal/risk choices inside a single response.
- The full page eagerly hydrates and renders every persisted Feed detail, including encrypted body/material content, even while the Goal surface is active.
- The four-second cursor refresh downloads and parses a complete HTML page after any Board event.
- The desktop PTY client is returned with `no-store`, so full-page navigation downloads the same approximately 494 KB bundle again.
- Goal selection notifies the Runtime pane before the lightweight Goal document has loaded. The PTY client therefore reads panel state concurrently with the document request; in project-catalog mode the two SQLite/catalog reads contend and delay the user-visible Goal replacement.

Baseline evidence from the live desktop service:

- Small project Goal switch: approximately 20 ms.
- Large project Goal switch: approximately 251 ms, 333 KB fragment.
- Large project Goal Tree navigation: approximately 694 ms, 2.59 MB HTML.
- Settings server work: 8–30 ms; observed full navigation: approximately 229–305 ms.

## User scenarios

1. Selecting a Goal shows its Overview quickly; other tabs load on first use and then stay available.
2. Opening Quick Record shows the same four choices and forms, but its heavy forms are loaded only after the action is requested.
3. Opening Inbox or Feed keeps the directory immediately available and loads only the selected persisted Item's full body/materials.
4. External Board changes refresh the Goal Tree and selected Goal without downloading unrelated Feed, Runtime, and page chrome.
5. Navigating through Goal Tree and Settings reuses static CSS/JS and the desktop PTY bundle without avoidable retransfers.
6. A failed lazy read leaves a clear retryable error and never removes the previously usable surface.

## Scope

### In scope

- Build reusable indexes for Board snapshot collections so each collection is grouped once rather than filtered once per Goal.
- Keep Feed list metadata in the main view, but hydrate encrypted body/material content only for the selected persisted Feed Item.
- Add lazy Goal panel and Quick Record fragment reads with abort/race protection.
- Load the hidden relationship graph and inactive Feed work surface only when the user opens them.
- Add a compact Board refresh fragment used by cursor polling on Goal views.
- Keep Runtime ownership/status updates immediate, but defer the selected Goal's panel read until its document replacement succeeds.
- Make generated static workbench assets and the PTY client safely cacheable through content ETags and explicit revalidation.
- Add regression tests for payload boundaries, lazy-loading behavior, endpoint behavior, and cache headers.
- Measure before/after using the same real large project and browser interaction path.

### Non-goals

- No visual redesign, navigation redesign, database migration, canonical Goal behavior change, or write-contract change.
- No virtual scrolling unless the remaining Goal Tree DOM is still the measured primary bottleneck after removing eager detail payloads.
- No cloud cache, service worker, CDN, or new frontend framework.
- No automatic publishing or installation of the repaired build without separate authorization.

## Design and key decisions

### 1. Indexed Board read model

`buildMolisWorkWebView` continues to produce the existing `MolisWorkWebView` contract, but builds `Map<goal_id, records[]>` and `Map<object_id, events[]>` indexes once. Per-Goal assembly consumes these maps. Proposal and rewire associations are indexed by the Goal IDs they touch. Existing record order must remain stable.

This is an implementation optimization only: all status, policy, event, relation, and decision semantics stay canonical.

### 2. Goal document boundaries

The initial Goal document contains:

- header and Goal Contract;
- the five accessible tab controls;
- the Overview panel;
- lightweight loading containers for Context, Progress, Relationships, and Records;
- the Quick Record action, but not its dialog forms.

The first activation of a non-Overview tab fetches its panel fragment. Records retain their existing paginated record/event behavior. Opening Quick Record fetches one dialog fragment. Loaded content is reused until the document is replaced by a canonical refresh.

Endpoints return HTML fragments with `no-store` because they reflect mutable local truth:

- `GET /api/goals/:id/panels/:panel?view=current|archive|trash`
- `GET /api/goals/:id/quick-record?view=current`

Only `completion`, `progress`, and `factors` are valid panel names. Records keep their existing dedicated `/records` endpoint and paginated event endpoint. Unsupported combinations return a clear 400/404.

### 3. Feed detail boundary

The main view uses `FeedStore.snapshot()` without bulk content hydration. It renders all directory rows because filters and sorting are local, but no persisted Feed detail bodies or material bodies.

`GET /api/feed/items/:id/detail` loads and hydrates exactly one Item and returns the existing detail markup. Decision and recent-result entries may remain server-rendered because they are canonical Board facts rather than encrypted Feed content.

The client inserts a fetched detail only if the selection and request still match. A visible loading/error placeholder remains keyboard and screen-reader understandable.

On a normal Goal page, the hidden Feed work surface starts as a lightweight placeholder. `GET /api/feed/workbench` loads canonical decision/result details when Inbox or Feed is first opened; persisted Item bodies still use the single-Item endpoint above.
The workbench fragment and client loaded state are scoped to the requested preset, so opening Feed never renders Inbox-only decisions/results, and switching back to Inbox performs its own one-time load instead of treating the earlier Feed response as complete.
Decision groups retain their canonical owner ID even when that Goal is outside the current/archived views, preventing unrelated orphaned groups from collapsing to the same `decision:board` selection identity and rendering simultaneously.

### 4. Compact Board refresh

On Goal views, cursor polling requests a compact refresh fragment containing only:

- summarized client state;
- Goal Tree/list and filter/footer data;
- the currently selected lightweight Goal document;
- create-dialog Goal choices and changing navigation counts needed by the current client.

It excludes Feed bodies/details, source overlays, Runtime DOM, CSS/JS, and global page chrome. Decision/Feed views keep their existing correctness-first refresh until their own compact contract is implemented.

The relationship graph is also excluded from initial Goal HTML and loaded from `GET /api/board/graph` on first use. The ordinary Goal Tree remains immediately available.
After a cursor refresh, an open graph is reloaded and a hidden previously loaded graph is marked for reload on its next opening, so lazy loading never trades speed for stale relationships.

### 5. Static asset caching

Generated CSS/JS and the compiled PTY client return a content ETag and `private, max-age=0, must-revalidate`. Conditional requests return 304. Dynamic HTML and mutable fragments remain `no-store`.

This avoids stale assets across local upgrades while eliminating repeated bundle transfer.

### 6. Goal document before Runtime panels

`molis-work:goal-changed` continues to update Runtime ownership, status, and parent protection immediately, but it invalidates the previous panel list without starting another read. After the selected Goal document is successfully replaced, the workbench emits `molis-work:goal-document-loaded`; only then does the PTY client load and attach that Goal's panels.

This preserves the visible Runtime contract while preventing the panel request from competing with the request that makes the selected Goal usable. Aborted or failed Goal document reads never attach panels for a stale selection.

## Module and file boundaries

- `src/web/server.ts`
  - owns indexed view construction, cache invalidation, fragment routes, and cache headers;
  - reads canonical data but does not change write semantics.
- `src/web/render.ts`
  - owns lightweight initial markup, fragment renderers, loading/error states, client lazy-load/refresh behavior, and the successful-document event;
  - preserves existing semantic markup and interaction contracts.
- `src/web/pty-client.ts`
  - owns deferred Runtime panel loading after the selected Goal document is usable.
- `tests/web.test.ts`
  - owns server/render/client regression coverage and payload-boundary assertions.
- `specs/workbench-performance/spec.md`
  - is the only task requirement source for this repair.

## Inputs, outputs, and dependencies

- Inputs: project-scoped SQLite Board/Feed state, requested Goal/Item IDs, collection view, current event cursor.
- Outputs: unchanged canonical UI behavior delivered through smaller HTML fragments and summary payloads.
- Dependencies: existing `SqliteMolisWorkStore`, `MolisWorkCoordinator`, `FeedStore`, content hydration, render functions, and local control-token protection for writes.
- Trust boundary: Feed bodies remain untrusted display data; lazy loading must not expose credentials or automatically execute content.

## Acceptance criteria

1. Initial Goal HTML contains all five tab controls but does not contain hidden Context/Progress/Relationships bodies or Quick Record forms.
2. Each lazy Goal panel and Quick Record endpoint returns the same functional markup previously rendered eagerly; keyboard tabs, hashes, form submission, and retry behavior work.
3. A persisted Feed Item body/material is absent from the initial Goal page and appears after requesting only that Item's detail.
4. The hidden relationship graph and inactive Feed work surface are absent from initial Goal HTML and become functional through their lazy endpoints.
5. Goal view construction no longer performs Board-wide `.filter()` scans for each common per-Goal collection; order and rendered semantics remain covered by existing tests.
6. Cursor refresh on a normal Goal view no longer fetches or parses a complete page.
7. PTY and generated static assets support ETag conditional requests; dynamic data remains uncached.
8. Goal switching does not issue the Runtime panel read in parallel with the selected Goal document; Runtime ownership/status still updates immediately and panels load after successful replacement.
9. Existing targeted Web, Feed, V1, and desktop TUI tests pass, plus new performance-boundary tests.
10. On the same large project:
   - initial Goal fragment is below 80 KB;
   - selected-Goal click-to-replacement is below 120 ms in the local browser run;
   - Goal Tree HTML is reduced by at least 40%;
   - no tested interaction regression appears in Goal tabs, Quick Record, Feed detail, Settings return, or Runtime opening.

## Verification

Run in increasing scope:

1. `pnpm typecheck`
2. `node --import tsx --test tests/web.test.ts`
3. `node --import tsx --test tests/feed.test.ts tests/feed-security.test.ts tests/v1.test.ts tests/desktop-tui.test.ts`
4. `pnpm build`
5. Browser QA on the small current project and the 197-Goal large project, measuring request size and click-to-visible time.
6. Inspect the final scoped diff for unrelated changes and compare every acceptance criterion with evidence.

## Assumptions and open questions

- The current uncommitted Feed and workbench work is intentional user work and must be preserved.
- The installed app/runtime is not overwritten during development; source verification runs against an isolated development server.
- If the large-project Goal Tree remains above the target after eager detail removal, tree virtualization becomes a follow-up design decision rather than an unplanned change inside this repair.

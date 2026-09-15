# Source Runtime UI QA

Date: 2026-08-30

Goal: `goal-infoflow-source-runtime`

## Environment

- Local source build served at `http://127.0.0.1:4182` against the managed Molis Work project catalog.
- Browser console errors and warnings: none.
- Production project rendered 13 persisted sources; no demo rows were injected.

## Desktop

- Evidence image: [source-runtime-desktop.png](source-runtime-desktop.png)
- Verified the Source directory, real list selection, five detail sections, Provider and account state, editable non-secret configuration, schedule controls, manual pull, pause/resume, connector disconnect, and both explicit deletion history choices.
- Recent runs displayed persisted `persistence_failed` and completion counts from `feed_source_runs`; the prototype-only fixed `新增 3 · 去重 8` result was absent.

## Narrow screen

- Evidence image: [source-runtime-narrow.png](source-runtime-narrow.png)
- Browser inner width: 312px (below the 760px narrow-screen breakpoint).
- Verified directory → source list → detail navigation, all five detail tabs, 44px action controls, and no document-level horizontal overflow.

## States and boundaries

- Empty state invites the user to add or connect a source instead of rendering high-fidelity fixtures.
- Paused and disconnected sources block pulls; a source in an actionable error state keeps manual retry available.
- Connector identity is read-only in the configuration form; only non-secret display name, description, scope, and schedule are editable.
- Status feedback for saving, pulling, pausing, disconnecting, and deleting remains in the current detail view.

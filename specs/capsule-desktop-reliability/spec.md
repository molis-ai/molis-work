# Capsule desktop reliability

## Background and goal

The Capsule already reads Molis Work's canonical Project, Goal, Claim, Run, Review, Available, and Run-control state. This final parent slice makes that experience dependable when the macOS app stays open for a long time or the local Web service and windows change lifecycle state.

Completion level: internally complete and verified from an installed macOS release build.

## Current behavior and evidence

- The menu-bar item is installed before the local Web service starts, and the Capsule opens below it.
- Project selection persists in Web storage, but the selected status tab and expanded Goal only live in memory.
- A failed Capsule request shows an error and polling retries, but the menu-bar title can continue showing its last working state and the desktop shell does not restart a failed local service.
- Closing the main window is not intercepted, so a later menu action can lose its reusable main window.
- Quitting the app relies on process teardown to dispose PTYs, and a Web process started directly by the app can outlive its parent, instead of explicitly closing every app-owned child.
- Keyboard controls and reduced-motion CSS exist, but replacing a tab or Goal row can discard keyboard focus; expanded long titles remain truncated.

## User scenarios

1. The user selects a Project, status tab, and Goal, closes the popover, then reopens it or restarts Molis Work. The Capsule restores that view when the same facts still exist and falls back safely when they do not.
2. The local Web service stops. The Capsule and menu bar say that the latest state cannot be confirmed; they never continue to present a live Working signal. The desktop shell restarts the service and reloads the Capsule after health returns.
3. The user closes the main window and later opens the current Goal from the menu bar. The same main window reappears at the requested path.
4. The user quits Molis Work from the menu-bar menu. Every desktop PTY is explicitly terminated before the app exits.
5. A keyboard user can move between tabs, expand a Goal, operate its actions, close the popover, and keep focus on the control they just used. Long titles become readable when expanded. Reduced-motion users receive the same state information without depending on animation.

## Scope

### In scope

- Persist and validate Capsule Project, selected tab, and expanded Goal display preferences.
- Accurate offline/stale presentation in both the popover and menu-bar title.
- A bounded native health monitor that restarts the installed local Web service and reloads failed WebViews after recovery.
- Hide-on-close for the main window so it can always be reopened from the menu bar.
- Explicit PTY and app-owned Web-process cleanup when quitting from the app menu.
- Keyboard focus restoration, long-title behavior, reduced-motion and accessibility checks.
- Automated TypeScript/Rust checks plus installed macOS app, visual, lifecycle, and release verification.

### Out of scope

- A second state store or offline mutations.
- Cross-device preference sync.
- Replacing Tauri with a native `NSPopover`.
- New Runtime scheduling, chat, logs, Goal Tree editing, or unrelated desktop-shell refactoring.

## Design and decisions

### Preferences are local display state

The browser origin stores one small versioned preference object containing the focused Project and, per Project, the selected tab and expanded Goal. A restored value is only applied if the latest canonical snapshot still contains it. Molis Work remains the only source of business truth.

### Offline means unconfirmed

On a failed read, the Capsule changes to a dedicated disconnected presentation, disables state-changing controls by replacing the work list with an explanation, and updates the menu-bar title to **连接中断**. It states that the last state cannot be confirmed and that reconnection is automatic. A successful read fully replaces the stale presentation.

### Desktop recovery is bounded and preserves navigation

The native shell checks local Web health on a short interval. After detecting an outage, it uses the existing idempotent embedded installer/launcher path. Once health returns, it reloads the Capsule URL and reloads the main window at its current local URL. The monitor does not create or modify Goal/Run/Claim state.

### Window and process lifecycle

Closing the main window hides it and prevents destruction. Opening a Goal always navigates and shows that reusable window. Choosing **退出 Molis Work** explicitly kills all PTY children and any local Web process that this App instance started before exiting. A Web service that was already running independently remains untouched. Clicking elsewhere or pressing Esc continues to hide only the temporary Capsule popover.

## Inputs, outputs, and module boundaries

- `src/web/capsule.ts`: preference restoration, offline wording, focus stability, long-title and reduced-motion behavior.
- `desktop/src-tauri/src/main.rs`: service monitor, menu-bar offline state, reload, main-window close interception, and PTY cleanup.
- `tests/capsule.test.ts`: rendered interaction and reliability contract.
- Rust unit tests: pure path, sizing, positioning, icon, and health-state helpers where practical.
- Release scripts remain the source for `.app`, `.dmg`, ZIP, checksums, and installation.

## Acceptance criteria

1. Offline state explicitly says the latest work cannot be confirmed, menu bar changes from live work to **连接中断**, mutations are unavailable, and successful recovery reloads canonical state.
2. Project, valid selected tab, and valid expanded Goal survive reopening/restart without creating business state or restoring invalid items.
3. Closing the main window hides it; menu-bar and Capsule actions can reopen it at the correct Molis Work path.
4. App quit explicitly terminates every desktop PTY and Web process owned by that App instance, leaves no orphan desktop child, and does not stop an independently managed Web service.
5. All actions have keyboard paths; tab and Goal focus remain stable after local re-render; an expanded long title is readable; reduced motion does not remove status meaning.
6. Focused and full TypeScript tests, Rust tests, build, macOS release build, installed-app startup, menu-bar/popover lifecycle, cross-Project view, and representative controls pass.
7. Release output contains installable `.dmg` and `.app.zip` artifacts with SHA-256 files.

## Verification

- `node --import tsx --test tests/capsule.test.ts tests/web.test.ts`
- `pnpm typecheck`
- `pnpm test`
- `cargo test --manifest-path desktop/src-tauri/Cargo.toml`
- Impeccable detector over changed Web UI.
- Browser visual checks for loading, long title, disconnected presentation, keyboard semantics, and reduced motion.
- `pnpm desktop:build:macos`
- `pnpm desktop:install:macos`
- Installed-app checks: launch hidden Capsule, click menu-bar item, outside-click/Esc hide, close/reopen main window, service restart recovery, and app quit cleanup.

## Assumptions and boundaries

- Pause/Resume remains cooperative Run control; desktop service recovery must not infer or change Runtime state.
- The health monitor only owns the bundled localhost Web service on port 4173 and reuses the current installation path.
- macOS menu-bar anchoring is recomputed from the current tray rectangle whenever the popover opens; there is no independent draggable Capsule position to persist.

W5-05 wrap-up (specs/repository-anti-corruption): delete the 26 selectors that need `body.settings-page[data-desktop-shell="true"]`. No settings page renders that combination. The coordinator approved this slice on 10-17.

## Why they're dead

- Every settings body is rendered with `data-desktop-shell="false"` (`apps/workbench/src/settings-renderer.ts:207`, `apps/workbench/src/project-settings-pages.ts:88` and `:147`).
- No script sets the attribute. The only browser code that touches it is a read, in `plugin-membership.ts:123`.
- The catalog page (`primitive-catalog.ts`) has `settings-page` but no attribute.
- The spec's §10 noted these as dead and left them for after W5-05 (the `chrome-inner-scroll` line); that note now points to this PR.

## What goes

These are three files with 101 lines deleted and **none added**:
- A rule whose selectors were all of this kind goes with its declarations.
- A mixed selector list (in `navigation-ownership.ts`) keeps its other selectors and its declarations.

A scratch script (not committed) produced the diff on main 777fde78e, and it's re-checked on this head.

| Where (on main) | Selector |
| --- | --- |
| `apps/workbench/src/styles/settings.ts:5` | `body.settings-page[data-desktop-shell="true"] > .topbar` |
| `apps/workbench/src/styles/settings.ts:8` | `body.settings-page[data-desktop-shell="true"] .project-context strong` |
| `apps/workbench/src/styles/settings.ts:9` | `body.settings-page[data-desktop-shell="true"] .project-context small` |
| `apps/workbench/src/styles/settings.ts:562` | `body.settings-page[data-desktop-shell="true"][data-settings-section="projects"]` |
| `apps/workbench/src/styles/settings.ts:563` | `body.settings-page[data-desktop-shell="true"][data-settings-section="project"]` |
| `apps/workbench/src/styles/settings.ts:567` | `body.settings-page[data-desktop-shell="true"]:is([data-settings-section="projects"], [data-settings-section="project"]) > .topbar` |
| `apps/workbench/src/styles/settings.ts:577` | `body.settings-page[data-desktop-shell="true"]:is([data-settings-section="projects"], [data-settings-section="project"]) > .topbar > .brand` |
| `apps/workbench/src/styles/settings.ts:585` | `body.settings-page[data-desktop-shell="true"]:is([data-settings-section="projects"], [data-settings-section="project"]) > .topbar > .top-action` |
| `apps/workbench/src/styles/settings.ts:588` | `body.settings-page[data-desktop-shell="true"]:is([data-settings-section="projects"], [data-settings-section="project"]) > .settings-shell` |
| `apps/workbench/src/styles/settings.ts:597` | `body.settings-page[data-desktop-shell="true"]:is([data-settings-section="projects"], [data-settings-section="project"]) .settings-content` |
| `apps/workbench/src/styles/settings.ts:605` | `body.settings-page[data-desktop-shell="true"][data-settings-section="projects"] .project-manager` |
| `apps/workbench/src/styles/settings.ts:722` | `body.settings-page[data-desktop-shell="true"] .settings-navigation.settings-navigation--codex` |
| `packages/design-system/src/styles/desktop-titlebar.ts:125` | `body.settings-page[data-desktop-shell="true"] .settings-desktop-project` |
| `packages/design-system/src/styles/desktop-titlebar.ts:135` | `body.settings-page[data-desktop-shell="true"] .settings-desktop-project .navigator-native-row` |
| `packages/design-system/src/styles/desktop-titlebar.ts:138` | `body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) .settings-navigation` |
| `packages/design-system/src/styles/desktop-titlebar.ts:141` | `body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar` |
| `packages/design-system/src/styles/desktop-titlebar.ts:147` | `body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .project-context` |
| `packages/design-system/src/styles/desktop-titlebar.ts:148` | `body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .top-action` |
| `packages/design-system/src/styles/desktop-titlebar.ts:173` | `body.settings-page[data-desktop-shell="true"][data-native-desktop="true"] > .topbar` |
| `packages/design-system/src/styles/desktop-titlebar.ts:174` | `html[data-native-desktop="true"] body.settings-page[data-desktop-shell="true"] > .topbar` |
| `packages/design-system/src/styles/desktop-titlebar.ts:178` | `body.settings-page[data-desktop-shell="true"][data-native-desktop="true"] > .topbar > *` |
| `packages/design-system/src/styles/desktop-titlebar.ts:179` | `html[data-native-desktop="true"] body.settings-page[data-desktop-shell="true"] > .topbar > *` |
| `packages/design-system/src/styles/navigation-ownership.ts:173` | `html[data-resolved-theme="light"] body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group > a[aria-current="page"]` |
| `packages/design-system/src/styles/navigation-ownership.ts:183` | `html[data-resolved-theme="light"] body.settings-page[data-desktop-shell="true"] .settings-navigation > .personal-sidebar-footer .personal-account[aria-current="page"]` |
| `packages/design-system/src/styles/navigation-ownership.ts:184` | `html[data-resolved-theme="light"] body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .top-action:hover` |
| `packages/design-system/src/styles/navigation-ownership.ts:185` | `html[data-resolved-theme="light"] body.settings-page[data-desktop-shell="true"] .settings-desktop-heading > a:hover` |

Gone from both trees:
- **Source:** `git grep 'settings-page\[data-desktop-shell="true"\]'` outside tests, specs and docs finds nothing.
- **Built CSS:** parsing the three built style modules finds 20 rules with 26 such parts on main and 0 on this head.

## Tests changed

- `tests/visual-foundation.test.ts`: 11 `assert.match` lines go. Each matched only a deleted rule, and each went red after the deletion:
  - the light settings-nav current item;
  - `.settings-desktop-project` (twice);
  - the three native `> .topbar` lines;
  - `:has(.settings-navigation)`;
  - the `:has(...) .settings-navigation` rows (twice);
  - the two `> .topbar` height lines.
- In `tests/visual-foundation.test.ts`, two comments say why. The `doesNotMatch` line on the old two-column `.settings-content` and the 760 px hide list stay.
- `tests/chrome-inner-scroll.test.ts`: the one line asserting the projects-section `.settings-content` rule goes, and its comment is updated.

## Evidence

- **State probe.** The scratch probe from W5-05 slices 1–5 isn't committed.
  - **Inputs:** the 26 parts with the attribute removed (`body.settings-page …`), applied to real elements, with the computed value of every property the rule set. It was measured on a base tree (main 777fde78e plus #666, which touches no style or page file) and on this branch.
  - **Pages:** in a Home with no project, which is when a settings address shows its own page, it opens the 12 standalone settings pages and the capabilities page directly. The other six settings addresses don't render a `body.settings-page` page without a project.
  - **Browser mode:** 1440 and 390, light and dark, with five forced states. 564 values, **0 different**.
  - **Desktop mode** (`x-molis-work-desktop: 1`; the pages render `data-native-desktop="true"`, still `data-desktop-shell="false"`): 1440 and 1024, light and dark. 564 values, **0 different**. Each run took about 4 minutes.
  - With a project, every settings address opens the workbench, `?embed=1` included, and the workbench has no `body.settings-page`.
- `node scripts/affected-tests.mjs`: the 27 non-browser files pass, 27 of 27. The changed tests pass again after merging main bd515e0c6.
- **Not run:** the 21 suggested browser files. They're workbench UI files selected from the README and package rules, and none reads the deleted rules. The state probe above is the check for this change. The full suite is the coordinator's.
- **Page assets only fall:** arrival.css −2,357, settings.css −4,408, workbench.css −4,202 bytes (`--update --base origin/main`; nothing else changed).
- `node scripts/check-health-gates.mjs --base origin/main` passes; `baseline.json` is unchanged. `pnpm boundary:check`, `pnpm lint` on the changed tests, and `node scripts/check-secrets.mjs` pass.

## Main sync verified on 2026-10-17 (Codex)

- Merged main `9626b24b1`; the only conflict was the asset budget. The three CSS reductions are preserved and the workbench script uses main's current size. No additional product behavior changed.
- Full `pnpm build` and `pnpm workspace:build` passed. Asset remeasurement and `page-assets --base origin/main` passed: 25 assets, 7,478,718 bytes. The existing measured budget already matches this merge.
- Health against the merge-base and the pre-push secrets scan passed. The two changed test files passed again: `chrome-inner-scroll` 3/3, `visual-foundation` 30/30.
- The earlier full-suite result remains historical evidence. No full-suite rerun or label change was requested here; the coordinator will review the updated head for merge-only.

🤖 Generated with [Claude Code](https://claude.com/claude-code); main-sync evidence added by Codex.


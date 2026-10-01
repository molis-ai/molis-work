# Light flat location states

> 归档（2026-10-01，合入后梳理）：判定为**已被取代**。src/web 时代 Light 选中态，已由后续改版取代。没有剩余事项。

## Background and goal

The Light desktop shell still uses white fills and exterior shadows for several
compact "you are here" states. The selected Goal Tree row, Inbox/Feed Item,
Goal mode, Goal detail tab, and Settings entry therefore read like detached
paper stickers instead of parts of one continuous workspace.

The goal is to make location and selection states feel integrated with their
directory or navigation surface, using a quiet tonal change or a short cobalt
line while keeping true content depth intact.

## Preserve, replace, ignore

- Preserve: content cards, preference choices, inputs, dialogs, menus, semantic
  status tags, focus rings, Dark mode, narrow Companion behavior, and all
  navigation and selection semantics.
- Replace: Light-mode white-plus-shadow treatments on compact navigation,
  directory selection, and current Settings controls with flat tonal fills or
  bottom markers.
- Ignore: historic CSS layers that are already overridden at runtime and
  unrelated content-surface elevation. This task does not reorganize the style
  sheet or redesign the information architecture.

## Implementation boundary

- `src/web/visual-foundation.ts`: final Light-mode overrides for location and
  selection controls.
- `tests/visual-foundation.test.ts`: regression assertions for the shared flat
  selection rule.
- `DESIGN.md` and `.impeccable/surfaces/src-web-render-ts.md`: durable visual
  guidance for Light navigation and directory selection.

No DOM, data, routing, persistence, or Runtime behavior changes are required.

## Acceptance criteria

1. In Light mode, selected Goal Tree and Inbox/Feed rows use a flat tonal fill
   with no exterior shadow.
2. The active Goal mode uses a flat cobalt tint with no exterior shadow.
3. The active Goal detail tab uses a two-pixel bottom marker with no paper fill
   or exterior shadow.
4. Current Settings navigation, project-settings shortcut, and global identity
   shortcut do not become white floating cards.
5. Compact Light hover/current controls use only tonal feedback; content cards,
   dialogs, menus, fields, and preference cards retain their intended depth.
6. Dark mode, keyboard focus, selection semantics, and responsive behavior are
   unchanged.
7. Typecheck, focused visual-foundation tests, and rendered Light desktop checks
   pass across Goals, Inbox, and Settings.

## Verification

```bash
pnpm typecheck
node --import tsx --test \
  --test-name-pattern="Light desktop navigation and directory selections stay flat|Light desktop work tabs|Web and Desktop share one project workbench" \
  tests/visual-foundation.test.ts tests/desktop-tui.test.ts
```

Then inspect representative Light-mode desktop renders for Goals, Inbox, and
Settings and confirm the computed selected-state backgrounds and shadows.

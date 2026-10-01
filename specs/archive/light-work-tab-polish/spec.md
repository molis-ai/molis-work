# Light work-tab polish

> 归档（2026-10-01，合入后梳理）：判定为**已被取代**。src/web 时代的 Light 标签样式，已由后续改版取代。没有剩余事项。

## Background and goal

In Light mode, the selected project Goal tab currently combines a white fill,
full rounded corners, and an exterior shadow. Against the quiet workbench bar,
that reads as a detached sticker instead of navigation that belongs to the
workspace structure.

The goal is to make desktop work tabs feel integrated with the workbench while
preserving their content, status, persistence, keyboard behavior, and close
action.

## Scope

- Change only the Light-mode presentation of desktop project and utility work
  tabs.
- Use typography and a bottom selection marker for the active state.
- Keep a very light transient hover surface for inactive tabs.
- Preserve Dark mode, narrow Companion behavior, tab semantics, storage, status
  dots, truncation, and close behavior.

## Implementation boundary

- `src/web/visual-foundation.ts`: Light-mode tab presentation.
- `tests/visual-foundation.test.ts`: design-system regression assertions.
- `DESIGN.md` and `.impeccable/surfaces/src-web-render-ts.md`: update the durable
  work-tab rule to match the approved flat Light-mode treatment.

No DOM, data, routing, or Runtime behavior changes are required.

## Acceptance criteria

1. In Light mode, a selected desktop work tab has no white card fill and no
   exterior drop shadow.
2. The selected tab remains obvious through stronger text and a two-pixel bottom
   marker; the real status dot remains visible.
3. Inactive tabs remain flat at rest and gain only a subtle hover surface.
4. Dark mode and existing tab interactions are unchanged.
5. Typecheck, the Light-tab regression test, and the shared Web/Desktop workbench
   behavior test pass.
6. A rendered Light-mode desktop screenshot confirms that the tab reads as part
   of the workbench bar rather than a floating card.

## Verification

```bash
pnpm typecheck
node --import tsx --test \
  --test-name-pattern="Light desktop work tabs|Web and Desktop share one project workbench" \
  tests/visual-foundation.test.ts tests/desktop-tui.test.ts
```

Then inspect one representative Light-mode desktop render at a wide viewport.

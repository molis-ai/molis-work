# Assessment B — detector and browser evidence

Independent assessment; no Assessment A or prior design reviews read. No score assigned.

## Scope and deterministic scan

Own fresh background IAB tab id 1, demo http://localhost:4186/projects/project-cc9b4ba9-4a91-4c88-92a1-e92d3609cbff. Desktop 1280×720; tab-scoped 390×844 emulation. Browser interactions used CUA only. No database actions submitted, Runtime launched, account connected, or shared theme preferences changed. Forms opened and cancelled only. Ignore file .impeccable/critique/ignore.md absent.

One detector invocation: node /Users/yijunwang/.agents/skills/impeccable/scripts/detect.mjs --json apps/workbench/src/immersive-shell.ts plugins/native/feed/src/ui.ts plugins/native/goals/src/event-document-ui.ts apps/workbench/src/scripts/client/tab-workspace.ts

Exit 0. JSON []. Zero findings; no rule names or finding locations. Exact output in assessment-b-detector.json. The fourth target is actual selected-tab markup, not CSS. No false positives. A clean detector result does not establish visual quality or keyboard continuity.

## Browser findings

### B1 — Collapsed active group loses active-page identity (P2)

Open Feed → All, then collapse Feed group. Content remains All; its selected tab disappears from accessibility tree. DOM: Feed wrapper data-active=true, data-collapsed=true; All remains aria-selected=true but has zero rendered width. Group button says only Feed, aria-expanded=false, with no current-page identity. Same observation with a Goal and collapsed Goals. The content heading still supplies identity, so this is discoverability friction rather than total loss of location.

Source: scripts/client/tab-workspace.ts 134–151 puts active state only on wrapper and labels group solely by plugin. styles/tab-workspace.ts:21 hides pages, while line 83 gives active and other group labels the same group-colored background treatment. Keep an active-page chip/name when collapsed and expose current state accessibly.

Evidence: assessment-b-collapsed-feed.png and assessment-b-collapsed-goals.png.

### B2 — Feed open/close loses keyboard position (P2; potentially P1 for keyboard-only release acceptance)

Feed → All → focus first PR #418 item → Enter. It expands in place; immediately document.activeElement.tagName is BODY. Next Tab focuses 搜索 Item, before the item, instead of staying on disclosure or entering reading content. Mouse open/close also yielded BODY focus. This was observed in demo fixture; untested real-data behavior is not asserted.

The reading pattern itself works: surrounding rows remain, same header closes, expanded state survived Home-and-return. Gap is keyboard attention location. Relevant boundary: events-secondary.ts:103–113 routes item click to selectFeedItem; navigation-feed.ts:470–508 toggles detail and queues state. Exact rerender cause was not proven. Preserve disclosure focus or deliberately move into reading region and restore it on close.

Evidence: assessment-b-feed-open.png plus live AX/DOM observation.

### B3 — Goal note form entry does not focus its form (P2)

390×844: drawer → Goals → top Goal → 打开工作区 → Goal info → 记一笔 → 随手备注. Form appears but focus becomes BODY; next Tab lands on 收起 Goal 信息与时间线 outside form. Form is reachable afterward. Cancel correctly restores focus to 记一笔. Move focus to form heading/textarea on entry, matching good cancel return.

DOM note form x=11, width=369; textarea x=27..364; Cancel/Save 44px tall at y=526.8..570.8, all reachable inside viewport. No input entered/saved. Evidence: assessment-b-goal-note-narrow.png.

### B4 — Narrow navigation works; small chrome targets remain (P2 minor)

390px: 展开目录 opens drawer; Feed changes contents, All closes drawer into reading. Goals → actual Goal also reaches document. Feed actions become two columns, each 44px high at x=29..191 and 199..361. Document scrollWidth equals innerWidth=390: no horizontal overflow observed. RSS add-task form opens, autofocuses URL, and has reachable Cancel/Create; Escape cancels.

Workspace chrome retains close targets 22×22px, group button 24px high, layout button 30×30px. These are materially smaller than 44px content actions: touch precision friction, not observed blockage. Source styles/tab-workspace.ts and scripts/client/tab-workspace.ts. Not every product form tested.

## Positive checks

- All tab + ArrowLeft activates Project Home, updates aria-selected/roving tabindex and focuses selected Home tab.
- Desktop layout menu has four labeled directions; Equal/Close disabled for one pane. Opening focuses 向右分屏; Escape closes and restores layout trigger. No split operation needed for scoped check.
- Feed has disclosure semantics and in-place reading; open state survives navigating Home then return.
- RSS configuration focuses URL and keeps explanation, Cancel/Create reachable at 390px. No submission.
- Normal computed tab transition durations 0.12s ×3, chevron 0.18s. Reduced-motion emulation makes both 1e-05s via global .01ms override. Source styles/responsive.ts:219 sets animation/transition durations .01ms and scroll-behavior:auto; tab-specific reduced rule at styles/tab-workspace.ts:120. No FPS/frame pacing claim.

## Limitations and cleanup

- Read-only evaluate disallows mutable injection. Per task scope no mutation preflight, overlay or visualization server. Fallback: screenshots, AX/DOM, computed CSS and source. No reliable visible overlay exists.
- document.getAnimations unavailable in read-only evaluate shim; computed-CSS verification succeeded separately. No CDP script injection.
- Initial narrow Feed screenshot (assessment-b-feed-narrow.png) captured with deviceScaleFactor 1 is cropped by compositor and INVALID as layout evidence; exclude it. Retained narrow form screenshots used native factor 2; possible bottom compositor duplication is not claimed as product behavior. DOM coordinates and AX reachability ground narrow conclusions.
- Emulation.clearDeviceMetricsOverride and setEmulatedMedia features=[] restored overrides. Viewport returned to 1280×720. No browser-wide viewport change; existing preview untouched.
- Only own report, detector JSON and screenshots written. No code/spec/design edits; no temporary detector server.

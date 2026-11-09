# Plugin interfaces

## Quality bar (all plugins)

First-party and generated plugins share this standard. The platform handles most of it for generated plugins; the design must still honor it.

- Use catalog components (`/__ui/catalog`, `mw-*`). A new control or interaction enters the catalog before use.
- Show empty, loading and error states. An empty state gives a centered icon, one sentence, a useful next step and a main action. Loading has a skeleton. Failure explains what happened and keeps input.
- Use one graphite primary action per view. Secondary buttons use a soft wash without outlines. Put creation at the title/toolbar end or list end. Confirm destructive actions.
- Name the person's action and actual outcome. Use human-readable values and locale-aware dates while keeping original data.
- Establish hierarchy by type first (title 600, rows and controls 500, body 400), then semantic ink and restrained spacing/dividers. No outlined stage, nested cards or decorative badges. Selected states are neutral or graphite; copper is for focus, links and progress. Icons stay neutral. Gradients belong to onboarding, not ordinary work. Shadows lift overlays and toasts, not normal content. Use tokens and verify light and dark.
- The tab already names the plugin; do not repeat its name on the stage. Standalone trial and preview may show it. Keep row actions accessible by keyboard and touch (`:focus-within`, and always visible where hover is unavailable); name shortcuts. Aim for 44px targets; wrap row actions and collapse toolbar labels to accessible icons. A truncated value can be focused/tapped to reveal the platform hint; do not add your own tooltip or truncate an unwrapped error/status.
- Use the shared mechanisms: hidden scrollbars, `data-overflow-fade` for real overflow, `molisCopy` for confirmed clipboard results and manual fallback, `mw-collapsible` for natural height, `mw-num` with a widest-value ghost for stable numbers, `molisFollow` for long streams, and `molisShowMore` for long lists (persistent key, keep important rows). Only one owner controls a follow container; release, restore, resume and dispose it with its actual view. Do not write private equivalents.
- Keep saved results visible, show success briefly and failures until recovery. Use `.mw-toast`/`renderToast` and `data-mw-state`, `is-error`, `.mw-toast__action`. A plugin owns placement, not colors, radii or motion.
- Stream in place with `molisStreamText` and SDK `growCodeTokens`, retaining block, copy button, highlighting, selection and disclosure. Read Diff line prefixes within a block. Use SDK `renderRichText` and `richPlainText` for untrusted material, with sanitized HTTP(S) links, and `redactSecrets` before rendering or sending it to a model. Reuse the SDK parsers and syntax highlighter.

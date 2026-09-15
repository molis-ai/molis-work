# README current-product refresh

## Completion level

Internal complete: GitHub visitors can recognize the problem Molis Work solves, understand its causal mechanism, verify the important claims in the real product, and try the current product from an English-first README. Chinese readers get an equivalent localized README. Screenshots must come from the real current UI and use language-matched demo content.

## Background and evidence

- `README.md` is currently Chinese and points to `README.en.md`; the requested default is English.
- Both README variants reuse the same showcase images. The English README therefore shows Chinese UI and Chinese Goal content.
- The “Codex beside Molis Work” section and `codex-companion-privacy.png` present two independent desktop windows. The intended Codex workflow is Molis Work Web opened inside Codex, not a second Molis Work window docked beside it.
- The current README largely stops at Focus, Graph, and a Goal-bound terminal. It does not explain the shipped decision center, quick capture and constraints, project-aware planning methods, Runtime connection and Session management, or the desktop work capsule currently present in the working tree.
- The first refresh still reads primarily as a product inventory. It names the pain points, but does not begin with a recognizable failure moment, explain how the product changes that failure, or attach visible proof to every major claim.
- Goal decomposition is mentioned as a noun. The README does not explain that people can combine planning methods, what those methods require a Runtime to inspect, or how coverage and dependency rules shape a Goal Tree without silently rewriting it.
- The Goal-bound TUI and Runtime setup are important parts of the product loop, but the refreshed README describes them without showing the current UI.
- The repository already contains unrelated in-progress Capsule/Web implementation changes. This task must preserve those files and only document observable behavior.

## Narrative basis

Use the research as design guidance rather than turning the README into an academic argument:

- **Cognitive offloading:** persistent external structures can reduce the demand of keeping task state in working memory. Product implication: begin with the restart/reconstruction burden, then show Molis Work as the durable external memory for intent, decisions, dependencies, and evidence. Source: Risko & Gilbert, *Cognitive Offloading* (2016), DOI `10.1016/j.tics.2016.07.002`.
- **Cognitive load and schemas:** means–ends problem solving consumes processing capacity; explicit structure helps readers form a usable model. Product implication: teach one stable loop and reuse it across the page instead of presenting unrelated features. Source: Sweller, *Cognitive Load During Problem Solving* (1988), DOI `10.1207/s15516709cog1202_4`.
- **Implementation intentions:** a desired outcome is not yet an executable plan; anticipated conditions must connect to concrete responses. Product implication: show how a Goal becomes leaves, dependencies, next actions, and completion checks rather than promising that “better goals” alone create progress. Source: Gollwitzer, *Implementation Intentions* (1999), DOI `10.1037/0003-066X.54.7.493`.
- **Elaboration likelihood:** high-involvement readers weigh argument quality more heavily than message quantity. Product implication: every core claim needs a causal explanation and real product evidence; avoid slogan stacking and a long undifferentiated feature list. Source: Petty, Cacioppo & Goldman, *The Effects of Involvement on Responses to Argument Quantity and Quality* (1984), DOI `10.1037/0022-3514.46.1.69`.

## Scope

- Make `README.md` the canonical English README.
- Add a canonical Chinese README and update language links and documentation backlinks.
- Remove the two-window Codex companion positioning. Explain and show the Codex-embedded Molis Work Web workflow instead.
- Replace the inventory-led story with a pain-driven product introduction:
  1. a concrete long-running AI-work failure the reader can recognize;
  2. the hidden cost: context reconstruction, drift, invisible blockers, and unverifiable completion;
  3. Molis Work's distinctive mechanism: the Goal survives the chat as accepted structure and evidence;
  4. the product loop, where each stage explains the before/after change and shows the real UI;
  5. boundaries, work surfaces, and installation only after the reader understands the product.
- Explain and prove the current user outcomes:
  - configurable Goal-decomposition logic through composable planning methods, including coverage questions and dependency rules;
  - stable Goal contracts, Goal Tree, dependency Graph, and executable ordering;
  - proposals and a human decision center;
  - Goal-bound TUI execution, progress, evidence, review, and recovery;
  - quick capture for evidence, risks, impact, and relations;
  - Runtime integration, project and known-Session management;
  - Web, macOS workstation/work capsule, and Codex-embedded Web surfaces.
- Produce language-matched screenshots from isolated demo data. English README screenshots must not rely on Chinese Goal titles or Chinese UI chrome; Chinese README screenshots should use Chinese UI/content.
- Fix any narrowly scoped post-render locale regression that makes the real English UI fall back to Chinese in the screenshots; do not broaden this into a UI rewrite.
- Update README packaging/link assertions so the canonical English README remains covered.

## Preserve / replace / ignore

- Preserve: local-first positioning, one source of truth across Sessions and Runtimes, human authority over accepted changes, pull-based Runtime execution, explicit install/integration boundaries, and current quick-start commands.
- Replace: Chinese-default file layout, shared Chinese screenshots, the “two desktop windows side by side” Codex story, the narrow companion gallery as the primary Codex integration, and the incomplete feature inventory.
- Ignore: historical promotional mocks and obsolete screenshots that no longer represent the current product. Do not change domain state, Runtime permissions, installation behavior, or the in-progress Capsule implementation.

## User and reader flows

1. An English GitHub visitor lands on `README.md`, understands the product loop, sees only English screenshots, and can follow the macOS or source quick start.
2. A Chinese reader switches to the Chinese README and sees the same product truth with Chinese screenshots and links.
3. A Codex user sees that Molis Work Web can stay inside Codex while the task continues, rather than being told to arrange a second desktop window.
4. A skeptical evaluator can trace the causal loop from vague intent to configured decomposition, dependencies, a human decision, Goal-bound execution, evidence, and review—not only the visual workbench shell.

## Screenshot coverage matrix

Every row requires a real current UI capture in both English and Chinese. The README may combine adjacent claims in one image only when the claimed controls and state remain clearly legible.

| Product claim | Required visible proof |
| --- | --- |
| Molis Work remains visible inside Codex | Codex in-app Browser view with Goal Tree and Focus; no staged side-by-side desktop windows |
| Goal decomposition is configurable and explainable | Project planning composition plus method detail showing planning path, coverage questions, and dependency rules |
| Dependencies determine what can run next | Graph with `part_of`, `depends_on`, status, and current focus |
| Material changes remain under human control | Decision Center with the question, evidence/gap, choices, and effect |
| Execution stays attached to the Goal | Live Goal-bound TUI with the selected Goal's outcome, next action, and completion requirements nearby |
| “Done” requires evidence and review | Goal progress/evidence/review state showing a criterion-backed record or completion gate |
| New facts remain attached to the work | Quick add dialog for Evidence, risks, affected areas, and Goal relations |
| Runtime connection is explicit | Runtime settings with detection state and the preview/confirm integration path |

## File and module boundaries

- `README.md`: canonical English product story and quick start.
- Chinese README file: equivalent Chinese story and quick start.
- `docs/screenshots/showcase/`: final language-specific screenshots with stable names.
- `docs/*.md`: only backlinks whose README language target changes.
- `tests/e2e.test.ts`: README packaging/content contract.
- `src/web/render.ts`: only the client-side sync label locale handoff exposed by screenshot QA.
- `package.json`: include the Chinese README in the package if needed; do not change runtime dependencies or product behavior.

## Acceptance criteria

1. `README.md` is English by default and links to the Chinese README; the Chinese README links back to `README.md`.
2. The English README does not reference `README.en.md`, Chinese-only documentation as its primary links, or screenshots containing Chinese Goal/UI copy.
3. No README describes the Codex workflow as two independent desktop windows. The Codex section and screenshot show the local Molis Work page inside Codex.
4. The opening narrative follows pain → cost → distinctive mechanism → evidence. Installation and the broad capability inventory do not precede the product explanation.
5. README copy explains how planning methods shape Goal decomposition and dependency reasoning, and covers the current planning, decision, Goal-bound TUI, execution/evidence, maintenance, setup/session, and work-surface capabilities without claiming cloud collaboration, model hosting, automatic agent dispatch, or silent Goal changes.
6. Every row in the screenshot matrix has legible English and Chinese evidence referenced by its matching README; no English screenshot contains Chinese UI or demo content.
7. Every local Markdown/image link in both READMEs exists; images remain legible at common GitHub widths and contain no unrelated personal/task information.
8. Packaging assertions and targeted tests pass without modifying existing in-progress product changes.

## Verification

```bash
pnpm typecheck
node --import tsx --test tests/e2e.test.ts
git diff --check
```

Also perform a local link/image existence check and visually inspect both READMEs' screenshots. Run broader tests only if the targeted checks expose a product-code dependency.

## Assumptions and tradeoffs

- “Codex embedded” means using Codex's local in-app Web surface to view the same loopback Molis Work project. It does not mean Molis Work becomes part of Codex's domain model or bypasses MCP/Skill integration.
- The work capsule may be documented only to the extent visible in the current working tree; this task will not finish or alter that implementation.
- User-created Goal content is intentionally not machine-translated by Molis Work, so English screenshots require English demo content rather than only toggling the UI locale.

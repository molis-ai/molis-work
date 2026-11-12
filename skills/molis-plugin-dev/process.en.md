# Delivery: all plugins follow these eight steps

First-party plugins written and integrated by an author and plugins generated in Studio follow the same process; the person or agent doing each step differs. A skipped step usually shows up at acceptance. Omit an unnecessary artifact, not the judgment it requires.

| Step | Work | What completes it |
|---|---|---|
| 1. Understand the request | Use the four questions from [SKILL.md](SKILL.md): what is the person looking at, when, what happens when they click, and who else needs to use it? | Answer all four. Ask only one round about unanswered points that change implementation. Do not ask about styles or sample content. |
| 2. Compare proposals | Offer two or three approaches that differ in page structure or key behavior; describe each path and tradeoff. | Each says whom it serves best and what it gives up; changing names is not a different proposal. |
| 3. Specify | List capabilities, their input and output, an example per operation, page parts and acceptance steps. | The specification agrees with itself: examples match inputs and outputs, acceptance works from empty data, and every operation has an interface entry. |
| 4. Bind capabilities and components | Choose platform capabilities for each operation and UI catalog components for each part from the legal candidates. | Use only the supplied catalogs; the person approves any needed plugin that is inactive before build. |
| 5. Draw and connect | Arrange the components according to the specification; implement the operations and connect the capabilities. | Connect each operation once it passes its own checks. Mark parts that cannot yet run as unconnected. |
| 6. Check | Check frozen contract, types, packaging, permissions, tests/examples and isolated execution. | All gates pass; the actual failure reason is visible when they fail. |
| 7. Accept | Follow acceptance steps as a person would. | Exercise the main path, empty state, failures and narrow layout. Publish only after all pass. |
| 8. Release and upgrade | Advance the version, declare data compatibility and list permissions at install. | Upgrade preserves data; uninstall offers to keep or remove it; no release silently breaks the old version. |

## Who does it

| Step | First-party | Studio |
|---|---|---|
| 1–3 | The author writes `specs/{slug}/spec.md`. | Lead design proposes alternatives and writes the specification (see [generated design](generated-design.md)); the Host checks coherence and reports any automatic normalization. |
| 4 | Choose using [UI](ui.md) and [capabilities](capabilities.md). | Select capabilities before the specification: for each proposed capability the system finds candidates from the same provider with the same read/write class and similar relevance. Jev chooses; if unavailable, retain lead design's choice. Select components afterwards. Jev chooses among legal components, applies the rule for a sole option, and asks when uncertain. |
| 5 | Implement Manifest, UI, client and Host wiring. | The UI Agent arranges components; the code Agent implements and tests each operation using [generated code](generated-code.md). |
| 6 | Run tests, type checks and `molis-work plugin validate`. | Host gates G1–G6 check contract freeze, types, package, permissions, examples/tests and sandbox execution. |
| 7 | Click through the main path in a browser. | Host uses a headless browser to exercise the acceptance steps (G7). |
| 8 | Set `version` and `upgrade_compatibility`. | Studio handles release version, installation authorization, upgrade and uninstall. |

## Adapt to model capabilities

The flow stays fixed; omit an unavailable enhancement without changing the main path or treating its absence as an error.

- Text only: preview each proposal live using real components.
- Image generation configured in the Images plugin: request one picture per proposal, once. Do not retry a failure because it might already have charged. A person can choose before images finish. The picture guides direction; the preview rendered with actual components decides what is achievable. Explain if the picture shows something the catalog cannot render.
- Image input: after acceptance, inspect screenshots for empty states, density, alignment and copy using [UI](ui.md).

## What counts as verified

Passing unit tests is not publish acceptance. Click through the main path in a browser when visible UI changes. A feature that uses a platform capability must use that real capability once after actual installation: trial and acceptance use stand-ins, and only reads are real before network-enabled installation. Report what was run, what happened and what was not verified.

# Molis Work

**English** | [简体中文](README.zh.md)

Molis Work is a Goal ledger and workbench shared by different AI Runtimes.

Long-running work fails in a boring way: a new Session cannot see the last one, the original outcome drifts as local decisions pile up, and “done” is a sentence with nothing to check. What is missing is not a smarter model. It is one project record every Runtime can read: the accepted Goal, how it was split, what is blocked, who is working, and the evidence for completion.

Molis Work keeps that record locally. Codex, Claude Code, OpenCode, or another connected Harness updates the same Goal. You confirm material changes. You can see how far the work has got without asking the model to recap.

It does not host a model and does not dispatch an agent team. Execution stays in the Harness you already use.

The longer derivation (WeChat article, link forthcoming): *[placeholder — 公众号文章待发布]*. Draft: [From conversational facts to ledger facts](https://github.com/adeptify/article/blob/main/AI%E9%95%BF%E7%A8%8B%E4%BB%BB%E5%8A%A1-%E4%BB%8E%E5%AF%B9%E8%AF%9D%E6%80%81%E4%BA%8B%E5%AE%9E%E5%88%B0%E8%B4%A6%E6%9C%AC%E6%80%81%E4%BA%8B%E5%AE%9E.md).

## Three ways to use it

Same project, three surfaces.

### Desktop

A native macOS window: focus one Goal, then open a terminal that stays bound to it. Molis Work also has a clickable **status icon in the macOS menu bar**. Click it for the current project, focused Goal, status, and next action.

<p align="center">
  <img src="docs/screenshots/showcase/desktop-focus-en-dark.jpg" width="32%" alt="Molis Work Desktop: focus one Goal beside the Goal Navigator">
  <img src="docs/screenshots/showcase/harness-runtime-en-dark.jpg" width="32%" alt="Molis Work: a terminal bound to the selected Goal">
  <img src="docs/screenshots/showcase/macos-menu-bar-capsule-en-dark.jpg" width="32%" alt="Molis Work Work Capsule opened from the macOS status item">
</p>

<p align="center">
  <sub><b>Goal workspace</b> · historical Goal-around-the-tree surface, not the current event document &nbsp;·&nbsp; <b>Goal-bound TUI</b> · the terminal belongs to this Goal &nbsp;·&nbsp; <b>Work Capsule</b> · a quick check-in from the macOS status item</sub>
</p>

### Inside a Harness

Open Molis Work in the Harness side browser and keep working in the same window. Narrow: the Goal list. Wider: the current Goal and its TUI.

<p align="center">
  <a href="docs/screenshots/showcase/harness-narrow-en-dark.jpg"><img src="docs/screenshots/showcase/harness-narrow-en-dark.jpg" width="32%" alt="Harness side panel: Goal list"></a>
  <a href="docs/screenshots/showcase/harness-runtime-en-dark.jpg"><img src="docs/screenshots/showcase/harness-runtime-en-dark.jpg" width="65%" alt="Harness side panel: current Goal and bound TUI"></a>
</p>

<p align="center">
  <sub><b>Narrow</b> · Goal list beside the conversation &nbsp;·&nbsp; <b>Wide</b> · current Goal and a TUI bound to it</sub>
</p>

### Web

The same local project in a browser. Desktop and Web share data under `~/.molis-work`.

![Molis Work Web: Goal Tree (historical workspace surface)](docs/screenshots/showcase/web-workspace-en-dark.jpg)

These images show the workspace, Goal list, Goal-bound terminal, and macOS status item. They are historical product surfaces, not the current Goal event document. The current Goal page keeps the live judgment, what is already done, the next step, and risks at the top; a time index on the left; and the selected event body on the right.

Built-in Runtime recipes cover Codex, Claude Code, OpenCode, Pi Agent, and Grok Build. Other Harnesses can use the same project through Molis Work's MCP server and shared Skill.

## Core features

Plain use, and the problem each one is for.

### See the Goal, what is done, and what to do next

Open a Goal. The page should answer three questions without reading the chat: what we are trying to get, what is already done, and what to do next. A parent Goal can record its own integration or acceptance. The number of child Goals does not prove the parent is complete.

### See who depends on whom

The Graph is for when the list is no longer enough. Parent/child describes structure. If B needs A's result, that dependency matters when B is formally completed; B can still record preparation and partial work. When a requirement changes, you can see which downstream work is affected instead of re-explaining the whole tree.

### You confirm material changes

A Runtime may discover new work, a new dependency, or a risk. It can propose. It cannot quietly replace an agreed outcome or weaken its requirements, and it cannot fill in a user identity. Trusted user decisions are recorded in Host Web or the management entry. The Decision Center puts the question, why it matters now, the evidence or the gap, and what each choice changes in one place.

### Keep the terminal on the Goal

Open Codex, Claude Code, or a custom command from a Goal. That terminal stays owned by that Goal — switching Focus later does not silently reassign it, and Molis Work does not auto-send. A parent Goal can still record integration work; it does not become “done” just because its children exist.

On macOS, the same current Goal is also on the **top menu bar**. Click the Molis Work status icon for the project, the focused Goal, its state, and the next action; click away and the panel disappears.

### Treat “done” as something you can check

Completion is not a sentence in chat. Ordinary reports save partial results and sources. Support, counter-evidence, or unknown only update the related requirements; ordinary support does not complete the Goal. An explicit close-out checks the current agreement, real support, and applicable blockers. Recorded is not the same as completion applied. Work can continue with no requirements yet; it cannot claim done.

Requirements can optionally require human acceptance. A Runtime report cannot replace that decision. Completed or cancelled work can explicitly resume with a reason; adding an unrelated note does not silently reopen it.

If something new shows up while you work, attach an ordinary note with **Add a note**. Changes to promises, authorization, or completion requirements go through the event form or a trusted user decision, not a silent rewrite.

### Tell the Runtime how this project should be split

A new intent can be saved without a plan or type, then followed by an ordinary note. Register local types when structured results help. Planning methods are optional: they offer types and default requirements you may adopt. The adopted version and this Goal’s local changes stay; later template edits do not change old meaning. Methods are not a task template and they do not auto-build the tree. A project can combine a work-type method and a domain method. Tree changes are still a proposal you confirm.

### Connect a Runtime on purpose

Molis Work works as a board with no Runtime connected. Connect Codex, Claude Code, or another tool only when it should read and advance Goals directly. Integration configuration changes are previewed and applied after confirmation; a failed apply rolls back. Ordinary Goal notes and reports follow your existing work authorization. After connecting, open a **new Session** — tools load at Session start.

## Try it in 3 minutes

### macOS Desktop (recommended)

Download the DMG for your Mac from [GitHub Releases](https://github.com/molis-ai/molis-work/releases):

- Apple Silicon (M1/M2/M3/M4…): `macos-arm64`
- Intel Mac: `macos-x64`

Open the DMG, drag Molis Work into Applications, and launch it. Desktop includes Node and the Molis Work Runtime. On first launch it installs Core into `~/.molis-work` and starts the same local workbench, without requiring Node, pnpm, or a repository checkout. App upgrades do not rewrite existing projects or history.

Development builds that are not signed with Developer ID and notarized by Apple still trigger Gatekeeper and require explicit approval in System Settings → Privacy & Security. The release workflow produces signed and notarized artifacts once the repository has the Apple credentials.

### Run from source

You need Node.js 24+, pnpm, and macOS (the persistent Web service currently uses LaunchAgent; other platforms can run Web in the foreground).

```bash
git clone https://github.com/molis-ai/molis-work.git
cd molis-work
pnpm install --frozen-lockfile

# Build and install into ~/.molis-work
pnpm install:local

# macOS: install the persistent Web service
"$HOME/.molis-work/bin/molis-work" service install --home "$HOME/.molis-work" --confirm

# Create a rebuildable demo kept separate from user data
"$HOME/.molis-work/bin/molis-work" demo create --confirm
```

Open `http://127.0.0.1:4173` and enter the demo project. In “Settings → Runtime,” preview and confirm an integration, then **open a new Runtime Session**:

> Use Molis Work to connect to the demo project, open a Goal, and tell me the current judgment, what is already done, the next step, and the completion requirements.

Runtimes read MCP and Skill manifests at Session startup, so a newly connected Runtime needs a new Session.

### Build, install, and start macOS Desktop

```bash
# Run the development app from source
pnpm desktop

# Build a DMG and App zip for the current architecture
pnpm desktop:build:macos

# Install the freshly built DMG into ~/Applications and launch it
pnpm desktop:install:macos

# Start the installed app later
pnpm desktop:start:macos
```

Each architecture ships separately because Molis Work's SQLite and PTY native addons must match both the bundled Node runtime and the Mac CPU. Pushing a `v*` tag makes GitHub Actions build Apple Silicon and Intel DMGs, but the public Release is published only after signing and notarization succeed. Credentials are read only from GitHub Secrets and never committed to the repository.

## Product boundaries

- The authoritative project state is stored in local SQLite; Molis Work does not bundle a model.
- Opening a page does not bind a Session, start a Runtime, or send a command.
- Runtime integration, terminal launch, and accepted Goal changes require explicit action or confirmation.
- All current work uses event records. Database upgrades and V3 import preserve real history and connect Goals to current state; old Draft/Claim/Run writes are retired.
- Molis Work manages Goal facts and the execution loop; it does not replace a Harness or Agent Orchestration.
- v0.2.0 introduces the event workflow and retires the legacy Runtime write protocol. See the [release notes](docs/releases/v0.2.0.md) for compatibility and upgrade steps. Public macOS installers remain pending Developer ID signing and Apple notarization.

## Further reading

- [Architecture SSOT and migration ownership](docs/SSOT-MATRIX.md)
- [Install & Maintenance](docs/installation.en.md)
- [Runtime Protocol](docs/runtime.en.md)
- [MCP Integration](docs/mcp.en.md)
- [CLI & Development](docs/cli-and-development.en.md)
- [Runtime Skill](skills/goal-advance/SKILL.md)
- [Plugin 开发 Skill](skills/molis-plugin-dev/SKILL.md)
- [Molis Work Bug Card Ledger (Chinese)](docs/molis-work-bug-cards.md)

## License

MIT, see [LICENSE](LICENSE).

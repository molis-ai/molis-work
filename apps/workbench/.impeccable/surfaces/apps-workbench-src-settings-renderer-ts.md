---
version: 1
slug: "apps-workbench-src-settings-renderer-ts"
primary_target: "apps/workbench/src/settings-renderer.ts"
related_targets: ["apps/workbench/src/styles/settings.ts","apps/workbench/src/scripts/settings.ts"]
---

Scope and mode: `/settings/projects` and per-project settings Hub, Operate. Global appearance/runtimes/diagnostics stay on their own routes. Planning method library/new/edit remain drill-downs from 工作规划.

Audience and job: a person who already has (or is about to have) local Molis Work projects. They open this page to scan the inventory, pick one, then rename it, inspect storage, expand that project's settings in place, open its Goal Tree, or manage a regenerable demo. Create is real but secondary.

Constraints: create still requires an explicit checkbox; demo stays visibly regenerable and cannot masquerade as user data; user projects are deleted only inside 基本信息 after confirmation. Copy stays product Chinese with English translations. Visual world is incumbent Calm Desktop: graphite paper, system UI type, restrained cobalt focus, near-black primary, Lucide icons. No SaaS card wall, no second brand, no five equal outline buttons.

Chosen direction: user-pinned master-detail ledger. Left inventory, right configuration of the selected project. Memorable moment: clicking a name makes that project occupy the paper stage; create waits in the rail. The stage is one left-aligned project document: identity always visible, three chapter disclosures for 项目说明 / 工作规则 / 工作规划, danger last. Not four nav rows and not a second four-page site.

Unresolved: none. The four project-settings documents now expand in the right pane; the workbench gear opens the same folds at `/projects/:id/settings`.

## Direction contract

THESIS: This page is a local project ledger — scan names, configure the one in focus. It refuses the stacked admin dump where create, demo, five buttons, and storage fights share one scrolling column.

OWN-WORLD: Calm Desktop graphite. Left rail `--rail`, 264px, 44px two-line rows, current row by ink weight and a flat tint, no chip, no cobalt bar. Right stage `--paper`. The project document is one left-aligned ~760px column: title and 打开 Goal Tree share that column, identity sits under the title, chapters are 16px headings with an adjacent chevron (not a far-right iOS chevron, not an icon+subtitle nav row). Cobalt is focus only.

STORY: In one look the visitor knows which projects live on this machine. Selecting one answers what it is, how to open it, and where to configure it. Creating is a deliberate side path that never hides the list.

FIRST VIEWPORT: Topbar unchanged. Left: heading 项目, count, scrollable radio rows (name + 本地项目/演示数据), footer 新建项目. Right: selected name at 24px, kind line, primary 打开 Goal Tree, rename field, quiet storage facts, then 项目说明 / 工作规则 / 工作规划 as chapter titles. Empty or New selects the create document on the right. Signature interaction: choosing a row instantly occupies the stage; no page-load choreography.

FORM: user-pinned master-detail (ranked #1 of the grounded list: ledger, inspector, desk register, two-speed admin, stacked dump). Surface seed 9d69857d was rolled then discarded because the user specified composition. Code-led.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

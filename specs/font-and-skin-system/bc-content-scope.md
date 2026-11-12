# 第 16 批内容版本变更候选

状态：用户已批准限定范围（2026-11-08）。这是 [B/C 开工检查](bc-preflight.md) 的具体批准范围候选，核对基点 `226ce892a8` 的版本表、源码标记和 carriers；不是整体升版许可，也不是第二份版本表。只有下列条件成立才按本批授权升版。实际值仍只改 `tooling/versions.json`，再由现有生成器更新载体。**2026-11-12 合后审计补记：** 第 16 批已按此范围实施并随 #2031 合入；实际最终版本见文末「实施结果」，其中 `prompt.assistant-base` 1→4、`prompt.plugin-builder.designer` 1→3、新增 `prompt.coding.auto-skill-catalog` 超出本表原文字，原因与待用户追认见文末。

本表候选基点均为 1。方法与固定提示词仅在本批实际新增英文正文或改变版本化内容时升到 2，同一内容的各语言共用版本；单纯搬文件、改标题展示或接入语言 authority 而正文集合未变，不据此升版。角色引用的提示词升版不连带改变角色版本；角色自己的 name/purpose/版本化声明确有差异才升到 2。未变项留在 1。

Coding 的「代码调查」「独立评审」「独立实现」子角色按 [现有派出规则](../coding-plugin/coding-trials.md#预演之后的拍板子任务带着角色的工具去2026-09-262fa61575) 把同 ID、同版本的正文作为自己的版本化定义。三组定义本批加入英文正文，角色与对应正文一同升至 2。已有轮次继续使用当时冻结的角色和正文。

范围共 45 个方法、78 个固定提示词和 18 个条件角色候选。它们落实现行内容的中英文，不授权改变业务规则、输出 schema、权限、用户指定的翻译目标语种。Shelf 的翻译动作仍按用户选定的 zh/en/ja/ko 输出，指令语言变化不改变目标语言。用户已发布 Character、保存的提示词覆盖和已有轮次冻结内容不重写、不重签。

## 方法候选

| 精确版本键 | 当前载体 |
| --- | --- |
| `method.coding-diagnose-fix`、`method.coding-git-delivery`、`method.coding-implement-change`、`method.coding-review-change` | [plugins/native/coding/src/skills.ts](../../plugins/native/coding/src/skills.ts) |
| `method.goals.domain-ai-data-product`、`method.goals.domain-app-product`、`method.goals.domain-brand-communication`、`method.goals.domain-customer-success-service`、`method.goals.domain-data-analysis`、`method.goals.domain-game-design`、`method.goals.domain-growth-distribution`、`method.goals.domain-market-analysis`、`method.goals.domain-operations-organization`、`method.goals.domain-pricing-monetization`、`method.goals.domain-product-ux`、`method.goals.domain-reliability-release`、`method.goals.domain-research-content`、`method.goals.domain-security-privacy`、`method.goals.domain-software-development` | [plugins/native/goals/methods/domains](../../plugins/native/goals/methods/domains)；文件名为键去掉 `method.goals.` 后的 `<后缀>.md` |
| `method.goals.industry-banking-payments`、`method.goals.industry-developer-tools`、`method.goals.industry-ecommerce`、`method.goals.industry-education`、`method.goals.industry-enterprise-saas`、`method.goals.industry-games`、`method.goals.industry-healthcare`、`method.goals.industry-investing-wealth` | [plugins/native/goals/methods/industries](../../plugins/native/goals/methods/industries)；文件名为键去掉 `method.goals.` 后的 `<后缀>.md` |
| `method.goals.meta-domain-pack-builder` | [plugins/native/goals/methods/meta](../../plugins/native/goals/methods/meta)；文件名为键去掉 `method.goals.` 后的 `<后缀>.md` |
| `method.goals.overlay-ai-human-review`、`method.goals.overlay-marketplace`、`method.goals.overlay-minors`、`method.goals.overlay-payments-assets`、`method.goals.overlay-sensitive-data-privacy`、`method.goals.overlay-ugc-trust-safety` | [plugins/native/goals/methods/overlays](../../plugins/native/goals/methods/overlays)；文件名为键去掉 `method.goals.` 后的 `<后缀>.md` |
| `method.goals.work-analyze-decide`、`method.goals.work-build-change`、`method.goals.work-content-communication`、`method.goals.work-design-plan`、`method.goals.work-diagnose-fix`、`method.goals.work-migrate-refactor`、`method.goals.work-operate-process` | [plugins/native/goals/methods/work-types](../../plugins/native/goals/methods/work-types)；文件名为键去掉 `method.goals.` 后的 `<后缀>.md` |
| `method.issues-capture` | [plugins/native/issues/src/skills.ts](../../plugins/native/issues/src/skills.ts) |
| `method.meeting-notes` | [plugins/native/pages/src/skills.ts](../../plugins/native/pages/src/skills.ts) |
| `method.todo-advance`、`method.todo-organize` | [plugins/native/todo/src/roles.ts](../../plugins/native/todo/src/roles.ts) |

## 固定提示词候选

| 精确版本键 | 当前载体 |
| --- | --- |
| `prompt.alchemist.copilot`、`prompt.alchemist.cross-check`、`prompt.alchemist.exploration`、`prompt.alchemist.format-correction`、`prompt.alchemist.reuse`、`prompt.alchemist.synthesis` | [plugins/native/alchemist/src/prompts.ts](../../plugins/native/alchemist/src/prompts.ts) |
| `prompt.assistant-base`、`prompt.assistant-delegated`、`prompt.assistant-thread`、`prompt.assistant-work` | [apps/local-host/src/assistant/assistant-agent.ts](../../apps/local-host/src/assistant/assistant-agent.ts) |
| `prompt.choose.capability`、`prompt.choose.component` | [plugins/native/plugin-builder/src/choice-prompts.ts](../../plugins/native/plugin-builder/src/choice-prompts.ts) |
| `prompt.coding-background`、`prompt.coding-base`、`prompt.coding-builder`、`prompt.coding-coordinator`、`prompt.coding-planner`、`prompt.coding-reader`、`prompt.coding-reviewer`、`prompt.coding-writer`、`prompt.coding-writers` | [plugins/native/coding/src/roles.ts](../../plugins/native/coding/src/roles.ts) |
| `prompt.coding.commit-draft` | [plugins/native/coding/src/prompts.ts](../../plugins/native/coding/src/prompts.ts) |
| `prompt.cognia-evidence`、`prompt.cognia.answer` | [plugins/native/cognia/src/prompts.ts](../../plugins/native/cognia/src/prompts.ts) |
| `prompt.contextual.draft`、`prompt.contextual.next`、`prompt.contextual.surface`、`prompt.information.plan`、`prompt.knowledge.locate`、`prompt.knowledge.organize`、`prompt.memory.extract`、`prompt.memory.tidy`、`prompt.onboarding.notes`、`prompt.onboarding.proposal` | [apps/local-host/src/agent-definitions/system-prompts.ts](../../apps/local-host/src/agent-definitions/system-prompts.ts) |
| `prompt.dataset.name-column` | [plugins/native/dataset/src/prompts.ts](../../plugins/native/dataset/src/prompts.ts) |
| `prompt.form.draft-questions` | [plugins/native/form/src/prompts.ts](../../plugins/native/form/src/prompts.ts) |
| `prompt.issues.name` | [plugins/native/issues/src/prompts.ts](../../plugins/native/issues/src/prompts.ts) |
| `prompt.jelly.decompose` | [plugins/native/jelly/src/prompts.ts](../../plugins/native/jelly/src/prompts.ts) |
| `prompt.lingguang.conversation` | [plugins/native/lingguang/src/prompts.ts](../../plugins/native/lingguang/src/prompts.ts) |
| `prompt.pages.generate-from-materials`、`prompt.pages.writing-assistant` | [plugins/native/pages/src/prompts.ts](../../plugins/native/pages/src/prompts.ts) |
| `prompt.plugin-builder.acceptance`、`prompt.plugin-builder.designer`、`prompt.plugin-builder.experience`、`prompt.plugin-builder.implement`、`prompt.plugin-builder.repair`、`prompt.plugin-builder.revise`、`prompt.plugin-builder.ui`、`prompt.plugin-builder.ui-review` | [plugins/native/plugin-builder/src/agent-prompts.ts](../../plugins/native/plugin-builder/src/agent-prompts.ts) |
| `prompt.ppt.draft-outline` | [plugins/native/ppt/src/prompts.ts](../../plugins/native/ppt/src/prompts.ts) |
| `prompt.schedule-base`、`prompt.schedule-brief`、`prompt.schedule-reader` | [plugins/native/schedule/src/roles.ts](../../plugins/native/schedule/src/roles.ts) |
| `prompt.shelf.combine.full`、`prompt.shelf.combine.page`、`prompt.shelf.extract-structure.json`、`prompt.shelf.extract-structure.points`、`prompt.shelf.extract-structure.quotes`、`prompt.shelf.extract-structure.todos`、`prompt.shelf.redact.all`、`prompt.shelf.redact.contact`、`prompt.shelf.redact.ids`、`prompt.shelf.shortcut`、`prompt.shelf.summarize.long`、`prompt.shelf.summarize.medium`、`prompt.shelf.summarize.outline`、`prompt.shelf.summarize.short`、`prompt.shelf.to-markdown.body`、`prompt.shelf.to-markdown.structure`、`prompt.shelf.to-markdown.toc`、`prompt.shelf.translate.en`、`prompt.shelf.translate.ja`、`prompt.shelf.translate.ko`、`prompt.shelf.translate.zh` | [plugins/native/shelf/src/prompts.ts](../../plugins/native/shelf/src/prompts.ts) |
| `prompt.todo-organizer` | [plugins/native/todo/src/roles.ts](../../plugins/native/todo/src/roles.ts) |
| `prompt.todo.organize.basic`、`prompt.todo.organize.organizer` | [plugins/native/todo/src/prompts.ts](../../plugins/native/todo/src/prompts.ts) |
| `prompt.workflows.ai-handoff` | [plugins/native/workflows/src/prompts.ts](../../plugins/native/workflows/src/prompts.ts) |

## 角色候选（须看自身声明 diff）

| 精确版本键 | 当前载体 |
| --- | --- |
| `role.assistant`、`role.assistant-delegated`、`role.thread-reply` | [apps/local-host/src/assistant/assistant-agent.ts](../../apps/local-host/src/assistant/assistant-agent.ts) |
| `role.brief`、`role.schedule.reader` | [plugins/native/schedule/src/roles.ts](../../plugins/native/schedule/src/roles.ts) |
| `role.builder`、`role.coding-builder`、`role.coding-reader`、`role.coding-reviewer`、`role.coding.main-reader`、`role.coordinator`、`role.planner`、`role.reviewer`、`role.writer`、`role.writers` | [plugins/native/coding/src/roles.ts](../../plugins/native/coding/src/roles.ts) |
| `role.coder`、`role.designer` | [apps/local-host/src/agent-definitions/builtin-instructions.ts](../../apps/local-host/src/agent-definitions/builtin-instructions.ts) |
| `role.organizer` | [plugins/native/todo/src/roles.ts](../../plugins/native/todo/src/roles.ts) |

## 明确排除

| 条目 | 原因 |
| --- | --- |
| `prompt.assistant-compaction` | 压缩提示词，本批排除 |
| `prompt.assistant-ending-review` | 结尾复核提示词，本批排除 |
| `prompt.coding-compaction` | 压缩提示词，本批排除 |
| `prompt.coding-ending-review` | 结尾复核提示词，本批排除 |
| `prompt.coding.history-summary` | 实际用于长会话 digest/压缩，本批排除 |
| `prompt.reply-language` | 已有中英文正文；Coding/Studio 只透传 authority 不改变它 |
| `prompt.task` | 用户 task 原文，不翻译 |
| `role.model-check` | MOLIS_OK 连接探针，无待翻译正文 |

正式实施与最终评审以实际内容 diff 对照这份范围，只更新必要条目；不添加让所有版本任意增长的许可。

## 实施结果（2026-11-12 合后审计补记）

第 16 批实际改 `tooling/versions.json` 的结果（与上表候选对照）：

| 条目 | 候选表原文字 | 最终版本 | 依据/原因 |
| --- | --- | --- | --- |
| `prompt.assistant-base` | 只升到 2 | **4** | 版本化正文在本批分三次实际改动：`eab9c4d241`（按冻结轮次语言选提示词）1→2、`00548db970`（助理来源与创作台设计答卷澄清）2→3、`6e5959fa2c`（回复语言应用到整份交付）3→4；每次正文变化按 `versions:generate` 升一版 |
| `prompt.plugin-builder.designer` | 只升到 2 | **3** | 同两次正文改动：`eab9c4d241` 1→2、`00548db970` 2→3 |
| `prompt.coding.auto-skill-catalog` | 不在候选表 | **新增 1** | 来自 #2030 的 Coding 自动技能目录接入；记录在 `6ec57cf0f4`，随本批 `versions:generate` 生成 |
| `role.designer` | 未写升版 | **1**（未变） | 角色自身版本化声明无差异 |

**事实与待决：** 上表原写「方法与固定提示词仅在本批实际新增英文正文或改变版本化内容时升到 2」，实际 assistant-base 4／designer 3 是因版本化正文在本批内多次改变而逐次升版；是否属用户 2026-11-08 批准的「限定范围」、是否回退，待用户决定（16.md「合后审计整改」待决⑤）。新增 `prompt.coding.auto-skill-catalog` 来自 #2030，不在本表候选，需用户一并追认或补批准记录。

## 实际升幅与用户追认（2026-11-11 合后审计）

第 16 批最终 `tooling/versions.json` 的实际升幅为：`prompt.assistant-base` 1→4、`prompt.plugin-builder.designer` 1→3，并新增 `prompt.coding.auto-skill-catalog`（1，来自 #2030 的 Coding 自动技能目录接入）。原因是版本化正文在 C 段实现期间按内容变更分几次升版（每次内容变化升一版），与候选表「只升到 2」是预设估计不同；没有降版、没有绕过版本门禁。用户 2026-11-11 在合后审计整改中追认上述实际升幅（见 [16.md 合后审计整改](../post-anticorruption-roadmap/reference/batches/16.md#合后审计整改fix16-audit-followups)）。

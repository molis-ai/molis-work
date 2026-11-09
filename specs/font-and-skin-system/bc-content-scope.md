# 第 16 批内容版本变更候选

状态：用户已批准限定范围（2026-11-08）。这是 [B/C 开工检查](bc-preflight.md) 的具体批准范围候选，核对基点 `226ce892a8` 的版本表、源码标记和 carriers；不是整体升版许可，也不是第二份版本表。只有下列条件成立才按本批授权升版。实际值仍只改 `tooling/versions.json`，再由现有生成器更新载体。

本表候选基点均为 1。方法与固定提示词仅在本批实际新增英文正文或改变版本化内容时升到 2，同一内容的各语言共用版本；单纯搬文件、改标题展示或接入语言 authority 而正文集合未变，不据此升版。角色引用的提示词升版不连带改变角色版本；角色自己的 name/purpose/版本化声明确有差异才升到 2。未变项留在 1。

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

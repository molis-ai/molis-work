# AGENTS.md 精简记录

状态：已采用，2026-11-11 第 27 批按[决定 37](../../../post-anticorruption-roadmap/reference/decisions.md#decision-37) ④ 写出，用户同日在弹窗里同意替换；根目录的 `AGENTS.md` 就是精简后的全文，本文件只留改了什么、细节去了哪里的对照。

## 2026-11-12 审计修复记录

- **事实更正**：旧文写的「空 catch 5」「`as unknown as` 199→202」实际是 **1** 和 **137**；Rust 检查范围还含 `apps/sync-worker`、`server/src/sync`。精简稿没有保留这些旧数字，避免再次过期；本节是更正记录，门禁口径见 `tooling/gates/README.md` 与 `scripts/gates/native-checks.mjs`。
- **补回仍有效的例外**：旧文「插件同等待遇」里的“装上的插件不能在 Manifest 写升级段（`plugin.upgrade_steps_unsupported`），U4 做完再开放”是唯一的例外；精简稿漏掉了。已在 `AGENTS.md` 的同一条补回；补后 **9,207 字节**（原 9,076）。
- **同意记录**：`27.md` 记“用户 11-11 弹窗同意”；issue #1743 的 11-09 评论只记“完整稿已展示、未替换、待决定”。没有独立决定条或用户评论；本次审计补记了决定 39（按 11-11 弹窗记录），用户如不认可可改。
- draft 的“没有删任何一条约束”不准确：这次确实压掉了细节，并漏了升级段例外；以 `AGENTS.md` 现文为准。

## 为什么改、改了什么

现行 `AGENTS.md` 约 36 KB、81 行，最长的一行 3,300 多字。它同时做了三件事：告诉会话先读哪里、列出不能破的硬约束、把每个门禁的口径与历史抄一遍。第三件和 `tooling/gates/README.md`、`scripts/gates/README.md`、`docs/system/PARALLEL-DEVELOPMENT.md` 等处重复，数字一变就有两处要改（本批就修了两处已经过时的）。

精简稿只留前两件：

- **先读哪里**：表不变，只合并重复行。
- **硬约束**：每条只写规则本身和它为什么存在（一两句），细节、例外清单、用户决定的日期和门禁实现都链到它们的主人文档。约束本身保留；2026-11-12 审计补回了被漏掉的升级段例外，其余被搬走的是口径与历史。
- **构建与测试**：只留命令与几条最容易踩的坑，门禁逐条口径链到 `tooling/gates/README.md`。

下面「对照表」逐条说明原文里的内容去了哪里。

## 对照表

| 现行段落 | 精简稿怎么处理 | 细节在哪里 |
| --- | --- | --- |
| 开头介绍、先读哪里 | 保留；「改合同」「发版」「升级段」三行合并成「改合同、库结构、版本、发版」一行 | 原链接全部保留 |
| 插件不 import 别的插件、能力注册一次 | 保留 | `specs/action-architecture/spec.md` §3 |
| 模型调用只经 `horizontal/agent-host` | 保留 | `skills/molis-prologue-ai/SKILL.md` |
| 外部作者只装两个包、SDK 共用工具清单 | 规则保留；SDK 里共用工具的长清单移走 | `packages/plugin-sdk/README.md`「开发要求」 |
| `scheduling: "concurrent"`、取消后不写业务记录、两个用户决定的例外 | 规则保留一句；S-35、S-95 两个例外只写编号与一句话 | `docs/system/SECURITY-INVARIANTS.md` |
| 合同只认现行取值、升版本带升级段 | 保留 | `docs/system/CONTRACT-CHANGES.md`、`upgrade-chain-design.md` |
| 可信身份从调用上下文来 | 保留 | — |
| 新内置插件只走 Plugin Runtime、两个构建期例外 | 规则保留；项目级与 Home 级两种写法各一句；例外只写名字 | `skills/molis-plugin-dev/host.md`、`tests/builtin-plugin-assembly-gate.test.ts` |
| 插件同等待遇 | 保留 | `specs/archive/repository-anti-corruption/spec.md` §1 |
| 插件只出内容、不出整页 | 保留 | `specs/shell-page-exceptions/spec.md` |
| 成果库只收留存版本 | 保留 | 两个门禁测试 |
| 删项目只有一份服务 | 保留 | `docs/system/CALL-CHAINS.md` 链 2 |
| 项目文件夹只在目录库里记 | 保留 | `specs/shared-sources-and-surfaces/spec.md` |
| DOM `CustomEvent` 登记 | 保留 | `packages/contracts/src/platform/dom-events.ts` |
| 界面文字、语言与外观（现行 2,000 字） | 规则压成四句：短句用 `t`、存键不存译文、颜色字体只写语义变量、回复语言平台一处给；第 16 批前后的过渡说明移走 | `skills/molis-plugin-dev/text-and-appearance.md` |
| vendored Prologue | 保留一句 | `vendor/prologue-sdk/README.md` |
| 一张表只由建它的包读写 | 保留 | `tooling/gates/table-owners.json` |
| 本机安全边界 | 保留 | `docs/system/SECURITY-INVARIANTS.md` |
| 构建与测试十几条门禁口径（约 18 KB） | 只留「门禁对照 merge-base、只许变小、PR 里调不大，改门禁先问用户」这一条原则和命令；每个门禁的口径、例外与历史链到 `tooling/gates/README.md`；产品子集与隔离、创作台回放、评审截图三条触发规则各留一句 | `tooling/gates/README.md`、`scripts/gates/README.md` |
| 协作 | 保留，合并重复的「推送前先问」 | `docs/system/PARALLEL-DEVELOPMENT.md` |

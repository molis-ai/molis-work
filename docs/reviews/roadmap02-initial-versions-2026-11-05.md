# 第 02 批：提示词、角色与安装清单的统一起点

状态：2026-11-05 隔离实现与验证；真实 Home 的重建日期仍由维护现场填写。需求沿用[第 02 批第③项开工检查](../../specs/post-anticorruption-roadmap/reference/batches/02.md#origin-reset-preflight)和[对抗式审查 N31～N34](adversarial-review-2026-11-01.md)。本轮不执行真实 Home 维护，也不恢复暂停的 Memory 工作。

## N31、N32：各 owner 的版本与消费

起点为 `164499abef`。U0 在 `cb33e606b3` 构建上的真实报告拒绝 29 个提示词、12 个主角色、3 个子角色及 `MEMORY_GATE_VERSION`。本轮仅重置这些项目自己的当前声明；正文、工具、权限、角色目的和原有运行时检查保持原样。

| Owner | 当前声明 | 消费与记录 |
| --- | --- | --- |
| 个人助理 | `apps/local-host/src/assistant/assistant-agent.ts` 的 3 个提示词与 2 个角色归一到 1 | 同一份正文与 `ASSISTANT_AGENT` 同步，Host 冻结当前角色、提示词和工具集 |
| Coding | `plugins/native/coding/src/roles.ts` 的 10 个提示词、7 个角色及 3 个子角色归一到 1 | Manifest 与 `codingPrompts` 同步；工具、执行级别、父子关系与压缩入口保持原样 |
| 插件创作台 | `plugins/native/plugin-builder/src/agent-prompts.ts` 的 8 个提示词标签统一为 `<阶段>/1`；Host 的 designer 角色归一到 1 | `builderPromptVersion` 从同一标签取整数 1；`builderPrompts` 解析用户覆盖，工作流仍在请求与持久运行记录中保留 `designer/1+user.<修订号>` 等标签，`ui-review` 前缀保留 |
| Schedule | `plugins/native/schedule/src/roles.ts` 的 2 个提示词与 reader 角色归一到 1 | Manifest 与正文同步；到点 Agent 仍只拿声明的只读工具 |
| Todo | `plugins/native/todo/src/roles.ts` 的 1 个提示词与 organizer 角色归一到 1 | Manifest 与正文同步；业务工具集保持原样 |
| Alchemist | `plugins/native/alchemist/src/prompts.ts` 的 `alchemist.cross-check` 归一到 1 | 现有登记指令与 Host 推理入口继续消费相同正文 |
| 项目上手 | `apps/local-host/src/agent-definitions/system-prompts.ts` 的 notes/proposal 归一到 1 | 原 owner、用户覆盖与指令使用登记保持原样 |
| Memory | 同文件的 extract/tidy 以及 `horizontal/memory/src/policy.ts` 的规则常量归一到 1 | 规则显示名由同一常量生成；批准、来源核验、撤销与后继版本检查仍走现有实现，不重写旧记录 |

`coding-background` 的活验收历史从当前正文的第 1 版开始，当前正文指纹保持不变。旧模型评测及其原版本留在原规格中。创作台真实答卷和导入运行记录保留当时的 `promptVersion`，不把旧材料伪装成新版本生成；回放基线只更新当前挂载提示词的版本摘要。外部 API、SQLite 二进制、第三方包与产品 SemVer 不在这次归一范围。

## N33：清单版本与拒绝

安装清单源码 `apps/local-host/src/installer/home-contract.ts#SCHEMA_VERSION` 已为 1。本轮在[发布检查单版本表](../releases/CHECKLIST.md#3-各库版本表)补入安装清单 `config/installation.json` 和发行清单 `releases/molis-work-<version>/release.json`。两份文件的写入沿同一个常量；安装、生成的启动器和卸载共用 `isCurrentInstallManifest` / `isCurrentReleaseManifest`，不支持的版本不得被当作本机拥有的当前清单。

拒绝证据沿现有真实路径：`tests/install.test.ts` 的 IMETA-02 在 schema 4 的安装/发行文件上拒绝初始化或替换，逐文件核对内容和目录不变；IMETA-04 实际执行生成的 Node 启动器，错误清单必须在 payload 执行前失败。`tests/uninstall.test.ts` 的 IMETA-04 要求预览冲突、确认拒绝，用户项目、清单、启动器和记忆文件保持原样。这些不是只对校验函数的结构检查。

## N34：待释放版本名后的改动清单

2026-11-05 只读查询 GitHub：公开的 [v0.1.0 prerelease](https://github.com/molis-ai/molis-work/releases/tag/v0.1.0) 及同名 tag 仍存在，tag 指向 `60ca973e2b528d994e90712fe4d3d9e4df165a98`；[v0.2.0 release](https://github.com/molis-ai/molis-work/releases/tag/v0.2.0) 及 tag `49c74fd0f94c484962e60b97d13e83cb1b1354bb` 也仍存在。v0.3.0 仍为草稿，未发现同名 tag。旧发布/tag 由一骏处理，本轮只查询，不删除发布或复用被占用的名称。

| 释放名称后须一起核对的源 | 当前值或用途 | 当前工具与实操边界 |
| --- | --- | --- |
| 根 `package.json`、`apps/desktop/src-tauri/tauri.conf.json`、`apps/desktop/src-tauri/Cargo.toml`、`apps/desktop/src-tauri/Cargo.lock` 的 molis-work-desktop、`apps/local-host/src/product-version.ts#PRODUCT_VERSION` | 产品版本都是 0.3.0 | `node scripts/verify-release-versions.mjs`；打 tag 时再传 `--tag v0.1.0` |
| `plugins/native/*/src/manifest.ts` | 现行 23 份均为 0.3.0 | 同一版本核验脚本；构建后的 `tests/builtin-manifests-contract.test.ts` 与 `tests/plugin-release-artifact.test.ts` 核对目录及 bundled 跟随 |
| `docs/releases/CHANGELOG.md`、`v0.2.0.md`、`v0.3.0.md`、`POLICY.md`、`docs/system/CONTRACT-CHANGES.md` 第 2 节 | 当前候选与下一版说明 | 按实际复位更新现行说明；保留需要的历史事实，发布说明和版本脚本同轮核对 |
| `apps/desktop/adapters/tauri/src/web_service.rs` 的内置运行时替换路径 | 依内置产品版本决定何时替换已装运行时 | 已装 0.3.0 的开发机须随维护窗口手动重装；本轮不改替换规则或真实安装 |

23 个内置目录为 alchemist、coding、cognia、dataset、diff、feed、files、form、git、goals、images、inbox、issues、jelly、lingguang、pages、plugin-builder、ppt、schedule、shelf、text-stats、todo、workflows。官方集成、示例、第三方包和私有工作区包 0.0.0 各沿原协议，不随产品复位改号。

## 验证记录

本轮整体构建与随后补注释的增量构建均通过。源码 AST 对照 `164499abef` 核对 8 个 owner 文件的 607 个非版本字符串/模板，全部逐字一致，包含提示词正文与角色工具名。

本机测试全部经机器 browser 槽、`--jobs 1`，各文件由公共 runner 分配独立 Home；浏览器使用专用测试入口。短批之间释放槽位，不在本机跑 Full。

| 验收 | 结果 | 证据 |
| --- | --- | --- |
| N31、N32 / U0-03 实际登记 | 通过 | `node scripts/gates/initial-versions.mjs` 退出 0，原 45 项归一后没有剩余问题；不变更门禁脚本或排除名单 |
| N31 登记与消费 | 通过，6 份、34/34 | initial-versions、prompt-registration、agent-definitions、builtin-plugin-agent-texts、todo-agent-declaration、agent-prompt-layers |
| N32 规则写入与拒绝 | 通过，8 份、92/92 | memory-learning、memory-service、memory-runtime-policy、memory-promotion、memory-source-owner、memory-plugin-save、project-deletion-memory、security-invariants-injection |
| N33 安装、启动器、卸载与版本表 | 通过，3 份、52/52 | install、uninstall、verify-release-versions；生成启动器另补发行清单 schema 4 的拒绝，必须没有 payload 输出 |
| N31 创作台运行与恢复 | 通过，3 份、93/93 | agent-built-plugins-workflow、agent-built-plugins-agent、studio-replay；用户覆盖实际运行并保存 `designer/1+user.1` |
| N31 固定语料与隔离冒烟 | 通过 | `pnpm studio:replay --base 164499abef`：401 份答卷，251 份接受、150 份按原规则拒绝，与当前及 merge-base 基线的每条结果一致。`pnpm studio:replay smoke --stand-in`：3/3 到达冻结设计，全部首答通过，0 修复；只更新当前提示词挂载标签，原语料、摘要、拒绝、退役编号与 Skill 阶段证据保持原样 |
| 结构与产物 | 通过 | 相对开工提交 `164499abef` 的健康门禁、包边界、51 项页面预算和 diff 检查；版本核验保持产品 0.3.0，63 个私有 workspace 包为 0.0.0，42 行库/文件版本表与源码一致 |

20 份定向文件累计 271/271，无失败或跳过。其余跨包宽覆盖交主会话在最终组合树执行 CI Full。这些结果证明隔离构建中的登记、消费和拒绝；不证明真实 Home 已重建、现场回退成功、真实商业模型的生成质量或用户已验收。

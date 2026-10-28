# Sessions 重做：国内外 AI 工具的会话查看与接续

状态：需求草案（2026-10-28）；用户已定覆盖国内外主流公司的 AI 开发工具，不限 Codex 与 Claude Code。覆盖范围已定，交互与接入细节待继续梳理；尚未实现或验收。本轮交付为概念方案与需求记录，先不开发。负责人：Codex（需求维护），实现待分配。

## 1. 要解决的问题与既有决定

用户在不同 AI 工具中推进同一项目，需要从 Molis 找到之前的会话、看清进展、回到原工具继续，并把工作交给另一个工具。不能只接两家海外工具，再把国内工具或其他主流厂商留为无期限后续。

旧 Sessions 已于 2026-10-23 随 SC-4 下线。当前 MCP 的 Runtime／项目关联不等于会话历史读取或恢复；现状见 [PRODUCT](../../PRODUCT.md)、[SC-4](../repository-anti-corruption/slices/sc-4-sessions-offline.md)。本需求承接 BL-177 与产品建议 B2；会话目录与恢复、普通消息、跨 Runtime 交接、会话搜索和首页「说一句」仍在完整范围内，不因本轮先确定厂商覆盖而删减。

沿用 2026-10-18 的决定：Sessions 是平台事实，不恢复旧 Sessions 插件。外部工具拥有原生会话与执行状态，Molis 维护自己的关联和访问入口；不能通过读到一份日志就声称接管了原工具的运行。

## 2. 已定覆盖范围

**国内外主流公司的 AI 开发工具都纳入本需求。** 按实际产品及入口登记，不能以支持一家模型 API 代替支持这家工具的会话，也不能用 CLI 的通过代替同品牌桌面端、IDE 或云端会话的通过。已有 OpenCode、Pi 等开放工具的方向保留，同走公共接入合同。

下表是 2026-10-28 按官方产品资料整理的覆盖基线，不是已接通清单，也不是永久封闭名单。实施时核对当时的产品名称、入口与官方能力；新增或更名的主流产品继续补入同一表，旧品牌与新产品是否共享会话须实测。可以按依赖分批实现，但少数工具先通过不能视为本需求整体完成；未接通项须保留在原范围和未完成清单。

| 地区／公司或产品线 | 纳入的工具／入口 | 官方依据；不代表 Molis 已适配 |
| --- | --- | --- |
| 海外 · OpenAI | Codex 的本机及其他正式会话入口 | [CLI 会话命令](https://learn.chatgpt.com/docs/cli/reference) |
| 海外 · Anthropic | Claude Code | [会话管理](https://code.claude.com/docs/en/sessions) |
| 海外 · Google | Gemini CLI、Antigravity | [Gemini 会话](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md)、[Antigravity 产品入口](https://www.antigravity.google/docs/overview) |
| 海外 · Microsoft／GitHub | Copilot CLI 及 Copilot 的其他会话入口 | [Copilot CLI 会话](https://awesome-copilot.github.com/learning-hub/cli-for-beginners/02-context-and-conversations/) |
| 海外 · Cursor | Cursor Agent／CLI、编辑器会话 | [CLI 会话命令](https://docs.cursor.com/en/cli/reference/slash-commands) |
| 海外 · AWS | Kiro | [Kiro 产品入口](https://kiro.dev/docs/getting-started/installation/) |
| 海外 · Cognition | Devin 与 Windsurf／Cascade 产品线 | [Cascade 当前官方文档](https://docs.devin.ai/desktop/cascade/cascade) |
| 海外 · xAI 产品线 | Grok Build | [Grok Build](https://x.ai/build) |
| 海外 · JetBrains | Junie | [Junie CLI](https://junie.jetbrains.com/docs/junie-cli.html) |
| 海外 · Factory、Amp | Droid、Amp | [Droid CLI](https://github.com/Factory-AI/factory/blob/main/docs/reference/cli-reference.mdx)、[Amp 文档](https://ampcode.com/docs) |
| 国内 · 阿里及相关产品入口 | Qwen Code、通义灵码；Qoder 国内／国际入口分别核对 | [Qwen 命令与会话](https://qwenlm.github.io/qwen-code-docs/en/users/features/commands/)、[灵码](https://lingma.aliyun.com/lingma/download)、[Qoder](https://docs.qoder.com/cli/cli-reference)、[Qoder CN](https://docs.qoder.cn/en/cli/sessions) |
| 国内 · 腾讯 | CodeBuddy | [CLI 会话命令](https://www.codebuddy.ai/docs/cli/cli-reference) |
| 国内 · 字节跳动 | TRAE、SOLO 的国内／国际实际产品入口 | [TRAE 产品说明](https://docs.trae.cn/ide_what-is-trae-code)、[SOLO](https://www.trae.cn/solo-web) |
| 国内 · 月之暗面 | Kimi Code | [会话与上下文](https://www.kimi.com/code/docs/en/kimi-code-cli/guides/sessions.html) |
| 国内 · 智谱 | ZCode | [ZCode 官方文档](https://zcode.z.ai/en/docs/install) |
| 国内 · MiniMax | MiniMax Code／Agent 的开发任务会话 | [MiniMax Code](https://github.com/MiniMax-AI/minimax-code)、[开发 Agent](https://agent.minimax.io/tools/ai-coding-agent) |
| 国内 · 百度 | Comate／Zulu | [文心快码](https://comate.baidu.com/docs/vscode.html) |
| 国内 · 华为 | CodeArts 代码智能体 | [产品说明](https://support.huaweicloud.com/intl/zh-cn/productdesc-codeartsagent/codeartsagent_pd_0001.html) |

其他主流国内外产品按同一覆盖原则补入，不以本表未写出为排除理由。DeepSeek 等模型若被某个工具采用，会话仍按实际工具登记；如有独立会话产品，则单独核对并纳入，不能把换模型算作另一工具的会话接入。

## 3. 各家必须核对的用户能力

每个产品入口分别核对：发现与关联会话、读取可展示历史、搜索、返回原会话、恢复执行、发送普通消息、获知进展与需要用户处理的状态、向其他工具交接。来源、账号、项目、会话和当前执行目标须可辨认；同名项目或不同账号的同名会话不能混用。

官方文档已描述会话恢复的工具，也必须通过真实产品路径证明 Molis 能正确调用。仅找到日志、提供模型、配置好 MCP、打开应用首页或启动新对话，都不能记成“原会话恢复成功”。没有开放对应能力或尚未验证时，显示具体缺口及可用的返回原工具、导出或交接入口；不得显示空列表冒充没有会话，也不得以静默新建会话冒充续接。受限项仍记为未完成，改变承诺范围另行明确。

本机、IDE、桌面和云端采用各自实际存在的访问方式；优先公开接口、正式命令、协议或用户授权的导出／本地记录。不假设各家都提供完整 API，也不靠改写另一工具的私有库伪造可恢复会话。接入现有云端会话不等于在本需求中自建远程执行平台。读取会话也不自动授予发送、运行命令或修改文件的权限，沿用当前任务与服务连接的有效授权。

交接至少让接手工具得到原任务、有效要求、已确认决定、成果位置、未完成事项和必要来源；原始记录与交接内容分别标明。不能声称另一工具内部运行状态、私有推理或所有隐藏上下文已迁移。具体交接界面及默认带入范围在下一步产品设计中明确。

## 4. 机制、边界与依赖

- 各厂商差异收在其接入适配中，平台共用会话目录、展示、搜索、定位、输入和恢复合同；不在首页、每个插件或宿主路由分别维护厂商名单。先复用现有 Runtime 接入与公开合同，再补已证实的缺口。
- 保留原生记录的主人；Molis 的索引或展示缓存须能回到来源并反映读取失败、权限变化和来源变化。账号、凭据、授权归原服务；项目、目录及运行位置沿[项目资料方案](../product-flow-governance/workspace-and-materials-design.md)，不另配一套 Sessions 工作目录。
- UI 沿[统一输入](../unified-input-voice/spec.md)与[工作台布局](../product-flow-governance/spec.md)，实施前做包含多厂商真实或逼真内容、加载、长历史、失败与恢复的高保真可操作切片。
- 需要 AI 总结或整理交接时，经现有 Agent Host／Prologue 消费已授权内容，给出有出处、可检查和可修正的结果；失败保留原记录与有效草稿。普通列表、搜索与返回原工具不强制先等模型总结。
- 断线、取消、撤权、来源升级和重启后核对实际状态；结果未知的消息或执行不能盲目重发。浏览历史不启动执行，恢复必须针对明确会话及有效授权。
- 接入外部 IDE 的既有会话不恢复 Coding Q8 已取消的 Molis VS Code 扩展、Tab 补全或行内编辑开发，也不改变 ACP 原方向未排期的状态。旧 Sessions 数据清理沿 SC-5 的独立授权，本轮不读取或恢复旧库。

本轮只允许修改本文、需求索引及演进计划／Backlog 的关联条目。后续实现边界预计涉及公共 Runtime／会话合同、外部工具适配、平台会话服务与工作台组件；具体文件在读取当时实现后确定。Coding、个人助理及原生外部工具的领域数据仍归原主人，不复制为第二份执行事实。

## 5. 验收与当前证据

以下是未来验收要求，不是本轮通过结果。每家、每个实际入口分别记录产品版本、验证环境、通过能力与缺口；不以一家通过外推其余厂商或地区版本。

| 编号 | 必须证明的行为 | 验证方式 |
| --- | --- | --- |
| SRB-01 | 国内外覆盖表逐项有明确接入状态；不存在只完成 Codex／Claude Code 就宣告整体完成，或用模型接通替代会话支持 | 对照覆盖表、产品能力与实际交付结果；受限及未测项仍列未完成 |
| SRB-02 | 在同一项目中找到不同厂商的真实历史，正确读取、搜索并返回精确会话；读取失败与无历史可区分 | 使用本人授权或隔离测试账号的实际会话，核对原工具内容与标识 |
| SRB-03 | 已支持恢复的入口确实接续目标会话并保留前文和成果，未暗建新会话；不支持时准确提示 | 原工具真实恢复及后续交互，核对恢复前后身份、历史和效果 |
| SRB-04 | 普通消息投递给正确目标，有真实结果；等待、断线、回执丢失与重启不导致重复消息或重复执行 | 制造真实中断并核对原工具收到的输入及外部副作用 |
| SRB-05 | 跨工具交接保留关键任务、决定、成果与未完成边界，接手后能继续真实工作；缺失内容可见 | 用同一实际任务在不同厂商间接续，检查遗漏、错误归属与重复操作 |
| SRB-06 | 不同账号／项目不会串读串发；停用、撤权、取消和来源升级确实约束后续读取与操作 | 边界拒绝、并发变化与重启实操，检查业务副作用 |
| SRB-07 | 国内／国际版与 CLI／IDE／桌面／云端的支持状态分别真实；受限入口仍有明确去处与未完成记录 | 按实际产品入口验证，不以共享品牌或公共模型替代 |
| SRB-08 | 会话列表、长历史、搜索、返回、输入与恢复在同一工作台路径中可顺畅使用；AI 整理失败不丢原记录或已完成成果 | 高保真及真实产品路径实操，工程结果与本人验收分别记录 |

本轮文档检查：`git diff --check`、仓库 `docGateProblems` 文档与仓库形状检查；提交推送前运行 `pnpm secrets:check`。实现期测试须调用实际生产适配与公共路径，测试名或注释标明 SRB 编号；具体命令随实现文件确定。当前未运行任何厂商的实际会话适配、产品功能测试或本人验收。

## 6. 接续事项

已定：国内外主流工具都覆盖，不能收缩为两家首批；产品能力差异逐项保留为缺口。下一步依次明确会话的归集入口、查看与继续的交互、交接带入范围，再完成技术方案与高保真；这些未定细节不改变已确认的厂商覆盖。实施仍沿[演进计划](../post-anticorruption-roadmap/spec.md)的 C 轨与实际依赖，不因本轮建档自动开工。

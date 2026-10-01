# 验证记录

2026-09-23。所有导入/编辑/发布实操使用隔离的 Molis Home 和测试项目，未修改用户原 Agent 配置、登录凭据或模型设置。

## 真实 Prologue / MiniMax

使用全局设置已有的 `Minimax / MiniMax-M3`，通过生产 `AgentHost → Prologue adapter → 已安装 SDK → 模型` 调用。凭据由已有 ModelProviderStore 解析，没有复制到测试文件或输出。

浏览器从测试 Codex 配置导入：一条 AGENTS.md、一份 ledger-check Skill、一个 references/policy.md 文本附件，并通过真实项目 Artifact 路由发布 v1。任务只要求读取工作区 expenses.csv 并使用该 Skill，不在任务中重复规则。

输入：差旅 190、会议餐饮 230、其他 100。导入附件规定差旅限额 180、餐饮限额 240、总预算 600，以及核验码 LEDGER-47。

实际结果：completed；模型调用读取了 expenses.csv，正确报告总额 520、差旅超标 10、剩余额度 80，并输出 LEDGER-47。任务文件未修改。关闭并重新创建 Prologue adapter 后，执行历史、固定角色引用与 character_skill_ids 保留。

第一次真实调用暴露相对附件路径被误当工作区路径的问题；已明确说明文本附件在上下文内按文件标签提供。修复后再次真实调用完成，未再发生技能附件路径读取失败。

## 工程与实际 UI

- Contracts、Characters Module/Plugin、Coding Plugin、Agent Host、Workbench、Local Host 定向构建通过。
- 37/37 定向回归测试通过，覆盖导入、HTTP、发布、Coding、原生执行、Agent Host、Prologue、Module 与外观。
- Discovery/Core：五种来源、条件/项目规则、权限边界、凭据排除、符号链接、插件启用索引、重复导入、revision 更新和完整附件；真实 SQLite Artifact 保存超过 56.8MB 后重开逐附件校验通过。
- 内置 Host：原文/附件进入上下文、不兼容/容量/项目范围拒绝、选定子集排除未使用原生包并保留原版本来源。
- 原生：真实 PTY 测试进程读取已保存角色包、保存输出、同请求附着不重复启动、显式停止产生记录；参数覆盖五种 CLI。
- 浏览器：本机发现、手动指定配置路径、按需读取附件原文、导入保存、刷新后保留、发布 v1、选择本轮 Skill、携任务和目录进入 Coding，角色选择对话框确认 Skill 已选。
- 来源更新实操：先保存个人补充，再更改测试附件；界面报告变更 1，更新后个人补充保留，历史 v1 附件仍为原文 LEDGER-47。
- Characters Manifest 递增至 1.2.0，修复增加路由后的同版本冲突。隔离 Home 升级后角色与发布版本保留；正式 4173 服务中 Characters 入口正常打开并显示“从本机导入”。桌面和窄屏深色界面已检查。
- 正式服务自动发现五种来源；实际 Skill 多行 YAML 说明的显示问题已修复，新增回归覆盖折叠、字面量及缩进，原 SKILL.md 保持完整。

回归命令：

```sh
node --import tsx --test tests/characters-import-http.test.ts tests/characters-publication-http.test.ts tests/coding-characters-http.test.ts tests/characters-native-execution.test.ts tests/characters-agent-host.test.ts tests/characters-prologue.test.ts tests/characters-import.test.ts tests/characters-module.test.ts tests/characters-appearance.test.ts
```

## 未验证边界

原生 Claude/Codex/Grok 的 CLI 已发现，尚未用它们调用模型；AI 真实验证按用户补充要求使用 Prologue。本机 Cursor/OpenCode 未发现 Agent CLI，界面明确不能启动原生执行。各厂商权限、登录和模型失败设计上由原生交互终端处理，逐家实际行为未验证。

Cursor/Grok 插件启用索引、自定义配置中的额外来源尚未完整解析，扫描结果会列出具体 warnings。Codex 远程安装标记缺少启用状态，存在多缓存版本歧义时不猜测。内置模式目前仅支持可移植文本技能，原生依赖/脚本/二进制技能保留完整包，但不声称在内置模式等价执行。

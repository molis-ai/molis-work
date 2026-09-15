# 设置与首次使用控制面

## 背景与目标

Molis Work 现在已有自包含安装和统一 Runtime 接入服务，但用户仍只能通过 Runtime 自然语言或手工命令完成后续设置。Web 顶导也没有全局设置入口，空项目页只能告诉用户去 Runtime，无法独立完成首次可用配置。

本 Work Item 在现有 Web 中增加全局设置控制面，让用户不依赖 Runtime 对话也能配置 Runtime、创建/导入/改名/打开项目并检查安装状态。首次使用复用这些真实页面，不建立另一套向导逻辑。

## 当前行为与证据

- `/` 只有项目列表和旧 DB 迁移，空状态明确禁止在 Web 新建项目。
- 项目页顶导已有统一搜索、状态、新建、待决定、归档和回收站，但没有全局设置入口。
- `RuntimeIntegrationService` 已提供 detect / prepare / confirm / remove，Web 尚未调用。
- `MolisWorkProjectCatalog` 已提供 create / migrate / rename / list，Web 只调用 migrate。
- Web 没有全局诊断页，用户无法确认 home、版本和三个 launcher 是否完整。

## 范围

- 增加全局 `/settings/runtimes`、`/settings/projects`、`/settings/diagnostics` 页面及顶导设置入口。
- 项目列表页与项目 Goal 页继续使用同一 58px 顶导高度。
- Runtime 页面显示 Codex / Claude Code 探测状态，先请求公开 plan，再展示路径、字段级变化、备份和重启说明；用户明确确认后才调用 apply/remove。
- 项目页面支持新建、导入旧 DB、改名和打开；DB 路径只作为辅助信息放在展开详情中，不作为项目身份或主要标题。
- 诊断页面只读显示版本、Molis Work home、安装清单、CLI/MCP/Web launcher 和项目数。
- 无项目的首页提供“创建第一个项目”和“设置 Runtime 接入”两个真实入口，并允许用户直接跳过。
- UI 只调用 `RuntimeIntegrationService` 和 `MolisWorkProjectCatalog`；不直接修改 Runtime 配置、Skill 或项目 DB。

## 非目标

- 不管理 Session 关联；该能力在依赖本 Goal 的后续 Work Item 中加入同一设置控制面。
- 不在本 Work Item 实现 Origin、CSRF、control token；后续本地控制安全 Work Item 会加在这些写入 API 外层。
- 不做不可恢复的项目删除。当前 catalog 删除会清理 DB，尚无恢复服务；先不在 UI 暴露半套危险体验。
- 不新增独立 onboarding 状态机、教程模式或强制弹窗。

## 用户场景

1. 首次打开且没有项目：用户可直接进入 Runtime 设置，也可创建第一个项目，或暂时跳过继续查看说明。
2. Runtime 未接入：用户点“查看并接入”，先读清楚将修改的配置路径、Skill 链接、备份和重启提示，再确认。
3. Runtime 已接入：用户能看到“已接入”，也能先预览再明确移除。
4. 用户不使用 Runtime 自然语言：可在项目设置创建项目、迁入旧 DB、改名并打开 Goal Tree。
5. 遇到问题：诊断页可快速确认本体版本、home 和 launcher 是否完整，但不会擅自修复。

## 方案与关键决策

- 设置是全局页面，不挂在某个 project route 下；项目 Goal 页和项目列表页都链接到同一入口。
- 页面沿用“Continuous Goal File”的安静、紧凑工作台语言：一个左侧设置目录和一个连续正文面，不做 dashboard/card wall。
- 首次使用只是空状态里的上下文引导；按钮进入真实设置页，完成后无需维护“向导版配置”。
- Runtime plan 保存在 Web server 内的 `RuntimeIntegrationService` 实例中，公开 API 只返回安全摘要和 plan ID。
- 项目写操作每次重新打开 catalog 并调用其领域方法；路由层只做输入检查和结果呈现。

## 输入、输出与依赖

- 输入：Runtime ID、action、plan confirmation、项目名称、旧 DB 路径、改名目标。
- 输出：Runtime detection/plan/result、项目列表和路径、只读诊断。
- 依赖：Runtime 接入服务、项目 catalog、现有 Web server/render/design system。

## 文件与模块边界

- `src/web/server.ts`：全局设置路由、薄 API adapter、诊断读取。
- `src/web/render.ts`：设置页、空状态和顶导入口、客户端交互、响应式样式。
- `tests/web.test.ts`：共享服务、确认门禁、项目流程、语义和响应式回归。
- `DESIGN.md`：补充全局设置控制面的正式视觉与交互规则。

## 验收标准

- 桌面、移动和键盘场景都能到达三个设置页面，标签和焦点语义清晰。
- Runtime detect/plan/confirm/remove 可从 UI API 完成；未确认不会修改配置。
- 项目 create/import/rename/open 可从 UI 完成，Runtime Session 绑定保持不变。
- Runtime API 只调用注入的 `RuntimeIntegrationService`；项目 API 只调用 catalog，不直接写配置或 DB。
- 项目页与项目列表页顶导高度一致，且都只有一个全局设置入口。
- 空状态可跳过，不强制用户完成设置。

## 验证命令

```bash
pnpm typecheck
pnpm build
node --import tsx --test tests/runtime-integration.test.ts tests/web.test.ts
pnpm test
```

另用本地浏览器对桌面和移动宽度各做一次完整交互检查，并用键盘完成导航、打开 plan、取消和确认。

## 假设与开放问题

- 当前 Runtime adapter 只有 Codex 和 Claude Code，UI 从服务返回值渲染，不自行维护支持列表。
- 项目删除只有在未来具备可恢复领域服务后才进入 UI；诊断页先提供事实，不增加“自动修复”按钮。

# External release hardening completion audit

更新于 2026-08-18。本文只记录当前代码、测试、安装结果和 GitHub 状态能够证明的事实；没有直接
证据的条目保持未完成，不用“应该可以”代替验收。总目标和产品边界仍以同目录 `spec.md` 及各
Work Item spec 为准。

## 已有直接证据

| 用户问题或要求 | 当前实现 | 直接证据 | 状态 |
| --- | --- | --- | --- |
| 安装不能偷偷修改项目、Runtime 配置或启动项目 | `molis-work install` 只维护 `~/.molis-work`；Runtime、服务、demo 都是独立预览/确认流程 | `tests/install.test.ts`；真实 `pnpm install:local` 输出 | 通过 |
| 改源码后不能误装旧 `dist` | 本地唯一入口先 build；直接安装仓库会校验源码/构建指纹 | `tests/install.test.ts` 的 stale fingerprint 与 local install 用例 | 通过 |
| 同版本内容变化不能继续跳过 | release 记录内容摘要；变化时原子刷新，失败回滚 | `tests/install.test.ts` 同版本刷新用例；本机多次返回“同版本内容已刷新” | 通过 |
| 安装/接入后为什么要重启必须说清楚 | CLI、Web 接入预览、Skill 与 README 都说明 Runtime 只在 Session 启动时读取 MCP/Skill | `tests/runtime-integration.test.ts`、`tests/web.test.ts`、`README.md` | 通过 |
| 前台 Web 随终端或 Codex 会话退出 | macOS 使用用户级 LaunchAgent，RunAtLoad/KeepAlive，日志可诊断；其他平台不假装常驻 | `tests/service.test.ts`；本机真实 remove 后为 `absent`，重新 install 后跨 shell 仍为 `running`，`launchctl` 有独立 PID，`/health` 为 200 | 通过 |
| 用户对 Runtime 说“启动 Molis Work”不能误开前台进程 | Skill 先查 managed service；首次常驻安装/旧配置修复先说明并确认，已停止则启动，已运行只返回地址；只有明确“临时打开”才走前台，非 macOS 不假装后台化 | `skills/goal-advance/references/service-start.md`；`tests/mcp.test.ts`、`tests/e2e.test.ts`；本机已安装 Codex Skill 与源码 SHA-256 一致 | 通过 |
| 更新后旧 Web 进程继续跑旧 release，或进程已起但页面还打不开 | 安装不静默杀进程；公开 `service restart --confirm` 等待卸载、LaunchAgent running 和 `/health` 可访问后才返回 | `tests/service.test.ts` 延迟/失败健康检查、`tests/e2e.test.ts`；本机 restart 后立即 curl 成功 | 通过 |
| Codex stdio MCP 没有稳定 Session ID | 不把目录或 MCP 进程伪装成 Session；目录只给候选，用户确认后当前调用流继续 | `openai/codex#19937` 为 `CLOSED / NOT_PLANNED`；`tests/mcp.test.ts`、`tests/project-catalog.test.ts` | 通过 |
| 新 Session 与项目关联不能靠猜 | 有 Session ID 时恢复该 Session；没有时同目录历史仍返回 `suggested` 并再次询问 | Runtime Skill、`tests/mcp.test.ts` fresh-session 用例 | 通过 |
| 符号链接与一目录多项目 | workspace 使用 canonical realpath，可关联多个项目；普通选择不设默认，显式默认是单独决定 | `tests/project-catalog.test.ts` canonical workspace routing 用例 | 通过 |
| 项目不等于 Git 仓库，项目身份不等于目录 | 用户选择的不可变 `project_id` 才是身份；每个项目有独立 DB，目录只作候选线索 | `src/projects/catalog.ts`；项目隔离与重复名称测试 | 通过 |
| 旧静态 DB/兼容模式必须删除 | Runtime 不再读取静态项目 DB 环境配置，连接只走 project catalog；UI 不显示兼容模式 | `tests/mcp.test.ts`、`tests/runtime-integration.test.ts`、`tests/web.test.ts` 的负向断言 | 通过 |
| Codex、Claude Code 和其他 Runtime 都能接入 | Codex/Claude adapter 负责配置事务；任意 MCP Runtime 可用工具调用 `_meta` Session ID 或显式稳定入口 | `tests/runtime-integration.test.ts`、`tests/mcp.test.ts` generic Runtime、`tests/e2e.test.ts` | 通过 |
| Runtime 接入也可从 UI 完成 | 设置页提供探测、预览、确认、回滚和重启提示；不在页面打开时自动写配置 | `tests/web.test.ts` Runtime settings 用例；本机 `/api/settings/runtimes` 两项均 connected | 通过 |
| Runtime 能从粗略想法开始，不要求用户先填 Web 表单 | Skill 走 Draft dialogue start/turn/resume，再提交完整 Goal Tree proposal | `tests/mcp.test.ts` Draft 对话与真实 E2E；Skill quick validation | 通过 |
| Clarifier 是当前 Runtime 的工作指引，不是另一个 Session | `role` 只表示当前操作类型；当前对话持续提问并先持久化每次实质回答 | Runtime Skill 与 protocol；`tests/mcp.test.ts` | 通过 |
| Goal 可以拆成多级 Goal family/tree | 一份 Proposal 可包含父、子、叶子及继续细分的子 Goal；用户决定后才物化 | `tests/v1.test.ts` Goal Tree proposal/decision/compound closure 用例 | 通过 |
| 状态只有一套；澄清中的 Goal 不能显示进行中 | 从 canonical 事实派生唯一 work state；父 Goal 是“已澄清，等待子 Goal”，叶子是“待执行” | `tests/v1.test.ts` work states；`tests/web.test.ts` 状态映射 | 通过 |
| Runtime 从 Available 自己选，不由 Molis Work 派发唯一下一份 | `available → select_goal` 原子创建 Claim+Run；Skill 要求当前 Runtime 自主选择 | `tests/mcp.test.ts`、`tests/v1.test.ts` unified Available 用例 | 通过 |
| 用户在对话里确认 Proposal 后能生效 | Runtime 只能转交当前对话的明确决定；Molis Work 记录宿主元数据，不要求不存在的密码学证明 | `tests/mcp.test.ts` dialogue confirmation；`tests/v1.test.ts` Goal Tree decision | 通过 |
| Goal 删除在 UI 与 MCP 共用同一接口且可恢复 | Web 与 Runtime MCP 都调用 `setGoalTrashed`；保留历史并安全停用/恢复关系 | `tests/v1.test.ts`、`tests/mcp.test.ts`、`tests/web.test.ts` trash/restore 用例 | 通过 |
| 卸载不能误删用户项目 | 普通卸载只撤销 owned 程序/配置/服务并删除 regenerable demo；purge 另需精确 home+项目数 | `tests/uninstall.test.ts`；真实全新用户清场与复原已完成 | 通过 |
| MCP 宿主枚举 resource templates 不能报错 | `resources/list` 与 `resources/templates/list` 都返回空列表 | `tests/mcp.test.ts`、`tests/e2e.test.ts` | 通过 |
| 页面不能一次渲染全部 Goal，搜索时不能被自动同步抢占 | 初始只渲染当前 Goal；点击按需取 document；搜索输入期间延后/合并 cursor 同步 | `tests/web.test.ts`；安装后每页 1 个 Goal document、约 190–236KB | 通过 |
| 顶栏不能和列表页重复搜索、新建、归档、回收站；设置页高度要一致 | 搜索、状态筛选、新建、待决定、归档和回收站统一在顶栏；桌面/移动顶栏高度统一；1440px 对次要动作收起文字，保证回收站“返回 Goal Tree”、设置和收起不被裁切 | `tests/web.test.ts` 导航/响应式断言；真实 Chrome 1440px Goal Tree、回收站与设置截图 | 通过 |
| Goal 默认内容要先说业务问题、价值、结果和流程 | Skill/protocol 在 Draft 与 Proposal 前逐条检查 title/outcome/why/business_logic；技术细节留在约束/验收 | Skill 文本回归、quick validation、`plain-language-goal-presentation/spec.md` | 通过 |
| 原有正文内容不能继续乱分块 | 当前 Goal 是五段连续文档，不新增第二套字段或总括“执行细节”折叠 | `tests/web.test.ts` 五段顺序与表单保留断言；真实 Chrome 桌面首屏与 390px Goal 正文截图 | 通过 |
| demo 与 README 要适合朋友第一次看 | demo 使用人话 Goal，覆盖完成/推进中/依赖阻塞/待澄清、Candidate、Risk 和回收站；README 有当前 Goal Tree 截图、3 分钟与更新路径 | `src/v1/demo.ts`；catalog/web/E2E 测试；当前 Chrome 重拍的项目列表、Goal Tree、决定中心和 Runtime 设置截图 | 通过 |

## 仍未完成的交付门槛

1. **增量进入 main。** onboarding、demo/更新文档、Runtime 自然语言启动路由与服务健康就绪修复
   已由 PR #5、#6、#7 合入 `main`；真实视觉验收发现并修复的 1440px 顶栏裁切与当前截图位于
   PR #8，等待 main 规则要求的 reviewer 批准。
2. **Molis Work 验收记录回写。** 当前 Session 没有加载 `molis_work_v1_*` 工具。按 Runtime Skill
   不能用 CLI、SQLite 或 management MCP 代替；需要在工具已加载的新 Session 中连接用户选择的项目后写回。

## 最近一次验证

```text
pnpm typecheck                                      PASS
pnpm test                                           PASS (142/142)
Skill quick_validate.py                             PASS
pnpm pack --dry-run --json                          PASS
packed release fresh-install E2E                    PASS
本机 install:local + demo reset + service restart   PASS
/service restart 后立即访问 /health                 PASS
真实 owned service remove → absent → install        PASS
安装命令结束后的新 shell                            running；launchctl 独立 PID；/health 200
已安装 Codex Skill 与源码内容摘要                   MATCH
/health                                              200, project_count=2
demo tree / decisions / trash                       200 / 200 / 200
demo 导航                                            待决定 2 / 回收站 1
真实 Chrome 1440px                                  Goal Tree / 决定中心 / 回收站 / Runtime 设置 PASS
顶栏宽度扫描 1500/1440/1360/1180/1024/901/900/760/390  普通页与回收站均无裁切或横向溢出
真实 Chrome 390px                                   Goal Tree → Goal 正文切换 PASS
搜索“不同 AI”                                      显示 1 / 5；父级路径保留
切换 Goal / 按需正文                                CORE；DOM 仅 1 份 Goal 正文
等待自动同步                                         已同步 → 已同步
README 截图                                          当前构建真实重拍 4 张
```

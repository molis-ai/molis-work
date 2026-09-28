# 公开 README、真实截图与发行验收

## 目标

朋友从仓库首页能在一分钟内理解 Molis Work、看到真实界面、完成安装并知道下一步；所有文案
由真实可运行流程支撑，而不是营销描述覆盖工程缺口。

## 范围

- 复用最新 main 已加入的真实截图和 `examples/seed-demo.mts`，先核对截图与当前 UI 一致；把脚本
  seed 收敛为安装后可发现的 demo 入口和明确的数据分类，而不是重新制作一套平行演示。
- 用正式 demo 数据启动当前 release，截取真实桌面主界面、Draft 澄清/Goal Tree 和设置页；
  图片进入 `docs/screenshots`，不得使用不存在功能的合成图，也不得继续引用与当前导航、正文结构或
  demo 文案不一致的旧截图。
- 重写 README 首屏：一句话价值、截图、3 分钟体验、安装/接入/服务三步、为什么要重启、
  已安装用户的同版本刷新步骤、数据位置与卸载安全边界、常见问题。
- demo 内容同时展示人话的复合 Goal、可执行叶子、澄清中、依赖、证据、Risk、回收站和 Runtime
  接入提示，但与用户数据明显区分；技术实现可出现在验收与历史里，不能占据默认 Goal 标题和业务说明。
- 真实 tarball E2E 覆盖全新 home、build/pack/install、同版本 refresh、MCP 标准枚举、Runtime
  接入与重启续接、workspace 多项目、对话决定、LaunchAgent fixture 和安全 uninstall。
- 浏览器验收桌面/移动、搜索、切换 Goal、设置、demo、回收站与自动同步。
- 1440px 桌面下，普通 Goal Tree、回收站和归档页的顶栏入口必须全部留在视口内；中等宽度可把
  设置/收起等次要入口收成图标，较窄桌面可把所有顶栏动作收成图标，但必须保留 `aria-label`。
- 修复真实安装验收暴露的两个发布阻塞：macOS `restart` 必须等待旧 LaunchAgent
  完成卸载并在有限时间内确认新进程已运行；Runtime Contract 返回的 Web 地址必须包含其
  已选择的 `project_id`，不能落到多项目入口中不存在的 `/goals/:id`。
- 自动化全部通过后，在用户已授权的当前机器列出并删除 Molis Work home、owned Runtime/Skill、
  LaunchAgent 和项目内 Molis Work 遗留配置；再严格按公开流程从零安装并复原可用状态。
- Runtime 设置不能只靠 LaunchAgent 的 `PATH` 判断宿主是否存在；Codex App 没有可执行 CLI 时，
  只要用户目录已经存在，也必须允许用户预览并确认接入。

## 验收

- README 没有旧静态 DB、兼容模式、nohup 或“当前 Session 会自动出现工具”的错误路径。
- README 明确区分首次安装与已有安装更新；更新步骤包含先拉取源码、同内容安装入口、显式重启
  常驻 Web 和新开 Runtime Session，并说明不会自动重建 demo 或修改用户项目。
- README 和已安装 Skill 都明确：对 Runtime 说“启动 Molis Work”先检查并使用 managed service；
  只有明确说“临时打开 Molis Work”才使用会随终端退出的 `molis-work-web` 前台进程。
- 所有截图来自验收构建，页面与 README 步骤一致。
- 新用户路径不要求先手动构造 Molis Work 数据。
- 完整测试、pack dry-run、Skill 校验和关键浏览器流程通过。
- 1440px 回收站页能完整看到“返回 Goal Tree”、设置与收起入口，不发生横向裁切；移动端可在
  Goal Tree 与 Goal 正文间切换并看见人话目标说明。
- 当前机器真实清场后不借用旧 DB/配置即可完成新安装；最终留下的是新流程生成的正常状态，
  项目源码和非 Molis Work 配置没有被删除或改写。
- Codex App 只有 `~/.codex`、没有 `codex` CLI 的真实环境会显示“未接入”而不是“未检测到”，
  并可从 Web 设置完成同一套接入事务；Claude Code 和无安装迹象的 Runtime 判断不回归。
- 常驻服务从正常运行状态执行一次公开 `service restart --confirm` 可自行恢复为 `running`，
  不需要用户补跑 `launchctl`；延迟卸载和延迟启动都有自动化回归覆盖。
- 通过项目目录解析并连接 Runtime 后，`molis_work_v1_contract.goal_url` 可直接打开
  `/projects/<project_id>/goals/<goal_id>`；management/单 DB 调用继续保留原有 URL 契约。

## 修改边界与验证

- README/PRODUCT、`docs/screenshots`、demo seed、E2E 与浏览器 QA；只有真实功能完成后更新截图。

```bash
pnpm test
pnpm pack --dry-run --json
git diff --check
```

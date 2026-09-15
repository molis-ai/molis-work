# Cutover 后 Home、关系页与加载性能修复

## 背景与目标
二次只读复查确认：Web 仅设置 MOLIS_WORK_HOME、不传 --home 时，Feed 与 Catalog/Session/control token 使用不同目录。关系页 E2E 在重载后偶发点击被顶部工作栏遮挡。用户授权修复并检查数据加载性能。

完成等级：现有本地功能可用、关键链路回归通过，并提供可复现的加载测量与实际优化收益；不升级现用安装或公开发布。

## 范围、场景与非目标
- Web Home 优先级：显式 homeDirectory > MOLIS_WORK_HOME > 用户默认 .molis-work。在 Web 装配入口一次确定，并统一注入全部下游。
- 保留直接 Module/SDK 调用的既有显式参数契约，不全仓更改默认目录规则。
- 查明关系页重载/滚动/布局导致的点击遮挡根因；不通过固定等待、强制点击或忽略遮挡放宽验收。
- 测量隔离测试项目的冷/热页面与数据请求；可只读检查现用服务耗时，但不得向真实项目写测试数据。只优化已测出瓶颈，不新增通用缓存/复杂性能框架。
- 保留现有 UI、业务门禁、数据和外部权限，不增加产品功能，不修改已验收重组边界。

## 输入输出与模块边界
输入：当前代码、二次审查 /private/tmp/molis-work-second-review.md、既有浏览器/Host 回归。
输出：Home 统一装配、稳定关系页行为/准确测试同步（以根因为准）、必要性能修复、测量与回归报告。
允许修改：apps/local-host Web 装配/投影、受影响 Native Goals/Workbench 的导航和渲染/查询、Design System 相关布局、对应测试和本 spec；性能方案在测量后先补本文件。

## 验收与验证
1. 无 --home 的环境 Home 和显式 Home 覆盖环境两场景，Catalog/Session/control token/Feed 实際文件同根；重启保持，默认用户目录不被写入。沿用 tests/web-home-isolation.test.ts 并补实际失败分支。
2. 关系创建、重载、解除/取消及历史仍通过真实 Chrome hit-test；定位根因后补故障敏感的回归。
3. 记录冷/热耗时、数据规模、瓶颈与修改前后同输入对比；无明显瓶颈时如实报告，不凑优化。
4. 相关 owner build/typecheck、包边界、定向 HTTP/浏览器测试、diff 自检通过。新故障再扩大测试，不机械反复全量。

假设：当前通常使用显式 --home，不需要迁移已有用户数据。UI 遮挡尚未定性，测量前不预判后端或浏览器是性能瓶颈。

## 已测性能根因与方案
隔离合成项目 29/99/249 个可见目标的冷投影分别约 14–18/81–83/369–403 ms；每次整板快照读取为 23/93/243 次。调用栈指向 Native Goals `work-state-queries.ts`：批量状态已有 snapshot，但返工事件判断再次读取整板。
让批量推导把已有 snapshot 传入返工判断；独立命令调用仍即时读取。保留完成/返工事件先后顺序语义，不新增跨请求缓存。扩充既有批量与单目标状态对照测试，确保批量使用调用者快照、不再重复读取；运行真实返工状态转换回归。允许修改范围补充 Native Goals 查询与 tests/v1.test.ts。

## 验收记录（2026-09-08）
- 通过：Home 统一在 Web 工厂装配，三个 HTTP/存储回归通过，覆盖环境 Home、显式覆盖、并行隔离及重启后的凭据读取。未迁移数据、未升级现用安装。
- 未解决：关系页遮挡只在此前全套 Chrome 测试出现一次；两次独立关系创建/重载/取消/解除/历史回归均通过，额外手动滚动与重载未复现。尚不能确定根因；按两次有目的尝试后的停止规则记录，不加入固定等待或修改点击验收。
- 通过：同规模、同生成逻辑的隔离项目，冷投影 29 个目标 14–18 → 4–7 ms，99 个 81–83 → 13–16 ms，249 个 369–403 → 30–37 ms。整板读取统一降至每次 1 次。已有热缓存约 0.005–0.009 ms，无需改变。原始结果在 `evidence/loading-{before,after}.json`。
- 性能范围：上述测量为后端数据组装，不等于端到端网页加载时间。249 个目标投影 JSON 仍约 1.23 MB。小型隔离示例页面一次 Chrome 重载观测 TTFB 40.5 ms、DOMContentLoaded 202.2 ms、load 227 ms；这不是大项目性能承诺。
- 通过：五个定向工作状态测试，覆盖批量与单目标一致性、返工、needs_changes 后新执行/复核轮、Claim 丢失恢复。临时恢复旧重复读取行为后新增断言稳定失败，随后恢复构建产物。
- 通过：Local Host 与 Native Goals owner build；包边界检查零错误；git diff --check。此次不重跑此前完成的全部测试，未运行新的打包/安装验收。

复现：先构建相关 owner；`node specs/post-cutover-loading-fixes/evidence/benchmark.mjs /tmp/molis-work-loading-result.json`。脚本创建并清理独立合成数据库，不访问真实项目。定向命令：`node --import tsx --test tests/web-home-isolation.test.ts tests/goals-relation.e2e.test.ts`；`node --import tsx --test --test-name-pattern='batch Goal work states|rework|needs_changes|work states preserve phase' tests/v1.test.ts`。Chrome/HTTP 测试需允许本机端口和浏览器启动。

# Web 项目与 Goal 切换性能修复

## 背景与目标

Molis Work 已经按需加载单份 Goal 正文，但服务端的单 Goal 接口仍先构建整张 Board 的完整 Web View。大项目打开或切换 Goal 时，服务端会对每个 Goal 重复读取整张快照、重复执行完整可领取性检查；缓存又把 SQLite WAL 文件时间作为版本，数据库仅被打开和关闭也可能造成无效重建。

本次达到“内部完整”：不改变 Goal 状态、权限、数据结构或已有写入语义，让大项目首次打开和 Goal 连续切换保持轻量，并修复浏览器前进后退时 URL 与选中 Goal 不一致的问题。第二阶段继续减少工作台重复传输，把完整事件账本分段读取，并取消快速切换时已经过期的请求。

## 当前行为与证据

- Footballnia：155 个 Goal、1018 条关系、2596 条事件。
- 单次 `store.snapshot` 约 0.10 秒。
- 对 155 个 Goal 逐个调用 `getGoalWorkState` 约 5.23 秒。
- 对 155 个 Goal 逐个调用 `explainGoal` 约 2.74 秒。
- `buildMolisWorkWebView` 约 8.63 秒，最终 HTML renderer 约 0.07 秒。
- 实际项目请求出现过 13.7–68.8 秒首字节等待。
- `/api/goals/:goal_id/document` 仍调用 `cachedMolisWorkWebView`；缓存键包含数据库和 WAL 的大小、修改时间。
- 服务端缓存优化后，Footballnia 单 Goal 接口已降到约 0.02–0.17 秒，但正文仍有约 0.35–1.33 MB；隐藏的“完整记录”和全部事件 payload 会在普通 Goal 切换时一并生成和解析。
- 从 `/goals/:id` 后退到项目根路径时，客户端没有恢复根历史项对应的 Goal，导致 URL 与页面内容不一致。
- 第一阶段完成后，Footballnia 项目页仍约 2.61 MB，其中每次页面都内联约 218 KB CSS 和 202 KB 客户端脚本。
- Footballnia 的普通 Goal fragment 已降至约 625 KB，但完整记录首次打开仍约 709 KB；主要体积来自一次性渲染全部事件 payload。
- 快速连续选择 Goal 时，旧正文和旧记录请求虽然不会改写已经移除的节点，但仍会继续占用服务端、网络和浏览器解析时间。

## 范围

- Web View 缓存只由 Board 的权威事件游标和影响展示的路由选项失效；不再通过 SQLite 文件时间猜测内容变化。
- Coordinator 提供一次快照内批量派生全部 Goal 工作状态的只读能力。
- Web View 构建不再为了读取 resolved policy 对每个 Goal 执行一次完整 `explainGoal`。
- Web View 构建与批量状态派生共享同一份 BoardSnapshot，避免一次页面读取混用两个时点的事实。
- 普通 Goal 正文不再预渲染“完整记录”；用户打开记录 Tab 时再按需读取同一份只读事实。
- 工作台共享 CSS 和不含项目事实的客户端脚本改为独立同源资源，通过内容 ETag 复用；主题首屏脚本、语言字典和项目状态仍内联，避免闪烁或串语言。
- 完整记录默认呈现基础信息、执行记录和最近一页事件；更早事件通过同一只读记录入口逐页追加，直到完整历史全部可见。
- Goal 正文和记录请求使用独立 AbortController；开始新请求时取消同类旧请求，只有当前请求可以结束加载状态或显示错误。
- 浏览器根历史项保存初始 Goal，前进后退始终保持 URL、Tree 选中项和正文一致。
- 为缓存稳定性、状态一致性和大 Board 构建路径补充回归测试。

## 非目标

- 不改变 Goal Contract、状态机、依赖、风险、Claim、Run 或 Review 语义。
- 不重新设计页面视觉，不改变已有导航或 URL 结构；只补充记录加载与失败状态。
- 不引入新数据库、后台任务、前端框架或持久化缓存。
- 不虚拟删除、裁剪或汇总历史事件；分页只改变传输和渲染批次。
- 不把所有 Coordinator 查询一次性重写成新的查询引擎。
- 不承诺兼容绕过 Coordinator、又不追加事件的裸 SQL 写入；这不是 Molis Work 的正式写入契约。
- 不用脆弱的固定毫秒数作为 CI 成败标准。

## 方案与关键决策

1. 以 Board 事件游标作为 Web View 唯一内容版本。Molis Work 的规范写入都会在同一事务中追加事件；SQLite 主文件与 WAL 的时间、大小都不是产品事实版本。若未来需要支持外部写入，应增加事务内递增的显式 revision，而不是恢复文件时间兜底。
2. Coordinator 批量只读接口接受已经读取的 BoardSnapshot，并在所有 Goal 状态派生中复用它。单 Goal 接口保持兼容并复用相同内部路径。
3. Web 展示策略仍通过 canonical policy resolver 读取，不再通过 `explainGoal` 顺带执行依赖、风险、Claim 和影响冲突检查。本次不为微小查询耗时扩张新的查询引擎。
4. Goal 正文继续使用现有 renderer；仅把“完整记录”替换成可访问的加载占位，并新增同项目、同 Goal、同 collection 的只读 records fragment。加载完成后仍呈现原来的全部记录，不删减数据。
5. 页面初始化时用 `history.replaceState` 给根历史项记录初始 Goal；`popstate` 对 `/goals/:id` 和项目根路径都调用同一 `selectGoal` 路径。
6. 缓存负责“没有事件时不重算”，单快照批量状态负责“首次构建不重复读 Board”，记录按需加载负责“普通点击不解析不看的历史账本”。
7. 主工作台使用 `/assets/molis-work-workbench.css` 和 `/assets/molis-work-workbench.js`。服务端以资源内容生成 ETag，并要求浏览器重新验证；同内容返回 304，同版本本地刷新后内容变化也不会错误复用旧资源。
8. 事件账本以固定上限切片。第一页包含其他完整记录区块和最近事件；后续接口只返回下一页事件条目及剩余数量。按钮同时展示进度、加载中和失败状态，键盘与读屏语义保持完整。
9. 正文与记录分别维护一个当前请求。Abort 只停止过期读取，不触发错误 Toast；`finally` 只有在请求仍是当前请求时才能撤销 busy 状态。

## 输入、输出与依赖

- 输入：项目数据库路径、Board ID、事件游标、Web 路由展示选项、当前 Goal、记录 collection 与事件页偏移量。
- 输出：与现有 `MolisWorkWebView` 完全兼容的只读视图、单 Goal HTML fragment、按需 records fragment、后续事件页和可缓存静态资源。
- 依赖：`SqliteMolisWorkStore.snapshot/eventCursor`、Coordinator canonical 状态派生、现有 Web renderer。

## 文件与模块边界

- `src/v1/coordinator.ts`：批量工作状态与只读策略入口；状态规则仍只有一套。
- `src/web/server.ts`：事件游标缓存键、单快照 Web View 组装、静态资源与 records fragment 路由。
- `src/web/render.ts`：浏览器历史一致性、记录分页、请求取消和静态工作台资源；原有记录与事件 renderer 保持唯一。
- `tests/v1.test.ts`：批量与单 Goal 工作状态一致性。
- `tests/web.test.ts`：缓存无数据变化时保持命中，事件变化后失效；Web 输出不回归。

## 验收标准

1. 同一 Board 无新事件时，重复页面请求和 Goal 文档请求不重建 Web View；SQLite 文件生命周期不参与缓存判断。
2. Board 通过正式写入路径追加事件后，下一次读取会重建并展示新事实。
3. 批量工作状态与逐 Goal 查询对所有状态字段保持一致。
4. Web View 不再逐 Goal 调用 `store.snapshot` 或 `explainGoal`。
5. 普通 Goal 页面和 `/document` fragment 不包含完整记录账本；打开记录 Tab 后能看到最近事件，并可连续加载直到原有完整内容全部可见。
6. 从两个 Goal 连续后退到项目根路径时，URL、Tree 选中项和正文恢复到根历史项的初始 Goal；前进同样一致。
7. Footballnia 的 `buildMolisWorkWebView` 保持 2 秒以内；连续 Goal 文档请求在本机达到接近即时响应，普通正文体积明显下降。
8. 工作台 HTML 不再内联共享 CSS 和主客户端脚本；首次请求返回 200 与 ETag，带匹配 `If-None-Match` 的重复请求返回 304。
9. 快速连续选择两个 Goal 时，前一个正文请求被取消，最终 URL、Tree 和正文只指向后一个 Goal；切走记录页时旧记录请求也不产生错误提示。
10. `pnpm typecheck`、定向 V1/Web 测试、完整测试和真实浏览器回归通过。

## 验证命令

- `pnpm typecheck`
- `node --import tsx --test tests/v1.test.ts tests/web.test.ts`
- `pnpm test`
- 用 Footballnia 数据库重复测量 `buildMolisWorkWebView`、项目页面 TTFB 和连续 Goal fragment TTFB。

## 假设与风险

- 规范写入必须追加 Board 事件；没有事件的裸 SQL 更新不会触发 Web 缓存失效，也不属于受支持的产品写入路径。
- 批量派生仍可能对部分可执行 Goal 做规则查询；本次先移除重复快照和重复完整解释，不扩张为 Coordinator 全量查询架构重写。
- 记录分页仍从已缓存的 Board Web View 切片，不在本次重写为数据库游标查询；目标是先减少传输和 DOM 成本，同时保持一种事实读取路径。
- 静态资源仍需一次轻量条件请求；本地产品不引入 Service Worker 或长期离线缓存。
- 真实大项目性能用于人工验收，不把机器相关的绝对耗时写成不稳定测试。

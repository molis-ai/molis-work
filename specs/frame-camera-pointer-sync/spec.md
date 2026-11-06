# Frame 相机同步保留真实交互

状态：执行中（2026-11-05）。需求维护与集成：02 批 Codex；本片实现：D 轨 Codex 写手。目标为现有功能修复；工程与真实浏览器路径分别核实，不代表用户本人验收。

本片属于工作台可靠性修复，来自[认领板报障](https://github.com/molis-ai/molis-work/issues/1743#issuecomment-6669495031)及[成果正文对照](https://github.com/molis-ai/molis-work/pull/1790#issuecomment-6669630185)，解锁 02 的存储分支最终回归。跨窗口只改变 camera 时，现行 storage → drawFrame → replaceChildren 会销毁按下的 Feed 节点，吞掉可信 click；还会销毁已完成的成果正文并重新读 owner。

保留现行点击、拖放、位置和存储合同。入站块数据及展开状态相同，仅应用相机；块或展开状态改变则沿原重绘路径更新。不以计时、合成点击、提高时限、忽略同步或读取兼容绕过。首次加载仍须等待真实响应，删除或相同块号换身份不得沿用旧手势；真正换成果版本不得保留旧正文。本片不改 SQLite、SDK、插件或旧 PR。

允许修改 `apps/workbench/src/scripts/client/frame-container.ts`、`tests/workbench-frame-container.e2e.test.ts` 及本 spec、索引和必要包 README。共享合同、全局门禁和预算由原主人负责，不新增状态存储或依赖。基线为 main `3a6b292efbc96241978eabed4951e5f8903ecc9c`。

## 开工前检查

| 项 | 本片结论 |
| --- | --- |
| 1 事实主人 | Frame 的现有 localStorage 归工作台，正文仍归 Feed/Inbox/Artifacts owner，无新事实主人。 |
| 2 插件同等待遇 | 不涉及装配或 SDK；保留现有公共内容入口。 |
| 3 能力注册 | 不涉及新动作、身份输入或调度。 |
| 4 合同 | 存储形状、公开 API、动作和事件不变，无合同 PR。 |
| 5 包与依赖 | 只修工作台现有客户端，无新包和依赖。 |
| 6 表与存储 | 不涉及 SQL 或表结构；接收原格式的窗口存储同步。 |
| 7 兼容与迁移 | 不新增兼容读取或迁移。 |
| 8 安全边界 | 不改令牌、授权、路径或 IPC；旧节点失效仍丢弃旧手势。 |
| 9 调用次数 | 有效点击仍读原 owner 一次，相机与冗余同步不重复读取正文，无后台轮询。 |
| 10 升级与数据 | 引用、位置、相机、展开状态均沿用当前格式，无升级步骤。 |
| 11 成果与过程项 | 只读已声明的成果版本，不改产生或归档流程。 |
| 12 页面与外壳 | 不改页面、样式、DOM 事件或视觉方向；同一现有脚本实测增 169 B，其余资源不变，增长交独立评审，无预算或门禁修改。 |
| 13 错误 | 沿原错误路径，无新错误码或 Error 类。 |
| 14 冲突面 | 已核认领板、在途 PR 和全部工作树的当前文件改动；D 独立认领，仅原 Frame 客户端与对应 e2e，未改 02 存储树。 |

无红线项；不涉及真实 Home、凭据、发版或新交互定样。只恢复现有点击和已加载状态。

## 验收

- FCS-01：真实 Feed 拖入后，可信按下 → 另一同源窗口实际保存 camera.x+1 → 可信 storage → 释放；原节点保持连接、块引用不变，一次 click 展开并读取原 owner。
- FCS-02：已展开且加载完成的成果，camera 或冗余布局同步后保留正文节点和 loaded 状态，不发第二次正文 GET。首次响应未到仍是加载中；真正换版本更新正文。
- FCS-03：按下后删除块、或同块号换为另一身份，释放均不展开、不读取替换对象。真实跨窗口同步不被忽略。
- FCS-04：原 RAC-2516/RAC-2518 可信拖放与位置/引用持久化、原 Frame 项目隔离和内容读取路径继续通过。

先整体 `pnpm build`，所有本机定向测试使用 `node scripts/machine-slot.mjs run browser --label "D Frame sync tests" -- node scripts/run-tests.mjs --jobs 1 <文件…>`，只用独立测试浏览器与临时 Home。必验本 e2e、`tests/client-script-undeclared.test.ts` 及包 README 要求；边界、health --base origin/main、页面资源和 secrets 同步核实。不在本机跑 Full；最终 CI/Full 与实际 main 采用交 02 分开结算。

旧红→修绿、拒绝对照与定向结果待回填；当前无关键开放决定。

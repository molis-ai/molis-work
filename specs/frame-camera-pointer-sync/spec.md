# Frame 相机同步保留真实交互

状态：代码与定向回归完成，待当前头 CI 和主线集成（2026-11-05）。需求维护与集成：02 批 Codex；本片实现：D 轨 Codex 写手。目标为现有功能修复；工程与真实浏览器路径分别核实，不代表用户本人验收。

本片属于工作台可靠性修复，来自[认领板报障](https://github.com/molis-ai/molis-work/issues/1743#issuecomment-6669495031)及[成果正文对照](https://github.com/molis-ai/molis-work/pull/1790#issuecomment-6669630185)，解锁 02 的存储分支最终回归。跨窗口只改变 camera 时，现行 storage → drawFrame → replaceChildren 会销毁按下的 Feed 节点，吞掉可信 click；还会销毁已完成的成果正文并重新读 owner。

保留现行点击、拖放、位置和存储合同。入站块数据及展开状态相同，仅应用相机；块或展开状态改变则沿原重绘路径更新。不以计时、合成点击、提高时限、忽略同步或读取兼容绕过。首次加载仍须等待真实响应，删除或相同块号换身份不得沿用旧手势；真正换成果版本不得保留旧正文。本片不改 SQLite、SDK、插件或旧 PR。

允许修改 `apps/workbench/src/scripts/client/frame-container.ts`、`tests/workbench-frame-container.e2e.test.ts` 及本 spec、索引和必要包 README。按[已认可的小幅必要增长](https://github.com/molis-ai/molis-work/pull/1859#issuecomment-6677369941)，同片串行维护 `scripts/gates/page-assets.mjs` 的该资源一次性精确额度及 `tooling/gates/page-assets.json`，不改通用门禁。无新增合同、状态存储或依赖。原始基线为 main `3a6b292efb`，资源收口前融合 main `2e97305223`。

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
| 12 页面与外壳 | 不改页面、样式、DOM 事件或视觉方向；同一现有脚本必要增 169 B 已独立评审认可。按现行小幅增长规则精确登记单项额度和预算；其余资源额度和通用门禁不动。 |
| 13 错误 | 沿原错误路径，无新错误码或 Error 类。 |
| 14 冲突面 | 已核认领板、在途 PR 和全部工作树的当前文件改动；D 独立认领，仅原 Frame 客户端与对应 e2e，未改 02 存储树。 |

无红线项；不涉及真实 Home、凭据、发版或新交互定样。只恢复现有点击和已加载状态。

## 验收

- FCS-01：真实 Feed 拖入后，可信按下 → 另一同源窗口实际保存 camera.x+1 → 可信 storage → 释放；原节点保持连接、块引用不变，一次 click 展开并读取原 owner。
- FCS-02：已展开且加载完成的成果，camera 或冗余布局同步后保留正文节点和 loaded 状态，不发第二次正文 GET。首次响应未到仍是加载中；真正换版本更新正文。
- FCS-03：按下后删除块、或同块号换为另一身份，释放均不展开、不读取替换对象。真实跨窗口同步不被忽略。
- FCS-04：原 RAC-2516/RAC-2518 可信拖放与位置/引用持久化、原 Frame 项目隔离和内容读取路径继续通过。

先整体 `pnpm build`，所有本机定向测试使用 `node scripts/machine-slot.mjs run browser --label "D Frame sync tests" -- node scripts/run-tests.mjs --jobs 1 <文件…>`，只用独立测试浏览器与临时 Home。必验本 e2e、`tests/client-script-undeclared.test.ts` 及包 README 要求；边界、health --base origin/main、页面资源和 secrets 同步核实。不在本机跑 Full；最终 CI/Full 与实际 main 采用交 02 分开结算。

## 验证记录

同一份新测试实际消费整体构建保留的旧 Frame 模块，Host 下发资源为 1,075,120 B，恰在 FCS-01 的按下节点保持和 FCS-02 的完成正文保持两处断言失败。恢复修复构建后资源为 1,075,289 B，原 Frame 文件 3/3 通过，包含 FCS-01～04 的可信输入、真实跨窗口同步、删除/换身份拒绝、真实版本 1→2 及原拖放/持久化。首次成果响应由真实 HTTP barrier 持有，不伪造已加载状态。

首批 20 个文件为 19/20 通过（161/162 例）；唯一失败是 `workbench-tab-workspace.e2e.test.ts` 的 Chrome 退出清理超时，业务断言没有报错，首败保留。只续验该文件后 2/2 通过、0 skip，没有重跑其余 19 绿文件或放宽清理时限。包 README 的 18 份必跑文件均通过。原失败临时目录和对应 Chrome 已无遗留。

整体构建、包边界、健康门禁、导入图及推送前密钥扫描已通过。[原 CI 资源预算首败](https://github.com/molis-ai/molis-work/actions/runs/42163070661/job/127713083627)实际构建的融合提交为 `26a9594771`，与本地融合 main `2e97305223` 的提交 `4a34cf0eb1` 文件树完全相同；其真实实测为 1,077,514 → 1,077,683 B（+169）。据此精确登记单项额度和预算，未借旧账号宽额度；这次 CI 仍是失败，新头 CI 与实际 main 采用单独核回。重复本机构建尚在槽内排队，核准上述同树证据后仅取消本次排队，未打断别人的构建。

[独立评审](https://github.com/molis-ai/molis-work/pull/1859#issuecomment-6677369941)认可运行逻辑和必要增长；两行注释移出曾实测无体积收益，已撤回，没有通过改名、压代码或新抽象回收字节。Full 由 02 按最终组合安排，本机未运行。

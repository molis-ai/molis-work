# 2026-11-08 中优先级 A 类修复

状态：A54 已实施，2026-11-10 按用户授权补齐 PR tasklist 和 CI 后合并；前置 #2003 已经正常队列合入 main（85cec224），产品 #2004 base 已调整为 main 并集成 #2000。首轮 CI/Full 有失败，正在修复与重新验证，整批未关闭；未发布、未操作真实 Home。

## 范围与决定

逐编号问题、报告建议与归位评估见[日评记录](../../docs/reviews/daily-quality/2026-11-08-medium.md)。B/C 未决项不在本批。验收编号沿用报告 D 编号，测试名或注释标出对应编号；共用机制覆盖同根因路径，各编号分别保留验收对应。

用户已批准每位成员最多 8 条 SSE；批准 Feed 通用 Manifest 演示动作、Runtime 全部启动后由 Feed 初始化及 RSS 路由归 RSS integration；批准 server 公共组合端口与 `molis-work server …` 启动入口。证据与重大调整理由见[补充方案](../../docs/reviews/daily-quality/2026-11-08-medium-supplement.md)。用户另批准[最终页面资源变化及一次性放行](../../docs/reviews/daily-quality/2026-11-08-medium-resources.md)，不调整预算或门禁阈值。

## 实施与验收对应

下表的“通过”只指所列本地证据；未执行的云端/系统端原场景如实保留，不据源码或单入口通过声称整批关闭。

| 编号 | 统一落点与完整影响面 | 本地证据及剩余验证 |
| --- | --- | --- |
| D0056、D0294 | SDK 共用事务错误保全；storage 事务/savepoint/升级，Host、Runtime、连接器、Characters 与同步回滚路径接入；保留原抛出对象及清理诊断 | sqlite-driver-conformance 27/27，含失败回滚、冻结对象/原始值；upgrade-chain 59/59、upgrade-snapshot 74/74、安全快照 65/65、Home upgrade 87/87 及其拒绝 26/26，其他存储 owner 必跑通过 |
| D0152 | agent-host 静默等待结构化终态，观察失败与清理定时/订阅 | agent-run-wait 2/2 |
| D0337、D0007 | 助理列表请求代次隔离 A→B→A；完整浏览器响应合同夹具经 TypeScript 编译验证 | assistant-island-script 11/11，覆盖旧列表晚到与完整类型夹具 |
| D0009 | token 用量只取最新轮，当前轮无用量时不冒用历史数字 | 同一 assistant-island-script 11/11，包含空/执行中/失败/历史轮 |
| D0330、D0117 | Feed owner 墓碑不重新注册；历史删除含信号、修订、事件，并随事务回滚 | feed-sources 12/12；feed-runtime-plugin 原 2 个失败修正后保持原断言通过；feed-local-history-delete 与 Feed owner 套件通过 |
| D0350 | 同步页 dirty 时拒绝立即同步，不自动保存 | personal-sync.e2e 8/8 |
| D0124、D0335 | 插件帧共同入口拒绝隐藏/脱离 DOM 帧，验证参数；刷新每帧一次且父页 5 秒冷却跨 reload 保留 | security-invariants-plugin-pages.e2e 9/9，含真实重载洪泛及参数/隐藏帧拒绝 |
| D0050 | PRODUCT 对齐当前成熟度与已批准 BL-377 重做范围 | 文档与现行登记交叉核对；不以本批替代重做 |
| D0057、D0273 | 删除 desktop 退役 DDL；catalog 2→3 owner 升级只删空退役表，非空拒绝且事务保全 | catalog-path-derivation 7/7；旧版真实构建生成 v2 金样；golden replay 两版本各 426 reads/56 writes 成功；真实 Home 未升级 |
| D0021、D0025 | 媒体拖动取消不吞下一次真实点击/键盘；滚动条 cancel/lostcapture/blur 统一释放 | media-zoom-board.e2e 2/2；scroll-follow-cancel.e2e 1/1 |
| D0029、D0037 | 标签 DND 忽略拖中 pointermove、嵌套 enter/leave 计数、结束统一清理；分栏吸附后 clamp | plugin-tab-groups.e2e 5/5，实指针与排序槽；tab-workspace-view 8/8 |
| D0303、D0066、D0268 | Coding 44px 触摸目标、Pages 图片键盘焦点、窄屏焦点样式 | coding-workbench.e2e 2/2、shelf-plugin.e2e 1/1；touch-targets.e2e 4/4、geometry-boundaries.e2e 1/1；共享视觉矩阵通过项及基准失败见下 |
| D0013 | Goals 取消状态从事实 owner 到公开输出/排序/标记、看板/筛选与胶囊独立终态分组，保留显式继续但不归可立即推进，更新快照 | goals-status-ui 3/3，桌面/手机看板与筛选 3/3；胶囊原 SYS-09 补验发现仍落空闲，已补独立取消态和选择顺序（保留原断言），最终联动 tests20 为 6/6 文件全通过，胶囊 11/11、胶囊轮询 8/8、集合渲染 4/4；公开动作 4/4 与集合翻译 6/6 |
| D0104、D0207、D0198 | MCP 连接元数据与 origin 原子提交；保留 OAuth 上下文缺声明拒绝；跨平台声明测试列入 CI 产品子集 | connector-connections 9/9（含注入提交失败且无通知），connector-api-oauth 27/27、oauth-declarations 30/30 |
| D0292 | 组件板显式开发模式，生产 404；皮肤预览不持久化 | board-appearance.e2e 3/3，生产路由快照与开发 fixture 同步 |
| D0151、D0304、D0308 | 监督器 starting 单独投影；Home 安装库失败保留错误并提供稳定码，导航/舞台不把故障当空集合；故障页单 alert、保留原文件 | home-plugin-unavailable 2/2（损坏文件与英文单 alert、不暴露原始原因）；Runtime supervisor 集成及状态投影用例通过；全部状态组合留 CI Full |
| D0222、D0349 | 下一步只选 enabled 且可用目标，复用现行孤儿/重授投影 | coding-next-steps 6/6、agent-next-steps 通过 |
| D0267 | 终端刷新失败保留内容、展示本次错误；过时错误不落地 | work-terminal-client 6/6 |
| D0295 | 桌面安装更新失败时，前后两次认证健康才复用既有 Host；不启动第二 Host | desktop Rust 严格 clippy 与 97 测试通过，含失败/恢复分支；实际桌面更新现场未操作 |
| D0030、D0019、D0032 | 知识索引元数据 SQL 分页、正文按精确 revision 懒读与授权围栏；稀有尾词/滑窗；FTS 假阳性继续翻页 | knowledge-cards 22/22、knowledge-agentic-search 11/11、knowledge-service 15/15、knowledge-locate-budget 5/5 及权限拒绝测试通过 |
| D0234 | 卡片 owner subject/状态过滤与 SQL 分页；HTTP next_offset，侧栏接完全部页，失败不抹原内容 | knowledge-http、知识卡精确筛选及侧栏相关回归通过 |
| D0195 | Feed 当页最多 200，再只取当页材料与一批情境账关联键；跨包只用公开合同 | Feed runtime 原场景、405 条跨页与末页材料断言通过；S-68 命名空间 30/30；情境账/材料消费者回归通过 |
| D0253 | private-work-context 绑定及事件稳定分页；通过账本 owner 解析可信项目对象后 SQL 筛选，管理列表也分页 | runtime-binding-ledger 2/2：407 记录、双项目、事件分页及移动历史；路由/错误/入口回归通过 |
| D0264 | 成果 owner 将类型/schema/scope/lifecycle/availability/私有 actor 下推 SQL；消费者按页读取，精确 metadata 批量碰撞保持成果优先且不 N+1 读正文；完整维护集合显式接完页 | artifacts-module 5/5，真实 611 成果+207 过程项消费者，后页/私有/不匹配/重复隔离、零逐候选正文读；artifacts-actions、personal-artifact-owner、process sync/知识消费者及声明拒绝回归通过。完整集合接口仍返回完整集合，不声称其内存恒定 |
| D0246、D0247 | 安装 owner 返回全文/截断/总码点；设置页原生 details 展开完整签名正文，textContent 消费；平台无关旧版/尾部差异拒绝移出 macOS skip | security-invariants-plugin-install 26/26（含 emoji、尾部变化与旧预览拒绝）；真实前端 D0246/D0247 展开用例通过：原文完整、惰性 textContent、不触发确认安装 |
| D0329、D0077、D0333 | IM 复用共享按钮/toast/搜索焦点；自有词典汇入全站 EN；Host 传语言，日期用当前语言；构建压缩 JS | IM controller、browser-state、domain、local-project、follow-copy.e2e 通过；英文 HTML 无残留中文、JS 解析通过；i18n 13/13 与共享组件单元检查通过，翻译门禁无缺失/未服务词典。JS -22,074 bytes、CSS +8,536 bytes，已获批准 |
| D0103 | SDK 唯一惰性 HTML 白名单边界与服务端共享词汇；Coding 全量/流式/子 Agent、Files、Git、Shelf 全接入 | content-html.e2e 1/1：恶意 DOM/网络拒绝、合法 Diff 控件；Coding 2/2、Shelf 1/1、SDK/富文本/patch 合同套件通过 |
| D0338 | Shelf 所有 save 入口都带 observed 内容条件；ownerFiles 回调同步提交，无 await 穿透事务 | shelf-owner-files 7/7，双实例 12 次 admit、过期写入冲突；process sync 与 owner 测试通过 |
| D0225 | Host 临时草稿绑定 actor/project/purpose，10 分钟/100 份/一次消费；现有动作目录唯一登记，URL 只传 opaque ref | 草稿权限/取消/TTL/重复/容量拒绝；memory-settings-cas.e2e 19/19，真实两页面提升交接、URL 消耗前移除、填入而不自动保存 |
| D0017 | server 解码边界将非法 URI 归输入拒绝 400；未知异常仅返回不透明正文、request id 与稳定码，诊断不记录路径/正文/凭据 | cross-device-http 2/2：坏路径 400、未知异常 request id 与纯码诊断关联、原始正文/路径不暴露；预期访问拒绝仍为 403 |
| D0027 | Goals 公开批量状态读取，continuity 合并去重后一次调用；SSE 统一按可信成员 8 条并在 close/error/abort/失权释放 | cross-device-http 通过：第九条 429、成员隔离、释放重开；gateway 2/2、continuity 通过，批量合同拒绝/调用次数断言通过 |
| D0041、D0078 | Feed 自有演示种子与幂等 receipt；Manifest 通用 demo_seed 动作登记、全部 Runtime 启动后调用；纯 SEL/RSS 路由归 RSS integration，Host 只作公开组合 | demo-plugin-sample 5/5：新建/重启/reset、自定义项目、删除/停用不复活；rss-socket 4/4；Feed 套件及生成登记检查通过；Host 不保留 Feed 实现 import |
| D0272、D0280 | apps/server 仅公开组合端口；Host 持授权/gateway/恢复适配器；产品 CLI 组合并保留服务生命周期；边界按实际 import 点计数 | server-cli 13/13、cross-device-launcher 3/3、gateway 2/2、版本入口 10/10；边界新 import 点负例 2/2；本机恢复仍属私有维护，S-81 拒绝保持 |

## 构建、门禁与执行证据

- 最终整体构建 build39 通过（取消态联动补齐后），随后最终串行包边界 boundary5 通过（65 包、无错误），真实隔离基准页面资源检查通过（51 资源，build39 后再测字节与通过门禁时完全一致、无 discovery miss），全部增长在用户批准额度内。
- 最新四文件定向批 tests11 全通过（标签拖动、记忆交接、Home 降级、实际成果消费者）；SDK/Feed 等 35 文件批 tests10 全通过。每批隔离 Home、公共机器槽、jobs1，未运行本机 Full。
- `golden-replay2` 两个金样均成功：0.1.0-dev.1 与 0.1.0，各 426 reads / 56 writes，第三方与 Home 库 replay 完成。dev.1 金样来自旧代码真实生成，未改断言或填假数据。生成 SQL/PDF 的原字节空白保留，不能以手工修整破坏哈希。
- desktop Rust `clippy --all-targets --locked --offline -- -D warnings` 与 97 测试通过。整组 native 检查的两个未改 Wasm crate 因本机缺 wasm32-unknown-unknown target 未通过，不能报整组通过；CI 应补此环境验证。
- 最终健康基准检查 health10 通过，API 快照已更新；动作快照核对未变且 25/25 用例通过。翻译无缺失英文、无未服务词典；精确资源放行已获用户批准并实测通过。
- 故障定位中曾出现构建与自带构建的边界检查重叠，声明产物缺失；该次无效。后续严格串行。测试夹具错误已修正并用原断言复跑，不删断言、不放宽门禁。

- 共享界面 tests12 为 14/16 文件通过；visual-mechanisms 的媒体缩放、折叠动画、分段拇指三条断言在独立干净固定基准也同样失败（baseline-tests1 同名 3 失败），不放宽断言。另一个 floating 子路径无 import 的失败由本批新增导出造成，已把 SDK 浏览器清理与共用只读词汇移回 leaf 入口，design-system-floating 6/6 与内容 HTML 安全浏览器 1/1 复跑通过。
- 存储批 tests13 为 29/30 文件通过；system-search 三条旧 documents() 调用随新分页/懒读合同迁移后，全文件 tests16 为 30/30，通过同样正文权限与来源撤销断言。没有删除断言来掩盖产品错误。
- 安装审阅首次新增 fixture 把无关 API 也拦进插件响应导致失败，收窄协议 fixture 后 tests15 原场景通过；最终完整文件 tests17 为 20/20；同批 SDK 子路径/出口、惰性 HTML 安全与各内容渲染等 9 文件全部通过。

- 未提交新增行的密钥规则扫描通过。两条命中是 dev.1 金样的密封模型测试值：以 manifest 明示的 golden-only test_key 解密后，逐字匹配 tests/golden-writes/model-settings.ts 的合成固定输入；仅把这两条确切密文及来源理由加到现有测试数据清单，没有加宽正则，也没有改金样字节。此扫描不是逐提交扫描；若获准推送，仍须 fetch main 并在提交后运行正式 secrets:check。

- 初轮视觉比较完整采集基准/分支各 66 图、22 样式快照；差异检查发现取消态漏入看板分组/状态筛选，已补公共清单。胶囊原用例补验又发现取消项落空闲，已补独立取消分组及中性终态样式，保留显式继续并优先真正可推进项。旧头截图不作为最终验收；修正后的最终联动验证 tests20 为 6/6 文件通过；build39 最终头重新采集 66 图、22 样式快照，所有截图的帧内稳定性测试通过。与固定基准比较仍按零容差报告 8/66 图及 22/22 样式有差异，未调阈值：四张列表差异各 83/84 像素位于取消态标记；首页/Todo 其余差异每张 7～38 像素、位于控件边缘。所有共有 DOM 样式变化只涉及状态环 path/opacity，新旧独有节点来自取消卡片移到独立看板组以及新分组/筛选项，已用桌面/手机原场景验证不丢项；无其它共有节点样式或布局变化。视觉工具因存在差异退出 1，不记成全绿。最终报告在忽略目录 .impeccable/qa/review/visual/compare-final/report.html。

## 合同与交付限制

当前阶段一，无旧形状读取兼容。胶囊输出新增 cancelled 状态与独立 tab；桌面壳保留显式继续入口并用中性终态样式，不自动恢复取消项。新增 demo_seed 引用与动作、Goals 批量动作/取消状态、临时草稿动作、公开查询分页/过滤、SDK HTML/回滚工具的调用方同片更新，API 与动作快照包含在本批改动中。固定引用的 Goals 输出新增合法取消取值；批量/草稿/演示动作是新增身份，不代替既有单条动作。MCP 现有工具名不改，新增动作仅按既有动作发现规则投影；Feed 演示动作仅 workflow，不向 MCP/页面开放。存储仅目录 owner 2→3 显式升级，版本表与连续升级登记同步。

2026-11-10 用户明确要求「提交下pr吧」，已授权本批提交、推送和创建 PR，并启动所需 CI Full；不包括合并、发布或真实 Home 操作。原固定基准验证保留，提交前对齐最新 main 并复验受影响部分。最终共享核心 CI Full 尚缺，因此整批不标“已关闭”。真实 Home 和实际桌面更新现场均未操作。


## 2026-11-10 PR 整合

门禁逻辑按仓库要求独立为 PR #2003，产品 PR 以其分支为前置。已整合 main 02d2443f 的六个提交；五处冲突逐项处理，保留统一输入框、草稿 revision、按钮展开/按下态和双方测试密文记录。D0268 的旧栏位样式由 main 的公共 composer 接替，沿公共组件的接收者标签及输入焦点场景复验，不恢复退役的私有栏位样式。

整合后的 build40 与包边界通过；health11 对最新 main 通过；API/动作快照核对无额外变化。14 文件定向批 tests21 全通过。初次最新 main 资源复测的工作台 JS 比批准上限多 19 bytes；保留全部校验，改用一次对象合并投影本地草稿及 revision，消除重复 Map 检查，并增加草稿/revision 同时保全断言。共享按钮的 main 修复也保留，IM 只清理共享 CSS 的行首空格，避免增大批准额度。最终 build42 后复验资源与相关用例，再提交产品 PR。


最终整合验证：门禁 PR #2003 的 CI/Verify 已通过（run 42656612723）。工作台最终真实资源增量为 1,273 bytes，低于既有 1,275；IM CSS 为 28,999 bytes，低于批准额度。草稿/revision 保全的新增断言通过；tests23 的助理与 IM 单元文件 5/5 通过，但 IM follow-copy 浏览器用例在 60px wheel 场景读到 gap=0 而失败。相同文件在当前 main 等价运行时的基线对照因公共浏览器三槽均被其他批次占用尚未执行；取消我方排队，避免留下无人跟进的任务。不把该失败定性为上游或新回归，也不删断言；产品 PR 保持 Draft，交 CI Full 补验证。


产品 PR 提交前最终检查：build43 通过；health12 对当前 main 通过；完整隔离基准资源门禁 assets6 通过（52 assets，无本 PR 新资源，既有许可不变）。已批准原基准验证与整合验证分开保留。最终头包含所有源代码，后续只回填 PR/CI 元数据；IM wheel 用例待 CI 和后续基线核验，不能据此把 A54 整批关闭。


## PR 交付

2026-11-10：独立门禁 [PR #2003](https://github.com/molis-ai/molis-work/pull/2003)，提交 dd27ea5ff，CI/Verify 全绿；产品 [Draft PR #2004](https://github.com/molis-ai/molis-work/pull/2004)，base 为门禁分支，产品实现提交 b215763d6。此后的本次提交只回填交付元数据，源代码与 build43 / health12 / assets6 一致。父 PR 合入 main 后应调整产品 PR base 并在最终头复核，不把产品合入门禁分支。CI 与 Full 显式在产品最终 head 启动，运行链接及最新结论维护在 PR 描述；未合并、未发布或操作真实 Home。


## 2026-11-10 合并授权与首轮 CI 闭环

用户要求“确保 pr tasklist 都通过，并且 ci 都通过的情况下，就合并进去吧”，授权条件满足后按正常合并队列合入。前置 #2003 已在 CI/Verify 通过后入队并合入 main（85cec224793d625be437ee07673fe41caa5fa1d9）；产品 #2004 已改 base 为 main，集成新合入 #2000 的公共合同、内容包与成员版本控制。

首轮 [CI 42661845734](https://github.com/molis-ai/molis-work/actions/runs/42661845734) 与 [Full 42661845524](https://github.com/molis-ai/molis-work/actions/runs/42661845524) 失败。Full 首个失败后取消其他分片，不能当作完整覆盖。已修正：

- D0007/D0337：新版 composer 已移除 activeSend，列表刷新仍引用它，导致错误被静默捕获；删除失效引用，保留当前草稿与 revision 成对覆盖，实际脚本测试也移除伪造变量，整份程序的未声明变量断言保留。
- D0041/D0078：Web 启动 Runtime 的端口使用会再次准备项目的客户端，演示初始化经动作服务回入同一启动 Promise，形成自我等待。统一 Web 项目端口使用现有 preparePlugins=false 的动作入口，仍保留 Home 准备、动作调度、权限及最终授权检查；所有项目插件共用该入口。演示项目设置删除真实终端场景已恢复，整文件 20/20；Goals 刷新浏览器文件 8/8，均无放宽超时或删除断言。
- D0057/D0273：目录 2→3 的实际库版本与升级链同步更新 stores.tsv；schema 快照测试 4/4。
- D0264：兼容性改为当页已读元数据上的纯判断，故障注入从已不调用的逐候选 compatibility 查询移到实际存在的 exact collision metadata 读取；保留两个 owner 的分页读取失败传播、碰撞/拒绝及后页验收，文件 9/9。
- D0292：生产环境组件板按批准返回 404；CSP 扫描继续覆盖该拒绝，并新增实际生产 capsule HTML 页面，保留至少两页及全部 SAMEORIGIN/frame-ancestors 断言，文件 17/17。
- Coding 工作区拒绝夹具补齐现行 catalog 的 listProjects，只返回空项目清单，仍拒绝权限/不可用/未装配服务；action-read-compatibility 6/6。
- Workflows 委托权限测试改从 Feed 真正的 workflow_content 动作取权限；新增 workflow 专用 demo_seed 不是工作流内容站。Workflows 自身精确权限与逐项缺少必需权限的拒绝断言全部保留。

main 整合头整体 build45、boundary45、health13（对照 main 85cec224）通过；API 重新生成无额外变化。剩余浏览器、最终资源、最终头 secrets、CI/Full 和评审状态按 PR tasklist 逐项补验；未成功前保持 Draft、不入队。

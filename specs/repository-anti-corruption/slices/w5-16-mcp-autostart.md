# W5-16 C5：MCP 按需启动常驻宿主

状态：七个产品子路径已具分组有效证据，fresh-main 构建、必要新基底回归及余两项实装通过，有限独立 TEST 原件核收已齐；待整片 FIRST 与 S-77 公共行，health 仍有该引用失败（2026-10-25，洛杉矶）。负责人：Codex 实现 1。BL-645，验收 RAC-625～629；目标完成程度为隔离 Home 中功能可用，不把分组证据叫作一轮全八项通过，也不代表整个 W5-16/C1/C3 完成、C5 已进入 main、真实 App 或本人验收通过。

统筹已在 [6394070792](https://github.com/molis-ai/molis-work/pull/1254#issuecomment-6394070792) 审定本稿：选 A 常驻；唯一 Home owner 允许短暂被拒的启动候选；20 秒总预算、1 秒探测、250 毫秒退避；EOF/cancellation 必须接通。初期按 Root 授权以 batch-36 `bb7137fc2550d8ae8fd7f8bb6caced55ee7cba9f` 为固定基底实施、只推自己的分支；#1254 的 A 实现现已随 #1270 在 11:14:03 UTC 实际进入 main `64a3ccc9c177ba6f3a2bbb44cf80dc1cce648f2a`，已鲜取并核对。整片完成后才交一个完整非 Draft PR。FIX4/FIX7/原 owner 关闭的生命周期 hunk 不在本片改写；S-77 正式共同行由 carrier 唯一登记，本片只交暂定引用、确切语义及拒绝测试。

## 目标、依据与边界

已安装的 stdio MCP 需要常驻服务而它尚未启动时，启动同一个 Home 的既有 Web 宿主，等它就绪再转发，使用户不必先手动打开 App。MCP 进程始终只是转发者，不取得 Home 的存储所有权、不打开业务 Catalog、数据库或模型运行时。

依据是 [协调工单 dd557d8298 的 C5](https://github.com/molis-ai/molis-work/blob/dd557d8298dd4f2f760ec133bf1468a0089f713c/coordination/2026-10-14/CODEX-TASKS.md) 和 [#1254 的用户选择转述与统筹裁定](https://github.com/molis-ai/molis-work/pull/1254#issuecomment-6393455820)：先合入缺少宿主时拒绝的 A 片，再做自动启动；退出策略先交原 Claude 统筹审。本稿基于 main `df5527f278fa8e631919794d15c52cfd3f364155`，只读核对 PIPE 指定的 batch-36 候选 `352c64e0cdd0cc5a85d0cf7d4063196cdfa2ff65`（含 A 的组合树，不是已合入 main）。早先直接读取的 `3f855ce67` 与该候选在本稿涉及的启动、转发、owner、健康检查文件上无差异。

不安装、升级 Runtime 或 LaunchAgent，不改登录启动偏好；不新增监听口、随机备用端口、MCP 工具、权限或本地写回退。Home、地址与启动入口来自现有受信配置，不接受工具参数指定命令、Home、actor 或项目。旧 C4 OAuth、PG-095、C1/C3 不并入本片。A 片初始化清理、关闭重试与文档修复仍由原 owner 处理，本片不抢写其生命周期。

## 已核实的现有路径

| 现有能力 | 归属与事实 |
| --- | --- |
| 生产 stdio | `apps/desktop/launchers/mcp/server.ts` 创建指向 `runtimeHost.webBaseUrl` 或 4173 的 `MolisWorkServer`；`apps/mcp/src/stdio.ts` 读写 JSON-RPC。嵌入式 MCP 显式注入本地 Host 的路径不变。 |
| Runtime 身份 | `runtime-context.ts` 从原环境与协议元数据形成上下文；没有明确 Home/有效身份时沿用原拒绝，不猜一个项目或新建 Home。 |
| 转发与不确定结果 | `resident-host-request.ts` 唯一验证数字回环 HTTP origin 并附原 Home 控制令牌、Origin 和一次性键。缺令牌/连接拒绝与已送出后断连分开；后者是 `actions.delivery_unknown`，不能重发。 |
| 就绪与实例 | Web 的 `/health?challenge=…` 已用 `web-control-token.ts` 的 `sendWebHealth` 对随机 challenge 和原始响应字节签 HMAC；Tauri 的 `web_identity.rs` 已验证该规则。`mcp-context-client.ts` 再以原 `describe` 固定 `instance_id`，业务请求受 Home、实例、身份、调用号和取消检查。 |
| 启动入口 | 安装器 `home-launcher.ts` 生成 `<Home>/bin/molis-work-web`，执行安装中当前 release 的 `dist/web/server.js`；Web 启动器已有 `--home`、`--port`，只监听 127.0.0.1。MCP 不另抄 Host 装配。 |
| 单 Home owner | `home-storage-lifetime.ts` 在业务资源打开前取得 storage 的同一 SQLite EXCLUSIVE owner，SDK 只借 opaque capability；忙、同进程第二 Host、伪造 proof 都拒绝，资源未完全关闭不释放。 |
| App 复用 | Tauri `web_service.rs` 已复用身份验证通过的宿主；退出时只终止 `owned_child`，不会接管外部 PID。MCP 启动的进程不会自动成为 App 的子进程。 |
| 不可直接套用的服务操作 | LaunchAgent 的 `start` 遇到已加载 job 可执行 `kickstart -k`，`install` 会写系统服务配置；不能拿来作为无干扰的并发 ensure。安装器当前 health 的 JSON/PID 检查也不能替代上述 Home 身份证明。 |

## 已审启动与就绪协议

1. **只在需要转发时启动。** MCP 的初始化/ping、参数或身份已拒绝的请求不启动。恢复绑定、连接工具、能力发现及管理转发需要宿主时，在原转发路径前执行同一个 `ensureResident`；不把自动启动塞进通用 `postToResidentHost`，避免顺带改变 CLI 等其他入口。
2. 固定本次受信 Home、origin、Runtime/连接版本及取消信号。Home 仍用既有解析与 `actionGatewayHomeId` 算法，启动传入同一解析结果；物理互斥仍由 storage owner 校验。不改 Home id 算法，不向其他 Home 或 App 默认实例回退。
3. 对原地址做**有界就绪探测**：只读既有控制令牌，不调用会创建/修补令牌的 `resolveWebControlToken`。GET 携带新 challenge，不携带密钥；复用既有 HMAC 规则验证精确响应字节和 `status: ok`，随后走原受保护的 context `describe`/动作发现取得实例。普通 200、PID、启动器日志或 IPC 的 ready 不能单独算就绪。每次探测有响应大小/时间上限，不跟重定向。
4. 身份正确但 `starting` 的宿主只等待，不另起。地址存在但身份不符、属于其他 Home、拒绝或响应畸形时明确失败，不终止它、换地址或尝试本地写。只有能够确认尚无监听者时进入启动；超时、reset、认证失败不能一概当成“不在”。
5. 启动同一 Home 已安装的 `bin/molis-work-web`，显式 `--home` 与原端口，`shell: false`；不从 PATH 猜另一个安装、不改 Home 的 release 指针、不代人安装/升级。标准输入忽略，日志不进入 MCP stdout。保持既有启动环境规则，Runtime 的 actor/project/session 仅留在原请求 envelope，不成为新宿主的身份。缺入口、权限或所需 Runtime 时返回可操作的安装/配置错误。
6. **初始启动失败**用父子私有 fd 3 传递有界的安全错误码与 kind；不是网络监听或业务 RPC，不传 token、opaque owner proof、PID 或请求正文。由现有 Web/Node wrapper 链转接，不用 stderr 文案、PID 文件或“打印了 URL”猜成功；不另发可被误当就绪的 ready。该回执只帮助诊断，授权与就绪仍以第 3 步为准。
7. 启动进程仍经 A 的严格 owner 才能初始化 Catalog/模型/Web 资源。拿不到 owner 的启动候选退出，不打开业务库。其 MCP 等待相同地址上的胜出者；若最终未就绪，保留真实 `storage.owner.busy` 原因，不虚报启动成功或把 offline owner 当可接管实例。
8. **已审等待预算**：单次调用启动/等待总计 20 秒，单次探测不超过 1 秒，250 毫秒可中断退避；都用单调时钟且不因新候选无限延长。同一请求的恢复、发现共用一次预算与失败结果；静默监听者只在总预算内重探测，绝不能据其超时启动候选。Web 启动入口也有 20 秒首次就绪期限，父 MCP 退出后仍自行收束；保留现有 App 的 8 秒预算和 Web 的 2 秒关闭界限。
9. 就绪后复核原调用/身份与取消，再进行原发现和至多一次业务转发。真实业务请求送出后，不论失败、断连、Host 更换或结果未知，都不自动启动并重放它。下一次用户明确发起的新请求可以重新探测/启动；不做后台崩溃重启循环。

管理入口没有 Runtime ID 时也读取既有 `MOLIS_WORK_WEB_URL` 配置，再使用默认地址；不能因没有 Runtime 上下文而丢掉明确端口。给常驻进程的环境保留同一 Home/origin，并清掉 MCP 客户端的 Runtime/Session/Panel/Goal 身份；身份只随原请求转发。

地址边界保持：转发仍允许现行数字回环 origin；自动拉起只覆盖既有启动器可提供的 127.0.0.1 绑定与同一个配置端口，不添加第二端口。端口须是 1～65535，拒绝 `--port 0` 随机分配。若配置的是未运行的 IPv6-only 地址，现有启动器无法提供它，就明确返回不可用；不悄悄改成 IPv4 或改变 S-01。

## 并发、取消与失败恢复

同一 MCP 进程内按 Home/origin 合并正在进行的启动等待；每个调用有自己的取消信号，不能用首个调用的取消去终止其他等待者。跨 MCP 不新增 Home 锁、PID 文件或租约表，复用严格 storage owner 仲裁。

**已审并发口径：**只有一个取得 Home owner、初始化业务并保持运行的宿主。两个 MCP 同时观察到无服务时，可能短暂创建两个启动器候选；只有一个成功，另一个退出并等待胜出者。不承诺跨进程只有一次 OS spawn，不新增协调机制。并发项目创建沿用原合同：正在处理的同键请求可拒绝为 `work.context.idempotency_conflict`，已完成的同键调用可读回原结果；MCP 不自动重发，客户端可显式只读解析确认，最终只有一个项目。

| 情况 | 本片要求 |
| --- | --- |
| 信号已取消/Runtime、连接或 Home 改变 | 不 spawn、不提交缓存、不转发；等待期间发生则立即结束该等待，再次检查后不得派出请求。 |
| MCP 断线或输入关闭 | 中止该 MCP 的等待和原在途 HTTP，释放自己的计时器、管道及监听；不杀已共享的常驻宿主。 |
| 启动后取消 | 不能据“这是我 spawn 的”杀可能正被另一 MCP 等待的进程。按所选常驻策略让宿主完成启动；原取消调用永远不补发。失败/首次就绪超限由启动入口自己的关闭流程收束。 |
| 其他 Home/非本服务占端口 | 拒绝，不发业务凭据给未经验证的服务，不改端口、不杀对方。 |
| 同 Home 被 offline owner 持锁 | 候选拿不到 owner，业务文件不写；有限等待后如实返回 owner busy，不能解除、替换 inode 或绕开锁。 |
| 入口缺失、spawn 失败、子进程提前退出 | 可区分的不可用原因与恢复提示；只记录阶段/安全错误码，不返回 stderr/stack、token、环境或请求内容。 |
| 健康检查超时 | 返回 `actions.service_unavailable`，说明宿主未在期限内就绪；不声称它已经退出。若已得到 owner busy，保留这个具体原因。 |
| 宿主在业务调用中崩溃 | 保留现行 `delivery_unknown`/`host_replaced` 等契约与调用号；不自动重发写操作。原数据由既有 owner 恢复，不造新请求。 |

**取消的现有缺口必须落实到实现：**`serveMcpStdio` 当前逐条 await，`runStdio` 的 finally 在等待结束之后才 close；不能据此声称等待中已经感知 stdin EOF 或 MCP cancellation。本片须把输入关闭及匹配当前请求的取消接到可信 AbortSignal，让等待时也能被中止；取消编号只定位本连接的请求，不是身份或 Host 停止权限。普通工具仍串行，不借机增加并行工具调度或无界请求队列。若实现无法在等待中接收取消，RAC-628 就未完成，不能用缩短 timeout 代替。

## 已审退出策略：A 常驻

| 方案 | 行为与取舍 |
| --- | --- |
| **A：启动后作为常驻服务运行（建议）** | MCP 退出、断线或单次调用结束不停止它；App 打开时沿现有健康验证复用，**仅复用，不冒称转移 Child/owner 给 App**。既有 LaunchAgent 仍归原服务管理；直接启动的进程不注册成登录服务、不自动拉起崩溃实例，随系统会话结束或对该进程的正常退出而结束。App 退出只关闭其原本拥有的子进程，保持现行外部宿主规则。 |
| B：全局空闲后退出 | 可减少后台驻留，但“最后一个 MCP 断开”不等于 Home 空闲；还必须统计 App/WebSocket、所有转发调用、后台 Agent/Feed/提醒/调度，并保证未来到期任务有人唤醒。当前没有这一份全局生命周期判定，需扩大平台范围，不能在 C5 加一个 MCP idle timer 就算完成。 |

本片采用 A，复用当前 App 对外部宿主的处理，不引入全局客户租约、心跳或自动停止。后台宿主继续驻留，不能宣称“退出 App 就退出所有外部宿主”。统一停止所有宿主如有需要另走受信的显式服务管理设计，本片不按 health 返回的 PID 夺取或终止外部进程。B 不实施。

常驻宿主的初始化和已授权的后台 Agent/Feed/提醒仍按原生命周期运行；取消这次 MCP 请求不撤销别的原有工作。本片不因启动创建业务任务，不重放未知结果；取消验收中的零写指该次 MCP 工具的绑定、别名、创建、删除等业务效果，不能把独立宿主的正常初始化冒充成该工具执行，也不能把原工具的迟到写算成初始化。

## 文件与合同边界

- `mcp-resident-start.ts`/`mcp-resident-health.ts` 集中实现启动与就绪，由生产 stdio 注入 `mcp-server.ts` 的 context、restore/alias、动作发现及管理转发。通用 HTTP helper、嵌入式本地 MCP、CLI 不自动获得启动副作用。
- `apps/desktop/launchers/mcp/server.ts` 负责生命周期注入；`apps/mcp/src/stdio.ts` 只补输入关闭/当前请求取消的可观察性，身份仍经原工厂。`apps/desktop/launchers/web/server.ts` 和安装器的既有 launcher 链只补上述启动状态/首次就绪收束，不另建第二套 Web Host。
- 健康验证与原 `web-control-token.ts` 的签名规则共用，控制令牌只读既存文件；不新造密钥、Home id 或 owner proof。S-01～S-07、S-09/S-12 保持，实施时同步拒绝测试与必要文档。
- 如需暴露新的 app 级启动函数，显式列出入口及消费者；不用新的 `export *`。动作 id/schema、MCP 工具名、持久业务结构不变。

具体装配：Local Host 只显式导出 `createMcpResidentStarter`/`EnsureMcpResidentHost` 给 Desktop MCP，导出 `reportMcpWebStartupFailure`/`watchMcpWebStartup` 给 Web launcher。`mcp-request-lifetime.ts` 保持原 operation id，并将 stdio 的可信信号并入原 Runtime/连接 lifetime；同一请求只缓存一次启动等待，失败不重新拉起。`mcp-start-preflight.ts` 用已有工具 schema 拒绝格式和身份字段，静态管理工具先完成原管理 factory 的身份/出处验证再启动，不先靠一次目录发现启动。`goalsManagementContext` 只提取原身份/出处转换供这一步复用；真正动作仍在 Home 内重新校验、执行和记账。

生产管理调用由 `mcp-v1-tool.ts` 在任何本地 storage 准备之前进入既有 management HTTP；不在 MCP 读 Catalog、打开 SQLite 或取得 owner，目录归属由常驻 Host 的原管理网关核对。只有显式嵌入式与 CLI 保留原目录及本地路径。原静态门禁将两类入口统一锁死为先读目录和实际本地 fallback，须承接新合同。v2 已独立 REVIEW 通过并经 Root/PIPE 具体授权采用：准确叠入 FIX19 `34b836efe095b8bdb89ac27fbec83dd2d3b40422` 的 CLI guard、配套门禁及原 14 项拒绝变异；不带该提交的普通卸载或在途 purge。新门禁要求最终 MCP 恰有一个合法生产分支，此前只有三条既定纯解析/缺路径拒绝；合法生产分支投影后保留原 CLI/嵌入式检查。保留原前八项新增负例，再加准确删整分支、真实 Catalog 前移及重复分支，共 11 项实际源码变异。CLI 的 Home owner 前置、仅 init 的目录准备、外部 init 坏 JSON 的原 mkdir 顺序都保留并补实操回归。

## 验收与验证计划

以下是真实进程验收合同，实际通过范围及未验证项须在交付时单列。测试名/注释逐条标编号；隔离 Home、固定本次配置端口，结束时只清自己的 PID/子进程，不启用或改用户的 LaunchAgent。

| 编号 | 必须失败的反例与必须成功的路径 |
| --- | --- |
| RAC-625 | 无宿主时用实际已构建 stdio 与现有 Web 启动器完成冷启动→经认证就绪→真实 context 解析/绑定/创建及原记录读回；已有同 Home 宿主时复用，不重复启动。MCP 只读允许的安装/控制元数据，不开 Catalog/业务库/owner；缺入口、无 Home 或错误身份拒绝，业务记录不产生。 |
| RAC-626 | 同步放行两个独立 MCP 的无服务探测，制造真实启动竞争；只有一个运行中的 owner/Host/监听者，两调用最终转发到同一实例，业务写无重复。另用真实进程持生产 owner 锁，断言候选被拒、原 inode/业务文件和原持有者不受影响；不得把候选数当成已保证的一次 spawn。 |
| RAC-627 | 用错误 Home、错误 HMAC、旧 challenge、篡改/超大/不完整 health、占端口的非本服务、错误实例与 origin/令牌/nonce 负例逐个拒绝；外来服务收不到业务 token/正文，不改地址/起备用监听。复用 S-01～S-07 原拒绝断言。 |
| RAC-628 | 卡住真实启动/就绪阶段，分别取消请求、关闭 stdio、改变 Runtime/连接；等待及时结束、原工具零派出/零业务写。另一个 MCP 继续等待并成功，首个取消不杀共享宿主；启动失败/超时保留准确原因，恢复后只有新请求才能继续。 |
| RAC-629 | 按已审 A 验退出：两个 MCP 退出后宿主仍可由新 MCP/App 复用，App 不把它误当自己的 Child；真实业务执行后断连/kill 宿主，结果未知的请求无自动重发，下一次新发现能恢复。正常关闭、启动失败和强制进程退出后，原 storage owner 的释放/仍占有语义不变；真实 App 实操另列，自动化不能替代本人验收。 |

复用候选里的 `security-invariants-home-context*`、`security-invariants-home-storage-*`、`action-gateway`、`security-invariants-local-entry` 与现有 launcher/stdio 用例，新增一组 C5 真实进程回归。实施时先整体构建，定向非浏览器测试、health/boundary/secrets；涉及启动器/Rust 的检查按实际 diff 选择，整批 full 与 macOS App 实操由统筹排。设计阶段不启动构建、服务、浏览器、真实 Home 或凭据读取。

## 待决与依赖

1. 原 Claude 已选 A，并认可“一个长期 Home 宿主，允许被 owner 拒绝的短暂启动器候选”；启动命令只取同 Home 已安装入口、shell:false、工具参数不能指定命令/Home/端口、PATH 别的安装不用及 port 0 拒绝须配新安全行。统筹在 [6396548527](https://github.com/molis-ai/molis-work/pull/1270#issuecomment-6396548527) 将本片暂定编号裁为 **S-77**，正式公共表行由收 C5 的唯一 carrier 落地；本分支不并写公共表，不把暂定号当成 health 已通过。
2. 初期 `bb7137fc` 分支及证据保留在 `feature/w5-16-mcp-autostart` 的 `8c6047062ce380b0a4cde828f715e153d259bac9`。实际依赖现已满足：后继 `feature/w5-16-mcp-autostart-main` 从 main `64a3ccc9` 只承接本片五个自有提交，含已准的最小 FIX19 CLI guard/gate；不整取旧 batch-36、旧 baseline/SI。`352c64e0c` 仅作设计历史证据。
3. PIPE 已核 C5 没有第二 owner，沿用本份 spec 完成实现、验证与一个完整 PR；不提前开占位或 Draft PR，也不重跑 #1263 的原验证。新的安全不变量编号/共同行由 PIPE/原 carrier 串行登记；门禁在本片独立分支按 Root 具体裁定与准确 FIX19 依赖一起实施，最终共同 hunk 由 carrier 串行合，本片不并写共享表。

## 本机证据与保留边界

2026-10-25，实际安装使用 public `installMolisWorkHome` 和当前完整构建，随后运行安装生成的 MCP/Web 启动链；未替换业务实现、未跳指纹、未调大 20 秒启动或 240 秒测试限额。在本机公共重活槽内 `mcp-resident-autostart.test.ts` 8/8 通过（七个子场景加总测试）：冷启动与持久读回；管理进程禁止打开任何 SQLite 而由实际 Host 返回原 `goals.board.exists` 及已记录调用号；真实启动竞争与一次项目创建；取消/EOF 零创建而另一 MCP 接续；真实 offline owner 的 inode 和占用不变、解除后仅新请求恢复；实际已提交创建的响应被切断后返回 `delivery_unknown` 且不重放；非法参数/缺 Home/port 0/另一安装 PATH 的拒绝。两个 MCP 退出后的新 MCP 复用同一个常驻实例也已验证。

`security-invariants-mcp-autostart.test.ts` 18/18、`mcp-stdio-lifetime.test.ts` 3/3 通过。它们证明健康签名/旧 challenge/篡改/超大/残缺 JSON/重定向/缺证明/未就绪/分块等拒绝、静默监听者不授权 spawn、总预算与逐次探测、首个等待者取消不取消另一等待者、Runtime/连接变化、含空格与分号的 Home 精确执行、PATH 别的安装不执行，以及工具参数不可指定启动命令/Home/port/actor。

叠入准确 FIX19 CLI guard 后整体构建通过，11 个组合相关文件 57 项通过，含原 CLI 14 项实际源码拒绝变异、新 MCP 11 项实际源码拒绝变异、CLI 被真实 owner 拒绝时不建目录、外部 init 坏 JSON 的原父目录顺序，以及 CLI/MCP 管理身份和动作回归。`pnpm boundary:check` 通过；health 与页面资源按固定叠层基底 `bb7137fc` 比较通过，27 个资源总计 7,590,829 字节，无资源增长；API/动作 schema、工具名及快照没有变更。共享 baseline 快查与新的 S 编号/共同行由 carrier 在实际 main 上统一登记，不用调大数字放行。最终推送另需鲜取 main 并通过 secrets 扫描。

历史失败保留原范围：真实安装两次在 release staging 超过 240 秒、零进程子场景，不称为 flaky 或产品通过；之后按同一公共重活 FIFO 与整体构建隔离，原限额内完整实装通过。首次竞争测试误要求两个同键并发创建都成功，后改为保留原冲突/已完成回执合同并断言只有一个项目；其失败曾导致后继场景未在无宿主状态，旧取消结论作废。另有一组在组合构建尚排队时误启动的校验已作废，实际记录只使用构建后的 11/11 结果。

旧父基线 `desktop-entry-failures.test.ts` 的 `transport-reject` 曾期望 Host close 一次而实际为零：本片与独立干净 `bb7137fc` 当时均为同一 12/14，已交原 Home-owner A/FIX15，未改其关闭/资源 lifetime hunk。fresh-main 后继保留该线在 `64a3ccc9` 的后续修复；旧 12/14 不作为当前基底仍失败的结论。独立 REVIEW 已复核门禁 v2 窄增量；整片 FIRST/独立 TEST 与统一 full 仍按统筹流程接续。本轮没有运行 macOS App/WebKit 的实际复用/退出，也没有一骏本人验收；不能用上述 Node/安装测试替代它们。

### 冻结提交后的失败追查

固定提交 `3077bfc` 的完整实装重跑是 4 pass、3 fail、1 cancelled：240 秒父测试期限在 offline-owner 子场景等待时到期，不能用此前 8/8 覆盖。原始记录保留在 `/tmp/c5-frozen-process.log`。随后与 TEST 对齐的唯一 offline-owner 子路径仍沿 public 完整安装与原 240/20 秒预算，在实装 staging 尚未结束时耗尽父预算，零产品子场景执行。观察记录明确显示父级清理在安装复制未结束时删除同一个临时 Home，返回 `ENOTEMPTY`；安装随后仍继续写入 staging，至原进程约 377 秒才自行退出。该记录证明测试设施的清理竞态，尚未证明原 offline-owner 产品路径的根因；不称 flaky、不提高预算、不接管父 transport 或其他构建。

最小修正仅在测试设施：父级清理先等已启动的安装成功或失败落定，再关闭自有进程、删除临时 Home；两个子场景之间检查父测试的取消信号，阻止清理后的测试体继续访问安装。真实产品测试默认仍调用同一个 public 安装器。故障注入回归只给测试 fixture 一个受控的未完成安装任务，实际写入临时目录，验证取消、落定和清理的顺序；不替代真实安装证据。

`RAC-628-F1`：强制父测试到期后仍须返回失败；安装落定之前不删除其 Home，落定后目录完全清理，且取消后的下一子场景不执行。用 `mcp-autostart-fixture.test.ts` 验证清理顺序和失败结果，另用原 Node 版本的小故障复现验证子场景取消检查。原 20 秒生产等待、240 秒产品测试总限额及各项拒绝断言保持。该次设施修复不算真实 offline-owner 或后继产品场景通过；后续限定受控结果见下节，不能据此关闭原产品首败。

设施回归 `mcp-autostart-fixture.test.ts` 1/1 通过；实际故障反例只移除等待安装落定的那一行，测试因真实顺序变为 `parent.aborted → cleanup.begin → cleanup.end → installer.settled` 而失败，随后源码逐字节恢复。原 Node 小复现中加入父级取消检查后也阻止了后继场景；它仍按强制超时返回失败。日志分别为 `/tmp/c5-fixture-fix-v2.log`、`/tmp/c5-fixture-mutant.log` 与 `/tmp/c5-node-timeout-guarded-events.jsonl`，均不计为产品实装通过。

本次按入库后的实际形态重新检查 health（固定基底 `bb7137fc`）失败：`security-invariants-mcp-autostart.test.ts` 尚无 `docs/system/SECURITY-INVARIANTS.md` 表行引用。原组合 health 通过记录不作为当前固定入库形态的通过结论；不改名绕过、不放宽门禁。新 S 编号/共同行仍由 PIPE/carrier 唯一登记，本片交准确语义和拒绝测试。四个改动测试文件的 lint 已通过；本次只有 tests/specs 变化，生产构建输入与 `3077bfc` 相同，没有重跑整体构建或产品整批实装。

### 双槽受控窗口：仅验证 offline-owner

统筹提供现有 build/browser 空档后，按原 FIFO、build 继承重入及 browser 槽运行，固定 clean `4945d330df5ce5e19f46f801b596f472313db308`。11:07:30.304 UTC 实际取得 build PID 77458、browser PID 7408，driver PID 7414；[开始记录](https://github.com/molis-ai/molis-work/pull/1270#issuecomment-6396864305) 后立即运行同一个 public 完整安装器及一个 offline-owner 子场景，未等第二次确认。11:08:52.544 UTC 自然 exit 0：子场景 1/1，加父测试共 2/2，75.532 秒，零失败、取消或跳过；其他六个子场景由名称筛选排除，未在本次执行。原 20 秒生产等待、240 秒测试期限和 480 秒外层窗口未变，无重试、替换安装实现或指纹绕过。

真实 owner PID 9301 持锁时，MCP PID 9302 的首次请求约 20.069 秒返回原 `storage.owner.busy`；前后 inode/device 均为 688388906/16777232，原 owner 仍能 borrow、release-borrow，随后正常 stop/exit 0。仅在原 owner 退出后发起的新请求才成功恢复（约 4.652 秒）；MCP 正常退出，Host/候选与临时 Home 完成清理，没有 `ENOTEMPTY`。11:10:20.148 UTC 核实两槽均已释放，全部本次自有 PID 已退出，临时 Home 不存在。[结束记录](https://github.com/molis-ai/molis-work/pull/1270#issuecomment-6396896150) 与完整原件 `/tmp/c5-window-20261025-1058/` 保留了命令、源、时间、进程、owner 回执、清理和槽位记录。

本次只证明 RAC-626 中的这一条有限真实路径，不把 2/2 扩为整片实装通过；此前 `3077bfc` 的 4 pass、3 fail、1 cancelled 及安装慢因 UNKNOWN 保留。10:57:27 UTC 的首次取槽因作者启动包装器的 stdin 关闭而退出，零真实安装、零产品子场景、两槽已释放，[零产品记录](https://github.com/molis-ai/molis-work/pull/1270#issuecomment-6396784327) 单列，不与本次混算。夹具五文件增量的独立 REVIEW/TEST 已限定通过；其余最终实装证据、整片 FIRST、父链 actual-main、App/WebKit 与本人验收仍未闭。S-77 只有同片暂定引用，公共安全表与 health 仍由 carrier 收口。

### 原首红、取消与可复用证据

旧叠层分支 `3077bfc → 8c6047062` 只有 tests/specs 改动，C5 生产源码、构建输入及四项成功路径的业务断言没有变化；本次 public 安装也实际通过原构建指纹检查。保留该次首四项有效证据，不因同一父测试稍后超时而重跑它们，也不把整份失败日志标为全绿。fresh-main 后继的父修复与重建结果单独记录，不把旧构建冒充新基底产物。

| 原场景 | `3077bfc` 首轮原件 | 现有有效范围与下一动作 |
| --- | --- | --- |
| 冷启动、持久读回与复用 | pass，41.906 秒 | 同生产源码/构建输入、相同断言的有效实装证据，复用，不重跑。 |
| 无 Runtime ID 的管理转发且 MCP 禁止 SQLite | pass，17.247 秒 | 已实际收到原 Board 已存在拒绝与记录调用号，复用，不重跑。 |
| 两个真实 MCP 竞争、单 owner 与一次创建 | pass，34.256 秒 | 已按原并发冲突/回执合同读回唯一项目，复用，不重跑。 |
| 取消、EOF 不创建而另一 MCP 接续 | pass，22.072 秒 | 独立子场景已完成断言及清理；夹具修复不改其成功路径，复用，不重跑。 |
| 真实 offline owner 保持原 inode/数据、释放后新请求恢复 | MCP closed，16.928 秒，父期限中断 | 由上述同一原场景的受控真实安装补齐，单场景 1/1＋父测试 2/2；不再重复。原安装慢因仍 UNKNOWN。 |
| 已提交真实创建的响应被切断，返回未知且不重放 | 因父清理后的安装入口缺失失败，产品断言未执行 | 已由 fresh-main `7a63ac1a7` 的同一原场景补齐，18.006 秒；public 真实产物、原断言和原预算，详见下节。旧 8/8 不代替它。 |
| 非法参数/身份/Home/port 与 PATH 其他安装拒绝 | 因父清理后的 attempts 目录缺失失败，产品断言未执行 | 已与上一行同批补齐，14.809 秒，真实拒绝和 PATH sentinel 未执行断言均通过；未重复前五行。 |
| 父测试 240 秒取消 | cancelled | 原始取消与清理竞态记录保留；设施修复已有独立正例、实际删等待行反例和限定 REVIEW/TEST。安装慢因未定，有限场景通过不改写整批首轮历史。 |

必要的两个原场景已按现有 FIFO 执行；保持 20/240 秒和既有外层限额，不重全八、不抬预算、不把旧 8/8 代当前头。原 Claude 的整片 FIRST 入口为本分支固定头、同一 spec 与这份范围映射；专职 Codex 的 v2 门禁及夹具评审仍只限各自增量。

fresh-main 接续已逐项核范围：`64a3ccc9 → c20fc04db` 为本片 35 文件 1,388/+、79/−；C5 生产文件、测试及门禁与旧固定分支逐字节相同，唯一重叠入口 `apps/local-host/src/index.ts` 保留了 main 新增的 `HomeInitializationFailure` 类型导出。`project-host.ts`、`home-storage-lifetime.ts`、公共 SI、baseline 与 API/动作快照均与 main 相同，没有改写原 owner 或父收尾修复。锁文件/依赖未变。随后仅补同片规格及 local-host README 生产管理入口的一段陈旧描述，固定 `7a63ac1a70a34a29189164d868d803bbaf318e77`（36 文件 1,391/+、80/−）完成下列新产物验证。

### fresh-main 新产物与最后两个原场景

整体 `pnpm build` 在公共 FIFO 自然 exit 0；原 manifest 创建时间 11:54:27.563 UTC，实际源码 digest `62c71585dbb43060607cc747c8513709b14be9fce5cf58e1db152ba6c28ff2ba`。边界检查在完整构建后直接执行原 checker，避免 `pnpm boundary:check` 再隐式并发构建 test-kit：70 包、2,832 源文件、12,896 imports、248 边、67 合同子路径，零错误；页面资源对实际 main `64a3ccc9` 为 27 项、7,590,829 字节，无增长。health 重新检查只报 S-77 文件缺公共 SI 行引用，仍为 FAIL，未放宽门禁。新基底与本片交点的两个既有回归 `desktop-entry-failures.test.ts` 14/14、`cli-home-owner-entry.test.ts` 2/2 单次 jobs=1 通过；旧 12/14 的历史不冒充当前失败。该组原件分别在 `/tmp/c5-fresh-main-build.log`、`/tmp/c5-fresh-main-boundary.log`、`/tmp/c5-fresh-main-assets.log`、`/tmp/c5-fresh-main-health.log`、`/tmp/c5-fresh-main-owner-entry-tests.log`。

最后两个原场景使用同一 `7a63ac1a7` 新产物与 public 完整安装器，只排除前五个已具有效证据的子场景。12:13:22.198 UTC 实际 FIFO 取得 build PID 31833、browser PID 33936、driver PID 33942，[开始记录](https://github.com/molis-ai/molis-work/pull/1270#issuecomment-6397488630) 后由后台无交互地立即执行，12:14:49.711 UTC 自然 exit 0。两个子场景加父测试共 3/3，84.935 秒，零失败、取消或跳过，其他五项未在这次运行。原 20/240/480 秒未变，无重试、指纹绕过或安装实现替换。

实际已提交创建的响应被切断后，原请求收到 `actions.delivery_unknown`；新明确只读请求读回唯一项目，启动 attempts 未增加，原环境清理断言也通过。非法工具/参数/身份、缺 Home、port 0 与缺少同 Home 启动入口分别收到原拒绝，PATH 的另一安装未执行。全部 MCP 子进程正常退出，临时 Home 正常删除；12:18:47.731 UTC 实核原两槽和全部自有 PID 已释放，临时 Home 不存在，下一个原票于 12:14:52.052 UTC 接手 build。[结束记录](https://github.com/molis-ai/molis-work/pull/1270#issuecomment-6397503099) 及原件 `/tmp/c5-main-remaining-auto-7a63/` 保留实际 source/build、命令、结果与释放记录。

此前 12:04:36 UTC 取得双槽后，作者保留的 GO 控制层在 12:05:36 UTC 到期，未启动安装或产品子场景，原件 `/tmp/c5-main-remaining-7a63/` 单列保留。随后彻底移除 stdin/GO 依赖，在不占槽的微型无交互路径验证后按正常 FIFO 取得上述窗口；不是产品重试，也不抵消原慢因 UNKNOWN。当前七个子路径的证据是四项同源复用、一次 offline 单场景、一次余两场景，均按原范围记录；原整批首败历史保留。独立 TEST 已分别核收 fixture、单 offline 及本次余两项原件：最后一轮仅读既有 raw、83 条 observer、实际代码与释放记录，没有重新安装；也独立确认纯 spec 后继 `26e1f7d86` 的源码 digest 与本次 manifest 同为 `62c71585…ff2ba`。这些限定结论不代替 Claude 整片 FIRST、正式 S-77 公共行或最终组合收验；本片不提前宣称 health 或整条工作完成。

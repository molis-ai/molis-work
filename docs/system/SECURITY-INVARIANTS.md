# 安全不变量：每一条的代码位置和拒绝它的测试

本机的安全边界写成一张表：每条不变量写清**被拒绝的是什么**、**守住它的代码在哪**、**断言拒绝本身的测试是哪几个**。设计来源：[specs/archive/repository-anti-corruption](../../specs/archive/repository-anti-corruption/spec.md) §6（初稿）与 §4.18（W2-19）。

- 一条不变量的测试必须断言**拒绝**（状态码、错误码、没有被写的记录），不能只证明正常路径能走通。
- 表由门禁看住：`pnpm health:check` 的 `security invariants` 规则（`scripts/gates/security-invariants.mjs`）检查每一行严格保持五列（防止未转义 `|` 静默错列）、点名的测试文件存在、每一个「标题片段」（一个文件后面可以连写几个，一个都不漏）确在文件里、「CI 里跑」一列的文件确实被 CI 跑到（`test:security`、`test:security:macos`、`test:contracts`、`ci.yml`，或 Verify 产品子集里列着、不在隔离表里的用例；子集清单本身有错时一条都不算），且标有 `@requires-platform darwin` 或带 darwin-only `skip` 的用例若列在「CI 里跑」一列，必须真正由 `.github/workflows/ci.yml` 中的 `macos-latest` 作业（`security-invariants-macos`）运行，不允许 Linux-only 作业下 0 执行报绿；每个 `tests/security-invariants-*.test.ts` 与 `*.e2e.test.ts` 都被某一行点名；「代码位置」一列反引号里的每个 `.ts` 路径都是从仓库根写起的已跟踪文件（可带行号，行号不查），简称、越出根或别处同名文件都报记录与行。上游来源写成指向具体提交的 Markdown 链接，已删的文件用文字说明，不写成代码路径。改了测试名或搬了文件就改对应独立记录。
- CI 里跑的集合是四处：根 `package.json` 的 `test:security`（Linux `security-invariants` 作业）、`test:security:macos`（macOS `security-invariants-macos` 作业，覆盖 `@requires-platform darwin` 及含 darwin-only 沙箱用例的安全不变量文件）、`test:contracts` 里已有的几条（动作网关、`beforeEffect`、MCP 授权），以及 `ci.yml` 其它作业/步骤单独跑的几条（例如 `gates-built` 作业的「Security invariant gate regressions」步骤跑 `tests/secret-scan.test.ts` 与 `tests/health-gates-dual-instance.test.ts`）；门禁按这四处核对「CI 里跑」一列。尚未纳入 CI 的整机或浏览器用例列在「只在本机跑」一列。
- **这一步挡合并**（决定 #14，本次按只许变严合同落实）：`ci.yml` 的 `security-invariants` 与 `security-invariants-macos` 作业均在 `Verify` 的必过结果里。合并队列里跑完整安全不变量清单；PR 上 some 定向，whole、选择故障及不可信输出仍跑整套，只有选择成功且 `security_mode` 明确为 none 时才跳过。Verify 直接读取选择器结果和对应 mode，逐项核合法 skipped；失败或取消的作业不放行。选择器本身是辅助依赖，不替代实际测试结果。直推、每晚、手动整套跑，可信已验 push 按原队列证明复用。
- Computer Use 已在 main：助理电脑 socket 在 S-04，桌面动作的拒绝在 S-25。

## 1. 独立记录

子任务重启接续的授权边界见 [S-subtask-resume-original-directory](security-invariants/S-subtask-resume-original-directory.md)；受保护安全门控提示词防覆盖及未登记提示词拒绝边界见 [S-protected-prompt-override](security-invariants/S-protected-prompt-override.md)。统一工作分区的保留分区与分区隔离见 [S-personal-partition-reserved](security-invariants/S-personal-partition-reserved.md)、[S-partition-isolation](security-invariants/S-partition-isolation.md)，跨分区读与提醒不叫醒不相干的分区见 [S-partition-wake-scope](security-invariants/S-partition-wake-scope.md)，随本人设置不出本机见 [S-person-settings-private](security-invariants/S-person-settings-private.md)。

每条不变量独立放在 [security-invariants/](security-invariants/)。旧 ID 保留；新增使用 `S-<语义名称>.md`，例如 `S-plugin-route-origin.md`，不再争用连续编号。文件里保留一行五列记录；修改只触及该不变量的文件。跨边界同一事实仍须共同评审，不能通过拆文件放宽断言。

查阅完整表：运行 `node scripts/gates/security-invariants.mjs --report`（直接读这些记录，不提交第二份总表）。




### S-15 插件权限

详细规则、调用者、权限交集、内置信任与沙箱说明随该边界的独立记录维护：[S-15](security-invariants/S-15.md)。

<a id="调用者"></a>
<a id="权限交集"></a>
<a id="内置与信任"></a>
<a id="沙箱"></a>
<a id="s-15-代码位置"></a>

S-15 原章节入口：[调用者](security-invariants/S-15.md#调用者)、[权限交集](security-invariants/S-15.md#权限交集)、[内置与信任](security-invariants/S-15.md#内置与信任)、[沙箱](security-invariants/S-15.md#沙箱)、[代码位置](security-invariants/S-15.md#s-15-代码位置)。

### 内容包签名与安装

本人签名、预览的有效期和确认安装见 [S-84](security-invariants/S-84.md)。发布者撤销对本机签名与已装插件的影响见 [S-87](security-invariants/S-87.md)。本机账号环境切换与测试打包隔离（ENV-12/13）见 [S-account-environment-isolation](security-invariants/S-account-environment-isolation.md)。

## 2. 怎么跑

```bash
pnpm test:security   # CI 里的这一步：各记录“CI 里跑”一列的集合
node scripts/run-tests.mjs tests/security-invariants-local-entry.test.ts   # 单个文件
```

测试里的写法：

- 新测试只经包的公开入口和 `launchers/web/server.ts` 起真实的 Web 宿主（`health:check` 不许新文件引用包内部）；需要内部函数的断言，加进已经引用那个内部的旧测试里。
- 起宿主用 `createMolisWorkWebServer({ homeDirectory, controlToken })`，每个测试一个临时 Home。需要换 `Host` 头、不带 `Origin` 的请求，用 `http.request` 直接发（`fetch` 不让改 `Host`）；每个请求新开连接（宿主拒绝时不读请求体，复用连接会被挂断）。
- 升级后的 WebSocket 不是 HTTP 连接，`server.close()` 不会等它也不会关它：测试结束先 `terminate()` 再关服务。
- 这台开发机的代理会把 `198.18.0.0/15` 的地址转给本机监听的端口，所以“别的地址连不上启动器”按启动器自己的 `process_id` 判断，并跳过这个网段（原因见 `S-01` 的测试）。

## 3. 加一条不变量

1. 写清它拒绝什么，写一个**会失败的**测试（先在没有这条保护的代码上看它红）。
2. 找不到拒绝的代码，就是安全缺陷：补最小的拒绝，在提交说明和 PR 里写明这是补洞。
3. 在 `docs/system/security-invariants/` 新建 `S-<语义名称>.md`（不复用已有 ID），写一行代码位置和测试（路径加「标题片段」）。测试能在 Linux 上稳定跑过，就放进 `test:security`，并写进“CI 里跑”一列；否则放“只在本机跑”并说明原因。
4. 门禁红了就按它说的改对应记录。

## 4. 开放项（没有守住，或守住的范围有限）

- **桌面 IPC 的可达范围（F15 的另一半，第 102 批 `S5` 真实 macOS WKWebView 实测已补）**：S-14 钉住了能力文件；`apps/desktop/src-tauri/runtime-capabilities/default.json` 现在只把 `native_set_locale` 与 `shelf_*`（胶囊的 `capsule_*` 已随第 44 批删除；含 `platform_read_selected_file`、`shelf_admit_paths` 等）开放给核过身份的那个端口（默认 4173，被占时自动回退 4174–4199；LaunchAgent、CLI 与 Tauri 桌面均已统一按 `run/endpoint.json` + HMAC `/health?challenge=` 协商）上 `127.0.0.1`/`localhost` 的页面，授权在启动时按端口加上（RES-08），原生 PTY 命令已无消费方并移除（S-14）。第 102 批已把 `apps/desktop/src-tauri/tauri.conf.json` 的占位页 CSP 从 `null` 改为严格静态策略（`default-src 'none'; style-src 'self'; script-src 'none'; ...`，无 `'unsafe-inline'`，动态页 `S-21` 仍由 `local-host` HTTP `PAGE_CSP` 守住），并在 `main.rs` 实施分级 `S-14` IPC 校验（全部自定义命令均强制检查 `main` 窗口与活跃端口精确来源，仅显式列举的 5 个只读/布局低危 UI 命令可复用绑定端口、令牌摘要与单调代次的 2.5s 活跃端口健康租约，其余所有写操作、敏感与未知命令一律失败关闭做实时 HMAC 验权）。2026-11-21 在真实 macOS WKWebView 构建（`molis-work-desktop`，隔离临时 `MOLIS_WORK_HOME` + 备选端口）实测 `S5`：① 顶层 `main` 窗口持有 `__TAURI__`，低危 UI 命令复用健康租约放行，越范围的 `runtime_settings_set`（非 `/settings/running`）与非法协议 `open_external_url` 均被拒绝；② 生产同款 `sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"` 插件 `srcdoc` 框在真实 WKWebView 中 `origin === "null"`、无 `__TAURI__` / `__TAURI_INTERNALS__`、无法读取 `parent.document` 或 `parent.__TAURI__`；③ 真实同源 `iframe` 自身不注入 `__TAURI__`（且第 102-1 批已移除工作台 Layer 1 嵌套分屏框）；④ 真实工作台经严格 CSP 占位页无报错跳转至 `/onboarding` 与插件框并加载完整资产。剩余敞口：壳向 Host 换到路径、核对之后到 `open` 之间仍有毫秒级的窗口（文件可能在这一刻被换成链接），没有消除（PG-113）；`S5` 实测依赖真实 macOS 图形会话，尚未纳入 Linux CI。
- **“是不是本机”在两处不是共用那一份**：桌面壳的 Rust（`apps/desktop/adapters/tauri/src/main.rs`、`context_directories.rs`）是另一种语言；OAuth 代理 Worker（`apps/local-host/cloudflare/worker.ts`）单独用 `wrangler` 打包部署，今天不引用工作区里的任何包，部署步骤（`apps/local-host/cloudflare/README.md`）也不先构建，而 `contracts` 的子路径只导出构建产物。Worker 的那份与共用的那份等价，由 `tests/connector-oauth-broker.test.ts` 逐个写法比对钉住；要合成一份，先要让 Worker 的部署带上构建步骤（它是线上服务，由用户决定）。
- **`/health` 等 GET 路由没有“只读”断言**：S-03 保证的是变更不绕过令牌，GET 路由是否真的只读靠评审；D0038 经用户选择 D 方案，HTML 只含 cookie 配对的随机 CSRF 证明，宿主控制令牌不进入页面；会话不赋予额外账号、空间、插件或 MCP 身份。同源脚本仍可能借会话请求允许的操作；未实现 E 方案的敏感操作独立确认。没有跨域读的头（宿主不发 `Access-Control-Allow-*`，见 S-03 的测试）。`/locale` 不是只读的：同源页面切语言时写 Home 记录 `config/ui-locale.json`，只认 `Sec-Fetch-Site: same-origin`（S-ui-locale-memory）。这个头挡的是别的网页直接改记录；看不到的部分是本机非浏览器进程能自带这个头，以及别的网页让浏览器顶层跳到 `/locale` 仍能改 Cookie（页面语言变了用户看得见，用户接着发送时回复语言和记录跟着页面走）。
- **控制令牌文件已存在但权限过宽时不会收紧**：新文件是 0600（S-06），旧文件（别的版本或手工放的）原样沿用。处理需要用户定：沿用并收紧权限、或换新令牌（换新令牌会让常驻服务与 MCP 进程重连）。
- **提示注入的标记中和随当前包验证**：SDK 对 pinned memory 伪标记的中和（Prologue `f40af26c`）在当前 vendored 包 `prologue-sdk-0.1.0-rc.4.tgz`（Prologue main `8c80bab3`）里，S-13 的 `tests/prologue-memory-boundary.test.ts` 对这份包断言拒绝（`pnpm test:security`）。换包时同一条用例必须在新包上再过一次。进度见 [采用 spec](../../specs/prologue-adoption/spec.md) §6。
- **公网地址判断还剩两份**：2026-11-21 复核后，沙箱代理、宿主公网 HTTPS（插件创作台）、资料来源读取（Jelly）与 RSS 都用 `@molis-ai/molis-work-contracts/platform/public-address` 那一份（纯函数，不引 `node:net`；`198.18.0.0/15` 按用户 2026-09-27 的决定由调用方以 `fakeIpProxy` 声明）。AnySearch 仍用 `node:net` 的 `BlockList`，由 S-10 的同一张表钉住行为。
- **Seatbelt 沙箱用例永远不会在 Linux 上跑**：S-15 里读写、起进程、直连网络被拒的断言只在 macOS 上有；Linux 上的沙箱继任者属于 C 端就绪方案的 D4。
- **Computer Use 的拒绝没有真机记录**：S-25 的用例都用假驱动、不要 macOS，都在 CI 一列：`pnpm test:security` 跑 `tests/security-invariants-computer-*.test.ts`（选择器不编译正则、菜单路径指向 Molis 窗口）和 `tests/computer-use-gaps.test.ts`（四种拒绝、确认入口跟持有轮次；main 的夜间 Full suite 在 Linux 上跑过它并通过，`739e6cb29`，CI run 39157724720）。真机上终端打字、系统设置、被挡住的落点和自批四种拒绝还没有记录（`specs/computer-use/spec.md` 状态句与 CU-G04）。
- **等外面的结果只证明「在」**：S-27 的 `molis.file-present@1` 看的是文件在、比登记它的那一轮新、带完成标记，不看内容；这一轮自己（或同一目录里别的进程）写下的文件也算。它放行的只是这一步接着做，接着做的那一轮照常过派出前复核与逐笔审查，所以不是越权，但「文件在」不等于「生成成功」，备注里也这样写给人看。
- **本机页面只挡本进程知道的监听口**：S-44 拒的是本进程的 Web 入口和它起的浏览器的调试口；另一个 Home 的宿主、桌面壳自己的监听口、本机上不相干的程序开的端口，进程无从得知，不在内。这些端口上的页面能不能被读，由人授予 `materials:fetch_local` 时一并承担，申请理由要写给人看（平台权限的人话说明见 BL-353）。
- **早先卸载留下的连接绑定**：BL-596 之前卸载的插件，按安装的槽和 Home 安装分在各项目名下的按记录绑定没有删；现在它们在下一次删项目时被一并清掉（见 S-71）。装在没有登记进 Home 目录的项目里的安装（独立库）`heldInstalls` 看不到，不算别处装着。账号本身不动。
- **原始文件头没有网页之外的证明**：S-45 靠的是网页脚本设不了 `Sec-` 头、且网页发的请求一定带 `Sec-Fetch-*`。握着控制令牌、不是浏览器的本机客户端可以自己带这个头，信任级别和它今天凭令牌就能做的事相同，没有变宽。「没有 `Sec-Fetch-*`」不当作肯定的证据（旧的 WKWebView 可能不发），只当作必要条件；桌面壳（Rust，`apps/desktop/adapters/tauri/src/shelf_http.rs`）现已实际发送 `Sec-Molis-Work-Original-Path` 头向宿主传递原始路径，导入请求不再把路径放进请求体。
- **Goals 私有表直接读取已于第 44 批清零（原 S-46 开放项已关闭）**：第 44 批已删除宿主 `web-goals-read.ts`、`goal-callers.ts` 及全部宿主直读 Goals 表的私路；Goals 现为普通项目插件，成果链接标题、页面、项目简介与收件箱均改走公开动作目录与插件自身声明，Goals 停用或被拒时其动作不进入目录，不再存在绕过拒绝的直读路径。
- **沙箱项目库的内存按进程采样，写事务仍短暂占有共享库写锁（S-59）**：SQLite 内存不在 V8 堆内，Node 自带的 SQLite 编译时关了内存统计（`DEFAULT_MEMSTATUS=0`），`hard_heap_limit` 不生效（2026-11-08 在官方 24.15.0 上实测，切换驱动前也一样）。子进程控制器用 `process.memoryUsage.rss()` 仅在有活跃语句或事务时每 50 毫秒按需采样（零空闲唤醒），并在派发前与每句返回前立即复查所有 isolate 与原生分配，超过 256 MB 结束整个进程，不依赖 `ps`。两次采样之间可能超限；单个值可能先在 SQL Worker 内构造，结果字节检查保证它不会再送给 Host，不保证构造前拒绝。Host 同步写等锁时，子进程控制器仍能按 BEGIN 到 COMMIT 的 3 秒总时限结束它并释放锁（另有操作系统调度延迟），Host 自身的同步写仍会暂时阻塞。反复争锁的吞吐问题未由此解决，仍受 broker 操作频率限制；不宣称写锁等待为零。COMMIT 已发出但响应丢失时，只能报告结果未知，不保证回滚、不自动重试。
- **审查页没写会跑仓库配置的程序（S-53）**：提交和推送的「执行范围」写明会运行仓库的 hooks；合并、拉取、切分支、建分支并切换会跑 `post-checkout`、`post-merge` 一类 hooks 和检出时的过滤器，放弃合并检出时跑 smudge 过滤器，解决冲突跑这个文件的 clean 过滤器和 `post-index-change`，暂存写暂存区时也跑 `post-index-change`，这些审查页都没写。批准本身守住了（不批准什么也不跑），缺的是批准时看到的说明。补审查文案（连同英文）放在 Git 的审查改成插件动作的那一片做。
- **列出过滤器和真正执行之间的窗口（S-53）**：读状态及准备、刷新冲突的临时索引前，先列出仓库已配置的过滤器再逐个关掉。后两个步骤即使检查了其他索引条目，也不需要执行这些文件的内容过滤器。`tests/git-operations.test.ts` 的 QEA-162 用实际索引和无关条目验证。建写入者工作树和整合前先查文件用没用过滤器、内容转换，再去执行。两步是两个 Git 进程。中间有进程改了 `.git/config`（或整合时改了目标工作区的 `.gitattributes`），新加的过滤器仍可能执行，前提是有进程能在同一时刻写仓库的 `.git/` 或工作区。
- **GitHub 的 secret scanning 与 push protection 在这个公开仓库上是关的**：要在仓库设置里开，属于用户的操作（`spec.md` §7）。

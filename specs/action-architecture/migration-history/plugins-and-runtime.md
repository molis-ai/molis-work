# 动作迁移历史：插件与 Runtime 接线

状态：2026-09-25 至 2026-09-28 的迁移过程与验证记录，2026-11-03 分册。原文的“下文”“末尾”指整组历史记录，可从总入口查找。下文“当前”“尚未提交/发布”“本轮”“待迁移”均为原记录时点的陈述；不作为今日状态、执行授权或现行兼容策略。现行规则见[动作合同](../spec.md)与[SSOT](../../../docs/SSOT-MATRIX.md)。防腐阶段的决定见[历史归档](../../archive/repository-anti-corruption/spec.md)。

[迁移历史总入口](../migration.md) · [2026-09-28 复查报告](../review-2026-09-28.md)

## 本册目录

- [Jelly 全量业务接线与并发等待（本轮）](#jelly-全量业务接线与并发等待本轮)
- [Cognia 业务接线、固定版本与 Prologue（本轮）](#cognia-业务接线固定版本与-prologue本轮)
- [Prologue 本机 HTTP 与 Cognia 实际消费（本轮）](#prologue-本机-http-与-cognia-实际消费本轮)
- [Dataset 业务、编辑器与真实 MCP（本轮）](#dataset-业务编辑器与真实-mcp本轮)
- [Form 业务、答卷历史与真实 MCP](#form-业务答卷历史与真实-mcp)
- [PPT 业务、编辑器、导出与真实 MCP](#ppt-业务编辑器导出与真实-mcp)
- [Images 九项业务接线、跨进程任务与失效连接（2026-09-25）](#images-九项业务接线跨进程任务与失效连接2026-09-25)
- [Alchemist 真实入口盘点与多进程执行前置修复（2026-09-25）](#alchemist-真实入口盘点与多进程执行前置修复2026-09-25)
- [Alchemist Studio 41 项业务合同与统一执行器（2026-09-25）](#alchemist-studio-41-项业务合同与统一执行器2026-09-25)
- [Alchemist 生产 Host、可信身份与旧演示清理（2026-09-25）](#alchemist-生产-host可信身份与旧演示清理2026-09-25)
- [生产 MCP 新动作入口的明确授权（2026-09-25）](#生产-mcp-新动作入口的明确授权2026-09-25)
- [对外接入的真实客户端授权界面（2026-09-25）](#对外接入的真实客户端授权界面2026-09-25)
- [Artifacts 网页与生产 MCP 接线（2026-09-25）](#artifacts-网页与生产-mcp-接线2026-09-25)
- [插件成果 SDK 共同执行与存量消费者（2026-09-25）](#插件成果-sdk-共同执行与存量消费者2026-09-25)
- [项目插件后台启动、Diff/Text Stats 动作与嵌入发现（2026-09-25）](#项目插件后台启动difftext-stats-动作与嵌入发现2026-09-25)
- [Files/Git 业务路由进入统一动作（2026-09-25）](#filesgit-业务路由进入统一动作2026-09-25)
- [Agent/Git 后台服务归属（2026-09-25）](#agentgit-后台服务归属2026-09-25)
- [Runtime 宿主依赖状态（2026-09-25）](#runtime-宿主依赖状态2026-09-25)
- [跨进程动作转发（2026-09-25）](#跨进程动作转发2026-09-25)
- [判断函数旧 MCP 名称统一授权与执行（2026-09-25）](#判断函数旧-mcp-名称统一授权与执行2026-09-25)
- [六组 Native MCP 兼容入口（2026-09-25）](#六组-native-mcp-兼容入口2026-09-25)
- [Runtime Web 自动分发与回归修正（2026-09-25）](#runtime-web-自动分发与回归修正2026-09-25)

## Jelly 全量业务接线与并发等待（本轮）

- 插件自有 59 项能力：40 类原事务命令、8 项查询/导出、3 项确认预览、3 项手工/模型整理和5项材料/模型服务。输入输出明确声明，AI 来源映射按 text 与 note/inspiration 区分必填字段；备份的原始 JSON 留给原多版本导入 owner 校验，不伪造统一旧格式。
- Host 在 Home 级注册一次，不需打开项目或 Jelly 页面。继续使用原 singleton、revision、history、note_versions、previews、模型 preferences 和连接/凭据 owner；没有新建 Jelly 数据库分区或另一套历史。`jelly:read`、`jelly:write`、`jelly:settings`、`model:invoke` 按能力检查，Manifest 权限从同一能力定义派生，声明不等于授权。
- HTTP 路由、材料/模型设置和旧 13 个 MCP 名称只做参数/协议适配；删除这些入口的 Store/AI/模型/材料业务直连。Web 的项目与全局路由绑定同一个 Home 客户端，旧 MCP 按原工具读写范围绑定授权且不借用项目上下文。旧 MCP 可省 revision 时先通过动作读取版本再 CAS 写入，保留原语义。
- 原素材文件安全读取、来源边界、结构化摘要证据、指纹复核、原文变化拒绝、预览与撤销均保留。NDJSON 通过可信调用上下文回传实际进度，断连取消传给模型/材料 owner；不将回调当成持久任务历史。
- 实测发现 Home 串行等待会阻塞模型期间的编辑。动作增加可选 scheduling=concurrent，由注册定义控制；只有声明并具备事务/冲突处理的能力并行。Jelly 模型和材料动作不占用串行队列，摘要结束后在短 Store 操作中重新检查原文与素材。Host 关闭等待并发调用，包括失败的调用；调用方无法通过伪造描述符改变调度。项目调用同样保留 Runtime 生命周期等待，未声明动作继续串行。
- 同步修复三个真实调用断点：事项 kind 原本被 owner 忽略，现按用户 task/event 选择创建/编辑且不改历史数据；复制剔除原对象的只读身份字段；旧进度窗口迟到的 close 事件不再清掉新计划的提交回调。窄屏区块操作移到正文下方，正文不被按钮挤成数个字一行。
- `tests/jelly-actions.test.ts` 11 项，实际执行全部 40 类命令与 13 个旧 MCP 别名，验证原 Store 数据、任务双向同步、实例改期、分类迁移、导入来源防替换、预览过期、撤销/重做和模型编辑/取消/失败。模型 plan 只返回预览，采纳后才产生任务及日历关联；不同 Home 和缺少权限不能读写。
- 最终业务/实操组 17 项通过：jelly-actions、jelly-http-stream、jelly-mcp、jelly-actions.e2e。官方 SDK stdio 客户端完成读取、写入、手工计划、材料重新读取、确认凭证跨进程恢复及撤销；读权限客户端不能写入或管理模型，两个 Home 不串用。MCP fixture 显式授权，不代表生产授权管理已经完成。
- Chrome 1440×950 与 390×844 实际完成笔记输入/保存、手工预览/采纳、日程创建/复制及刷新；主动将旧 close 事件延后到新预览打开后仍能确认。四张 jelly-{note,calendar}-{1440,390}.png 位于 `.impeccable/review/action-service/`，已逐张视觉检查；窄屏正文宽度与页面无横向溢出有实际断言。用户本人验收未进行。
- 相邻回归 57 项通过（并发、既有 MCP 装配、能力页面、日历/内容）；前一组 Jelly 素材/来源/模型/插件及 Host/Functions/ActionService 93 项通过。追加 Jelly 模型动作配置与实时停用验证后，模型文件 6 项通过。组间有重叠，不相加为独立总数。关键日志：`/tmp/jelly-actions-live-final.log`、`/tmp/jelly-actions-neighbor.log`、`/tmp/jelly-actions-regression.log`、`/tmp/jelly-model-actions.log`。
- Manifest 权限声明补齐后，旧 MCP 装配与 Jelly 插件回归 25 项通过（`/tmp/jelly-actions-manifest-final.log`）；根 tsc 与 diff 检查再次通过。
- Contracts、Jelly（含现有原生产物）、Workbench、Local Host 构建和根 tsc 通过；Workbench 注册边界 2 项通过。包边界仍只有既存 connector-connection-store.ts 与 web-connector-connections.ts 两处 App 直接 SQLite 引用，未新增豁免。无 commit / PR，未清理无关工作区修改。

整体仍未达到“内部完整”：其他存量插件、Home/“说一句”、Character/Agent、通用工作流输入映射与动态用途编辑、MCP Client 接入/生产 Server 授权、完整插件生命周期与统一调用记录仍需继续。Jelly 业务接线完成不替代这些范围；真实外部模型端点和音视频模型下载仍依据已有 owner 测试，不把注入模型与文本附件实操宣称为全部媒体现场验收。


## Cognia 业务接线、固定版本与 Prologue（本轮）

- 插件自身声明 22 个动作和完整输入/输出合同：知识库/搜索/详情/下载，领域与来源管理，资料增改删，上传与本机目录预览、扫描、确认/取消导入，整理/问答、草稿读取/采纳/归档。Manifest 权限直接从定义派生，Home Host 注入原 Store、模型与目录适配；没有第二份业务目录或知识数据表。
- 原 HTTP 改为路径/参数和下载响应适配，旧两个 MCP 名称转发到同一 Home 客户端；保留原默认关闭和动态工具开关，仅获得知识库读权限。原 generic personal HTTP 中的 Cognia 特例与模型解析被移除，两个生产 Web 组合根接入同一 Home 客户端。目录扫描迁出 HTTP 文件，首次使用的资料导入、确认和正文读取改用动作服务，保留原 checkpoint、回执和重试。
- `cognia:read` 不授予本机目录访问；目录扫描单独要求 `cognia:read-local-files`。目录导入声明真实 scan/preview 依赖，上传预览没有该权限要求。下载返回原始 Base64/MIME/文件名，HTTP 继续附件下载、nosniff 和 sandbox。
- 生成用短 Store 操作读取证据，释放后等待模型，再以短事务保存草稿；不阻塞 Home 的编辑、导入或查询。领域在等待期间删除时拒绝悬空草稿；原资料更新/删除仍保留其固定版本证据。失败、取消、无证据及无效引用不写草稿。
- 修复旧资料引用的实际断点：原界面打开 v1 后整理只传 ID，可能使用当前 v2。现在界面提交所见 `material_refs`，新动作允许明确版本或旧 `material_ids` 二选一；旧 ID 语义仍为执行时当前版本。实操在源已更新后从 v1 引用再整理，确认模型仍收到 v1。
- Prologue 保留原有无工具、固定上下文的有界会话；发现只读共同模型与连接元数据，不解密或启动运行器。执行绑定可信 actor，解密固定选择，并在执行前后检查模型/连接变化。正式构造的 SDK 通过受控 HTTPS Provider 实际完成请求、草稿和取消；模拟响应验证质量不能当作商业模型质量验收。
- 实测发现当前 `vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-compaction-growth.tgz` 的 `session/core/run` 仅接受 HTTPS，虽然全局模型设置允许本机 HTTP。目录/工作台现在明确显示该运行器限制并禁用生成入口，执行同样拒绝，资料操作仍可用。SDK 本机 HTTP 支持尚未完成；不回退到另一模型，不修改 vendor 安全边界来绕过测试。下一次处理此依赖需核对源码仓库及构建来源，再验证端点合同与网络边界。

验证证据：

- Cognia 与首次使用原业务组 40 项通过：`/tmp/cognia-final.log`，覆盖原数据、版本、导入原子性与重试、受控路径/附件、AI 证据以及完整资料采纳。随后补齐明确版本与生产旧 MCP 接线验证，动作/HTTP 最新 10 项通过：`/tmp/cognia-actions-http-final.log`。
- Prologue 最新 5 个场景通过，见 `/tmp/cognia-version-final.log` 中对应五项：发现零解密/零运行，实际 SDK 无工具及固定证据，执行中停用/断连拒绝提交，真实本机 HTTPS 请求与取消，HTTP 选择准确不可用。该组合日志曾有两个浏览器失败，原因是测试重导入使用了未 canonicalize 的临时路径而创建新来源；改为读取原来源 locator，并验证未新增来源资料后，浏览器组已单独全部通过。
- 标准 MCP stdio 使用官方客户端验证跨进程导入、原始字节、查询、来源删除后的固定版本、只读授权、Home 隔离和重启后确认预览。最新原生产 MCP 入口验证无项目时可调用旧名、动态关闭后拒绝旧调用；分别见 `/tmp/cognia-live.log` 与 `/tmp/cognia-actions-http-final.log`。标准客户端的权限由测试明确授予，不能据此宣称生产授权配置已完成。
- Chrome 实操 3 项通过：1440×950 与 390×844 的目录选择→预览→导入→整理→审阅→保存→固定引用→历史版本再次整理→刷新；另验证模型不可用时窄屏原因、入口禁用及资料保存。`/tmp/cognia-ui-final.log`，截图 `cognia-review-*`、`cognia-library-*`、`cognia-model-unavailable-390.png` 位于 `.impeccable/review/action-service/`；已视觉检查。未进行用户本人验收。
- 相邻动作、依赖、并发、模型、能力页与旧 MCP 装配 47 项通过：`/tmp/cognia-neighbor.log`。组间有重叠，不累加为独立测试总数。
- Cognia、Workbench、Local Host 构建与根 tsc 通过；Workbench 注册边界 2 项通过。包边界仍只有原 `connector-connection-store.ts`、`web-connector-connections.ts` 两处 App 直接 SQLite 引用，未新增豁免。全仓定向搜索未留下旧 Cognia route/store、MCP/store 或 HTTP/scanner 调用旁路。未提交或创建 PR，保留无关修改。

整体仍未达到内部完整：其余存量插件、通用工作流输入映射/恢复与动态使用绑定、首页动作和“说一句”、Character/Agent、MCP Client 接入与生产 Server 授权、完整生命周期与调用记录，以及上述 SDK HTTP 支持，均需继续推进。Cognia 的业务接线不替代这些完成条件，Goal 保持执行中。


## Prologue 本机 HTTP 与 Cognia 实际消费（本轮）

- 根因是消费 SDK 的 Model 目录允许回环 HTTP，而 Session 的 Run 启动使用 HTTPS-only 正则。以原消费 a7e785b8 建立隔离源码工作树，目录和 Run 统一使用 Model 端点校验，Host 继续拥有最终出网授权。没有回退到其他模型或另一条 completion 执行链。
- 同时修正回环判定的实际漏洞：`127.example.com`、`127.0.0.1.example.com` 不是回环 IP。Node/Rust 仅识别准确的回环 IP/localhost 名称，Rust 补齐 URL 解析返回的 `[::1]`。登记不放行网络；无 model 或 loopback 授权的实际请求为零。Run 沿用既有 MODEL_NETWORK_FAILED 错误投影，仍保留可理解的拒绝原因。
- 新包 `vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-loopback-model.tgz` 已成为唯一活动依赖，agent-host、workspace inventory 与 pnpm 锁文件同步。500 个 dist 文件与源码构建、包内和实际安装逐字节一致。`model-loopback.patch` 保存全部未提交源码、合同及测试，反向 apply 检查通过，README 给出基线和重建命令（补丁与当时的 README 在提交 e4bdeb12 的 vendor/prologue-sdk/；2026-10-08 起树里只留补丁的大小、SHA-256、git blob 与来源，见 vendor/prologue-sdk/patch-history.json）。原 Prologue checkout 仍干净；未提交、发布 npm 或替换正式安装版。Rust 判据已编译测试，未将其宣称为原生安装版实操。
- 删除 Cognia 临时 HTTP 禁用及对应过时英文文案；无可用模型时明确提示检查模型设置和服务连接。能力目录、工作台、实际执行继续独立检查元数据；发现不启动模型、不解密。HTTP/HTTPS 均经正式打包 SDK 和 Molis 原 Node 适配器执行。

验证：

- SDK 模型/网络 53 项全部通过（`/tmp/prologue-loopback-tests.log`）。受控 HTTP 服务在 IPv4/IPv6 上实际收到模型请求与认证，正常结果和回放一致；取消保留终态且不再次请求。未授权为零请求；模型登记和启动均拒绝伪回环及非本机明文端点。原 DNS/重定向/密钥来源测试继续通过。
- SDK 相邻 71 项通过（`/tmp/prologue-loopback-neighbor.log`），覆盖真实公共包入口、模块边界、关闭、MCP 工具 wire 和原有上下文整理；Rust 真实目标校验 1 项通过（`/tmp/prologue-loopback-rust.log`）。SDK build/tsc 通过。初次测试书写时修正缺失括号，并按既有公共合同使用 text-delta 与 MODEL_NETWORK_FAILED；未修改运行语义来迎合断言。
- Molis Cognia 动作/HTTP/标准 MCP/Prologue 17 项通过（`/tmp/cognia-loopback-business.log`）：实际 HTTP 与 HTTPS 生成和取消，运行期间停用/断连禁止草稿提交、发现零请求、固定资料版本、原字节、权限及 Home 隔离和跨进程恢复。
- Chrome 4 项全部通过，无跳过（`/tmp/cognia-loopback-ui.log`）。保留原目录导入与历史版本整理的桌面/窄屏回归，新增 1440/390 宽度实际配置本机 HTTP Provider→资料输入→Prologue 生成→审阅→明确保存→刷新→停用→生成禁用但手工保存仍成功。新路径没有注入 completion；请求实际包含所选资料且没有 tools。四张 `cognia-http-{review,disabled}-{1440,390}.png` 已逐张视觉检查，窄屏内容和操作完整、无横向溢出。
- Molis 相邻 Character、Prologue 凭据/流/整理/恢复及首次使用导入 66 项通过（`/tmp/molis-loopback-neighbor.log`）；Cognia、agent-host、Workbench、Local Host 构建与根/SDK 类型检查通过，Workbench 注册边界 2 项通过；diff 检查通过。没有为此次依赖修改重复运行全仓测试，商业模型质量和用户本人验收未进行。

本轮关闭的是 Cognia 已知 SDK HTTP 断点。整体仍未达到内部完整：全部其他插件及其消费者、通用工作流输入映射与恢复、动态场景绑定/用途反查、首页动作与“说一句”、Character/Agent 动作消费、MCP Client 接入与生产 Server 授权、页面外完整生命周期及统一调用记录仍需继续。相邻 Character 回归不等于其动作迁移已完成，Goal 保持执行中。

## Dataset 业务、编辑器与真实 MCP（本轮）

- 插件自身声明 13 项能力：列表/读取/新建/修改/删除、本地加列、显式 AI 加列、CSV 导入/导出、快照列表/保存/回滚、Artifact 发布。完整输入输出合同与权限从插件定义派生，项目 Host 注册原 Store 处理器。12 个原 MCP 名称和 HTTP 保留薄转发，移除 HTTP/旧 MCP 中的业务、独立 Store 构造与模型分支；Host 的原 personal HTTP 分发不再拥有 Dataset 处理器。清除废弃发布端口断言和不再准确的文档。
- Dataset 仍用 Home 下原库及 canonical project_id，保留表/快照 ID、版本和 Artifact 引用。HTTP 组合根注入可信项目、actor 和取消信号，拒绝 query/body 项目漂移；MCP 外部参数不能伪造上下文。读权限不会获得写入、模型或发布权限，AI 可用性同时核对模型、全部所需权限和调用者能力白名单。
- 本地加列不调模型；新 AI 入口明确调用模型并单独要求 model:invoke，只发送用户拟列名请求，不发送表内数据。模型等待期间不占用项目串行队列或持有 Store；返回时校验读取版本，空响应、失败、取消、并发编辑/删除、连接撤销均不追加列。标准目录与编辑器都显示缺模型原因。
- 编辑采用 expected_version 和数据库条件写入；客户端串行保存，等待期间继续编辑会保留并提交下一笔。目录刷新不能跳过确认版本；保存失败保留输入并阻止发布、切表和返回，明确重新读取才丢弃未保存输入。CSV 引号、逗号和多行文本往返正确，文本控件保留多行，筛选不会删除隐藏行；原数字/日期列无法用原生输入表示的字符串保留可见文本。
- 发布固定内容/版本/发起者，再交给原 Artifact owner；Artifact 成功而关联失败时保留意图并显示恢复入口。重启后重用原 Artifact，不把后续编辑覆盖进原版本，不允许其他发起者代为恢复，下一次显式发布可生成新版本。删除表和快照在原库事务完成，待恢复发布不能删除。
- 窄屏实操发现并修复了表格被 flex 压扁、列名挤至不可读、顶栏滚动带偏整片编辑区的问题。表格与顶栏分别在自身容器滚动；错误信息滚入可见区域，草稿仍保留。桌面和窄屏均保留实际编辑与全部操作。

验证证据：

- Dataset 动作/标准 MCP/相邻创作业务与旧 MCP 装配共 41 项通过，`/tmp/dataset-business-verified.log`。使用真实 SQLite、可信调用者、两个项目及隔离 Home；13 项业务均调用处理器验证数据，12 个旧 MCP 别名全部走统一动作。包含 CAS 冲突、事务删除故障、固定发布内容、重启及不同 actor、AI 取消/空结果/失败/等待冲突和准确授权。
- 官方 MCP Client 通过独立 stdio 进程发现并调用全部 Dataset 能力，完成跨进程 CSV、版本、读写授权、项目隔离与重启发布恢复，Artifact 内容由原 owner 查询核对，未生成多余版本。fixture 明确授予权限，不将其算作生产客户端授权配置已完成。
- 模型与动作服务相邻 28 项通过，`/tmp/dataset-neighbor.log`。新增 Dataset 真实本机 HTTP Provider 测试：从原模型/连接配置解析凭据，目录和本地加列零模型请求；显式生成的模型、认证和提示正确，表内数据不外传；调用中撤销连接后结果不落库，目录同步不可用。未用注入 completion 替代此实际网络测试。
- Chrome 1440×950、390×844 及无模型共 3 项实际操作通过，`/tmp/dataset-ui-final.log`。覆盖创建、CSV、多行编辑、筛选保留隐藏行、故意延迟第一笔真实保存响应后继续编辑、快照、显式 AI/本地加列、列类型切换、回滚、实际 CSV/JSON 下载字节、冲突保留和明确重读、发布中断恢复、刷新与 HTTP 项目漂移拒绝。截图在 `.impeccable/review/action-service/dataset-{editor,conflict,recovery}-{1440,390}.png`；已检查桌面和窄屏。模型质量使用可控响应验证，用户本人验收未进行。
- Contracts（前段）、Dataset、Workbench、Local Host 构建及根 tsc 通过；Workbench 注册边界 2 项通过，见 `/tmp/dataset-boundary.log`。修改范围 diff 检查通过。旧测试中 Functions 插件仍存在及固定完整插件名单的断言已改为系统服务移除和实际创作入口边界；原保存实现字符串断言由真实浏览器乱序/冲突与类型切换覆盖。未删除原业务回归，未改生产行为迎合测试。

整体仍未达到内部完整。其余存量插件及其消费方、通用工作流字段映射与恢复、动态用途/真实引用反查、首页动作和“说一句”、Character/Agent、MCP Client 与生产 Server 授权、页面外完整生命周期和统一调用记录仍需继续。Dataset 接线不替代这些范围；Goal 保持执行中，未提交或创建 PR。

## Form 业务、答卷历史与真实 MCP

- 插件声明 11 项业务：列表/读取/新建/修改/删除、本地加题、显式 AI 拟题、标记已发布、提交答卷、结果查询、Artifact 发布。Host 只注入原 Store、共享模型和 Artifact owner；HTTP 与原 10 个 MCP 名称统一薄转发，输入 schema 和权限来自插件定义。移除旧 HTTP/旧 MCP 内的 Store 与业务分发、旧 personal HTTP 处理器及其多余模型查找、废弃发布端口。生产中仅 `form-actions.ts` 构造 Form Store。
- 原 forms/submissions 库和项目分区继续使用；旧 schema 原地补可空快照与请求字段，保留 ID、题目/选项、share_id、版本、答卷内容和 Artifact 身份。新答卷同事务保存问卷版本及题目；结果按提交时题目显示，旧答卷明确无快照，无法匹配的原题号和答案仍可读。六种题型、必填、选项、评分、日期及未知题号在业务 owner 校验。
- 编辑与发布使用 expected_version；客户端保存排队，等待响应期间的新输入继续提交。失败保留草稿，冲突阻止发布、切换和返回；明确重读可取消或确认丢弃。纯输入校验失败修复后可重新保存，不把版本冲突或未知请求结果自动重试。预览提交固定版本，错版拒绝且保留答案；稳定 request_id 支持响应丢失和跨进程重试，修改内容不能复用已保存请求。
- 本地加题零模型请求；AI 拟题单独授权、复用原模型/连接，仅发送用户请求，不发送问卷/答卷。等待不占用 Store，取消、模型失败、空结果、并发编辑/删除和撤权不追加题目。缺模型禁用 AI，仍可本地加题。
- “标记已发布”保持原本机状态和 share_id 语义，不提供外网公开填写链接。Artifact 只保存问卷，固定发布意图保留可信 actor 和源版本；关联失败可重启恢复原版本，不能把后来编辑塞入旧快照。问卷和答卷删除在原库事务完成，待恢复发布不能删除。
- 实操修复窄屏题目输入被操作按钮挤窄、历史说明误用两列布局、修复输入后仍残留旧警告的问题。题目占整行，排序/删除保留触摸尺寸；补完必填项才清除必填警告，成功保存清除对应错误，发布待恢复说明仍保留。

验证证据：

- Form 动作/标准 MCP/相邻创作业务/旧 MCP 装配与实际模型配置共 52 项通过：`/tmp/form-business-final.log`。覆盖全部 11 项处理器、10 个旧名、六种题型、两个项目/Home、读写/模型权限、旧 schema 原地升级、CAS、删除事务故障、固定发布/actor/重启以及 AI 各种终态。相关用例在 `tests/form-actions.test.ts`、`tests/form-mcp.test.ts`、`tests/host-configured-text.test.ts`。
- 加强后的标准 MCP 用例另行通过：`/tmp/form-refine-mcp.log`。两个独立写入进程同时提交相同请求，返回同一答卷且数据库只有一行；随后仍验证修改题目、进程重启、原提交恢复与固定 Artifact 发布恢复。该项是上述 MCP 用例的补充复验，不累计为新的独立测试。客户端权限由 fixture 明确授予，生产授权配置仍未完成。
- 真实配置模型测试经共同连接 owner 发出实际本机 HTTP 请求，验证认证、所选模型及提示，不向模型发送问卷数据；发现与本地加题不请求模型，撤销连接后返回结果不落库。浏览器模型内容使用受控响应，不能当作商业模型质量验收。
- Chrome 1440×950、390×844 和无模型共 3 项通过：`/tmp/form-refine-ui.log`。覆盖六题型编辑填写、先保存成功再丢失响应后的提交恢复、改题后原答卷、延迟保存响应期间继续编辑、选项修复后继续保存、编辑和预览冲突保留、重读取消/确认、AI/本地分离、Artifact 回写失败后继续编辑再恢复、刷新、旧历史和 HTTP 项目漂移拒绝。已视觉检查 `form-editor-390.png`、`form-recovery-390.png`、`form-history-1440.png`；其他路径截图同在 `.impeccable/review/action-service/`。这是桌面 Chrome 和窄屏模拟实操，未进行实体手机或用户本人验收。
- Form、Workbench、Local Host 构建通过（`/tmp/form-refine-{plugin,workbench,host}.log`），根 tsc 与 Workbench 注册边界 2 项通过（`/tmp/form-refine-{types,boundary}.log`）；范围内 diff 检查通过。没有提交或创建 PR，无关修改保留。

整体仍未达到内部完整。其余插件及消费方、通用工作流字段映射与恢复、动态用途/引用反查、首页动作和“说一句”、Character/Agent、MCP Client 与生产 Server 授权、页面外完整生命周期和统一调用记录仍需继续，Goal 保持执行中。

## PPT 业务、编辑器、导出与真实 MCP

- 插件声明 7 项能力：列表、读取、新建、编辑、删除、JSON 导出、Artifact 发布。原 HTTP 和六个旧 MCP 名称薄转发；导出由动作读取已保存演示稿，浏览器和外部调用取得相同 JSON，不声称支持 PPTX。输入明确幻灯片、要点、备注、配色和版本；旧省略字段保留原默认语义。
- 原 presentations 表及 ID、幻灯片顺序/身份、配色、备注、时间、版本和 Artifact 引用保留，仅原行增加待恢复发布信息。Store 条件更新防止跨进程覆盖，待恢复发布阻止删除。发布保存固定内容/actor/版本，经原 Artifact owner 核对并恢复，原快照和后来编辑分别保留。
- 客户端保存串行排队，等待时继续输入可正确提交；失败保留草稿并阻止发布、导出、返回或切稿。明确重新读取提供取消/确认，目录刷新不替换已确认版本。移除旧忽略保存错误后继续执行的路径；修复移动非当前幻灯片时把当前页字段写入被移动页的问题。窄屏顶栏独立滚动，配色按钮具有 44px 触摸尺寸，预览备注保留换行。
- 删除 PPT 原 HTTP/旧 MCP 内的业务分发和 Store 构造、personal HTTP 发布分支及独立发布端口、废弃 requirePptArtifactPort/rememberArtifact。最后一个创作插件迁走后，旧 `createBoundProjectStoreAdapter` 整体删除；MCP Server 和 Web 请求不再传各插件发布回调或导入空 Artifact 模块。必要旧工具名继续从插件 action 定义派生 schema/权限并调用同一执行核心。

验证证据：

- PPT 动作、标准 MCP、相邻创作与旧 MCP 装配共 34 项通过，无跳过：`/tmp/ppt-business-final.log`。覆盖 7 项处理器和六个旧名、真实数据库业务结果、输入拒绝不写入、项目/Home/权限、旧 schema 原地升级、读取/导出一致、发布中断/actor/重启/后续新版本。新增生产旧 MCP 入口验证：未绑定隐藏、明确工具开关后绑定可创建/列表，项目由可信上下文注入。
- 官方标准 MCP Client 使用独立 stdio 进程发现七项能力，两个写入进程同时改同一读取版本，仅一个成功；只读/其他项目拒绝写入或跨区读取。实际 JSON 等于库内记录，发布回写失败后换进程恢复原 Artifact，后续编辑保留且无额外版本。fixture 权限明确授予，不替代尚未完成的生产全量授权配置。
- Chrome 1440×950 与 390×844 两项实操通过：`/tmp/ppt-ui-final.log`。创建两页、要点和多行备注、切页、移动非当前页、加页/删页、配色、延迟真实保存响应后继续输入、实际下载文件字节/对象、编辑冲突阻止发布/导出/离开、重读取消/确认、Artifact 失败后继续编辑及页面重启恢复、项目漂移拒绝、最终删除均成功。`ppt-{editor,conflict,recovery}-{1440,390}.png` 位于 `.impeccable/review/action-service/`；桌面/窄屏编辑、冲突和恢复已视觉检查，窄屏为 Chrome 模拟，实体手机与用户本人验收未进行。
- Contracts、PPT、Workbench、Local Host 构建通过；根 tsc 与 Workbench 注册边界 2 项通过：`/tmp/ppt-{contracts-build,plugin-build,workbench-build,host-build,types-final,boundary}.log`。范围内 diff 检查通过。初次构建修复了适配文件路径的机械替换和 SQL 可选类型错误，并清除已无用途的参数/import；后续构建通过。原业务回归保留，旧 saveSeq 字符串断言由浏览器真实并发/冲突覆盖取代。

整体仍未达到内部完整。其余插件与平台服务、通用工作流映射及恢复、动态用途/引用反查、首页动作和“说一句”、Character/Agent、MCP Client 和生产 Server 授权、页面外生命周期及统一调用记录仍未完成。PPT 接线不替代这些范围；Goal 保持执行中，未提交或创建 PR。

当时的接续位置为 Images；实际迁移结果见下一段。

## Images 九项业务接线、跨进程任务与失效连接（2026-09-25）

插件定义 Home 连接列表/保存/删除，项目任务列表/启动/读取/取消/删除及图片读取共九项动作，包含完整输入输出合同和权限。Host 提供原 ImagesService 的生命周期与原 Connector 端口，Kernel 执行同一处理器。原 HTTP 路径仅薄转发，图片下载将同一动作的 Base64 还原为真实二进制；标准 MCP 通过通用导出获得九项动作。未增加生图业务副本或第二份任务、图片、凭据数据。

移除原 HTTP 文件中的服务 Map、openImages/closeImages 和 personal-native-plugin-http 里的旁路。服务由 Host 持有，同进程按 Home 共享；关闭一个持有者不打断另一个。跨进程复用原 jobs，加 runner_id 和各执行者独立 SQLite 锁；OS 退出释放锁，恢复仅标记已退出执行者的任务。原全局锁改为共享兼容锁，拒绝仍在运行的旧版本独占执行器；旧 schema 无 runner_id 可原位升级。请求去重与 Home 两任务上限在原库事务裁决；跨进程取消写入原状态，执行者观察终态并中断网络等待。没有自动重试、重复计费或另一套任务状态表。

连接列表和旧引用采纳不解密密钥；共享 Connector owner 采用 sealed-entry 存在性判断，执行时才解析真实凭据。原 images:<id> 引用自动进入同一连接目录，列表不返回密钥或密文。撤权在启动及厂商响应后检查，失效不保存新图、不回退本机匿名请求。工作台保留失效服务/账号、说明原因、禁用生成；选择其他账号后修改地址不会把选择重置。复用历史提示词也保留原服务引用。浏览器真实操作发现并修复原账号下拉框 esc 未定义导致管理弹窗无法打开的问题，并清除刷新后的过期“可以开始生成”提示。

验证证据：

- `/tmp/images-all-business.log`：38 项通过，覆盖原 Provider 协议、实际图片字节、九项动作、Home/项目/权限、请求身份、撤权、旧密钥引用与真实授权头、关闭/恢复、Connector 回归、标准 MCP 及 Web/MCP 并用。
- `tests/images-concurrency.test.ts` 使用真实 Web Server、独立标准 MCP SDK 子进程和受控 HTTP Provider；并发相同 request_id 只调用一次，原库限制全 Home 并发，跨进程取消确实断开原请求，SIGKILL 后仅相应任务 interrupted、Web 活任务保留，重启重放无额外厂商请求。
- `tests/images-service.test.ts` 覆盖旧 schema 无 runner_id、旧独占进程仍在时拒绝启动及新共享进程在运行时旧执行器无法接管；存量配置和任务身份保持。
- `/tmp/images-ui-final.log`：3 项真实 Chrome 操作通过，包含原完整生成/刷新/下载/故障恢复/删除路径，以及 1440px、390px 撤权、改绑、服务消失、手动选择备用服务、生成和下载。输出为受控 PNG，未调用付费厂商。
- 截图位于 `.impeccable/review/action-service/images-{revoked,connection,missing,result}-{1440,390}.png`；已查看桌面失效状态、窄屏连接及结果画面。
- Images、Workbench、Local Host 构建通过，日志 `/tmp/images-{plugin,workbench,host}-final-build.log`；根类型检查 `/tmp/images-types-final.log` 通过；两项注册边界检查 `/tmp/images-boundary.log` 通过。

这证明 Images 的业务路径和并用行为，不等于生产客户端授权、原生插件完整生命周期或通用工作流配置已经完成。Images 目录声明能力合同，具体所选连接可用性在连接选项和执行时校验；通用参数配置/可用性呈现仍随整体消费方推进。用户本人验收、真实付费厂商验证未进行。

整体 Goal 保持执行中。其余插件与平台服务、通用工作流字段映射和恢复、动态用途/引用反查、首页动作与“说一句”、Character/Agent、MCP Client 接入及生产 Server 授权、页面外完整生命周期、统一调用记录和最终旧代码收敛仍须继续。后续 Alchemist 的实际核对和修改见下一段。

## Alchemist 真实入口盘点与多进程执行前置修复（2026-09-25）

核对发现旧 src/routes.ts 的八项演示操作不是当前产品全貌。Host 实际使用 Studio app，41 个业务入口由 src/studio/server/api 注册；旧演示写入已返回 410，读取用于保留历史数据。原生工作台 client.ts/client-flows.ts 消费 Studio 接口。迁移必须覆盖以下分组，不能按旧演示路由生成一个“已迁移”的空壳：

| 当前 API 分组 | 数量 | 真实消费/后续接线 |
| --- | --- | --- |
| bootstrap、方向创建/编辑/归档、探索启动/读取 | 6 | 目录、方向编辑与炼化进度 |
| 候选读取/保留/丢弃/恢复、Idea 版本 | 5 | 卡片比较、已保留想法及历史版本 |
| 讨论消息读写 | 2 | 当前对象及历史讨论、明确保存失败回复 |
| 模型目录、运行设置读写与验证 | 4 | 共享 Host 模型，保留固定模型与预算 |
| 研究工作区、计划、启动、取消及事件 | 5 | 双 Lens、原检查点与 SSE；需结构化事件动作及 SSE 适配 |
| 正式决策列表、版本工作区与保存 | 3 | 证据门槛和 Idea 版本决定 |
| 注释与 Memory/提案 | 9 | 引用版本、反馈、Taste、Playbook 和实际应用 |
| 市场来源、报告、运行、机会保存/转方向 | 6 | 原公开来源与材料 owner |
| 工作区导出 | 1 | 原 JSON/ZIP 字节与下载 |

新动作身份、输入输出和权限仍需逐项定义；基础健康检查不视为业务动作。旧演示只读 list/get/完整历史导出也需薄转发，保留原数据和标签，不恢复已关闭的演示写入。

已修复的实际前置缺陷：JobRunner 原始租期为 30 秒，LocalWorker 没有续租；第二个运行时会把仍在生成/研究的任务判成过期并恢复，旧执行者也可能回写业务状态。现在执行期间续租，取消/租约丢失会中断原等待；所有 Brainstorm、Lens、Pulse 的业务写入通过原数据库事务同时检查归属。旧执行者不能覆盖接管后的结果或失败记录。claim/enqueue/recovery/checkpoint/cancel/finish 与事件记录使用原库事务，状态和事件写入失败一起回滚。保留原安全检查点和 generating/call_dispatched 防重发语义，没有新增任务状态副本。

验证：

- `/tmp/alchemist-lease-tests.log`：24 个文件、62 项插件测试通过；新增 lease-ownership 六项覆盖超过原租期的持续执行、远端取消与迟到写入、失去租约后的真实 Brainstorm 恢复，以及 SQLite 触发器注入事件写失败后的原子回滚。
- `/tmp/alchemist-host-regression.log`：25 项通过，包含原 Host/运行时/旧插件回归及新 `tests/alchemist-worker-process.test.ts`。两个独立 Node 进程共用真实 Studio 数据库，受控 HTTP 模型持续超过两个原租期，仍只发一次请求并保存一张卡；SIGKILL 原执行者后，另一进程恢复为 AI_CALL_INTERRUPTED，未增加模型调用，已完成卡片保持。
- `/tmp/alchemist-build.log` 插件构建、`/tmp/alchemist-types.log` 根类型检查通过。未改 UI；本轮未重复浏览器验收。测试夹具仅使用隔离数据库和受控模型，不访问用户账号或付费服务。

下一步仍是 Alchemist 全部业务接线，不转去另一个插件：原 ApiDependencies/local-runtime 是业务组合边界；将原处理器与完整动作合同关联，Host 管生命周期、模型/搜索端口与可信项目，HTTP/SSE/导出和标准 MCP 消费同一执行器。当前 HTTP studios Map/closeAlchemist、Hono 直通、旧演示 handler 仍未收敛，不能把此轮续租修复称为 Alchemist 迁移完成。全部其他插件、系统产品与通用消费方仍保留在 Goal 中。

## Alchemist Studio 41 项业务合同与统一执行器（2026-09-25）

- 插件自身声明全部 41 项 Studio 动作，输入输出 Schema 从同一 Zod 合同派生；包含实际对象正文、版本、来源、研究报告与证据、校准应用引用、后台任务状态，不用一个通用 HTTP 代理代替业务能力。模型调用与公开来源抓取有单独权限声明。项目与调用者不允许通过业务参数覆盖。
- 原 14 个业务 route 文件已移除，方向编辑/归档和探索复用等已有行为迁到操作层。`api/action-routes.ts` 仅做固定路径映射、原成功状态码、SSE 与下载编码。运行时允许 Host 注入 Kernel 调用口，独立 Studio 使用同一个插件执行器；没有复制数据库、任务表或结果存储。
- 新事件动作以 jobId 和 after 返回原事件、状态与游标，并在原库同一读取事务中获取，SSE 消费它。研究取消仍接收 `run.jobId`，仅取消 Lens；合同明确区分 run.id，未声称通用取消所有任务。导出返回原 JSON/ZIP 字节的 base64，HTTP 还原下载。机会转换保留 created 结果，HTTP 维持首次 201/重复 200。
- 讨论保留原上下文、历史和启用的 Taste。取消后的迟到模型回复不保存为成功，用户输入与失败状态仍可回看。未配置模型的消息保留原 runtime_unavailable 语义。
- `tests/alchemist-actions.test.ts` 验证真实仓库数据的完整方向→炼化→卡片→双研究→决策链路，以及注释→校准提案→应用/停用、Taste→讨论、市场来源→报告→机会→方向、取消、事件和导出；包含 HTTP/函数交叉读取、Kernel 项目/权限/输入拒绝、重复保留/应用不产生第二份业务对象、关闭观察不中止任务和迟到回复拒绝。
- `tests/alchemist-mcp.test.ts` 用标准 SDK 启动独立 stdio 进程，验证 41 项能力目录、只读/写入和项目隔离、后台生成、消息联合输出、真实导出与重启后身份/数据保留。初次验证暴露联合对象被 MCP 多包一层 result，已在合同中显式标记 object 并复验。测试使用显式 fixture 授权和受控模型，不代表生产客户端授权管理完成。
- `/tmp/alchemist-actions-plugin-tests.log`：24 个文件、62 项插件测试通过。`/tmp/alchemist-actions-business.log`：4 项新的业务集成测试通过。`/tmp/alchemist-actions-combined.log`：30 项合并回归通过，覆盖新动作/MCP、原 Host、运行时、旧插件和双进程恢复。`/tmp/alchemist-actions-build.log` 插件构建、`/tmp/alchemist-actions-root-types.log` 根类型检查通过。
- `/tmp/alchemist-actions-browser.log`：原生浏览器完整流程通过，包括卡片、研究材料、讨论、注释校准、决策、Taste、设置、JSON/ZIP 下载、市场机会以及缺模型失败恢复。1440/390 两种尺寸、明暗主题截图写入 `.impeccable/review/action-service/alchemist/`，未覆盖已有 spec 截图；已检查桌面明色与窄屏暗色，无横向溢出。只使用隔离 Home 与受控数据，无用户账号或付费服务调用。

当时尚未完成的接线（后续结果见下段）：生产 `alchemist-native-plugin-http.ts` 的 studios Map/closeAlchemist 仍存在，`MolisWorkLocalHost` 未注册 Alchemist provider；当前 HTTP 只完成内部业务归一，尚未通过 Host Kernel。下一步必须把运行时、搜索和 Prologue 的生命周期交给 Host，补可信 actor（目前 Studio actor-local/Prologue web-user）、同 Home 多 Host 释放规则、旧演示只读动作，以及生产 HTTP/MCP 的同源接线与验证。其余插件和系统功能的全量 Goal 保持不变。

## Alchemist 生产 Host、可信身份与旧演示清理（2026-09-25）

生产 Host 现注册 44 项能力。HTTP 仅保留参数、状态码、SSE/下载；运行时按 Home/项目由多个 Host 共同持有，最后一个 owner 释放才关闭，目录发现不打开 Studio 数据库或启动任务。可信 actor 通过调用上下文及原 job input 保留，后台恢复后仍使用发起身份；并发讨论不串身份。Prologue 默认模型选择复用原模型和连接 owner，发现不解密/探测，生成前后核对配置，实际 session 使用可信 actor。搜索端口从 HTTP 移到 Host，自有数据库及 SEL 规则不变。

旧演示新增 list/get/export 只读动作，原 IDs、日期、决定理由和内容保留；已删除旧 routes.ts、route-handlers.ts、演示生成器及 Store 写入方法，旧 HTTP 写入继续 410。包的 dist 清理后重新构建，避免删除源码后仍发布旧 JS。

验证：/tmp/alchemist-production-regression.log 的 30 项通过，覆盖业务、Host、标准 MCP、原运行时、可信 actor、两个 Host 并用、重启恢复及独立进程租约；/tmp/alchemist-production-plugin-tests.log 的 24 文件/62 项通过。/tmp/alchemist-production-browser.log 的真实 Chrome 工作台路径通过，截图在 .impeccable/review/action-service/alchemist-host/；已查看 1440 明色及 390 暗色。插件/Host 构建及根类型检查通过，另以 /tmp/alchemist-clean-build.log 验证清理产物后的构建。使用隔离 Home 与受控 AI，无用户账号或付费请求，用户本人验收未进行。

标准 MCP 测试改为真实 Host，但仍使用显式 fixture 权限。生产逐客户端授权、插件停用对后台任务的完整治理和通用参数可用性仍未完成。其余存量插件、工作流、用途/引用、首页、Character/Agent、MCP Client 和统一调用记录继续保留在全量 Goal。

## 生产 MCP 新动作入口的明确授权（2026-09-25）

此前新动作在正式 LocalMcpServer 中始终使用空 permissions，只有 fixture 主动授予时才能使用。现在复用 config/mcp-tools.json 保存 action_grants：客户端来自宿主 runtime 身份，准确绑定项目或 Home、能力 ID/版本、提供方和已接受权限。目录重新发现及每次调用读取配置；进入 Host 队列后，Kernel 在实际调用前再次读取授权。升级、换提供方或权限变化不能沿用旧授权，授权检查期间重新加载提供方也拒绝原调用。没有自动为声明授予权限，没有新增能力注册表。

Host 增加仅组合根可用的只读 inspectActions，从同一注册表查看未授权元数据；ActionClient 的发现和调用仍受权限限制。新增 allowed_actions 精确约束版本与提供方，旧 ID 名单不能绕过；新授权不使相同权限的其他能力自动可用，也不自动授予依赖。新动作的业务字段由自身 Schema 验证，旧 Goal 工具的 payload/actor 字段启发式不再误伤未知插件，但旧工具原有身份保护保留。

本机管理 GET/POST /api/settings/mcp/actions 已接在原同源/控制令牌门后。保存从实际注册定义取得权限并检查当下可用性，不接受请求自填权限；来源消失后的旧记录保留，可继续撤销。现有 MCP 开关修改保留 action_grants，同进程管理写入按序执行、文件原子替换；无效/冲突配置拒绝覆盖并保留原文件。此处采用原本机管理 writer；未声称支持多个管理进程同时改写配置。

验证：

- /tmp/mcp-grants-final-tests.log：69 项通过，覆盖新授权/HTTP/生产标准 MCP、动作依赖/并发、Host、正式 Runtime 的未知插件、系统判断、旧插件 MCP、Session 活动和原 MCP 回归。
- 后续加强配置保留、执行时重读定义和连接检查并清除无用适配创建后，/tmp/mcp-grants-refined-tests.log 的 9 项复验通过（6 项授权专项、3 项系统判断，与上述用例重叠，不累计）。真实标准 SDK 客户端通过独立 stdio 的正式 LocalMcpServer 读写 Alchemist，两个客户端/项目不能借用权限，撤权在原连接和重启后生效，数据与各自可信 actor 保持。
- 本机 Web 实测发现随机 ID 的新插件，未授权时仅能检查元数据，缺 token/自填权限/断连拒绝授权；授权后经正式 MCP 分发真实执行其声明的 payload 参数，移除 provider 后保留并撤销原记录。Kernel 测试以真实排队交错验证撤权不产生副作用，以及检查授权期间替换提供方不执行新处理器。
- Contracts、Kernel、Local Host 构建通过，根启动器类型检查通过；日志 /tmp/mcp-grants-{contracts,kernel,host,types}.log。

这只是新动作入口的生产授权接线，不能标记 MCP 或整体 Goal 完成。授权 UI 尚未接入；能力库 Web 调用者仍有手写权限集合待收敛；旧兼容别名/平台工具继续沿用原开关与权限，尚未完全纳入逐客户端规则。MCP Client、工作流、Character/Agent、其余存量插件、全平台后台生命周期和统一调用记录仍继续。没有改动本轮产品界面，未重复浏览器验收或宣称用户本人认可。

## 对外接入的真实客户端授权界面（2026-09-25）

系统岛「对外接入」现从同一 Host 注册表展示新动作。选择客户端及 Home/项目后，可搜索、筛选、检查权限并授权/撤销；已保存的未知客户端会保留在选择器里。Runtime 名称来自现有适配器描述，不在 UI 维护白名单，不探测账号或执行插件业务。

授权读模型分别呈现未授权、已授权、授权已撤销、暂不可用、权限变化和原能力失效。权限变化不能自动扩大已保存授权；移除 provider 或删除项目后保留原引用，并允许撤销。默认开放的无额外权限系统查询支持显式拒绝记录，项目中的该客户端也遵守 Home 的撤销，其他客户端不受影响。

界面保存复用原同源/控制令牌 API 和 config/mcp-tools.json。保存期间禁用相关控件；服务拒绝时保留原状态；实际写入成功但响应丢失时提示“保存结果未确认”，刷新后从真实配置恢复。生产脚本已删除原型专用的模拟授权分支。旧工具仍在明确标注作用于所有客户端的折叠区，不伪称它们已服从新授权。

验证证据：

- /tmp/mcp-access-service-final.log：5 个测试文件、28 项通过，覆盖新授权管理/精确权限/撤销、生产 MCP、系统能力页和原 MCP 回归。包含随机 ID 插件的真实注册、断连、权限变化、提供方移除、实际项目删除后的保留与撤销。初次并发组合中生产 MCP 因 40 秒超时被取消；单独复验通过，最终以单文件并发的完整 28 项复验关闭该验证缺口。
- /tmp/mcp-access-browser.log：真实 Chrome 端到端 1 项通过。原生控件选择客户端/项目并保存授权，正式 stdio LocalMcpServer + 官方 SDK 创建 Alchemist 方向，原 Host 读到相同对象；第二客户端不能调用，撤销后原连接拒绝写入。另覆盖写入后响应丢失和刷新、随机 provider 的权限变化/断连/移除、空搜索、插件文本转义、默认系统查询的撤销/恢复、英文状态及键盘展开权限详情。
- Workbench/Local Host 构建、根启动器类型检查通过，日志 /tmp/mcp-access-{ui-build,host-build,types}.log。定向 diff 空白检查通过。
- 真实页面截图在 .impeccable/review/action-service/mcp-access/，1440/390 两种尺寸与明暗主题，以及窄屏权限详情。浏览器验证无横向溢出、窄屏可见操作按钮至少 44px。设计 detector 对本轮目标执行一次，结果为空；这不替代界面复核。

只使用隔离 Home、项目和临时客户端，无用户凭据、远端账号或模型调用。用户本人验收未进行。尚未完成旧工具逐客户端治理、MCP Client、通用工作流、动态用途/真实绑定跳转、首页与 Character/Agent、其余插件、全平台后台生命周期和统一调用记录，整体 Goal 保持进行中。

独立 UI 复核发现并修复 P1：选择新客户端/项目但未加载时，旧列表原本仍可操作。现在范围变化立即隐藏旧结果，明确提示先「查看能力」，搜索及变更处理器也拒绝旧范围操作；恢复已加载选择可继续。浏览器新增客户端/全局范围切换及旧 DOM 操作不写授权的回归，完整端到端再次通过；新增窄屏 pending-scope 截图。Reviewer 对这一项判定 resolved，SHIP 仅覆盖本 UI 切片。之后系统能力页/管理 API 两项定向复验通过（/tmp/mcp-access-scope-regression.log，与 28 项重叠，不累计），类型检查再次通过。已同步 surface brief、中文/英文 MCP 说明及插件开发/SDK 文档。

## Artifacts 网页与生产 MCP 接线（2026-09-25）

插件声明 `artifacts.browse/read/export/import.file/import.external/import.sources/goals.embeds/references.open` 八项动作；Host 注入原数据库 owner、可信 actor、Ledger 和受限文件读取器。已移除 HTTP 与 Goal 渲染中的直接读取/导入业务调用；传输层保留原 URL、下载编码、请求大小及错误语义。版本引用只包含 artifact_id/version，修正原读取模型把整条记录塞进引用字段的问题。

目录和调用遵守项目插件启停；可读取 Goal 本身时，即使成果插件停用，页面仍显示 Goal 和明确的成果不可读取原因，原 Ledger 引用不删除，重新启用恢复原版本。显式单数据库测试入口沿用其配置的 board，不要求伪造项目目录；正式项目仍逐次查安装记录。文件引用优先采用 Evidence 原始工作区，其次当前项目工作区，并保留服务启动者明确配置的 projectRoot 回退，不接受业务输入覆盖路径。

文档抓取使用实际 Host 的 Home 上下文。外部抓取完成、写入前再次检查调用授权、插件状态与取消信号；Notion 刷新等待按 Home 与连接引用隔离。同源内容复用、原 producer、personal scope、metadata、固定版本、HTML 原文和原限制均保留。外部来源目前仍使用该 Home 的既有默认账号选择，显式 connection_id 未完成。

验证证据（重叠复验不累计）：

- `/tmp/artifacts-actions-regression.log`：原模块/引用/受限插件客户端及 HTTP 共 23 项，22 通过、1 项暴露停用插件 HTTP 应返回 404 的映射问题；修复后 `/tmp/artifacts-consumers-final.log` 的浏览/导入/引用/历史 21 项通过。其另 1 项旧剪贴板浏览器用例因未进入当前工作视图失败，已修正实际操作路径并由下述浏览器复验关闭。
- `/tmp/artifacts-integration-final.log`：2 项 Host/生产 MCP 与外部导入等待测试通过。官方 SDK 经正式 LocalMcpServer 持久授权导入、读取，Host 读到同一记录和可信 actor；陌生客户端、撤权、项目漂移、伪造 producer/actor/root、缺外部读取权限被拒绝。重启、停用恢复和原文件字节验证通过。等待测试使用受控 Google Docs HTTP 响应，撤权、停用和取消均无落库，正常调用保存原文。首次 MCP 测试受 60 秒用例时限取消，延长多进程测试时限后该用例 40 秒通过；不重复计算。
- `/tmp/artifacts-new-tests.log` 中 OAuth 六项通过，包含两 Home 真正交错刷新、同 Home 合并请求、各自 token/refresh 持久化。该日志早期另两项 Artifacts 测试失败后已按上述结果修复，不把整个早期运行宣称全绿。
- `/tmp/artifacts-browser-final.log`：2 项真实 Chrome 用例全部通过。1440/390 导入真实本地文件、重复导入复用、原文读取与导出 JSON、显式 Goal 固定引用、停用仍可读 Goal/重新启用恢复，以及真实剪贴板拒绝/成功及原事实不变。截图 `.impeccable/review/action-service/artifacts/read-{1440,390}.png` 已查看。沿用既有布局；桌面旧独立目录左上导航有轻微重叠，保留为产品收尾项。窄屏为 Chrome 模拟，未做实体手机或用户本人验收。
- 浏览器首次运行未显式关闭默认模型配置，在 Goal 页面阶段之后的收尾等待挂起；未追踪到具体等待请求，已终止该隔离测试进程。正式复验显式禁止模型调用，使用正式项目启停策略，清理活动 HTTP 连接后正常结束。不将首轮挂起计作通过，也不把模型配置直接断言为根因。
- `/tmp/artifacts-goals-routes.log`：5 项 Goal 路由、编码、集合与缺失语义全部通过。`/tmp/artifacts-configured-root.log`：实际目录项目的显式工作区文件读取及原导入/隔离/导出用例通过；最后补查发现历史 Evidence 使用不带 project:// 的相对路径，现动作接受原两种格式并交给相同受限读取器，两种读取及越界/HTTPS/file URL 拒绝已实测通过。
- Artifacts/Local Host 构建和根启动器类型检查通过：`/tmp/artifacts-actions-build.log`、`/tmp/artifacts-host-build.log`、`/tmp/artifacts-root-typecheck.log`；定向 diff 空白检查通过。

下一段迁移范围已明确：`PluginArtifactClient` 当前是同步的 public SDK，仍直接消费原模块；`PluginInputsClient`/`PluginOutputsClient`、Characters、Shelf、Coding 的 context/material/plan/report/changeset 及 routes 依赖它。实际检查发现 Characters 发布依赖同步事务，因此改为共用 Kernel 的显式同步调用，保留真实消费者同步合同，保留 Manifest type/schema、producer 签名、个人 owner 与实时运行授权检查。内部 Wiring graph 用于判断固定引用状态的 owner 查询需与插件可调用的业务入口区分；不能为了统一而向普通 MCP 开放任意 producer 注册，也不能遗留两套公共读写实现。此段尚未实现，整体 Goal 继续进行。

## 插件成果 SDK 共同执行与存量消费者（2026-09-25）

上一节的 SDK 待办现已接通：Host 根据任意插件 Manifest/安装实例自动注册私有 `sdk.artifacts.<install_id>.read/publish`，作者客户端只做绑定和转发，实际业务读写仅在已注册处理器内执行。同步和异步派发复用同一 CapabilityRegistry、权限/作用域、注册实例与输入输出校验；没有第二份目录、数据库或成果身份迁移。同步处理器需明确声明，公共动作不能借 Host 同步入口绕过异步调度；异步授权/Host 策略/依赖策略均先拒绝，不启动业务处理器。

保留作者 SDK 的同步合同，角色的修订检查与发布继续位于原同步事务；Inputs/Outputs、Characters、Shelf、Coding 的材料、Goal 上下文、计划、报告和变更集实际读写已经经过共同 Kernel。安装、启动失败、崩溃、停止失败和重启分别清理注册并撤销旧客户端。能力目录反映真实 Runtime grant，私有 SDK 不出现在普通用户/MCP 工具中。Web 和插件开发入口必须显式注入同一 Host 的注册与同步调用端口；独立测试显式共享一个 Kernel，生产不创建兜底服务。同步处理器声明属于可信实现合同，不能把意外 Promise 被拒绝误称为自动回滚其已发生的副作用。

验证证据（存在交叠，不相加）：

- `/tmp/artifacts-sdk-regression.log`：13 项通过，覆盖真实插件启动、崩溃恢复、固定版本/类型/owner/grant、输出接线、消费者失效及原绑定恢复。
- `/tmp/artifacts-sdk-integration.log`：21 项通过，覆盖共同 ActionService、同步约束、Host、Characters 导入/发布 HTTP、Coding 角色引用及 Shelf 原文到 Coding。
- `/tmp/artifacts-sdk-consumers.log`：32 项中 31 通过；包括 Coding 原始目标、材料、计划、报告、子任务、工作树、升级、Builder、打包公共 SDK 的新开发目录样例及 Files/Git/Diff/Text Stats 接线。变更集测试原计数器把 Files 的项目浏览设置刷新也算成 Agent 读取，已按其业务断言改为只统计 Agent 读取；没有修改生产路径来放宽断言。
- `/tmp/artifacts-sdk-final.log`：上述变更集复验及原成果浏览/导入、角色事务、受限 SDK 共 24 项通过。新增验证 SDK 同步调用与目录中的异步调用读取同一记录，跨安装身份及伪造字段拒绝，缺 grant 的目录状态不可用，MCP 不能发现私有 SDK。
- `/tmp/artifacts-sdk-host-final.log`：11 项通过，包含最终同步权限/Host 公共入口隔离/异步依赖拒绝、正式 LocalMcpServer 与官方客户端的真实成果读写及外部等待撤权、真实目录项目角色发布、Coding 原始目标恢复、插件生命周期。
- `/tmp/artifacts-sdk-lifecycle.log`：最后补充崩溃、停止失败和启动失败后注册表确实清空，2 项复验通过。
- Contracts/Kernel/Artifacts/Local Host 构建通过；最后 Host 构建 `/tmp/artifacts-sdk-build.log`、根启动器类型检查 `/tmp/artifacts-sdk-types.log` 通过，定向 diff 空白检查通过。原生 API 签名保留，插件开发/SDK/Kernel 文档已同步。

本轮无视觉变更，没有重新进行浏览器或用户本人验收；没有真实外部账号或商业模型联调。Artifacts 的显式账号选择、其余插件业务注册与消费迁移、通用工作流、动态用途、首页、Character/Agent、MCP Client、后台独立生命周期、统一调用记录及旧工具治理继续，整体 Goal 保持 active。


## 项目插件后台启动、Diff/Text Stats 动作与嵌入发现（2026-09-25）

将七个项目 Runtime 插件的装配、缓存和关闭从 Coding 页面移到 `project-plugins.ts`。Host 的项目动作发现、检查和调用复用同一个实例，首次从 MCP 发现无需访问工作台；并发发现不重复注册，晚到的模型/PTY/工作目录适配器不改变绑定的用户、Home 和项目。关闭清理所有注册，失败启动清理已经启动的部分；某个 stop 失败不会阻止其余插件退出。

Diff 新增 `diff.state` / `diff.compare`，Text Stats 新增 `text-stats.state` / `text-stats.count`。原 HTTP 只转换输入并调用插件绑定的共享 ActionClient，业务处理器留在插件。绑定客户端仅调用自身声明动作，Host 固定本地入口身份；权限和 schema 由同一 Kernel 校验，停止/崩溃/启动失败后旧客户端（含零权限纯计算）不能随新实例恢复。

移除 Web 中 `embeddedCodingCompanions` 名单；Coding/Files/Git 通过 Manifest `ui.embedded_plugins` 声明嵌入读取器，HTTP gate 与动作策略共用传递解析。该关系不创建导航项或授予权限；未知缺失依赖不被猜测，循环安全，停用最后父入口会使能力不可用并保留授权引用。目录不存在的独立数据库/已删除项目不具备项目插件安装，返回不可用而不让 MCP 进程崩溃；其他目录错误仍上抛。插件版本及明确兼容来源同步更新，成果身份/端口/历史未改。

工程证据：

- `/tmp/companion-declarations-build.log`：Host 依赖图构建通过；`/tmp/project-plugins-final-build.log` 与 `/tmp/companion-tests-typecheck.log`：Host 构建及新增测试严格类型检查通过。
- `/tmp/companion-consumer-regression.log`：54 项通过，覆盖 Files/Git 实际 HTTP、固定快照及 Git 审阅历史、Character 发布、Coding 真实路由/接线、同步 SDK、场景和升级、Diff/Text Stats 内容语义。
- `/tmp/companion-final-regression.log`：15 项通过；包括 Artifacts 与 Alchemist 的生产标准 MCP 授权/真实读写，以及未知作者动作的 Kernel 路由、生命周期、晚到执行端口和嵌入声明。另一个文件因源码中旧 type re-export 被当作运行时 export 而未加载；已将三个类型改为明确 `export type`，单独复验见下方记录。
- `/tmp/companion-mcp-final.log`：独立复验通过。官方 SDK 启动正式 MCP 服务，未访问 UI 即发现四项能力；中文/emoji/CRLF 的字符、字节、行数与差异原文可还原。逐客户端授权、撤权、停用/恢复、重启后稳定 provider 引用和参数身份伪造拒绝均通过。
- Manifest v2 验证 14 项通过，新增嵌入声明验证覆盖自身、重复、非法 ID 和非数组；未知插件传递嵌入及循环解析另在最终目录回归通过。修改范围 `git diff --check` 通过。
- 旧 Workspace 插件已被项目设置服务替代，原 companion 测试仍断言自动安装它，已改为验证现有系统服务边界；未修改生产安装语义来迎合旧测试。缺少目录记录的独立 MCP fixture 现明确应用正式策略，暴露并修复 `catalog.project_not_found` 引发的发现崩溃。

剩余：Files/Git 对外业务动作及写入的可信调用者/个人成果归属，其他 Runtime 插件的 HTTP/MCP 旁路、Host 路由名单、全量通用工作流/场景配置、双向 MCP 与整体日志。此轮不宣称所有 Runtime 插件迁移完成，未重新做浏览器视觉或用户本人验收；Goal 继续执行。


## Files/Git 业务路由进入统一动作（2026-09-25）

Files 的 state、directory、open、capture 和 Git 的 state、select-diff、prepare-index、results、save-result 已由插件 Manifest 自动注册，原 HTTP 处理器仅转换输入并调用共享动作服务。所有结果仍出自原文件读取、Git、Artifact、私人存储和 Review owner；保留端口身份、版本、阅读位置、固定差异与审阅历史。Files 的浏览刷新会使旧工作区输出失效，按 operation 显式声明，未伪装成纯查询。

迁移限制如实可见：现有 Runtime 的 SDK/私人状态绑定启动用户，九项动作的 availability 会拒绝其他 actor，并说明不能借用个人身份。普通 MCP 客户端即使获得动作 grant 也不能冒充 web-user。本地用户已有业务路径已进入共同执行，**这不代表 Files/Git 已实现对外完整读写**。后续需将私人状态和成果发布/引用按真实主体完成迁移，同时收敛页面外 Agent/Git 审阅服务及精确依赖可用性；不将这条临时 owner 限制当最终架构。

同步保存前重新检查原授权、项目状态、Runtime grant 和取消。Git 创建审阅前通过内部 Capability 调用选项传递检查回调，服务处理器在实际创建前执行；回调与 JSON 业务参数分离，注册替换或原调用结束后失效，不保存在审阅中。原审批和暂存执行路径保持。新严格输入拒绝伪造 outcome/summary/result；旧 HTTP prepare-index 多带的 side 仅由薄适配器剔除，公开能力合同不接受这些无关字段。

验证：`/tmp/files-git-checkpoints.log` 12 项通过，包括正式 Host/真实文件与 Git 读取、固定 owner/producer/version、跨主体拒绝、真实等待中撤权/停用/取消无新版本、重新启用及重启保持、Git 原 HTTP 审批与暂存/失败结果归档、Agent 结果过滤及 Host 串行一致性。`/tmp/files-git-action-http.log` 的 Files 实际 HTTP 路径先行通过；初轮 Git 旧额外字段不符合新 schema，已显式处理合法兼容字段并更新伪造字段拒绝断言后由最终回归覆盖。

构建：`/tmp/capability-checkpoint-build.log`（Contracts、Runtime、Git、Host）与 `/tmp/files-git-final-build.log`（Host）通过。更多消费方回归和新增测试类型检查结果见本段后续记录。本轮无视觉改版，不声明浏览器或用户本人验收；整个 Goal 保持执行中。


补充验证：`/tmp/files-git-consumers.log` 27 项通过，覆盖 Files 实际 HTTP、Coding 伴随入口/接线、Runtime 服务、同步 SDK、旧上下文撤销、项目启动/关闭及 Host 动作队列。`/tmp/files-git-mcp-owner.log` 的标准 SDK 独立进程实测通过：后台发现原四项只读能力仍正常；为 Files.open 写入显式 MCP grant 后，外部 actor 仍被 owner 边界拒绝，不能冒充本地用户。`/tmp/files-git-types.log` 新增测试严格类型检查通过，修改范围 `git diff --check` 通过。


## Agent/Git 后台服务归属（2026-09-25）

Agent/Git 装配移入 `system-agent-service.ts`，原模型目录、MCP 连接与凭据解析只搬迁、不另建状态。Web 与显式 Home 的 LocalMcpServer 共用 `MolisWorkLocalHost.ensureAgentService`：同一 Host 一次注册，实际操作才初始化 SDK；关闭借用 Host 的传输不会撤回共享待审操作。Host 关闭等待项目调用结束后统一释放，重复关闭复用同一 Promise；Home 不一致拒绝，旧 ready 不能复活服务，惰性启动失败可重试。

核对发现 Prologue 的恢复把本地 live 集合之外的未派出审阅当成重启遗留并取消，因此当前不能让 Web/MCP 各自打开同一个执行目录。Node 适配器对显式 storageRoot 使用 OS 自动释放的 SQLite 独占锁；竞争进程在创建 runtime/恢复审阅之前返回 agent.storage_busy，正常关闭释放，异常退出由 OS 释放。未能正常关闭不主动释放所有权。这是必要的过渡保护，**跨进程统一执行方仍未接通**，不能把拒绝占用当成最终方案，也不能宣称不同独立进程现在能共同审批。

验证：
- `/tmp/system-agent-service-tests.log`：3 项通过。真实仓库在 Web 尚未启动时通过 Git 动作准备审阅，随后 Web 复用同一 Host 审批并实际改变暂存区；关闭 Web/MCP 借用入口后待审操作仍可执行，Host 关闭才撤回，重开保留已完成回执。独立竞争进程不能撤回活动审阅，SIGKILL 后另一个 Host 可重试初始化。未使用和初始化中的 Host 关闭均不遗留或复活执行器。
- `/tmp/system-agent-regression.log`：15 项通过，覆盖真实 Git HTTP、原 Agent Capability、标准 MCP 独立进程、Prologue Git 不确定回执/重启恢复，以及父任务完成/失败后的成果整合。
- `/tmp/system-agent-final-build.log`：Agent Host、Local Host 构建通过；`/tmp/system-agent-types.log`：新增测试及子进程 fixture 严格类型检查通过；本轮改动范围 diff 检查通过。

未完成仍包含：Files/Git 跨调用者的个人成果归属，独立进程访问同一执行方，目录按实际后端依赖报告可用性，Character/Coding 的公共动作与完整生命周期、全部存量消费者及总 Goal 其他清单。该轮无视觉改版，HTTP 实测不等同于浏览器体验或用户本人验收；Goal 保持执行中。


## Runtime 宿主依赖状态（2026-09-25）

旧 typed Capability SDK 增加只读 `availability(reference)`，使用 LocalHost 已有 Kernel 注册表，不创建第二份目录。查询仅接受 Manifest 声明消费的 ID，匹配实际版本、当前项目与可选提供方；缺失/不可检查/实例已停止均返回具体原因。检查不会打开业务 Runtime 或执行 handler。原公共动作的 `required_actions` 权限与异步递归策略保持，新的同步查询不授予调用权限，也不冒充给定参数、工作区或连接必然可用。

Files/Git 的九项处理器分别声明实际依赖：Files 状态只需浏览设置，其他文件动作再需文件读取；Git 状态和差异只需浏览设置/Git 读取，审阅准备与结果各自依赖对应宿主能力。目录、执行入口和原保存前检查共用状态，后端缺失时不会先读取目录或写入成果，注册/撤下/版本变化自动反映。正式 Runtime 转发 inspection，并令停止、崩溃恢复后的旧 Capability 客户端失效。SDK 文档同步说明边界。

验证：
- `/tmp/plugin-dependencies-build.log`：Contracts、Plugin Runtime、Files、Git、Local Host 构建通过；`/tmp/plugin-dependencies-final-build.log` 是后续 Contracts 重建。
- `/tmp/plugin-dependencies-tests.log`：15 项通过，覆盖正式 Files/Git 目录、缺依赖先拒绝、精确版本、注册/撤下及相互独立的依赖；原 owner、固定版本、撤权/停用/取消、真实 Agent/Git 后台服务仍通过。
- `/tmp/plugin-dependencies-await.log`：3 项通过，包含真实 Host 嵌套调用等待时撤下依赖，返回后 checkpoint 拒绝后续写入；重新注册后恢复；陌生能力 ID、项目/提供方隔离和不执行检查。
- `/tmp/plugin-dependencies-consumers.log`：13 项中 12 通过；旧浏览设置 fixture 只提供 invoke，新增合同正确报告不可检查，已给 fixture 声明它确实提供的唯一浏览能力。`/tmp/plugin-dependencies-consumers-fixed.log`：该 6 项连线回归及 1 项正式未知插件 Runtime/HTTP 测试通过，后者补充验证 SDK 状态查询转发和重启后旧客户端拒绝。生产代码未添加默认可用兜底。
- `/tmp/plugin-dependencies-workspace-types.log`：工作区全部包类型检查通过；`/tmp/plugin-dependencies-final-types.log`：新增及调整测试严格类型检查通过；改动范围 diff 检查通过。无视觉改版，不新增浏览器或用户本人验收结论。

后续继续完整迁移：上述只完成宿主依赖注册事实的检查，未完成独立进程统一执行方、Files/Git 真实跨调用者归属，以及完整参数/账号/连接就绪状态；其余插件与消费方清单仍保持原范围，Goal 未完成。

## 跨进程动作转发（2026-09-25）

生产 Web 在既有 origin/control-token/一次性键闸门之后挂载通用动作端点。只接受固定 Home、客户端与项目身份，执行方从目录解析项目，不接收数据库路径或权限覆盖；同一 `authorizeMcpActions` 读取原持久授权并在调用和业务 checkpoint 重查。客户端只连接数字 loopback，固定 Home/Host 实例、拒绝重定向、不自动重试、不在响应丢失时改成本地执行。输入限制为 16 MiB，非 JSON 对象返回明确参数错误。

正式 stdio launcher 在明确 Runtime Home 时使用该通道发现/执行公共动作；外部进程不再装配 Agent 执行器。进程内嵌入者仍可显式使用 Local Host。Runtime 项目连接更换、调用主体替换或入口关闭会中止原请求，常驻方在保存前检查取消。常驻服务没有启动时，只保留上下文工具，业务调用明确返回 service_unavailable。已改用实际 launcher 做标准 MCP 测试，删除本轮临时协议 fixture。

验证：

- `/tmp/action-gateway-launcher-tests.log`：4 项通过。官方 MCP SDK 启动实际生产 launcher，用原 Catalog 绑定会话，在独立进程自动发现常驻 Host 的陌生能力 ID；授权后真实写入项目 SQLite 并核对主体，重新打开 Runtime 后持久结果保持。包括撤权等待、项目切换取消、客户端/项目/Home 隔离、实例不匹配、身份伪造拒绝、JSON 参数错误、响应丢失不重试、重定向不转送凭据，以及实际 launcher 离线时上下文解析仍可用。
- `/tmp/action-gateway-formal-regression.log`：11 项通过，覆盖原授权/设置、生产 Alchemist MCP 读写及撤权、上下文恢复、Agent 生命周期和真实 Git 审阅/存储竞争。后续加强授权检查返回前的传输复查，`/tmp/action-gateway-final-tests.log` 的 9 项通道及授权回归通过；最终 launcher 实测见上一项。
- `/tmp/action-gateway-final-build.log` 和 `/tmp/action-gateway-desktop-build.log`：Local Host、Desktop 构建通过；`/tmp/action-gateway-launcher-types.log`：正式 launcher 类型检查通过；`/tmp/action-gateway-final-types.log`：新增测试严格类型检查通过。

剩余：旧平台、Native 和判断别名仍有本地调用，尚未完成唯一执行方的全量切换；Files/Git 外部主体的个人成果归属等待产品决定。临时锁、owner 限制不能当最终方案。工作流、场景、Character 和其余插件总清单继续，不因转发成功标记 Goal 完成。本轮无视觉改版，也没有新增浏览器或用户本人验收结论。

## 判断函数旧 MCP 名称统一授权与执行（2026-09-25）

上节所列判断别名已接入同一常驻服务：list/describe/invoke 的旧名字仍可用，但目录从已授权、实际可用的系统动作派生，调用复用相同 ActionClient。移除旧分支自行附加 functions:invoke 的权限旁路；客户端撤销 functions.list/functions.invoke 后，不能借旧名称继续读取或执行。旧开关保留为兼容名称开关，开启它不等于授予客户端执行权；现有调用者须在同一“能力 → 对外接入”授予 functions.invoke。目录描述、模块 README 和开发文档明确说明这个迁移行为。

模型结果返回后，通用 invoke 和精确版本的已发布动作都在历史写入、结果返回前重查原授权及取消。不会改写或删除既有规则、发布版本和判断记录。通用本机协议保留业务 Error 的稳定 code，判断未找到等错误不会变成没有业务含义的 transport_failed。此轮没有更改模型供应商或凭据存储。跨进程测试使用确定性的判断 Provider，实际启动器、授权、业务服务与存储均为生产代码；此轮没有新增真实 Jev/TypeSafe 网络验证。

验证：

- `/tmp/functions-alias-final-mcp.log`：21 项通过。实际产品 launcher + 官方 MCP SDK 验证常驻 Host 注入的真实判断处理器执行；新旧名字共用单客户端授权，另一客户端不能借权，连接缺失同步不可用，别名开关只影响该名字；模型等待中撤权后，通用调用及精确版本调用均无新判断历史；旧记录保持，业务错误码跨进程保留。其余覆盖 Native 兼容路由、设置、项目绑定恢复等回归。
- `/tmp/functions-alias-tests.log`：3 项通过，包含同一真实标准 MCP 路径早期验证和函数编辑/发布/HTTP、重开保留数据、两项目历史及取消试跑；后续增强的别名连接状态验证由上一项覆盖。
- `/tmp/functions-alias-consumers.log`：49 项中 46 通过；三个失败分别是旧 MCP fixture 未授权、旧 Form 文案断言及仅测 behavior 的夹具误带新增 Feed 动作。已增加明确客户端授权、核对当前描述和分离夹具合同，未放宽生产权限或绕过能力兑现验证。`/tmp/functions-alias-consumers-fixed.log`：受影响的系统判断/场景 27 项通过；该轮已通过的其他函数与通道回归不重复计算。
- `/tmp/functions-alias-compat-fixed.log`：MCP audience、上下文与项目生命周期 8 项通过。无 Home 服务时不能列出可执行的判断别名，旧静态目录断言已改成真实可用性断言。
- `/tmp/functions-alias-build.log`、`/tmp/functions-alias-final-build.log`：Functions、Local Host 构建通过；`/tmp/functions-alias-final-types.log`：新增及调整的 MCP/函数测试严格类型检查通过。修正夹具遗留类型和不再存在的 adapter 参数，没有引入 any 掩盖约束。

剩余范围：Native 旧名字和平台工具尚待统一授权/执行，工作流与用途、其余插件迁移仍继续；Files/Git 的跨调用者成果归属仍待产品决定。以上是判断兼容入口闭环，不表示整体 Goal 完成。未新增浏览器或用户本人验收结论。

## 六组 Native MCP 兼容入口（2026-09-25）

Form、Dataset、PPT、Pages、Cognia、Jelly 的原名称现共用精确客户端动作授权及常驻 Host。插件兼容声明用 required_actions 引用动作 ID/版本，未指定 provider 则必须属于本插件；引用缺失、版本/提供方不符、未授权或不可用均不展示旧工具。组合工具覆盖全部分支及补充读取：Pages list 的模板、翻译并新建所需动作，Jelly 自动读取 revision 和重复实例变体。较窄授权可使用原子动作，兼容开关本身不授予权限。

删除五个插件的 LegacyMcpPermissions helper、旧 Host 权限参数与三份包装文件（mcp-store-plugin-adapter、mcp-cognia-tools、mcp-jelly-tools）。mcp-native-plugins 只保留历史参数/结果处理器；正式调用统一使用 authorizedActions 和本机通道，Home 能力仍使用 Home 上下文。陌生插件没有历史 adapter 不再导致 Host 装配报错，其新动作继续自动发现。保留必要的旧名字和插件自有复合结果适配，不保留重复 Store 或权限目录。

验证：

- `/tmp/native-alias-integration-final.log`：2 项通过。官方 SDK 启动实际产品 launcher，六组兼容名在只有开关时不可调用，逐动作授权后真实跨进程读写；验证同一 canonical 入口读到相同记录、客户端和项目隔离、重新打开后的持久结果。Pages 模型等待后撤销 create 授权不会新增文稿，恢复后保留翻译并新建结果；Jelly 缺少 revision 读取授权时旧写工具不可用。模型采用确定性测试 Provider，不代表新增真实模型网络验收。
- `/tmp/native-alias-regression.log`：37 项通过，覆盖旧目录、设置、Cognia Home 查询、Forms/PPT 持久读写、重新绑定、Manifest 校验。旧 fixture 改用真实 Catalog 项目和显式动作授权。
- `/tmp/native-alias-contract-tests.log`：2 项声明/目录定向测试通过，覆盖非法和重复引用、旧下划线名称，以及另一 provider、错误版本、复合依赖不齐时不能出现旧工具。
- `/tmp/native-alias-consumers.log`：39 项中 35 通过，包括通用转发、判断别名、Jelly 动作/兼容行为等。受授权变更影响的 Pages promote fixture 已补充真实项目和授权，`/tmp/native-alias-promote.log` 单独验证实际 Artifact 版本通过。另三项不一致尚未处理：purge 名单缺 context-onboarding；Schedule 导航断言与当前目录面不符；Workbench pack 和 catalog 插件集合不同。需要在整体收尾核对实际产品合同，不能将该组结果写成全绿。
- `/tmp/native-alias-build.log`：Contracts、六个插件、Workbench、Local Host 构建通过；`/tmp/native-alias-workspace-types.log`：全部工作区包类型检查通过；`/tmp/native-alias-types-final.log`：新增/调整 MCP 测试严格类型检查通过。设置页中英文说明已同步，后续 Workbench 构建见 `/tmp/native-alias-copy-build.log`。

初版整合测试漏传 Pages AI 的必填 text，等待模型 barrier 未达；已停止确认为本次测试的进程，补齐原合同并增加提前失败检查后由最终日志通过。没有修改生产 schema 来放行错误输入。未操作用户常驻进程。

剩余：平台/Goals/事件的旧权限与本地分发、完整工作流和函数用途、其余插件生命周期、Files/Git 外部成果归属，以及上述三项产品回归不一致。此轮仅调整设置页说明，没有新增视觉布局；没有新增浏览器或用户本人验收结论。Goal 保持执行中。

## Runtime Web 自动分发与回归修正（2026-09-25）

web-request 与 coding-surface 两层固定插件正则名单已移除。内置插件的项目启用策略仍从 catalog 派生；Shelf 同时提供原生页面与 Runtime 路由，按 Manifest 路由声明接入，不能只接受 kind=app。其他注册插件交由当前项目 supervisor 和 Manifest/contribution 路由判断。无实例或未声明路径交回后续分发，失败实例返回真实不可用错误，重启不能隐式重新启用已撤销实例。控制令牌、origin 与一次性键继续由原 Web 边界检查。

PluginPlatform 删除 last-start entries 路由快照，改从 supervisor 当前 states/manifest 派生，追加注册不会丢失既有插件路由。Files 的旧设置刷新只在声明消费其产物类型的插件调用前执行，不让无关插件读文件或发布成果。Coding 的 report/runs 等页面加工限于 Coding；Diff/Text stats 的呈现匹配精确插件 ID，陌生插件同名字段原样返回。

回归修正：个人 purge 清单补上实际已使用的 context-onboarding；Coding 目录检查改为实际独立目录；Workbench 覆盖测试从只比较静态 pack 改为同时真正启动 Runtime，逐一检查未被静态装配的 app 及其已声明视图贡献。保留临时 Home 中真实 purge 和实际 Artifact promote 验证。历史恢复测试显式构造 Diff 1.3.1 安装，避免 createDiffPlugin 升版后夹具误变成当前版本却仍断言旧版本；未放宽生产升级兼容性。

验证：

- `/tmp/runtime-http-final-tests.log`：22 项通过。含陌生 ID 插件经过正式 Web 服务的真实 SQLite 写入、无令牌拒绝、严格输入、跨项目拒绝、撤销启用后不再写入、重启不能恢复授权、重新启用后恢复；原 Coding 草稿与项目隔离、进程重启、旧安装崩溃/隔离恢复，以及上述个人插件回归。直接路由集成还验证新增插件保留原路由、陌生响应不被加工、无关调用不刷新 Files。
- `/tmp/runtime-http-consumers.log`：24 项通过，覆盖 Coding/Files/Git/Diff/Text stats、产物传播、项目能力与实际 MCP 消费。`/tmp/runtime-http-tests.log`：10 项初步路由/面板/升级回归通过，其中陌生路由测试在最终组再次运行，不重复计数。
- `/tmp/runtime-http-build-final.log`：Local Host 构建通过。`/tmp/runtime-http-test-types-final.log`：新增路由集成、个人插件回归和旧版本恢复测试严格类型检查通过；修正测试 source/dist 私有类型混用及 Pages fixture 的实际端口类型。scoped diff --check 通过。

范围仍有限：本步验证已注册实例经 Web 分发，不代表发行物安装、所有插件业务动作、完整工作流/场景消费都已迁完。平台/Goals MCP 旁路、Files/Git 对外成果归属和总清单其余项继续保留。没有新增页面布局、浏览器实操或用户本人验收结论；Goal 保持执行中。

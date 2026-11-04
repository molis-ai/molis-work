# 第 02 批 · 旧协调单核对

[第 02 批交付](batches/02.md#batch-02-item-1) · [现行待办](../../BACKLOG.md) · [旧协调分支原表](https://github.com/molis-ai/molis-work/blob/22fe801a021ffac1b16d4000aef9b3584f9cf882/coordination/2026-10-28/MISC.md)

原表里同一任务会出现几次。有的行已经指定后续任务，有的行只有一半随之合入。下表用原行号定位，按具体行为记录去向。文件通过数引自防腐最后一次[集成 Full](https://github.com/molis-ai/molis-work/actions/runs/41710265080)；它的树与合入头 `8de0b0740` 相同。

| MISC 原行 | 接手后的行为与证据 |
| --- | --- |
| 7 · T-031 | [#1353](https://github.com/molis-ai/molis-work/pull/1353) 删除工作台没有调用方的页脚函数，#1372 更新清理清单。本批补正防腐归档中两句仍写着“待删”的文字。 |
| 8、T-342 后记 · macOS 剪贴板 | 两次旧作业在读原剪贴板时失败，新提交成功；没有确定根因。共用 BL-972。 |
| 9～11 · T-155 | T-175 的 RAC-1835～1837 在确认入口拒绝相撞的 ID 与不合条件的升级，先于固定发布者或保存包。宿主与 Runtime 各自判断点分嵌套的重复实现保留 BL-970。 |
| 12～13 · T-057、T-071 | [T-057](decisions.md#policy-t057) 的错误出口仍实测为 400，目标为 500，归 BL-969。[T-071](decisions.md#policy-t071) 复测了本人连续两次操作及工作内拒绝。 |
| 14 · T-078 | RAC-1615、1616 对删除及范围预览两个入口发送错误编码的项目 ID，均收到 400 和 host.request_path_invalid，删除记录仍为空。本片在宿主手册补上这两种答复。 |
| 15～16 · T-154、T-157／158 | 助理到期提醒标题的两个截断点仍归 BL-971。Pages 导出文件名、图注、选区及光标上下文随 [#1563](https://github.com/molis-ai/molis-work/pull/1563) 合入；导入预览、引文和评论侧栏随 [#1608](https://github.com/molis-ai/molis-work/pull/1608) 合入。浏览器实际导出及预览边界所在文件分别通过 6/6、4/4。 |
| 17～18 · T-167、T-184 | S-03 漏列的旧 Goals 地址重放拒绝归 BL-914。另存文件名在 [T-223](https://github.com/molis-ai/molis-work/commit/bb5f4ce566) 保住扩展名；RAC-2164 真实保存了 100 个 emoji 加 `.html`。 |
| 20～22 · T-183、T-192 | Host 情境请求上限、工作台选区和标题分别由 [#1462](https://github.com/molis-ai/molis-work/pull/1462)、[#1687](https://github.com/molis-ai/molis-work/pull/1687) 保留整字；相应用例文件 11/11、16/16。W4-11 在 [运行时迁移历史](../../../docs/system/RUNTIME-MIGRATION.md)已注明 #542 合入，以及后来改由 Manifest 声明库的时间。 |
| 23 · T-189 | Workflow 仍按 60,000 单元截给模型的正文节选。原行允许保留此内部节选；字段映射和步骤输入已用共用的按字符截取函数。 |
| 24、41、47、51、82～83 · 字符工具 | [#1681](https://github.com/molis-ai/molis-work/pull/1681) 在 SDK 区分按单元和按码点截取。Scheduler 和宿主起草已用 cutHead，Images 与 Runtime 都用 exceedsCharacters；RAC-2726 所在文件 4/4。T-262 的 request_id 和 RAC-2196 已改，按码点截取仍有重复，归 BL-977。 |
| 29 · T-202 | 评论材料的第 18,000 个单元仍会切开一个字符，普通材料的分段也是相同算法。跨段完整性和手册的正文上限归 BL-974。 |
| 30 · T-168 | RAC-1809～1811 区分已声明路由形状里的坏编码、未声明的页面路径和普通 Home 请求。S-47 未写这条边界，表和已有测试的对应归 BL-914。 |
| 31 · T-208 | 下载链接、实际文件名及 Shelf 回执的 RAC-1995～1997 已在图片插件浏览器用例内。README 漏列这份文件，归 BL-973。 |
| 34 · T-210 | [#1572](https://github.com/molis-ai/molis-work/pull/1572) 统一引导页和宿主项目名的字数上限。RAC-2250／2252 覆盖含两单元字的 120 字项目名和超限拒绝，文件 57/57。材料标题交成果库仍由另一个待办 BL-944 跟踪。 |
| 35 · T-215 | Feed 接线门禁实际排除注释、字符串、正则和模板文字后才找三个调用。本片已改正切片说明。 |
| 38 · T-188 | Feed 升为 Goal 时，目标标题及其来源标题都按整字截。RAC-2299 所在文件 18/18。 [采用提交](https://github.com/molis-ai/molis-work/commit/34e2da46e5) |
| 40、69 · Pages 提示预算 | JSON 转义后的材料超过上限时，在领取请求或写记录前拒绝，也核对了恰好在上限和全 emoji 的输入，所在文件 20/20。T-360 用真正的 Host 端口核对当前默认指令和最坏材料的组合，预算用例 2/2（[T-360](https://github.com/molis-ai/molis-work/pull/1691)）。 [采用提交](https://github.com/molis-ai/molis-work/commit/7c076539f0) |
| 42 · T-225 | 操作卡的材料标题来自未经限长的选区对象名，带前缀后可能超过助理的 200 单元限制，归 BL-976。 |
| 44 · T-224 | 起草写入字段和卡片摘要时遵守各自上限并保留完整字符。RAC-2195～2197 所在文件 16/16。 [采用提交](https://github.com/molis-ai/molis-work/commit/162feea2d9) |
| 45 · T-223 | [T-231](https://github.com/molis-ai/molis-work/commit/63a1536b77) 修好 Host 下载名与 Shelf 留存名的截断和扩展名。RAC-2200、2201 所在文件分别通过 8/8、7/7。 |
| 48 · T-213 | [#1550](https://github.com/molis-ai/molis-work/pull/1550) 将 Plugin Runtime 源码纳入共享核心全量建议。RAC-2401 核对源码改动与纯文档的区别，测试文件 85/85。全量由集成分支安排。 |
| 49、67～68 · T-247、T-262、T-261 | 成果摘要现用 SDK cutHead 截 4,000 单元，Todo、灵光和 Pages 的 request_id 均用它截 160 单元。Feed 条目标题仍可截出单独一个代理单元，归 BL-975。 |
| 50 · T-227 | [#1567](https://github.com/molis-ai/molis-work/pull/1567) 补了关闭途中安装记录消失、关闭失败传播及另一安装处理的用例。RAC-2407 所在文件 9/9。 |
| 54 · 大块代码着色 | [#1532](https://github.com/molis-ai/molis-work/pull/1532) 分开首次整块布局和后续着色，代码布局文件 5/5、着色规模文件 9/9。历史负载下的首败保留。 |
| 56 · T-112 | [#1547](https://github.com/molis-ai/molis-work/pull/1547) 补了入口扫描的扩展名用例。RAC-2297 能检测从 .mts／.tsx 入口漏扫 Goals 依赖，所在文件 11/11。 |
| 59～60 · T-281 | T-354 实测丢掉的块没有保留观察器。已布局的流式块在下一帧着色，隐藏或跳过布局的块等待实际布局，RAC-2729 所在文件 9/9。 [采用提交](https://github.com/molis-ai/molis-work/commit/b21f76175d) |
| 75 · T-119 | 连接器卡片的名称和说明按整字限长，来源包名会转义。RAC-2418、2419 所在文件 18/18。其他视图另见原行 100。 [采用提交](https://github.com/molis-ai/molis-work/commit/8276d875c7) |
| 79 · T-276 | 单独让窗口读取失败，仍取得版本和视口。RAC-2443 所在文件 3/3，README 已把 R-73 的适用范围缩到发送给插件帧的鼠标输入。 [采用提交](https://github.com/molis-ai/molis-work/commit/19660e3094) |
| 84 · T-119 | CLI、MCP 和记录动作适配器拒绝把 constructor 当成已登记服务。三处各有行为用例，所在文件分别为 7/7、92/92、3/3。 [采用提交](https://github.com/molis-ai/molis-work/commit/19106b35d5) |
| 86 · T-218 | 无 install_id 的页面，离开时取消在途请求，撤权时仍拒绝。RAC-2442 所在文件 31/31。 [采用提交](https://github.com/molis-ai/molis-work/commit/12c911b1c5) |
| 88 · T-119 | 在实际页面为孤儿连接换令牌、移除它并重新打开核对持久化，所在文件 2/2。原设备两次首次导航超时的根因未定位。 [采用提交](https://github.com/molis-ai/molis-work/commit/77f4fd172a) |
| 91 · T-400 | Feed 捕获被撤权时整笔写入回滚，沿原拒绝码抛回，所在文件 16/16。测试替身的后续意见另见原行 136。 [采用提交](https://github.com/molis-ai/molis-work/commit/7579870d5c) |
| 93 · T-400 | 搜索丢弃 forbidden 读取器时留一条插件 ID 和错误码，不记消息与查询，RAC-2715 所在文件 27/27。 [采用提交](https://github.com/molis-ai/molis-work/commit/f8aaece61b) |
| 99 · T-304 | 共享核心规则、文档、PR 模板和选择器标签按清单对照，多一项、少一项和把名称移到说明栏都会失败。RAC-2444 所在文件 85/85。 [采用提交](https://github.com/molis-ai/molis-work/commit/2757323123) |
| 103 · R-49 | 风险表同笔可空主人和部分唯一索引归 BL-968。 |
| 108～109 · 干净 Home 评审 | 加入邀请只接受 64 位十六进制凭据，其余输入不写成员。错版本的 WAL 库被拒，数据库和 WAL 字节不变。RAC-2716、2717 所在文件分别 7/7、5/5。 [采用提交](https://github.com/molis-ai/molis-work/commit/bc986379c1) |
| 113、126、154 · 知识检索 | T-329 和 T-333 分别修了选节标题、grep 行起点与提示。RAC-2445 钉住标题的切点；RAC-2446 经过真实宿主捕获模型数据，#1689 又核对顶层键。未读原因的剩余截断归 BL-981。内部键全集是下次改变发送结构时再核的建议。 |
| 136～137、142～144、155 · Feed、连接器与搜索 | RAC-2711 的替身返回值归 BL-982，安全表归 BL-914。记录槽改绑沿统筹已指定的 BL-921。CONNECTOR_CLIS 还有一处归 BL-983；RAC-2415、2417 已分别断言真实错误码，RAC-2731 注释映射下次碰用例时补。搜索 RAC-2715 已断言错误对象自有键，details 与 cause 均被排除。 |
| 147～151 · T-353 余项 | RAC-2728 只准 Pages 留一条没有长度参数的双端修剪声明。五处重复和先展开全文的写法归 BL-977；两处浏览器预算例外归 BL-978。灵光大材料的内存峰值仍未知。 |
| 168 · T-319 | RAC-2783、2784 从真实宿主的 home.events.read 读取项目插件目录与事项，所在文件 6/6。 [采用提交](https://github.com/molis-ai/molis-work/commit/973063c793) |

## 已有处置的历史风险

[风险原表](https://github.com/molis-ai/molis-work/blob/22fe801a021ffac1b16d4000aef9b3584f9cf882/coordination/2026-10-14/RISKS-AND-DEFERRED.md)。采用提交均可从本次核账的 main 到达。涉及旧机器、真实资料和本人验收的条件仍按相应待办结算。

| 原风险 | 处置 |
| --- | --- |
| R-02、03、14 | 原协调表已交接同事并行开发和机器负载；借用工作树的同步工具曾选错工作树。现行并行开发手册规定独立工作树、构建／浏览器槽位和进程归属。原机器的网络观察留给 R-67。  |
| R-06、11、17 | Sessions SC-4 随 #1194 采用。C8-3 随 #1185 采用，执行方按钮余项归 BL-957；Goals S9-2 的旧库迁移由干净重建取代，本人验收仍归 BL-929。#1164 随项目删除清理角色运行记录。 [`f880df0c4`](https://github.com/molis-ai/molis-work/commit/f880df0c4)、[`3e96b40ea`](https://github.com/molis-ai/molis-work/commit/3e96b40ea) |
| R-09、16、21、28、29、31、34、57 | 旧 PR 的叠放、队列拥堵、枢纽文件与人员排期已随防腐批关闭。#1304 的先入队记录保留；如今按认领板、同路径串行和机器槽位执行。第 02 批的在途 PR 与全量仍由现任统筹管理。 [`4db89e26d`](https://github.com/molis-ai/molis-work/commit/4db89e26d) |
| R-12、13、15 | 运行中的路由停用后答带码的 403。所有调用之外的回调已有意保留原处理方式，返回 undefined 后插件自己使用它仍可能出错；处置不扩成新的调用合同。 [`01a875af0`](https://github.com/molis-ai/molis-work/commit/01a875af0) |
| R-18、22、25 | 不可用原文件的拒绝、助理重复切换时等待首屏刷新，以及没有面板时 Esc 的处理都已有独立合入提交。保留早期红灯和过期的等待条件。 [`15fc5d9acb`](https://github.com/molis-ai/molis-work/commit/15fc5d9acb)、[`df7a3bdba8`](https://github.com/molis-ai/molis-work/commit/df7a3bdba8)、[`5248af758`](https://github.com/molis-ai/molis-work/commit/5248af758)、[`07a309317`](https://github.com/molis-ai/molis-work/commit/07a309317) |
| R-19 | 连接器意图用例在失败时记连接 Promise 状态、HTTP 状态、码和进入标识。安装用例记阶段、下载和版本探测次数。在本次隔离 Home 分别为 10/10、3/3；原先两次超时均无足够资料反推根因。 |
| R-20、33 | 连接器卸载清理随 #1287 合入。沙箱创作产物的 SDK 类型声明已在 #1136 补齐，原仅 macOS 暴露的构建故障有采用记录。 [`4f4e59a33`](https://github.com/molis-ai/molis-work/commit/4f4e59a33)、[`15b656648`](https://github.com/molis-ai/molis-work/commit/15b656648) |
| R-35、41、52、54、66、69 | 旧项目库版本、Manifest 旧字段、遗留 disabled 状态和 Feed 捕获的旧生产者等存量处理都以真实 Home 完整备份及干净重建为前置，统一归 BL-928。#1101 已关闭；R-52 当年的版本冲突已过，版本起点交本批第三项。  |
| R-36～38 | 安装包验签后才固定发布者；相同或点分嵌套 ID 在确认前拒绝（RAC-1835～1837）。两份路径判断的重复归 BL-970。Agent Host 的五个巨大单元已随 #1287 分批处理。 [`2b3dc51de`](https://github.com/molis-ai/molis-work/commit/2b3dc51de)、[`fc1e03c3c`](https://github.com/molis-ai/molis-work/commit/fc1e03c3c)、[`bed80bb90`](https://github.com/molis-ai/molis-work/commit/bed80bb90)、[`4f4e59a33`](https://github.com/molis-ai/molis-work/commit/4f4e59a33) |
| R-50、51、55 | 开项目公告改经动作读取的修复随 #1258。Workers Builds 属当时用户明确跳过的非必需作业。#1308 已采用租户连接页的预算回收与 RAC-657，当前租户重连行为另见本批 #1290。 [`3817f8757`](https://github.com/molis-ai/molis-work/commit/3817f8757)、[`2b3dc51de`](https://github.com/molis-ai/molis-work/commit/2b3dc51de) |
| R-58、59 | 夜间 Linux 探针分为六片并固定 uv，原预算耗尽项在后续运行收回；配置仍有 linux-probe 作业。Home 入口解析规范路径，内部链接继续拒绝。 [`0d8388b09`](https://github.com/molis-ai/molis-work/commit/0d8388b09) |
| R-60、61 | 判断账与插件项目事务分开，RAC-845 检查项目事务回滚后 Home 的行仍在。场景判断按安装分隔，丢弃该安装时清其项目行。 [`0d8388b09`](https://github.com/molis-ai/molis-work/commit/0d8388b09)、[`0262a6d21`](https://github.com/molis-ai/molis-work/commit/0262a6d21) |
| R-63、64、65 | T-319 让首页被拒时区分关闭项目与应诊断的失败。T-374 验证真实宿主接入项目目录。开发注册的单定义例外受 S-75 限制；真实旧库不另开读取。T-320 的 Dock 触发人提示随页面资源批采用。 [`45be6f2e1`](https://github.com/molis-ai/molis-work/commit/45be6f2e1)、[`973063c793`](https://github.com/molis-ai/molis-work/commit/973063c793)、[`9efbf8d04`](https://github.com/molis-ai/molis-work/commit/9efbf8d04)、[`0ac344d8c`](https://github.com/molis-ai/molis-work/commit/0ac344d8c) |
| R-68、70 | 共享刷新发出以后对取消与撤权分别结算，原 S-95 的说明及 401 合流断言随 #1556。T-007、T-034 校准项目插件刷新对 crashed、disabled 和 quarantined 的处理，由 RAC-1120～1121 覆盖。本次启停刷新文件 2/2。 [`2167e044a`](https://github.com/molis-ai/molis-work/commit/2167e044a)、[`2cb1ecd0d1`](https://github.com/molis-ai/molis-work/commit/2cb1ecd0d1)、[`88a4ce949`](https://github.com/molis-ai/molis-work/commit/88a4ce949)、[`96004afd4`](https://github.com/molis-ai/molis-work/commit/96004afd4) |

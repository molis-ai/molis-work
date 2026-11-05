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
| 19 · 旧名扫描 | 四份报告所列手册在旧 PR 后已有改动，须用原名和现行入口区分已消失的路径与仍指错的叙述，归 BL-1010。 |
| 20～22 · T-183、T-192 | Host 情境请求上限、工作台选区和标题分别由 [#1462](https://github.com/molis-ai/molis-work/pull/1462)、[#1687](https://github.com/molis-ai/molis-work/pull/1687) 保留整字；相应用例文件 11/11、16/16。W4-11 在 [运行时迁移历史](../../../docs/system/RUNTIME-MIGRATION.md)已注明 #542 合入，以及后来改由 Manifest 声明库的时间。 |
| 23 · T-189 | Workflow 仍按 60,000 单元截给模型的正文节选。原行允许保留此内部节选；字段映射和步骤输入已用共用的按字符截取函数。 |
| 24、41、47、51、82～83 · 字符工具 | [#1681](https://github.com/molis-ai/molis-work/pull/1681) 在 SDK 区分按单元和按码点截取。Scheduler 和宿主起草已用 cutHead，Images 与 Runtime 都用 exceedsCharacters；RAC-2726 所在文件 4/4。T-262 的 request_id 和 RAC-2196 已改，按码点截取仍有重复，归 BL-977。 |
| 25 · T-124 | 缺记录时即使 stop 钩子同步抛错，授权仍先撤下，RAC-2400 所在文件 39/39。损坏的已有记录是另一种情形；现行关闭用例要求其余实例继续停，旧单保留 T-037 对坏记录的既定处理。 [`23496ba071`](https://github.com/molis-ai/molis-work/commit/23496ba071) |
| 26 · T-181 | 真实存量引导标题是否曾存半字，沿设备 A 的[旧核对](https://github.com/molis-ai/molis-work/issues/1332#issuecomment-6517042142)，当次数为零；以后按干净重建 BL-928，不从当前代码猜旧 Home 内容。 |
| 27、52、72 · 模型输入预算 | T-282、351 已收口信息助手、Alchemist 和 Todo 的材料。Knowledge 有实际宿主数据位测试。Memory 仍沿原暂停，注册默认指令与 prompt／system 的两个上限保留 BL-1002。 [`4b73d80714`](https://github.com/molis-ai/molis-work/commit/4b73d80714)、[`a1117b3bad`](https://github.com/molis-ai/molis-work/commit/a1117b3bad) |
| 28、33、39、80、97、105 · 字数与组词 | PPT 大纲与 Goal 标题已有真实提交及长度边界用例；Characters 原表核出页面和库同按单元，不另派。指引和直接 Goal 创建归 BL-998，组词、Pages 备注归 BL-999。项目名三入口的统一和材料标题归 T-331／BL-944，材料边界在本批已复现。 [`0ac344d8cf`](https://github.com/molis-ai/molis-work/commit/0ac344d8cf) |
| 29 · T-202 | 评论材料的第 18,000 个单元仍会切开一个字符，普通材料的分段也是相同算法。跨段完整性和手册的正文上限归 BL-974。 |
| 30 · T-168 | RAC-1809～1811 区分已声明路由形状里的坏编码、未声明的页面路径和普通 Home 请求。S-47 未写这条边界，表和已有测试的对应归 BL-914。 |
| 31 · T-208 | 下载链接、实际文件名及 Shelf 回执的 RAC-1995～1997 已在图片插件浏览器用例内。README 漏列这份文件，归 BL-973。 |
| 32 · T-208 | T-212、213 已统一图片服务和 Runtime 的字符计数，五个界面输入框仍留 BL-985。 |
| 34 · T-210 | [#1572](https://github.com/molis-ai/molis-work/pull/1572) 统一引导页和宿主项目名的字数上限。RAC-2250／2252 覆盖含两单元字的 120 字项目名和超限拒绝，文件 57/57。材料标题交成果库仍由另一个待办 BL-944 跟踪。 |
| 35 · T-215 | Feed 接线门禁实际排除注释、字符串、正则和模板文字后才找三个调用。本片已改正切片说明。 |
| 36 · T-216 | 早期四批改用收字节后解码，模型替身及助理文本替身也有独立采用提交。剩余项按实际流的类型归 BL-1000。 [`a6fb596509`](https://github.com/molis-ai/molis-work/commit/a6fb596509)、[`ea40d5527a`](https://github.com/molis-ai/molis-work/commit/ea40d5527a)、[`df370c2ba7`](https://github.com/molis-ai/molis-work/commit/df370c2ba7)、[`55f166d18e`](https://github.com/molis-ai/molis-work/commit/55f166d18e)、[`0fba362d33`](https://github.com/molis-ai/molis-work/commit/0fba362d33)、[`6fcf359226`](https://github.com/molis-ai/molis-work/commit/6fcf359226) |
| 37、46 · CI 与资源 | 连续队列组的放行建议归 BL-1001。原 74 字节差保留为当时观察；防腐最终树的 51 项预算已通过，见本批 BL-936，无现行增量要放行。 |
| 38 · T-188 | Feed 升为 Goal 时，目标标题及其来源标题都按整字截。RAC-2299 所在文件 18/18。 [采用提交](https://github.com/molis-ai/molis-work/commit/34e2da46e5) |
| 40、69 · Pages 提示预算 | JSON 转义后的材料超过上限时，在领取请求或写记录前拒绝，也核对了恰好在上限和全 emoji 的输入，所在文件 20/20。T-360 用真正的 Host 端口核对当前默认指令和最坏材料的组合，预算用例 2/2（[T-360](https://github.com/molis-ai/molis-work/pull/1691)）。 [采用提交](https://github.com/molis-ai/molis-work/commit/7c076539f0) |
| 42 · T-225 | 操作卡的材料标题来自未经限长的选区对象名，带前缀后可能超过助理的 200 单元限制，归 BL-976。 |
| 43 · T-225 | 旧 assistant-island 已拆，assistant-page-messages 仍以 slice 截材料和标题。页面到助理卡片的边界归 BL-976。 |
| 44 · T-224 | 起草写入字段和卡片摘要时遵守各自上限并保留完整字符。RAC-2195～2197 所在文件 16/16。 [采用提交](https://github.com/molis-ai/molis-work/commit/162feea2d9) |
| 45 · T-223 | [T-231](https://github.com/molis-ai/molis-work/commit/63a1536b77) 修好 Host 下载名与 Shelf 留存名的截断和扩展名。RAC-2200、2201 所在文件分别通过 8/8、7/7。 |
| 48 · T-213 | [#1550](https://github.com/molis-ai/molis-work/pull/1550) 将 Plugin Runtime 源码纳入共享核心全量建议。RAC-2401 核对源码改动与纯文档的区别，测试文件 85/85。全量由集成分支安排。 |
| 49、67～68 · T-247、T-262、T-261 | 成果摘要现用 SDK cutHead 截 4,000 单元，Todo、灵光和 Pages 的 request_id 均用它截 160 单元。Feed 条目标题仍可截出单独一个代理单元，归 BL-975。 |
| 50 · T-227 | [#1567](https://github.com/molis-ai/molis-work/pull/1567) 补了关闭途中安装记录消失、关闭失败传播及另一安装处理的用例。RAC-2407 所在文件 9/9。 |
| 53、62 · 扩展点说明 | 两次文档修正区分了当时已核的沙箱错误名称、界面语言函数的位置和按指定提交量出的文件数。旧统计的时点仍保留。 [`89a415fb21`](https://github.com/molis-ai/molis-work/commit/89a415fb21)、[`768a46e6f5`](https://github.com/molis-ai/molis-work/commit/768a46e6f5) |
| 54 · 大块代码着色 | [#1532](https://github.com/molis-ai/molis-work/pull/1532) 分开首次整块布局和后续着色，代码布局文件 5/5、着色规模文件 9/9。历史负载下的首败保留。 |
| 55、65～66、73 · Goals 入口 | T-257、272、325 按实际调用方修正 Goals 手册、发布策略与 PG-111 的来历。RAC-2297 的入口夹具随后加上常见 JS／TS 扩展名并调用生产扫描。 [`a3c5e357de`](https://github.com/molis-ai/molis-work/commit/a3c5e357de)、[`c95f0d39d4`](https://github.com/molis-ai/molis-work/commit/c95f0d39d4)、[`801471d724`](https://github.com/molis-ai/molis-work/commit/801471d724)、[`e1f6f4fe3d`](https://github.com/molis-ai/molis-work/commit/e1f6f4fe3d) |
| 56 · T-112 | [#1547](https://github.com/molis-ai/molis-work/pull/1547) 补了入口扫描的扩展名用例。RAC-2297 能检测从 .mts／.tsx 入口漏扫 Goals 依赖，所在文件 11/11。 |
| 57 · T-175 | 隔离中的签名包遇到非升级的包，RAC-2298 在确认入口断言 upgrade_required，覆盖拒绝之前与之后的状态。 [`42efb64ffc`](https://github.com/molis-ai/molis-work/commit/42efb64ffc) |
| 58、87、107 · 共享刷新 | S-95 已区分尚有授权、已撤权和全部取消。T-268 改了 401 合流断言，T-296 验停止和撤权期间的分支，T-342 删掉重复用例。共享刷新文件在防腐最终 Full 为 69/69。 [`2cb1ecd0d1`](https://github.com/molis-ai/molis-work/commit/2cb1ecd0d1)、[`8ceeb20c05`](https://github.com/molis-ai/molis-work/commit/8ceeb20c05)、[`c95f6f305b`](https://github.com/molis-ai/molis-work/commit/c95f6f305b) |
| 59～60 · T-281 | T-354 实测丢掉的块没有保留观察器。已布局的流式块在下一帧着色，隐藏或跳过布局的块等待实际布局，RAC-2729 所在文件 9/9。 [采用提交](https://github.com/molis-ai/molis-work/commit/b21f76175d) |
| 61、141 · T-113、T-291 | 工作流读取引用以及失败日志已有 RAC-2706，所在文件 12/12。#1689 改准注释。当前成果动作仍有吞错兜底，Goals 有双读，归 BL-986。 [`0132bda30a`](https://github.com/molis-ai/molis-work/commit/0132bda30a)、[`f8de255461`](https://github.com/molis-ai/molis-work/commit/f8de255461) |
| 63 · T-266 | 现行 immersive-shell.ts 的 dependentPlugins 在前，描述侧栏的注释在它之后、renderPluginRail 之前。 [`e4e98ed331`](https://github.com/molis-ai/molis-work/commit/e4e98ed331) |
| 64、71 · 本机路径 | 两个测试期望都从 /tmp 的实际路径构造，断言仍比对完整目标。 [`1c1df965d4`](https://github.com/molis-ai/molis-work/commit/1c1df965d4)、[`946cf30e2a`](https://github.com/molis-ai/molis-work/commit/946cf30e2a) |
| 70、78、122～123 · 旧文档出处 | W4-02 的采用状态、数据库声明来源、Goals／Jelly 功能盘点、生产与测试引用范围、干净重建后的 BL-588 与 PG-026 均有采用提交。BL-625、627 的历史归属沿本批 H1 的“原负责人交接”处理。 [`21ffb4a868`](https://github.com/molis-ai/molis-work/commit/21ffb4a868)、[`e1f6f4fe3d`](https://github.com/molis-ai/molis-work/commit/e1f6f4fe3d)、[`13a3a56bb7`](https://github.com/molis-ai/molis-work/commit/13a3a56bb7)、[`9e7d0533b4`](https://github.com/molis-ai/molis-work/commit/9e7d0533b4) |
| 74、102、128 · 连接声明与查表 | 连接在建立时钉住声明者。RAC-2520 验连接与声明者，RAC-2758 验钉写入失败后密钥库条目数不变。T-356 已按自有键查 CLI。剩余 slots HTTP 仍直接下标取服务，随 BL-983 核；事务工具的归属随下次改 connector-host 核对。 [`a9fbdf7568`](https://github.com/molis-ai/molis-work/commit/a9fbdf7568) |
| 75 · T-119 | 连接器卡片的名称和说明按整字限长，来源包名会转义。RAC-2418、2419 所在文件 18/18。其他视图另见原行 100。 [采用提交](https://github.com/molis-ai/molis-work/commit/8276d875c7) |
| 76、104、110 · 历史文档和 Feed 库 | W5-11 的旧 HOST_DECLARED 标为当时实现，Home 登记已接入，见原行 118。T-321 更新了旧待办与风险处理的记载。Feed 的引用账从新库建立时就完整，原“等维护”分支已退役。 [`ddac3a308a`](https://github.com/molis-ai/molis-work/commit/ddac3a308a)、[`6253bbd497`](https://github.com/molis-ai/molis-work/commit/6253bbd497)、[`e4e98ed331`](https://github.com/molis-ai/molis-work/commit/e4e98ed331) |
| 77、119～120 · 清单与诊断 | 共享核心与全量选择器从单向检查改为双向比对；测试覆盖多出、遗漏及把名称移入说明。T-350 收紧缺项错误、CI 时间与插件帧诊断断言。连接器其它视图的待办归 BL-987。 [`540524dbf6`](https://github.com/molis-ai/molis-work/commit/540524dbf6)、[`2757323123`](https://github.com/molis-ai/molis-work/commit/2757323123)、[`d9fb350656`](https://github.com/molis-ai/molis-work/commit/d9fb350656) |
| 79 · T-276 | 单独让窗口读取失败，仍取得版本和视口。RAC-2443 所在文件 3/3，README 已把 R-73 的适用范围缩到发送给插件帧的鼠标输入。 [采用提交](https://github.com/molis-ai/molis-work/commit/19660e3094) |
| 81、106 · T-275 与 T-305 | 关闭循环用固定的插件 ID 覆盖两种顺序，关闭前查两个安装均有贡献，完整顺序数组须相等。用例标为 mac，原 Homebrew Node 的失败仍按设备记录。协调工具的 parseStage 已由原派单线更新。 [`500f6fb509`](https://github.com/molis-ai/molis-work/commit/500f6fb509)、[`c95f6f305b`](https://github.com/molis-ai/molis-work/commit/c95f6f305b) |
| 84 · T-119 | CLI、MCP 和记录动作适配器拒绝把 constructor 当成已登记服务。三处各有行为用例，所在文件分别为 7/7、92/92、3/3。 [采用提交](https://github.com/molis-ai/molis-work/commit/19106b35d5) |
| 85 · T-290 | 设置页按声明选择查询参数与 fragment，工作台与 Home 设置均有 RAC-2412，见本批 R-42。 [`15ad4f3970`](https://github.com/molis-ai/molis-work/commit/15ad4f3970) |
| 86 · T-218 | 无 install_id 的页面，离开时取消在途请求，撤权时仍拒绝。RAC-2442 所在文件 31/31。 [采用提交](https://github.com/molis-ai/molis-work/commit/12c911b1c5) |
| 88 · T-119 | 在实际页面为孤儿连接换令牌、移除它并重新打开核对持久化，所在文件 2/2。原设备两次首次导航超时的根因未定位。 [采用提交](https://github.com/molis-ai/molis-work/commit/77f4fd172a) |
| 89、95、164 · 临时 Home 与密钥封条 | 只读预检、密钥结构拒绝随 T-385 采用；storage-baseline 和 secret-store-format 文件在最终 Full 分别 7/7、5/5。原始坏封条与随后的修复分开保留。结构有效但认证失败及前缀删除另见原行 129、170。 [`e4bf46ca92`](https://github.com/molis-ai/molis-work/commit/e4bf46ca92) |
| 90、92、94、134、157～159 · MCP 错误 | T-400 从抛出处按 kind 分类，T-340 归集 MCP 声明。T-368、369 补无目录时的拒绝和终端别名后的连接变化，四个 changed 和一个 unchanged 已分开写。mcp.grant_unavailable 仍按 discovery 动态给 kind。mcp.path_required 的两参数构造是原批准的门禁例外，去掉例外须另经门禁主人评审。 [`e3b553d338`](https://github.com/molis-ai/molis-work/commit/e3b553d338)、[`7d74dc3532`](https://github.com/molis-ai/molis-work/commit/7d74dc3532)、[`df8de564f4`](https://github.com/molis-ai/molis-work/commit/df8de564f4)、[`db29f18d4`](https://github.com/molis-ai/molis-work/commit/db29f18d4) |
| 91 · T-400 | Feed 捕获被撤权时整笔写入回滚，沿原拒绝码抛回，所在文件 16/16。测试替身的后续意见另见原行 136。 [采用提交](https://github.com/molis-ai/molis-work/commit/7579870d5c) |
| 93 · T-400 | 搜索丢弃 forbidden 读取器时留一条插件 ID 和错误码，不记消息与查询，RAC-2715 所在文件 27/27。 [采用提交](https://github.com/molis-ai/molis-work/commit/f8aaece61b) |
| 96、131、140 · 英文、内置装配与 Form 手册 | T-357 的测试已采用，英文名称余项归 BL-1011。现行扩展点表写“外加一项”；T-382 采用并去掉 BL-926 的旧成果路由例外，RAC-2746～2748 仍核现行例外出处。Form 的填答长度用例已在包 README 和 CI 产品子集，浏览器用例说明 maxlength 的历史行为。 [`f61a6e07d`](https://github.com/molis-ai/molis-work/commit/f61a6e07d) |
| 98、121、129、161、166、170 · 模型与密钥 | Alchemist 超限时先粗筛、再按码点判断；信息助手最多取 20 个来源，Todo 有上限的正反用例。精确超出字数与继续入口归 BL-1004。Pages 预算只对当前默认指令作证。密钥认证失败、按前缀删除的合同归 BL-1005。 [`a1117b3bad`](https://github.com/molis-ai/molis-work/commit/a1117b3bad) |
| 99 · T-304 | 共享核心规则、文档、PR 模板和选择器标签按清单对照，多一项、少一项和把名称移到说明栏都会失败。RAC-2444 所在文件 85/85。 [采用提交](https://github.com/molis-ai/molis-work/commit/2757323123) |
| 100 · T-295 | 包名超长及来源不明的卡片已由 T-326 修正，卡片文件 18/18。其它视图的名称与详情来源行归 BL-987。 [`56a0a252d4`](https://github.com/molis-ai/molis-work/commit/56a0a252d4) |
| 101 · T-294 | T-335 将恰好不超上限的原样返回以及超限但切口在普通字符处两种情况写进实际用例。现行 RAC-2726 继续覆盖 SDK 的长度和单元边界。 [`2b9eaefba0`](https://github.com/molis-ai/molis-work/commit/2b9eaefba0) |
| 103 · R-49 | 风险表同笔可空主人和部分唯一索引归 BL-968。 |
| 108～109 · 干净 Home 评审 | 加入邀请只接受 64 位十六进制凭据，其余输入不写成员。错版本的 WAL 库被拒，数据库和 WAL 字节不变。RAC-2716、2717 所在文件分别 7/7、5/5。 [采用提交](https://github.com/molis-ai/molis-work/commit/bc986379c1) |
| 111～112 · T-235 | 大纲提交后页数真的增加，由 T-332 断言。20,000 个 emoji 的 Backspace 在[一组测量](https://github.com/molis-ai/molis-work/issues/1332#issuecomment-6537376782)摘掉封顶处理器后仍卡；[另一组测量](https://github.com/molis-ai/molis-work/issues/1332#issuecomment-6538501793)为 3～23 ms。保留环境差异，原单约定量完即收，不据此更改产品。 [`c05698a13f`](https://github.com/molis-ai/molis-work/commit/c05698a13f) |
| 113、126、154 · 知识检索 | T-329 和 T-333 分别修了选节标题、grep 行起点与提示。RAC-2445 钉住标题的切点；RAC-2446 经过真实宿主捕获模型数据，#1689 又核对顶层键。未读原因的剩余截断归 BL-981。内部键全集是下次改变发送结构时再核的建议。 |
| 114～117 · T-317、308 与文档 | 测试核实单一 registration 导出、在真正切点上的两单元字。Feed 架构说明、旧 typed 通道和 CI 分片时间的表述均按对应提交修正。 [`2f3992999a`](https://github.com/molis-ai/molis-work/commit/2f3992999a)、[`562f207c7b`](https://github.com/molis-ai/molis-work/commit/562f207c7b) |
| 118 · T-302 | RAC-2447 及 T-367 的正反例验证两个插件不能登记同名文档来源。readExternal 的读取用例和 Home 参数归 BL-1003。 [`dc75e22bb`](https://github.com/molis-ai/molis-work/commit/dc75e22bb) |
| 124～125、127、171 · 浏览器首败 | T-338 强化超时诊断，旧根因仍未知；原设备 Node 崩溃、首次引导与页面 Esc 的历史失败、重试和后续观察均归 BL-1009。 [`dc544a3979`](https://github.com/molis-ai/molis-work/commit/dc544a3979) |
| 130、132～133、135、139 · 沙箱、MCP 与 Feed | 每请求独立取消原因归 BL-1006；不合格会话号是否绑定工作别名归 BL-1007。Gmail 来源、端口及演示库已无原来的 tokenRefs 写入，宿主仍剥离保留键。macOS 剪贴板仍归 BL-972，private_address 的重试分类归 BL-1008。 |
| 136～137、142～144、155 · Feed、连接器与搜索 | RAC-2711 的替身返回值归 BL-982，安全表归 BL-914。记录槽改绑沿统筹已指定的 BL-921。CONNECTOR_CLIS 还有一处归 BL-983；RAC-2415、2417 已分别断言真实错误码，RAC-2731 注释映射下次碰用例时补。搜索 RAC-2715 已断言错误对象自有键，details 与 cause 均被排除。 |
| 138 · T-318 | 父目录被换的两类拒绝已有 RAC-2435。S-86 漏列归 BL-914；最后检查与删除间的窗口、ENOENT 重试的证明归 BL-944，原文件 21/21。 [`c815b1ab8`](https://github.com/molis-ai/molis-work/commit/c815b1ab8) |
| 145 · T-319 | 原裁定保留现有可达性规则；以后如要把运行时安装记录作为新判断来源，先由统筹定合同，无当前实现单。 [`45be6f2e1`](https://github.com/molis-ai/molis-work/commit/45be6f2e1) |
| 146、152 · Feed、Goals | Feed 词典、产品说明和动作合同的余项归 BL-1012；Goals 树密度恢复及措辞归 BL-1013。 |
| 147～151 · T-353 余项 | RAC-2728 只准 Pages 留一条没有长度参数的双端修剪声明。五处重复和先展开全文的写法归 BL-977；两处浏览器预算例外归 BL-978。灵光大材料的内存峰值仍未知。 |
| 162 · T-319 | T-373 由合成提交采用。RAC-2779 要求保留两阶段的错误码及顺序，并让另一个项目继续返回；RAC-2780 核对已关闭的项目保持静默。 [`e4e98ed331`](https://github.com/molis-ai/molis-work/commit/e4e98ed331) |
| 168 · T-319 | RAC-2783、2784 从真实宿主的 home.events.read 读取项目插件目录与事项，所在文件 6/6。 [采用提交](https://github.com/molis-ai/molis-work/commit/973063c793) |

## 原表 173 行以后的交接记录

[原文保留的时间线](https://github.com/molis-ai/molis-work/blob/22fe801a021ffac1b16d4000aef9b3584f9cf882/coordination/2026-10-28/MISC.md#L173-L256)还写有阶段性候选、已采用的修复和后来追加的 P2。按最终采用情况处理，保留当时失败、重试及原机器限制。

| 原行 | 已核事项与现行入口 |
| --- | --- |
| 175～197 | T-370 的中间度量和最后合入树的测量已分别保留，后者收 BL-935。W5-16 的离线工程验证与真实备份、重建分开，后者归 BL-928。T-122 的三文件 23/23 和证据文档随 [#1706](https://github.com/molis-ai/molis-work/pull/1706)采用；T-149 的签包归属见本批对 BL-589、623 的处置。T-351 的材料过长与密钥延期边界见原行 129、170。 |
| 199～223 | T-377、T-381 已分别修复本单定位的重复通知／重挂载和等待过早返回。T-379 的快捷键隔离证据不覆盖运行中终端，场景 8 的重载证据沿本批设备 A 的原件，场景 4 的可见回显仍归 BL-930。T-116 等候选的阶段性计数保留在原文；最终 Full 与本人体验按 [#1725](https://github.com/molis-ai/molis-work/pull/1725) 和[第 01 批](batches/01.md)分别结算。 |
| 225～239 | T-382 去掉旧成果路由和 BL-926，T-388 修等待顺序，T-389 修已复现的菜单恢复问题，[#1718](https://github.com/molis-ai/molis-work/pull/1718)的采用不能倒推旧 Linux 首败的根因。T-392 的构建路径、T-395 当次查出的启动问题与其余现场分开。 |
| 242～250 | goal-inputs 二次打开与 UI 审计 CDP 超时按原条件留 BL-1009。MemoryExportPackage 夹具仍是版本 1、当前合同为 2，归 BL-1014；空 Goals 项目的 momentum 400 归 BL-1015。 |
| 252～256 | 审查框同槽展示的旧回执归 BL-1016；两个 Goals 测试的分步关闭和资源清理共用 BL-1017，保留原统筹交接。 |

## 已有处置的历史风险

[风险原表](https://github.com/molis-ai/molis-work/blob/22fe801a021ffac1b16d4000aef9b3584f9cf882/coordination/2026-10-14/RISKS-AND-DEFERRED.md)。采用提交均可从本次核账的 main 到达。涉及旧机器、真实资料和本人验收的条件仍按相应待办结算。

| 原风险 | 处置 |
| --- | --- |
| R-02、03、14 | 原协调表已交接同事并行开发和机器负载；借用工作树的同步工具曾选错工作树。现行并行开发手册规定独立工作树、构建／浏览器槽位和进程归属。原机器的网络观察留给 R-67。  |
| R-06、11、17 | Sessions SC-4 随 #1194 采用。C8-3 随 #1185 采用，执行方按钮余项归 BL-1034；Goals S9-2 的旧库迁移由干净重建取代，本人验收仍归 BL-929。#1164 随项目删除清理角色运行记录。 [`f880df0c4`](https://github.com/molis-ai/molis-work/commit/f880df0c4)、[`3e96b40ea`](https://github.com/molis-ai/molis-work/commit/3e96b40ea) |
| R-08 · Shelf S2 | 在同一台机器用离线依赖、相同 Node、各自临时 Home，对 [#1051](https://github.com/molis-ai/molis-work/pull/1051) 的最终候选 `3cea145b10` 和合并时的主线基线 `1ded3c218d` 分别构建，再串行跑原评审点名的三份用例。候选依次 8/8、12/12、10/10。基线依次 7/8、12/12、10/10，Shelf AI 的“every recipe reaches its registered instruction”报模型请求失败或超时（本地夹具）。第一次基线构建期间工作树被移除，重新从相同提交完整构建后才计入结果。原首败和 Swift 环境记录仍留原评审；这次候选三文件通过，未复现当年材料提取的三个取消／撤回超时。 |
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
| R-01、07 | 最终 W6-05 已按[统筹 Full](https://github.com/molis-ai/molis-work/actions/runs/41710265080)结算。本机原清单中未证明的提交对照归 BL-988。重复首败和 busy-feedback 归 BL-412；保留帧耗时与首次失败，T-354 的着色改动只验所覆盖的负载。 |
| R-26、27、30 | 并发删除时读设置的 500 归 BL-989；原机器工具链的决定归 BL-990。Rust 替换同时间文件的单例测试仍在，旧失败的归因归 BL-991。 |
| R-32 | 防腐权限表已逐项给出去处，第 01 批在 [#1745](https://github.com/molis-ai/molis-work/pull/1745) 核回采用情况。真实操作和本人认可留 BL-928～930、940，双实例余项留 BL-933；不能用历史派工完成替代这些验收。 |
| R-43、45、46 | personal 的安全编号原冲突已有调整，合流时核语义及拒绝用例归 BL-992。不同插件的动作名归属归 BL-993。ACA005 搜索披露前的授权固定已在 [#1221](https://github.com/molis-ai/molis-work/pull/1221) 采用，ACA003 的单独证据归 BL-994，旧 MCP 配置归 BL-928。 |
| R-56、67、73 | 首个项目前的规则设置归 BL-995。Wi-Fi 的三工作日观察归 BL-996。设备 B 的[同树浏览器对照](https://github.com/molis-ai/molis-work/issues/1332#issuecomment-6516969288)已定位 Chrome 151 的输入缺陷，[五条线的版本回执](https://github.com/molis-ai/molis-work/issues/1332#issuecomment-6517042142)未核齐，归 BL-997。 |

## 旧 PR 评审

[批次正文](batches/02.md#batch-02-item-1)已列出部分 PR。这里补重合的意见及后来改变其结论的实现。注明的 Full 文件数出自[防腐最终运行](https://github.com/molis-ai/molis-work/actions/runs/41710265080)。

| 原 PR | 采用结果与仍需跟进的部分 |
| --- | --- |
| [#1182](https://github.com/molis-ai/molis-work/pull/1182)、[#1306](https://github.com/molis-ai/molis-work/pull/1306) | 接续恢复仍以 continuity:local-restore 建项目，不能把首次打开时由本人初始化 Goal 的事件也归到恢复服务。设置页已找不到旧 settings-return 的读取路径；该键不作现行回到引导的合同。 |
| [#1244](https://github.com/molis-ai/molis-work/pull/1244)、[#1292](https://github.com/molis-ai/molis-work/pull/1292) | 桌面测试真正打开 SSE、升级 PTY 和未完成的 HTTP 请求后停服，验证清理及退出 0，RAC-119 所在文件 14/14。常驻宿主启动只传路径、locale、临时目录和时区等允许项，启动状态管道用完会关闭 fd 3。 |
| [#1246](https://github.com/molis-ai/molis-work/pull/1246)、[#1301](https://github.com/molis-ai/molis-work/pull/1301) | 卸载清理失败后的重试可跨 Runtime 重启；清理在途时重装被拒，已完成的重试可再调用。RAC-196、357 所在文件 39/39。Home 实例的协调声明错误现在给 plugin.state_invalid，安装记录 crashed 并带同码，启动钩子未执行，正反两例 2/2；原 RAC-745 说明也已更新。 |
| [#1250](https://github.com/molis-ai/molis-work/pull/1250)、[#1279](https://github.com/molis-ai/molis-work/pull/1279) | 随宿主提供的集成按 host，独立发布的签名包按自己的签名。T1 入口缺少宿主信任即拒（RAC-381-T1），包被篡改、格式不合的拒绝已有 RAC-382、383。S-75 规定只有同一固定密钥可以嵌套，指纹文字会 trim、转小写识别，声明与信任密钥不符即拒；已有冲突安装在启动前失败。身份文件 9/9、信任规则文件 9/9。安装记录与同意记录跨库，仍须保证后者失败时同意不会生效。 |
| [#1282](https://github.com/molis-ai/molis-work/pull/1282)、[#1285](https://github.com/molis-ai/molis-work/pull/1285) | 默认来源有发布者身份。RAC-389、389-T4-RETURN、390 覆盖另一发布者、来源暂缺后原来源回归、本人手动选择的来源。S-77 有真实页面试图借 actions:delegate 撤回同意时的拒绝及运行中撤权后的重对账，文件 8/8、3/3。撤默认输入组时的已选组归 BL-587。签名包先于落盘的拒绝和另一发布者的点分路径见 T-175、BL-970。 |
| [#1262](https://github.com/molis-ai/molis-work/pull/1262)、[#1266](https://github.com/molis-ai/molis-work/pull/1266) | 登记之外的 project_rows 已在安装时拒绝。RAC-562 验项目和 Host 复制 Manifest 的路径，项目行用例 21/21；标签现在明确拒绝控制字符和换行。未来让相应包声明删除时的 schema 预检与账本库归 BL-619、620、622。跨项目清单尊重显式隐藏及 closing 状态；沙箱默认不拿清单，未来场景归 BL-625。 |
| [#1245](https://github.com/molis-ai/molis-work/pull/1245) | Attention 条目从调用上下文取主人，检查该主体种类已在安装清单声明，新写不能替另一 owner 改同 ID 的条目。RAC-807、808 覆盖读取已声明种类与授权后停用；原可空 owner 的历史形状仍归 BL-968。 |
| [#1291](https://github.com/molis-ai/molis-work/pull/1291)、[#1298](https://github.com/molis-ai/molis-work/pull/1298) | 非 host 声明 local_tools 在安装时由 RAC-742 拒绝。桌面文件操作沿 BL-940 本人验收，一次性句柄沿 BL-627。租户目录读取被拒时记“尝试读取，但被拒绝”，成功才记“读取了”，正文用带参数的文案；不把历史 Assets 放行复用到本批。 |
| [#1653](https://github.com/molis-ai/molis-work/pull/1653)、[#1677](https://github.com/molis-ai/molis-work/pull/1677) | Feed 遇到 forbidden 按原调用失败回滚。RAC-2711 捕获替身、SDK 错误分类和重复码归 BL-982，S-100 的登记归 BL-914。已接受同意与权限调整的出处保留；记录槽改绑的原 BL-921 已补回。 |
| [#1251](https://github.com/molis-ai/molis-work/pull/1251)、[#1294](https://github.com/molis-ai/molis-work/pull/1294)、[#1295](https://github.com/molis-ai/molis-work/pull/1295) | S-55 已指向 Module 的 originalFileOf，写入、读取和删除走原件存储。RAC-2344／414 实际删本项目原文件并保住另一项目；旧 artifact-action-schemas 文件已无。RAC-421 拒绝把另一模块的边算成 Goals 引用，文件 2/2。通用链接输出及静态扫描边界归 BL-1018；取消不能吞错、联系 Goals 的双读归 BL-986。Goals 专用调用固定 provider_id；旧授权记录归 BL-928 的重建，不能由库代码签真实授权。 |
| [#1258](https://github.com/molis-ai/molis-work/pull/1258)、[#1277](https://github.com/molis-ai/molis-work/pull/1277) | 目录映射的快照只对应那次请求；项目端口现在调用 workspacesFor，不能将一次读取当成长期快照。S-15 正文、代码位置已分段。RAC-641～644 不让竞争的搬运／复制提供方被任意选中，拒绝前保持位置。RAC-636 验冒名注册时原贡献仍在。RAC-635 的源码边界及关联名归 BL-1018；输出合同在当时的 PR 回顾，当前版本按 #1762 顺序复位。 |
| [#1273](https://github.com/molis-ai/molis-work/pull/1273)、[#1304](https://github.com/molis-ai/molis-work/pull/1304) | Agent Host 用 hasOwn 分派帧，恢复对象作为独立参数交给 guardedRecovery，store 的 sessions、runs、startingSessions 只读。余项归 BL-1019。session_busy 现为 conflict；两个 Host 不可用码和写入检查器不可读的码已有直接断言。#1304 当年的入队顺序留 R-57，原 PR 模板不能作现行证据。 |
| [#1243](https://github.com/molis-ai/molis-work/pull/1243)、[#1299](https://github.com/molis-ai/molis-work/pull/1299)、[#1222](https://github.com/molis-ai/molis-work/pull/1222) | 请求助手与包内浏览器入口迁移后的旧文档出处归 BL-1010。capabilities 来源只认各包 package.json，生成登记以 catalog_order 排序；RAC-576 已换成只拷受跟踪文件的干净夹具，Verify 的纳入建议归 BL-1030。展开状态首败的原因仍未知，归 BL-1023。 |
| [#1283](https://github.com/molis-ai/molis-work/pull/1283)、[#1308](https://github.com/molis-ai/molis-work/pull/1308) | 不留数据卸载时清理场景默认规则，别的项目仍有安装时保留，回执说明沿 BL-532。RAC-839 对 bind、runScene、usages、targets 都按真实提供方过滤。RAC-845 的跨库边界、RAC-850 的安装隔离见 R-60、61。默认规则主体集合和按提供方种入时机归 BL-1022，首页首次使用归 BL-995，动态动作目录归 BL-531。Linux 探针及快照路径见 R-58、59。RAC-407 的平台条件、信任说明与固定等待归 BL-1031，重复的术语与失效路径归 BL-1010，布局特判与演示引用归 BL-1032。原评审的 agent.run.read.v1 命名由 #1762 处理，旧静态规则不能替代正式工具调用。 |
| [#1302](https://github.com/molis-ai/molis-work/pull/1302) | 插件样式按需发送，门禁用参考和当前预算比较；前缀如何跨两次变更、选择器分类与真实样式对照归 BL-1020。词典归属、注册时碰名、共用键及重复的 Goals 翻译绑定归 BL-1021，配合 BL-118；其它英文呈现余项见 BL-1011。历史资源增加不算当前许可。 |
| [#1310](https://github.com/molis-ai/molis-work/pull/1310) | S-86 目录检查的非原子窗口、重试归 BL-944；真实使用中的项目与 Home 判断账分属两库（R-60），按安装读取与丢弃见 R-61。已移除的安装最后一次解绑、别处仍装时保留由 RAC-865 覆盖。签名包读取损坏时不能卸载归 BL-915。集成信任／账号／方法归 BL-1024、690；判断读取归 BL-1022；权限页错误与凭据隔离归 BL-1026，终端文档、接收动作视图与站点清单归 BL-1027。巨大单元仍按实测和当前登记逐项维护，沿 BL-1030。首页聚合失败归 R-63。 |
| [#1311](https://github.com/molis-ai/molis-work/pull/1311) | Home 安装按范围取得服务，连接器端口已由 home-plugins 建立；包来源的声明、批准及确认冲突由 RAC-897 检查。包的读回与范围边界归 BL-1025，权限开关的实际拒绝归 BL-1026。评论消息、材料域名和配置大小归 BL-1028。判断规则路由、Feed writer 的跨 await 边界及正文 reclaim 归 BL-1029；关闭项目后旧 disabled 数据归 R-66／BL-928。旧 41／42 批的安全编号与资源更新以合入后的树为准。 |

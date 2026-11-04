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
| 147～151 · T-353 余项 | RAC-2728 只准 Pages 留一条没有长度参数的双端修剪声明。五处重复和先展开全文的写法归 BL-977；两处浏览器预算例外归 BL-978。灵光大材料的内存峰值仍未知。 |
| 168 · T-319 | RAC-2783、2784 从真实宿主的 home.events.read 读取项目插件目录与事项，所在文件 6/6。 [采用提交](https://github.com/molis-ai/molis-work/commit/973063c793) |

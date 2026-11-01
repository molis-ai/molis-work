# T116 后继：T402 / T403 窄审

**结论：归属和顺序认可；正式实施书还须补清下列三处具体接缝。** PR1c没有误代签完整PR1；T402补object_action属于原已接受未落地范围；对象URL在T402同批切换、T403随后搬客户端的分工成立。T403闭包映射和资源审批继续WAIT，父片实际采用及文件锁也继续WAIT。本结论不批准实施或新增资源。

依据：`/private/tmp/t116-successor-plan/decision-t133.txt` 原方案目标1/2及片2/3；同目录 `decision-t116.json` 裁定正文；本目录PLAN。必要代码只读本地origin/main `b6f92222fce89dfba756a580768889292cfe9967`，未fetch或核远端最新。未重审T116金样/PR1a/1b，未实施、build/test、访问真实Home或写coord/GH；仅写本报告。

## 1. 接受的范围与边界

原T133已经明确 `stage_data: {action, object_action?}`、`StagePageModel.object: {id,surface}`、对象GET路由、同贡献已声明main surface、本人项目身份、只读自有单版本动作及dualStageOwner。当前contracts/ui只有action/data，project-stage-data只做整页空输入读取，fragment HTTP仍是Feed具名item路径。因此将缺失合同、SDK校验及必要接缝交T402负责是补原接受内容，不是新功能。旧片1文件名单未完整实现这部分，也不能阻止在正式领单时明确增加这些必要文件。

原T116裁定禁止registration路由函数私路，要求Manifest数据、通用matcher、请求参数白名单与可信身份从context取得；本书沿用它，没有重新引入Goals宿主分派。PR1c列出尚缺Goals舞台/词典/旧拼装，并要求完整PR1采用清单后交接；未把1a/1b或本次审书写成完整PR1完成。这里只认可这个边界，不代签其实现/金样。

T403继续沿clientFactory与公共mount生命周期，不动frame loader种类分支，范围符合原WO。三个资源审批和最终闭包→端口映射未完成，书中明确保持WAIT，不能据此书预签bundle/实际动线或释放共享文件。

## 2. 必须补清 A：对象动作与HTML应绑定同一实际舞台实例

PLAN写了“只接已显示插件”“同贡献main surface”和dualStageOwner，方向正确；但当前列出的接缝还容易落回catalog静态绘制。现行 `stage-renderers.ts::declaredStageFragment` 从BUILTIN_PLUGIN_CATALOG取得贡献，再调workbench全局UiHost；`declared-stages.ts` 也是构建目录的fallback。仅复用这两个函数并在前面调用object_action，不能证明HTML来自选中的运行实例。`project-plugin-stages.ts` 已有运行贡献、Home/project半边、不可用占位及不重复绘制规则，应沿这份事实选择，而非另建路由registry。

正式书需明确一个请求的顺序：解析插件/单段对象id/surface → 从当前项目显示集合及实际舞台owner取得同一Manifest、contribution和scope → 在调用业务动作前核object_action存在及surface属于该贡献且target main → 用该owner对应的本人action client读取 `{object_id}` → 由同一有效贡献画HTML。actor/project/install不能由路径、query或StagePageModel.request指定；stage_data.input保留T116已接受形状，不能借它把任意查询参数合并进固定object输入。

身份继续沿现有 `bindLocalWebAction` 的单动作权限收窄和Runtime授权检查；不能把原Feed专用的宽权限client直接当通用对象读口。异步读取期间owner停用/撤权/换实例，结果不得交给另一实例或catalog fallback渲染。复用现有Runtime可用性/世代控制，不新增持久身份账。对象端点的拒绝不能经整页用的 `optionalPluginQuery` 吞成200空对象页；整页对已接受的missing/disabled/forbidden占位规则则保持。

这是“显示实例/身份/拒绝”已接受合同的准确落点，非扩大产品要求。正式允许路径若需要 `project-plugin-stages` 或现有Home舞台接缝，根应按最终父片实际差分纳入锁，而非只写“必要接缝”让作者自行扩大。验证至少要直接区分：同名但另一实例/另一贡献的surface不能借用；未显示、无object_action、非main在业务动作前拒；双实例只读/画选中一半；读取中失效不画出新内容。

## 3. 必须补清 B：第二main surface的整页选择规则

当前Feed `ui.ts:160–168` 的main表面包含workbench、workbench-fragment、source-workbench、persisted-detail、frame-block。source-workbench已经是main，单把“改成第二main、按声明挂载”写进书没有给出新的区分条件。若枚举所有main，既会重复挂列表，也会用没有object的数据画阅读器；若仍只选workbench，source-workbench就丢失。

需要在现有声明/渲染接缝中写明有限的选择方式：整页默认舞台和附加舞台由哪一项现有声明或最小声明补充选出；按需对象surface与fragment不参与整页自动挂载。同样，directory/overlay按实际运行贡献挂载，并对已由Runtime画过的同一贡献/surface去重；仅以contribution id全跳过也可能遗漏它的附加surface。沿同一份stage数据绘制，不为每个surface重复调用stage action。

本审不要求新surface框架或Host维护Feed名字表。作者在原accepted“第二main按声明挂”的范围内给出最小明确表达，根冻结对应字段/文件即可。要求的可观察结果是source-workbench恰好一次、默认舞台恰好一次、整页没有无对象阅读器/重复fragment；目录和overlay也不被旧专用拼装再画一遍。

## 4. 必须补清 C：两处客户端对象URL写完整

本轮定向检索apps/plugins生产源码，真正产生旧 `/api/stage/feed/items/` 请求的两处与PLAN一致，其余命中为旧说明。T402连同服务端删除旧路由一起改，能够避免两片间断档；T403继承最终文件搬迁，不重复切路由。

准确改法应写入书中：

- `navigation-feed-stage.ts:99` → 当前项目 `route("/api/stage/feed/objects/" + encodeURIComponent(itemId) + "?surface=persisted-detail")`。原普通阅读器没有surface参数，旧Host默认给persisted-detail；新通用对象路由要求声明的s，不能只换items为objects，也不能在通用Host保留Feed默认surface分支。
- `frame-container.ts:123` → `toRoute("/api/stage/feed/objects/" + encodeURIComponent(itemId) + "?surface=frame-block")`，保留项目前缀、对象编码、原请求/错误处理。route/toRoute用各自原端口，不另造URL系统。

`/api/stage/feed` 与 `/api/stage/inbox` 的整舞台URL本身不变，不应为搬家另造地址。普通阅读器仍需得到匹配entryId的 `[data-feed-detail]`，frame仍得到原reading结构；验收不能只看新URL返回200。坏编码、空/多段对象、缺失/非法surface不得调用业务动作或泄露未过滤query，按既有HTTP错误/不匹配责任明确处理。

这三项均是现有约定的工程接缝补全，无需新产品选择。修订后可认可这份限定接续范围；T403资源具体审批、闭包端口清单、最终前片接口与锁仍按原WAIT条件处理，不因本报告解除。

— Codex，2026-10-31，T116后继窄审

## 增量结论：§4.1–4.3 修订复核（2026-10-31）

**通过，原 A/B/C 必修在工程书层面闭合，本轮无新增必修，关闭本次书审。** 父片实际采用/最终接口与文件锁继续WAIT；T403闭包端口映射、资源实测及审批继续WAIT。通过不代表实现、测试、真实UI或完整PR1已完成。

本次仅复核上述三节与对应准确路径增量；必要源码仍绑定本地origin/main `b6f92222fce89dfba756a580768889292cfe9967`。回读现有UiRenderRequest、stage-opening归属校验、Runtime绘制结果及Host→shell的plugin_stage_ids消费者，未fetch、实施、构建测试或改coord/GH/真实Home；仅追加本节。既有1a/1b和金样不重审。

- **A关闭**：§4.1先从显示集合与实际Home/project舞台owner取得本次绑定，在业务动作前核同Manifest的object_action及同贡献main surface；单动作权限收窄，固定object_id，可信身份不取请求。await后按原实例/运行世代和control复核，失效拒绝，既不换半边补成功也不以catalog复活。读取结果、object模型和HTML明确属于同一有效贡献；整页占位与对象拒绝已分开。
- **B关闭**：stage-opening view的可选stage_surfaces是有限完整main列表，省略默认workbench，Feed明确追加source-workbench；不按所有main推测。SDK负责可见形状和view归属，运行时同owner descriptor负责surface存在及main目标校验，职责与现行合同可见性一致。directory/overlay沿原target槽选择，同owner只读一次并复用模型。绘制结果以现有UiRenderRequest的contribution_id/surface对传递并去重，替换贡献级ids的Host→shell消费者已逐文件列出，能避免“默认已画便漏掉附加surface”和重复默认绘制；不再维护第二套粗ids补绘。未列对象/fragment不自动挂载，原不可用/撤权不借catalog恢复的约束也保留。
- **C关闭**：普通reader显式persisted-detail、frame显式frame-block，T402同批改服务器与原位两client，T403继承最终差分搬迁。项目前缀、对象编码和原响应结构均有固定预期；缺失/重复歧义surface及非法对象在动作前拒，query不进入固定输入或未过滤request。整舞台URL保持原合同，无旧路由兼容段。

本轮具体字段与绘制结果变更足以解决原P1，所列源码/合同/API与现有测试接缝是同一有限实现路径，不要求新增框架、名单或审计。后续按原RAC执行代码与真实动线验证；本报告不将书面oracle计为已通过结果。

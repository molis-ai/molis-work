# T384 两项 Full 首败：有限增量裁决

**结论：两项均是真实首败，当前证据不足以认定本次新增的必修回归，也不足以认定无关或环境原因；与M→H的因果关系保持UNKNOWN。原H的本地二审可合结论保留，没有新增必须返工项。内部retry通过只证明同树后一次执行通过，不消除首败或补足因果。**

准确对象：M=`6729a2d4655caa603daa369f99884e09c4726bde`，H=`4404e142662cbd7895f46c1c6df6e5efe5e6e135`，tree=`ecf513543c29653e1be8eb44cf684efc14a3800d`。已读验证线最新FULL-REPORT及shard3首败原文；报告读取时已更新为16/16及聚合success，checkout=`75239fddf8ffc07b792cc7991ea30b040bbc8342`、parents=M/H、tree同H。本线仅据原件做下列关系裁决，不另签整份Full审计或最终采用。

## onboarding-journey：移除网页组之后未退回一组

首轮13/14，失败在`:172`。准确阶段不是“网页正文未导入”：此前目录4行、网页正文输入后两组、焦点保持和布局断言均已过；随后实际点击`.mw-file-group[data-group=browser] .mw-file-group__x`，等待组数从2退回1超时。原件只给toast=undefined及焦点仍为网页正文textarea，**没有失败时实际组数、组kind、remove事件送达、selection请求/响应或journey状态**。因此既不能证明移除API失败，也不能证明click没有送达或渲染未完成。

M/H的该测试、`goal-browser`、layout/configured-models夹具、test-kit、onboarding renderer、`scripts/context-onboarding.ts`以及该材料选择/保存服务链没有自有改动。现行客户端的removeSource会清材料与selected，save会清inputTimer并经saveQueue串行，click分支保存后render；本次没有改这条链，未找到新加的重选/回写路径。共享装配并非全无变化：T116更换renderer组合入口，T148把onboarding的Runtime识别接到平台终端并移去generic分支；后者用于初始化/TUI选项，失败发生在sources阶段，尚未进入该路径。T143模型设置变化也不能仅凭同属Host推作这次移除失败的原因。

**裁决：未发现当前delta对该失败点的直接语义改动或已证实的修复对象。保留当前树材料移除的未解释稳定性信号、因果UNKNOWN；不按“文件未改”排除间接组合/时序影响，也不归因机器负载。**

## page-interaction-flow：Esc之前的真实保留层前置条件未成立

首轮2/3，失败在`:42`。测试先在真实Goals页等到了`details[open][data-layer-open]`，经过Dock往返和Home后打开settings；当时settings exclusive、标题、Dock无当前项及历史按钮断言均已过。随后等待仍展开的kanban分组位于hidden/inert祖先下超时；**还未发送后面的Esc**。它不是菜单打开操作超时，也没有执行到“Esc应关闭设置”的断言。

现行PIF-ESC-01合同要求真实分组状态留在hidden/inert区域，再证明它不截获Esc；页面离开再回来的状态保留也是现行导航承诺。该等待有合同依据，不能因retry绿删掉、放宽或改成伪造DOM。日志只证明组合谓词未成立：body已是settings，却没有当时kanban/展开组/标记数量、实际祖先链与刷新事件，无法区分分组不在、被合拢、标记缺失或祖先状态不同。焦点body摘要不补足这些事实。

M/H的两个相关测试helper及test-kit相同；`tab-workspace.ts`、panes/places/plugins与navigation-presentation、frame-container、Goals的kanban-ui和momentum/refresh/navigation客户端均未改。现行openLayer仍排除hidden/inert祖先、无布局及不可见元素；实际池搬移/cover呈现与分组刷新实现未被本delta替换。**相关生产入口有真实交集**：T116迁移Goals绘制与UiHost适配/HTTP渲染接线，T362更改settings地址声明/过滤和导航行属性。已核这些差异不直接改分组展开或隐藏层选择，但不能笼统说该场景与四片无关。原独立66完整HTML相等支持迁移的覆盖输入静态输出，没有覆盖本次异步Dock/刷新/cover交错，不能拿它证明保留层始终成立。

**裁决：首轮确实未满足真实保留状态前置条件；没有证明Esc处理器回归，也没有定位到当前合成中新出现的状态丢失代码。新增必修回归未确认，T116/T362组合关系仍UNKNOWN。**

## 对既有结论的影响与证据边界

原端口/独立golden/权限接缝的本地终审不撤回；本次未发现应改动哪一条当前实现的充分证据，不提出新本机执行或重复Full。两文件分别记为“首败、整文件retry通过、因果UNKNOWN”，不能称首轮全绿、已证明main基线或环境偶发。无准确M的同路径失败/通过对照，也无失败现场的上述分项状态，本审不补这些未知；本轮不审计其它run是否已触发同文件重复首败，根据已有历史按§9裁定，不以本文豁免。

实际Full终态、适用SI与最终§8采用仍归根；当前Full绿也不倒签旧T116/T143失败/UNKNOWN。本线仅读既有日志、Git对象与现行合同，写本文件；无本地执行、浏览器、构建、新树、源码/refs或GH操作。

— Codex原T384二审线，gpt-6.1-sol。

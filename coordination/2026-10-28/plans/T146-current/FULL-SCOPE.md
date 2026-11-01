# T146 下一轮最小同步准备

只读准备完成。冻结作者候选仍 `b2cb0e158a68ebf1d056f47924de1075338ebd0f`，tree `88cb586d8197de9f2449b2363acb674159dd2a08`，工作树干净；没有 merge、源码/索引/ref 改动、构建、测试、push/GH 写入。只读 merge-tree 的新对象写入本目录独立临时库，读取完成已移除。根仍需明确最终 M 才执行。

## 实际输入

| 已采用输入 | 对本轮的实际影响 |
|---|---|
| `4b04947e7d17bbb046ca67e2ba0e2728fcd25ea6`，相对旧 M `3fd857792` | T381 修复 `goals-dialogs.e2e` 等待；T382 重命名 Artifact HTTP 源文件、改调用 import/类型参数及边界检查路径，并同步文档/测试。工作台 i18n 仅改注释。锁、package/build 脚本、page-assets 门禁和资源账本未变。 |
| 本轮实时远端 main `6729a2d4655caa603daa369f99884e09c4726bde` | 已有父 `4b04947e7`，提交为 T383 #1711；相对父仅 `tests/pages-actions.e2e.test.ts` 14+/1-。这是观察值，不能代替根的最终冻结授权。 |
| T146 六路径 | 与上述两头的隔离 merge-tree 都 exit0；自有增删行全等，scope 仍六路径。`privileges.md` 接收 T382 顶部路径说明，需保留该说明和 T146 PG070 行；因此本文件将不再与 b2cb 同 blob，其余四个非资源文件不变。 |

原件 `next-readonly-binding.json`：4b 合成预测 tree `deb967ea132b23815158f4096431709d55f076da`；6729 合成预测 tree `da3f567c3c350576972579cea05cf803269c14db`。均是静态预测，不是执行结果。两者 settings 预算均827276，其他47项沿各自 M；门禁脚本沿 M，不占 T384 workbench 增长许可，不复制未采用分支。

## 根给最终 M 后的最小执行

1. 回读 clean/准确 M、已采用祖先与差集，只正常 merge 一次；核六路径增删行、T382 说明及 T381/T383 测试被保留。若 M 比上述快照更晚，先查实际新增输入。
2. T383 本身只改测试，不要求重建；但 b2cb→最终树还包含 T382 宿主源码改名/调用，故旧 b2cb 整体构建不能直接签最终源码。按规则在公共 build 槽做一次匹配整体 build，隔离系统 HOME/Foundation/XDG、file backend、adhoc。已有**精确最终 M** 的有效匹配资源捕获可以复用；否则需补对应基线构建/served 捕获，不用预算表代替响应体。
3. 候选捕获48项：只 settings.css 相对 M 减77638 B，预期904914→827276；其他47项逐 bytes/hash 同 M。任何额外资源差异先报证据。仅保 settings 一行下降，不改增长许可。
4. 对最终头执行 health/boundary、页面资源/插件样式、导入检查、diff 与 fresh fetch→secrets。旧 EOF 空行 P2仍按已知来源记录。API/动作无新改动时沿现有健康快照核验，不重复旧 Node14、67文件或三变异，不本机 Full/七浏览器。已采用 T382 的验证归其自身来源，不为本单重演。

## 仍须结算

按正式裁6543667203，新准确头 Linux Full 应核真实 checkout/tree、构建和下列**七完整文件**的执行结果，逐文件保留 fail/skip/retry，普通 CI或顶层绿不能代替：

- `tests/plugin-picker-pins.e2e.test.ts`
- `tests/english-surfaces.e2e.test.ts`
- `tests/hover-actions.e2e.test.ts`
- `tests/memory-settings-cas.e2e.test.ts`
- `tests/connector-plugin-slots.e2e.test.ts`
- `tests/workbench-deferred-clients.e2e.test.ts`
- `tests/shelf-plugin.e2e.test.ts`

名单已从原PR验证评论只读回核。旧10/39、基线0/38、补丁组合47/48和picker19/21各保原来源；旧根因UNKNOWN、其它HOLD、EOF P2不销账。视觉仍由独立二审结算，缺少成对视觉截图和目标路径证据；Full通过、CSS字节相等、旧Node14均不能替代视觉/产品实操或用户验收。新准确CI/Full和推送由根安排。

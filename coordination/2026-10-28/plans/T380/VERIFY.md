# T380 独立验证结果

**通过：准确 H 的完整 `tests/plugin-tab-groups.e2e.test.ts` 首轮 3/3，fail/skip/cancel/todo 均 0，retries=0，自然 exit 0。** 本线独立执行覆盖原右 Goals 页面空白路径及左栏隔离、刷新、关闭后的操作；没有重跑作者 18 unit/17 browser 批次。此结论限定于该完整文件和实际断言，不签 W6 整体、资源许可、CI/Full、合入或用户验收。

## 执行与准确输入

- H `b4382ea8f7ef1c21981dc31d1c4ee1432efe8f5b`，tree `098753789223205b66a86a42621155a4a0aaba93`，B `3fd857792a27352030ac8f3544a3b57d418febc1`。
- 实际运行于 2026-10-31 **19:12:34–19:12:58 PDT**，23.59 秒。绝对 Node 路径 `/Users/yijunwang/.nvm/versions/node/v24.14.0/bin/node`，v24.14.0、ABI137、darwin arm64。命令为 `node scripts/run-tests.mjs --jobs 1 --browser-jobs 1 --retries 0 tests/plugin-tab-groups.e2e.test.ts`，由共享系统 TMPDIR 下公共 browser 槽包裹；无 case 筛选、重试或第二次完整执行。
- 复用作者冻结树 `/private/tmp/t380-dev` 的准确匹配产物，未安装、构建或修改作者文件。执行前后 H/tree/clean 均一致；最终测试 SHA-256=`a9edbbcc771122c7d8c11bdebe03577fae1813dc369a01c17d30d74181926276`，生产文件 SHA-256=`6317790295f7fa66271770544fa81a3b8bee51d0142478713a191d29d989f8f7`。两次重新计算 source digest 均等于 manifest 的 `a4d259b84e2e4bb6672f4aa0fa27591dd31b776c6180c5ceb0fb1c7a601c1b03`，manifest 创建于 `2026-11-01T02:00:41.754Z`。原件为 [binding-before.json](/private/tmp/t380-verify/raw/binding-before.json)、[binding-after.json](/private/tmp/t380-verify/raw/binding-after.json)。

## 实际结果

| 完整 case / 断言路径 | 本次结果 |
| --- | --- |
| RAC2804：真实双击 CORE 后右分屏，点击正确右 pane 的 Goals 组头 | 通过。动态按左右位置绑定 paneId；右活动 iframe 完成加载且无 paneItem，INTERFACES 行有可见矩形，shell.hidden=false，正文含固定 INTERFACES 标题；左 CORE 的固定标题/预期结果保持。 |
| RAC2805：在右 Goals 页面真实双击 INTERFACES | 通过。含 iframe 坐标偏移及内外命中检查；两次 pointerdown 均 isTrusted=true，记录 URL 钉住 right pane 且原页面无 paneItem。打开后右 tab/item URL/frameGoal、固定标题和预期结果一致；左 CORE tabId/frameGoal/正文保持。 |
| RAC2806：右侧返回页面、刷新、关闭右栏 | 通过。右列表返回且刷新后仍可见，左 CORE 标题/预期结果保持；关闭后只剩原左 pane、原 CORE tabId 和正文；真实点击工作按钮后 CORE 工作展开区可见。 |
| 既有 PTG-01/06/07/09 完整 case | 通过；保留原文件的组、标签、对比度和分屏撤销断言。 |
| 既有 D24 完整 case | 通过；保留列表多选和中键后台打开断言。 |

上述 RAC 三项属于同一个实际浏览器 case，耗时 12.19 秒；文件另两个 case 为 5.56 秒、3.35 秒，没有把 RAC 编号当作三个独立 case 计数。结果由完整原测试的连续断言给出，未另造实操链、修改 DOM 可见性、清除状态或跳过失败步骤；既有另外两 case 中原有模拟动作仍按原性质记录。原始完整 stdout/stderr 见 [test.log](/private/tmp/t380-verify/raw/test.log)，命令/PID/退出码与时间见 [execution.json](/private/tmp/t380-verify/raw/execution.json)。

## 环境与清理

本线由空环境 allowlist 创建独立 system HOME/CFFIXED、XDG 配置/缓存/数据/状态、Node TMPDIR 和 MolisHome，file secret backend，空密钥变量，ad-hoc signing；不继承私人 npm/git、外部模型/连接配置。使用公共 test-kit、专用 `~/.local/bin/molis-test-browser`，外置启动包装器仅追加 mock-keychain/password-store=basic；实际三次 profile 路径记录在 [browser-launches.jsonl](/private/tmp/t380-verify/raw/browser-launches.jsonl)。新 case 为 1440×1000、light、reduced motion、真实本地 seed 内容。未使用日常 Chrome、真实 Home/4207、用户 Keychain 或模型。

Foundation Home/Library/Caches/Application Support 和 Node Home/tmp 路径检查通过；**Foundation NSTemporaryDirectory 仍指系统用户临时目录，未隔离**，不声明全系统零访问。原件 [paths.json](/private/tmp/t380-verify/raw/paths.json)、[environment.json](/private/tmp/t380-verify/raw/environment.json) 保留此边界。

fixture 自然收尾后，三份临时 Home/profile 均已不存在；作用域进程检查为 0，无需 kill。随后删除本线 runtime 配置、缓存与临时目录，保留原件和外置运行脚本；[cleanup.json](/private/tmp/t380-verify/raw/cleanup.json) 记录删除前后状态。外层公共槽自然退出 0，检查时 build/browser 均 free。作者树执行后仍干净，主检出也干净。

作者 B 同一最终测试 2pass/1fail→候选源码 3/3、逐次右 context 根因日志和其余批次继续归作者来源；提交前 process metadata 的 head=B 不改写成 H。本次独立结果另以提交后的 H 绑定。原 E 网络状态/body 继续 **UNKNOWN**，新 B 的 200 不倒签 E。`workbench.js +199 B` 及严格资源 gate 的既有失败仍待根许可，本线未改预算或许可；无 GitHub 写入、CI 控制或产品源码修改。

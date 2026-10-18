# PGK 候选交接

状态：候选源码已冻结，待 root 整体构建、最终正式浏览器及门禁核验；不是整条 W5-10 完成。2026-10-18，负责人 Codex（pages_handle_writer）。基于 P 的 `4d1d1e029` 与已接受唯一 spec。未提交；未改 spec、HUGE、门禁或快照；未跑本机全量或正式构建。

## 实现与资源

只改五个获授文件：`plugins/native/pages/src/editor-keyboard.ts`（新）、`editor-browser.ts`、Pages README、`tests/pages-plugin.test.ts`、`tests/pages-keyboard.e2e.test.ts`（新）。

37 个原键名和顺序保持，由 shortcutKeys（22项）、blockKeys（5项）、navigationKeys（10项）创建每个 mount 自己的键表，再用 pagesKeymap 合并为原位置的一个 keymap。没有新增监听、缓存、选择事实、控制器或模块可变状态。原 task Enter、baseKeymap、Escape 和其余插件位置不变；唯一传入回调是原 openLink。

mount 752→568 行。新模块物理 258 行（含终末空行的 split 统计为259），最大函数 shortcutKeys66行；blockKeys43、navigationKeys14、pagesKeymap3、verticalArrow25、tabKey14、turnCurrent23、cellNav19。入口 split 行数1092→856（实际物理行数855），仍是原有巨单元，未宣称完全消除。

原命名与分支保留的纯提取候选 served707561 B（比706888多673）；只在键盘职责内合并真实重复后 **706848 B，−40 B**。预览走相同 esbuild参数与现行 Host tightenServedJs，没有修改 minifier、预算、样式或无关模块。正式 dist 仍是 PGP，必须由 root 整体构建再确认。外部 `preview-pages-bundle.mjs pages-keyboard-planned` 已重复确认该数。

## view 参数化与去重等价边界

本地锁定 `prosemirror-keymap/src/keymap.ts` 每次 keydown 都调用 `command(view.state, view.dispatch, view)`。原 Mod-k、Mod-d、块转换/移动、表格列移动在按键时读闭包 view；现在读第三参数。装配时仍不读 view，新的存在性判定只处理 Command 可选类型；正式按键路径总有第三参。setDoc/remount 的新 Chrome 基线验证了状态结果，最终候选须重复跑。

`turnCurrent(id): Command` 仅捕获固定目标 id，按键执行时从第三参取 view，不捕获 view、state、selection 或任何 lifecycle owner。其 body 除存在性检查外与原 turnCurrent 完整匹配，七个键各自的 id 与原绑定一致。此形式复用原七处同形包装；root 已明确接受。不是 getView、withView 框架或新状态。

`verticalArrow(direction)` 只固定方向以及对应 edge/continueEdge/leaveCode 函数；展开为 +1 与 −1 后，每个分支与原 ArrowDown/ArrowUp 的规范化 AST 一致，连 dispatch 的 scrollIntoView 差异和 return 都保持：

1. moved 有 docChanged/selectionSet：scrollIntoView dispatch（若有 dispatch），true。
2. moved 存在但无变化：尝试对应 continueEdge；有 extra 且有 dispatch 才 dispatch，**不论 extra 是否存在都 true**。
3. table edge → column edge → leave code → neighbor atom，依原顺序短路。
4. 最后再 continueEdge；没有 extra 才 false，有 extra 则 dispatch 后 true。

`tabKey(direction)` 只固定 code/list/nest 的函数选择，两个方向分别展开后与原 Tab/Shift-Tab AST 一致：cellNav → code → list → 根据同一 hover span 调 nest；有 changed 和 dispatch 才清 span、scrollIntoView dispatch，**结尾始终 true**。方向映射为正向 insertCodeIndent/indentListItem/indentUnderPrevious，反向 removeCodeIndent/outdentListItem/outdentFromContainer。

`cellNav` 原正文不变：**仅 dir>0 且 atLastTableCell 才 addTableRow**，Shift-Tab 不插表格行；无目标位置返回 false，继续同方向后续分支。nudgeTableColumn 无可移动结果但命中表格仍 true；applySelected 有非空 tr 但没有变化时仍 true，均原样迁移。

复制/剪切仍 execCommand 并原样返回 boolean；Enter、Backspace、Delete、格式、组优先等其他处理器没有算法重写。commandToggle 仍一份供工具栏和键盘调用。

## 已完成证据

- 新 `pages-keyboard.e2e` **先在 PGP 正式资源**（JS+CSS、公开 mount、CDP真实按键）首跑4/4、零失败/跳过，10.76s。四组验证格式/历史/块转换复制/setDoc/remount，Enter task/base回退和组删除/输入规则撤回，表格Tab/最后行/列移动，代码与容器Tab/普通段吞键/箭头与块移动。断言 doc、marks、selection、onChange、undo、focus，不只文字。仅Mac Chrome实操；不声明Windows/AltGr或系统剪贴板。
- 两份 Pages 类型检查通过：`pnpm --filter @molis-ai/molis-work-plugin-pages run typecheck`。
- scoped Biome：2源码+新浏览器测试，无问题。新浏览器测试最长函数52行。
- `tests/pages-plugin.test.ts` 127/127、零失败/跳过。首跑123/127，4处纯旧源码定位断言暴露；现与原先已迁的两处合计6处跟随 owner，方向/Tab 改为同时验证具体方向映射和原调用顺序，原业务断言不放宽。此轮使用原PGP dist，正式构建后 root 重跑。
- `git diff --check` 通过。
- 外部 `check-pages-keyboard.cjs`：37键名、顺序、唯一性；按实际方向常量展开4个镜像handler；5个迁移助手；mount除已声明迁移与槽位替换外完整一致；其余入口函数和公开导出声明一致；54个相对模块无环。新增公共包/API出口为0。

日志：

- `/tmp/molis-pages-keyboard-baseline.log`
- `/tmp/molis-pages-keyboard-types.log`
- `/tmp/molis-pages-keyboard-biome.log`
- `/tmp/molis-pages-keyboard-test-biome.log`
- `/tmp/molis-pages-keyboard-source-tests.log`

外部候选、原文件与只读对照脚本均在 D：`pages-keyboard-planned/`、`check-pages-keyboard.cjs`、`plan-pages-keyboard.cjs`、`optimize-pages-keyboard.cjs`。其中候选入口按原路径 onLoad/onResolve 预览，不要直接用候选目录作独立入口打包，避免依赖身份重复。脚本只是复核辅助，最终以生产 diff、正式构建和浏览器行为裁决。

root 下一步：整体 build → 正式资源确认为706848（或排查差异）→ 新keyboard与README/原相关Chrome（find、insert、menu、drag、clipboard、small-ux、content-editing等）→ README必跑和受影响命令/源码回归 → health/API/boundary/资源与独立只读复核 → 串行更新spec/HUGE/下降快照。没有已知实现阻塞；正式候选实操与门禁尚未由 writer运行。

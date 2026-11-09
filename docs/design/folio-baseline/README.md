# Folio 配色定样

状态：**一骏 2026-11-08 已选「杏纸与常青」grove 作为 Folio 正式配色**，另两套留作未选对照。第 16 批可操作视觉样；这次配色决定不代表 B/C 产品实现完成，生产资源裁法与增长仍待批准。沿用 2026-11-04 的方案 C「旁边一张样张，确认再用」与 2026-11-08 的 Resource Han Rounded v1.910 + Nunito；这里不重新决定字体或设置交互。需求来源：[字体、皮肤与语言系统](../../../specs/font-and-skin-system/spec.md)、[B/C 开工前检查](../../../specs/font-and-skin-system/bc-preflight.md)、[已有外观定样](../appearance-selection/README.md)。本目录不含产品实现。

## 配色决定

三套皮肤共用同一布局、字重、圆角和状态语义，只比较配色。

| 方向 | 桌面与主操作 | 阅读感受 |
| --- | --- | --- |
| **已选：杏纸与常青 / Apricot & evergreen** | 暖杏纸、深松绿、蓝绿焦点 | 温暖、松弛，偏纸张与植物 |
| 未选：鸢尾与水蓝 / Iris & water blue | 雾紫、靛蓝、水蓝焦点 | 清透、明快，偏数字工作空间 |
| 未选：陶白与浆果 / Porcelain & berry | 暖陶白、紫浆果、灰蓝焦点 | 柔和、亲近；错误另用偏橙的红色 |

保留 Soft Workbench 作基准。正文、按钮、错误、链接与状态的对比通过 `check-palette.mjs` 逐组计算；只证明这里列出的前景/背景组合，不代替产品全页无障碍验收。

## 打开与操作

已启动的本机地址：`http://127.0.0.1:4436/`。本次服务进程 PID `20112`（2026-11-08，属于本工作树）；按主会话要求暂保留服务、字体、QA 文件与工作树，PID 以后须先核对再操作。

- 设置页点皮肤，只有样张改变；点「用上」才换整个页面。窄屏是底部 `mw-sheet`，可按 Escape 关闭。
- 顶部「工作台」展示所选皮肤在列表、长文、草稿、错误、数字、等宽代码与内容类别上的效果。它是逼真的工作内容样本，用现有实件组成，并非正在读取真实 Home 的工作台。
- 中英文、明暗切换不重建页面；两处便笺可输入，文字、选区、焦点和滚动保留。皮肤推荐字体与明确选定系统字体可比较。
- 「字体失败」使用实际 HTTP 404；正在应用的外观不变，样张明确回退，不能用上，重试重新请求真实字体。正常加载等待全部八个静态字重文件；未就绪同样不能用上。
- 草稿保存、助理、查看全部等工作台示意动作明确提示仅保留在本页。持久化、多窗口传播、真实 Home、模型、制作/导入/导出自定义方案不在本样里实现。页面重载恢复基线，不把本地演示当成正式选择。

可直接打开某套已经用上的工作台：

```text
http://127.0.0.1:4436/?look=grove&view=work&applied=1
http://127.0.0.1:4436/?look=iris&view=work&applied=1
http://127.0.0.1:4436/?look=berry&view=work&applied=1
```

参数另有 `lang=en`、`theme=dark`、`state=failed`、`sheet=1`。失败状态不会因为 `applied=1` 偷换外观。

## 复用与边界

- `build.mjs` 调用产品 `lookCardSection`、`lookProofSection`，原型从生成结果取现有卡片/样张节点，不手写第二套卡片。现有导出以板的一整节为单位，所以生成材料有未展示的标本；产品源码与导出未改。
- 样张内部保持 `inert`，只作为有名字的图；主按钮不带键位提示，代码折行。字体 loading 状态按需求禁用「用上」，纠正现有板标本 loading 可用的差异。
- 使用现有 `APPEARANCE_BOARD_STYLES`、`lookRules`、`renderSheet`、`renderRadioGroup` 与共用 `kit` 的真实按钮、图标、状态环。窄屏由原生 dialog 提供模态焦点行为，样张同一 DOM 节点移入/移出实际 `mw-sheet`。
- 配色在 `directions.mjs`，每份是 SDK `parseSkinFile` / `resolveSkin` 接受的皮肤数据；基线和未覆盖角色来自现行资源文件。字体方案同样经 `parseFontScheme` / `resolveFontScheme`；不手抄旧令牌表。生成规则同时覆盖 html/body。
- 淡入使用现有实件的 View Transition 样式；动态候选的绑定留在原型。与现有板运行逻辑相同，减少动态效果、后台页、`data-craft-still` 或没有 View Transition 时直接换。没有新增产品淡入组件，也未宣称已接好产品应用链。
- 顶部调试条、页面内固定内容、布局装配和候选绑定仅属于原型。内置卡的更多菜单不在本次皮肤选择样里展示，D 段制作能力仍归第 70 批。

## 临时字体与复现

字体不在本目录、不入仓库、不安装到系统、不进入产品资源或注册表。当前输入、OFL 原文、转换工具和产物都在 `/private/tmp/folio16-fonts/`。字体许可文本来自上游，原版权信息保留；中文修改产物的内部字体名为 `Molis Preview Rounded`，不使用保留名称。正式名称、分发与生产裁片由主会话另行核定。

来源：

- [Resource Han Rounded v1.910](https://github.com/CyanoHao/Resource-Han-Rounded/releases/tag/v1.910)，输入 `RHR-CFF2-CN-1.910.7z`；[OFL 文本](https://github.com/CyanoHao/Resource-Han-Rounded/blob/master/OFL-License.txt)。
- [Nunito 5.3.0 npm 包](https://www.npmjs.com/package/@fontsource-variable/nunito/v/5.3.0)，拉丁直立可变字体与包内 `LICENSE`。

中文覆盖 GB2312 可解码字符与 `U+2E80–2EFF, U+3000–303F, U+31C0–31EF, U+FE10–FE1F, U+FE30–FE4F, U+FF00–FFEF` 中上游实际包含的字符。四个字重均来自上游真实 `wght`；额外的 `ROND` 轴固定在上游默认 100。转换时 `fontTools.reorderGlyphs` 按原 glyph order 规范化 OpenType Coverage 与对应值，修复静态实例化时 `GPOS Lookup` 的 `InconsistentGlyphOrder`，不删 GPOS/GSUB、不变更 glyph order。随后裁剪、切静态，`Cu2QuPen(max_err=1.0, reverse_direction=True)` 转 TrueType，生成 WOFF2；Nunito 同样切 400/500/600/700 静态 WOFF2。CSS 禁用合成字重。

复现（在本工作树根目录）：

```bash
pnpm install --frozen-lockfile --offline
pnpm build
node docs/design/folio-baseline/fetch-fonts.mjs
python3.12 -m venv /private/tmp/folio16-fonts/venv
/private/tmp/folio16-fonts/venv/bin/python -m pip install fonttools==4.68.0 brotli==1.2.1
/private/tmp/folio16-fonts/venv/bin/python docs/design/folio-baseline/prepare-fonts.py
node docs/design/folio-baseline/build.mjs
node docs/design/folio-baseline/serve.mjs
```

生成页面与样张材料只写到已忽略的 `.impeccable/qa/folio-baseline/site/`。服务只绑定 `127.0.0.1:4436`，`FOLIO_PORT` 可调整端口；字体目录由 `FOLIO_FONT_DIR` 覆盖。使用现成预览无需另配字体。

## 本机定样字节

| 字重 | 中文静态 TrueType WOFF2 | Nunito 拉丁静态 WOFF2 |
| --- | ---: | ---: |
| 400 | 1,478,460 B | 16,344 B |
| 500 | 1,487,640 B | 16,460 B |
| 600 | 1,492,944 B | 16,548 B |
| 700 | 1,500,656 B | 16,232 B |

八份合计 **6,025,284 B**。中文每份 7,951 glyphs、7,810 个 Unicode 映射；四个字重均有 TrueType `glyf`、没有 `fvar`，`usWeightClass` 分别为 400/500/600/700。这里只是本机定样全覆盖文件，**不是生产切片策略或资源增长许可**。字体、许可证副本与转换产物仍只在临时目录。

## 验证

```bash
node docs/design/folio-baseline/check-palette.mjs
node scripts/machine-slot.mjs run browser --label '16 Folio design' -- node docs/design/folio-baseline/capture.mjs
```

`capture.mjs` 使用公共 `ChromeHarness` 与 `MOLIS_WORK_TEST_CHROME` / `~/.local/bin/molis-test-browser`；每次独立临时资料目录，结束关闭自己的浏览器并删除目录。截图和 `verification.json` 全部写在已忽略的 `.impeccable/qa/folio-baseline/`，不入库。

矩阵为 3 套 × 1440/1024/390 × 中英 × 深浅：每组合有正常设置页、用上后的工作台、真实 404 失败样张，并逐次恢复真实加载。额外检查真实请求暂停时禁用用上、编辑节点/文字/选区/焦点/滚动保留、键盘开/关窄屏样张、inert 内容与实际使用的字体。截图命名为 `<grove|iris|berry>-<width>-<zh|en>-<light|dark>-<settings|work|failed>.png`。

本轮结果（2026-11-08）：36 个组合、正常/失败共 72 状态、109 张采集图通过；每个组合另核对实际 `data-resolved-theme` 与纸面颜色，避免把控制器状态当成已渲染结果。导航等待新页面标识和准确 query，未沿用旧文档。加载时暂停了 8 个真实字体请求，恢复后实载；选区 3–11、焦点、滚动 360 和编辑节点均保留；底 sheet 的键盘闭环与真实 404 重试通过；CDP 实际字体记录包含 `Molis Preview Rounded` 和 Nunito。控制台未捕获未处理脚本异常。未跑本机 Full，未碰真实 Home。

这份验证只支持隔离原型的布局与所列交互，不证明 B/C 产品工程完成、真实 Home 多窗口同步或一骏本人验收。

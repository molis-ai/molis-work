# Linear 色板与图标库

## 背景与目标
控件原语已经进 Catalog，但作者仍在各处手写 hex 和图标名。Linear 产品用一套克制的锌灰平面、唯一靛 accent、以及给标签/团队用的色相；图标是 16px、圆端、中等字重的线形库。Molis Work 要对齐这套用法，而不是另起皮肤。

完成等级 3：Catalog 可核浅/深色标本；token 成为产品插件色和状态色的源。不宣称替换用户运行中的 4180。

## 当前行为与问题
- 色只散落在 `--page/--ink/--blue/--green/--amber/--red` 和一串插件 hex。
- Catalog 没有色板、没有完整图标表。
- 图标是产品用到才加的 Lucide 子集，缺栏/动作里 Linear 常有的 pin、inbox、edit、board。

## 范围与非目标
范围：
1. 在 interaction-texture 落地 Linear 参照色相：text / fill / soft 三档，浅色与深色分别设计。
2. 语义色与插件色改成色相别名，不再在插件选择器上写死 hex。
3. 扩展 Lucide 图标库并按栏 / 动作 / 对象 / 状态分组。
4. Catalog 顶部增加「色板」「图标」标本。

非目标：不改 Primary=Action 近黑/近白；靛不作第二套实心按钮；不引入 Linear 专有图标文件；不把工作台 chrome 重涂成暖纸面；不迁 React。

## 方案与关键决策
- 平面与字色保持现有锌灰。`--blue` / `--focus` 仍是 Linear 靛 `#5e6ad2`，通过 `--hue-indigo` 别名。
- 色相 text 保证 13px 字在纸面上 ≥4.5:1；fill 用 Linear 更亮的点色，只给 6–8px 标记；soft 是约 11% 洗底。
- 插件色：Goals 蓝、Feed 棕、Sessions 紫、Inbox 薄荷、Artifacts 粉、Shelf 雾蓝、Home/Settings 钢灰。这些是归属，不是状态。
- 状态家族继续映射到色相：idle 灰、progress 靛、attention 橙、hold 青、blocked 红、done 绿。
- 内容面并入同一张表，不另起皮肤。`--content-*` 是暖纸阅读面；`--content-accent` 别名 `--hue-slate`。`--mark-slate/blue/ochre/plum/clay` 是类型色（钢蓝 / 雾青 / 麦色 / 灰紫 / 陶土），无绿。Shelf `--da-*` 只做别名。
- 图标保持 Lucide 24 格、应用面 `stroke-width: 2`（16px 上约 1.33px，Linear 字重）。

## 文件边界
- `packages/design-system/src/palette.ts`：色相/插件/状态/内容平面与类型标记表，生成 CSS 变量。
- `packages/design-system/src/icons.ts`：图标登记与分组。
- `packages/design-system/src/styles/interaction-texture.ts`：写入 token 与插件绑定。
- `packages/design-system/src/primitives/catalog.ts` + `styles/primitives.ts`：Catalog 标本。
- `DESIGN.md`：记录色板与图标库。

## 验收
- Catalog `/__ui/catalog` 顶部能看到色板（平面、字、动作、色相、插件、状态、内容平面、内容标记）和图标分组。
- 浅/深色切换后色相、插件色和内容标记仍可辨，且不是机械反相。 `--content-accent` 与 `--hue-slate` 同色；Shelf `--da-*` 是别名。
- `--plugin-goals` 等 token 存在；插件轨选择器使用 `var(--plugin-*)`。
- 每个 `MolisWorkIcon` 都出现在图标库分组里。
- 定向测试通过；隔离 4182 浏览器核标本。

## 验证命令
```
./node_modules/.bin/tsc -p packages/design-system
node --import tsx --test --test-concurrency=1 tests/primitives.test.ts tests/visual-foundation.test.ts tests/coss-control-language.test.ts
```
浏览器打开 `http://127.0.0.1:4182/__ui/catalog`，浅色与深色看色板和图标。

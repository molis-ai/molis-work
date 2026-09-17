# Linear 字体与字色

## 背景与目标
Catalog 和产品壳已经在 Linear × Coss 世界里，但字还是系统栈，字重大量 450–720，深色纸面也比 Linear 产品亮一截。对照 Linear「My issues」：几乎全是 Regular，选中靠底色和字色，不靠加粗。

完成等级 3：工作台、设置、Catalog、项目列表的字体、字重、平面/字色对齐 Linear 产品 UI。不宣称替换用户 4180。

## 当前行为与问题
- `--font` 是 SF Pro / PingFang。Linear 产品是 Inter Variable + `cv01` / `ss03`。
- 按钮、目录选中、标题用 550/600/680/720。截图里 Inbox / My issues / 列表标题同字重。
- 深色 `--page #121214` / `--paper #1f1f23` / `--ink #f4f4f6` / `--muted #a9a9b1`，不是 Linear 的 `#0f1011` / `#f7f8f8` / `#8a8f98`。

## 范围与非目标
范围：
1. 自托管 Inter Variable（拉丁）+ Noto Sans SC Regular（中文），系统 PingFang / 微软雅黑只做回退。
2. 产品页默认字重 400；层级用 `--ink` / `--ink-soft` / `--muted` / `--faint` 和字号，不用加粗。
3. 浅/深色平面和字色靠向 Linear 产品值；Action 仍是近黑/近白。
4. Home 引言继续用宋体，只把字重收成 400。

非目标：不装 Linear 专有字体授权；不引入 510/590 作为第二套强调；不把 Shelf 阅读面重涂成 Linear 锌灰（内容色走 `--content-*` / `--mark-*`）；不迁 React；不杀 4180。

## 方案
- Inter 文件放 `packages/design-system/fonts/`，`/assets/inter-latin-variable.woff2` 同源提供，避开 CSP。
- `TYPEFACE_STYLES` 挂在各 stylesheet 末尾，用 `font-weight: 400 !important` 盖掉历史 550+。
- 浅色：栏 `#f3f4f5`，纸 `#ffffff`，字 `#222326`，说明 `#6b6f76`。深色：栏/场 `#0f1011`，纸略抬 `#161718`，字 `#f7f8f8`，说明 `#8a8f98`。浅色 faint 保持 ≥4.5:1，不照搬 Linear 在白底上不够对比的 `#8a8f98`。

## 文件边界
- `packages/design-system/src/typeface.ts`、`fonts/`
- `packages/design-system/src/styles/interaction-texture.ts`、`foundation.ts`、`primitives.ts`、`onboarding-styles.ts`
- `apps/local-host/src/web-assets.ts`、`apps/workbench/src/renderer.ts`
- `DESIGN.md`

## 验收
- Catalog / 工作台浅深色：Inter（中文走回退）、正文和标题均为 400。
- 深色 ink `#f7f8f8`、muted `#8a8f98`、page `#0f1011`。
- Home 引言仍是宋体。
- 定向测试通过；隔离 4182 浏览器核 Catalog。

## 验证命令
```
./node_modules/.bin/tsc -p packages/design-system
./node_modules/.bin/tsc -p apps/workbench
./node_modules/.bin/tsc -p apps/local-host
node --import tsx --test --test-concurrency=1 tests/primitives.test.ts tests/visual-foundation.test.ts tests/coss-control-language.test.ts
```
浏览器：`http://127.0.0.1:4182/__ui/catalog` 浅色与深色。

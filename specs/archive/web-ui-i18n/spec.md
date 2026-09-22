# Web UI 中英双语

## 背景与目标

Molis Work Web 工作台、项目列表和设置页目前全部写死中文。仓库 README 已经提供中英两份，产品面向全球用户，但打开页面无法切换语言。

目标：前端展示支持中文和英文，用户可以在页面上切换，选择会被记住。Goal、项目名等用户内容保持原文，不做机器翻译。

## 当前行为和问题证据

- `src/web/render.ts` 的状态、导航、设置、空状态、对话框和客户端脚本都是中文常量。
- `html lang` 固定为 `zh-CN`，日期也固定 `zh-CN`。
- `PRODUCT.md` 写明“界面默认中文”，但没有提供英文界面。
- 最近 README 已增加英文版，前后端语言能力不一致。

## 范围与非目标

范围：

- 项目列表、设置、Goal Tree、Goal 正文壳、决定中心、回收站、归档、对话框和前端脚本里的界面文案。
- 顶栏语言切换：中文 / EN。
- 用 cookie 记住选择；没有选择时看 `Accept-Language`，否则默认中文。
- 页面 `lang`、日期格式和客户端动态文案跟当前语言一致。
- Web JSON 错误里会弹到页面上的提示，按当前语言返回。

非目标：

- 不翻译 Goal 标题、正文、项目名、用户填写的原因、证据摘要、Runtime 回传的事实。
- 不改 CLI、MCP 协议字段、Skill 正文。
- 不引入 i18n 库，不加 URL 前缀 `/en`。
- 不做第三种语言，不做 RTL。

## 用户或调用场景

1. 中文浏览器第一次打开，看到中文界面和顶栏 `中文 | EN`。
2. 点击 EN，页面刷新成英文；Goal 标题仍是原来的中文或英文。
3. 再打开设置、决定中心或另一个项目，仍是英文。
4. 英文浏览器第一次打开且没有 cookie，直接是英文。
5. 无 JavaScript 时，语言切换链接仍然可用。

## 方案与关键决策

1. 中文是源文案。渲染时用 `L("中文")` 查英文表；缺词时回退中文，避免空白。
2. 用请求级 locale（`AsyncLocalStorage`）贯穿同步渲染，避免把 locale 传进每一个内部函数。
3. `GET /locale?lang=zh|en&next=/相对路径` 写 cookie 后回到当前页。`next` 只接受站内相对路径。
4. 链接保持 `/locale`，项目前缀改写时不得把它改成 `/projects/:id/locale`。
5. 客户端脚本读 `document.documentElement.lang` 和注入的英文表，翻译动态 toast、预览和确认文案。
6. 语言切换是顶栏分段控件，两个选项都用该语言自己的名字：`中文`、`EN`。

## 输入、输出与依赖

- 输入：`Cookie: molis_work_locale=zh|en`，`Accept-Language`，`/locale` 的 `lang` 与 `next`。
- 输出：对应语言的 HTML/JSON 提示、`Set-Cookie`、`html[lang]`。
- 依赖：现有 Web 渲染与本地控制门禁；不新增 npm 依赖。

## 文件或模块边界

- `src/web/i18n.ts`：locale 解析、cookie、文案表、`L()`、切换控件。
- `src/web/render.ts`：界面文案走 `L()`，顶栏加入切换，设置 `lang`。
- `src/web/server.ts`：请求进入时绑定 locale，处理 `/locale`。
- `tests/web.test.ts`：默认中文、cookie 英文、内容不翻译、切换写 cookie。
- `PRODUCT.md` / `DESIGN.md`：记录默认中文、可切换英文。

## 验收标准

1. 无 cookie、无英文 `Accept-Language` 时，项目列表/设置/Goal 页为中文，`html[lang]=zh-CN`。
2. `Cookie: molis_work_locale=en` 时，同一批页面为英文，`html[lang]=en`，顶栏能切回中文。
3. 示例或用户 Goal 标题不因切换语言而改变。
4. `GET /locale?lang=en&next=/settings/runtimes` 设置 cookie 并回到该相对路径；`next=//evil` 回退到 `/`。
5. 现有中文断言的 Web 测试在默认 locale 下继续通过。

## 验证

```bash
pnpm typecheck
node --import tsx --test tests/web.test.ts tests/i18n.test.ts
```

浏览器：打开项目列表、一个项目的 Goal Tree、设置三页，来回切换中英，确认壳文案变化、Goal 标题不变。

## 假设与开放问题

- Coordinator / SQLite 内部错误原文可能仍是中文；本任务只保证 Web 自己发出的页面提示双语。
- 演示数据本身是中文，英文界面下标题保持中文是预期行为。

## 实现结果

- 新增 `src/web/i18n.ts`：cookie / Accept-Language 解析、`L()`、顶栏语言切换、仅英文页注入对照表。
- Web 页面 `html[lang]`、日期格式、壳文案和前端动态提示跟当前语言走。
- `GET /locale?lang=zh|en&next=` 写 cookie 后回到站内相对路径；`/locale` 不会被项目前缀改写。
- Goal 标题和用户正文保持原文。
- 测试：`tests/i18n.test.ts`、`tests/web.test.ts` 语言切换用例；默认中文下原有 Web / e2e 测试继续通过。

# S-return-trip-destination

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-return-trip-destination | 从设置回去只到工作台内部（`specs/draft-and-return/spec.md` §2.3、§5）：回程没有任何 URL 字段，回去的位置只由外壳从 `from` 算——关覆盖层（沿用 `closeCover` 的历史语义）、工作台对界面与对象的打开（与对象链接 `?openPlugin=<界面>&openItem=<对象>` 同一检查）、已登记的 `molis:assistant-open`。界面名不合 `^[a-z][a-z0-9-]{0,100}$`、对象 id 超过 256 字或含控制字符的，整张回程丢掉、不导航；合格的 id 一律编码后再拼链接，`?`、`#`、`&` 带不出多余参数。存储里被改成带地址、带 `javascript:`、带外部 origin、多一个字段或版本不是 1 的回程，按形状检查整张丢掉。地址里不认 `return=`（设置地址的过滤表不加参数）；OAuth 回调的去向由宿主按授权记录算，从不读回程。普通链接的需要只按地址查封闭的表推断，从不推断出 `setup` | `apps/workbench/src/browser/return-trips.ts`（`returnTrip`、`returnFrom`、`returnLink`、`needOfAddress`）、`apps/workbench/src/browser/settings-return.ts`（`travel`） | `tests/security-invariants-return-trips.test.ts`「S-return-trip-destination the way back is the workbench's own object link, or nothing」 | 浏览器用例（设置地址带 `return=https://evil.example`、别的项目的回程号）尚未写，见设计稿 §5 ⑨ |

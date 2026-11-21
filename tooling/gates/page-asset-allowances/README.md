# 页面资源增长许可（已退役）

状态：已退役（第 100 批 `100-2` / 决定 58）。

逐字节任务许可文件已统一替换为路由与首屏总载荷预算表 [`tooling/gates/page-asset-budgets.json`](../page-asset-budgets.json)（覆盖工作台、到达页、设置页、插件 iframe 运行时与 `/desktop/pty-client.js`、插件包和字体，以及四个门禁首屏路由冷/热上限）。规则与口径见[开发手册](../../../docs/cli-and-development.md#页面资源体积)与 [`tooling/gates/README.md`](../README.md)。

禁止再向本目录添加新的 `.json` 文件（由 `scripts/check-health-gates.mjs` 守卫）。

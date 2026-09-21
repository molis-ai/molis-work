# 体验这轮设计

这是 Molis Work 的 UI 与交互探索，分支为 `codex/ui-visual-renewal`。所有操作使用此浏览器中的固定样例，不读写生产项目，不运行 Agent。

先读[主方案](proposal.md)，再走下面这条路径。竞品材料用于解释取舍，Demo 用于检验取舍有没有变成更好的操作。

## 文档分工与同步范围

| 文档 | 当前用途 |
| --- | --- |
| [proposal.md](proposal.md) | 本轮设计主方案：研究后的取舍、完整工作路径、逐模块安排、视觉与候选规格变化 |
| [design-intent.md](design-intent.md) | 与主方案一致的设计方向、复杂度取舍及探索边界 |
| [current-product-audit.md](current-product-audit.md) | 当前生产实现的静态审计；第五节说明如何落到最终 Demo，不把原型能力算进生产现状 |
| [research-platforms.md](research-platforms.md)、[research-workflows.md](research-workflows.md)、[research-supplement.md](research-supplement.md) | 各参照的观察、来源和推断；综合后的产品选择以主方案为准，研究假设不等于已实现能力 |
| README.md | 启动、体验顺序、文档导航和原型边界 |
| [verification.md](verification.md) | 实际检查结果与未验证项，不因方案更新而自动扩大验证结论 |

本目录已按最终交互主线同步。正式 `DESIGN.md`、`packages/design-system/README.md`、`docs/cli-and-development.md`、产品规格及现有 `docs/design/taste.md` 尚未改写；建议变更保留在主方案中，待设计收敛并进入对应实现时再同步。

## 启动

在仓库根目录执行：

```sh
node docs/design/ui-renewal-2026-09-21/demo/server.mjs
```

打开 [本地 Demo](http://localhost:4321/?direction=continuum#home)。无需安装依赖，使用仓库自带字体与图标。服务只监听 `127.0.0.1`；端口可用 `MOLIS_DESIGN_PORT` 更换。

## 先走一条完整的工作路径

1. 从首页查看新反馈，进入[核对这次变化](http://localhost:4321/?direction=continuum#change)。比较现行要求与候选要求，判断影响哪些结果、哪些可以保留。
2. 采用或留到下一轮。回首页观察推荐入口与目标依据是否跟着变化。
3. 打开[加入指引的工作稿](http://localhost:4321/?direction=continuum#writing)，修改正文。草稿与交回的成果版本分开保存。
4. 交回这一版，进入[成果对照与审阅](http://localhost:4321/?direction=atlas#workreview)。选一段留下修改意见，再带着意见回到原文。
5. 修改后再次交回，检查旧版与旧反馈仍可读，且旧版的已阅记录不会让新版自动通过。

可在任何位置切换 A / B。两个候选布局共用一份工作；不是两套独立产品。A 保留插件轨和目录，B 将导航合成文字侧栏。生产建议收敛一套外壳，让制作、核对变化、审阅成果各有合适的工作面。

## 其他可体验的部分

- 信息流：展开阅读、保存到项目资料、加入待决定、处理与重新打开；已读和处理去向独立。
- 个人置物架：原件预览与固定样例的文字副本；个人文件不会自动进入项目。
- 目标：列表、筛选、搜索、新建本地目标、备注、范围选择的失败与重试。
- 全局：搜索、键盘关闭、浅深色、小窗口布局、刷新后恢复样例状态。

数据只保存在 `molis-design-exploration-v1` 和 `molis-design-workflow-v1` 两个本地存储项中。顶部「重置样例」恢复初始样例；不触及仓库或 Molis Work 的真实数据。不同标签页需要刷新以读取另一页刚保存的状态。

## 明确的原型边界

Pages 是可编辑的本地交互切片，未连接生产插件。影响关系由样例明确给出，没有实现自动分析。Functions 的试跑、PPT、Forms、Dataset 是固定样张或设计说明，不代表这些模块完成了升级。文件拖入、本机抽字、Agent 执行、原生窗口、团队共享和真实验收未接通。

正式 `DESIGN.md`、组件库和业务代码未被替换。候选规格变化与迁移顺序见主方案。本次入库范围仅为本目录的设计文档与 Demo，不包含生产界面改造或部署。`docs/design/taste.md` 是本地研究参考，不随本目录提交，也不是 Demo 的运行依赖。

## 验证记录

最终浏览器检查与剩余边界见[验证记录](verification.md)。界面操作和视觉观察只能支持这份原型的结论，不能替代生产接线、真实数据、中文输入法和用户审美验收。

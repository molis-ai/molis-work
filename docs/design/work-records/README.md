# 工作记录：可点的定样（路线书第 21 批）

状态：用户已定（2026-11-04）：记了什么 A 分类清单、保留与清理 A 期限加手动清理、占用 A 数字加分类条、覆盖与缺口 B 先列缺口，都是推荐方案；决定记在[原需求 §9](../../../specs/observation-collection/spec.md#9-决策记录)。同日按用户的定样规则（[开发流程 §5](../../../specs/post-anticorruption-roadmap/reference/development-workflow.md)：界面与原型按组件板实件做）把四个方案用组件板实件重做，版式和取舍不变。产品代码还没写。

这是参考原型，不是产品界面。需求来源是[观测和采集层](../../../specs/observation-collection/spec.md)（§2.1、§2.5、§2.6，OCL-02、09、11、12），设计见 [design.md](../../../specs/observation-collection/design.md) §6～8，排期见[第 21 批](../../../specs/post-anticorruption-roadmap/reference/batches/21.md)。

## 怎么打开

在仓库根目录运行，然后打开 <http://127.0.0.1:4421>：

```sh
python3 -m http.server 4421 --bind 127.0.0.1 --directory docs/design/work-records
```

也可以直接用浏览器打开本目录的 `index.html`。底下一条斜纹是**原型控制**，不是产品的一部分：选「块」与「状态」，切中英文和浅深色；「标出组件」见下；「还原」清掉本页记住的选择（`localStorage` 键 `molis-proto.work-records.v3`）。只画用户定下的方案；没选的方案（B 用一件事举例、C 底栏常驻标记、B 时间轴、B 增长趋势、C 存储总览、A 覆盖表、C 时间线）在提交 `a63034326` 里。

## 放在哪里

全局设置「个人」组里「记忆」后面新增「工作记录」一节（真实分区见 `apps/workbench/src/settings-sections.ts`）。页面外壳照真实设置页画：`settings-renderer.ts` 的顶栏、`settings-navigation.ts` 的分组导航、`settings-document` 与 `settings-page-heading`；一节里四个页签（组件板 Tabs），就是定下的四块。

## 样式从哪来

界面全部用组件板现行的样式，不另写令牌、不拷别的原型：

| 文件 | 是什么 |
| --- | --- |
| `mw.css` | 生成的快照：构建后的 `apps/workbench` 里 `renderMolisWorkSettingsStylesheet()`（设置页的 `/assets/molis-work-settings.css`），加上 `renderMolisWorkPrimitiveCatalog()` 页内的 `<style>`（组件板 `/__ui/catalog` 上条目、设置行、数字卡片、交互卡片等的样式）；去掉了 `@font-face`，字体走系统回退。文件头写着来源提交 |
| `mw-icons.js` | 生成的：`renderIconSprite()` 的图标 sprite 和 `renderStateRing()` 的三个状态环 |
| `proto.css` | 本原型自己的：原型控制条与「标出组件」标注、两项组件板新增的原型画法、把现成组件放进设置页的排版（只用组件板令牌） |
| `app.js` | 画法照 `packages/plugin-sdk/src/ui` 与 `packages/design-system/src/primitives` 里各个 `render*` 的输出逐字写 |

组件板改了要重新生成 `mw.css` 与 `mw-icons.js`：先构建（`node scripts/machine-slot.mjs run build -- pnpm --filter "@molis-ai/molis-work-app-workbench..." run build`），再在 Node 里导入 `apps/workbench/dist/page-assets.js`、`apps/workbench/dist/primitive-catalog.js` 与 `packages/design-system/dist/index.js`，按上表拼接写出。

## 对照组件板

原型控制里点「标出组件」：每个构件用虚线框出并写组件板上的名字；红框是**组件板新增**，在第一处写着为什么已有的不够。

| 块 | 用到的组件板构件 |
| --- | --- |
| 记了什么 A | 「记录工作过程」Settings Row + Status mark + Button；五类记录 Item Row（末尾图标按钮展开记／不记）；「可以用在哪里」Settings Row + Switch；首次接入与暂停用 Alert + Progress |
| 保留与清理 A | 期限 Settings Row + Select；所需期限 Item Row + Status mark（保得住／会失去）；期限过短 Alert（带动作行 `mw-ix-actions`）；手动清理 Settings Row + Button，打开 Dialog（Field、Select、Date Picker、Checkbox Group、danger Button）；评测样本 Settings Row + Badge；清理中、部分失败、清理之后用 Alert + Progress |
| 占用 A | 用量 Stat；提醒线 Settings Row + Number Field + Switch，下一行 Meter（满格就是提醒线）；到期清理 Settings Row；接近、超过、磁盘不足用 Alert；正在计算 Spinner |
| 覆盖与缺口 B | 总况 Alert（全都完整时是 Settings Row + Status mark）；来源 Toggle Group + 版本 Select；每处缺口 Item Row + Status mark，末尾图标按钮展开影响与处理；「完整」「不适用」Collapsible |

状态颜色用 Status mark 的语气：完整 done；暂不可用、截断 attention；丢失 blocked；已脱敏、到期清除 hold；未接入 idle；不适用、按规则不记 quiet。按钮只用 primary、secondary、ghost、danger 四种。

**组件板新增**（进产品前由 D 轨先在组件板补标本，再用）：

| 新增 | 为什么已有的不够 | 原型画法 |
| --- | --- | --- |
| 分类条 | Meter 与 Progress 只显示一个数；占用要按五类记录分段看各占多少，带图例 | 8px 高的分段条加图例，颜色取五种 `--mark-*` 色，附件与图片用 `--muted` |
| 种类色标记 | 组件板的 Mark 是中性色；五类记录在清单、缺口里要一眼分开（界面通用规则 11-03：不同内容用搭配的不同颜色） | Mark 的底换成 `--mark-<色>-fill`、图标换成 `--mark-<色>`；五类记录对应 blue、plum、slate、ochre、clay（DESIGN.md 里文件种类的五种色） |

## 每块的状态

| 块 | 状态 |
| --- | --- |
| 记了什么 | 正常记录中；首次接入在读现有资料（读到的算「原本就有」）；已暂停（记录截至何时）；评测用途已关 |
| 保留与清理 | 长期保留（默认）；选的期限短于报告与比较；手动清理看影响；清理中；有一处没清成（只重试这一项）；清理之后显示缺口 |
| 占用 | 没设提醒线；接近提醒线；超过提醒线（照常记，不删）；磁盘不足有记录没保存；正在计算 |
| 覆盖与缺口 | 只有未接入与不适用；有缺口（磁盘满丢失、断线、截断、脱敏）；清理后早期记录已清除 |

所有数据都是示例。页面不读 Home、不读磁盘、不连任何服务。

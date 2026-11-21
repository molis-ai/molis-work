# 设置页全系规范（全局 6 组 + 项目 9 页 + 插件设置）

全局设置（6 组：本机 / 个人 / AI / 工具与接入 / 系统 / 插件）与项目设置（9 页：常规 / 目录 / 项目说明 / 记忆 / 资料 / 插件 / 能力包 / 角色 / 授权与放行）共 30 张设置页，在 **工作台设置覆盖层** 与 **独立 `/settings/*` 路由** 中保持 **100% 同构**。

---

## 1. 统一骨架（严禁再写旧版 30px / 960px / 50px 导航方言）

| 区域 | 唯一规范 | 禁用反例 |
| --- | --- | --- |
| **左列导航轨** | 固定 `228px`、`--surface-soft` 底、`1px solid var(--line)` 右分割线；顶部提供 **「全局设置 / 本项目：\<项目名\>」作用域切换段**（项目内打开时可见；记忆/能力包/角色/授权 4 个双端页一键跨作用域切换）+ **侧栏快捷过滤框** | 50px 巨高旧行、`5px` 野生圆角、`inset 2px` 左侧蓝竖条、无搜索让用户手动翻 21+ 页 |
| **导航项** | 标准高 `32px`、`var(--r-control, 8px)` 圆角、`13px`；当前页用 `--nav-active` + `500` 字重；分组头 `11px / 500 / --muted` | 覆盖层与独立页两套不同选中样式 |
| **右列文档区** | 左缘固定 `max-width: 760px`（`--measure-form`）纵向流；如有来路先摆 `mw-return-bar` 往返条；页头为 **`24px / 600` 标题 + 最多一句直白引言（无重底线）** | `30px` 标题加粗横线、`960px` 居中导致跨页左右跳轴 |
| **桌面安全区** | 独立设置页左侧安全区一律读 `var(--desktop-window-safe-inline-start, 88px)`（全屏态自动归 `0`） | `project-settings-page.ts` 硬编码 `padding-left: 84px` |

---

## 2. 唯一内容版式：P5 卡片行族（「节标题在外、下面一张卡、一行一件事」）

全部设置页（包括宿主与插件贡献的 `workbench.settings` 页面）必须使用 `@molis-ai/molis-work-plugin-sdk/ui` 的 P5 五件套：

1. **`renderSettingsSection`（`.mw-settings-section`）**：`15px / 600` 节标题放卡片外，紧跟一张 `--paper` 圆角卡片（`var(--r-card, 12px)` + `1px solid var(--line)` + 轻贴面投影），行间单根 `1px solid var(--line)` 分割。
2. **`renderSettingRow`（`.mw-setting-row`）**：最小高 `58px`，左文（`13px / 500` 名称 + `12px / --muted` 一句白话说明）右控（标准 `32px` `mw-switch` / `mw-select` / `mw-input` / `mw-btn` / `mw-toggle-group`）。
3. **`renderObjectRow`（`.mw-object-row`）**：管理模型、连接、角色、规则、目录、授权等列表对象；状态标遵守「常态退隐、仅待你/异常着色」。
4. **`mw-setting-fold`（就地折叠展开行）**：需要多字段编辑或展开 20+ 子项（如助理「N 处不提醒」）时，在原行下方自然展开，**不为了改两个字段弹全屏大窗**。
5. **`renderListToolbar` / `renderQuestionList`**：工具栏放搜索、筛选与唯一新建按钮，不嵌套第二层白卡。

### 严禁私改共享控件
- **禁止**把设置页输入框拉高成 `36px` 或叠加 `--lift-1` 阴影（统一 `var(--control-h, 32px)`，紧凑 `28px`）。
- **禁止**自造 `input.settings-switch` 或用 `var(--ink)` 当开关轨道底色（一律用共享 `.mw-switch`）。
- **禁止**在设置页（含账号/项目删除/判断规则）使用 `window.confirm` 或原生 `type="date|time"`（如工作记录日期筛选、助理安静时段）。
- **禁止**覆盖层与独立页漏打样式：工作台 CSS 必含 `INTERACTION_OPTION_STYLES`，独立 Settings CSS 必含 `PLUGIN_TRUST_SETTINGS_STYLES` 与 `KNOWLEDGE_PICKER_STYLES`。

---

## 3. 切页、保存反馈与插件接入契约

- **切页防闪与方向感**：设置左侧切页接入 **`250ms` 延迟 `molisBusy`**（本地读库快于 `250ms` 绝不闪 `.mw-loading`）并轻触 `molisCraft.turn` 交代页面切换。
- **即时保存与失败回滚**：开关与选择型设置采用 `optimisticToggle`，保存失败当场弹回原值、恢复可点并在区块内原地标红报错（`role="alert"`），绝不静默吞错。
- **配置往返**：从缺模型/缺连接的工作面跳来设置页时，顶部展示 `mw-return-bar`；保存成功后派发 `molis-work:model-ready`（或对应 `dom-events.ts` 事件）并带用户原路返回、保留草稿。
- **插件设置页声明**：挂 `slot: "settings"` + `workbench.settings`，读自身数据用 `settings_data`、读路由参数用 `settings_address`、需运行时清单写 `settings_runtimes: true`（合同细则见 `skills/molis-plugin-dev/ui.md`）；数据源账号与业务列表留插件舞台，不塞进全局设置。

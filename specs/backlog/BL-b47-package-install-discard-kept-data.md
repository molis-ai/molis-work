# BL-b47-package-install-discard-kept-data

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b47-package-install-discard-kept-data | 安装包读不了卸载时留下的数据时，安装单问一句「放弃旧数据再装」 | [第 47 批 47-1](../post-anticorruption-roadmap/reference/batches/47.md) | 已知缺口 | 安装确认动作与安装单都还没有「放弃保留数据」这一项输入，要加合同字段和一步界面 | `plugins.install.confirm@1`、安装单（`apps/workbench/src/browser/plugin-frame/package-install.ts`）、设置 › 插件 的导入 | 中 | 待分配 |

- 现状：卸载时选了保留数据，之后装的包没有声明能从那一版升级（`upgrade_compatibility`）时，安装被拒（`plugin.kept_data_incompatible`），安装单与设置里的导入都只显示失败，没有办法当场同意放弃旧数据。宿主的安装流程本身支持（`discardKeptData`，`tests/installed-plugin-host.test.ts` 有断言），缺的是确认动作的输入和界面。
- 创作台做的插件不受影响：它发布的每一版都声明能从同一草稿此前的各版升级。第 47 批之前创作台自己的安装对话框有这一问，随私有安装路一起删了；受影响的是第三方签名包。
- 验收：按上面的场景，安装单多出一步说明旧数据读不了，可以选「放弃旧数据并安装」或「先不装」；选前者装成、旧数据清掉，选后者什么都不变。

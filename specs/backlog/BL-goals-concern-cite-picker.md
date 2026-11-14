# BL-goals-concern-cite-picker

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-goals-concern-cite-picker | Goal 页面的「问题与风险」表单里，人还不能挑要引用的对象（如一条风险）；今天引用由助理与执行 AI 经 `goals.concern@1` 的 `cited_subjects` 写入，风险一侧也可从风险详情关联 Goal。表单要加一个按种类找对象的选择（同 `search.references`），Goals 不点名哪个插件的种类 | 第 17 批界面片（`b17/ui`） | 部分实现 | Goal 页面由外壳直接画，没有插件框的动作调用口；要先定外壳页面怎样调 `search.references` | BL-goals-cited-object-names 的平台读法 | 中 | C 轨（执行会话待分配） |

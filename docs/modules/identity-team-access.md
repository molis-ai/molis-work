# Identity, Team & Access

**定位：** User、Team、membership、role、grant 和 Access Decision 的唯一 owner。

**拥有：** 用户与 Team 身份引用、成员关系、Team Plugin 决策、Project 访问授权和审计来源。

**公开面：** 查询当前身份/成员/有效访问；管理 membership 与 grant；对指定资源和操作返回可审计 Access Decision；发布 membership/grant 变化事件。

**不负责：** 不保存 Project 内容、Plugin 私有数据、Secret 或 Goal/Artifact；不因为用户是管理员就自动公开 Personal 数据。

**当前状态：** 无实现，也没有包（占位包已删除）；Team/Server 产品行为需要未来独立 Spec，不能由本轮伪造。

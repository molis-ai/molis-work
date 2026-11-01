# T381 窄范围诊断裁定

**足以确认当前测试过早返回的真实缺陷，可收敛测试修复；不必先概率复现30秒超时。** 负责人：二审线5。仅读accepted书、原测试/fixture、dialogs-client/editing-graph及原始events，未运行或修改产品/测试。

store首见300/570后，测试已发RELEASE命令302/572；此前均无对应createdGoal主frame提交，随后产品请求新Goal导航306/577，其Document被取消309/580。原测试只等持久化，而生产await POST后才location.assign，足以解释当前导航竞争。响应消费logpoint未命中、两命令均resolve，故**历史Linux首败/30秒超时因果仍UNKNOWN**。

修复可限本测试：真实submit前登记`navigate`等待；三类标题均须等新Goal真实主frame/loader到达，再以Owner生成id核URL、当前页面选中id、可见标题及无错误。返回须核Page.navigate无errorText、RELEASE目标与可用创建入口。仅通用DCL或“有画布”不足；第三次也须等完。保原标题/截断/无孤立代理及另两例全部断言、原期限。

最小反证：独立事件oracle在每次back发出前要求上述createdGoal完成回执。本轮原events两次必违反，足证已观测缺陷；**不能据此声称旧B重新运行稳定红**。书中RAC2808若要求可控B/H运行，可由根冻结真实POST的Response-stage暂停点：201已提交、页面尚未消费；保持真实响应，父控器验证旧路径提前触发back而违反oracle，新路径仍等待，释放后完成新页再返回。需显式编排释放/清理，不加sleep、延时阈值或自抛mock错误；该控制尚未执行，也不证明历史超时根因。新H另按正常链完整3例核收。

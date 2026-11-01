# T381 独立最终文件验证

**通过，无当前必修项。** H=`469dafa192ac26e7894020958b75f61d20cd2eb2`，tree=`80719ba7dc19a4aa7b7b2b09f87229673a539d96`，B=`3fd857792a27352030ac8f3544a3b57d418febc1`。独立 detached 副本核 [scoped.diff](scoped.diff) 仅第三例 +33/-13，前两例逐字未变。复用生产产物前重算源码指纹，与作者 B 的 build manifest 相同（`c75b962c…31d83c11dd`）；130 项克隆、1162 symlink 无作者树回链，见 [binding.json](binding.json)、[clone.json](clone.json)。

公共 browser 槽，一次运行最终**无诊断**完整文件，jobs1/retries0：**3/3，fail/skip/cancel/todo 均0，26.06秒，exit0**。[tests.log](tests.log)、[result.json](result.json) 保实际命令及完整输出。120emoji/240units、120ASCII、119emoji+ASCII/239units 的持久化、121st截断与无孤立代理断言通过；三次均从真实 owner 行取 id，等准确主frame/URL/可见标题/无错误。前两次返回另核 RELEASE 和可用创建入口；草稿/光标/关系、重试仅创建一次、取消无写、垃圾箱恢复原Goal及历史断言随完整文件通过。

亲核生产 await POST→navigate→location.assign 链，并独立重算已有事件的顺序：[oracle-check.json](oracle-check.json) 核旧858事件两违例、新561事件三次commit+DCL均早于返回/结束。旧反证属于已有真实记录，未重跑B；新事件属于作者带被动诊断运行，本线本次只签最终准确H完整文件。历史Linux30秒超时因果及响应消费切点未命中仍UNKNOWN，不宣称消除旧超时。

独立 [affected.json](affected.json) 为 full=[]、仅本browser文件；实际只改测试，不涉及生产/共享fixture/合同，沿此范围 full=false 合理。准确普通CI、二审、采用及新共同树Full仍由根结算。

独立系统HOME/CFFIXED/XDG/Node tmp、file后端、adhoc helper与专用Chrome/profile；[browser-launches.jsonl](browser-launches.jsonl) 保三次启动参数。fixture/profile自然删除、wrapper无存活、公共槽退出；九个隔离目录已清、作者及独立树干净。[cleanup.json](cleanup.json) 可核。首次过宽的tmp全空检查命中Swift/tsx缓存，原记录保留后仅清本线缓存，无测试重试。未操作真实Home、GH、CI或产品文件；匹配副本及原件保留。

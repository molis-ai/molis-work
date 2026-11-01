# W6 原场景6：真实项目签包单链执行

**约定的项目签包子链通过，独立二审核收；不结整个场景6或W6。** 本线仅执行一次，无失败、重试或产品修复。固定借用 `/private/tmp/t381-dev` H=`469dafa192ac26e7894020958b75f61d20cd2eb2`、tree=`80719ba7dc19a4aa7b7b2b09f87229673a539d96`，前后tracked clean。H相对已采用M=`3fd857792a27352030ac8f3544a3b57d418febc1`仅改T381浏览器测试；生产输入等价M。槽内重算源码digest与现存构建manifest同为`c75b962c1bff4d1f6eccdb3e12e3c022e32b2c6e5523b22272f80631d83c11dd`，没有第二build。

经公共browser槽等待T382释放后，Node24.14.0/darwin/arm64实际执行 `chain.mts`；没有启动浏览器。沿现有installedPackageHost真实actionClient/management身份，经签名预览确认安装Example notes。临时Ed25519私钥在进程内生成，驱动未导出；两份已签包经confirm→SandboxPackageStore.save落盘于本次隔离Home的`plugin-packages`，随后随Home清理。v1/v2签前使用真实读写声明，v2明确兼容1.0.0并运行不同代码，没有空install回调或内存Runtime改状态。

同一install_id=`plugin-install-485a3a15b5af495dca5f370fec49ab65` 的真实结果：初始目录空；v1运行、发现两动作、add返回true，list精确`[{id:"1",text:"one"}]`；停用后安装记录disabled、两动作撤下，缓存add拒绝`ActionError/actions.missing`；恢复后同id/running、list仍只有one，拒绝零写入。公开预览确认v2后同id/version1.1.0，旧one保留；add two返回true，list精确`[{id:"1",text:"one"},{id:"2",text:"v2:two"}]`，证明新代码生效。卸载keep_data=false后安装目录空、两动作撤下，缓存v2 add/list都拒绝`actions.missing`；Runtime私有存储owner快照为空。

原件：`actions.jsonl`逐动作/状态/发现/固定数据/实际错误；`chain.mts`为有限执行序列；`run.py`、`command.json`、`run.log`、`binding.json`、`exit.json`记录公共槽、最小环境、构建绑定及exit0。独立system HOME/CFFIXED/XDG/Node TMP/Molis Home、file backend、ad-hoc identity=-，未继承真实账号/模型/代理，未读Keychain/真实Home/4207。Foundation原生临时目录有既有限制，不能据此称全系统TMP已隔离。finally关闭Host/runner并删除本次Home；七处环境目录全部清理，pid78297已退出，见`cleanup.json`、`cleanup-readback.json`。候选树与匹配构建只读保留。

旧T346两完整文件各14/14、T122三文件23/23继续按原头原执行者核抵，本轮没有重跑或改署。目录指Host安装目录与公开动作目录；本包没有搜索/情境声明，未执行MCP调用、真实助理模型、Memory或Home/origins/T141路径，这些仍WAIT。没有重启、UI体验或本人验收新结论。

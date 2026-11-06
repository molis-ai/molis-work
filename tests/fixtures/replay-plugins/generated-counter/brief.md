# 冻结简报一：本地文本计数器

来源：W4-01真实生成样本，project scope；不声明runtime.scope=home。用当前创作台真实生成代码，只处理传入文本，不调用模型、网络或外部文件，不读用户资料。实现可自行组织，不要求复制text-stats源码。

操作`text.count`，query。输入JSON Schema：object，唯一必填字段text为string，additionalProperties=false。输出：object，必填且仅允许characters、utf8_bytes、lines，均为integer且minimum=0，additionalProperties=false。characters按Unicode码点计数，utf8_bytes按UTF-8字节计数，lines为LF分隔的段数（空串也为一段）。effects为空，无存储/网络/模型权限。

固定输入JSON：`{"text":"一行\nline"}`。JSON解析后text是“一行”、一个LF、再“line”，不是反斜杠和字母n。人工冻结完整输出：`{"characters":7,"utf8_bytes":11,"lines":2}`。完整schema与值比较，不投影丢字段。

回放顺序：未安装时动作不可发现；project v1安装/确认后调用一次；同publisher机械v2升级后调用一次；关闭并重新启动Host、从已保存v2包恢复后再调用一次。三次同输入同严格输出；检查升级与重启后同install_id、plugin/publisher及v2 running。不能根据生成结果改变定义或oracle。失败保留原件与修复轮。

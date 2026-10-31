# 冻结简报二：本地清单

来源：W4-01真实生成样本，project scope；不声明runtime.scope=home。只用该安装的私有存储，不调用模型、网络或用户文件。项目内一份清单，新增按调用顺序追加，不预置演示条目。

操作及严格schema：

- `items.add`为command，输入object唯一必填text:string（minLength=1），additionalProperties=false；输出object唯一必填added:boolean且const=true，additionalProperties=false。effects仅storage read/write。正文原样保存，不trim、改写或摘要。
- `items.list`为query，输入空object且additionalProperties=false；输出object唯一必填items:array，additionalProperties=false。每项object恰有id、text、created_at三字段，均string；id非空，text为保存正文，created_at为ISO8601日期时间。项additionalProperties=false。effects仅storage read。按新增顺序返回；ID和时间由实现生成，不参与固定值比较，但必须满足冻结schema。

固定序列和独立oracle：

1. 未安装时不可发现动作；安装project v1后list `{}`，完整结果必须`{"items":[]}`。
2. **只调用一次**add，输入`{"text":"周五整理资料"}`，完整返回严格等于`{"added":true}`。
3. list `{}`，先完整验证上述schema，再取固定投影`result.items.map(row => row.text)`；严格等于`["周五整理资料"]`，恰好一项，顺序不排序不去重。
4. 同publisher机械v2升级；确认同install_id且v2 running。只list，不add；相同schema及相同正文投影。
5. 关闭并重启Host、从保存的v2恢复；只list，不add；确认同安装及相同schema/正文投影。ID/created_at若在三次list间变化也应拒绝，首读取得的这两个原始值作为该记录持久性对照；其随机值不参与人工固定oracle。

投影只排除预先明定的ID/时间具体值，不排除items数量、顺序或正文；不可事后按模型输出选择字段。不能通过重复add让升级后“看见内容”，不能空列表通过即记成功。生成契约不符合上述schema时按原设计/修复流程拒绝，记录原失败，不修改oracle凑绿。

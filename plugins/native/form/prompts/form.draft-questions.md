按用户的要求为问卷拟 3 到 8 道题。只输出一个 JSON 对象，不输出解释或代码块。
信息够用时输出 {"status":"done","questions":[{"title":"题目","type":"text|singleChoice|multiChoice|dropdown|rating|date","required":true,"options":["选项"]}]}：选择题与下拉题给 2 到 6 个选项，其他题型不给 options。
不清楚问卷给谁填、要多少题或用来做什么，因而拟不出合适的题时，输出 {"status":"needs_input","why":"一句话说清缺什么","questions":[{"id":"audience","prompt":"问题","options":[{"label":"选项","description":"这个选项意味着什么","recommended":true}],"multiple":false,"allow_other":true}]}：最多 3 道，都是选择题，每道给 2 到 5 个具体选项；推荐一项时在它的 description 里写理由；id 用小写英文。
数据里有 answers 时，用户已经回答过你的问题：按回答拟题，输出 done，不要再问。
以下 JSON 是请求数据：

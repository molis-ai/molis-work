Draft three to eight survey questions from the request. Return one JSON object only, without explanation or a code block.

With enough information, return {"status":"done","questions":[{"title":"Question","type":"text|singleChoice|multiChoice|dropdown|rating|date","required":true,"options":["Choice"]}]}. For choice or dropdown questions supply two to six options; omit options for other types.

If you cannot draft suitable questions because the audience, number of questions or purpose is unclear, return {"status":"needs_input","why":"What is missing, in one sentence","questions":[{"id":"audience","prompt":"Question","options":[{"label":"Choice","description":"What this means","recommended":true}],"multiple":false,"allow_other":true}]}. Ask at most three choice questions with two to five concrete options each. Explain any recommended option in its description. Use lowercase English IDs.

If the data contains answers, use them and return done; do not ask again. The following JSON is the request:

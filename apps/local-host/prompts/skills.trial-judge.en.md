You are comparing the results of a Skill replay. In the materials, expected is the result the user accepted and results are what several replays wrote (each with an index). Judge each result: does it agree with expected in substance?

- match: the points, facts, numbers and conclusions agree; small differences of wording, order or format do not count.
- differs: a point is missing or added, a fact or number differs, the conclusion differs, or a part the user wanted is left out. In differences, one sentence each saying where it differs (for example "not grouped by owner", "the due date is March 5; yours is March 6"), at most 5.
- unknown: the result is empty, only says what it would do, or there is nothing to compare it with expected on.

Output one JSON object only, with no explanation and no code fence: {"results":[{"index":number,"verdict":"match"|"differs"|"unknown","differences":[string]}]}. differences is an empty array when verdict is match or unknown. Every index gets one item.

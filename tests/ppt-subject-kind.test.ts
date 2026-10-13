import assert from "node:assert/strict";
import test from "node:test";
import { ARTIFACT_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { PPT_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/ppt";
import { pptManifest } from "@molis-ai/molis-work-plugin-ppt";

// A 演示稿 has one kind name everywhere (repository-anti-corruption §9.5 #8): its actions, its workflow station, search,
// placement, the side panel and its 成果 origin. The actions once said `ppt` while everything else said `presentation`.
test("every PPT action names a 演示稿 by the one kind it is read, searched and placed by", () => {
  const named = new Set((pptManifest.actions ?? []).flatMap(definition => [
    ...(definition.action.subject_kinds ?? []),
    ...((definition.action as { search_source?: { kinds: Array<{ kind: string }> } }).search_source?.kinds ?? []).map(entry => entry.kind),
  ]));
  // Its 成果 previews and pins act on a version in the 成果库, which is the `artifact` kind.
  named.delete(ARTIFACT_SUBJECT_KIND);
  assert.deepEqual([...named], [PPT_SUBJECT_KIND]);
});

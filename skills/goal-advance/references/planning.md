# Plan useful outcomes and real dependencies

Read when the task benefits from professional methods, decomposition, a tree change or analysis of changed requirements. A short Goal can proceed without these steps. Save meaningful user language and grounded findings as notes while the plan takes shape; distinguish an observation from a recommendation or unconfirmed assumption.

## Select the professional methods that matter

Start from the intended result and its consumer. Identify the work type, professional domain, industry or operating constraints that change how a good result is produced and judged.

Call molis_work_v1_planning_methods with include_instructions=false for the lightweight catalog. Respect user-configured composition.method_pack_ids, then add methods whose distinct checks materially apply. Retrieve the selected method_ids and read their instructions. The returned catalog_id and returned_method_ids help detect a changed catalog or omitted selected method. Do not load every method body by default.

Work type, domain, industry and situational overlays are complementary lenses, not serial phases or one Goal each. If a needed provider or professional check is missing, consult the relevant additional method. Do not turn an example method bundle into a mandatory product/software/data checklist.

If no method fits, use relevant professional evidence and explain the chosen approach. Saving a reusable project method through planning_method_save is a separate, user-confirmed change; it is not a prerequisite for recording or planning the current Goal.

event_configure can adopt a saved method version and its useful types. Default requirements are separate choices: adopt_default_requirement_ids enables only the chosen ones, using the returned Goal-local IDs afterward. Omit adopted_planning to retain the current selection. A template-free Goal stays template-free unless adoption is intended.

## Shape work around usable results

A Goal represents a finite result that someone can use or assess. Repeated operation produces more facts; it need not keep a completed capability permanently unmet. A newly discovered improvement can become a separate intent or a reviewable tree proposal when the user wants it.

Split when it gives separately useful outcomes clearer ownership or acceptance. Keep supporting work together when it serves the same result. There is no fixed number of children, compulsory split score, leaf status or nonempty input/output array gate. Explain the result, consumer, useful boundaries and how to recognize success at the detail the current work needs.

For a complex effort, check the actual user journey, core capability, inputs it consumes, delivery, recovery and quality. Add domain-specific concerns only where relevant: playable feedback and content for games; sources and evaluation for research or AI; permissions and exceptions for operations; editorial claims and distribution for content. A single outcome may cover several concerns; do not create a Goal per label.

## Make shared work compatible

When several people or work units need to proceed independently, reuse the smallest reliable shared artifact that defines their common outcome, constraints, ownership, interfaces and convergence point. It might be a brief, research protocol, campaign charter, content bible, operating playbook or technical contract.

A unit should own a usable result and name its consumers, inputs, outputs, decisions and mutable assets. Shared infrastructure or standards deserve separate ownership when multiple units consume them. Overlapping authorship, circular knowledge dependencies or competing writes mean the units are not yet independent; separate documents alone do not establish that.

For technical work, stabilize the affected module boundary and provider contracts before dependent implementation. Provider and consumer work can proceed independently once the contract and a meaningful test double permit it; integration waits for both real implementations. A bounded local repair reuses existing contracts instead of creating project-wide documentation gates.

Record useful shared artifacts with readable references. Writing a specification does not complete its downstream software or business result.

## Dependencies express consumption

For each candidate dependency, name the provider output, the consumer's use, and whether it can correctly start or finish without that output. Only that real consumption justifies consumer depends_on provider.

Hierarchy, related topics, chronology or a preference to do something first do not automatically imply a dependency. part_of states a parent/child result relationship; it does not prove either result complete. A parent may need its own integration or acceptance report.

## Propose a finite structural change

The current tool accepts only three item shapes:

| kind | operation | payload |
| --- | --- | --- |
| goal | create | title, optional goal_id/outcome/why/business_logic/priority/requirements |
| relation | create | from_goal_id, to_goal_id, part_of or depends_on, reason |
| relation | deactivate | exact relation_id and reason, or the full endpoint/type identity |

Each item supplies at least one real source_refs entry, reason and confidence. A saved Goal event can provide the reference; do not fabricate conversation links. The Host supplies Runtime and Session provenance. No Run, role, temporary Goal or model-supplied actor is needed. Existing result and requirement changes use event_agree and its specific decision path, not an arbitrary tree payload.

In the call notation from [execution.md](execution.md), with g naming an existing parent:

```javascript
const proposalNote = await call("molis_work_v1_event_note", {
  goal_id: g,
  body: "Proposal: a reusable receipt guide could help the buyer return to their receipt.",
  idempotency_key: "receipt-tree-source-1"
});
const proposal = await call("molis_work_v1_goal_tree_propose", {
  root_goal_id: g,
  summary: "Add a receipt guide as a separately usable part of the buying experience",
  items: [{
    item_id: "create-guide",
    kind: "goal",
    operation: "create",
    payload: {goal_id: "receipt-guide", title: "Make the receipt easy to find"},
    source_refs: [proposalNote.event_id],
    reason: "The buyer needs a reusable route back to the receipt",
    confidence: 1
  }, {
    item_id: "guide-parent",
    kind: "relation",
    operation: "create",
    payload: {
      from_goal_id: "receipt-guide",
      to_goal_id: g,
      type: "part_of",
      reason: "Finding the receipt is part of the buying experience"
    },
    source_refs: [proposalNote.event_id],
    reason: "Keep the guide under the experience it supports",
    confidence: 1
  }],
  idempotency_key: "receipt-tree-1"
});
const proposalId = proposal.proposal.proposal_id;
await call("molis_work_v1_goal_tree_read", {proposal_id: proposalId});
await call("molis_work_v1_goal_tree_check", {
  proposal_id: proposalId,
  idempotency_key: "receipt-tree-check-1"
});
```

Use a goal_id that does not collide with existing work, or the tool's supported generated-ID flow when no later item needs to name the new Goal. The saved note is a traceable proposal source, not user approval.

Explain the proposal's intended outcome, changed relationships, scope and remaining uncertainties. Include narrative and item explanations when the change set is large enough to need them; follow the schema's requirement for larger proposals. Address check conflicts before seeking a decision.

The user applies or rejects the stored items through the protected Web/management interface. Runtime cannot call goal_tree_decide or self-attest approval. A selected relationship must not implicitly approve an unselected Goal. Whole-proposal application is atomic; do not convert its conflict into an unrequested partial application.

## Review only the affected work

Use planning_analyze_change with changed_goal_ids for actual ancestors, downstream consumers, adjacent providers and review order. Reuse compatible current open Goals; historic decomposition labels are not work gates. Impact analysis does not itself authorize rewriting the tree.

After a user tree decision, read its semantic_review. Structural validity says the graph is well-formed; it does not prove every affected outcome still makes sense. Review those current agreements in the returned order and propose only necessary changes. Preserve unaffected work and all history. Finish with planning_graph_check after actual relationship changes when its structural result is needed.

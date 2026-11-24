# General application

Product completeness checks for the established app task context.

For: General application products.

## Planning path

1. Define the main function
2. Walk the end-to-end journey
3. Complete interactions and information
4. Verify quality and delivery

## Required coverage

| area | label | question |
| --- | --- | --- |
| core_function | Main function | What job is the app for? |
| user_journey | End-to-end journey | How does a person complete the main job? |
| interaction_ui | Interaction and UI | How does the interface guide and respond? |
| content_information | Content and information | What is shown and retained? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| implementation-after-product-flow | Implementation needs confirmed product goals, main path and key states. | implementation depends_on product flow |
| release-after-feature | Verification and release need working features and failure recovery. | validation and release depend_on working feature |

## Completion evidence

- End-to-end main path

## Closeout checks

- Main function and journey both work

## Common mistakes

- Listing pages only
- Features exist without a usable path

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.

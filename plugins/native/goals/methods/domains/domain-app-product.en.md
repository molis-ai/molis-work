---
name: "General application"
summary: "Product completeness checks for the established app task context."
applies_to: ["General application products"]
---

# General application

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

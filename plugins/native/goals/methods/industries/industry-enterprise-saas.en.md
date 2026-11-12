---
name: "Enterprise SaaS"
summary: "Make a governable organizational product across purchase, administration, use, integration and renewal."
applies_to: ["B2B SaaS", "Enterprise software", "Organizational collaboration"]
---

# Enterprise SaaS

## Planning path

1. Define outcomes for buyer, administrator, user, security and finance
2. Establish organization, tenant, identity, rights, data and audit boundaries
3. Walk evaluation, procurement, setup, import, integration and adoption
4. Add billing, support, change management, exit and data migration
5. Verify organizational use, business outcomes, secure operations and renewal

## Required coverage

| area | label | question |
| --- | --- | --- |
| enterprise_roles | Enterprise roles | Who buys, approves, configures, uses, audits and bears risk? |
| tenancy_identity | Tenancy and identity | How are organizations, membership, permissions, data isolation and audit modeled? |
| onboarding_adoption | Adoption | How do evaluation, setup, import, training and stable use connect? |
| integrations_admin | Integration and admin | How do identity, data, workflows and admin tools fit existing environments? |
| contract_billing | Contract and billing | How do plans, seats, usage, renewal and entitlements stay consistent? |
| service_exit | Service and exit | How are support, upgrade, disabling, export and deletion controlled? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| product-after-tenant-contract | Features need stable tenant, identity, permission, data and audit contracts. | enterprise features depend_on tenant and identity contract |
| rollout-after-admin-readiness | Organizational rollout needs administrator setup, integration, support and exit readiness. | enterprise rollout depends_on admin and service readiness |

## Completion evidence

- Purchase, setup and usage paths by role
- Isolation, permissions, audit and data exit checks
- A real integration and organizational adoption record

## Closeout checks

- Distinct success criteria for buyer, admin and user
- Cross-tenant verification
- Customers can join and safely exit

## Common mistakes

- Calling a personal app with a team list enterprise
- Ignoring administration and integrations
- Using contract claims to hide unverified safety or reliability

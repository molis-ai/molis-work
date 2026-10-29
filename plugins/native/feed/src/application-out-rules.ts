import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedOutRuleRecord } from "./projection.js";
import type { FeedApplicationPorts } from "./application-ports.js";
import type { FeedOutRuleWrite } from "./out-rules.js";

/** The capture rules a person keeps for this project's Feed; a host without the rule store lists none and refuses writes. */
export class FeedOutRules {
  constructor(private readonly ports: Pick<FeedApplicationPorts, "outRules">) {}

  list(projectId: string): FeedOutRuleRecord[] {
    return this.ports.outRules?.list(projectId) ?? [];
  }

  prepareCreate(projectId: string, input: FeedOutRuleWrite): FeedOutRuleRecord {
    return this.store().prepareCreate(projectId, input);
  }

  saveCreate(rule: FeedOutRuleRecord): FeedOutRuleRecord {
    return this.store().saveCreate(rule);
  }

  create(projectId: string, input: FeedOutRuleWrite): FeedOutRuleRecord {
    return this.saveCreate(this.prepareCreate(projectId, input));
  }

  prepareUpdate(projectId: string, ruleId: string, patch: Partial<FeedOutRuleWrite>): FeedOutRuleRecord {
    return this.store().prepareUpdate(projectId, ruleId, patch);
  }

  saveUpdate(rule: FeedOutRuleRecord, expectedRevision?: string): FeedOutRuleRecord {
    return this.store().saveUpdate(rule, expectedRevision);
  }

  update(projectId: string, ruleId: string, patch: Partial<FeedOutRuleWrite>): FeedOutRuleRecord {
    const current = this.store().get(projectId, ruleId);
    return this.saveUpdate(this.prepareUpdate(projectId, ruleId, patch), current.revision);
  }

  delete(projectId: string, ruleId: string): FeedOutRuleRecord {
    return this.store().delete(projectId, ruleId);
  }

  private store() {
    if (!this.ports.outRules) {
      throw feedErrors.out_rule_not_found("捕捉规则尚未初始化");
    }
    return this.ports.outRules;
  }
}

export declare const VISUAL_AUDIT_TESTS: readonly string[];
export declare function isVisualAuditTest(file: string): boolean;
export declare function isGateMetaTest(file: string): boolean;
export declare function isGateRuleTest(file: string): boolean;
export declare function gateRuleFiles(testFiles: readonly string[], selection: string, group?: "source" | "health" | "budgets"): string[];

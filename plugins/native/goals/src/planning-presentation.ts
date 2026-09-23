import type { PlanningMethodPack, GoalsPlanningProject, GoalsPlanningPrimitives } from "./planning-ui-model.js";
export function createPlanningPresentation(primitives: GoalsPlanningPrimitives) {
    const { translate: L, escapeHtml, icon, settingsContextHref, withDesktopQuery } = primitives;
    const PLANNING_DEPENDENCY_HINTS: Record<string, string> = {
        "analysis depends_on validated data": "先确认数据可用，再开始分析", "commitment depends_on decision": "先完成关键决定，再开始不可逆投入", "consumer depends_on provider": "先完成可交付结果，再开始使用它的工作", "consumer depends_on provider contract": "先确认提供方契约，再实现使用方", "cutover depends_on validation and rollback": "先验证并准备回退，再执行切换", "decision depends_on evidence": "先形成可信证据，再做决定", "fix depends_on root-cause evidence": "先确认根因证据，再实施修复", "full build depends_on validated slice": "先验证最小切片，再扩展完整实现", "implementation depends_on validated direction": "先验证方向，再进入实现", "production depends_on playable loop": "先验证可玩循环，再扩展生产内容", "publication depends_on review": "先完成审核，再发布", "recommendation depends_on market evidence": "先取得市场证据，再给出建议", "runtime capability depends_on data and evaluation": "先准备数据与评测，再扩展 Runtime 能力", "verification depends_on deliverable": "先产生可验收结果，再开始验证",
        "task decomposition depends_on validated method pack": "先验证领域方法，再拆实际任务",
        "capability depends_on consumed foundation": "先完成会被核心能力真实消费的基础，再实现该能力",
        "delivery depends_on validated capability": "先验证核心能力，再进入交付与发布",
        "regression depends_on fix and failure baseline": "先保留失败基线并完成修复，再做回归",
        "evidence plan depends_on decision question": "先明确要支持的决定，再规划证据",
        "validation slice depends_on intent and constraints": "先明确目标与约束，再制作验证切片",
        "legacy cleanup depends_on proven cutover": "先确认切换稳定，再清理旧路径",
        "workflow depends_on roles and permissions": "先明确角色与权限，再运行工作流",
        "improvement depends_on operational evidence": "先取得真实运行证据，再调整流程",
        "claim depends_on audience and product evidence": "先确认受众问题与产品事实，再形成主张",
        "publication depends_on reviewed content": "先完成事实与渠道审核，再发布",
        "technical design depends_on confirmed product plan": "先确认产品计划，再设计技术方案",
        "technical foundation depends_on technical design": "先明确技术方案，再建设被需要的基础能力",
        "product feature depends_on consumed technical design and foundation": "先完成该功能真实消费的技术方案与基础，再实现功能",
        "verification and release depend_on working feature": "先形成可运行功能，再验收与发布",
        "decision delivery depends_on validated analysis": "先完成并验证分析，再交付结论",
        "comparison depends_on market boundary": "先明确市场边界，再比较替代方案",
        "high-fidelity slice depends_on core flow and states": "先明确核心动线与状态，再制作高保真切片",
        "rollout depends_on safety and recovery evidence": "先验证安全与恢复，再真实上线",
        "systems depend_on core loop intent": "先明确玩家动机与核心循环，再设计系统",
        "draft depends_on sources and method": "先确认来源与方法，再形成内容或结论",
        "implementation depends_on product flow": "先确认产品目标与主路径，再实现功能",
        "validation and release depend_on working feature": "先形成可运行功能，再验证与发布",
        "use part_of for hierarchy; keep independent goals parallel": "父子层级使用归属关系；没有产出消费的 Goal 保持并行",
    };
    function friendlyPlanningDependencyHint(value: string): string { return PLANNING_DEPENDENCY_HINTS[value] ?? value.replace(" depends_on ", " 依赖 "); }
    function friendlyPlanningDependencyStatement(value: string): string { return value.replaceAll("depends_on", L("依赖关系")); }
    function planningMethodKindLabel(kind: PlanningMethodPack["kind"]): string { return kind === "work_type" ? L("工作类型") : kind === "domain" ? L("专业领域") : kind === "industry" ? L("行业方法") : kind === "overlay" ? L("场景叠加层") : kind === "meta" ? L("元方法") : L("自定义"); }
    function planningMethodScopeLabel(scope: PlanningMethodPack["scope"]): string { return scope === "built_in" ? L("系统模板") : scope === "personal" ? L("我的方法") : L("项目专用"); }
    function planningSettingsHref(path: string, project: GoalsPlanningProject | null, desktop: boolean): string { return settingsContextHref(path, project, desktop); }
    function renderPlanningMethodCards(methods: readonly PlanningMethodPack[], basePath: string, project: GoalsPlanningProject | null, desktop: boolean): string {
        return methods.map((method) => { const path = `${basePath}/${encodeURIComponent(method.method_id)}`; const href = path.startsWith("/settings/") ? planningSettingsHref(path, project, desktop) : desktop ? withDesktopQuery(path) : path; return `<a class="planning-card" href="${href}" data-planning-method data-kind="${escapeHtml(method.kind)}" data-scope="${escapeHtml(method.scope)}"><div class="planning-card-top"><span class="planning-card-kind">${escapeHtml(planningMethodKindLabel(method.kind))}</span><span class="planning-card-scope planning-card-scope--${escapeHtml(method.scope)}">${escapeHtml(planningMethodScopeLabel(method.scope))}</span></div><div><h2>${escapeHtml(method.name)}</h2><p>${escapeHtml(method.summary)}</p></div>${method.applies_to.length ? `<div class="planning-card-tags">${method.applies_to.slice(0, 3).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}<div class="planning-card-footer"><span>${L("{steps} 个规划阶段 · {checks} 个必答问题", { steps: method.steps.length, checks: method.required_coverage.length })}</span>${icon("arrow")}</div></a>`; }).join("");
    }
    function renderPlanningCompositionRows(methods: readonly PlanningMethodPack[], basePath: string, desktop: boolean): string {
        return methods.map((method) => {
            const path = `${basePath}/${encodeURIComponent(method.method_id)}`;
            const detailPath = desktop ? withDesktopQuery(path) : path;
            return `<button type="button" class="planning-composition-row" data-planning-open data-planning-detail-path="${detailPath}"><span class="planning-card-kind">${escapeHtml(planningMethodKindLabel(method.kind))}</span><span class="planning-composition-row-copy"><strong>${escapeHtml(method.name)}</strong><small>${escapeHtml(method.summary)}</small></span><span class="planning-composition-row-meta">${L("{steps} 个阶段 · {checks} 个问题", { steps: method.steps.length, checks: method.required_coverage.length })}${icon("arrow")}</span></button>`;
        }).join("");
    }
    function renderPlanningDirectory(methods: readonly PlanningMethodPack[], project: GoalsPlanningProject, adoptedIds: ReadonlySet<string>): string {
        const endpoint = `/projects/${encodeURIComponent(project.project_id)}/api/settings/planning-methods/apply`;
        const detailPath = (methodId: string) => `/settings/planning/${encodeURIComponent(methodId)}?project=${encodeURIComponent(project.project_id)}`;
        const item = (method: PlanningMethodPack) => {
            const joined = adoptedIds.has(method.method_id);
            const action = joined ? "" : `<button type="button" data-adopt-planning-method="${escapeHtml(method.method_id)}" data-adopt-endpoint="${endpoint}">${L("加入组合")}</button>`;
            return `<div class="planning-list-item" data-planning-method data-kind="${escapeHtml(method.kind)}" data-scope="${escapeHtml(method.scope)}"><button type="button" class="planning-list-item-open" data-planning-open data-planning-detail-path="${detailPath(method.method_id)}">${escapeHtml(method.name)}</button><span class="planning-membership" data-joined="${joined ? "true" : "false"}">${joined ? L("已加入") : L("未加入")}</span>${action}</div>`;
        };
        const fold = (id: string, title: string, group: readonly PlanningMethodPack[]) => {
            const body = group.length
                ? group.map(item).join("")
                : `<p class="planning-fold-empty">${L("这个分类里还没有方法。")}</p>`;
            return `<details class="planning-fold" data-planning-fold="${id}" open><summary><span class="planning-fold-caret" aria-hidden="true">${icon("chevron-down")}</span><strong>${L(title)}</strong><small>${group.length}</small></summary><div class="planning-fold-items">${body}</div></details>`;
        };
        const builtIn = methods.filter((method) => method.scope === "built_in");
        const mine = methods.filter((method) => method.scope !== "built_in");
        const kinds: Array<[PlanningMethodPack["kind"], string]> = [
            ["work_type", "工作类型"],
            ["domain", "专业领域"],
            ["industry", "行业方法"],
            ["overlay", "场景叠加层"],
        ];
        for (const method of builtIn) {
            if (!kinds.some(([kind]) => kind === method.kind)) kinds.push([method.kind, planningMethodKindLabel(method.kind)]);
        }
        return `${kinds.map(([kind, title]) => fold(kind, title, builtIn.filter((method) => method.kind === kind))).join("")}${fold("mine", "我的方法", mine)}`;
    }
    return { friendlyPlanningDependencyHint, friendlyPlanningDependencyStatement, planningMethodKindLabel, planningMethodScopeLabel, planningSettingsHref, renderPlanningMethodCards, renderPlanningCompositionRows, renderPlanningDirectory };
}

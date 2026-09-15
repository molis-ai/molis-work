BEGIN TRANSACTION;
CREATE TABLE acceptance_criteria (
    criterion_id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    decision_method TEXT NOT NULL,
    pass_condition TEXT NOT NULL,
    target_json TEXT,
    required_evidence_json TEXT NOT NULL DEFAULT '[]'
  );
INSERT INTO "acceptance_criteria" VALUES('V1-C1','V1','第一次使用的人能从首屏看懂目标、下一步和阻塞','inspection','首次使用者无需阅读协议即可正确复述',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('PLATFORM-C1','PLATFORM','不同 Runtime 读取到一致的 Goal 状态与完成依据','automated_check','跨入口一致性测试通过',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('WORKSPACE-C1','WORKSPACE','用户不切窗口即可从 Goal 进入对应 Runtime','inspection','桌面主工作流可完成并保持 Goal 绑定',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('ADOPTION-C1','ADOPTION','首次用户能独立完成一次从安装到推进的闭环','inspection','首次使用走查无阻断步骤',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('CORE-C1','CORE','工作从开始到证据和复核形成完整记录','automated_check','生命周期自动化测试通过',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('INTERFACES-C1','INTERFACES','不同入口读取到一致的可做工作和占用状态','automated_check','跨入口自动化测试通过',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('WEB-C1','WEB','桌面和移动端关键信息清楚可用','inspection','视觉、响应式和可访问性 QA 通过',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('GRAPH-C1','GRAPH','复杂网络中的关系方向和阻塞节点可以直接辨认','inspection','12 Goal 演示网络在桌面宽度下可读',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('DESKTOP-C1','DESKTOP','桌面端三栏在宽屏下形成完整工作闭环','inspection','Goal 选择、Focus 与 Runtime 归属保持同步',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('RELEASE-C1','RELEASE','安装、接入和重启提示可以按公开步骤重复完成','automated_check','全新安装端到端验证通过',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('ONBOARDING-C1','ONBOARDING','首次用户无需外部讲解即可推进第一条 Goal','inspection','首次体验测试完成一条可执行 Goal',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('DOCS-C1','DOCS','README 清楚表达痛点、边界、闭环与多种使用方式','inspection','目标用户能准确复述产品独特机制',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('AUTO-CONNECT-C1','AUTO-CONNECT','新对话无需确认就进入历史项目','inspection','进入历史目录后直接显示最近项目',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('OLD-HUMAN-C1','OLD-HUMAN','用户亲自核对付款体验','human_decision','用户亲自核对付款体验',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('OLD-POLICY-C1','OLD-POLICY','实际付款成功','inspection','实际付款成功',NULL,'[]');
INSERT INTO "acceptance_criteria" VALUES('OLD-RISK-C1','OLD-RISK','结果可以打开','inspection','结果可以打开',NULL,'[]');
CREATE TABLE artifact_versions (
    artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    artifact_type_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    producer_plugin_version TEXT NOT NULL,
    content_kind TEXT NOT NULL CHECK (content_kind IN ('inline', 'reference')),
    payload_json TEXT,
    content_ref TEXT,
    content_digest TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    metadata_json TEXT NOT NULL DEFAULT '{}',
    scope TEXT NOT NULL CHECK (scope IN ('personal', 'team_project')),
    availability TEXT NOT NULL CHECK (availability IN ('available', 'unavailable')),
    unavailable_reason TEXT,
    lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('active', 'archived')),
    supersedes_version INTEGER,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    archived_at TEXT,
    archived_by TEXT,
    PRIMARY KEY (artifact_id, version),
    FOREIGN KEY (artifact_id, supersedes_version)
      REFERENCES artifact_versions(artifact_id, version),
    CHECK (
      (content_kind = 'inline' AND payload_json IS NOT NULL AND content_ref IS NULL)
      OR (content_kind = 'reference' AND payload_json IS NULL AND content_ref IS NOT NULL)
    )
  );
CREATE TABLE artifacts (
    artifact_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    owner_actor_id TEXT NOT NULL,
    producer_plugin_id TEXT NOT NULL,
    producer_binding_signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (artifact_id, board_id)
  );
CREATE TABLE attention_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      at TEXT NOT NULL
    );
CREATE TABLE boards (
          board_id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          active_goal_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
INSERT INTO "boards" VALUES('goalboard-v1-demo','让第一次使用 Molis Work 的人顺利完成一次目标协作','V1','2026-09-10T07:03:28.489Z','2026-09-10T07:03:28.555Z');
CREATE TABLE candidates (
    candidate_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    submitted_by TEXT NOT NULL,
    discovered_in_run_id TEXT REFERENCES runs(run_id),
    proposed_goal_json TEXT NOT NULL,
    proposed_relations_json TEXT NOT NULL DEFAULT '[]',
    proposed_impacts_json TEXT NOT NULL DEFAULT '[]',
    proposed_risks_json TEXT NOT NULL DEFAULT '[]',
    blocking_mode TEXT NOT NULL CHECK (blocking_mode IN ('none', 'current_run', 'dependent_claims')),
    state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected', 'dismissed', 'superseded')),
    decision_json TEXT,
    created_at TEXT NOT NULL,
    decided_at TEXT
  );
INSERT INTO "candidates" VALUES('candidate-b0050ab4-1d01-4556-ac3d-fa0053f69ce2','goalboard-v1-demo','runtime-interface','run-65ec112f-54fe-499a-a41d-b5fc73d14f85','{"title":"让旧数据升级前先看到安全说明","outcome":"用户在升级前知道哪些内容会保留、哪些需要重新整理","why":"旧版数据和当前规则并不完全对应，直接迁移可能让用户误以为缺失内容仍然有效","business_logic":"用户升级时先看到每类旧数据的处理结果；能安全保留的内容明确列出，不能可靠迁移的内容提示重新整理，不会静默丢失或伪造。","acceptance_criteria":[{"statement":"升级报告逐项说明可迁移内容和需要重建的内容","decision_method":"automated_check","pass_condition":"迁移样例没有未解释字段"}]}','[]','[]','[]','none','pending',NULL,'2026-09-10T07:03:28.555Z',NULL);
CREATE TABLE claims (
    claim_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    actor_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
    contract_revision INTEGER NOT NULL DEFAULT 1,
    action_kind TEXT,
    action_target_id TEXT,
    state TEXT NOT NULL CHECK (state IN ('active', 'released', 'expired', 'revoked')),
    capabilities_json TEXT NOT NULL DEFAULT '[]',
    goal_mode_attestation INTEGER NOT NULL DEFAULT 0,
    resolved_policy_json TEXT NOT NULL,
    claimed_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    renewed_at TEXT,
    released_at TEXT,
    release_reason TEXT
  );
INSERT INTO "claims" VALUES('claim-dc5985a4-4a90-4aaa-880a-28f896f96e14','goalboard-v1-demo','CORE','runtime-core','executor',1,'execute','CORE','released','[]',0,'{"goal_mode":"preferred","required_capabilities":[],"self_verification":true,"cross_reviewers":0,"adversarial_reviewers":0,"human_approval":false,"max_lease_seconds":1800}','2026-09-10T07:03:28.540Z','2026-09-10T07:33:28.540Z',NULL,'2026-09-10T07:03:28.545Z','执行结果与当前 Contract revision 的必要 Evidence 已齐全，自动释放 Claim');
INSERT INTO "claims" VALUES('claim-c44fe62b-c4bf-4b0e-9d14-3f302a74c45b','goalboard-v1-demo','INTERFACES','runtime-interface','executor',1,'execute','INTERFACES','active','[]',0,'{"goal_mode":"preferred","required_capabilities":[],"self_verification":true,"cross_reviewers":0,"adversarial_reviewers":0,"human_approval":false,"max_lease_seconds":1800}','2026-09-10T07:03:28.554Z','2026-09-10T07:33:28.554Z',NULL,NULL,NULL);
CREATE TABLE clarification_sessions (
          session_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          claim_id TEXT REFERENCES claims(claim_id),
          run_id TEXT REFERENCES runs(run_id),
          rough_idea TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('clarifying', 'proposal_ready', 'closed')),
          current_understanding TEXT,
          next_question TEXT,
          proposal_summary TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          closed_at TEXT
        );
CREATE TABLE clarification_turns (
          turn_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES clarification_sessions(session_id) ON DELETE CASCADE,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          run_id TEXT REFERENCES runs(run_id),
          actor_id TEXT NOT NULL,
          turn_index INTEGER NOT NULL,
          turn_kind TEXT NOT NULL CHECK (turn_kind IN ('rough_idea', 'user_answer')),
          user_message TEXT NOT NULL,
          current_understanding TEXT,
          known_facts_json TEXT NOT NULL DEFAULT '[]',
          assumptions_json TEXT NOT NULL DEFAULT '[]',
          next_question TEXT,
          proposal_summary TEXT,
          created_at TEXT NOT NULL,
          UNIQUE(session_id, turn_index)
        );
CREATE TABLE context_edges (
      scope_kind TEXT NOT NULL CHECK (scope_kind IN ('personal', 'team_project')),
      scope_id TEXT NOT NULL,
      edge_key TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      relation_type TEXT NOT NULL,
      source_json TEXT NOT NULL,
      target_json TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      cause TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('active', 'removed')),
      PRIMARY KEY (scope_kind, scope_id, edge_key, revision)
    );
CREATE TABLE contract_proposals (
    proposal_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    submitted_by TEXT NOT NULL,
    discovered_in_run_id TEXT NOT NULL REFERENCES runs(run_id),
    proposed_goal_json TEXT NOT NULL,
    field_sources_json TEXT NOT NULL,
    review_policy_json TEXT NOT NULL,
    proposed_impacts_json TEXT NOT NULL DEFAULT '[]',
    proposed_risks_json TEXT NOT NULL DEFAULT '[]',
    dependency_rewire_ids_json TEXT NOT NULL DEFAULT '[]',
    state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected', 'superseded')),
    decision_json TEXT,
    created_at TEXT NOT NULL,
    decided_at TEXT
  );
CREATE TABLE coverage_contract_revisions (
    parent_goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    child_goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    parent_contract_revision INTEGER NOT NULL,
    child_contract_revision INTEGER NOT NULL,
    recorded_at TEXT NOT NULL,
    PRIMARY KEY (parent_goal_id, child_goal_id, parent_contract_revision)
  );
INSERT INTO "coverage_contract_revisions" VALUES('V1','PLATFORM',1,1,'2026-09-10T07:03:28.510Z');
INSERT INTO "coverage_contract_revisions" VALUES('V1','WORKSPACE',1,1,'2026-09-10T07:03:28.512Z');
INSERT INTO "coverage_contract_revisions" VALUES('V1','ADOPTION',1,1,'2026-09-10T07:03:28.513Z');
INSERT INTO "coverage_contract_revisions" VALUES('PLATFORM','CORE',1,1,'2026-09-10T07:03:28.514Z');
INSERT INTO "coverage_contract_revisions" VALUES('PLATFORM','INTERFACES',1,1,'2026-09-10T07:03:28.515Z');
INSERT INTO "coverage_contract_revisions" VALUES('WORKSPACE','WEB',1,1,'2026-09-10T07:03:28.524Z');
INSERT INTO "coverage_contract_revisions" VALUES('WORKSPACE','GRAPH',1,1,'2026-09-10T07:03:28.525Z');
INSERT INTO "coverage_contract_revisions" VALUES('WORKSPACE','DESKTOP',1,1,'2026-09-10T07:03:28.526Z');
INSERT INTO "coverage_contract_revisions" VALUES('ADOPTION','RELEASE',1,1,'2026-09-10T07:03:28.527Z');
INSERT INTO "coverage_contract_revisions" VALUES('ADOPTION','ONBOARDING',1,1,'2026-09-10T07:03:28.527Z');
INSERT INTO "coverage_contract_revisions" VALUES('ADOPTION','DOCS',1,1,'2026-09-10T07:03:28.528Z');
CREATE TABLE coverage_items (
    requirement_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    disposition TEXT NOT NULL CHECK (disposition IN ('covered', 'deferred', 'out', 'unresolved')),
    owner_goal_id TEXT REFERENCES goals(goal_id),
    reason TEXT,
    revisit_condition TEXT,
    blocking INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL UNIQUE,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          actor_id TEXT NOT NULL,
          type TEXT NOT NULL,
          object_type TEXT NOT NULL,
          object_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          at TEXT NOT NULL
        );
INSERT INTO "events" VALUES(1,'4005bba2-9fb1-4282-af2b-25b83e4ee59d','goalboard-v1-demo','demo-user','board.created','board','goalboard-v1-demo','创建 Molis Work 真相源','{"title":"让第一次使用 Molis Work 的人顺利完成一次目标协作"}','2026-09-10T07:03:28.489Z');
INSERT INTO "events" VALUES(2,'1e0548b8-3bc3-49ef-9352-8d2055cdae7d','goalboard-v1-demo','demo-user','goal.created','goal','V1','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_compound"}','2026-09-10T07:03:28.489Z');
INSERT INTO "events" VALUES(3,'a89a26dd-4a84-43cd-910e-39c2c41284e4','goalboard-v1-demo','demo-user','goal.created','goal','PLATFORM','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_compound"}','2026-09-10T07:03:28.490Z');
INSERT INTO "events" VALUES(4,'5b17734a-9a8d-41f6-8aa4-5347bee2c9ea','goalboard-v1-demo','demo-user','goal.created','goal','WORKSPACE','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_compound"}','2026-09-10T07:03:28.504Z');
INSERT INTO "events" VALUES(5,'834e4eff-f474-4a2c-b261-c08d4414f645','goalboard-v1-demo','demo-user','goal.created','goal','ADOPTION','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_compound"}','2026-09-10T07:03:28.505Z');
INSERT INTO "events" VALUES(6,'4be81538-8e7a-4b88-850d-dde451f86da3','goalboard-v1-demo','demo-user','goal.created','goal','CORE','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.505Z');
INSERT INTO "events" VALUES(7,'d1650f9d-9fb8-462e-ac0e-000f40978de6','goalboard-v1-demo','demo-user','goal.created','goal','INTERFACES','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.506Z');
INSERT INTO "events" VALUES(8,'7e46eaab-f9e7-40ec-8293-6b34768a3722','goalboard-v1-demo','demo-user','goal.created','goal','WEB','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.507Z');
INSERT INTO "events" VALUES(9,'3c6de0df-0efd-42f0-a9da-7f5db8c9833a','goalboard-v1-demo','demo-user','goal.created','goal','GRAPH','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.507Z');
INSERT INTO "events" VALUES(10,'20d383ec-4973-4446-a4f7-5c909901f30e','goalboard-v1-demo','demo-user','goal.created','goal','DESKTOP','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.507Z');
INSERT INTO "events" VALUES(11,'c4bee7cd-6369-4a05-8144-84a382442999','goalboard-v1-demo','demo-user','goal.created','goal','RELEASE','创建新 Goal','{"definition_state":"draft","decomposition_state":"abstract"}','2026-09-10T07:03:28.508Z');
INSERT INTO "events" VALUES(12,'adab0c96-d84f-40df-a154-d9716e5f9534','goalboard-v1-demo','demo-user','goal.created','goal','ONBOARDING','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.508Z');
INSERT INTO "events" VALUES(13,'c066123d-8bb0-4bc7-b55f-07a014a262f4','goalboard-v1-demo','demo-user','goal.created','goal','DOCS','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.509Z');
INSERT INTO "events" VALUES(14,'c30d9bae-6b25-4911-82c6-1d6875fb80f6','goalboard-v1-demo','demo-user','goal.created','goal','AUTO-CONNECT','创建新 Goal','{"definition_state":"accepted","decomposition_state":"closed_leaf"}','2026-09-10T07:03:28.509Z');
INSERT INTO "events" VALUES(15,'0e3b4c7f-3fa4-4eeb-b361-1d26779657b1','goalboard-v1-demo','demo-user','relation.added','relation','relation-46303826-25b2-4b8e-ad5e-b76617d90fc9','共同组成第一次完整的 Molis Work 使用体验','{"from_goal_id":"PLATFORM","to_goal_id":"V1","type":"part_of","reason":"共同组成第一次完整的 Molis Work 使用体验"}','2026-09-10T07:03:28.510Z');
INSERT INTO "events" VALUES(16,'a8f67517-1803-41b7-b450-18b9353870d1','goalboard-v1-demo','demo-user','relation.added','relation','relation-d0cedc75-3cc4-4977-a253-247efa2b82fb','共同组成第一次完整的 Molis Work 使用体验','{"from_goal_id":"WORKSPACE","to_goal_id":"V1","type":"part_of","reason":"共同组成第一次完整的 Molis Work 使用体验"}','2026-09-10T07:03:28.512Z');
INSERT INTO "events" VALUES(17,'f6f131ad-8701-4d9e-80d0-83ef4a9b3ea3','goalboard-v1-demo','demo-user','relation.added','relation','relation-4814cf00-c15c-4d86-b625-15f7c60df9b7','共同组成第一次完整的 Molis Work 使用体验','{"from_goal_id":"ADOPTION","to_goal_id":"V1","type":"part_of","reason":"共同组成第一次完整的 Molis Work 使用体验"}','2026-09-10T07:03:28.513Z');
INSERT INTO "events" VALUES(18,'66f71884-9649-4d38-b006-7619fbbba895','goalboard-v1-demo','demo-user','relation.added','relation','relation-9410d190-8f63-466a-8797-14efb68c326d','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"CORE","to_goal_id":"PLATFORM","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.514Z');
INSERT INTO "events" VALUES(19,'288f4dc5-7b96-410b-9188-c89423c8e4e9','goalboard-v1-demo','demo-user','relation.added','relation','relation-e744e983-eef6-4ea8-ad99-96cd1b73b248','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"INTERFACES","to_goal_id":"PLATFORM","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.515Z');
INSERT INTO "events" VALUES(20,'ced3ad73-a66d-4c60-9f09-450aa42014b8','goalboard-v1-demo','demo-user','relation.added','relation','relation-8217b2ac-8515-4f15-82de-c772e6c97a23','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"WEB","to_goal_id":"WORKSPACE","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.524Z');
INSERT INTO "events" VALUES(21,'3d45ee25-eb78-48b2-b880-7eb6cb092b3f','goalboard-v1-demo','demo-user','relation.added','relation','relation-730b96da-261b-4736-9788-7f8f89edcf64','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"GRAPH","to_goal_id":"WORKSPACE","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.525Z');
INSERT INTO "events" VALUES(22,'64520514-3c85-4d42-879e-57ff5dcb72e7','goalboard-v1-demo','demo-user','relation.added','relation','relation-f5af7868-c03c-4486-975b-01f92da14355','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"DESKTOP","to_goal_id":"WORKSPACE","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.526Z');
INSERT INTO "events" VALUES(23,'1a594912-70e4-475c-8f3f-0ac467667030','goalboard-v1-demo','demo-user','relation.added','relation','relation-ecd7a888-4fdb-4ff5-8aeb-22b195aa8a45','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"RELEASE","to_goal_id":"ADOPTION","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.527Z');
INSERT INTO "events" VALUES(24,'98bb304c-9ce3-46f6-976b-2c61706c296c','goalboard-v1-demo','demo-user','relation.added','relation','relation-e62c0749-b7fe-4bd9-9669-e0063c9b289d','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"ONBOARDING","to_goal_id":"ADOPTION","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.527Z');
INSERT INTO "events" VALUES(25,'d4a784b3-2739-4398-a11f-0ad8a6cbd2a4','goalboard-v1-demo','demo-user','relation.added','relation','relation-fd86817a-3c4e-41b0-8311-a2c55b7daaed','在 Mock 项目中形成可追溯的产品目标层级','{"from_goal_id":"DOCS","to_goal_id":"ADOPTION","type":"part_of","reason":"在 Mock 项目中形成可追溯的产品目标层级"}','2026-09-10T07:03:28.528Z');
INSERT INTO "events" VALUES(26,'4927695b-c0b0-4bd0-ae0d-bb73508db30d','goalboard-v1-demo','demo-user','relation.added','relation','relation-3db70bd7-947c-44d4-b92f-7c794331177d','共享项目进度前，必须先保证每项工作的状态和完成依据可靠','{"from_goal_id":"INTERFACES","to_goal_id":"CORE","type":"depends_on","reason":"共享项目进度前，必须先保证每项工作的状态和完成依据可靠"}','2026-09-10T07:03:28.528Z');
INSERT INTO "events" VALUES(27,'c740eeef-9c17-40b5-b155-29247d33fe12','goalboard-v1-demo','demo-user','relation.added','relation','relation-a2944b01-48f2-43a4-8215-bb3d5165fec8','页面显示必须和不同 Runtime 看到的项目进度一致','{"from_goal_id":"WEB","to_goal_id":"INTERFACES","type":"depends_on","reason":"页面显示必须和不同 Runtime 看到的项目进度一致"}','2026-09-10T07:03:28.529Z');
INSERT INTO "events" VALUES(28,'c8a5255c-fbb0-4458-b080-92df8a2dfef0','goalboard-v1-demo','demo-user','relation.added','relation','relation-6b87504f-8ad9-49a9-acc4-4d75f39eea1d','关系图必须读取不同 Runtime 共享的同一份 Goal 关系事实','{"from_goal_id":"GRAPH","to_goal_id":"INTERFACES","type":"depends_on","reason":"关系图必须读取不同 Runtime 共享的同一份 Goal 关系事实"}','2026-09-10T07:03:28.529Z');
INSERT INTO "events" VALUES(29,'d2c9656b-feb2-4ab1-aaf3-e1dbec8dfd1d','goalboard-v1-demo','demo-user','relation.added','relation','relation-5e6401d7-b1dc-4a94-8c53-f04539921f6a','桌面工作站必须先建立可靠的 Goal 状态与完成依据','{"from_goal_id":"DESKTOP","to_goal_id":"CORE","type":"depends_on","reason":"桌面工作站必须先建立可靠的 Goal 状态与完成依据"}','2026-09-10T07:03:28.530Z');
INSERT INTO "events" VALUES(30,'350f3de8-5eab-49f0-a7fd-b32c4a36fe94','goalboard-v1-demo','demo-user','relation.added','relation','relation-341fe1f6-94a5-4b9d-96d8-1481878e7570','首次体验需要建立在可重复的安装与接入路径上','{"from_goal_id":"ONBOARDING","to_goal_id":"RELEASE","type":"depends_on","reason":"首次体验需要建立在可重复的安装与接入路径上"}','2026-09-10T07:03:28.530Z');
INSERT INTO "events" VALUES(31,'f5dcb3fd-64d7-43fc-8ec6-7463b65de061','goalboard-v1-demo','demo-user','relation.added','relation','relation-26184b19-74b6-4509-a239-b2c3d9ef3b67','README 的演示必须来自已经走通的首次体验','{"from_goal_id":"DOCS","to_goal_id":"ONBOARDING","type":"depends_on","reason":"README 的演示必须来自已经走通的首次体验"}','2026-09-10T07:03:28.530Z');
INSERT INTO "events" VALUES(32,'b21fc594-b94e-41e2-b420-2088badc84a3','goalboard-v1-demo','demo-user','risk.created','risk','RISK-FIRST-RESTART','登记 Goal 风险','{"goal_ids":["RELEASE"],"blocking_mode":"none"}','2026-09-10T07:03:28.532Z');
INSERT INTO "events" VALUES(33,'123a51e2-5d73-4cfc-ba4f-2fe994fb5d2d','goalboard-v1-demo','demo-user','goal.trashed','goal','AUTO-CONNECT','这会替用户猜项目；当前方案只展示历史候选，并再次询问用户','{"trash_record_id":"trash-c5c4a4b4-7cc5-45b5-94a4-dcd93556680b","deactivated_relation_ids":[],"active_goal_cleared":false}','2026-09-10T07:03:28.538Z');
INSERT INTO "events" VALUES(34,'9ac6436e-6193-426d-9208-534abf925c48','goalboard-v1-demo','runtime-core','claim.created','claim','claim-dc5985a4-4a90-4aaa-880a-28f896f96e14','Runtime 自主领取 Ready Goal','{"goal_id":"CORE","role":"executor","contract_revision":1,"action_id":"action-c49a463513edc5552c80bf42","action_kind":"execute","action_target_id":"CORE","expires_at":"2026-09-10T07:33:28.540Z"}','2026-09-10T07:03:28.540Z');
INSERT INTO "events" VALUES(35,'03f3d7d7-99e5-424b-8a55-c6967e697d9f','goalboard-v1-demo','runtime-core','run.started','run','run-45ec1136-7bbf-4740-9e6b-1689e672c7af','开始执行已领取的 Goal','{"goal_id":"CORE","claim_id":"claim-dc5985a4-4a90-4aaa-880a-28f896f96e14"}','2026-09-10T07:03:28.541Z');
INSERT INTO "events" VALUES(36,'94f6f65e-fd15-4176-8d9a-36543c6ee525','goalboard-v1-demo','runtime-core','run.completed','run','run-45ec1136-7bbf-4740-9e6b-1689e672c7af','Run 状态变为 completed','{"output_refs":["tests/v1.test.ts"],"discovery_refs":[]}','2026-09-10T07:03:28.543Z');
INSERT INTO "events" VALUES(37,'bb8084ad-7694-4ad2-9d09-90c2967683d6','goalboard-v1-demo','runtime-core','evidence.submitted','evidence','evidence-3aaba898-2eb4-4565-acbb-13cccced105f','提交验收证据','{"goal_id":"CORE","criterion_ids":["CORE-C1"],"result":"passed"}','2026-09-10T07:03:28.545Z');
INSERT INTO "events" VALUES(38,'c0ed775f-0744-4e63-aaf9-474b20ee0ef6','goalboard-v1-demo','runtime-core','claim.auto_released','claim','claim-dc5985a4-4a90-4aaa-880a-28f896f96e14','执行结果与当前 Contract revision 的必要 Evidence 已齐全，自动释放 Claim','{"goal_id":"CORE","contract_revision":1,"action_kind":"execute","action_target_id":"CORE"}','2026-09-10T07:03:28.545Z');
INSERT INTO "events" VALUES(39,'b9e7acac-d342-4735-9d89-39daf111a505','goalboard-v1-demo','runtime-core','review.submitted','review','review-3c52c9fe-13b8-41ce-92d2-725de601ae6f','生命周期测试通过','{"goal_id":"CORE","obligation_id":"obligation-64b45adb-d01f-4ee5-a9d7-fba2f7dcb9a6","verdict":"pass"}','2026-09-10T07:03:28.550Z');
INSERT INTO "events" VALUES(40,'9de43170-634c-44ee-9013-f69d22c3eb9e','goalboard-v1-demo','runtime-core','goal.satisfied','goal','CORE','当前 Contract revision 的执行、依据、复核和风险门禁均已满足','{"auto":true,"contract_revision":1,"active_goal_cleared":false}','2026-09-10T07:03:28.550Z');
INSERT INTO "events" VALUES(41,'b0f649f8-0dbf-4314-b74e-0d8956b42ae2','goalboard-v1-demo','runtime-interface','claim.created','claim','claim-c44fe62b-c4bf-4b0e-9d14-3f302a74c45b','Runtime 自主领取 Ready Goal','{"goal_id":"INTERFACES","role":"executor","contract_revision":1,"action_id":"action-083e1c32b3407ac07d61709a","action_kind":"execute","action_target_id":"INTERFACES","expires_at":"2026-09-10T07:33:28.554Z"}','2026-09-10T07:03:28.554Z');
INSERT INTO "events" VALUES(42,'a7ad3df3-d2bf-420a-bdf6-921f7aa97e91','goalboard-v1-demo','runtime-interface','run.started','run','run-65ec112f-54fe-499a-a41d-b5fc73d14f85','开始执行已领取的 Goal','{"goal_id":"INTERFACES","claim_id":"claim-c44fe62b-c4bf-4b0e-9d14-3f302a74c45b"}','2026-09-10T07:03:28.554Z');
INSERT INTO "events" VALUES(43,'f6adf6f5-9ff2-45a8-b0ce-39b3379b1b24','goalboard-v1-demo','runtime-interface','candidate.submitted','candidate','candidate-b0050ab4-1d01-4556-ac3d-fa0053f69ce2','澄清或执行中发现了 Goal 之外的新工作，等待用户决定','{"blocking_mode":"none"}','2026-09-10T07:03:28.555Z');
INSERT INTO "events" VALUES(44,'0a7bbc6e-88f6-4a94-87c7-944be0ff82e4','goalboard-v1-demo','migration-user','goal.created','goal','OLD-HUMAN','创建新 Goal','{"definition_state":"draft","decomposition_state":"abstract"}','2026-09-10T07:03:28.560Z');
INSERT INTO "events" VALUES(45,'488bf575-5e66-484a-a26f-163e0097098a','goalboard-v1-demo','migration-user','goal.created','goal','OLD-POLICY','创建新 Goal','{"definition_state":"draft","decomposition_state":"abstract"}','2026-09-10T07:03:28.560Z');
INSERT INTO "events" VALUES(46,'7c1558b1-e478-47b3-9f27-0c1954fc8a6d','goalboard-v1-demo','migration-user','goal.created','goal','OLD-RISK','创建新 Goal','{"definition_state":"draft","decomposition_state":"abstract"}','2026-09-10T07:03:28.561Z');
CREATE TABLE evidence (
    evidence_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    contract_revision INTEGER NOT NULL DEFAULT 1,
    criterion_ids_json TEXT NOT NULL,
    producer_actor_id TEXT NOT NULL,
    run_id TEXT REFERENCES runs(run_id),
    review_id TEXT,
    kind TEXT NOT NULL,
    locator TEXT NOT NULL,
    locator_status TEXT NOT NULL DEFAULT 'unverified' CHECK (locator_status IN ('verified', 'unverified')),
    locator_validation_reason TEXT NOT NULL DEFAULT '历史 Evidence 未进行 locator 预检',
    locator_checked_at TEXT,
    locator_workspace_id TEXT,
    locator_workspace_root TEXT,
    digest TEXT,
    captured_at TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('passed', 'failed', 'inconclusive')),
    historical_unmapped INTEGER NOT NULL DEFAULT 0
  );
INSERT INTO "evidence" VALUES('evidence-3aaba898-2eb4-4565-acbb-13cccced105f','goalboard-v1-demo','CORE',1,'["CORE-C1"]','runtime-core','run-45ec1136-7bbf-4740-9e6b-1689e672c7af',NULL,'test','command://pnpm-test','unverified','不透明或外部 locator 已保留为 UNVERIFIED；Molis Work 不会调用自定义协议','2026-09-10T07:03:28.545Z',NULL,NULL,NULL,'2026-09-10T07:03:28.545Z','passed',0);
CREATE TABLE evidence_corrections (
    correction_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    target_evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence(evidence_id),
    action TEXT NOT NULL CHECK (action IN ('supersede', 'retract')),
    replacement_evidence_id TEXT REFERENCES evidence(evidence_id),
    actor_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK (
      (action = 'supersede' AND replacement_evidence_id IS NOT NULL) OR
      (action = 'retract' AND replacement_evidence_id IS NULL)
    )
  );
CREATE TABLE feed_contract_migration_receipts (
      receipt_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      preflight_json TEXT NOT NULL,
      postflight_json TEXT NOT NULL,
      rollback_strategy TEXT NOT NULL CHECK (rollback_strategy = 'sqlite_immediate_transaction'),
      applied_at TEXT NOT NULL
    );
INSERT INTO "feed_contract_migration_receipts" VALUES('infoflow-contract-v1',29,'{"feed_items":0,"legacy_inbox_messages":0,"inbox_entries":0}','{"feed_items":0,"legacy_inbox_messages":0,"inbox_entries":0,"orphan_feed_item_entries":0}','sqlite_immediate_transaction','2026-09-10T07:03:28.485Z');
CREATE TABLE feed_import_receipts (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      receipt_id TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      credentials_status TEXT NOT NULL CHECK (credentials_status IN ('migrated', 'unavailable', 'not_requested')),
      content_status TEXT NOT NULL CHECK (content_status IN ('migrated', 'partial', 'unavailable', 'not_requested')),
      completed_at TEXT NOT NULL,
      PRIMARY KEY (board_id, receipt_id)
    );
CREATE TABLE feed_item_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      at TEXT NOT NULL
    );
CREATE TABLE feed_items (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      source_id TEXT,
      signal_id TEXT,
      signal_revision INTEGER,
      item_type TEXT NOT NULL CHECK (item_type IN ('inbox_message', 'feed')),
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      body TEXT,
      source_kind TEXT NOT NULL,
      source_label TEXT NOT NULL,
      external_id TEXT,
      url TEXT,
      origin_status TEXT NOT NULL,
      priority TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      author TEXT,
      disposition TEXT NOT NULL CHECK (disposition IN ('inbox', 'saved', 'promoted', 'processing', 'archived')),
      linked_goal_id TEXT,
      read_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      source_created_at TEXT NOT NULL,
      source_updated_at TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, item_id)
    );
CREATE TABLE feed_materials (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      material_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      canonical_url TEXT,
      title TEXT NOT NULL,
      source_name TEXT NOT NULL,
      published_at TEXT,
      preview TEXT NOT NULL DEFAULT '',
      content_hash TEXT,
      content_ref TEXT,
      content_available INTEGER NOT NULL DEFAULT 0,
      content_type TEXT,
      character_count INTEGER,
      captured_at TEXT,
      provenance_json TEXT NOT NULL DEFAULT '{}',
      selected_for_context INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, material_id),
      FOREIGN KEY (board_id, item_id) REFERENCES feed_items(board_id, item_id) ON DELETE CASCADE
    );
CREATE TABLE feed_runtime_blobs (
    namespace TEXT NOT NULL, key TEXT NOT NULL, opaque TEXT NOT NULL, cas_token TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
  );
CREATE TABLE feed_source_runs (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      run_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      phase TEXT NOT NULL CHECK (phase IN ('running', 'terminal', 'interrupted')),
      outcome TEXT,
      empty INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      receipt_json TEXT,
      created_count INTEGER NOT NULL DEFAULT 0,
      deduped_count INTEGER NOT NULL DEFAULT 0,
      recovery_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, run_id),
      UNIQUE (board_id, operation_id),
      FOREIGN KEY (board_id, source_id) REFERENCES feed_sources(board_id, source_id) ON DELETE CASCADE
    );
CREATE TABLE feed_sources (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      definition_id TEXT,
      sync_kind TEXT NOT NULL DEFAULT 'manual' CHECK (sync_kind IN ('public_source', 'github', 'gmail', 'manual')),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      item_count INTEGER NOT NULL DEFAULT 0,
      origin TEXT NOT NULL CHECK (origin IN ('relay', 'goalboard')),
      config_json TEXT NOT NULL DEFAULT '{}',
      schedule_json TEXT NOT NULL DEFAULT '{"mode":"manual"}',
      cursor_json TEXT NOT NULL DEFAULT '{}',
      credential_ref TEXT,
      account_label TEXT,
      last_sync_at TEXT,
      last_outcome TEXT,
      last_error_code TEXT,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, source_id)
    );
CREATE TABLE goal_contract_revisions (
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    contract_json TEXT NOT NULL,
    effect TEXT NOT NULL CHECK (effect IN ('metadata', 'revalidate', 'rework')),
    source_proposal_id TEXT,
    changed_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (goal_id, revision)
  );
INSERT INTO "goal_contract_revisions" VALUES('V1','goalboard-v1-demo',1,'{"goal_id":"V1","title":"让第一次使用的人顺利完成一轮目标协作","outcome":"用户能把一个模糊想法变成清楚的目标树，并知道下一步、阻塞和完成依据","why":"AI 对话结束后容易丢失目标、决定和进度，新用户尤其难判断该从哪里继续","business_logic":"用户先在当前对话说明想做什么，Runtime 通过提问整理目标并请用户确认；确认后，当前或后续 Runtime 从可做项中选择工作，提交结果和证据，Molis Work 持续保存共同进度。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"accepted","decomposition_state":"closed_compound","priority":100,"acceptance_criteria":[{"criterion_id":"V1-C1","statement":"第一次使用的人能从首屏看懂目标、下一步和阻塞","decision_method":"inspection","pass_condition":"首次使用者无需阅读协议即可正确复述","target":null,"required_evidence":[]}]}','metadata',NULL,'demo-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.489Z');
INSERT INTO "goal_contract_revisions" VALUES('PLATFORM','goalboard-v1-demo',1,'{"goal_id":"PLATFORM","title":"让项目事实成为不同 Runtime 的共同底座","outcome":"不同 AI、会话和工具读取同一份 Goal、关系、决定、进度与完成依据","why":"长程任务最容易在切换对话和 Runtime 后失去共同上下文","business_logic":"Molis Work 保存项目事实；Runtime 只负责读取可做项、执行工作并提交结果，不在各自会话里维护另一套项目记忆。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"accepted","decomposition_state":"closed_compound","priority":96,"acceptance_criteria":[{"criterion_id":"PLATFORM-C1","statement":"不同 Runtime 读取到一致的 Goal 状态与完成依据","decision_method":"automated_check","pass_condition":"跨入口一致性测试通过","target":null,"required_evidence":[]}]}','metadata',NULL,'demo-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.490Z');
INSERT INTO "goal_contract_revisions" VALUES('WORKSPACE','goalboard-v1-demo',1,'{"goal_id":"WORKSPACE","title":"让人能在同一工作台看清并推进 Goal","outcome":"用户在一个窗口里查看 Goal Tree、Focus、Graph 和 Goal-bound Runtime","why":"频繁切换页面、终端和 AI 对话会打断判断，也让 Goal 与执行 Session 脱节","business_logic":"桌面端把 Goal 导航、当前工作和 Runtime 组合成连续工作面；网页保留同一份项目事实与独立访问方式。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"accepted","decomposition_state":"closed_compound","priority":94,"acceptance_criteria":[{"criterion_id":"WORKSPACE-C1","statement":"用户不切窗口即可从 Goal 进入对应 Runtime","decision_method":"inspection","pass_condition":"桌面主工作流可完成并保持 Goal 绑定","target":null,"required_evidence":[]}]}','metadata',NULL,'demo-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.504Z');
INSERT INTO "goal_contract_revisions" VALUES('ADOPTION','goalboard-v1-demo',1,'{"goal_id":"ADOPTION","title":"让第一次接入从安装走到真实推进","outcome":"新用户从 README、安装和首次打开一路走到推进第一条 Goal","why":"只把程序装上不等于用户已经理解产品，更不等于完成第一次有效使用","business_logic":"公开文档先解释适用场景，再引导安装、连接 Runtime、选择项目并推进一条可执行 Goal。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"accepted","decomposition_state":"closed_compound","priority":92,"acceptance_criteria":[{"criterion_id":"ADOPTION-C1","statement":"首次用户能独立完成一次从安装到推进的闭环","decision_method":"inspection","pass_condition":"首次使用走查无阻断步骤","target":null,"required_evidence":[]}]}','metadata',NULL,'demo-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.505Z');
INSERT INTO "goal_contract_revisions" VALUES('CORE','goalboard-v1-demo',1,'{"goal_id":"CORE","title":"让每项工作都有可信的完成依据","outcome":"用户能看到一项工作何时开始、做出了什么，以及为什么可以算完成","why":"只有进度标签而没有结果、证据和复核，用户仍然无法相信工作真的完成了","business_logic":"Runtime 选择一项已经准备好的工作并标记开始；完成后提交对应验收条件的证据，必要复核通过后，这项工作才会显示为已完成。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"accepted","decomposition_state":"closed_leaf","priority":90,"acceptance_criteria":[{"criterion_id":"CORE-C1","statement":"工作从开始到证据和复核形成完整记录","decision_method":"automated_check","pass_condition":"生命周期自动化测试通过","target":null,"required_evidence":[]}]}','metadata',NULL,'demo-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.505Z');
INSERT INTO "goal_contract_revisions" VALUES('INTERFACES','goalboard-v1-demo',1,'{"goal_id":"INTERFACES","title":"让不同 AI 对话看到同一项目进度","outcome":"用户换一个 Runtime 或新开对话后，仍能找到同一个项目的目标、进度和未完成工作","why":"如果每个入口各自记录状态，用户换一次对话就要重新解释整个项目","business_logic":"用户在当前对话明确选择项目后继续推进；其他 Runtime 也通过 Molis Work 读取和更新同一份项目事实，不会各自维护一套进度。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"accepted","decomposition_state":"closed_leaf","priority":80,"acceptance_criteria":[{"criterion_id":"INTERFACES-C1","statement":"不同入口读取到一致的可做工作和占用状态","decision_method":"automated_check","pass_condition":"跨入口自动化测试通过","target":null,"required_evidence":[]}]}','metadata',NULL,'demo-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.506Z');
INSERT INTO "goal_contract_revisions" VALUES('WEB','goalboard-v1-demo',1,'{"goal_id":"WEB","title":"让用户打开页面就看懂目标和下一步","outcome":"用户不用理解内部协议，也能看出项目要解决什么、当前进展、谁该做什么和为什么被阻塞","why":"底层规则正确并不代表产品容易理解；信息组织混乱会让用户放弃继续使用","business_logic":"用户打开项目后先看到目标树和当前目标，再按结果、完成标准、推进情况、风险和历史阅读；搜索、状态筛选和待决定事项都放在统一导航中。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"accepted","decomposition_state":"closed_leaf","priority":70,"acceptance_criteria":[{"criterion_id":"WEB-C1","statement":"桌面和移动端关键信息清楚可用","decision_method":"inspection","pass_condition":"视觉、响应式和可访问性 QA 通过","target":null,"required_evidence":[]}]}','metadata',NULL,'demo-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.507Z');
INSERT INTO "goal_contract_revisions" VALUES('GRAPH','goalboard-v1-demo',1,'{"goal_id":"GRAPH","title":"让复杂 Goal 关系仍然一眼可读","outcome":"父子层级、前置依赖和当前焦点在复杂网络中仍有清楚的方向与落点","why":"列表适合顺序浏览，但复杂 Goal 的多层结构和跨分支依赖会在列表里变得难以判断","business_logic":"用户在 List 与 Graph 之间切换；Graph 只读取真实父子和依赖关系，以节点、分区和有向连线呈现。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"accepted","decomposition_state":"closed_leaf","priority":76,"acceptance_criteria":[{"criterion_id":"GRAPH-C1","statement":"复杂网络中的关系方向和阻塞节点可以直接辨认","decision_method":"inspection","pass_condition":"12 Goal 演示网络在桌面宽度下可读","target":null,"required_evidence":[]}]}','metadata',NULL,'demo-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.507Z');
INSERT INTO "goal_contract_revisions" VALUES('DESKTOP','goalboard-v1-demo',1,'{"goal_id":"DESKTOP","title":"把 Molis Work 作为不切窗口的主工作站","outcome":"用户在桌面端同时看到 Goal、下一步、完成要求和强绑定的 Runtime","why":"工作在 AI 对话里推进、状态在另一个页面查看，会增加切换成本并削弱人的掌控感","business_logic":"桌面端复用网页事实和 Runtime 能力，将全局控制放进 TitleBar，并为 List、Focus 与 Runtime 保留连续三栏。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"accepted","decomposition_state":"closed_leaf","priority":74,"acceptance_criteria":[{"criterion_id":"DESKTOP-C1","statement":"桌面端三栏在宽屏下形成完整工作闭环","decision_method":"inspection","pass_condition":"Goal 选择、Focus 与 Runtime 归属保持同步","target":null,"required_evidence":[]}]}','metadata',NULL,'demo-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.507Z');
INSERT INTO "goal_contract_revisions" VALUES('RELEASE','goalboard-v1-demo',1,'{"goal_id":"RELEASE","title":"让新用户安装后知道下一步怎么开始","outcome":"用户完成安装后知道如何启动页面、连接正在使用的 Runtime，以及为什么需要新开会话","why":"安装成功但不知道服务是否常驻、工具何时生效或下一步说什么，仍然会被理解成产品不可用","business_logic":"安装只放置 Molis Work 自己的程序，不偷偷修改项目或 Runtime；用户随后显式启用常驻服务、预览并确认 Runtime 接入，再在新会话中选择或创建项目开始使用。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"draft","decomposition_state":"abstract","priority":60,"acceptance_criteria":[{"criterion_id":"RELEASE-C1","statement":"安装、接入和重启提示可以按公开步骤重复完成","decision_method":"automated_check","pass_condition":"全新安装端到端验证通过","target":null,"required_evidence":[]}]}','metadata',NULL,'demo-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.508Z');
INSERT INTO "goal_contract_revisions" VALUES('ONBOARDING','goalboard-v1-demo',1,'{"goal_id":"ONBOARDING","title":"让用户第一次打开就完成有效操作","outcome":"用户首次进入后能选择项目、找到可做 Goal，并理解 Runtime 为什么绑定到它","why":"展示很多功能不等于用户知道第一步做什么，首屏需要直接引向一次有效推进","business_logic":"首次体验使用一份明确标记的 Mock 项目，沿着可做 Goal、下一步与 Runtime 归属完成一轮引导。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"accepted","decomposition_state":"closed_leaf","priority":58,"acceptance_criteria":[{"criterion_id":"ONBOARDING-C1","statement":"首次用户无需外部讲解即可推进第一条 Goal","decision_method":"inspection","pass_condition":"首次体验测试完成一条可执行 Goal","target":null,"required_evidence":[]}]}','metadata',NULL,'demo-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.508Z');
INSERT INTO "goal_contract_revisions" VALUES('DOCS','goalboard-v1-demo',1,'{"goal_id":"DOCS","title":"让用户从 README 进入正确的使用方式","outcome":"用户先理解长程任务为何会跑偏，再看到 Molis Work 的闭环、桌面端和 Runtime 伴随方式","why":"功能清单无法建立需求感，也无法解释 Molis Work 与 Agent Orchestration 的边界","business_logic":"README 用痛点、核心思路和完整演示组织内容；截图来自 Mock 项目的真实网页与桌面页面。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"accepted","decomposition_state":"closed_leaf","priority":56,"acceptance_criteria":[{"criterion_id":"DOCS-C1","statement":"README 清楚表达痛点、边界、闭环与多种使用方式","decision_method":"inspection","pass_condition":"目标用户能准确复述产品独特机制","target":null,"required_evidence":[]}]}','metadata',NULL,'demo-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.509Z');
INSERT INTO "goal_contract_revisions" VALUES('AUTO-CONNECT','goalboard-v1-demo',1,'{"goal_id":"AUTO-CONNECT","title":"自动替用户选择最近使用的项目","outcome":"新对话少做一次项目确认","why":"早期方案希望用历史目录记录缩短首次连接步骤","business_logic":"新对话进入一个以前使用过的目录时，系统直接连接最近的项目，不再询问用户。这个方案可能选错项目，因此已经移入回收站，当前产品只展示候选并让用户决定。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"accepted","decomposition_state":"closed_leaf","priority":10,"acceptance_criteria":[{"criterion_id":"AUTO-CONNECT-C1","statement":"新对话无需确认就进入历史项目","decision_method":"inspection","pass_condition":"进入历史目录后直接显示最近项目","target":null,"required_evidence":[]}]}','metadata',NULL,'demo-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.509Z');
INSERT INTO "goal_contract_revisions" VALUES('OLD-HUMAN','goalboard-v1-demo',1,'{"goal_id":"OLD-HUMAN","title":"历史迁移场景 OLD-HUMAN","outcome":"用户亲自核对付款体验","why":"保留已有明确约定","business_logic":"单向升级后要求和责任仍须可读可改","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"draft","decomposition_state":"abstract","priority":0,"acceptance_criteria":[{"criterion_id":"OLD-HUMAN-C1","statement":"用户亲自核对付款体验","decision_method":"human_decision","pass_condition":"用户亲自核对付款体验","target":null,"required_evidence":[]}]}','metadata',NULL,'migration-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.560Z');
INSERT INTO "goal_contract_revisions" VALUES('OLD-POLICY','goalboard-v1-demo',1,'{"goal_id":"OLD-POLICY","title":"历史迁移场景 OLD-POLICY","outcome":"实际付款成功","why":"保留已有明确约定","business_logic":"单向升级后要求和责任仍须可读可改","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"draft","decomposition_state":"abstract","priority":0,"acceptance_criteria":[{"criterion_id":"OLD-POLICY-C1","statement":"实际付款成功","decision_method":"inspection","pass_condition":"实际付款成功","target":null,"required_evidence":[]}]}','metadata',NULL,'migration-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.560Z');
INSERT INTO "goal_contract_revisions" VALUES('OLD-RISK','goalboard-v1-demo',1,'{"goal_id":"OLD-RISK","title":"历史迁移场景 OLD-RISK","outcome":"结果可以打开","why":"保留已有明确约定","business_logic":"单向升级后要求和责任仍须可读可改","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"definition_state":"draft","decomposition_state":"abstract","priority":0,"acceptance_criteria":[{"criterion_id":"OLD-RISK-C1","statement":"结果可以打开","decision_method":"inspection","pass_condition":"结果可以打开","target":null,"required_evidence":[]}]}','metadata',NULL,'migration-user','创建 Goal Contract revision 1','2026-09-10T07:03:28.561Z');
CREATE TABLE goal_event_agreements (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    outcome TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    event_id TEXT,
    PRIMARY KEY (board_id, goal_id, version)
  );
CREATE TABLE goal_event_applied_decisions (
    decision_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    governance_decision_id TEXT NOT NULL,
    request_id TEXT,
    event_id TEXT NOT NULL,
    selected_option_id TEXT,
    conclusion TEXT NOT NULL,
    accepts_requirements INTEGER NOT NULL CHECK (accepts_requirements IN (0, 1)),
    effects_json TEXT NOT NULL DEFAULT '[]',
    scope_json TEXT NOT NULL,
    commitment_json TEXT NOT NULL DEFAULT '{"outcome":"","requirements":[]}',
    authorized_change_json TEXT,
    config_version INTEGER,
    agreement_version INTEGER,
    actor_id TEXT NOT NULL,
    authority_source TEXT NOT NULL CHECK (authority_source IN ('web', 'management')),
    recorded_at TEXT NOT NULL
  );
CREATE TABLE goal_event_closures (
    closure_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('complete', 'cancel')),
    result TEXT,
    reason TEXT NOT NULL,
    completion_applied INTEGER NOT NULL CHECK (completion_applied IN (0, 1)),
    expected_config_version INTEGER NOT NULL,
    expected_agreement_version INTEGER NOT NULL DEFAULT 0,
    config_version INTEGER,
    agreement_version INTEGER,
    unmet_reasons_json TEXT NOT NULL DEFAULT '[]',
    superseded INTEGER NOT NULL CHECK (superseded IN (0, 1)),
    superseded_reason TEXT,
    recorded_at TEXT NOT NULL
  );
CREATE TABLE goal_event_concerns (
    concern_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    title TEXT NOT NULL,
    statement TEXT NOT NULL,
    scope_json TEXT NOT NULL,
    blocks_closure INTEGER NOT NULL CHECK (blocks_closure IN (0, 1)),
    status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'accepted', 'overturned')),
    resolution_reason TEXT,
    resolution_event_id TEXT,
    cited_decision_id TEXT,
    previous_status TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
CREATE TABLE goal_event_config_versions (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    adopted_planning_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    config_event_id TEXT NOT NULL,
    PRIMARY KEY (board_id, goal_id, version)
  );
CREATE TABLE goal_event_configs (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    current_version INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    PRIMARY KEY (board_id, goal_id)
  );
CREATE TABLE goal_event_decision_requests (
    request_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    question TEXT NOT NULL,
    options_json TEXT NOT NULL,
    scope_json TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'suggestion' CHECK (purpose IN ('suggestion', 'requirement_acceptance', 'action', 'agreement_change')),
    proposed_change_json TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'decided')),
    created_at TEXT NOT NULL
  );
CREATE TABLE goal_event_progress_summaries (
    summary_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    summary_text TEXT NOT NULL,
    based_on_cursor INTEGER NOT NULL,
    next_step TEXT,
    next_actor TEXT,
    actor_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );
CREATE TABLE goal_event_requirement_bindings (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    type_id TEXT NOT NULL,
    requirement_id TEXT NOT NULL,
    created_in_config_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (board_id, goal_id, type_id, requirement_id)
  );
CREATE TABLE goal_event_requirement_conclusions (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    requirement_id TEXT NOT NULL,
    decision_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('accepted', 'rejected')),
    received_at TEXT NOT NULL,
    journal_seq INTEGER NOT NULL,
    PRIMARY KEY (board_id, goal_id, requirement_id, decision_id)
  );
CREATE TABLE goal_event_requirements (
    requirement_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    bound_type_id TEXT,
    created_at TEXT NOT NULL,
    created_in_config_version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    source_json TEXT,
    human_decision_required INTEGER NOT NULL DEFAULT 0 CHECK (human_decision_required IN (0, 1)),
    current_status TEXT NOT NULL DEFAULT 'active' CHECK (current_status IN ('active', 'retired')),
    revision INTEGER NOT NULL DEFAULT 1,
    support_valid_after_seq INTEGER NOT NULL DEFAULT 0
  );
CREATE TABLE goal_event_state_owners (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    owner TEXT NOT NULL CHECK (owner = 'event_work'),
    source TEXT NOT NULL CHECK (source IN ('intent', 'configuration', 'continue')),
    adopted_at TEXT NOT NULL,
    adopted_by TEXT NOT NULL,
    PRIMARY KEY (goal_id)
  );
CREATE TABLE goal_event_trusted_decisions (
    decision_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind = 'user'),
    authority_source TEXT NOT NULL CHECK (authority_source IN ('web', 'management')),
    conversation_ref TEXT NOT NULL,
    message_ref TEXT NOT NULL,
    request_id TEXT,
    selected_option_id TEXT,
    conclusion TEXT NOT NULL,
    accepts_requirements INTEGER NOT NULL CHECK (accepts_requirements IN (0, 1)),
    scope_json TEXT NOT NULL,
    change_json TEXT,
    recorded_at TEXT NOT NULL
  );
CREATE TABLE goal_event_types (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    type_id TEXT NOT NULL,
    type_version INTEGER NOT NULL,
    name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    semantic_family TEXT,
    source_json TEXT NOT NULL,
    fields_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_in_config_version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    PRIMARY KEY (board_id, goal_id, type_id, type_version)
  );
CREATE TABLE goal_event_work_status (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    work_status TEXT NOT NULL CHECK (work_status IN ('open', 'completed', 'cancelled')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (goal_id)
  );
CREATE TABLE goal_relations (
    relation_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    from_goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    to_goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    type TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('proposed', 'active', 'inactive')),
    reason TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deactivated_at TEXT
  );
INSERT INTO "goal_relations" VALUES('relation-46303826-25b2-4b8e-ad5e-b76617d90fc9','goalboard-v1-demo','PLATFORM','V1','part_of','active','共同组成第一次完整的 Molis Work 使用体验','demo-user','2026-09-10T07:03:28.510Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-d0cedc75-3cc4-4977-a253-247efa2b82fb','goalboard-v1-demo','WORKSPACE','V1','part_of','active','共同组成第一次完整的 Molis Work 使用体验','demo-user','2026-09-10T07:03:28.512Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-4814cf00-c15c-4d86-b625-15f7c60df9b7','goalboard-v1-demo','ADOPTION','V1','part_of','active','共同组成第一次完整的 Molis Work 使用体验','demo-user','2026-09-10T07:03:28.513Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-9410d190-8f63-466a-8797-14efb68c326d','goalboard-v1-demo','CORE','PLATFORM','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.514Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-e744e983-eef6-4ea8-ad99-96cd1b73b248','goalboard-v1-demo','INTERFACES','PLATFORM','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.515Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-8217b2ac-8515-4f15-82de-c772e6c97a23','goalboard-v1-demo','WEB','WORKSPACE','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.524Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-730b96da-261b-4736-9788-7f8f89edcf64','goalboard-v1-demo','GRAPH','WORKSPACE','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.525Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-f5af7868-c03c-4486-975b-01f92da14355','goalboard-v1-demo','DESKTOP','WORKSPACE','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.526Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-ecd7a888-4fdb-4ff5-8aeb-22b195aa8a45','goalboard-v1-demo','RELEASE','ADOPTION','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.527Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-e62c0749-b7fe-4bd9-9669-e0063c9b289d','goalboard-v1-demo','ONBOARDING','ADOPTION','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.527Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-fd86817a-3c4e-41b0-8311-a2c55b7daaed','goalboard-v1-demo','DOCS','ADOPTION','part_of','active','在 Mock 项目中形成可追溯的产品目标层级','demo-user','2026-09-10T07:03:28.528Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-3db70bd7-947c-44d4-b92f-7c794331177d','goalboard-v1-demo','INTERFACES','CORE','depends_on','active','共享项目进度前，必须先保证每项工作的状态和完成依据可靠','demo-user','2026-09-10T07:03:28.528Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-a2944b01-48f2-43a4-8215-bb3d5165fec8','goalboard-v1-demo','WEB','INTERFACES','depends_on','active','页面显示必须和不同 Runtime 看到的项目进度一致','demo-user','2026-09-10T07:03:28.529Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-6b87504f-8ad9-49a9-acc4-4d75f39eea1d','goalboard-v1-demo','GRAPH','INTERFACES','depends_on','active','关系图必须读取不同 Runtime 共享的同一份 Goal 关系事实','demo-user','2026-09-10T07:03:28.529Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-5e6401d7-b1dc-4a94-8c53-f04539921f6a','goalboard-v1-demo','DESKTOP','CORE','depends_on','active','桌面工作站必须先建立可靠的 Goal 状态与完成依据','demo-user','2026-09-10T07:03:28.530Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-341fe1f6-94a5-4b9d-96d8-1481878e7570','goalboard-v1-demo','ONBOARDING','RELEASE','depends_on','active','首次体验需要建立在可重复的安装与接入路径上','demo-user','2026-09-10T07:03:28.530Z',NULL);
INSERT INTO "goal_relations" VALUES('relation-26184b19-74b6-4509-a239-b2c3d9ef3b67','goalboard-v1-demo','DOCS','ONBOARDING','depends_on','active','README 的演示必须来自已经走通的首次体验','demo-user','2026-09-10T07:03:28.530Z',NULL);
CREATE TABLE goal_risks (
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    risk_id TEXT NOT NULL REFERENCES risks(risk_id) ON DELETE CASCADE,
    PRIMARY KEY (goal_id, risk_id)
  );
INSERT INTO "goal_risks" VALUES('RELEASE','RISK-FIRST-RESTART');
INSERT INTO "goal_risks" VALUES('OLD-RISK','legacy-completion-risk');
CREATE TABLE goal_trash_records (
    trash_record_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    trashed_at TEXT NOT NULL,
    trashed_by TEXT NOT NULL,
    trash_reason TEXT NOT NULL,
    restored_at TEXT,
    restored_by TEXT,
    restore_reason TEXT
  );
INSERT INTO "goal_trash_records" VALUES('trash-c5c4a4b4-7cc5-45b5-94a4-dcd93556680b','goalboard-v1-demo','AUTO-CONNECT','2026-09-10T07:03:28.538Z','demo-user','这会替用户猜项目；当前方案只展示历史候选，并再次询问用户',NULL,NULL,NULL);
CREATE TABLE goal_trash_relation_records (
    trash_record_id TEXT NOT NULL REFERENCES goal_trash_records(trash_record_id) ON DELETE CASCADE,
    relation_id TEXT NOT NULL REFERENCES goal_relations(relation_id) ON DELETE CASCADE,
    prior_state TEXT NOT NULL CHECK (prior_state = 'active'),
    deactivated_at TEXT NOT NULL,
    restored_at TEXT,
    PRIMARY KEY (trash_record_id, relation_id)
  );
CREATE TABLE goal_tree_proposal_decisions (
    decision_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    proposal_id TEXT NOT NULL REFERENCES goal_tree_proposals(proposal_id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES goal_tree_proposal_items(item_id) ON DELETE CASCADE,
    decision TEXT NOT NULL CHECK (decision IN ('confirmed', 'rejected', 'revised', 'conflict')),
    actor_id TEXT NOT NULL,
    authority_source TEXT NOT NULL CHECK (authority_source IN ('runtime_dialogue', 'web', 'management')),
    runtime_actor_id TEXT,
    conversation_ref TEXT NOT NULL,
    message_ref TEXT NOT NULL,
    reason TEXT NOT NULL,
    revision_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
    materialized_objects_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
CREATE TABLE goal_tree_proposal_items (
    item_id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL REFERENCES goal_tree_proposals(proposal_id) ON DELETE CASCADE,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('goal', 'contract', 'relation', 'dependency', 'risk', 'policy', 'candidate', 'rewire')),
    operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'deactivate')),
    payload_json TEXT NOT NULL,
    source_refs_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    explanation_json TEXT,
    confidence REAL NOT NULL,
    affected_objects_json TEXT NOT NULL,
    baseline_versions_json TEXT NOT NULL,
    requires_user_confirmation INTEGER NOT NULL DEFAULT 1,
    state TEXT NOT NULL CHECK (state IN ('pending', 'conflict', 'superseded', 'approved', 'applied', 'rejected', 'dismissed')),
    conflict_json TEXT,
    materialized_objects_json TEXT NOT NULL DEFAULT '[]',
    revision_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
    supersedes_item_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(proposal_id, ordinal)
  );
CREATE TABLE goal_tree_proposals (
    proposal_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    root_goal_id TEXT REFERENCES goals(goal_id) ON DELETE SET NULL,
    submitted_by TEXT NOT NULL,
    discovered_in_run_id TEXT REFERENCES runs(run_id) ON DELETE SET NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'superseded', 'approved', 'partially_applied', 'rejected', 'dismissed', 'closed')),
    version INTEGER NOT NULL,
    supersedes_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
    supersedes_legacy_proposal_id TEXT,
    base_event_cursor INTEGER NOT NULL,
    summary TEXT NOT NULL,
    narrative_json TEXT,
    decision_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    decided_at TEXT
  );
CREATE TABLE goal_work_event_judgments (
    event_id TEXT NOT NULL REFERENCES goal_work_events(event_id) ON DELETE CASCADE,
    requirement_id TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('supports', 'contradicts', 'unknown')),
    PRIMARY KEY (event_id, requirement_id)
  );
CREATE TABLE goal_work_events (
    event_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('configuration', 'report', 'system')),
    type_id TEXT,
    type_version INTEGER,
    title TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_kind TEXT,
    received_at TEXT NOT NULL,
    journal_seq INTEGER NOT NULL,
    config_version INTEGER
  );
CREATE TABLE goals (
    goal_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    outcome TEXT NOT NULL,
    why TEXT NOT NULL,
    business_logic TEXT NOT NULL,
    in_scope_json TEXT NOT NULL DEFAULT '[]',
    out_of_scope_json TEXT NOT NULL DEFAULT '[]',
    constraints_json TEXT NOT NULL DEFAULT '[]',
    required_inputs_json TEXT NOT NULL DEFAULT '[]',
    promised_outputs_json TEXT NOT NULL DEFAULT '[]',
    decomposition_review_json TEXT,
    definition_state TEXT NOT NULL CHECK (definition_state IN ('draft', 'accepted')),
    decomposition_state TEXT NOT NULL CHECK (decomposition_state IN ('abstract', 'frontier_open', 'closed_leaf', 'closed_compound')),
    validity_state TEXT NOT NULL CHECK (validity_state IN ('valid', 'needs_revalidation', 'invalidated')),
    fulfillment_state TEXT NOT NULL CHECK (fulfillment_state IN ('unmet', 'satisfied')),
    current_contract_revision INTEGER NOT NULL DEFAULT 1,
    trashed_at TEXT,
    trashed_by TEXT,
    archived_at TEXT,
    archived_by TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    accepted_by TEXT,
    accepted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
INSERT INTO "goals" VALUES('V1','goalboard-v1-demo','让第一次使用的人顺利完成一轮目标协作','用户能把一个模糊想法变成清楚的目标树，并知道下一步、阻塞和完成依据','AI 对话结束后容易丢失目标、决定和进度，新用户尤其难判断该从哪里继续','用户先在当前对话说明想做什么，Runtime 通过提问整理目标并请用户确认；确认后，当前或后续 Runtime 从可做项中选择工作，提交结果和证据，Molis Work 持续保存共同进度。','[]','[]','[]','[]','[]',NULL,'accepted','closed_compound','valid','unmet',1,NULL,NULL,NULL,NULL,100,'demo-user','2026-09-10T07:03:28.489Z','2026-09-10T07:03:28.489Z','2026-09-10T07:03:28.489Z');
INSERT INTO "goals" VALUES('PLATFORM','goalboard-v1-demo','让项目事实成为不同 Runtime 的共同底座','不同 AI、会话和工具读取同一份 Goal、关系、决定、进度与完成依据','长程任务最容易在切换对话和 Runtime 后失去共同上下文','Molis Work 保存项目事实；Runtime 只负责读取可做项、执行工作并提交结果，不在各自会话里维护另一套项目记忆。','[]','[]','[]','[]','[]',NULL,'accepted','closed_compound','valid','unmet',1,NULL,NULL,NULL,NULL,96,'demo-user','2026-09-10T07:03:28.490Z','2026-09-10T07:03:28.490Z','2026-09-10T07:03:28.490Z');
INSERT INTO "goals" VALUES('WORKSPACE','goalboard-v1-demo','让人能在同一工作台看清并推进 Goal','用户在一个窗口里查看 Goal Tree、Focus、Graph 和 Goal-bound Runtime','频繁切换页面、终端和 AI 对话会打断判断，也让 Goal 与执行 Session 脱节','桌面端把 Goal 导航、当前工作和 Runtime 组合成连续工作面；网页保留同一份项目事实与独立访问方式。','[]','[]','[]','[]','[]',NULL,'accepted','closed_compound','valid','unmet',1,NULL,NULL,NULL,NULL,94,'demo-user','2026-09-10T07:03:28.504Z','2026-09-10T07:03:28.504Z','2026-09-10T07:03:28.504Z');
INSERT INTO "goals" VALUES('ADOPTION','goalboard-v1-demo','让第一次接入从安装走到真实推进','新用户从 README、安装和首次打开一路走到推进第一条 Goal','只把程序装上不等于用户已经理解产品，更不等于完成第一次有效使用','公开文档先解释适用场景，再引导安装、连接 Runtime、选择项目并推进一条可执行 Goal。','[]','[]','[]','[]','[]',NULL,'accepted','closed_compound','valid','unmet',1,NULL,NULL,NULL,NULL,92,'demo-user','2026-09-10T07:03:28.505Z','2026-09-10T07:03:28.505Z','2026-09-10T07:03:28.505Z');
INSERT INTO "goals" VALUES('CORE','goalboard-v1-demo','让每项工作都有可信的完成依据','用户能看到一项工作何时开始、做出了什么，以及为什么可以算完成','只有进度标签而没有结果、证据和复核，用户仍然无法相信工作真的完成了','Runtime 选择一项已经准备好的工作并标记开始；完成后提交对应验收条件的证据，必要复核通过后，这项工作才会显示为已完成。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','satisfied',1,NULL,NULL,NULL,NULL,90,'demo-user','2026-09-10T07:03:28.505Z','2026-09-10T07:03:28.505Z','2026-09-10T07:03:28.550Z');
INSERT INTO "goals" VALUES('INTERFACES','goalboard-v1-demo','让不同 AI 对话看到同一项目进度','用户换一个 Runtime 或新开对话后，仍能找到同一个项目的目标、进度和未完成工作','如果每个入口各自记录状态，用户换一次对话就要重新解释整个项目','用户在当前对话明确选择项目后继续推进；其他 Runtime 也通过 Molis Work 读取和更新同一份项目事实，不会各自维护一套进度。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','unmet',1,NULL,NULL,NULL,NULL,80,'demo-user','2026-09-10T07:03:28.506Z','2026-09-10T07:03:28.506Z','2026-09-10T07:03:28.506Z');
INSERT INTO "goals" VALUES('WEB','goalboard-v1-demo','让用户打开页面就看懂目标和下一步','用户不用理解内部协议，也能看出项目要解决什么、当前进展、谁该做什么和为什么被阻塞','底层规则正确并不代表产品容易理解；信息组织混乱会让用户放弃继续使用','用户打开项目后先看到目标树和当前目标，再按结果、完成标准、推进情况、风险和历史阅读；搜索、状态筛选和待决定事项都放在统一导航中。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','unmet',1,NULL,NULL,NULL,NULL,70,'demo-user','2026-09-10T07:03:28.507Z','2026-09-10T07:03:28.507Z','2026-09-10T07:03:28.507Z');
INSERT INTO "goals" VALUES('GRAPH','goalboard-v1-demo','让复杂 Goal 关系仍然一眼可读','父子层级、前置依赖和当前焦点在复杂网络中仍有清楚的方向与落点','列表适合顺序浏览，但复杂 Goal 的多层结构和跨分支依赖会在列表里变得难以判断','用户在 List 与 Graph 之间切换；Graph 只读取真实父子和依赖关系，以节点、分区和有向连线呈现。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','unmet',1,NULL,NULL,NULL,NULL,76,'demo-user','2026-09-10T07:03:28.507Z','2026-09-10T07:03:28.507Z','2026-09-10T07:03:28.507Z');
INSERT INTO "goals" VALUES('DESKTOP','goalboard-v1-demo','把 Molis Work 作为不切窗口的主工作站','用户在桌面端同时看到 Goal、下一步、完成要求和强绑定的 Runtime','工作在 AI 对话里推进、状态在另一个页面查看，会增加切换成本并削弱人的掌控感','桌面端复用网页事实和 Runtime 能力，将全局控制放进 TitleBar，并为 List、Focus 与 Runtime 保留连续三栏。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','unmet',1,NULL,NULL,NULL,NULL,74,'demo-user','2026-09-10T07:03:28.507Z','2026-09-10T07:03:28.507Z','2026-09-10T07:03:28.507Z');
INSERT INTO "goals" VALUES('RELEASE','goalboard-v1-demo','让新用户安装后知道下一步怎么开始','用户完成安装后知道如何启动页面、连接正在使用的 Runtime，以及为什么需要新开会话','安装成功但不知道服务是否常驻、工具何时生效或下一步说什么，仍然会被理解成产品不可用','安装只放置 Molis Work 自己的程序，不偷偷修改项目或 Runtime；用户随后显式启用常驻服务、预览并确认 Runtime 接入，再在新会话中选择或创建项目开始使用。','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',1,NULL,NULL,NULL,NULL,60,NULL,NULL,'2026-09-10T07:03:28.508Z','2026-09-10T07:03:28.508Z');
INSERT INTO "goals" VALUES('ONBOARDING','goalboard-v1-demo','让用户第一次打开就完成有效操作','用户首次进入后能选择项目、找到可做 Goal，并理解 Runtime 为什么绑定到它','展示很多功能不等于用户知道第一步做什么，首屏需要直接引向一次有效推进','首次体验使用一份明确标记的 Mock 项目，沿着可做 Goal、下一步与 Runtime 归属完成一轮引导。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','unmet',1,NULL,NULL,NULL,NULL,58,'demo-user','2026-09-10T07:03:28.508Z','2026-09-10T07:03:28.508Z','2026-09-10T07:03:28.508Z');
INSERT INTO "goals" VALUES('DOCS','goalboard-v1-demo','让用户从 README 进入正确的使用方式','用户先理解长程任务为何会跑偏，再看到 Molis Work 的闭环、桌面端和 Runtime 伴随方式','功能清单无法建立需求感，也无法解释 Molis Work 与 Agent Orchestration 的边界','README 用痛点、核心思路和完整演示组织内容；截图来自 Mock 项目的真实网页与桌面页面。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','unmet',1,NULL,NULL,NULL,NULL,56,'demo-user','2026-09-10T07:03:28.509Z','2026-09-10T07:03:28.509Z','2026-09-10T07:03:28.509Z');
INSERT INTO "goals" VALUES('AUTO-CONNECT','goalboard-v1-demo','自动替用户选择最近使用的项目','新对话少做一次项目确认','早期方案希望用历史目录记录缩短首次连接步骤','新对话进入一个以前使用过的目录时，系统直接连接最近的项目，不再询问用户。这个方案可能选错项目，因此已经移入回收站，当前产品只展示候选并让用户决定。','[]','[]','[]','[]','[]',NULL,'accepted','closed_leaf','valid','unmet',1,'2026-09-10T07:03:28.538Z','demo-user',NULL,NULL,10,'demo-user','2026-09-10T07:03:28.509Z','2026-09-10T07:03:28.509Z','2026-09-10T07:03:28.538Z');
INSERT INTO "goals" VALUES('OLD-HUMAN','goalboard-v1-demo','历史迁移场景 OLD-HUMAN','用户亲自核对付款体验','保留已有明确约定','单向升级后要求和责任仍须可读可改','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',1,NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-09-10T07:03:28.560Z','2026-09-10T07:03:28.560Z');
INSERT INTO "goals" VALUES('OLD-POLICY','goalboard-v1-demo','历史迁移场景 OLD-POLICY','实际付款成功','保留已有明确约定','单向升级后要求和责任仍须可读可改','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',1,NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-09-10T07:03:28.560Z','2026-09-10T07:03:28.560Z');
INSERT INTO "goals" VALUES('OLD-RISK','goalboard-v1-demo','历史迁移场景 OLD-RISK','结果可以打开','保留已有明确约定','单向升级后要求和责任仍须可读可改','[]','[]','[]','[]','[]',NULL,'draft','abstract','valid','unmet',1,NULL,NULL,NULL,NULL,0,NULL,NULL,'2026-09-10T07:03:28.561Z','2026-09-10T07:03:28.561Z');
CREATE TABLE idempotency_records (
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          actor_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          outcome_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (board_id, actor_id, operation, idempotency_key)
        );
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','initialize_board','demo-board','0f9326d5c36b2448d19263ed58dc07612f8eb0a6903ac5f91b7386e2b40c8c34','{"board_id":"goalboard-v1-demo","observed_event_cursor":1}','2026-09-10T07:03:28.489Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','create_goal','demo-goal-V1','a0bb38352821d1b1fa91ecff5cbb95ce437cc85752892224d5aaf612bf47c24b','{"goal":{"goal_id":"V1","board_id":"goalboard-v1-demo","title":"让第一次使用的人顺利完成一轮目标协作","outcome":"用户能把一个模糊想法变成清楚的目标树，并知道下一步、阻塞和完成依据","why":"AI 对话结束后容易丢失目标、决定和进度，新用户尤其难判断该从哪里继续","business_logic":"用户先在当前对话说明想做什么，Runtime 通过提问整理目标并请用户确认；确认后，当前或后续 Runtime 从可做项中选择工作，提交结果和证据，Molis Work 持续保存共同进度。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"accepted","decomposition_state":"closed_compound","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":100,"accepted_by":"demo-user","accepted_at":"2026-09-10T07:03:28.489Z","created_at":"2026-09-10T07:03:28.489Z","updated_at":"2026-09-10T07:03:28.489Z","acceptance_criteria":[{"criterion_id":"V1-C1","goal_id":"V1","statement":"第一次使用的人能从首屏看懂目标、下一步和阻塞","decision_method":"inspection","pass_condition":"首次使用者无需阅读协议即可正确复述","target":null,"required_evidence":[]}]},"observed_event_cursor":2}','2026-09-10T07:03:28.489Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','create_goal','demo-goal-PLATFORM','48ce880193cb3fcb31caf6ed5e66a5b01f55fc05c360955620585e6904bd38dd','{"goal":{"goal_id":"PLATFORM","board_id":"goalboard-v1-demo","title":"让项目事实成为不同 Runtime 的共同底座","outcome":"不同 AI、会话和工具读取同一份 Goal、关系、决定、进度与完成依据","why":"长程任务最容易在切换对话和 Runtime 后失去共同上下文","business_logic":"Molis Work 保存项目事实；Runtime 只负责读取可做项、执行工作并提交结果，不在各自会话里维护另一套项目记忆。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"accepted","decomposition_state":"closed_compound","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":96,"accepted_by":"demo-user","accepted_at":"2026-09-10T07:03:28.490Z","created_at":"2026-09-10T07:03:28.490Z","updated_at":"2026-09-10T07:03:28.490Z","acceptance_criteria":[{"criterion_id":"PLATFORM-C1","goal_id":"PLATFORM","statement":"不同 Runtime 读取到一致的 Goal 状态与完成依据","decision_method":"automated_check","pass_condition":"跨入口一致性测试通过","target":null,"required_evidence":[]}]},"observed_event_cursor":3}','2026-09-10T07:03:28.490Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','create_goal','demo-goal-WORKSPACE','80a169db8d936d8fb455b533c462e030beffed7062c6459da48f27d143c0b4f9','{"goal":{"goal_id":"WORKSPACE","board_id":"goalboard-v1-demo","title":"让人能在同一工作台看清并推进 Goal","outcome":"用户在一个窗口里查看 Goal Tree、Focus、Graph 和 Goal-bound Runtime","why":"频繁切换页面、终端和 AI 对话会打断判断，也让 Goal 与执行 Session 脱节","business_logic":"桌面端把 Goal 导航、当前工作和 Runtime 组合成连续工作面；网页保留同一份项目事实与独立访问方式。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"accepted","decomposition_state":"closed_compound","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":94,"accepted_by":"demo-user","accepted_at":"2026-09-10T07:03:28.504Z","created_at":"2026-09-10T07:03:28.504Z","updated_at":"2026-09-10T07:03:28.504Z","acceptance_criteria":[{"criterion_id":"WORKSPACE-C1","goal_id":"WORKSPACE","statement":"用户不切窗口即可从 Goal 进入对应 Runtime","decision_method":"inspection","pass_condition":"桌面主工作流可完成并保持 Goal 绑定","target":null,"required_evidence":[]}]},"observed_event_cursor":4}','2026-09-10T07:03:28.504Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','create_goal','demo-goal-ADOPTION','d937c8e4017389290f49b4dec349461dc2fa67851e3f60f87f1593e9f7ba2fcc','{"goal":{"goal_id":"ADOPTION","board_id":"goalboard-v1-demo","title":"让第一次接入从安装走到真实推进","outcome":"新用户从 README、安装和首次打开一路走到推进第一条 Goal","why":"只把程序装上不等于用户已经理解产品，更不等于完成第一次有效使用","business_logic":"公开文档先解释适用场景，再引导安装、连接 Runtime、选择项目并推进一条可执行 Goal。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"accepted","decomposition_state":"closed_compound","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":92,"accepted_by":"demo-user","accepted_at":"2026-09-10T07:03:28.505Z","created_at":"2026-09-10T07:03:28.505Z","updated_at":"2026-09-10T07:03:28.505Z","acceptance_criteria":[{"criterion_id":"ADOPTION-C1","goal_id":"ADOPTION","statement":"首次用户能独立完成一次从安装到推进的闭环","decision_method":"inspection","pass_condition":"首次使用走查无阻断步骤","target":null,"required_evidence":[]}]},"observed_event_cursor":5}','2026-09-10T07:03:28.505Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','create_goal','demo-goal-CORE','ed4249d74fb51e0911bd6ac0e9c304cb44b884b7072d798ca5546829c31ba835','{"goal":{"goal_id":"CORE","board_id":"goalboard-v1-demo","title":"让每项工作都有可信的完成依据","outcome":"用户能看到一项工作何时开始、做出了什么，以及为什么可以算完成","why":"只有进度标签而没有结果、证据和复核，用户仍然无法相信工作真的完成了","business_logic":"Runtime 选择一项已经准备好的工作并标记开始；完成后提交对应验收条件的证据，必要复核通过后，这项工作才会显示为已完成。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"accepted","decomposition_state":"closed_leaf","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":90,"accepted_by":"demo-user","accepted_at":"2026-09-10T07:03:28.505Z","created_at":"2026-09-10T07:03:28.505Z","updated_at":"2026-09-10T07:03:28.505Z","acceptance_criteria":[{"criterion_id":"CORE-C1","goal_id":"CORE","statement":"工作从开始到证据和复核形成完整记录","decision_method":"automated_check","pass_condition":"生命周期自动化测试通过","target":null,"required_evidence":[]}]},"observed_event_cursor":6}','2026-09-10T07:03:28.505Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','create_goal','demo-goal-INTERFACES','b8ae15d26fbb48f67627602eea80afe1d9a6ef22cc47a2b7d63e2ef6eb1bf962','{"goal":{"goal_id":"INTERFACES","board_id":"goalboard-v1-demo","title":"让不同 AI 对话看到同一项目进度","outcome":"用户换一个 Runtime 或新开对话后，仍能找到同一个项目的目标、进度和未完成工作","why":"如果每个入口各自记录状态，用户换一次对话就要重新解释整个项目","business_logic":"用户在当前对话明确选择项目后继续推进；其他 Runtime 也通过 Molis Work 读取和更新同一份项目事实，不会各自维护一套进度。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"accepted","decomposition_state":"closed_leaf","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":80,"accepted_by":"demo-user","accepted_at":"2026-09-10T07:03:28.506Z","created_at":"2026-09-10T07:03:28.506Z","updated_at":"2026-09-10T07:03:28.506Z","acceptance_criteria":[{"criterion_id":"INTERFACES-C1","goal_id":"INTERFACES","statement":"不同入口读取到一致的可做工作和占用状态","decision_method":"automated_check","pass_condition":"跨入口自动化测试通过","target":null,"required_evidence":[]}]},"observed_event_cursor":7}','2026-09-10T07:03:28.506Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','create_goal','demo-goal-WEB','bb7e74f9a34485a657bdef628414c9956e8ab8fc3fd7417f72545fac84a4e170','{"goal":{"goal_id":"WEB","board_id":"goalboard-v1-demo","title":"让用户打开页面就看懂目标和下一步","outcome":"用户不用理解内部协议，也能看出项目要解决什么、当前进展、谁该做什么和为什么被阻塞","why":"底层规则正确并不代表产品容易理解；信息组织混乱会让用户放弃继续使用","business_logic":"用户打开项目后先看到目标树和当前目标，再按结果、完成标准、推进情况、风险和历史阅读；搜索、状态筛选和待决定事项都放在统一导航中。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"accepted","decomposition_state":"closed_leaf","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":70,"accepted_by":"demo-user","accepted_at":"2026-09-10T07:03:28.507Z","created_at":"2026-09-10T07:03:28.507Z","updated_at":"2026-09-10T07:03:28.507Z","acceptance_criteria":[{"criterion_id":"WEB-C1","goal_id":"WEB","statement":"桌面和移动端关键信息清楚可用","decision_method":"inspection","pass_condition":"视觉、响应式和可访问性 QA 通过","target":null,"required_evidence":[]}]},"observed_event_cursor":8}','2026-09-10T07:03:28.507Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','create_goal','demo-goal-GRAPH','c949195d66269d6f4c4dc7417fe971436dc1ab0355e8e009ae2864d5af6c09f9','{"goal":{"goal_id":"GRAPH","board_id":"goalboard-v1-demo","title":"让复杂 Goal 关系仍然一眼可读","outcome":"父子层级、前置依赖和当前焦点在复杂网络中仍有清楚的方向与落点","why":"列表适合顺序浏览，但复杂 Goal 的多层结构和跨分支依赖会在列表里变得难以判断","business_logic":"用户在 List 与 Graph 之间切换；Graph 只读取真实父子和依赖关系，以节点、分区和有向连线呈现。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"accepted","decomposition_state":"closed_leaf","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":76,"accepted_by":"demo-user","accepted_at":"2026-09-10T07:03:28.507Z","created_at":"2026-09-10T07:03:28.507Z","updated_at":"2026-09-10T07:03:28.507Z","acceptance_criteria":[{"criterion_id":"GRAPH-C1","goal_id":"GRAPH","statement":"复杂网络中的关系方向和阻塞节点可以直接辨认","decision_method":"inspection","pass_condition":"12 Goal 演示网络在桌面宽度下可读","target":null,"required_evidence":[]}]},"observed_event_cursor":9}','2026-09-10T07:03:28.507Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','create_goal','demo-goal-DESKTOP','124526309d7218f1a677348d2da14b0f924631d4161fe28189dbbd69fa226c33','{"goal":{"goal_id":"DESKTOP","board_id":"goalboard-v1-demo","title":"把 Molis Work 作为不切窗口的主工作站","outcome":"用户在桌面端同时看到 Goal、下一步、完成要求和强绑定的 Runtime","why":"工作在 AI 对话里推进、状态在另一个页面查看，会增加切换成本并削弱人的掌控感","business_logic":"桌面端复用网页事实和 Runtime 能力，将全局控制放进 TitleBar，并为 List、Focus 与 Runtime 保留连续三栏。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"accepted","decomposition_state":"closed_leaf","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":74,"accepted_by":"demo-user","accepted_at":"2026-09-10T07:03:28.507Z","created_at":"2026-09-10T07:03:28.507Z","updated_at":"2026-09-10T07:03:28.507Z","acceptance_criteria":[{"criterion_id":"DESKTOP-C1","goal_id":"DESKTOP","statement":"桌面端三栏在宽屏下形成完整工作闭环","decision_method":"inspection","pass_condition":"Goal 选择、Focus 与 Runtime 归属保持同步","target":null,"required_evidence":[]}]},"observed_event_cursor":10}','2026-09-10T07:03:28.507Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','create_goal','demo-goal-RELEASE','c834c41e2574e6b356da1f1d811a92ade6e0a568b1ab13b6581c475c52c0aec3','{"goal":{"goal_id":"RELEASE","board_id":"goalboard-v1-demo","title":"让新用户安装后知道下一步怎么开始","outcome":"用户完成安装后知道如何启动页面、连接正在使用的 Runtime，以及为什么需要新开会话","why":"安装成功但不知道服务是否常驻、工具何时生效或下一步说什么，仍然会被理解成产品不可用","business_logic":"安装只放置 Molis Work 自己的程序，不偷偷修改项目或 Runtime；用户随后显式启用常驻服务、预览并确认 Runtime 接入，再在新会话中选择或创建项目开始使用。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":60,"accepted_by":null,"accepted_at":null,"created_at":"2026-09-10T07:03:28.508Z","updated_at":"2026-09-10T07:03:28.508Z","acceptance_criteria":[{"criterion_id":"RELEASE-C1","goal_id":"RELEASE","statement":"安装、接入和重启提示可以按公开步骤重复完成","decision_method":"automated_check","pass_condition":"全新安装端到端验证通过","target":null,"required_evidence":[]}]},"observed_event_cursor":11}','2026-09-10T07:03:28.508Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','create_goal','demo-goal-ONBOARDING','790d04ead1fe8541a20e04cb86abf1886f62793054d8b8200b8aa4d5588062b0','{"goal":{"goal_id":"ONBOARDING","board_id":"goalboard-v1-demo","title":"让用户第一次打开就完成有效操作","outcome":"用户首次进入后能选择项目、找到可做 Goal，并理解 Runtime 为什么绑定到它","why":"展示很多功能不等于用户知道第一步做什么，首屏需要直接引向一次有效推进","business_logic":"首次体验使用一份明确标记的 Mock 项目，沿着可做 Goal、下一步与 Runtime 归属完成一轮引导。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"accepted","decomposition_state":"closed_leaf","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":58,"accepted_by":"demo-user","accepted_at":"2026-09-10T07:03:28.508Z","created_at":"2026-09-10T07:03:28.508Z","updated_at":"2026-09-10T07:03:28.508Z","acceptance_criteria":[{"criterion_id":"ONBOARDING-C1","goal_id":"ONBOARDING","statement":"首次用户无需外部讲解即可推进第一条 Goal","decision_method":"inspection","pass_condition":"首次体验测试完成一条可执行 Goal","target":null,"required_evidence":[]}]},"observed_event_cursor":12}','2026-09-10T07:03:28.508Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','create_goal','demo-goal-DOCS','7ee50179d4a5b42baf596d6e766d314cd28200b787862ec7ae0f1adb22296406','{"goal":{"goal_id":"DOCS","board_id":"goalboard-v1-demo","title":"让用户从 README 进入正确的使用方式","outcome":"用户先理解长程任务为何会跑偏，再看到 Molis Work 的闭环、桌面端和 Runtime 伴随方式","why":"功能清单无法建立需求感，也无法解释 Molis Work 与 Agent Orchestration 的边界","business_logic":"README 用痛点、核心思路和完整演示组织内容；截图来自 Mock 项目的真实网页与桌面页面。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"accepted","decomposition_state":"closed_leaf","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":56,"accepted_by":"demo-user","accepted_at":"2026-09-10T07:03:28.509Z","created_at":"2026-09-10T07:03:28.509Z","updated_at":"2026-09-10T07:03:28.509Z","acceptance_criteria":[{"criterion_id":"DOCS-C1","goal_id":"DOCS","statement":"README 清楚表达痛点、边界、闭环与多种使用方式","decision_method":"inspection","pass_condition":"目标用户能准确复述产品独特机制","target":null,"required_evidence":[]}]},"observed_event_cursor":13}','2026-09-10T07:03:28.509Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','create_goal','demo-goal-AUTO-CONNECT','8321ff08c44ea6adb0800d17a262b62035d65b5c5e84b56718e37f1f622971e6','{"goal":{"goal_id":"AUTO-CONNECT","board_id":"goalboard-v1-demo","title":"自动替用户选择最近使用的项目","outcome":"新对话少做一次项目确认","why":"早期方案希望用历史目录记录缩短首次连接步骤","business_logic":"新对话进入一个以前使用过的目录时，系统直接连接最近的项目，不再询问用户。这个方案可能选错项目，因此已经移入回收站，当前产品只展示候选并让用户决定。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"accepted","decomposition_state":"closed_leaf","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":10,"accepted_by":"demo-user","accepted_at":"2026-09-10T07:03:28.509Z","created_at":"2026-09-10T07:03:28.509Z","updated_at":"2026-09-10T07:03:28.509Z","acceptance_criteria":[{"criterion_id":"AUTO-CONNECT-C1","goal_id":"AUTO-CONNECT","statement":"新对话无需确认就进入历史项目","decision_method":"inspection","pass_condition":"进入历史目录后直接显示最近项目","target":null,"required_evidence":[]}]},"observed_event_cursor":14}','2026-09-10T07:03:28.509Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-part-PLATFORM','6482c3a8d0633f75f1cda11eeefc3dd7ca543d0d43f9eca0eb3a38ba4a3b3eba','{"relation_id":"relation-46303826-25b2-4b8e-ad5e-b76617d90fc9","observed_event_cursor":15}','2026-09-10T07:03:28.510Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-part-WORKSPACE','c82e6659f90d83cf44078a6802429aab882e5248f7fb69d6deaae3603242a0cd','{"relation_id":"relation-d0cedc75-3cc4-4977-a253-247efa2b82fb","observed_event_cursor":16}','2026-09-10T07:03:28.512Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-part-ADOPTION','8c4c953cbbc131dd0107694b8bc264106228d57464282ad08412d37cae240fbc','{"relation_id":"relation-4814cf00-c15c-4d86-b625-15f7c60df9b7","observed_event_cursor":17}','2026-09-10T07:03:28.513Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-part-CORE','0d6f6c328d7f3070e0cc0641e9927279a8cd34565edc3ff5f0d0368ca54299f3','{"relation_id":"relation-9410d190-8f63-466a-8797-14efb68c326d","observed_event_cursor":18}','2026-09-10T07:03:28.514Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-part-INTERFACES','77f9377cf3bd2c7fe3c310ae04baa77d2a69d91e7378288bbb5d29cb67ad5de8','{"relation_id":"relation-e744e983-eef6-4ea8-ad99-96cd1b73b248","observed_event_cursor":19}','2026-09-10T07:03:28.515Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-part-WEB','1e3ff6a45cb626f0025e9d77216a8e89a046d9316f91aba036ab8c1d3317f13a','{"relation_id":"relation-8217b2ac-8515-4f15-82de-c772e6c97a23","observed_event_cursor":20}','2026-09-10T07:03:28.524Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-part-GRAPH','26812e7c892d637e16c8f6408364118c594f48da3efb1f8e3d471d633eb7c74f','{"relation_id":"relation-730b96da-261b-4736-9788-7f8f89edcf64","observed_event_cursor":21}','2026-09-10T07:03:28.525Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-part-DESKTOP','44ec270574fa0799cbb675c9fa729f770bd45ebf9cca33d639266580b66a370a','{"relation_id":"relation-f5af7868-c03c-4486-975b-01f92da14355","observed_event_cursor":22}','2026-09-10T07:03:28.526Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-part-RELEASE','a1042b41785a71853c0b2adc1994d358331d682ccb75ac09024fbaeab05920f2','{"relation_id":"relation-ecd7a888-4fdb-4ff5-8aeb-22b195aa8a45","observed_event_cursor":23}','2026-09-10T07:03:28.527Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-part-ONBOARDING','21fa6f6da09772a17e97aff9ec22ec5685353373dec53a92ed3f47defbbbb06f','{"relation_id":"relation-e62c0749-b7fe-4bd9-9669-e0063c9b289d","observed_event_cursor":24}','2026-09-10T07:03:28.527Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-part-DOCS','edebf6641ea067e7c1ffac4e7e424127a0e85c0efd82920b6b4b595c2d131424','{"relation_id":"relation-fd86817a-3c4e-41b0-8311-a2c55b7daaed","observed_event_cursor":25}','2026-09-10T07:03:28.528Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-dependency-interfaces','4212417003556279a15467e2beb05fedf495746c75c696da34f07de90e651303','{"relation_id":"relation-3db70bd7-947c-44d4-b92f-7c794331177d","observed_event_cursor":26}','2026-09-10T07:03:28.528Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-dependency-web','215aa0fb7f5fb5fe4cae3afdbfd6b063ea4fc7cf9cd1edf2732bf6c64be46509','{"relation_id":"relation-a2944b01-48f2-43a4-8215-bb3d5165fec8","observed_event_cursor":27}','2026-09-10T07:03:28.529Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-dependency-graph','a54fcefe992827478644cf65d7b0f4e12bcf8aee3d3c75e284138aa3c39f8300','{"relation_id":"relation-6b87504f-8ad9-49a9-acc4-4d75f39eea1d","observed_event_cursor":28}','2026-09-10T07:03:28.529Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-dependency-desktop','c9c2312048bd48ea14ed96929703343234592cad72dfcab1890e57a28e8c5442','{"relation_id":"relation-5e6401d7-b1dc-4a94-8c53-f04539921f6a","observed_event_cursor":29}','2026-09-10T07:03:28.530Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-dependency-onboarding','3e8414f6e7fd92b35a9c7937511a5a8c469503218711a28db6b4d551007502cf','{"relation_id":"relation-341fe1f6-94a5-4b9d-96d8-1481878e7570","observed_event_cursor":30}','2026-09-10T07:03:28.530Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_relation','demo-dependency-docs','7130416bf9475ebe006b6a08de7bf332cbb74fabfb4fffa75a49771f38bc5b70','{"relation_id":"relation-26184b19-74b6-4509-a239-b2c3d9ef3b67","observed_event_cursor":31}','2026-09-10T07:03:28.530Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','add_risk','demo-risk-first-restart','a5c777c15939f4df3d9150c8d8a736c4b9dc25aaaca03a59196ed1ecece1ca62','{"risk":{"risk_id":"RISK-FIRST-RESTART","board_id":"goalboard-v1-demo","description":"用户接入 Runtime 后没有新开会话，误以为安装失败","probability":"medium","impact":"用户看不到 Molis Work 工具，无法开始第一次使用","affected_surfaces":["首次安装","Runtime 接入"],"trigger":"用户继续使用接入前已经打开的会话","treatment":"mitigate","treatment_plan":"","blocking_mode":"none","revisit_condition":"安装结果和接入预览都清楚说明新开会话的原因和下一步","owner":"产品体验","state":"open","resolution_basis":null,"created_at":"2026-09-10T07:03:28.532Z","updated_at":"2026-09-10T07:03:28.532Z"},"transitions":[{"goal_id":"RELEASE","previous_action_token":"015c71bbe8e02f95e8983236eca05686","projection":{"goal_id":"RELEASE","contract_revision":1,"progress":"not_started","primary_action":{"action_id":"action-a8122f09c3549b87ffe37f55","actor":"runtime","kind":"clarify","status":"ready","target_type":"goal","target_id":"RELEASE","reasons":[]},"actions":[{"action_id":"action-a8122f09c3549b87ffe37f55","actor":"runtime","kind":"clarify","status":"ready","target_type":"goal","target_id":"RELEASE","reasons":[]}],"action_token":"015c71bbe8e02f95e8983236eca05686","display_status":"continue"},"affected_goals":[{"goal_id":"RELEASE","contract_revision":1,"progress":"not_started","primary_action":{"action_id":"action-a8122f09c3549b87ffe37f55","actor":"runtime","kind":"clarify","status":"ready","target_type":"goal","target_id":"RELEASE","reasons":[]},"action_token":"015c71bbe8e02f95e8983236eca05686","display_status":"continue"}],"summary":"已记录风险，不新增用户待办","observed_event_cursor":32}],"observed_event_cursor":32}','2026-09-10T07:03:28.532Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','demo-user','set_goal_trashed','demo-trash-auto-connect','0c77c6b2818b322b84eab2d288f231ac0c8a12d5b5b3663267ee8ba8909b2087','{"status":"trashed","goal":{"goal_id":"AUTO-CONNECT","board_id":"goalboard-v1-demo","title":"自动替用户选择最近使用的项目","outcome":"新对话少做一次项目确认","why":"早期方案希望用历史目录记录缩短首次连接步骤","business_logic":"新对话进入一个以前使用过的目录时，系统直接连接最近的项目，不再询问用户。这个方案可能选错项目，因此已经移入回收站，当前产品只展示候选并让用户决定。","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"accepted","decomposition_state":"closed_leaf","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":"2026-09-10T07:03:28.538Z","trashed_by":"demo-user","archived_at":null,"archived_by":null,"priority":10,"accepted_by":"demo-user","accepted_at":"2026-09-10T07:03:28.509Z","created_at":"2026-09-10T07:03:28.509Z","updated_at":"2026-09-10T07:03:28.538Z","acceptance_criteria":[{"criterion_id":"AUTO-CONNECT-C1","goal_id":"AUTO-CONNECT","statement":"新对话无需确认就进入历史项目","decision_method":"inspection","pass_condition":"进入历史目录后直接显示最近项目","target":null,"required_evidence":[]}]},"active_goal_cleared":false,"deactivated_relation_ids":[],"restored_relation_ids":[],"pending_relation_ids":[],"blocking_claim_ids":[],"blocking_run_ids":[],"observed_event_cursor":33}','2026-09-10T07:03:28.538Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','runtime-core','claim_goal','demo-core-claim','f3f50cb4ff6f2131a98ef644fb4ecc7d3e970e6b38b2865275e8d82c78fb8122','{"allowed":true,"observed_event_cursor":33,"reasons":[],"claim":{"claim_id":"claim-dc5985a4-4a90-4aaa-880a-28f896f96e14","board_id":"goalboard-v1-demo","goal_id":"CORE","actor_id":"runtime-core","role":"executor","contract_revision":1,"action_kind":"execute","action_target_id":"CORE","state":"active","capabilities":[],"goal_mode_attestation":false,"resolved_policy":{"goal_mode":"preferred","required_capabilities":[],"self_verification":true,"cross_reviewers":0,"adversarial_reviewers":0,"human_approval":false,"max_lease_seconds":1800},"claimed_at":"2026-09-10T07:03:28.540Z","expires_at":"2026-09-10T07:33:28.540Z","renewed_at":null,"released_at":null,"release_reason":null},"replayed":false}','2026-09-10T07:03:28.539Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','runtime-core','start_run','demo-core-run','516fe370819c54c411c7adb73b7160988dad03999d738f2297741bd203d775cf','{"run":{"run_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","board_id":"goalboard-v1-demo","goal_id":"CORE","claim_id":"claim-dc5985a4-4a90-4aaa-880a-28f896f96e14","actor_id":"runtime-core","role":"executor","state":"started","block_reason":null,"output_refs":[],"discovery_refs":[],"started_at":"2026-09-10T07:03:28.541Z","ended_at":null},"observed_event_cursor":35}','2026-09-10T07:03:28.541Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','runtime-core','report_run','demo-core-run-complete','8e32de79bb818f1cf49734120236be23e1c4335f5246e6867de9411db905890a','{"run":{"run_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","board_id":"goalboard-v1-demo","goal_id":"CORE","claim_id":"claim-dc5985a4-4a90-4aaa-880a-28f896f96e14","actor_id":"runtime-core","role":"executor","state":"completed","block_reason":null,"output_refs":["tests/v1.test.ts"],"discovery_refs":[],"started_at":"2026-09-10T07:03:28.541Z","ended_at":"2026-09-10T07:03:28.543Z"},"observed_event_cursor":36,"transition":{"goal_id":"CORE","previous_action_token":"6bb6bf58c8d6e46dead0b1444437cd55","projection":{"goal_id":"CORE","contract_revision":1,"progress":"work_recorded","primary_action":{"action_id":"action-77c1abae7519eaaebb327691","actor":"runtime","kind":"submit_evidence","status":"active","target_type":"run","target_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","reasons":[{"code":"action.evidence_incomplete","severity":"warning","subject_type":"run","subject_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","message":"执行已经完成，还需要补齐完成依据","remediation":"提交当前 Contract revision 所需的最后一条 Evidence 后会自动释放工作。"}]},"actions":[{"action_id":"action-77c1abae7519eaaebb327691","actor":"runtime","kind":"submit_evidence","status":"active","target_type":"run","target_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","reasons":[{"code":"action.evidence_incomplete","severity":"warning","subject_type":"run","subject_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","message":"执行已经完成，还需要补齐完成依据","remediation":"提交当前 Contract revision 所需的最后一条 Evidence 后会自动释放工作。"}]}],"action_token":"2e51258038925f4e17921c9b7541f5c9","display_status":"in_progress"},"affected_goals":[{"goal_id":"CORE","contract_revision":1,"progress":"work_recorded","primary_action":{"action_id":"action-77c1abae7519eaaebb327691","actor":"runtime","kind":"submit_evidence","status":"active","target_type":"run","target_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","reasons":[{"code":"action.evidence_incomplete","severity":"warning","subject_type":"run","subject_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","message":"执行已经完成，还需要补齐完成依据","remediation":"提交当前 Contract revision 所需的最后一条 Evidence 后会自动释放工作。"}]},"action_token":"2e51258038925f4e17921c9b7541f5c9","display_status":"in_progress"}],"summary":"已记录本阶段产物","observed_event_cursor":36}}','2026-09-10T07:03:28.542Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','runtime-core','submit_evidence','demo-core-evidence','9f1efd1614152da15ae8d38183471667ebde917406f48b21bc6084cf4100d86f','{"evidence":{"evidence_id":"evidence-3aaba898-2eb4-4565-acbb-13cccced105f","board_id":"goalboard-v1-demo","goal_id":"CORE","contract_revision":1,"criterion_ids":["CORE-C1"],"producer_actor_id":"runtime-core","run_id":"run-45ec1136-7bbf-4740-9e6b-1689e672c7af","review_id":null,"kind":"test","locator":"command://pnpm-test","locator_status":"unverified","locator_validation_reason":"不透明或外部 locator 已保留为 UNVERIFIED；Molis Work 不会调用自定义协议","locator_checked_at":"2026-09-10T07:03:28.545Z","locator_workspace_id":null,"digest":null,"captured_at":"2026-09-10T07:03:28.545Z","result":"passed","lifecycle_state":"effective","correction":null,"historical_unmapped":false},"observed_event_cursor":38,"transition":{"goal_id":"CORE","previous_action_token":"2e51258038925f4e17921c9b7541f5c9","projection":{"goal_id":"CORE","contract_revision":1,"progress":"work_recorded","primary_action":{"action_id":"action-8b0b3c4001bbd07472c0f31a","actor":"runtime","kind":"review","status":"ready","target_type":"review_obligation","target_id":"obligation-64b45adb-d01f-4ee5-a9d7-fba2f7dcb9a6","reasons":[]},"actions":[{"action_id":"action-8b0b3c4001bbd07472c0f31a","actor":"runtime","kind":"review","status":"ready","target_type":"review_obligation","target_id":"obligation-64b45adb-d01f-4ee5-a9d7-fba2f7dcb9a6","reasons":[]}],"action_token":"bc49b6de772fa1099fcf9789ccfe42ae","display_status":"continue"},"affected_goals":[{"goal_id":"CORE","contract_revision":1,"progress":"work_recorded","primary_action":{"action_id":"action-8b0b3c4001bbd07472c0f31a","actor":"runtime","kind":"review","status":"ready","target_type":"review_obligation","target_id":"obligation-64b45adb-d01f-4ee5-a9d7-fba2f7dcb9a6","reasons":[]},"action_token":"bc49b6de772fa1099fcf9789ccfe42ae","display_status":"continue"}],"summary":"已记录完成依据","observed_event_cursor":38}}','2026-09-10T07:03:28.545Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','runtime-core','submit_review','demo-core-review','c190c83074aaf56e00148d4ac063185a35144ffe0a09b98d4acf915cdc69ec39','{"review":{"review_id":"review-3c52c9fe-13b8-41ce-92d2-725de601ae6f","board_id":"goalboard-v1-demo","goal_id":"CORE","obligation_id":"obligation-64b45adb-d01f-4ee5-a9d7-fba2f7dcb9a6","claim_id":null,"actor_id":"runtime-core","verdict":"pass","evidence_refs":["evidence-3aaba898-2eb4-4565-acbb-13cccced105f"],"reasoning":"生命周期测试通过","submitted_at":"2026-09-10T07:03:28.550Z"},"observed_event_cursor":40,"transition":{"goal_id":"CORE","previous_action_token":"bc49b6de772fa1099fcf9789ccfe42ae","projection":{"goal_id":"CORE","contract_revision":1,"progress":"verified","primary_action":null,"actions":[],"action_token":"e860ebc1537180e7b4660f8d71ccf5af","display_status":"completed"},"affected_goals":[{"goal_id":"CORE","contract_revision":1,"progress":"verified","primary_action":null,"action_token":"e860ebc1537180e7b4660f8d71ccf5af","display_status":"completed"}],"summary":"已记录复核结果","observed_event_cursor":40}}','2026-09-10T07:03:28.550Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','runtime-core','evaluate_leaf_completion','demo-core-complete','411b89fc57c66098a0d9a68d7e3c492c9933e671c0480e30cfe1a84e15237d03','{"satisfied":true,"reasons":[],"observed_event_cursor":40}','2026-09-10T07:03:28.553Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','runtime-interface','claim_goal','demo-interface-claim','6ffbf790d78c5f1a15ce473d4f7d6739b8b1ba547e70941c19dca0ff3be6d630','{"allowed":true,"observed_event_cursor":40,"reasons":[],"claim":{"claim_id":"claim-c44fe62b-c4bf-4b0e-9d14-3f302a74c45b","board_id":"goalboard-v1-demo","goal_id":"INTERFACES","actor_id":"runtime-interface","role":"executor","contract_revision":1,"action_kind":"execute","action_target_id":"INTERFACES","state":"active","capabilities":[],"goal_mode_attestation":false,"resolved_policy":{"goal_mode":"preferred","required_capabilities":[],"self_verification":true,"cross_reviewers":0,"adversarial_reviewers":0,"human_approval":false,"max_lease_seconds":1800},"claimed_at":"2026-09-10T07:03:28.554Z","expires_at":"2026-09-10T07:33:28.554Z","renewed_at":null,"released_at":null,"release_reason":null},"replayed":false}','2026-09-10T07:03:28.553Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','runtime-interface','start_run','demo-interface-run','ee73190f49d01e0b20782352a8aa00df648f62904407861918e968d588e6ff43','{"run":{"run_id":"run-65ec112f-54fe-499a-a41d-b5fc73d14f85","board_id":"goalboard-v1-demo","goal_id":"INTERFACES","claim_id":"claim-c44fe62b-c4bf-4b0e-9d14-3f302a74c45b","actor_id":"runtime-interface","role":"executor","state":"started","block_reason":null,"output_refs":[],"discovery_refs":[],"started_at":"2026-09-10T07:03:28.554Z","ended_at":null},"observed_event_cursor":42}','2026-09-10T07:03:28.554Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','runtime-interface','submit_candidate','demo-candidate','015b8f6ae3d66514b6d8178ff3e626a44aed82ed38376b8609884169bcfd79cb','{"candidate":{"candidate_id":"candidate-b0050ab4-1d01-4556-ac3d-fa0053f69ce2","board_id":"goalboard-v1-demo","submitted_by":"runtime-interface","discovered_in_run_id":"run-65ec112f-54fe-499a-a41d-b5fc73d14f85","proposed_goal":{"title":"让旧数据升级前先看到安全说明","outcome":"用户在升级前知道哪些内容会保留、哪些需要重新整理","why":"旧版数据和当前规则并不完全对应，直接迁移可能让用户误以为缺失内容仍然有效","business_logic":"用户升级时先看到每类旧数据的处理结果；能安全保留的内容明确列出，不能可靠迁移的内容提示重新整理，不会静默丢失或伪造。","acceptance_criteria":[{"statement":"升级报告逐项说明可迁移内容和需要重建的内容","decision_method":"automated_check","pass_condition":"迁移样例没有未解释字段"}]},"proposed_relations":[],"proposed_impacts":[],"proposed_risks":[],"blocking_mode":"none","state":"pending","decision":null,"created_at":"2026-09-10T07:03:28.555Z","decided_at":null},"observed_event_cursor":43}','2026-09-10T07:03:28.555Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','migration-user','create_goal','old-create-OLD-HUMAN','b2049afc08d9a0eacb6b40703d53094782322afd33580c6ccf765f2e09619553','{"goal":{"goal_id":"OLD-HUMAN","board_id":"goalboard-v1-demo","title":"历史迁移场景 OLD-HUMAN","outcome":"用户亲自核对付款体验","why":"保留已有明确约定","business_logic":"单向升级后要求和责任仍须可读可改","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":0,"accepted_by":null,"accepted_at":null,"created_at":"2026-09-10T07:03:28.560Z","updated_at":"2026-09-10T07:03:28.560Z","acceptance_criteria":[{"criterion_id":"OLD-HUMAN-C1","goal_id":"OLD-HUMAN","statement":"用户亲自核对付款体验","decision_method":"human_decision","pass_condition":"用户亲自核对付款体验","target":null,"required_evidence":[]}]},"observed_event_cursor":44}','2026-09-10T07:03:28.560Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','migration-user','create_goal','old-create-OLD-POLICY','6ecf12132ad9018d89c7f816420646f59c9f9d8c451b5d678403f10204673ecd','{"goal":{"goal_id":"OLD-POLICY","board_id":"goalboard-v1-demo","title":"历史迁移场景 OLD-POLICY","outcome":"实际付款成功","why":"保留已有明确约定","business_logic":"单向升级后要求和责任仍须可读可改","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":0,"accepted_by":null,"accepted_at":null,"created_at":"2026-09-10T07:03:28.560Z","updated_at":"2026-09-10T07:03:28.560Z","acceptance_criteria":[{"criterion_id":"OLD-POLICY-C1","goal_id":"OLD-POLICY","statement":"实际付款成功","decision_method":"inspection","pass_condition":"实际付款成功","target":null,"required_evidence":[]}]},"observed_event_cursor":45}','2026-09-10T07:03:28.560Z');
INSERT INTO "idempotency_records" VALUES('goalboard-v1-demo','migration-user','create_goal','old-create-OLD-RISK','1d34576186083dbff0dd2c72f267c746569ec2872674cf886beaba2237f0bf30','{"goal":{"goal_id":"OLD-RISK","board_id":"goalboard-v1-demo","title":"历史迁移场景 OLD-RISK","outcome":"结果可以打开","why":"保留已有明确约定","business_logic":"单向升级后要求和责任仍须可读可改","in_scope":[],"out_of_scope":[],"constraints":[],"required_inputs":[],"promised_outputs":[],"decomposition_review":null,"definition_state":"draft","decomposition_state":"abstract","validity_state":"valid","fulfillment_state":"unmet","current_contract_revision":1,"trashed_at":null,"trashed_by":null,"archived_at":null,"archived_by":null,"priority":0,"accepted_by":null,"accepted_at":null,"created_at":"2026-09-10T07:03:28.561Z","updated_at":"2026-09-10T07:03:28.561Z","acceptance_criteria":[{"criterion_id":"OLD-RISK-C1","goal_id":"OLD-RISK","statement":"结果可以打开","decision_method":"inspection","pass_condition":"结果可以打开","target":null,"required_evidence":[]}]},"observed_event_cursor":46}','2026-09-10T07:03:28.561Z');
CREATE TABLE impact_bindings (
    binding_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    surface TEXT NOT NULL,
    access TEXT NOT NULL CHECK (access IN ('read', 'write', 'decide', 'exclusive')),
    input_snapshot TEXT,
    state TEXT NOT NULL CHECK (state IN ('proposed', 'confirmed', 'inactive')),
    reason TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    deactivated_at TEXT, deactivation_reason TEXT
  );
CREATE TABLE inbox_entries (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      subject_type TEXT NOT NULL CHECK (subject_type IN ('feed_item', 'goal_decision', 'source_fault')),
      subject_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('manual', 'source_rule', 'goal_decision', 'source_fault')),
      status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'dismissed')),
      detail_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      PRIMARY KEY (board_id, entry_id),
      UNIQUE (board_id, subject_type, subject_id, reason)
    );
CREATE TABLE input_bindings (
    binding_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    input_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    source_edge_key TEXT,
    snapshot_digest TEXT,
    state TEXT NOT NULL CHECK (state IN ('proposed', 'confirmed', 'inactive')),
    reason TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
CREATE TABLE listener_deliveries (
      project_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      raw_event_id TEXT NOT NULL,
      provider_dedupe_id TEXT NOT NULL,
      raw_event_json TEXT NOT NULL,
      cursor_after_json TEXT,
      adapter_plugin_id TEXT NOT NULL,
      adapter_version TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pending', 'retry_wait', 'accepted', 'quarantined')),
      attempt INTEGER NOT NULL DEFAULT 0,
      signal_id TEXT,
      last_error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, source_id, raw_event_id)
    );
CREATE TABLE listener_instances (
      project_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      cursor_json TEXT NOT NULL DEFAULT '{}',
      state TEXT NOT NULL CHECK (state IN ('idle', 'listening', 'retry_wait', 'quarantined')),
      attempt INTEGER NOT NULL DEFAULT 0,
      retry_at TEXT,
      last_error_code TEXT,
      lease_owner TEXT,
      lease_expires_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, source_id)
    );
CREATE TABLE planning_method_packs (
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    method_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    pack_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (board_id, method_id)
  );
CREATE TABLE policy_bindings (
    policy_binding_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT REFERENCES goals(goal_id),
    scope TEXT NOT NULL CHECK (scope IN ('project_default', 'ancestor_minimum', 'goal')),
    policy_json TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active', 'replaced', 'withdrawn')),
    created_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
INSERT INTO "policy_bindings" VALUES('legacy-explicit-human','goalboard-v1-demo','OLD-POLICY','goal','{"human_approval":true}','active','migration-user','用户明确要求完成前亲自验收','2026-09-10T07:03:28.561Z');
CREATE TABLE project_guidance_entries (
    guidance_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    kind TEXT NOT NULL CHECK (kind IN ('context', 'requirement', 'constraint', 'convention', 'workflow', 'quality_bar')),
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    source_refs_json TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL,
    confirmation_summary TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(board_id, position),
    UNIQUE(board_id, kind, content_hash)
  );
CREATE TABLE project_guidance_revisions (
    revision_id TEXT PRIMARY KEY,
    guidance_id TEXT NOT NULL REFERENCES project_guidance_entries(guidance_id) ON DELETE CASCADE,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('context', 'requirement', 'constraint', 'convention', 'workflow', 'quality_bar')),
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    source_refs_json TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL CHECK (active IN (0, 1)),
    changed_by TEXT NOT NULL,
    change_kind TEXT NOT NULL CHECK (change_kind IN ('created', 'edited', 'deactivated', 'restored')),
    confirmation_summary TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(guidance_id, revision)
  );
CREATE TABLE review_obligations (
    obligation_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    contract_revision INTEGER NOT NULL DEFAULT 1,
    role TEXT NOT NULL CHECK (role IN ('self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'human_approver')),
    required_count INTEGER NOT NULL,
    independence_rule TEXT NOT NULL,
    criterion_scope_json TEXT NOT NULL DEFAULT '[]',
    state TEXT NOT NULL CHECK (state IN ('pending', 'satisfied', 'waived')),
    created_at TEXT NOT NULL
  );
INSERT INTO "review_obligations" VALUES('obligation-64b45adb-d01f-4ee5-a9d7-fba2f7dcb9a6','goalboard-v1-demo','CORE',1,'self_verifier',1,'executor_allowed','["CORE-C1"]','satisfied','2026-09-10T07:03:28.539Z');
INSERT INTO "review_obligations" VALUES('obligation-efabfe3f-c602-454e-8f3b-13d48ec76a68','goalboard-v1-demo','INTERFACES',1,'self_verifier',1,'executor_allowed','["INTERFACES-C1"]','pending','2026-09-10T07:03:28.553Z');
CREATE TABLE reviews (
    review_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    obligation_id TEXT NOT NULL REFERENCES review_obligations(obligation_id),
    claim_id TEXT REFERENCES claims(claim_id),
    actor_id TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'fail', 'needs_changes', 'inconclusive')),
    evidence_refs_json TEXT NOT NULL DEFAULT '[]',
    reasoning TEXT NOT NULL,
    submitted_at TEXT NOT NULL
  );
INSERT INTO "reviews" VALUES('review-3c52c9fe-13b8-41ce-92d2-725de601ae6f','goalboard-v1-demo','CORE','obligation-64b45adb-d01f-4ee5-a9d7-fba2f7dcb9a6',NULL,'runtime-core','pass','["evidence-3aaba898-2eb4-4565-acbb-13cccced105f"]','生命周期测试通过','2026-09-10T07:03:28.550Z');
CREATE TABLE rewires (
    rewire_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    candidate_id TEXT REFERENCES candidates(candidate_id),
    proposal_json TEXT NOT NULL,
    impact_json TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'confirmed', 'rejected', 'applied')),
    created_at TEXT NOT NULL,
    decided_at TEXT
  );
CREATE TABLE risks (
    risk_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    probability TEXT NOT NULL,
    impact TEXT NOT NULL,
    affected_surfaces_json TEXT NOT NULL DEFAULT '[]',
    trigger TEXT NOT NULL,
    treatment TEXT NOT NULL,
    treatment_plan TEXT NOT NULL DEFAULT '',
    blocking_mode TEXT NOT NULL CHECK (blocking_mode IN ('none', 'claim', 'completion', 'invalidate_on_trigger')),
    revisit_condition TEXT NOT NULL,
    owner TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('open', 'triggered', 'resolved', 'accepted', 'expired')),
    resolution_basis_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
INSERT INTO "risks" VALUES('RISK-FIRST-RESTART','goalboard-v1-demo','用户接入 Runtime 后没有新开会话，误以为安装失败','medium','用户看不到 Molis Work 工具，无法开始第一次使用','["首次安装","Runtime 接入"]','用户继续使用接入前已经打开的会话','mitigate','','none','安装结果和接入预览都清楚说明新开会话的原因和下一步','产品体验','open',NULL,'2026-09-10T07:03:28.532Z','2026-09-10T07:03:28.532Z');
INSERT INTO "risks" VALUES('legacy-completion-risk','goalboard-v1-demo','付款记录存在遗漏，结果未确认','已发生','收据结果不可用','["当前结果"]','结果验收','mitigate','修复后复查','completion','全部付款记录可读取','migration-user','open',NULL,'2026-09-10T07:03:28.561Z','2026-09-10T07:03:28.561Z');
CREATE TABLE runs (
    run_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    claim_id TEXT NOT NULL REFERENCES claims(claim_id),
    actor_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
    state TEXT NOT NULL CHECK (state IN ('started', 'blocked', 'completed', 'failed', 'abandoned')),
    block_reason TEXT,
    output_refs_json TEXT NOT NULL DEFAULT '[]',
    discovery_refs_json TEXT NOT NULL DEFAULT '[]',
    started_at TEXT NOT NULL,
    ended_at TEXT
  );
INSERT INTO "runs" VALUES('run-45ec1136-7bbf-4740-9e6b-1689e672c7af','goalboard-v1-demo','CORE','claim-dc5985a4-4a90-4aaa-880a-28f896f96e14','runtime-core','executor','completed',NULL,'["tests/v1.test.ts"]','[]','2026-09-10T07:03:28.541Z','2026-09-10T07:03:28.543Z');
INSERT INTO "runs" VALUES('run-65ec112f-54fe-499a-a41d-b5fc73d14f85','goalboard-v1-demo','INTERFACES','claim-c44fe62b-c4bf-4b0e-9d14-3f302a74c45b','runtime-interface','executor','started',NULL,'[]','[]','2026-09-10T07:03:28.554Z',NULL);
CREATE TABLE schema_migrations (
      migration_id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
    );
INSERT INTO "schema_migrations" VALUES(1,'2026-09-10T07:03:28.481Z');
INSERT INTO "schema_migrations" VALUES(2,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(3,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(4,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(5,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(6,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(7,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(8,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(9,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(10,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(11,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(12,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(13,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(14,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(15,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(16,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(17,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(18,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(19,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(20,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(21,'2026-09-10T07:03:28.483Z');
INSERT INTO "schema_migrations" VALUES(22,'2026-09-10T07:03:28.484Z');
INSERT INTO "schema_migrations" VALUES(23,'2026-09-10T07:03:28.484Z');
INSERT INTO "schema_migrations" VALUES(24,'2026-09-10T07:03:28.484Z');
INSERT INTO "schema_migrations" VALUES(25,'2026-09-10T07:03:28.484Z');
INSERT INTO "schema_migrations" VALUES(26,'2026-09-10T07:03:28.484Z');
INSERT INTO "schema_migrations" VALUES(27,'2026-09-10T07:03:28.484Z');
INSERT INTO "schema_migrations" VALUES(28,'2026-09-10T07:03:28.485Z');
INSERT INTO "schema_migrations" VALUES(29,'2026-09-10T07:03:28.485Z');
INSERT INTO "schema_migrations" VALUES(30,'2026-09-10T07:03:28.485Z');
INSERT INTO "schema_migrations" VALUES(31,'2026-09-10T07:03:28.485Z');
INSERT INTO "schema_migrations" VALUES(32,'2026-09-10T07:03:28.485Z');
INSERT INTO "schema_migrations" VALUES(33,'2026-09-10T07:03:28.485Z');
INSERT INTO "schema_migrations" VALUES(34,'2026-09-10T07:03:28.485Z');
INSERT INTO "schema_migrations" VALUES(35,'2026-09-10T07:03:28.485Z');
CREATE TABLE signal_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('signal.accepted', 'signal.changed')),
      revision INTEGER NOT NULL,
      at TEXT NOT NULL
    );
CREATE TABLE signal_revisions (
      project_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      draft_json TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      PRIMARY KEY (project_id, signal_id, revision)
    );
CREATE TABLE signals (
      project_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      provider_dedupe_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      content_refs_json TEXT NOT NULL DEFAULT '[]',
      raw_event_id TEXT NOT NULL,
      adapter_plugin_id TEXT NOT NULL,
      adapter_version TEXT NOT NULL,
      provenance_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      validation TEXT NOT NULL CHECK (validation = 'accepted'),
      superseded_by TEXT,
      withdrawn_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, signal_id),
      UNIQUE (project_id, source_id, provider_dedupe_id)
    );
CREATE TABLE source_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('source.created', 'source.updated', 'source.status_changed', 'source.retired')),
      payload_json TEXT NOT NULL,
      at TEXT NOT NULL
    );
DELETE FROM "sqlite_sequence";
INSERT INTO "sqlite_sequence" VALUES('events',46);
CREATE INDEX goals_board_idx ON goals(board_id);
CREATE INDEX goals_ready_idx ON goals(board_id, definition_state, decomposition_state, validity_state, fulfillment_state);
CREATE INDEX goals_trash_idx ON goals(board_id, trashed_at);
CREATE INDEX goals_archive_idx ON goals(board_id, archived_at);
CREATE INDEX goal_contract_revisions_board_idx
    ON goal_contract_revisions(board_id, goal_id, revision DESC);
CREATE INDEX acceptance_goal_idx ON acceptance_criteria(goal_id);
CREATE INDEX relations_from_idx ON goal_relations(board_id, from_goal_id, state);
CREATE INDEX relations_to_idx ON goal_relations(board_id, to_goal_id, state);
CREATE UNIQUE INDEX goal_trash_one_open_per_goal
    ON goal_trash_records(board_id, goal_id)
    WHERE restored_at IS NULL;
CREATE INDEX goal_trash_records_goal_idx
    ON goal_trash_records(board_id, goal_id, restored_at, trashed_at);
CREATE INDEX goal_trash_relation_records_relation_idx
    ON goal_trash_relation_records(relation_id, restored_at);
CREATE INDEX policies_scope_idx ON policy_bindings(board_id, goal_id, state);
CREATE INDEX coverage_contract_revisions_child_idx
    ON coverage_contract_revisions(child_goal_id, child_contract_revision);
CREATE INDEX project_guidance_board_idx
    ON project_guidance_entries(board_id, position, guidance_id);
CREATE INDEX project_guidance_revisions_board_idx
    ON project_guidance_revisions(board_id, guidance_id, revision DESC);
CREATE INDEX impacts_goal_idx ON impact_bindings(board_id, goal_id, state);
CREATE INDEX impacts_surface_idx ON impact_bindings(board_id, surface, state);
CREATE INDEX claims_board_state_idx ON claims(board_id, state, expires_at);
CREATE INDEX claims_goal_idx ON claims(goal_id, state);
CREATE INDEX claims_action_idx ON claims(board_id, action_kind, action_target_id, state);
CREATE UNIQUE INDEX claims_one_active_per_goal ON claims(goal_id) WHERE state = 'active';
CREATE UNIQUE INDEX runs_one_nonterminal_per_claim ON runs(claim_id) WHERE state IN ('started', 'blocked');
CREATE INDEX evidence_goal_idx ON evidence(goal_id, result);
CREATE INDEX evidence_corrections_goal_idx
    ON evidence_corrections(board_id, goal_id, created_at, correction_id);
CREATE INDEX reviews_obligation_idx ON reviews(obligation_id, verdict);
CREATE INDEX contract_proposals_goal_idx
    ON contract_proposals(board_id, goal_id, state, created_at);
CREATE INDEX goal_tree_proposals_board_idx
    ON goal_tree_proposals(board_id, root_goal_id, state, created_at DESC, proposal_id);
CREATE INDEX goal_tree_proposals_supersedes_idx
    ON goal_tree_proposals(supersedes_proposal_id);
CREATE INDEX goal_tree_proposals_supersedes_legacy_idx
    ON goal_tree_proposals(supersedes_legacy_proposal_id);
CREATE INDEX goal_tree_proposal_items_proposal_idx
    ON goal_tree_proposal_items(proposal_id, ordinal, item_id);
CREATE INDEX goal_tree_proposal_items_board_idx
    ON goal_tree_proposal_items(board_id, state, item_id);
CREATE INDEX goal_tree_proposal_decisions_item_idx
    ON goal_tree_proposal_decisions(proposal_id, item_id, created_at, decision_id);
CREATE INDEX goal_event_trusted_decisions_goal_idx
    ON goal_event_trusted_decisions(board_id, goal_id, recorded_at);
CREATE INDEX artifacts_board_idx
    ON artifacts(board_id, created_at DESC, artifact_id);
CREATE INDEX artifact_versions_type_idx
    ON artifact_versions(artifact_type_id, schema_version, scope, lifecycle_state);
CREATE UNIQUE INDEX clarification_one_open_session_per_goal
          ON clarification_sessions(goal_id)
          WHERE state != 'closed';
CREATE INDEX clarification_sessions_goal_idx
          ON clarification_sessions(board_id, goal_id, updated_at DESC, session_id);
CREATE INDEX clarification_turns_session_idx
          ON clarification_turns(session_id, turn_index, turn_id);
CREATE INDEX events_board_idx ON events(board_id, seq);
CREATE INDEX goal_event_types_goal_idx
    ON goal_event_types(board_id, goal_id, type_id, type_version);
CREATE INDEX goal_event_requirements_goal_idx
    ON goal_event_requirements(board_id, goal_id, requirement_id);
CREATE INDEX goal_work_events_goal_seq_idx
    ON goal_work_events(board_id, goal_id, journal_seq);
CREATE INDEX goal_work_event_judgments_requirement_idx
    ON goal_work_event_judgments(requirement_id, event_id);
CREATE INDEX goal_event_state_owners_board_idx
    ON goal_event_state_owners(board_id, goal_id);
CREATE INDEX goal_event_progress_summaries_goal_idx
    ON goal_event_progress_summaries(board_id, goal_id, recorded_at);
CREATE INDEX goal_event_concerns_goal_idx
    ON goal_event_concerns(board_id, goal_id, status);
CREATE INDEX goal_event_decision_requests_goal_idx
    ON goal_event_decision_requests(board_id, goal_id, status);
CREATE INDEX goal_event_applied_decisions_goal_idx
    ON goal_event_applied_decisions(board_id, goal_id, recorded_at);
CREATE INDEX goal_event_requirement_conclusions_latest_idx
    ON goal_event_requirement_conclusions(board_id, goal_id, requirement_id, journal_seq);
CREATE INDEX goal_event_closures_goal_idx
    ON goal_event_closures(board_id, goal_id, recorded_at);
CREATE INDEX feed_sources_board_updated_idx
      ON feed_sources(board_id, updated_at DESC, source_id);
CREATE INDEX source_events_project_source_idx
      ON source_events(project_id, source_id, at, event_id);
CREATE INDEX signals_project_source_observed_idx
      ON signals(project_id, source_id, observed_at DESC, signal_id);
CREATE INDEX signal_events_project_source_idx
      ON signal_events(project_id, source_id, at, event_id);
CREATE INDEX listener_deliveries_recovery_idx
      ON listener_deliveries(project_id, source_id, state, updated_at, raw_event_id);
CREATE INDEX feed_source_runs_board_source_idx
      ON feed_source_runs(board_id, source_id, started_at DESC);
CREATE INDEX inbox_entries_board_status_idx
      ON inbox_entries(board_id, status, updated_at DESC, entry_id);
CREATE INDEX inbox_entries_board_subject_idx
      ON inbox_entries(board_id, subject_type, subject_id);
CREATE INDEX attention_events_project_entry_idx
      ON attention_events(project_id, entry_id, at, event_id);
CREATE INDEX feed_import_receipts_board_completed_idx
      ON feed_import_receipts(board_id, completed_at DESC);
CREATE INDEX feed_items_board_type_updated_idx
      ON feed_items(board_id, item_type, disposition, source_updated_at DESC);
CREATE INDEX feed_items_board_goal_idx
      ON feed_items(board_id, linked_goal_id);
CREATE UNIQUE INDEX feed_items_board_source_external_idx
      ON feed_items(board_id, source_id, external_id)
      WHERE source_id IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX feed_materials_board_item_idx
      ON feed_materials(board_id, item_id, updated_at DESC, material_id);
CREATE INDEX feed_item_events_project_item_idx
      ON feed_item_events(project_id, item_id, at, event_id);
CREATE UNIQUE INDEX feed_items_board_signal_idx
      ON feed_items(board_id, signal_id) WHERE signal_id IS NOT NULL
  ;
CREATE INDEX context_edges_source_idx ON context_edges
      (scope_kind, scope_id, relation_type, json_extract(source_json, '$.module'), json_extract(source_json, '$.id'));
COMMIT;

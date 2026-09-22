export const PLANNING_SETTINGS_CLIENT_SCRIPT = `
(()=>{
  const bindFilters = (root)=>{
    const scope = root && root.querySelector ? root : document;
    const board = scope.matches?.(".work-planning, .planning-catalog") ? scope : scope.querySelector(".work-planning, .planning-catalog");
    if (!board || board.dataset.planningFiltersBound === "1") return;
    board.dataset.planningFiltersBound = "1";
    const search=board.querySelector("[data-planning-search]");
    const applyFilter=()=>{
      const filter=board.querySelector('[data-planning-filter][aria-pressed="true"]')?.dataset.planningFilter||"all";
      const query=(search?.value||"").trim().toLocaleLowerCase();
      let visible=0;
      board.querySelectorAll("[data-planning-method]").forEach((item)=>{
        const categoryMatches=filter==="all"||item.dataset.kind===filter||(filter==="mine"&&item.dataset.scope!=="built_in");
        const matches=categoryMatches&&(!query||item.textContent.toLocaleLowerCase().includes(query));
        item.hidden=!matches;
        if(matches)visible+=1;
      });
      const empty=board.querySelector("[data-planning-filter-empty]");
      if(empty)empty.hidden=visible!==0;
    };
    board.querySelectorAll("[data-planning-filter]").forEach((button)=>button.addEventListener("click",()=>{
      board.querySelectorAll("[data-planning-filter]").forEach((item)=>item.setAttribute("aria-pressed",String(item===button)));
      applyFilter();
    }));
    search?.addEventListener("input",applyFilter);
  };
  const bindEditForm = (root)=>{
    const scope = root && root.querySelector ? root : document;
    const form=scope.querySelector("[data-planning-edit-form]");
    if(!form || form.dataset.bound === "1")return;
    form.dataset.bound = "1";
    const error=form.querySelector("[data-planning-method-error]");
    let saving = false;
    const cancelLinks = [...form.closest(".planning-edit").querySelectorAll(".planning-edit-footer a, .planning-back")];
    cancelLinks.forEach(link => link.addEventListener("click", event => { if (saving) event.preventDefault(); }));
    const cloneRow=(list)=>{const source=list.querySelector("[data-planning-row]");if(!source)return;const row=source.cloneNode(true);row.querySelectorAll("input, textarea").forEach((input)=>{input.value=""});list.append(row);row.querySelector("input, textarea")?.focus({preventScroll:true})};
    form.addEventListener("click",(event)=>{const add=event.target.closest("[data-add-planning-row]");if(add){const list=form.querySelector('[data-planning-row-list="'+add.dataset.addPlanningRow+'"]');if(list)cloneRow(list);return}const remove=event.target.closest("[data-remove-planning-row]");if(!remove)return;const row=remove.closest("[data-planning-row]");const list=row?.parentElement;if(!row||!list)return;if(list.querySelectorAll("[data-planning-row]").length===1){row.querySelectorAll("input, textarea").forEach((input)=>{input.value=""})}else row.remove()});
    form.addEventListener("submit",async(event)=>{event.preventDefault();if(saving || !form.reportValidity())return;
      const requiredGroups = [
        { selector: '[data-planning-row-list="steps"]', fields: ['steps'], message: L("请填写至少一个规划步骤。") },
        { selector: '[data-planning-row-list="coverage"]', fields: ['coverage_label', 'coverage_question'], message: L("请填写至少一个完整的拆分问题。") },
        { selector: '[data-planning-row-list="dependencies"]', fields: ['dependency_statement', 'dependency_direction'], message: L("请填写至少一条完整的依赖判断。") },
      ];
      for (const group of requiredGroups) {
        const list = form.querySelector(group.selector);
        const rows = [...list.querySelectorAll('[data-planning-row]')];
        if (rows.some(row => group.fields.every(name => row.querySelector('[name="'+name+'"]').value.trim()))) continue;
        error.textContent = group.message; error.hidden = false;
        list.closest('details').open = true;
        rows[0].querySelector('input, textarea').focus();
        return;
      }
      saving=true;form.setAttribute("aria-busy","true");form.querySelector(".planning-edit-fields").inert=true;cancelLinks.forEach(link=>link.setAttribute("aria-disabled","true"));error.hidden=true;error.textContent="";const submit=form.querySelector('button[type="submit"]');submit.disabled=true;const label=submit.textContent;submit.textContent=L("正在保存…");const values=(name)=>[...form.querySelectorAll('[name="'+name+'"]')].map((input)=>input.value.trim()).filter(Boolean);const internalId=(prefix,value,index)=>{const readable=String(value||"").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,32);return prefix+"-"+(readable||String(index+1))+"-"+String(index+1)};try{const coverage=[...form.querySelectorAll("[data-coverage-row]")].map((row,index)=>{const label=row.querySelector('[name="coverage_label"]').value.trim();const question=row.querySelector('[name="coverage_question"]').value.trim();return label||question?{area:internalId("coverage",label,index),label,question}:null}).filter(Boolean);const dependencies=[...form.querySelectorAll("[data-dependency-row]")].map((row,index)=>{const statement=row.querySelector('[name="dependency_statement"]').value.trim();const direction=row.querySelector('[name="dependency_direction"]').value.trim();return statement||direction?{rule_id:internalId("dependency",statement,index),statement,direction_hint:direction}:null}).filter(Boolean);const method={method_id:form.elements.method_id.value,kind:form.elements.kind.value,name:form.elements.name.value.trim(),summary:form.elements.summary.value.trim(),instructions:form.elements.instructions.value.trim(),applies_to:String(form.elements.applies_to.value||"").split(",").map((item)=>item.trim()).filter(Boolean),domain_tags:String(form.elements.domain_tags.value||"").split(",").map((item)=>item.trim()).filter(Boolean),steps:values("steps"),required_coverage:coverage,dependency_rules:dependencies,evidence_requirements:values("evidence_requirements"),completion_checks:values("completion_checks"),failure_modes:values("failure_modes"),source_refs:String(form.elements.source_refs.value||"").split(/\\n/).map((item)=>item.trim()).filter(Boolean),confidence:Number(form.elements.confidence.value),enabled:form.elements.enabled.checked};const response=await fetch(form.dataset.apiEndpoint,{method:"POST",headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({scope:form.dataset.saveScope,method})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||L("保存失败"));location.assign(form.dataset.returnHref)}catch(reason){error.textContent=reason instanceof TypeError?L("无法连接本地服务，输入已保留，请重试。"):reason instanceof Error?reason.message:String(reason);error.hidden=false;saving=false;form.removeAttribute("aria-busy");form.querySelector(".planning-edit-fields").inert=false;cancelLinks.forEach(link=>link.removeAttribute("aria-disabled"));submit.disabled=false;submit.textContent=label;submit.focus()}});
  };
  globalThis.molisWorkBindPlanningSettings = (root)=>{
    bindFilters(root);
    bindEditForm(root);
  };
  globalThis.molisWorkBindPlanningSettings(document);
})();
`;
export const PLANNING_ADOPTION_CLIENT_SCRIPT = `
(()=>{
  globalThis.molisWorkBindPlanningAdoption = (root)=>{
    const scope = root && root.querySelector ? root : document;
    const errorBox=scope.querySelector("[data-planning-adoption-error]");
    scope.querySelectorAll("[data-adopt-planning-method]").forEach((button)=>{
      if (button.dataset.bound === "1") return;
      button.dataset.bound = "1";
      button.addEventListener("click",async()=>{
        const label=button.textContent;
        button.disabled=true;
        button.textContent=L("正在加入…");
        if(errorBox){errorBox.hidden=true;errorBox.textContent=""}
        try{
          const response=await fetch(button.dataset.adoptEndpoint,{method:"POST",headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({method_id:button.dataset.adoptPlanningMethod,user_confirmed:true})});
          const payload=await response.json();
          if(!response.ok)throw new Error(payload.error||L("加入失败"));
          if(button.closest("[data-goal-work-planning]") && globalThis.molisWorkOpenGoalWorkPlanning){globalThis.molisWorkOpenGoalWorkPlanning();return}
          location.reload();
        }catch(reason){
          if(errorBox){errorBox.textContent=reason instanceof Error?reason.message:String(reason);errorBox.hidden=false}
          button.disabled=false;
          button.textContent=label;
        }
      });
    });
  };
  globalThis.molisWorkBindPlanningAdoption(document);
})();
`;

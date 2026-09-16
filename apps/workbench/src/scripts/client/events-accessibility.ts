/** AP3 Workbench client segment: events-accessibility. */
export const CLIENT_EVENTS_ACCESSIBILITY_SCRIPT = `    });

    document.addEventListener("submit", async (event) => {
      if (event.target.matches("[data-feed-add-form]")) {
        event.preventDefault(); feedSourcesDialog?.querySelector("[data-feed-source-register]")?.click(); return;
      }
      const submittedForm = event.target;
      const trashSubmit = handleGoalTrashSubmit(submittedForm, event);
      if (trashSubmit) { await trashSubmit; return; }
      const proposalSubmit = handleGoalProposalSubmit(submittedForm, event);
      if (proposalSubmit) { await proposalSubmit; return; }

      const relationSubmit = handleGoalRelationSubmit(submittedForm, event);
      if (relationSubmit) { await relationSubmit; return; }
      const policySubmit = handleGoalPolicySubmit(submittedForm, event);
      if (policySubmit) { await policySubmit; return; }
`;

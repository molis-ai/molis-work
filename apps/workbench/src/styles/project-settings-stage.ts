export const PROJECT_SETTINGS_STAGE_STYLES = `
  body.immersive-workbench .immersive-workspace.is-project-settings [data-directory-shortcuts] { display: none; }
  body.immersive-workbench .project-settings-directory { display: flex; flex-direction: column; gap: 1px; padding: 0 8px; }
  body.immersive-workbench .project-settings-directory a {
    display: flex; align-items: center; min-height: 32px; padding: 0 8px; border-radius: 6px;
    color: var(--ink); text-decoration: none; font-weight: 450;
  }
  body.immersive-workbench .project-settings-directory a:hover { background: var(--nav-hover); }
  body.immersive-workbench .project-settings-directory a[aria-current="page"] { background: var(--nav-active); font-weight: 550; }
  body.immersive-workbench .project-settings-stage {
    padding: 28px 40px 72px; overflow: auto; overscroll-behavior: contain; background: var(--paper); color: var(--ink);
  }
  body.immersive-workbench .project-settings-stage > .project-settings-page,
  body.immersive-workbench .project-settings-stage > .guidance-document,
  body.immersive-workbench .project-settings-stage > .settings-document,
  body.immersive-workbench .project-settings-stage > .work-planning { max-width: 760px; }
  body.immersive-workbench .project-settings-page > h1 { margin: 0 0 22px; font-size: 26px; font-weight: 650; letter-spacing: -.03em; }
  body.immersive-workbench .project-settings-stage .project-settings-identity { margin: 0 0 22px; padding: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  body.immersive-workbench .project-settings-stage .project-settings-identity .inline-settings-form {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px 16px; align-items: end; margin: 0; padding: 14px 16px;
  }
  body.immersive-workbench .project-settings-stage .project-manager-storage { margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  body.immersive-workbench .project-settings-stage .project-manager-danger { margin: 22px 0 0; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; }
  body.immersive-workbench .project-settings-embed-pending { margin: 0; color: var(--muted); font-size: 13px; }
`;

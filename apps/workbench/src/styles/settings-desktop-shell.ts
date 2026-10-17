/**
 * The settings page's two-column content in the desktop shell. Dead style: both settings bodies render
 * data-desktop-shell="false", so it never applies; W5-05 slice 5 deletes it with renderInitialGoalTab.
 */
export const SETTINGS_DESKTOP_SHELL_STYLES = `
  @media (min-width: 761px) {
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) .settings-content {
      min-width: 0;
      min-height: 0;
      padding: 0 16px 24px 12px;
      grid-column: 2;
      grid-row: 2;
      overflow: hidden;
      overscroll-behavior: contain;
      background: var(--page);
    }
  }
`;

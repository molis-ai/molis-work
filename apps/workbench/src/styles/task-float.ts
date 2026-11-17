/** Original task float geometry shared by the workbench and Home Assistant. */
export const TASK_FLOAT_STYLES = `
/* Where the task panel floats: beside its dialog with their top edges level, or over the dialog's right side under the tab bar
   where there is no room beside it (work-line-layout.ts measures and says which). It never moves the work surface. */
.work-task-float{position:fixed;z-index:60;top:var(--dialog-top,auto);left:calc(var(--dialog-right,0px) + 12px);display:flex;max-width:calc(100% - 20px)}
.work-task-float[data-content="conversation"]{width:330px;height:min(570px,calc(100dvh - 100px));min-height:0}
.work-task-float[data-content="conversation"][data-place="over"]{height:min(570px,var(--dialog-room,570px),calc(100dvh - 160px))}
.work-task-float[data-place="over"]{top:calc(var(--dialog-top,0px) + 52px);left:auto;right:var(--dialog-inset,18px)}
.work-task-float[data-place="closed"]{top:auto;left:auto;right:calc(var(--dialog-inset,18px) - 8px);bottom:calc(var(--line-clear,0px) + 52px)}
.work-task-float[data-place="over"] .work-task-panel{max-height:min(56vh,480px,var(--dialog-room,480px))}
@media(max-width:760px){
  .work-task-float,.work-task-float[data-content="conversation"]{width:min(330px,calc(100% - 20px));height:min(570px,calc(100dvh - 100px));min-height:0}
.work-task-float[data-content="conversation"][data-place="over"]{height:min(570px,var(--dialog-room,570px),calc(100dvh - var(--line-clear,0px) - 20px))}
.work-task-float[data-place="over"]{top:auto;right:10px;bottom:calc(var(--line-clear,0px) + 10px);left:10px;max-width:none}
}
`;

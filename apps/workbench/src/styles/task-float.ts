/** Original task float geometry shared by the workbench and Home Assistant. */
export const TASK_FLOAT_STYLES = `
/* Where the task float stands (work-line-layout.ts measures and says which): in the information column's place where the
   dialog has one; else beside its dialog with their top edges level, or over the dialog's right side where there is no room
   beside it. It never moves the work surface. */
.work-task-float{position:fixed;z-index:60;top:var(--dialog-top,auto);left:calc(var(--dialog-right,0px) + 12px);display:flex;max-width:calc(100% - 20px)}
.work-task-float[data-content="conversation"]{width:330px;height:min(570px,calc(100dvh - 100px));min-height:0}
.work-task-float[data-content="conversation"][data-place="over"]{height:min(570px,var(--dialog-room,570px),calc(100dvh - 160px))}
.work-task-float[data-place="over"]{top:calc(var(--dialog-top,0px) + 52px);left:auto;right:var(--dialog-inset,18px)}
.work-task-float[data-place="closed"]{top:auto;left:auto;right:calc(var(--dialog-inset,18px) - 8px);bottom:calc(var(--line-clear,0px) + 52px)}
.work-task-float[data-place="over"] .work-task-panel{max-height:min(56vh,480px,var(--dialog-room,480px))}
/* In the information column's place (decision 49): the column's own box while the conversation is open; right above the card stack, as wide, while it is closed. */
.work-task-float:is([data-place="column"],[data-place="stack"]){left:var(--col-left,auto);width:var(--col-width,340px);max-width:none}
.work-task-float[data-place="column"]{top:var(--col-top,auto);height:var(--col-height,auto)}
.work-task-float[data-place="stack"]{top:auto;bottom:var(--col-bottom,110px);max-height:calc(100dvh - var(--col-bottom,110px) - 60px)}
.work-task-float:is([data-place="column"],[data-place="stack"]) .work-task-panel{width:100%;max-height:100%}
.work-task-float[data-place="column"] .work-task-panel{height:100%;border-radius:var(--r-card,12px)}
.work-task-float[data-place="column"][data-content="conversation"]{width:var(--col-width,330px);height:var(--col-height,570px)}
.work-task-float[data-place="stack"][data-content="conversation"]{width:var(--col-width,330px);height:min(570px,calc(100dvh - var(--col-bottom,110px) - 60px))}
@media(max-width:760px){
.work-task-float[data-content="conversation"]{width:min(330px,calc(100% - 20px))}
.work-task-float[data-content="conversation"][data-place="over"]{height:min(570px,var(--dialog-room,570px),calc(100dvh - var(--line-clear,0px) - 20px))}
.work-task-float:not([data-place="column"],[data-place="stack"]),.work-task-float[data-place="over"]{top:auto;right:10px;bottom:calc(var(--line-clear,0px) + 10px);left:10px;max-width:none}
}
@media(max-width:540px){
.work-task-float:is([data-place="column"],[data-place="stack"]),.work-task-float:is([data-place="column"],[data-place="stack"])[data-content="conversation"]{top:auto;right:10px;bottom:calc(var(--line-clear,0px) + 10px);left:10px;width:auto;height:auto;max-height:calc(100dvh - var(--line-clear,0px) - 20px)}
.work-task-float:is([data-place="column"],[data-place="stack"])[data-content="conversation"]{height:min(570px,calc(100dvh - var(--line-clear,0px) - 20px))}
}
`;

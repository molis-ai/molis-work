import { acknowledgementErrors } from "./event-acknowledgement-error-codes.js";
import { commandErrors } from "./command-error-codes.js";
import { eventErrors } from "./event-error-codes.js";
import { stateErrors } from "./state-error-codes.js";

export const goalErrors = { ...commandErrors, ...eventErrors, ...stateErrors, ...acknowledgementErrors };
export type GoalErrorCode = keyof typeof goalErrors;

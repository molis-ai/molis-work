import { commandErrors } from "./command-error-codes.js";
import { eventErrors } from "./event-error-codes.js";
import { stateErrors } from "./state-error-codes.js";

export const goalErrors = { ...commandErrors, ...eventErrors, ...stateErrors };
export type GoalErrorCode = keyof typeof goalErrors;

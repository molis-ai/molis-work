import { defineErrorCodes } from "@molis-ai/molis-work-plugin-sdk";

/** What Git refuses because the request does not fit the current state: the person reads the message and corrects the request (400). */
export const gitErrors = defineErrorCodes("git", { invalid: "invalid" });

import { defineErrorCodes } from "@molis-ai/molis-work-plugin-sdk";

/** What Files refuses because the request does not fit the current state: the person reads the message and corrects the request (400). */
export const filesErrors = defineErrorCodes("files", { invalid: "invalid" });

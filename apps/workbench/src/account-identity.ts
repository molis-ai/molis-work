import type { UserView } from "@molis-ai/molis-work-contracts/services/account";

/**
 * The page-status identity: a projection of the one contract user (`UserView`), never a second user record.
 * The Home account API returns the same contract user through `AccountView`; this type only narrows the fields the
 * page status needs, so a field can never be assembled differently on the two read paths.
 */
export type AccountIdentity = Readonly<Pick<UserView, "userId" | "displayName" | "email"> & { applicationId?: string }>;

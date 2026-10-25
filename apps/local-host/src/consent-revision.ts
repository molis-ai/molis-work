// How many times a person has changed a standing agreement in this process (ac-trust T5). A Home has one executing process, so a counter here
// is enough for the project platforms it runs to know that they have not looked at the ledger since: each notes the count it last reconciled
// its default wirings at, and does so again on the next request that touches the project's plugins.
let revision = 0;
export const consentRevision = (): number => revision;
export const consentsChanged = (): void => { revision += 1; };

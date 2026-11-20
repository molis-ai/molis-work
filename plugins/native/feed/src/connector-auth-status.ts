/** Whether the Home has a connected account for a service the Feed page sends people to Connectors for. Never a token. */
export interface ConnectorAuthStatus {
  github: { bound: boolean };
  gmail: { bound: boolean };
  /** Every other service an account source can be added for and the Home can pull (BL-917), by the name the person reads. */
  others?: readonly ConnectorAccountService[];
}

export interface ConnectorAccountService { readonly service_id: string; readonly title: string; readonly bound: boolean }

/** Whether the Home has a connected account for a service the Feed page sends people to Connectors for. Never a token. */
export interface ConnectorAuthStatus {
  github: { bound: boolean };
  gmail: { bound: boolean };
}

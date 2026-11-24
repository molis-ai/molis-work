/** Feed connectors never expose deterministic fixture data in ordinary builds. */
export function connectorFixtureAllowed(): boolean {
  return process.env.NODE_ENV === "test" && process.env.MOLIS_WORK_CONNECTOR_FIXTURE === "1";
}

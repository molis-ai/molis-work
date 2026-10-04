/**
 * The person at this machine, as every local entry names them: the Web workbench, the trusted management CLI and MCP, and
 * the Host's own setup on their behalf. One Home has one such person; records already written carry this id, so its value
 * never changes. Telling several people apart is a different identity model (see repository-anti-corruption §4.19).
 */
export const LOCAL_PERSON_ACTOR_ID = "web-user";

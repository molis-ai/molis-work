import { cliText, printV1Help } from "./protocol.js";

export interface CliCommandPorts {
  home(args: string[]): Promise<number>;
  plugin(args: string[]): Promise<number>;
  install(args: string[]): Promise<number>;
  service(args: string[]): Promise<number>;
  demo(args: string[]): Promise<number>;
  uninstall(args: string[]): Promise<number>;
  v1(args: string[]): Promise<number>;
}

const HELP_COMMANDS = "molis-work install | molis-work service <operation> | molis-work demo <operation> | molis-work uninstall | molis-work plugin <operation> | molis-work home snapshot | molis-work v1 <operation>";
const AVAILABLE_COMMANDS = "install, service <operation>, demo <operation>, uninstall, plugin <operation>, home snapshot, v1 <operation>";

export async function dispatchCli(args: string[], ports: CliCommandPorts): Promise<number> {
  try {
    if (args[0] === "plugin") return await ports.plugin(args.slice(1));
    if (args[0] === "home") return await ports.home(args.slice(1));
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
      console.log(`${cliText("workbench.cli.help-commands", { commands: HELP_COMMANDS })}\n`);
      printV1Help();
      return 0;
    }
    if (args[0] === "install") return await ports.install(args);
    if (args[0] === "service") return await ports.service(args);
    if (args[0] === "demo") return await ports.demo(args);
    if (args[0] === "uninstall") return await ports.uninstall(args);
    if (args[0] !== "v1") {
      throw new Error(cliText("workbench.cli.unknown-command", { command: args[0] ?? "", commands: AVAILABLE_COMMANDS }));
    }
    return await ports.v1(args.slice(1));
  } catch (error) {
    console.error(cliText("workbench.cli.error-prefix", { message: error instanceof Error ? error.message : String(error) }));
    return 1;
  }
}

import { printV1Help } from "./protocol.js";

export interface CliCommandPorts {
  plugin(args: string[]): Promise<number>;
  install(args: string[]): Promise<number>;
  service(args: string[]): Promise<number>;
  demo(args: string[]): Promise<number>;
  uninstall(args: string[]): Promise<number>;
  v1(args: string[]): Promise<number>;
}

export async function dispatchCli(args: string[], ports: CliCommandPorts): Promise<number> {
  try {
    if (args[0] === "plugin") return ports.plugin(args.slice(1));
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
      console.log("Molis Work commands: molis-work install | molis-work service <operation> | molis-work demo <operation> | molis-work uninstall | molis-work plugin <operation> | molis-work v1 <operation>\n");
      printV1Help();
      return 0;
    }
    if (args[0] === "install") return await ports.install(args);
    if (args[0] === "service") return await ports.service(args);
    if (args[0] === "demo") return await ports.demo(args);
    if (args[0] === "uninstall") return await ports.uninstall(args);
    if (args[0] !== "v1") {
      throw new Error(`未知命令: ${args[0]}。Molis Work 提供 install、service、demo、uninstall 和 v1 <operation>。`);
    }
    return await ports.v1(args.slice(1));
  } catch (error) {
    console.error(`错误: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

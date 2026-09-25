export const V1_COMMON = {
  database_path: { type: "string", description: "管理入口使用的共享 SQLite 文件路径" },
  board_id: { type: "string" },
};

export const V1_STRING = { type: "string" };
export function v1PayloadTool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        payload: { type: "object", properties, required },
      },
      required: ["board_id", "payload"],
    },
  };
}

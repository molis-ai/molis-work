import { createHash } from "node:crypto";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ImInviteState } from "@molis-ai/molis-work-contracts/services/im";
import { ImError } from "./errors.js";
import type { ImReads } from "./reads.js";
import type { ImDatabase, ImEvents } from "./types.js";

const errors = defineErrorCodes("im.invite", { invalid_token: "invalid", token_conflict: "conflict" });

/** Validate a current generation intent once. Joining also accepts pre-maintenance links. */
export function invitationTokenHash(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) throw errors.invalid_token("请使用本次生成的安全随机邀请令牌");
  return createHash("sha256").update(value).digest("hex");
}

export class ImInvites {
  constructor(private readonly db: ImDatabase, private readonly reads: ImReads, private readonly events: ImEvents) {}

  /** Called inside the mutation's transaction before even looking for an existing receipt. */
  state(roomId: string, memberId: string): ImInviteState {
    this.reads.assertMember(roomId, memberId);
    const room = this.reads.room(roomId);
    if (room.project_id) throw new ImError("im.project_invite", "成员由项目权限统一管理", 403);
    if (room.owner_id !== memberId) throw new ImError("im.owner_required", "只有群创建者可以管理邀请链接", 403);
    const row = this.db.prepare<unknown[], { invite_token_hash: string | null }>("SELECT invite_token_hash FROM im_rooms WHERE id=?").get(roomId)!;
    return { room_id: roomId, token_hash: row.invite_token_hash };
  }

  /** The route's current-owner guard runs inside the same transaction before this effect or a replay. */
  rotate(roomId: string, tokenHash: string): ImInviteState {
    if (this.db.prepare("SELECT 1 FROM im_rooms WHERE invite_token_hash=? AND id<>?").get(tokenHash, roomId)) {
      throw errors.token_conflict("这个邀请令牌已被使用，请明确生成另一条链接");
    }
    this.db.prepare("UPDATE im_rooms SET invite_token_hash=? WHERE id=?").run(tokenHash, roomId);
    this.events.append({ scopeKind: "room", scopeId: roomId, kind: "invite", entityId: roomId });
    return { room_id: roomId, token_hash: tokenHash };
  }
}

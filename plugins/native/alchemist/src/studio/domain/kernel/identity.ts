export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type WorkspaceId = Brand<string, "WorkspaceId">;
export type ActorId = Brand<string, "ActorId">;

export interface IdFactory {
  next(prefix: string): string;
}

export interface Clock {
  now(): string;
}

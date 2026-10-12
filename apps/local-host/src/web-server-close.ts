import type { Server } from "node:http";

/** Closing the listener is not enough: the caller may exit or remove its Home as soon as the callback runs. */
export function awaitWebServerShutdown(server: Server, stopStreams: () => void, disposeOwned: () => Promise<void>): void {
  const close = server.close.bind(server);
  let disposal: Promise<void> | undefined;
  server.close = callback => {
    stopStreams();
    return close(error => {
      disposal ??= Promise.resolve().then(disposeOwned);
      void disposal.then(() => callback?.(error), reason => {
        const failure = reason instanceof Error ? reason : new Error(String(reason));
        if (callback) callback(failure);
        else server.emit("error", failure);
      });
    });
  };
}

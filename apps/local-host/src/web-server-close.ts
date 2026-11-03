import type { Server } from "node:http";

/** Closing the listener is not enough: the caller may exit or remove its Home as soon as the callback runs. */
export function awaitWebServerShutdown(server: Server, stopStreams: () => void, disposeTransport: () => Promise<void>,
  disposeOwner: () => Promise<void> = async () => undefined): () => Promise<void> {
  const close = server.close.bind(server);
  let listenerClosed = false, disposal: Promise<void> | undefined;
  const shutdown = () => disposal ??= (async () => {
    stopStreams();
    if (!listenerClosed) await new Promise<void>((resolve, reject) => close(error => {
      if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") { reject(error); return; }
      listenerClosed = true; resolve();
    }));
    await disposeTransport();
  })().catch(error => { disposal = undefined; throw error; });
  server.close = callback => {
    void shutdown().then(disposeOwner).then(() => callback?.(), reason => {
      const failure = reason instanceof Error ? reason : new Error(String(reason));
      if (callback) callback(failure);
      else server.emit("error", failure);
    });
    return server;
  };
  return shutdown;
}

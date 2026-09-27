/** Coalesce bursts, never overlap reads, and pause all background reads off-screen. */
export function createLiveRefresh(refresh: () => Promise<unknown>, visible: () => boolean, refreshOnInitialSubscribe = true) {
  let closed = false;
  let hasSubscribed = false;
  let connected = false;
  let running = false;
  let dirty = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  function schedule() {
    clearTimeout(heartbeat);
    if (!closed) heartbeat = setTimeout(() => { request(); schedule(); }, connected ? 60_000 : 15_000);
  }
  async function run() {
    debounce = undefined;
    if (closed || !visible()) return;
    if (running) { dirty = true; return; }
    running = true;
    try {
      do {
        dirty = false;
        await refresh();
      } while (dirty && !closed && visible());
    } catch { /* Consumers surface read errors; the next event/reconnect retries. */ }
    finally { running = false; }
  }
  function request() {
    if (closed || !visible()) return;
    if (running) { dirty = true; return; }
    if (!debounce) debounce = setTimeout(() => { void run(); }, 100);
  }
  schedule();
  return {
    request,
    connection(status: string) { connected = status === 'SUBSCRIBED'; schedule(); if (connected) { if (hasSubscribed || refreshOnInitialSubscribe) request(); hasSubscribed = true; } },
    close() { closed = true; clearTimeout(heartbeat); clearTimeout(debounce); },
  };
}

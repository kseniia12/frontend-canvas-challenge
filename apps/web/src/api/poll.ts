export function isTerminalStatus(status: string): boolean {
  return status === 'succeeded' || status === 'failed';
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function pollUntil<T>(options: {
  read: (signal?: AbortSignal) => Promise<T>;
  done: (value: T) => boolean;
  intervalMs: number;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
}): Promise<T> {
  const interval = options.intervalMs > 200 ? options.intervalMs : 200;
  for (;;) {
    if (options.signal?.aborted || options.isCurrent?.() === false) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const value = await options.read(options.signal);
    if (options.done(value)) return value;
    await sleep(interval, options.signal);
  }
}

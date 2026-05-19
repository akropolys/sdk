type RouteChangeCallback = (url: string) => void;

export class RouteObserver {
  private callbacks: RouteChangeCallback[] = [];
  private current = window.location.href;

  constructor() {
    this.patchHistory();
    window.addEventListener('popstate', () => this.notify());
  }

  private patchHistory() {
    const notify = () => this.notify();
    const wrap = (original: typeof history.pushState) =>
      function (this: History, ...args: Parameters<typeof history.pushState>) {
        original.apply(this, args);
        notify();
      };
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
  }

  private notify() {
    const next = window.location.href;
    if (next !== this.current) {
      this.current = next;
      this.callbacks.forEach(cb => cb(next));
    }
  }

  onChange(cb: RouteChangeCallback) {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter(fn => fn !== cb);
    };
  }

  destroy() {
    this.callbacks = [];
  }
}

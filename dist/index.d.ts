// Types for the WallCast Apps SDK (window.wallcast).

export interface WallcastScreen {
  id: string | null;
  name: string;
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait';
  locale: string;
  timezone: string;
  tags: string[];
  location?: { city?: string; country?: string } | null;
}

export interface WallcastContext {
  mode: 'screen' | 'preview' | 'dev';
  app: { id: string; name: string; version: string | null; kind: 'bundle' | 'url' | 'data' };
  screen: WallcastScreen;
  config: Record<string, unknown>;
  visible: boolean;
}

export interface WallcastDataResult<T = unknown> {
  status: number;
  contentType: string;
  body: T;
  fetchedAt: string;
  stale: boolean;
}

export interface WallcastFetchResponse {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  body: unknown;
  json<T = unknown>(): Promise<T>;
  text(): Promise<string>;
}

export interface WallcastStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

type Listener<A extends unknown[]> = (...args: A) => void;

export interface WallcastEvents {
  ready: [WallcastContext];
  config: [Record<string, unknown>];
  visible: [];
  hidden: [];
  unload: [];
  message: [unknown, { sentAt: string | null }];
  done: [];
}

export interface Wallcast {
  readonly version: string;
  readonly mode: WallcastContext['mode'];
  readonly app: WallcastContext['app'];
  readonly screen: WallcastScreen;
  readonly config: Record<string, unknown>;
  /** The app's own box (its zone, or the whole screen). Lay out by this; `screen` is the screen it is on. */
  readonly frame: { width: number; height: number; orientation: 'landscape' | 'portrait' };
  ready(): Promise<WallcastContext>;
  on<K extends keyof WallcastEvents>(type: K, fn: Listener<WallcastEvents[K]>): () => void;
  off<K extends keyof WallcastEvents>(type: K, fn: Listener<WallcastEvents[K]>): void;
  once<K extends keyof WallcastEvents>(type: K, fn: Listener<WallcastEvents[K]>): () => void;
  data: { fetch<T = unknown>(source: string, params?: Record<string, string | number | boolean>): Promise<WallcastDataResult<T>> };
  fetch(url: string, init?: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: unknown }): Promise<WallcastFetchResponse>;
  storage: WallcastStorage & { shared: WallcastStorage };
  assets: { url(remoteUrl: string): Promise<string> };
  speech: { say(text: string, options?: { lang?: string; volume?: number; rate?: number }): Promise<void> };
  playback: { ready(): void; deferReady(): void; done(): void; readonly visible: boolean };
  log: { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void };
  dev: { emit(type: keyof WallcastEvents | string, data?: unknown): void; setVisible(visible: boolean): void };
}

declare const wallcast: Wallcast;
export default wallcast;
export { wallcast };

declare global {
  interface Window {
    wallcast: Wallcast;
  }
}

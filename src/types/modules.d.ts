/**
 * Type declarations for external modules without types
 */

declare module '@musistudio/llms' {
  import type { FastifyInstance, FastifyBaseLogger, FastifyRequest, FastifyReply } from 'fastify';

  // Hook handler types for @musistudio/llms Server
  type PreHandlerHook = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  type OnSendHook = (
    req: FastifyRequest,
    reply: FastifyReply,
    payload: unknown,
    done: (err: Error | null, payload: unknown) => void
  ) => void;
  type OnSendAsyncHook = (
    req: FastifyRequest,
    reply: FastifyReply,
    payload: unknown
  ) => Promise<unknown>;
  type OnErrorHook = (request: FastifyRequest, reply: FastifyReply, error: Error) => Promise<void>;

  interface LLMServerOptions {
    jsonPath?: string;
    initialConfig?: Record<string, unknown>;
    logger?: boolean | { level: string; stream: NodeJS.WritableStream } | false;
  }

  interface LLMServerApp extends FastifyInstance {
    _server?: {
      transformerService: {
        getAllTransformers(): Map<string, unknown>;
      };
    };
  }

  class Server {
    constructor(options: LLMServerOptions);
    app: LLMServerApp;
    logger: FastifyBaseLogger;
    start(): Promise<void>;
    addHook(name: 'preHandler', handler: PreHandlerHook): void;
    addHook(name: 'onSend', handler: OnSendHook | OnSendAsyncHook): void;
    addHook(name: 'onError', handler: OnErrorHook): void;
  }

  export default Server;
  export { Server, LLMServerOptions };
}

declare module 'rotating-file-stream' {
  import type { Writable } from 'stream';

  interface Options {
    path?: string;
    maxFiles?: number;
    interval?: string;
    compress?: boolean | string;
    maxSize?: string;
    size?: string;
    rotate?: number;
  }

  type Generator = (time: Date | number, index?: number) => string;

  export function createStream(
    filenameOrGenerator: string | Generator,
    options?: Options
  ): Writable;
}

declare module 'bun:sqlite' {
  export class Database {
    constructor(filename: string, options?: { create?: boolean; readonly?: boolean; readwrite?: boolean });
    close(): void;
    exec(sql: string): void;
    prepare<T = unknown>(sql: string): Statement<T>;
    query<T = unknown>(sql: string): Statement<T>;
    transaction<T>(fn: () => T): () => T;
  }

  export class Statement<T = unknown> {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number };
    get(...params: unknown[]): T | null;
    all(...params: unknown[]): T[];
    values(...params: unknown[]): unknown[][];
    finalize(): void;
  }
}

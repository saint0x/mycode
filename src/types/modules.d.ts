/**
 * Type declarations for external modules without types
 */

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

/**
 * Production-ready Server implementation using Hono
 * Replaces @musistudio/llms with our own implementation
 *
 * This provides:
 * - Lightweight Hono-based HTTP server
 * - Fastify-compatible hooks system
 * - Provider routing for LLM requests
 * - Full control over the implementation
 */

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import type { ProviderConfig } from '../config/schema';

/**
 * Server configuration interface
 */
export interface ServerConfig {
  jsonPath: string;
  initialConfig: {
    providers: ProviderConfig[];
    HOST: string;
    PORT: number;
    LOG_FILE: string;
  };
  logger?: any | false;
}

/**
 * Fastify-compatible request object for hooks
 */
export interface HookRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, string>;
  log: any;
  [key: string]: any;  // Allow additional properties
}

/**
 * Fastify-compatible reply object for hooks
 */
export interface HookReply {
  code: (statusCode: number) => HookReply;
  status: (statusCode: number) => HookReply;
  send: (payload: any) => HookReply;
  header: (key: string, value: string) => HookReply;
  getHeaders: () => Record<string, string>;
  statusCode: number;
  [key: string]: any;  // Allow additional properties
}

/**
 * Hook handler types
 */
type PreHandlerHook = (req: HookRequest, reply: HookReply, done: (err?: Error) => void) => Promise<void> | void;
type OnSendHook = (req: HookRequest, reply: HookReply, payload: any, done: (err: Error | null, payload: any) => void) => void;
type OnSendAsyncHook = (req: HookRequest, reply: HookReply, payload: any) => Promise<any>;
type OnErrorHook = (request: HookRequest, reply: HookReply, error: Error) => Promise<void>;

/**
 * Main Server class
 */
export class Server {
  public app: Hono;
  public logger: any;
  public config: ServerConfig;

  private hooks: {
    preHandler: PreHandlerHook[];
    onSend: Array<OnSendHook | OnSendAsyncHook>;
    onError: OnErrorHook[];
  };

  constructor(config: ServerConfig) {
    this.config = config;
    this.app = new Hono();

    // Create Fastify-compatible logger
    const baseLogger = config.logger || console;
    this.logger = {
      info: (...args: unknown[]) => baseLogger.info?.(...args) || baseLogger.log?.(...args) || console.log(...args),
      error: (...args: unknown[]) => baseLogger.error?.(...args) || console.error(...args),
      warn: (...args: unknown[]) => baseLogger.warn?.(...args) || console.warn(...args),
      debug: (...args: unknown[]) => baseLogger.debug?.(...args) || baseLogger.log?.(...args) || console.log(...args),
      trace: (...args: unknown[]) => baseLogger.trace?.(...args) || baseLogger.log?.(...args) || console.log(...args),
      fatal: (...args: unknown[]) => baseLogger.fatal?.(...args) || baseLogger.error?.(...args) || console.error(...args),
      child: () => this.logger,
    };

    this.hooks = {
      preHandler: [],
      onSend: [],
      onError: []
    };

    // Setup CORS
    this.app.use('*', cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'anthropic-version'],
      exposeHeaders: ['Content-Length'],
      maxAge: 86400,
      credentials: true,
    }));

    // Setup hook execution middleware
    this.setupHookMiddleware();
  }

  /**
   * Add a hook (Fastify-compatible interface)
   */
  addHook(name: 'preHandler', handler: PreHandlerHook): void;
  addHook(name: 'onSend', handler: OnSendHook | OnSendAsyncHook): void;
  addHook(name: 'onError', handler: OnErrorHook): void;
  addHook(name: string, handler: any): void {
    if (name in this.hooks) {
      this.hooks[name as keyof typeof this.hooks].push(handler);
    } else {
      throw new Error(`Unknown hook type: ${name}`);
    }
  }

  /**
   * Setup middleware to execute hooks
   */
  private setupHookMiddleware() {
    // PreHandler hooks - execute before route handlers
    this.app.use('*', async (c, next) => {
      // Parse body for POST requests before hooks run
      if (c.req.method === 'POST' && !((c.req as unknown as { bodyCache?: unknown }).bodyCache)) {
        try {
          const body = await c.req.json();
          (c.req as unknown as { bodyCache: unknown }).bodyCache = body;
        } catch {
          // Not JSON or no body, continue without parsing
        }
      }

      // Convert Hono context to Fastify-like request/reply
      const { req, reply } = this.createHookObjects(c);

      try {
        // Execute all preHandler hooks sequentially
        for (const hook of this.hooks.preHandler) {
          await Promise.race([
            new Promise<void>((resolve, reject) => {
              let settled = false;

              const done = (err?: Error) => {
                if (settled) return; // Prevent double-call
                settled = true;
                if (err) reject(err);
                else resolve();
              };

              try {
                const result = hook(req, reply, done);

                // If hook returns a promise, wait for it
                if (result instanceof Promise) {
                  result.then(() => {
                    if (!settled) {
                      settled = true;
                      resolve();
                    }
                  }).catch(reject);
                }
              } catch (err) {
                if (!settled) {
                  settled = true;
                  reject(err);
                }
              }
            }),
            new Promise<void>((_, reject) =>
              setTimeout(() => {
                const hookName = hook.name || 'anonymous';
                reject(new Error(`Hook timeout after 5000ms: ${hookName}`));
              }, 5000)
            )
          ]);
        }

        // Continue to next middleware/route
        await next();

      } catch (error) {
        // Execute onError hooks
        for (const errorHook of this.hooks.onError) {
          try {
            await errorHook(req, reply, error as Error);
          } catch (hookError) {
            this.logger.error('Error in onError hook:', hookError);
          }
        }

        // Return error response
        return c.json({ error: (error as Error).message }, 500);
      }
    });

    // OnSend hooks - execute after route handlers
    this.app.use('*', async (c, next) => {
      await next();

      // Only execute onSend hooks if there are any
      if (this.hooks.onSend.length === 0) return;

      const { req, reply } = this.createHookObjects(c);
      let payload = await c.res.clone().text();

      try {
        // Try to parse as JSON
        payload = JSON.parse(payload);
      } catch {
        // Keep as text if not JSON
      }

      // Execute all onSend hooks
      for (const hook of this.hooks.onSend) {
        try {
          // Check if it's an async hook (returns promise)
          const result = hook(req, reply, payload, (err, newPayload) => {
            if (err) throw err;
            payload = newPayload;
          });

          if (result instanceof Promise) {
            payload = await result || payload;
          }
        } catch (error) {
          this.logger.error('Error in onSend hook:', error);
        }
      }
    });
  }

  /**
   * Create Fastify-compatible request and reply objects from Hono context
   */
  private createHookObjects(c: Context): { req: HookRequest; reply: HookReply } {
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const req: HookRequest = {
      url: new URL(c.req.url).pathname,  // Use pathname only, not full URL
      method: c.req.method,
      headers,
      body: (c.req as unknown as { bodyCache?: unknown }).bodyCache,
      params: c.req.param(),
      query: Object.fromEntries(new URL(c.req.url).searchParams.entries()),
      log: this.logger,
    };

    let responseHeaders: Record<string, string> = {};
    let statusCode = 200;

    const reply: HookReply = {
      code: (code: number) => {
        statusCode = code;
        return reply;
      },
      status: (code: number) => {
        statusCode = code;
        return reply;
      },
      send: (payload: any) => {
        c.status(statusCode as any);
        Object.entries(responseHeaders).forEach(([key, value]) => {
          c.header(key, value);
        });

        if (typeof payload === 'object') {
          c.json(payload);
        } else {
          c.text(payload);
        }
        return reply;
      },
      header: (key: string, value: string) => {
        responseHeaders[key] = value;
        return reply;
      },
      getHeaders: () => responseHeaders,
      statusCode,
    };

    return { req, reply };
  }

  /**
   * Start the server (for compatibility, but we'll use listen() directly)
   */
  async start(): Promise<void> {
    const { HOST, PORT } = this.config.initialConfig;

    return new Promise((resolve, reject) => {
      try {
        serve({
          fetch: this.app.fetch,
          hostname: HOST,
          port: PORT,
        }, (info) => {
          this.logger.info?.(`Server listening on http://${info.address}:${info.port}`) ||
            console.log(`Server listening on http://${info.address}:${info.port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

export default Server;

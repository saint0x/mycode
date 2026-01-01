/**
 * CCR Request/Reply type extensions
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RequestAnalysis } from '../context/types';

// Extended request interface for CCR
export interface CCRRequest extends FastifyRequest {
  sessionId?: string;
  projectPath?: string;
  agents?: string[];
  contextAnalysis?: RequestAnalysis;
  routeInfo?: {
    provider?: string;
    model?: string;
  };
  body: Record<string, unknown> & {
    messages?: Array<{ role: string; content: unknown }>;
    tools?: Array<{ name: string; description: string; input_schema: unknown }>;
    system?: string;
  };
}

export interface CCRReply extends FastifyReply {
  // Extended reply methods if needed
}

export interface CCRConfig {
  Memory?: {
    enabled?: boolean;
    dbPath?: string;
    debugMode?: boolean;
    autoInject?: {
      global?: boolean;
      project?: boolean;
      maxMemories?: number;
      maxTokens?: number;
    };
    autoExtract?: boolean;
    retention?: {
      minImportance?: number;
      maxAgeDays?: number;
      cleanupIntervalMs?: number;
    };
    embedding?: {
      provider?: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };
  };
  Hooks?: {
    enabled?: boolean;
    directory?: string;
  };
  Plugins?: {
    enabled?: boolean;
    autoload?: boolean;
    directory?: string;
  };
  Skills?: {
    enabled?: boolean;
    directory?: string;
  };
  HOST?: string;
  PORT?: number;
  APIKEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  LOG?: boolean;
  LOG_LEVEL?: string;
  Providers?: unknown[];
  providers?: unknown[];
  [key: string]: unknown;
}

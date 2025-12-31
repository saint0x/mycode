/**
 * Embedding Providers
 * OpenAI, Ollama, and local fallback for vector embeddings
 */

import OpenAI from 'openai';
import type { EmbeddingProvider, MemoryConfig } from './types';
import {
  EmbeddingError,
  ErrorCode,
  wrapEmbeddingError,
  executeWithRetry,
  isRateLimitError,
} from '../errors';

// Simple LRU cache for embeddings
class EmbeddingCache {
  private cache = new Map<string, { embedding: Float32Array; timestamp: number }>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize = 2000, ttlMs = 1000 * 60 * 60) { // 1 hour TTL
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): Float32Array | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.embedding;
  }

  set(key: string, embedding: Float32Array): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { embedding, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

const embeddingCache = new EmbeddingCache();

/**
 * Create embedding provider based on config
 */
export function createEmbeddingProvider(config: MemoryConfig['embedding']): EmbeddingProvider {
  try {
    switch (config.provider) {
      case 'openai':
        // Only create OpenAI provider if API key is available
        if (config.apiKey || process.env.OPENAI_API_KEY) {
          return new OpenAIEmbeddingProvider(config);
        }
        // Fall back to local if no API key (with warning)
        console.warn('[EmbeddingProvider] No OpenAI API key found, falling back to local embeddings');
        return new LocalEmbeddingProvider();
      case 'ollama':
        return new OllamaEmbeddingProvider(config);
      case 'local':
        return new LocalEmbeddingProvider();
      default:
        console.warn(`[EmbeddingProvider] Unknown provider '${config.provider}', falling back to local embeddings`);
        return new LocalEmbeddingProvider();
    }
  } catch (error) {
    throw new EmbeddingError(
      `Failed to create embedding provider: ${error instanceof Error ? error.message : String(error)}`,
      {
        code: ErrorCode.EMBEDDING_INIT_FAILED,
        provider: config.provider,
        operation: 'create_provider',
        cause: error instanceof Error ? error : undefined,
        details: {
          model: config.model,
          hasApiKey: !!(config.apiKey || process.env.OPENAI_API_KEY),
        },
      }
    );
  }
}

/**
 * OpenAI Embedding Provider
 * Uses text-embedding-3-small by default (1536 dimensions)
 */
class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = 'openai';
  dimensions: number;

  private client: OpenAI;
  private model: string;
  private maxRetries = 3;
  private retryDelayMs = 1000;

  constructor(config: MemoryConfig['embedding']) {
    try {
      this.client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
    } catch (error) {
      throw new EmbeddingError(
        `Failed to initialize OpenAI client: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: ErrorCode.EMBEDDING_INIT_FAILED,
          provider: 'openai',
          operation: 'init_client',
          cause: error instanceof Error ? error : undefined,
        }
      );
    }

    this.model = config.model || 'text-embedding-3-small';

    // Set dimensions based on model
    if (this.model === 'text-embedding-3-large') {
      this.dimensions = 3072;
    } else if (this.model === 'text-embedding-ada-002') {
      this.dimensions = 1536;
    } else {
      this.dimensions = 1536; // text-embedding-3-small
    }
  }

  async embed(text: string): Promise<Float32Array> {
    if (!text || text.trim().length === 0) {
      throw new EmbeddingError('Cannot embed empty text', {
        code: ErrorCode.EMBEDDING_DIMENSION_MISMATCH,
        provider: 'openai',
        operation: 'embed',
        details: { textLength: 0 },
      });
    }

    const cacheKey = `${this.model}:${text}`;
    const cached = embeddingCache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await executeWithRetry(
        async () => this.client.embeddings.create({
          model: this.model,
          input: text,
          encoding_format: 'float',
        }),
        {
          maxRetries: this.maxRetries,
          delayMs: this.retryDelayMs,
          backoffMultiplier: 2,
          shouldRetry: (error) => {
            // Retry on rate limits and transient errors
            return isRateLimitError(error) ||
              (error instanceof Error && (
                error.message.includes('timeout') ||
                error.message.includes('ECONNRESET') ||
                error.message.includes('503')
              ));
          },
          onRetry: (error, attempt) => {
            console.warn(`[OpenAIEmbedding] Retry ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
          },
        }
      );

      if (!response.data?.[0]?.embedding) {
        throw new EmbeddingError('OpenAI returned empty embedding response', {
          code: ErrorCode.EMBEDDING_API_ERROR,
          provider: 'openai',
          operation: 'embed',
          details: { model: this.model, hasData: !!response.data },
        });
      }

      const embedding = new Float32Array(response.data[0].embedding);
      embeddingCache.set(cacheKey, embedding);
      return embedding;
    } catch (error) {
      // Re-throw if already an EmbeddingError
      if (error instanceof EmbeddingError) throw error;

      throw wrapEmbeddingError(error, 'openai', 'embed', {
        model: this.model,
        textLength: text.length,
      });
    }
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    // Check cache for each text
    const results: (Float32Array | null)[] = [];
    const uncached: { index: number; text: string }[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cacheKey = `${this.model}:${texts[i]}`;
      const cached = embeddingCache.get(cacheKey);
      if (cached) {
        results[i] = cached;
      } else {
        results[i] = null;
        uncached.push({ index: i, text: texts[i] });
      }
    }

    // Fetch uncached embeddings
    if (uncached.length > 0) {
      try {
        const response = await executeWithRetry(
          async () => this.client.embeddings.create({
            model: this.model,
            input: uncached.map(u => u.text),
            encoding_format: 'float',
          }),
          {
            maxRetries: this.maxRetries,
            delayMs: this.retryDelayMs,
            backoffMultiplier: 2,
            shouldRetry: (error) => isRateLimitError(error),
            onRetry: (error, attempt) => {
              console.warn(`[OpenAIEmbedding] Batch retry ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
            },
          }
        );

        if (!response.data || response.data.length !== uncached.length) {
          throw new EmbeddingError(
            `OpenAI returned mismatched batch size: expected ${uncached.length}, got ${response.data?.length ?? 0}`,
            {
              code: ErrorCode.EMBEDDING_API_ERROR,
              provider: 'openai',
              operation: 'embed_batch',
              details: { expected: uncached.length, received: response.data?.length ?? 0 },
            }
          );
        }

        for (let i = 0; i < response.data.length; i++) {
          const embedding = new Float32Array(response.data[i].embedding);
          const { index, text } = uncached[i];
          results[index] = embedding;
          embeddingCache.set(`${this.model}:${text}`, embedding);
        }
      } catch (error) {
        if (error instanceof EmbeddingError) throw error;

        throw wrapEmbeddingError(error, 'openai', 'embed_batch', {
          model: this.model,
          batchSize: uncached.length,
        });
      }
    }

    return results as Float32Array[];
  }
}

/**
 * Ollama Embedding Provider
 * Uses nomic-embed-text by default (768 dimensions)
 */
class OllamaEmbeddingProvider implements EmbeddingProvider {
  name = 'ollama';
  dimensions = 768;

  private baseUrl: string;
  private model: string;
  private maxRetries = 3;
  private retryDelayMs = 500;
  private timeoutMs = 30000;

  constructor(config: MemoryConfig['embedding']) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'nomic-embed-text';
  }

  async embed(text: string): Promise<Float32Array> {
    if (!text || text.trim().length === 0) {
      throw new EmbeddingError('Cannot embed empty text', {
        code: ErrorCode.EMBEDDING_DIMENSION_MISMATCH,
        provider: 'ollama',
        operation: 'embed',
        details: { textLength: 0 },
      });
    }

    const cacheKey = `ollama:${this.model}:${text}`;
    const cached = embeddingCache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await executeWithRetry(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

          try {
            const res = await fetch(`${this.baseUrl}/api/embeddings`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: this.model, prompt: text }),
              signal: controller.signal,
            });

            if (!res.ok) {
              const errorText = await res.text().catch(() => res.statusText);
              throw new EmbeddingError(
                `Ollama API error: ${res.status} ${errorText}`,
                {
                  code: res.status === 429 ? ErrorCode.EMBEDDING_RATE_LIMITED : ErrorCode.EMBEDDING_API_ERROR,
                  provider: 'ollama',
                  operation: 'embed',
                  details: { status: res.status, model: this.model },
                }
              );
            }

            return res;
          } finally {
            clearTimeout(timeoutId);
          }
        },
        {
          maxRetries: this.maxRetries,
          delayMs: this.retryDelayMs,
          backoffMultiplier: 2,
          shouldRetry: (error) => {
            if (error instanceof Error) {
              return error.message.includes('ECONNREFUSED') ||
                     error.message.includes('ECONNRESET') ||
                     error.message.includes('fetch failed') ||
                     error.name === 'AbortError';
            }
            return false;
          },
          onRetry: (error, attempt) => {
            console.warn(`[OllamaEmbedding] Retry ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
          },
        }
      );

      const data = await response.json();

      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new EmbeddingError('Ollama returned invalid embedding response', {
          code: ErrorCode.EMBEDDING_API_ERROR,
          provider: 'ollama',
          operation: 'embed',
          details: { model: this.model, hasEmbedding: !!data.embedding },
        });
      }

      const embedding = new Float32Array(data.embedding);
      embeddingCache.set(cacheKey, embedding);
      return embedding;
    } catch (error) {
      if (error instanceof EmbeddingError) throw error;

      // Handle specific connection errors with helpful messages
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new EmbeddingError(
          `Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running?`,
          {
            code: ErrorCode.EMBEDDING_NETWORK_ERROR,
            provider: 'ollama',
            operation: 'embed',
            cause: error,
            details: { baseUrl: this.baseUrl, model: this.model },
          }
        );
      }

      throw wrapEmbeddingError(error, 'ollama', 'embed', {
        model: this.model,
        textLength: text.length,
        baseUrl: this.baseUrl,
      });
    }
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    // Ollama doesn't support batch, parallelize individual requests with error collection
    const results: Float32Array[] = [];
    const errors: string[] = [];

    // Process in parallel but collect errors
    const promises = texts.map(async (text, index) => {
      try {
        const embedding = await this.embed(text);
        return { index, embedding, error: null };
      } catch (error) {
        return { index, embedding: null, error: error instanceof Error ? error.message : String(error) };
      }
    });

    const outcomes = await Promise.all(promises);

    for (const outcome of outcomes) {
      if (outcome.embedding) {
        results[outcome.index] = outcome.embedding;
      } else {
        errors.push(`[${outcome.index}]: ${outcome.error}`);
        // Fill with zero vector to maintain array positions
        results[outcome.index] = new Float32Array(this.dimensions);
      }
    }

    if (errors.length > 0 && errors.length === texts.length) {
      // All failed
      throw new EmbeddingError(
        `All batch embeddings failed: ${errors[0]}`,
        {
          code: ErrorCode.EMBEDDING_API_ERROR,
          provider: 'ollama',
          operation: 'embed_batch',
          details: { batchSize: texts.length, errorCount: errors.length },
        }
      );
    }

    if (errors.length > 0) {
      console.warn(`[OllamaEmbedding] ${errors.length}/${texts.length} batch embeddings failed:`, errors.slice(0, 3));
    }

    return results;
  }
}

/**
 * Local Embedding Provider
 * Simple hash-based embedding for testing/offline use
 * NOT suitable for production semantic search
 */
class LocalEmbeddingProvider implements EmbeddingProvider {
  name = 'local';
  dimensions = 384;

  async embed(text: string): Promise<Float32Array> {
    const embedding = new Float32Array(this.dimensions);
    const words = text.toLowerCase().split(/\s+/);

    for (const word of words) {
      for (let i = 0; i < word.length; i++) {
        const idx = (word.charCodeAt(i) * (i + 1)) % this.dimensions;
        embedding[idx] += 1;
      }
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((a, b) => a + b * b, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
}

/**
 * Cosine similarity between two embeddings
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

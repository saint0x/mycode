/**
 * Embedding Providers
 * OpenAI, Ollama, and local fallback for vector embeddings
 */

import OpenAI from 'openai';
import type { EmbeddingProvider, MemoryConfig } from './types';

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
  switch (config.provider) {
    case 'openai':
      // Only create OpenAI provider if API key is available
      if (config.apiKey || process.env.OPENAI_API_KEY) {
        return new OpenAIEmbeddingProvider(config);
      }
      // Fall back to local if no API key
      return new LocalEmbeddingProvider();
    case 'ollama':
      return new OllamaEmbeddingProvider(config);
    case 'local':
      return new LocalEmbeddingProvider();
    default:
      // Default to local for unknown providers
      return new LocalEmbeddingProvider();
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

  constructor(config: MemoryConfig['embedding']) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
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
    const cacheKey = `${this.model}:${text}`;
    const cached = embeddingCache.get(cacheKey);
    if (cached) return cached;

    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      encoding_format: 'float',
    });

    const embedding = new Float32Array(response.data[0].embedding);
    embeddingCache.set(cacheKey, embedding);
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
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
      const response = await this.client.embeddings.create({
        model: this.model,
        input: uncached.map(u => u.text),
        encoding_format: 'float',
      });

      for (let i = 0; i < response.data.length; i++) {
        const embedding = new Float32Array(response.data[i].embedding);
        const { index, text } = uncached[i];
        results[index] = embedding;
        embeddingCache.set(`${this.model}:${text}`, embedding);
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

  constructor(config: MemoryConfig['embedding']) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'nomic-embed-text';
  }

  async embed(text: string): Promise<Float32Array> {
    const cacheKey = `ollama:${this.model}:${text}`;
    const cached = embeddingCache.get(cacheKey);
    if (cached) return cached;

    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.statusText}`);
    }

    const data = await response.json();
    const embedding = new Float32Array(data.embedding);
    embeddingCache.set(cacheKey, embedding);
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Ollama doesn't support batch, parallelize individual requests
    return Promise.all(texts.map(t => this.embed(t)));
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

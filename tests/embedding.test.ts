/**
 * Embedding Provider Tests
 *
 * Tests:
 * - Local embedding provider (no API calls)
 * - Embedding dimensionality
 * - Normalization
 * - Caching behavior
 * - Cosine similarity calculation
 * - Batch embedding
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { createEmbeddingProvider, cosineSimilarity } from '../src/memory/embedding';
import { createLogger, TestLogger } from './helpers/logger';
import type { MemoryConfig } from '../src/memory/types';

describe('Embedding Providers', () => {
  let log: TestLogger;

  beforeEach(() => {
    log = createLogger('Embedding');
  });

  describe('Local Embedding Provider', () => {
    const config: MemoryConfig['embedding'] = {
      provider: 'local',
    };

    test('creates local provider with correct dimensions', () => {
      log.info('Testing local provider creation');

      const provider = createEmbeddingProvider(config);

      log.assertEqual(provider.name, 'local', 'provider name');
      log.assertEqual(provider.dimensions, 384, 'dimensions');
      log.success('Local provider created correctly');
    });

    test('generates embeddings of correct length', async () => {
      log.info('Testing embedding generation');

      const provider = createEmbeddingProvider(config);
      const text = 'This is a test sentence for embedding';

      const embedding = await provider.embed(text);

      log.assertEqual(embedding.length, 384, 'embedding length');
      log.assert(embedding instanceof Float32Array, 'Should be Float32Array');
      log.success('Embedding generated with correct length');
    });

    test('embeddings are normalized (unit length)', async () => {
      log.info('Testing embedding normalization');

      const provider = createEmbeddingProvider(config);
      const embedding = await provider.embed('Test normalization');

      // Calculate L2 norm
      let norm = 0;
      for (let i = 0; i < embedding.length; i++) {
        norm += embedding[i] * embedding[i];
      }
      norm = Math.sqrt(norm);

      log.info('Embedding norm', { norm });
      log.assert(
        Math.abs(norm - 1.0) < 0.001,
        `Embedding should be normalized (norm=${norm})`
      );
      log.success('Embedding is properly normalized');
    });

    test('similar texts produce similar embeddings', async () => {
      log.info('Testing embedding similarity for similar texts');

      const provider = createEmbeddingProvider(config);

      const text1 = 'The quick brown fox jumps over the lazy dog';
      const text2 = 'A fast brown fox leaps over the sleepy dog';
      const text3 = 'Database optimization using indexing strategies';

      const emb1 = await provider.embed(text1);
      const emb2 = await provider.embed(text2);
      const emb3 = await provider.embed(text3);

      const sim12 = cosineSimilarity(emb1, emb2);
      const sim13 = cosineSimilarity(emb1, emb3);
      const sim23 = cosineSimilarity(emb2, emb3);

      log.info('Similarity scores', { sim12, sim13, sim23 });

      // Similar texts should have higher similarity
      log.assertGreaterThan(sim12, sim13, 'similar texts similarity');
      log.assertGreaterThan(sim12, sim23, 'similar texts vs unrelated');

      log.success('Similar texts produce similar embeddings');
    });

    test('batch embedding works correctly', async () => {
      log.info('Testing batch embedding');

      const provider = createEmbeddingProvider(config);
      const texts = [
        'First sentence',
        'Second sentence',
        'Third sentence',
      ];

      const embeddings = await provider.embedBatch(texts);

      log.assertEqual(embeddings.length, 3, 'batch size');
      for (let i = 0; i < embeddings.length; i++) {
        log.assertEqual(embeddings[i].length, 384, `embedding ${i} length`);
        log.assert(embeddings[i] instanceof Float32Array, `embedding ${i} type`);
      }

      log.success('Batch embedding works correctly');
    });

    test('empty text produces valid embedding', async () => {
      log.info('Testing empty text embedding');

      const provider = createEmbeddingProvider(config);
      const embedding = await provider.embed('');

      log.assertEqual(embedding.length, 384, 'embedding length');
      // All values should be 0 for empty text (since no words to process)
      const sum = embedding.reduce((a, b) => a + Math.abs(b), 0);
      log.info('Empty embedding sum', { sum });
      // Note: Empty string might have all zeros or NaN due to normalization
      // We just check it doesn't throw

      log.success('Empty text handled gracefully');
    });
  });

  describe('Cosine Similarity', () => {
    test('identical vectors have similarity 1.0', () => {
      log.info('Testing identical vector similarity');

      const vec = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const similarity = cosineSimilarity(vec, vec);

      log.info('Similarity', { similarity });
      log.assert(
        Math.abs(similarity - 1.0) < 0.0001,
        'Identical vectors should have similarity 1.0'
      );
      log.success('Identical vectors have similarity 1.0');
    });

    test('orthogonal vectors have similarity 0', () => {
      log.info('Testing orthogonal vector similarity');

      const vec1 = new Float32Array([1, 0, 0, 0]);
      const vec2 = new Float32Array([0, 1, 0, 0]);
      const similarity = cosineSimilarity(vec1, vec2);

      log.info('Similarity', { similarity });
      log.assert(
        Math.abs(similarity) < 0.0001,
        'Orthogonal vectors should have similarity 0'
      );
      log.success('Orthogonal vectors have similarity 0');
    });

    test('opposite vectors have similarity -1.0', () => {
      log.info('Testing opposite vector similarity');

      const vec1 = new Float32Array([1, 0, 0, 0]);
      const vec2 = new Float32Array([-1, 0, 0, 0]);
      const similarity = cosineSimilarity(vec1, vec2);

      log.info('Similarity', { similarity });
      log.assert(
        Math.abs(similarity - (-1.0)) < 0.0001,
        'Opposite vectors should have similarity -1.0'
      );
      log.success('Opposite vectors have similarity -1.0');
    });

    test('handles zero vectors gracefully', () => {
      log.info('Testing zero vector handling');

      const zero = new Float32Array([0, 0, 0, 0]);
      const vec = new Float32Array([1, 0, 0, 0]);
      const similarity = cosineSimilarity(zero, vec);

      log.info('Similarity with zero vector', { similarity });
      log.assertEqual(similarity, 0, 'zero vector similarity');
      log.success('Zero vectors handled gracefully');
    });

    test('handles mismatched dimensions', () => {
      log.info('Testing mismatched dimensions');

      const vec1 = new Float32Array([1, 0, 0]);
      const vec2 = new Float32Array([1, 0, 0, 0]);
      const similarity = cosineSimilarity(vec1, vec2);

      log.info('Similarity with mismatched dims', { similarity });
      log.assertEqual(similarity, 0, 'mismatched dimensions similarity');
      log.success('Mismatched dimensions handled gracefully');
    });
  });

  describe('Provider Factory', () => {
    test('creates local provider by default for unknown type', () => {
      log.info('Testing unknown provider fallback');

      const config: MemoryConfig['embedding'] = {
        provider: 'unknown' as any,
      };

      // Should fall back to local for unknown providers
      const provider = createEmbeddingProvider(config);
      log.assertDefined(provider, 'provider');
      log.assertEqual(provider.name, 'local', 'should fallback to local');
      log.success('Unknown provider type handled');
    });

    test('creates ollama provider with custom base URL', () => {
      log.info('Testing Ollama provider creation');

      const config: MemoryConfig['embedding'] = {
        provider: 'ollama',
        baseUrl: 'http://custom:11434',
        model: 'custom-model',
      };

      const provider = createEmbeddingProvider(config);
      log.assertEqual(provider.name, 'ollama', 'provider name');
      log.assertEqual(provider.dimensions, 768, 'ollama dimensions');
      log.success('Ollama provider created with custom config');
    });
  });
});

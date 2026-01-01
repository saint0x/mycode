/**
 * Memory Processing Transform
 * Phase 9.2.2: Strip remember tags from SSE output and extract memories
 *
 * This transform:
 * 1. Buffers text content from text_delta events
 * 2. Strips <remember> tags from text deltas when possible
 * 3. Extracts memories at message completion
 */

import { parseRememberTags, stripRememberTags, type ParsedRememberTag } from './rememberTags';

/**
 * Check if content contains a complete remember tag
 */
function hasCompleteRememberTag(content: string): boolean {
  return /<remember\s+[^>]*>[\s\S]*?<\/remember>/i.test(content);
}

/**
 * Check if content might be starting a remember tag
 */
function mightBeStartingTag(content: string): boolean {
  return /<remember(?:\s|$)/i.test(content) || /<rem$/i.test(content);
}

interface MemoryProcessingOptions {
  req: unknown;
  config: unknown;
  onMemoryExtracted?: (memory: ParsedRememberTag) => void;
}

/**
 * Create a memory processing transform that strips tags and extracts memories
 */
export function createMemoryProcessingTransform(options: MemoryProcessingOptions) {
  let accumulatedText = '';
  let textBlockBuffer = '';
  let _isInsidePotentialTag = false;
  let currentTextBlockIndex = -1;

  return {
    /**
     * Process a single SSE event
     * Returns the modified event, or null to filter it out
     */
    processEvent(event: { event?: string; data?: { content_block?: { type?: string }; index?: number; delta?: { type?: string; text?: string } } }): { event?: string; data?: { content_block?: { type?: string }; index?: number; delta?: { type?: string; text?: string } } } | null {
      // Track text block starts
      if (event.event === 'content_block_start' && event.data?.content_block?.type === 'text') {
        currentTextBlockIndex = event.data.index ?? -1;
        textBlockBuffer = '';
        _isInsidePotentialTag = false;
        return event;
      }

      // Process text deltas
      if (event.event === 'content_block_delta' &&
          event.data?.delta?.type === 'text_delta' &&
          event.data?.index === currentTextBlockIndex) {

        const text = event.data.delta.text;
        accumulatedText += text;
        textBlockBuffer += text;

        // Check if we have a complete tag to strip
        if (hasCompleteRememberTag(textBlockBuffer)) {
          const stripped = stripRememberTags(textBlockBuffer);

          // Calculate what to emit (only the new stripped content)
          const emittedSoFar = textBlockBuffer.length - text.length;
          const previousStripped = stripRememberTags(textBlockBuffer.slice(0, emittedSoFar));
          const newContent = stripped.slice(previousStripped.length);

          if (newContent.length === 0) {
            // The entire delta was part of a tag, filter it out
            return null;
          }

          // Emit modified delta
          return {
            ...event,
            data: {
              ...event.data,
              delta: {
                type: 'text_delta',
                text: newContent,
              },
            },
          };
        }

        // Check if we might be in the middle of a tag
        if (mightBeStartingTag(textBlockBuffer)) {
          // Could be starting a tag, but we don't have the full picture
          // For now, let it through - we'll handle complete tags
          isInsidePotentialTag = true;
        }

        return event;
      }

      // Handle text block completion
      if (event.event === 'content_block_stop' &&
          currentTextBlockIndex !== -1 &&
          event.data?.index === currentTextBlockIndex) {
        currentTextBlockIndex = -1;
        textBlockBuffer = '';
        isInsidePotentialTag = false;
        return event;
      }

      // At message completion, extract memories from accumulated text
      if (event.event === 'message_delta') {
        // Extract memories from accumulated content
        const memories = parseRememberTags(accumulatedText);
        for (const memory of memories) {
          if (options.onMemoryExtracted) {
            options.onMemoryExtracted(memory);
          }
        }
        accumulatedText = '';
        return event;
      }

      return event;
    },

    /**
     * Get accumulated text (for external memory extraction)
     */
    getAccumulatedText(): string {
      return accumulatedText;
    },
  };
}

export type MemoryProcessingTransform = ReturnType<typeof createMemoryProcessingTransform>;

/**
 * Dynamic Context Builder
 * Builds optimized context for each API request
 */

import type {
  ContextSection,
  ContextBuildResult,
  ContextBuilderConfig,
  RequestAnalysis,
} from './types';
import { ContextPriority } from './types';
import { buildMemorySections, buildEmphasisSections, buildInstructionSections } from './sections';

const DEFAULT_CONFIG: ContextBuilderConfig = {
  maxTokens: 8000,
  reserveTokensForResponse: 4000,
  enableMemory: true,
  enableProjectContext: true,
  enableEmphasis: true,
  debugMode: false,
};

export class DynamicContextBuilder {
  private config: ContextBuilderConfig;

  constructor(config: Partial<ContextBuilderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════════════════════
  // MAIN BUILD METHOD - Called on every API request
  // ═══════════════════════════════════════════════════════════════════

  async build(
    originalSystem: string | any[] | undefined,
    request: {
      messages: any[];
      projectPath?: string;
      sessionId?: string;
      tools?: any[];
    }
  ): Promise<ContextBuildResult> {
    // Step 1: Analyze the request
    const analysis = this.analyzeRequest(request);

    // Step 2: Collect all context sections
    const sections: ContextSection[] = [];

    // Memory sections (if enabled)
    if (this.config.enableMemory) {
      try {
        const memorySections = await buildMemorySections(request);
        sections.push(...memorySections);
      } catch (error) {
        if (this.config.debugMode) {
          console.error('[Context Builder] Memory sections error:', error);
        }
      }
    }

    // Instruction sections
    const instructionSections = buildInstructionSections();
    sections.push(...instructionSections);

    // Emphasis sections (if enabled)
    if (this.config.enableEmphasis) {
      const emphasisSections = buildEmphasisSections(analysis);
      sections.push(...emphasisSections);
    }

    // Step 3: Calculate available token budget
    const originalSystemTokens = this.estimateSystemTokens(originalSystem);
    const availableTokens = this.config.maxTokens - this.config.reserveTokensForResponse - originalSystemTokens;

    // Step 4: Prioritize and trim sections to fit budget
    const { included, trimmed } = this.fitToBudget(sections, availableTokens);

    // Step 5: Assemble final system prompt
    const enhancedSystem = this.assembleSystemPrompt(originalSystem, included);

    // Step 6: Calculate final token count
    const totalTokens = this.estimateSystemTokens(enhancedSystem);

    if (this.config.debugMode) {
      console.log('[Context Builder]', {
        taskType: analysis.taskType,
        complexity: analysis.complexity,
        sections: included.map(s => s.name),
        trimmed: trimmed.map(s => s.name),
        totalTokens,
      });
    }

    return {
      systemPrompt: enhancedSystem,
      sections: included,
      totalTokens,
      trimmedSections: trimmed,
      analysis,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // REQUEST ANALYSIS
  // ═══════════════════════════════════════════════════════════════════

  private analyzeRequest(request: { messages: any[]; tools?: any[] }): RequestAnalysis {
    const recentMessages = request.messages.slice(-3);
    const lastUserMessage = recentMessages.find(m => m.role === 'user');
    const content = typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : '';

    return {
      taskType: this.detectTaskType(content),
      complexity: this.detectComplexity(content, request.messages.length),
      requiresMemory: true,
      requiresProjectContext: true,
      keywords: this.extractKeywords(content),
      entities: this.extractEntities(content),
    };
  }

  private detectTaskType(content: string): RequestAnalysis['taskType'] {
    const lower = content.toLowerCase();

    if (lower.includes('debug') || lower.includes('error') || lower.includes('fix') || lower.includes('bug')) {
      return 'debug';
    }
    if (lower.includes('refactor') || lower.includes('clean up') || lower.includes('improve')) {
      return 'refactor';
    }
    if (lower.includes('test') || lower.includes('spec') || lower.includes('coverage')) {
      return 'test';
    }
    if (lower.includes('review') || lower.includes('check') || lower.includes('audit')) {
      return 'review';
    }
    if (lower.includes('explain') || lower.includes('how does') || lower.includes('what is')) {
      return 'explain';
    }
    if (lower.includes('implement') || lower.includes('create') || lower.includes('add') || lower.includes('build')) {
      return 'code';
    }

    return 'general';
  }

  private detectComplexity(content: string, messageCount: number): RequestAnalysis['complexity'] {
    if (content.length > 500 || messageCount > 10) {
      return 'complex';
    }
    if (content.length > 200 || messageCount > 5) {
      return 'moderate';
    }
    return 'simple';
  }

  private extractKeywords(content: string): string[] {
    const words = content.toLowerCase().split(/\s+/);
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in',
      'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
      'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
      'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
      'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his',
    ]);

    return words
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 10);
  }

  private extractEntities(content: string): string[] {
    const entities: string[] = [];

    // File paths
    const fileMatches = content.match(/[\w\-\/]+\.(ts|js|tsx|jsx|py|go|rs|java|cpp|c|h|css|scss|html|json|yaml|yml|md|txt)/g);
    if (fileMatches) entities.push(...fileMatches);

    // Function/class names (PascalCase or camelCase)
    const nameMatches = content.match(/\b[A-Z][a-zA-Z0-9]+\b|\b[a-z]+[A-Z][a-zA-Z0-9]*\b/g);
    if (nameMatches) entities.push(...nameMatches.slice(0, 5));

    return [...new Set(entities)];
  }

  // ═══════════════════════════════════════════════════════════════════
  // TOKEN BUDGET MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  private fitToBudget(
    sections: ContextSection[],
    availableTokens: number
  ): { included: ContextSection[]; trimmed: ContextSection[] } {
    // Sort by priority (highest first)
    const sorted = [...sections].sort((a, b) => b.priority - a.priority);

    const included: ContextSection[] = [];
    const trimmed: ContextSection[] = [];
    let usedTokens = 0;

    for (const section of sorted) {
      if (usedTokens + section.tokenCount <= availableTokens) {
        included.push(section);
        usedTokens += section.tokenCount;
      } else if (section.priority >= ContextPriority.CRITICAL) {
        // Critical sections: try to include truncated version
        const remainingTokens = availableTokens - usedTokens;
        if (remainingTokens > 100) {
          const truncated = this.truncateSection(section, remainingTokens);
          included.push(truncated);
          usedTokens += truncated.tokenCount;
        } else {
          trimmed.push(section);
        }
      } else {
        trimmed.push(section);
      }
    }

    return { included, trimmed };
  }

  private truncateSection(section: ContextSection, maxTokens: number): ContextSection {
    const maxChars = maxTokens * 4;
    const truncatedContent = section.content.slice(0, maxChars) + '\n... (truncated for token limit)';

    return {
      ...section,
      content: truncatedContent,
      tokenCount: maxTokens,
      metadata: { ...section.metadata, truncated: true },
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // FINAL ASSEMBLY
  // ═══════════════════════════════════════════════════════════════════

  private assembleSystemPrompt(
    originalSystem: string | any[] | undefined,
    sections: ContextSection[]
  ): string {
    const parts: string[] = [];

    // Add memory sections first (highest priority context)
    const memorySections = sections.filter(s => s.category === 'memory');
    for (const section of memorySections) {
      parts.push(section.content);
    }

    // Add instruction sections
    const instructionSections = sections.filter(s => s.category === 'instruction');
    for (const section of instructionSections) {
      parts.push(section.content);
    }

    // Add emphasis sections
    const emphasisSections = sections.filter(s => s.category === 'emphasis');
    for (const section of emphasisSections) {
      parts.push(section.content);
    }

    // Add original system prompt
    if (typeof originalSystem === 'string') {
      parts.push(originalSystem);
    } else if (Array.isArray(originalSystem)) {
      for (const item of originalSystem) {
        if (item.type === 'text') {
          parts.push(item.text);
        }
      }
    }

    return parts.join('\n\n');
  }

  private estimateSystemTokens(system: string | any[] | undefined): number {
    if (!system) return 0;

    if (typeof system === 'string') {
      return Math.ceil(system.length / 4);
    }

    if (Array.isArray(system)) {
      return system.reduce((acc, item) => {
        if (item.type === 'text') {
          return acc + Math.ceil(item.text.length / 4);
        }
        return acc;
      }, 0);
    }

    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SINGLETON MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

let builder: DynamicContextBuilder | null = null;

export function getContextBuilder(config?: Partial<ContextBuilderConfig>): DynamicContextBuilder {
  if (!builder) {
    builder = new DynamicContextBuilder(config);
  }
  return builder;
}

export function initContextBuilder(config: Partial<ContextBuilderConfig>): DynamicContextBuilder {
  builder = new DynamicContextBuilder(config);
  return builder;
}

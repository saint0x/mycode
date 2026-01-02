import { createHash } from 'crypto';

/**
 * Information about a tracked tool call
 */
interface ToolCallHash {
  hash: string;
  attempts: number;
  firstSeen: number;
  lastSeen: number;
}

/**
 * Tracks tool call attempts to detect and prevent infinite loops
 *
 * This utility maintains a request-scoped cache of tool calls by hashing
 * the tool name and arguments. It enforces a maximum retry limit to prevent
 * infinite loops when LLMs repeatedly call tools with invalid arguments.
 */
export class ToolCallTracker {
  private calls: Map<string, ToolCallHash>;
  private readonly maxRetries: number;

  /**
   * Create a new tool call tracker
   * @param maxRetries Maximum number of retry attempts allowed (default: 3)
   */
  constructor(maxRetries = 3) {
    this.calls = new Map();
    this.maxRetries = maxRetries;
  }

  /**
   * Create a deterministic hash from tool name and arguments
   * @param name Tool name
   * @param args Tool arguments (will be JSON stringified)
   * @returns SHA256 hash string
   */
  private hashToolCall(name: string, args: unknown): string {
    const payload = JSON.stringify({ name, args });
    return createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Check if a tool call can be executed (hasn't exceeded retry limit)
   * @param name Tool name
   * @param args Tool arguments
   * @returns true if call can proceed, false if retry limit exceeded
   */
  canExecute(name: string, args: unknown): boolean {
    const hash = this.hashToolCall(name, args);
    const existing = this.calls.get(hash);

    if (!existing) {
      return true; // First attempt, always allowed
    }

    return existing.attempts < this.maxRetries;
  }

  /**
   * Record an attempt for a tool call
   * @param name Tool name
   * @param args Tool arguments
   */
  recordAttempt(name: string, args: unknown): void {
    const hash = this.hashToolCall(name, args);
    const existing = this.calls.get(hash);
    const now = Date.now();

    if (existing) {
      existing.attempts += 1;
      existing.lastSeen = now;
    } else {
      this.calls.set(hash, {
        hash,
        attempts: 1,
        firstSeen: now,
        lastSeen: now,
      });
    }
  }

  /**
   * Get the number of attempts for a specific tool call
   * @param name Tool name
   * @param args Tool arguments
   * @returns Number of attempts (0 if never attempted)
   */
  getAttemptCount(name: string, args: unknown): number {
    const hash = this.hashToolCall(name, args);
    const existing = this.calls.get(hash);
    return existing ? existing.attempts : 0;
  }

  /**
   * Get full information about a tool call
   * @param name Tool name
   * @param args Tool arguments
   * @returns ToolCallHash info or undefined if not tracked
   */
  getCallInfo(name: string, args: unknown): ToolCallHash | undefined {
    const hash = this.hashToolCall(name, args);
    return this.calls.get(hash);
  }

  /**
   * Get the maximum retry limit
   */
  getMaxRetries(): number {
    return this.maxRetries;
  }

  /**
   * Clear all tracked calls (useful for testing)
   */
  clear(): void {
    this.calls.clear();
  }

  /**
   * Get total number of unique tool calls being tracked
   */
  size(): number {
    return this.calls.size;
  }
}

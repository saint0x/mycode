/**
 * BackgroundQueue - Simple fire-and-forget job execution
 * Uses queueMicrotask for Bun compatibility, no external dependencies
 */

interface BackgroundJob {
  id: string;
  priority: 'high' | 'normal' | 'low';
  execute: () => Promise<void>;
  onError?: (error: Error) => void;
}

interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

const PRIORITY_ORDER: Record<BackgroundJob['priority'], number> = {
  high: 0,
  normal: 1,
  low: 2,
};

class BackgroundQueueImpl {
  private queue: BackgroundJob[] = [];
  private running = 0;
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;
  private stats: QueueStats = { pending: 0, running: 0, completed: 0, failed: 0 };
  private processing = false;

  constructor(options: { maxConcurrent?: number; maxQueueSize?: number } = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 5;
    this.maxQueueSize = options.maxQueueSize ?? 1000;
  }

  /**
   * Enqueue a job for background execution (fire-and-forget)
   */
  enqueue(job: BackgroundJob): void {
    // Drop if queue is full (graceful degradation)
    if (this.queue.length >= this.maxQueueSize) {
      console.warn(`[BackgroundQueue] Queue full (${this.maxQueueSize}), dropping job: ${job.id}`);
      return;
    }

    this.queue.push(job);
    this.stats.pending++;

    // Sort by priority
    this.queue.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    // Trigger processing if not already running
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Wait for all pending jobs to complete
   */
  async flush(): Promise<void> {
    while (this.queue.length > 0 || this.running > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return { ...this.stats, pending: this.queue.length, running: this.running };
  }

  private processQueue(): void {
    if (this.processing) return;
    this.processing = true;

    queueMicrotask(() => this.processNext());
  }

  private async processNext(): Promise<void> {
    while (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const job = this.queue.shift();
      if (!job) break;

      this.stats.pending--;
      this.running++;
      this.stats.running = this.running;

      // Execute without blocking the loop
      this.executeJob(job);
    }

    // Continue processing if there are more jobs
    if (this.queue.length > 0 && this.running < this.maxConcurrent) {
      queueMicrotask(() => this.processNext());
    } else if (this.queue.length === 0 && this.running === 0) {
      this.processing = false;
    }
  }

  private async executeJob(job: BackgroundJob): Promise<void> {
    try {
      await job.execute();
      this.stats.completed++;
    } catch (error) {
      this.stats.failed++;
      const err = error instanceof Error ? error : new Error(String(error));

      if (job.onError) {
        try {
          job.onError(err);
        } catch {
          // Ignore errors in error handler
        }
      } else {
        console.error(`[BackgroundQueue] Job ${job.id} failed:`, err.message);
      }
    } finally {
      this.running--;
      this.stats.running = this.running;

      // Process more jobs if available
      if (this.queue.length > 0) {
        queueMicrotask(() => this.processNext());
      } else if (this.running === 0) {
        this.processing = false;
      }
    }
  }
}

// Singleton instance
export const backgroundQueue = new BackgroundQueueImpl();

// Export for testing
export { BackgroundQueueImpl };
export type { BackgroundJob, QueueStats };

/**
 * Test Logger - Strong logging for test visibility
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

export class TestLogger {
  private testName: string;
  private startTime: number;
  private logs: string[] = [];

  constructor(testName: string) {
    this.testName = testName;
    this.startTime = Date.now();
    this.log('START', `Test: ${testName}`);
  }

  private formatTime(): string {
    const elapsed = Date.now() - this.startTime;
    return `+${elapsed}ms`;
  }

  private log(level: string, message: string, data?: any): void {
    const timestamp = this.formatTime();
    const levelColors: Record<string, string> = {
      START: colors.cyan,
      INFO: colors.blue,
      SUCCESS: colors.green,
      WARN: colors.yellow,
      ERROR: colors.red,
      DEBUG: colors.dim,
      ASSERT: colors.magenta,
    };

    const color = levelColors[level] || colors.reset;
    const formatted = `${color}[${level}]${colors.reset} ${colors.dim}${timestamp}${colors.reset} ${message}`;

    console.log(formatted);
    if (data !== undefined) {
      console.log(`${colors.dim}  →${colors.reset}`, JSON.stringify(data, null, 2));
    }

    this.logs.push(`[${level}] ${timestamp} ${message}${data ? ` ${JSON.stringify(data)}` : ''}`);
  }

  info(message: string, data?: any): void {
    this.log('INFO', message, data);
  }

  success(message: string, data?: any): void {
    this.log('SUCCESS', message, data);
  }

  warn(message: string, data?: any): void {
    this.log('WARN', message, data);
  }

  error(message: string, data?: any): void {
    this.log('ERROR', message, data);
  }

  debug(message: string, data?: any): void {
    this.log('DEBUG', message, data);
  }

  assert(condition: boolean, message: string, data?: any): void {
    if (condition) {
      this.log('ASSERT', `✓ ${message}`, data);
    } else {
      this.log('ERROR', `✗ ASSERTION FAILED: ${message}`, data);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  assertDefined<T>(value: T | undefined | null, name: string): asserts value is T {
    if (value === undefined || value === null) {
      this.error(`${name} is undefined/null`);
      throw new Error(`Expected ${name} to be defined, got ${value}`);
    }
    this.log('ASSERT', `✓ ${name} is defined`);
  }

  assertEqual<T>(actual: T, expected: T, name: string): void {
    if (actual !== expected) {
      this.error(`${name} mismatch`, { actual, expected });
      throw new Error(`Expected ${name} to be ${expected}, got ${actual}`);
    }
    this.log('ASSERT', `✓ ${name} equals expected`, { value: actual });
  }

  assertIncludes(haystack: string, needle: string, name: string): void {
    if (!haystack.includes(needle)) {
      this.error(`${name} does not include expected substring`, { haystack: haystack.slice(0, 200), needle });
      throw new Error(`Expected ${name} to include "${needle}"`);
    }
    this.log('ASSERT', `✓ ${name} includes "${needle.slice(0, 50)}..."`);
  }

  assertGreaterThan(actual: number, threshold: number, name: string): void {
    if (actual <= threshold) {
      this.error(`${name} not greater than threshold`, { actual, threshold });
      throw new Error(`Expected ${name} (${actual}) to be greater than ${threshold}`);
    }
    this.log('ASSERT', `✓ ${name} > ${threshold}`, { actual });
  }

  assertLessThan(actual: number, threshold: number, name: string): void {
    if (actual >= threshold) {
      this.error(`${name} not less than threshold`, { actual, threshold });
      throw new Error(`Expected ${name} (${actual}) to be less than ${threshold}`);
    }
    this.log('ASSERT', `✓ ${name} < ${threshold}`, { actual });
  }

  finish(): void {
    const elapsed = Date.now() - this.startTime;
    this.log('SUCCESS', `Test completed in ${elapsed}ms`);
  }

  getLogs(): string[] {
    return this.logs;
  }
}

export function createLogger(testName: string): TestLogger {
  return new TestLogger(testName);
}

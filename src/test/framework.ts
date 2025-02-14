import { EventEmitter } from 'events';

interface TestConfig {
    parallelTests: number;    // Maximum parallel tests
    timeout: number;          // Test timeout in ms
    retries: number;          // Number of retries for failed tests
    reportFormat: 'simple' | 'detailed';
}

interface TestCase {
    id: string;
    name: string;
    category: string;
    setup?: () => Promise<void>;
    teardown?: () => Promise<void>;
    run: () => Promise<void>;
    timeout?: number;
}

interface TestResult {
    testId: string;
    name: string;
    category: string;
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
    error?: Error;
    retries: number;
}

interface TestSuite {
    name: string;
    tests: TestCase[];
    setup?: () => Promise<void>;
    teardown?: () => Promise<void>;
}

class TestFramework extends EventEmitter {
    private config: TestConfig;
    private suites: Map<string, TestSuite>;
    private results: Map<string, TestResult>;
    private running: boolean;

    constructor(config: Partial<TestConfig> = {}) {
        super();
        
        this.config = {
            parallelTests: 4,
            timeout: 30000,
            retries: 2,
            reportFormat: 'detailed',
            ...config
        };

        this.suites = new Map();
        this.results = new Map();
        this.running = false;
    }

    addSuite(name: string, suite: Omit<TestSuite, 'name'>): void {
        this.suites.set(name, { name, ...suite });
    }

    async runAll(): Promise<TestResult[]> {
        if (this.running) {
            throw new Error('Tests are already running');
        }

        this.running = true;
        this.results.clear();

        try {
            for (const [name, suite] of this.suites) {
                await this.runSuite(suite);
            }

            return Array.from(this.results.values());
        } finally {
            this.running = false;
        }
    }

    private async runSuite(suite: TestSuite): Promise<void> {
        try {
            if (suite.setup) {
                await suite.setup();
            }

            // Run tests in parallel batches
            const tests = [...suite.tests];
            while (tests.length > 0) {
                const batch = tests.splice(0, this.config.parallelTests);
                await Promise.all(batch.map(test => this.runTest(test)));
            }
        } finally {
            if (suite.teardown) {
                await suite.teardown();
            }
        }
    }

    private async runTest(test: TestCase, attempt: number = 1): Promise<void> {
        const startTime = Date.now();
        
        try {
            if (test.setup) {
                await test.setup();
            }

            // Run test with timeout
            await Promise.race([
                test.run(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Test timeout')), 
                        test.timeout || this.config.timeout
                    )
                )
            ]);

            // Record success
            this.results.set(test.id, {
                testId: test.id,
                name: test.name,
                category: test.category,
                status: 'passed',
                duration: Date.now() - startTime,
                retries: attempt - 1
            });

            this.emit('testPassed', test);
        } catch (error) {
            if (attempt <= this.config.retries) {
                // Retry test
                await this.runTest(test, attempt + 1);
            } else {
                // Record failure
                this.results.set(test.id, {
                    testId: test.id,
                    name: test.name,
                    category: test.category,
                    status: 'failed',
                    duration: Date.now() - startTime,
                    error: error as Error,
                    retries: attempt - 1
                });

                this.emit('testFailed', { test, error });
            }
        } finally {
            if (test.teardown) {
                await test.teardown();
            }
        }
    }

    generateReport(): string {
        const results = Array.from(this.results.values());
        const passed = results.filter(r => r.status === 'passed').length;
        const failed = results.filter(r => r.status === 'failed').length;
        const total = results.length;

        if (this.config.reportFormat === 'simple') {
            return `
Tests Complete:
Total: ${total}
Passed: ${passed}
Failed: ${failed}
Success Rate: ${((passed / total) * 100).toFixed(2)}%
            `.trim();
        }

        // Detailed report
        return `
Test Results
===========

Summary:
- Total Tests: ${total}
- Passed: ${passed}
- Failed: ${failed}
- Success Rate: ${((passed / total) * 100).toFixed(2)}%

Failed Tests:
${results
    .filter(r => r.status === 'failed')
    .map(r => `
- ${r.name} (${r.category})
  Error: ${r.error?.message}
  Duration: ${r.duration}ms
  Retries: ${r.retries}
    `.trim())
    .join('\n')}

Test Details:
${results
    .map(r => `
${r.name} (${r.category})
Status: ${r.status}
Duration: ${r.duration}ms
${r.error ? `Error: ${r.error.message}` : ''}
    `.trim())
    .join('\n\n')}
            `.trim();
    }
}

export default TestFramework;
export {
    TestConfig,
    TestCase,
    TestResult,
    TestSuite
};

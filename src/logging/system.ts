import { EventEmitter } from 'events';

interface LogConfig {
    logLevel: LogLevel;
    maxLogs: number;         // Maximum logs to keep in memory
    logRotation: number;     // Days to keep logs
    batchSize: number;       // Logs per batch for processing
    logFormat: LogFormat;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
type LogFormat = 'json' | 'text';

interface LogEntry {
    id: string;
    timestamp: Date;
    level: LogLevel;
    category: string;
    message: string;
    data?: any;
    context?: {
        component: string;
        operation: string;
        userId?: string;
        requestId?: string;
    };
    stackTrace?: string;
}

class LoggingSystem extends EventEmitter {
    private config: LogConfig;
    private logs: LogEntry[];
    private logWritePromise: Promise<void>;
    private logQueue: LogEntry[];

    constructor(config: Partial<LogConfig> = {}) {
        super();
        
        this.config = {
            logLevel: 'info',
            maxLogs: 10000,
            logRotation: 30,
            batchSize: 100,
            logFormat: 'json',
            ...config
        };

        this.logs = [];
        this.logQueue = [];
        this.logWritePromise = Promise.resolve();

        this.startLogProcessing();
    }

    log(
        level: LogLevel,
        message: string,
        data?: any,
        context?: LogEntry['context']
    ): void {
        if (!this.shouldLog(level)) return;

        const entry: LogEntry = {
            id: this.generateLogId(),
            timestamp: new Date(),
            level,
            category: context?.component || 'general',
            message,
            data,
            context,
            stackTrace: level === 'error' || level === 'fatal' ? 
                new Error().stack : undefined
        };

        this.queueLog(entry);
    }

    // Convenience methods
    debug(message: string, data?: any, context?: LogEntry['context']): void {
        this.log('debug', message, data, context);
    }

    info(message: string, data?: any, context?: LogEntry['context']): void {
        this.log('info', message, data, context);
    }

    warn(message: string, data?: any, context?: LogEntry['context']): void {
        this.log('warn', message, data, context);
    }

    error(message: string, data?: any, context?: LogEntry['context']): void {
        this.log('error', message, data, context);
    }

    fatal(message: string, data?: any, context?: LogEntry['context']): void {
        this.log('fatal', message, data, context);
    }

    private queueLog(entry: LogEntry): void {
        this.logQueue.push(entry);
    }

    private startLogProcessing(): void {
        setInterval(() => this.processLogQueue(), 1000);
    }

    private async processLogQueue(): Promise<void> {
        if (this.logQueue.length === 0) return;

        const batch = this.logQueue.splice(0, this.config.batchSize);
        
        this.logWritePromise = this.logWritePromise
            .then(() => this.writeLogs(batch))
            .catch(error => {
                console.error('Log writing failed:', error);
                // Put logs back in queue
                this.logQueue.unshift(...batch);
            });
    }

    private async writeLogs(entries: LogEntry[]): Promise<void> {
        // Add to in-memory logs
        this.logs.push(...entries);

        // Trim if exceeding max logs
        if (this.logs.length > this.config.maxLogs) {
            this.logs = this.logs.slice(-this.config.maxLogs);
        }

        // Write to persistent storage
        await this.persistLogs(entries);

        // Emit events
        entries.forEach(entry => {
            this.emit('log', entry);
            if (entry.level === 'error' || entry.level === 'fatal') {
                this.emit('error', entry);
            }
        });
    }

    private async persistLogs(entries: LogEntry[]): Promise<void> {
        // TODO: Implement actual log persistence
        // This would write to file/database
    }

    private shouldLog(level: LogLevel): boolean {
        const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];
        const configIndex = levels.indexOf(this.config.logLevel);
        const logIndex = levels.indexOf(level);
        return logIndex >= configIndex;
    }

    private generateLogId(): string {
        return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Query methods
    async query(options: {
        level?: LogLevel;
        category?: string;
        startTime?: Date;
        endTime?: Date;
        search?: string;
        limit?: number;
    }): Promise<LogEntry[]> {
        return this.logs.filter(entry => {
            if (options.level && entry.level !== options.level) return false;
            if (options.category && entry.category !== options.category) return false;
            if (options.startTime && entry.timestamp < options.startTime) return false;
            if (options.endTime && entry.timestamp > options.endTime) return false;
            if (options.search && !this.matchSearch(entry, options.search)) return false;
            return true;
        })
        .slice(-(options.limit || this.logs.length));
    }

    private matchSearch(entry: LogEntry, search: string): boolean {
        const searchLower = search.toLowerCase();
        return (
            entry.message.toLowerCase().includes(searchLower) ||
            entry.category.toLowerCase().includes(searchLower) ||
            (entry.context?.component || '').toLowerCase().includes(searchLower) ||
            (entry.context?.operation || '').toLowerCase().includes(searchLower)
        );
    }

    // Export methods
    async export(format: 'json' | 'csv' = 'json'): Promise<string> {
        if (format === 'json') {
            return JSON.stringify(this.logs, null, 2);
        }

        // CSV format
        const headers = ['timestamp', 'level', 'category', 'message', 'component', 'operation'];
        const rows = this.logs.map(log => [
            log.timestamp.toISOString(),
            log.level,
            log.category,
            log.message,
            log.context?.component || '',
            log.context?.operation || ''
        ]);

        return [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');
    }

    // Rotation methods
    async rotate(): Promise<void> {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - this.config.logRotation);

        this.logs = this.logs.filter(log => log.timestamp >= cutoff);
        await this.persistLogs(this.logs);
    }
}

export default LoggingSystem;

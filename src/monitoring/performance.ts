import { EventEmitter } from 'events';

interface MetricConfig {
    sampleInterval: number;    // How often to sample metrics (ms)
    retentionPeriod: number;   // How long to keep metrics (ms)
    alertThresholds: {
        cpu: number;           // CPU usage percentage
        memory: number;        // Memory usage percentage
        storage: number;       // Storage usage percentage
        latency: number;       // Maximum acceptable latency (ms)
    };
}

interface Metric {
    timestamp: Date;
    type: string;
    value: number;
    tags: Record<string, string>;
}

interface Alert {
    id: string;
    metric: string;
    threshold: number;
    value: number;
    timestamp: Date;
    status: 'active' | 'resolved';
}

class PerformanceMonitor extends EventEmitter {
    private config: MetricConfig;
    private metrics: Map<string, Metric[]>;
    private alerts: Map<string, Alert>;
    private samplingInterval: NodeJS.Timer;

    constructor(config: Partial<MetricConfig> = {}) {
        super();
        
        this.config = {
            sampleInterval: 5000,     // 5 seconds
            retentionPeriod: 86400000, // 24 hours
            alertThresholds: {
                cpu: 80,              // 80% CPU usage
                memory: 85,           // 85% memory usage
                storage: 90,          // 90% storage usage
                latency: 1000         // 1 second latency
            },
            ...config
        };

        this.metrics = new Map();
        this.alerts = new Map();
        
        this.startMonitoring();
    }

    private startMonitoring(): void {
        this.samplingInterval = setInterval(
            () => this.collectMetrics(),
            this.config.sampleInterval
        );
    }

    private async collectMetrics(): Promise<void> {
        try {
            // Collect system metrics
            const systemMetrics = await this.collectSystemMetrics();
            
            // Collect network metrics
            const networkMetrics = await this.collectNetworkMetrics();
            
            // Collect storage metrics
            const storageMetrics = await this.collectStorageMetrics();
            
            // Process all metrics
            [...systemMetrics, ...networkMetrics, ...storageMetrics]
                .forEach(metric => this.processMetric(metric));

        } catch (error) {
            console.error('Metric collection failed:', error);
            this.emit('metricError', error);
        }
    }

    private async collectSystemMetrics(): Promise<Metric[]> {
        // TODO: Implement actual system metric collection
        return [
            {
                timestamp: new Date(),
                type: 'cpu_usage',
                value: Math.random() * 100,
                tags: { host: 'local' }
            },
            {
                timestamp: new Date(),
                type: 'memory_usage',
                value: Math.random() * 100,
                tags: { host: 'local' }
            }
        ];
    }

    private async collectNetworkMetrics(): Promise<Metric[]> {
        // TODO: Implement actual network metric collection
        return [
            {
                timestamp: new Date(),
                type: 'network_latency',
                value: Math.random() * 1000,
                tags: { interface: 'eth0' }
            },
            {
                timestamp: new Date(),
                type: 'network_throughput',
                value: Math.random() * 1000000,
                tags: { interface: 'eth0' }
            }
        ];
    }

    private async collectStorageMetrics(): Promise<Metric[]> {
        // TODO: Implement actual storage metric collection
        return [
            {
                timestamp: new Date(),
                type: 'storage_usage',
                value: Math.random() * 100,
                tags: { device: 'disk0' }
            },
            {
                timestamp: new Date(),
                type: 'iops',
                value: Math.random() * 1000,
                tags: { device: 'disk0' }
            }
        ];
    }

    private processMetric(metric: Metric): void {
        // Store metric
        if (!this.metrics.has(metric.type)) {
            this.metrics.set(metric.type, []);
        }
        this.metrics.get(metric.type)!.push(metric);

        // Check thresholds
        this.checkThresholds(metric);

        // Prune old metrics
        this.pruneMetrics(metric.type);

        // Emit metric event
        this.emit('metric', metric);
    }

    private checkThresholds(metric: Metric): void {
        let threshold: number | undefined;

        switch (metric.type) {
            case 'cpu_usage':
                threshold = this.config.alertThresholds.cpu;
                break;
            case 'memory_usage':
                threshold = this.config.alertThresholds.memory;
                break;
            case 'storage_usage':
                threshold = this.config.alertThresholds.storage;
                break;
            case 'network_latency':
                threshold = this.config.alertThresholds.latency;
                break;
        }

        if (threshold && metric.value > threshold) {
            this.createAlert(metric, threshold);
        } else {
            this.resolveAlert(metric.type);
        }
    }

    private createAlert(metric: Metric, threshold: number): void {
        const alert: Alert = {
            id: `${metric.type}_${Date.now()}`,
            metric: metric.type,
            threshold,
            value: metric.value,
            timestamp: new Date(),
            status: 'active'
        };

        this.alerts.set(metric.type, alert);
        this.emit('alert', alert);
    }

    private resolveAlert(metricType: string): void {
        const alert = this.alerts.get(metricType);
        if (alert && alert.status === 'active') {
            alert.status = 'resolved';
            this.emit('alertResolved', alert);
        }
    }

    private pruneMetrics(metricType: string): void {
        const metrics = this.metrics.get(metricType);
        if (!metrics) return;

        const cutoff = Date.now() - this.config.retentionPeriod;
        const filtered = metrics.filter(m => m.timestamp.getTime() > cutoff);
        this.metrics.set(metricType, filtered);
    }

    async getMetrics(
        type: string,
        timeRange: { start: Date; end: Date }
    ): Promise<Metric[]> {
        const metrics = this.metrics.get(type) || [];
        return metrics.filter(m => 
            m.timestamp >= timeRange.start && 
            m.timestamp <= timeRange.end
        );
    }

    async getAlerts(status?: Alert['status']): Promise<Alert[]> {
        const alerts = Array.from(this.alerts.values());
        if (status) {
            return alerts.filter(a => a.status === status);
        }
        return alerts;
    }

    stop(): void {
        if (this.samplingInterval) {
            clearInterval(this.samplingInterval);
        }
    }
}

export default PerformanceMonitor;
export {
    MetricConfig,
    Metric,
    Alert
};

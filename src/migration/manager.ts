import { EventEmitter } from 'events';

interface MigrationConfig {
    batchSize: number;        // Items per batch
    timeout: number;          // Migration timeout (ms)
    retryAttempts: number;    // Number of retry attempts
    parallel: number;         // Parallel migrations
}

interface Migration {
    id: string;
    version: string;
    description: string;
    type: 'data' | 'schema' | 'system';
    dependencies?: string[];  // IDs of required migrations
    up: () => Promise<void>;
    down: () => Promise<void>;
}

interface MigrationStatus {
    id: string;
    version: string;
    applied: Date;
    status: 'pending' | 'running' | 'completed' | 'failed';
    error?: string;
    duration?: number;
}

class MigrationManager extends EventEmitter {
    private config: MigrationConfig;
    private migrations: Map<string, Migration>;
    private status: Map<string, MigrationStatus>;
    private running: boolean;

    constructor(config: Partial<MigrationConfig> = {}) {
        super();
        
        this.config = {
            batchSize: 1000,
            timeout: 3600000,  // 1 hour
            retryAttempts: 3,
            parallel: 1,
            ...config
        };

        this.migrations = new Map();
        this.status = new Map();
        this.running = false;
    }

    registerMigration(migration: Migration): void {
        if (this.migrations.has(migration.id)) {
            throw new Error(`Migration already registered: ${migration.id}`);
        }

        this.migrations.set(migration.id, migration);
        this.status.set(migration.id, {
            id: migration.id,
            version: migration.version,
            applied: null as any,
            status: 'pending'
        });
    }

    async migrate(targetVersion?: string): Promise<void> {
        if (this.running) {
            throw new Error('Migration already in progress');
        }

        this.running = true;

        try {
            const migrations = this.getMigrationPath(targetVersion);
            
            // Run migrations in sequence
            for (const migration of migrations) {
                await this.runMigration(migration);
            }

            this.emit('migrationsComplete');
        } catch (error) {
            this.emit('migrationsFailed', error);
            throw error;
        } finally {
            this.running = false;
        }
    }

    async rollback(steps: number = 1): Promise<void> {
        if (this.running) {
            throw new Error('Migration already in progress');
        }

        this.running = true;

        try {
            const completedMigrations = Array.from(this.status.values())
                .filter(s => s.status === 'completed')
                .sort((a, b) => b.applied.getTime() - a.applied.getTime());

            const toRollback = completedMigrations.slice(0, steps);

            // Rollback in reverse order
            for (const status of toRollback) {
                const migration = this.migrations.get(status.id);
                if (!migration) continue;

                await this.rollbackMigration(migration);
            }

            this.emit('rollbackComplete');
        } catch (error) {
            this.emit('rollbackFailed', error);
            throw error;
        } finally {
            this.running = false;
        }
    }

    private async runMigration(migration: Migration): Promise<void> {
        const status = this.status.get(migration.id)!;
        status.status = 'running';
        
        const startTime = Date.now();

        try {
            // Check dependencies
            if (migration.dependencies) {
                for (const depId of migration.dependencies) {
                    const depStatus = this.status.get(depId);
                    if (!depStatus || depStatus.status !== 'completed') {
                        throw new Error(`Dependency not met: ${depId}`);
                    }
                }
            }

            // Run migration
            await migration.up();

            // Update status
            status.applied = new Date();
            status.status = 'completed';
            status.duration = Date.now() - startTime;

            this.emit('migrationComplete', status);
        } catch (error) {
            status.status = 'failed';
            status.error = error.message;
            status.duration = Date.now() - startTime;

            this.emit('migrationFailed', {
                ...status,
                error
            });

            throw error;
        }
    }

    private async rollbackMigration(migration: Migration): Promise<void> {
        const status = this.status.get(migration.id)!;
        
        try {
            await migration.down();
            
            status.applied = null as any;
            status.status = 'pending';
            status.error = undefined;
            status.duration = undefined;

            this.emit('rollbackComplete', migration.id);
        } catch (error) {
            this.emit('rollbackFailed', {
                migrationId: migration.id,
                error
            });
            throw error;
        }
    }

    private getMigrationPath(targetVersion?: string): Migration[] {
        const migrations = Array.from(this.migrations.values())
            .sort((a, b) => this.compareVersions(a.version, b.version));

        if (!targetVersion) {
            return migrations;
        }

        const targetIndex = migrations.findIndex(m => m.version === targetVersion);
        if (targetIndex === -1) {
            throw new Error(`Target version not found: ${targetVersion}`);
        }

        return migrations.slice(0, targetIndex + 1);
    }

    private compareVersions(a: string, b: string): number {
        const partsA = a.split('.').map(Number);
        const partsB = b.split('.').map(Number);

        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            const partA = partsA[i] || 0;
            const partB = partsB[i] || 0;

            if (partA !== partB) {
                return partA - partB;
            }
        }

        return 0;
    }

    getStatus(): MigrationStatus[] {
        return Array.from(this.status.values());
    }

    getMigrations(): Migration[] {
        return Array.from(this.migrations.values());
    }

    isRunning(): boolean {
        return this.running;
    }
}

export default MigrationManager;

import { EventEmitter } from 'events';

interface BandwidthConfig {
    maxBandwidth: number;      // Maximum bandwidth in bytes/second
    maxConcurrent: number;     // Maximum concurrent transfers
    throttleThreshold: number; // Bandwidth % to start throttling
    fairnessWindow: number;    // Time window for fairness calculations (ms)
}

interface Transfer {
    id: string;
    type: 'upload' | 'download';
    peerId: string;
    priority: number;          // 1-10, higher = more priority
    startTime: Date;
    bytesTransferred: number;
    totalBytes: number;
    speed: number;            // Current speed in bytes/second
    status: 'queued' | 'active' | 'paused' | 'completed' | 'failed';
}

interface PeerBandwidth {
    peerId: string;
    allocated: number;     // Currently allocated bandwidth
    used: number;         // Actually used bandwidth
    transfers: number;    // Number of active transfers
    lastUpdated: Date;
}

class BandwidthManager extends EventEmitter {
    private config: BandwidthConfig;
    private transfers: Map<string, Transfer>;
    private peerBandwidth: Map<string, PeerBandwidth>;
    private totalBandwidthUsed: number;
    private lastCalculation: Date;

    constructor(config: Partial<BandwidthConfig> = {}) {
        super();
        
        this.config = {
            maxBandwidth: 10 * 1024 * 1024, // 10 MB/s default
            maxConcurrent: 5,
            throttleThreshold: 0.8,         // 80%
            fairnessWindow: 60000,          // 1 minute
            ...config
        };

        this.transfers = new Map();
        this.peerBandwidth = new Map();
        this.totalBandwidthUsed = 0;
        this.lastCalculation = new Date();

        this.startMonitoring();
    }

    async startTransfer(
        peerId: string,
        type: 'upload' | 'download',
        totalBytes: number,
        priority: number = 5
    ): Promise<Transfer> {
        try {
            // Check if we can start a new transfer
            await this.checkResources(peerId);

            const transfer: Transfer = {
                id: this.generateTransferId(),
                type,
                peerId,
                priority,
                startTime: new Date(),
                bytesTransferred: 0,
                totalBytes,
                speed: 0,
                status: 'queued'
            };

            // Allocate bandwidth
            const allocated = await this.allocateBandwidth(transfer);
            if (allocated) {
                transfer.status = 'active';
            }

            this.transfers.set(transfer.id, transfer);
            this.emit('transferStarted', transfer);

            return transfer;
        } catch (error) {
            console.error('Transfer start failed:', error);
            throw new Error(`Failed to start transfer: ${error.message}`);
        }
    }

    async updateTransfer(transferId: string, bytesTransferred: number): Promise<void> {
        try {
            const transfer = this.transfers.get(transferId);
            if (!transfer) {
                throw new Error(`Transfer not found: ${transferId}`);
            }

            const timeDelta = Date.now() - transfer.startTime.getTime();
            transfer.bytesTransferred = bytesTransferred;
            transfer.speed = (bytesTransferred / timeDelta) * 1000; // bytes per second

            if (bytesTransferred >= transfer.totalBytes) {
                transfer.status = 'completed';
                await this.releaseBandwidth(transfer);
                this.emit('transferComplete', transfer);
            }

            this.transfers.set(transferId, transfer);
        } catch (error) {
            console.error('Transfer update failed:', error);
            throw new Error(`Failed to update transfer: ${error.message}`);
        }
    }

    async pauseTransfer(transferId: string): Promise<void> {
        try {
            const transfer = this.transfers.get(transferId);
            if (!transfer) {
                throw new Error(`Transfer not found: ${transferId}`);
            }

            transfer.status = 'paused';
            await this.releaseBandwidth(transfer);
            this.emit('transferPaused', transfer);
        } catch (error) {
            console.error('Transfer pause failed:', error);
            throw new Error(`Failed to pause transfer: ${error.message}`);
        }
    }

    async resumeTransfer(transferId: string): Promise<void> {
        try {
            const transfer = this.transfers.get(transferId);
            if (!transfer) {
                throw new Error(`Transfer not found: ${transferId}`);
            }

            const allocated = await this.allocateBandwidth(transfer);
            if (allocated) {
                transfer.status = 'active';
                this.emit('transferResumed', transfer);
            }
        } catch (error) {
            console.error('Transfer resume failed:', error);
            throw new Error(`Failed to resume transfer: ${error.message}`);
        }
    }

    private async checkResources(peerId: string): Promise<void> {
        const activeTransfers = Array.from(this.transfers.values())
            .filter(t => t.status === 'active').length;

        if (activeTransfers >= this.config.maxConcurrent) {
            throw new Error('Maximum concurrent transfers reached');
        }

        if (this.totalBandwidthUsed >= this.config.maxBandwidth * this.config.throttleThreshold) {
            throw new Error('Bandwidth threshold reached');
        }
    }

    private async allocateBandwidth(transfer: Transfer): Promise<boolean> {
        const peerBw = this.peerBandwidth.get(transfer.peerId) || {
            peerId: transfer.peerId,
            allocated: 0,
            used: 0,
            transfers: 0,
            lastUpdated: new Date()
        };

        const fairShare = this.calculateFairShare(transfer.peerId);
        if (peerBw.allocated + fairShare > this.config.maxBandwidth) {
            r

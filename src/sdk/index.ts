import { EventEmitter } from 'events';

interface SDKConfig {
    apiUrl: string;
    apiKey?: string;
    timeout: number;        // Request timeout in ms
    retryAttempts: number;  // Number of retry attempts
    debug: boolean;         // Enable debug logging
}

interface StorageOptions {
    redundancyLevel: 'minimum' | 'standard' | 'maximum' | 'custom';
    customRedundancy?: number;
    preferredRegions?: string[];
    encryption?: boolean;
}

interface StorageStatus {
    fileId: string;
    size: number;
    chunks: number;
    redundancy: number;
    regions: string[];
    health: number;
}

interface PaymentInfo {
    balance: number;
    rate: number;
    spent: number;
    reserved: number;
}

class MycostrSDK extends EventEmitter {
    private config: SDKConfig;
    private headers: Record<string, string>;

    constructor(config: Partial<SDKConfig> = {}) {
        super();
        
        this.config = {
            apiUrl: 'http://localhost:3000',
            timeout: 30000,
            retryAttempts: 3,
            debug: false,
            ...config
        };

        this.headers = {
            'Content-Type': 'application/json'
        };

        if (this.config.apiKey) {
            this.headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }
    }

    async storeFile(
        file: Buffer | File | Blob,
        options: Partial<StorageOptions> = {}
    ): Promise<string> {
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            if (options.redundancyLevel) {
                formData.append('redundancy', options.redundancyLevel);
            }
            
            if (options.preferredRegions) {
                formData.append('regions', options.preferredRegions.join(','));
            }

            const response = await this.request('/files/upload', {
                method: 'POST',
                body: formData
            });

            return response.fileId;
        } catch (error) {
            this.logError('File storage failed:', error);
            throw error;
        }
    }

    async retrieveFile(fileId: string): Promise<Buffer> {
        try {
            const response = await this.request(`/files/download/${fileId}`, {
                method: 'GET'
            });

            return Buffer.from(response);
        } catch (error) {
            this.logError('File retrieval failed:', error);
            throw error;
        }
    }

    async getStatus(fileId: string): Promise<StorageStatus> {
        try {
            return await this.request(`/files/status/${fileId}`, {
                method: 'GET'
            });
        } catch (error) {
            this.logError('Status check failed:', error);
            throw error;
        }
    }

    async getPaymentInfo(): Promise<PaymentInfo> {
        try {
            return await this.request('/payments/info', {
                method: 'GET'
            });
        } catch (error) {
            this.logError('Payment info retrieval failed:', error);
            throw error;
        }
    }

    async generateInvoice(amount: number): Promise<string> {
        try {
            const response = await this.request('/payments/invoice', {
                method: 'POST',
                body: JSON.stringify({ amount })
            });

            return response.invoice;
        } catch (error) {
            this.logError('Invoice generation failed:', error);
            throw error;
        }
    }

    private async request(
        endpoint: string,
        options: RequestInit,
        attempt: number = 1
    ): Promise<any> {
        try {
            const url = `${this.config.apiUrl}${endpoint}`;
            
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...this.headers,
                    ...options.headers
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            if (attempt < this.config.retryAttempts) {
                // Exponential backoff
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                
                return this.request(endpoint, options, attempt + 1);
            }

            throw error;
        }
    }

    private logError(message: string, error: any): void {
        if (this.config.debug) {
            console.error(message, error);
        }
        this.emit('error', { message, error });
    }
}

// Helper types and interfaces for developers
export interface FileUploadOptions extends StorageOptions {}
export interface FileStatus extends StorageStatus {}
export interface PaymentDetails extends PaymentInfo {}

// Export main SDK class and types
export default MycostrSDK;
export {
    SDKConfig,
    StorageOptions,
    StorageStatus,
    PaymentInfo
};

// Usage examples
const examples = {
    basic: async () => {
        const sdk = new MycostrSDK();
        const fileId = await sdk.storeFile(Buffer.from('Hello, World!'));
        const st

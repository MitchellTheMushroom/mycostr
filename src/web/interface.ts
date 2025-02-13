import express from 'express';
import { Router } from 'express';
import MycostrClient from '../client/interface';
import multer from 'multer';

interface WebConfig {
    port: number;
    host: string;
    uploadLimit: number;    // Maximum upload size in bytes
    downloadLimit: number;  // Maximum download size in bytes
}

class WebInterface {
    private app: express.Application;
    private client: MycostrClient;
    private config: WebConfig;
    private upload: multer.Multer;

    constructor(config: Partial<WebConfig> = {}) {
        this.config = {
            port: 3000,
            host: 'localhost',
            uploadLimit: 1024 * 1024 * 100, // 100MB
            downloadLimit: 1024 * 1024 * 500, // 500MB
            ...config
        };

        this.client = new MycostrClient();
        this.app = express();
        this.upload = multer({ 
            limits: { fileSize: this.config.uploadLimit }
        });

        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware(): void {
        this.app.use(express.json());
        this.app.use(express.static('public'));
        
        // Basic error handling
        this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
            console.error('Error:', err);
            res.status(500).json({ error: err.message });
        });
    }

    private setupRoutes(): void {
        // File operations routes
        const fileRouter = Router();
        
        fileRouter.post('/upload', this.upload.single('file'), async (req, res) => {
            try {
                if (!req.file) {
                    throw new Error('No file provided');
                }

                const receipt = await this.client.storeFile(
                    req.file.buffer,
                    {
                        redundancyLevel: (req.body.redundancy || 'standard') as any,
                        preferredRegions: req.body.regions?.split(',')
                    }
                );

                res.json(receipt);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        fileRouter.get('/download/:fileId', async (req, res) => {
            try {
                const file = await this.client.retrieveFile(req.params.fileId);
                res.send(file);
            } catch (error) {
                res.status(404).json({ error: error.message });
            }
        });

        fileRouter.get('/status/:fileId', async (req, res) => {
            try {
                const status = await this.client.getStorageStatus(req.params.fileId);
                res.json(status);
            } catch (error) {
                res.status(404).json({ error: error.message });
            }
        });

        // System status routes
        const statusRouter = Router();

        statusRouter.get('/network', async (req, res) => {
            try {
                // TODO: Implement network status retrieval
                res.json({
                    nodes: 0,
                    storage: {
                        total: 0,
                        used: 0
                    },
                    health: 'unknown'
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        statusRouter.get('/storage', async (req, res) => {
            try {
                // TODO: Implement storage status retrieval
                res.json({
                    capacity: 0,
                    used: 0,
                    files: 0,
                    nodes: 0
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Payment routes
        const paymentRouter = Router();

        paymentRouter.get('/balance', async (req, res) => {
            try {
                // TODO: Implement balance retrieval
                res.json({
                    balance: 0,
                    pending: 0,
                    reserved: 0
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        paymentRouter.post('/topup', async (req, res) => {
            try {
                // TODO: Implement Lightning payment handling
                res.json({
                    invoice: 'lightning-invoice',
                    amount: req.body.amount,
                    expires: new Date()
                });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        // Admin routes
        const adminRouter = Router();

        adminRouter.get('/stats', async (req, res) => {
            try {
                // TODO: Implement stats retrieval
                res.json({
                    uptime: 0,
                    storage: {
                        total: 0,
                        used: 0
                    },
                    network: {
                        nodes: 0,
                        connections: 0
                    },
                    payments: {
                        total: 0,
                        active: 0
                    }
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Mount routers
        this.app.use('/api/files', fileRouter);
        this.app.use('/api/status', statusRouter);
        this.app.use('/api/payments', paymentRouter);
        this.app.use('/api/admin', adminRouter);
    }

    async start(): Promise<void> {
        return new Promise((resolve) => {
            this.app.listen(this.config.port, this.config.host, () => {
                console.log(`Web interface listening on ${this.config.host}:${this.config.port}`);
                resolve();
            });
        });
    }

    async stop(): Promise<void> {
        // Cleanup and shutdown
        // TODO: Implement proper shutdown
    }
}

export default WebInterface;

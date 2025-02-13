import { EventEmitter } from 'events';
import crypto from 'crypto';

interface PeerConfig {
    maxPeers: number;         // Maximum number of peer connections
    connectionTimeout: number; // Connection timeout in ms
    messageTimeout: number;    // Message timeout in ms
    pingInterval: number;     // Ping interval in ms
}

interface Peer {
    id: string;
    address: string;
    port: number;
    lastSeen: Date;
    latency: number;
    status: 'connecting' | 'connected' | 'disconnected';
}

interface Message {
    id: string;
    type: MessageType;
    sender: string;
    recipient: string;
    payload: any;
    timestamp: Date;
}

type MessageType = 
    | 'HANDSHAKE'
    | 'PING'
    | 'PONG'
    | 'STORE_REQUEST'
    | 'RETRIEVE_REQUEST'
    | 'SYNC_REQUEST'
    | 'DATA_TRANSFER'
    | 'ERROR';

class P2PNetwork extends EventEmitter {
    private config: PeerConfig;
    private peers: Map<string, Peer>;
    private pendingMessages: Map<string, Message>;
    private messageHandlers: Map<MessageType, Function>;

    constructor(config: Partial<PeerConfig> = {}) {
        super();
        
        this.config = {
            maxPeers: 50,
            connectionTimeout: 5000,   // 5 seconds
            messageTimeout: 30000,     // 30 seconds
            pingInterval: 30000,       // 30 seconds
            ...config
        };

        this.peers = new Map();
        this.pendingMessages = new Map();
        this.messageHandlers = new Map();

        this.setupMessageHandlers();
        this.startMaintenanceRoutines();
    }

    async connectToPeer(address: string, port: number): Promise<Peer> {
        try {
            if (this.peers.size >= this.config.maxPeers) {
                throw new Error('Maximum peer connections reached');
            }

            const peerId = this.generatePeerId(address, port);
            
            const peer: Peer = {
                id: peerId,
                address,
                port,
                lastSeen: new Date(),
                latency: 0,
                status: 'connecting'
            };

            // Simulate connection establishment
            await this.establishConnection(peer);

            this.peers.set(peerId, peer);
            this.emit('peerConnected', peer);

            return peer;
        } catch (error) {
            console.error('Peer connection failed:', error);
            throw new Error(`Failed to connect to peer: ${error.message}`);
        }
    }

    async sendMessage(peerId: string, type: MessageType, payload: any): Promise<string> {
        try {
            const peer = this.peers.get(peerId);
            if (!peer || peer.status !== 'connected') {
                throw new Error(`Peer not connected: ${peerId}`);
            }

            const message: Message = {
                id: this.generateMessageId(),
                type,
                sender: 'self', // Would be actual node ID in implementation
                recipient: peerId,
                payload,
                timestamp: new Date()
            };

            this.pendingMessages.set(message.id, message);
            
            await this.transmitMessage(peer, message);
            
            return message.id;
        } catch (error) {
            console.error('Message send failed:', error);
            throw new Error(`Failed to send message: ${error.message}`);
        }
    }

    async broadcast(type: MessageType, payload: any): Promise<string[]> {
        try {
            const messageIds: string[] = [];

            for (const [peerId, peer] of this.peers) {
                if (peer.status === 'connected') {
                    const messageId = await this.sendMessage(peerId, type, payload);
                    messageIds.push(messageId);
                }
            }

            return messageIds;
        } catch (error) {
            console.error('Broadcast failed:', error);
            throw new Error(`Failed to broadcast message: ${error.message}`);
        }
    }

    private setupMessageHandlers(): void {
        this.messageHandlers.set('HANDSHAKE', this.handleHandshake.bind(this));
        this.messageHandlers.set('PING', this.handlePing.bind(this));
        this.messageHandlers.set('PONG', this.handlePong.bind(this));
        // Add more handlers for other message types
    }

    private async handleHandshake(peer: Peer, message: Message): Promise<void> {
        peer.status = 'connected';
        peer.lastSeen = new Date();
        this.emit('handshakeComplete', peer);
    }

    private async handlePing(peer: Peer, message: Message): Promise<void> {
        await this.sendMessage(peer.id, 'PONG', { pingId: message.id });
    }

    private async handlePong(peer: Peer, message: Message): Promise<void> {
        peer.lastSeen = new Date();
        // Calculate latency
        const pingMessage = this.pendingMessages.get(message.payload.pingId);
        if (pingMessage) {
            peer.latency = Date.now() - pingMessage.timestamp.getTime();
            this.pendingMessages.delete(message.payload.pingId);
        }
    }

    private startMaintenanceRoutines(): void {
        // Regular ping to all peers
        setInterval(() => {
            this.peers.forEach(peer => {
                if (peer.status === 'connected') {
                    this.sendMessage(peer.id, 'PING', { timestamp: Date.now() })
                        .catch(error => console.error('Ping failed:', error));
                }
            });
        }, this.config.pingInterval);

        // Clean up stale pending messages
        setInterval(() => {
            const now = Date.now();
            for (const [id, message] of this.pendingMessages) {
                if (now - message.timestamp.getTime() > this.config.messageTimeout) {
                    this.pendingMessages.delete(id);
                    this.emit('messageTimeout', message);
                }
            }
        }, this.config.messageTimeout);
    }

    private async establishConnection(peer: Peer): Promise<void> {
        return new Promise((resolve, reject) => {
            // Simulate connection process
            setTimeout(() => {
                if (Math.random() > 0.1) { // 90% success rate
                    peer.status = 'connected';
                    resolve();
                } else {
                    reject(new Error('Connection failed'));
                }
            }, Math.random() * 1000);
        });
    }

    private async transmitMessage(peer: Peer, message: Message): Promise<void> {
        return new Promise((resolve, reject) => {
            // Simulate message transmission
            setTimeout(() => {
                if (Math.random() > 0.05) { // 95% success rate
                    this.emit('messageSent', message);
                    resolve();
                } else {
                    reject(new Error('Transmission failed'));
                }
            }, Math.random() * 500);
        });
    }

    private generatePeerId(address: string, port: number): string {
        return `peer_${crypto.createHash('sha256')
            .update(`${address}:${port}`)
            .digest('hex')
            .slice(0, 16)}`;
    }

    private generateMessageId(): string {
        return `msg_${crypto.randomBytes(16).toString('hex')}`;
    }
}

export default P2PNetwork;

import { EventEmitter } from 'events';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

interface AuthConfig {
    tokenExpiration: number;     // Token expiration in seconds
    refreshExpiration: number;   // Refresh token expiration in seconds
    maxLoginAttempts: number;    // Maximum failed login attempts
    lockoutDuration: number;     // Account lockout duration in seconds
    passwordMinLength: number;   // Minimum password length
}

interface User {
    id: string;
    username: string;
    email: string;
    passwordHash: string;
    salt: string;
    twoFactorSecret?: string;
    lastLogin?: Date;
    loginAttempts: number;
    lockedUntil?: Date;
    status: 'active' | 'locked' | 'disabled';
}

interface Session {
    id: string;
    userId: string;
    token: string;
    refreshToken: string;
    created: Date;
    expires: Date;
    lastActivity: Date;
}

class AuthenticationSystem extends EventEmitter {
    private config: AuthConfig;
    private users: Map<string, User>;
    private sessions: Map<string, Session>;
    private jwtSecret: string;

    constructor(config: Partial<AuthConfig> = {}) {
        super();
        
        this.config = {
            tokenExpiration: 3600,        // 1 hour
            refreshExpiration: 2592000,   // 30 days
            maxLoginAttempts: 5,
            lockoutDuration: 900,         // 15 minutes
            passwordMinLength: 12,
            ...config
        };

        this.users = new Map();
        this.sessions = new Map();
        this.jwtSecret = crypto.randomBytes(32).toString('hex');

        this.startSessionCleanup();
    }

    async registerUser(
        username: string,
        email: string,
        password: string
    ): Promise<string> {
        try {
            // Validate input
            this.validateUsername(username);
            this.validateEmail(email);
            this.validatePassword(password);

            // Check for existing user
            if (this.getUserByUsername(username) || this.getUserByEmail(email)) {
                throw new Error('Username or email already exists');
            }

            // Create user
            const salt = crypto.randomBytes(16).toString('hex');
            const passwordHash = await this.hashPassword(password, salt);

            const user: User = {
                id: this.generateUserId(),
                username,
                email,
                passwordHash,
                salt,
                loginAttempts: 0,
                status: 'active'
            };

            this.users.set(user.id, user);
            this.emit('userRegistered', { userId: user.id });

            return user.id;
        } catch (error) {
            this.emit('registrationFailed', { error: error.message });
            throw error;
        }
    }

    async login(
        username: string,
        password: string,
        twoFactorCode?: string
    ): Promise<Session> {
        try {
            const user = this.getUserByUsername(username);
            if (!user) {
                throw new Error('Invalid username or password');
            }

            // Check account status
            if (user.status === 'disabled') {
                throw new Error('Account is disabled');
            }

            if (user.status === 'locked' || 
                (user.lockedUntil && user.lockedUntil > new Date())) {
                throw new Error('Account is locked');
            }

            // Verify password
            const passwordHash = await this.hashPassword(password, user.salt);
            if (passwordHash !== user.passwordHash) {
                await this.handleFailedLogin(user);
                throw new Error('Invalid username or password');
            }

            // Verify 2FA if enabled
            if (user.twoFactorSecret) {
                if (!twoFactorCode) {
                    throw new Error('2FA code required');
                }
                if (!this.verifyTwoFactorCode(user.twoFactorSecret, twoFactorCode)) {
                    throw new Error('Invalid 2FA code');
                }
            }

            // Create session
            const session = await this.createSession(user);
            
            // Update user
            user.lastLogin = new Date();
            user.loginAttempts = 0;
            user.lockedUntil = undefined;

            this.emit('userLoggedIn', { userId: user.id });

            return session;
        } catch (error) {
            this.emit('loginFailed', { username, error: error.message });
            throw error;
        }
    }

    async logout(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            this.sessions.delete(sessionId);
            this.emit('userLoggedOut', { userId: session.userId });
        }
    }

    async refreshSession(refreshToken: string): Promise<Session> {
        try {
            const oldSession = Array.from(this.sessions.values())
                .find(s => s.refreshToken === refreshToken);

            if (!oldSession) {
                throw new Error('Invalid refresh token');
            }

            const user = this.users.get(oldSession.userId);
            if (!user || user.status !== 'active') {
                throw new Error('User account unavailable');
            }

            // Create new session
            const newSession = await this.createSession(user);
            
            // Remove old session
            this.sessions.delete(oldSession.id);

            return newSession;
        } catch (error) {
            this.emit('sessionRefreshFailed', { error: error.message });
            throw error;
        }
    }

    async validateToken(token: string): Promise<User> {
        try {
            const payload = jwt.verify(token, this.jwtSecret) as { userId: string };
            const user = this.users.get(payload.userId);

            if (!user || user.status !== 'active') {
                throw new Error('User account unavailable');
            }

            const session = Array.from(this.sessions.values())
                .find(s => s.token === token);

            if (!session) {
                throw new Error('Session not found');
            }

            if (session.expires < new Date()) {
                throw new Error('Session expired');
            }

            // Update last activity
            session.lastActivity = new Date();

            return user;
        } catch (error) {
            throw new Error('Invalid token');
        }
    }

    async enable2FA(userId: string): Promise<string> {
        const user = this.users.get(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Generate 2FA secret
        const secret = this.generateTwoFactorSecret();
        user.twoFactorSecret = secret;

        this.emit('2FAEnabled', { userId });

        return secret;
    }

    async disable2FA(userId: string, code: string): Promise<void> {
        const user = this.users.get(userId);
        if (!user || !u

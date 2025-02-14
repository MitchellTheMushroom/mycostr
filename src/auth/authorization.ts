import { EventEmitter } from 'events';

interface AuthzConfig {
    maxRoles: number;        // Maximum roles per user
    maxPermissions: number;  // Maximum permissions per role
    cacheTimeout: number;    // Permission cache timeout (ms)
}

interface Role {
    id: string;
    name: string;
    description: string;
    permissions: Set<string>;
    created: Date;
    modified: Date;
}

interface Permission {
    id: string;
    name: string;
    description: string;
    resource: string;
    action: 'create' | 'read' | 'update' | 'delete' | 'manage';
    conditions?: Record<string, any>;
}

interface UserRoles {
    userId: string;
    roles: Set<string>;  // Role IDs
    customPermissions: Set<string>;  // Direct permission IDs
}

class AuthorizationManager extends EventEmitter {
    private config: AuthzConfig;
    private roles: Map<string, Role>;
    private permissions: Map<string, Permission>;
    private userRoles: Map<string, UserRoles>;
    private permissionCache: Map<string, Set<string>>;
    private lastCacheUpdate: Map<string, number>;

    constructor(config: Partial<AuthzConfig> = {}) {
        super();
        
        this.config = {
            maxRoles: 10,
            maxPermissions: 100,
            cacheTimeout: 300000,  // 5 minutes
            ...config
        };

        this.roles = new Map();
        this.permissions = new Map();
        this.userRoles = new Map();
        this.permissionCache = new Map();
        this.lastCacheUpdate = new Map();

        this.initializeDefaultRoles();
    }

    private initializeDefaultRoles(): void {
        // Create admin role
        this.createRole('admin', 'System Administrator', ['*']);
        
        // Create user role
        this.createRole('user', 'Standard User', [
            'file:read',
            'file:create',
            'profile:read',
            'profile:update'
        ]);
    }

    async createRole(
        name: string,
        description: string,
        permissions: string[]
    ): Promise<Role> {
        try {
            const role: Role = {
                id: this.generateRoleId(),
                name,
                description,
                permissions: new Set(permissions),
                created: new Date(),
                modified: new Date()
            };

            this.roles.set(role.id, role);
            this.emit('roleCreated', { roleId: role.id });

            return role;
        } catch (error) {
            this.emit('roleCreationFailed', { error: error.message });
            throw error;
        }
    }

    async definePermission(permission: Omit<Permission, 'id'>): Promise<Permission> {
        try {
            const newPermission: Permission = {
                id: this.generatePermissionId(),
                ...permission
            };

            this.permissions.set(newPermission.id, newPermission);
            this.emit('permissionDefined', { permissionId: newPermission.id });

            return newPermission;
        } catch (error) {
            this.emit('permissionDefinitionFailed', { error: error.message });
            throw error;
        }
    }

    async assignRoleToUser(userId: string, roleId: string): Promise<void> {
        try {
            let userRole = this.userRoles.get(userId);
            if (!userRole) {
                userRole = {
                    userId,
                    roles: new Set(),
                    customPermissions: new Set()
                };
                this.userRoles.set(userId, userRole);
            }

            if (userRole.roles.size >= this.config.maxRoles) {
                throw new Error('Maximum roles per user exceeded');
            }

            userRole.roles.add(roleId);
            this.clearPermissionCache(userId);
            
            this.emit('roleAssigned', { userId, roleId });
        } catch (error) {
            this.emit('roleAssignmentFailed', { userId, roleId, error: error.message });
            throw error;
        }
    }

    async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
        const userRole = this.userRoles.get(userId);
        if (userRole) {
            userRole.roles.delete(roleId);
            this.clearPermissionCache(userId);
            this.emit('roleRemoved', { userId, roleId });
        }
    }

    async grantPermissionToUser(
        userId: string,
        permissionId: string
    ): Promise<void> {
        try {
            let userRole = this.userRoles.get(userId);
            if (!userRole) {
                userRole = {
                    userId,
                    roles: new Set(),
                    customPermissions: new Set()
                };
                this.userRoles.set(userId, userRole);
            }

            userRole.customPermissions.add(permissionId);
            this.clearPermissionCache(userId);
            
            this.emit('permissionGranted', { userId, permissionId });
        } catch (error) {
            this.emit('permissionGrantFailed', { userId, permissionId, error: error.message });
            throw error;
        }
    }

    async revokePermissionFromUser(
        userId: string,
        permissionId: string
    ): Promise<void> {
        const userRole = this.userRoles.get(userId);
        if (userRole) {
            userRole.customPermissions.delete(permissionId);
            this.clearPermissionCache(userId);
            this.emit('permissionRevoked', { userId, permissionId });
        }
    }

    async hasPermission(
        userId: string,
        permissionName: string,
        context?: Record<string, any>
    ): Promise<boolean> {
        try {
            const permissions = await this.getUserPermissions(userId);
            
            // Check for wildcard permission
            if (permissions.has('*')) {
                return true;
            }

            // Check for exact permission
            if (permissions.has(permissionName)) {
                return this.evaluatePermissionConditions(permissionName, context);
            }

            // Check for pattern matches
            for (const permission of permissions) {
                if (this.matchPermissionPattern(permission, permissionName)) {
                    return this.evaluatePermissionConditions(permission, context);
                }
            }

            return false;
        } catch (error) {
            this.emit('permissionCheckFailed', { userId, permissionName, error: error.message });
            return false;
        }
    }

    private async getUserPermissions(userId: string): Promise<Set<string>> {
        // Check cache
        if (this.hasValidCache(userId)) {
            return this.permissionCache.get(userId)!;
        }

        const permissions = new Set<string>();
        const userRole = this.userRoles.get(userId);

        if (userRole) {
            // Add permissions from roles
            for (const roleId of userRole.roles) {
                const role = this.roles.get(roleId);
                if (role) {
                    role.permissions.forEach(p => permissions.add(p));
                }
            }

            // Add custom permissions
            userRole.customPermissions.forEach(p => permissions.add(p));
        }

        // Update cache
        this.permissionCache.set(userId, permissions);
        this.lastCacheUpdate.set(userId, Date.now());

        return permissions;
    }

    private hasValidCache(userId: string): boolean {
        const lastUpdate = this.lastCacheUpdate.get(userId);
        return lastUpdate !== undefined &&
            Date.now() - lastUpdate < this.config.cacheTimeout &&
            this.permissionCache.has(userId);
    }

    private clearPermissionCache(userId: string): void {
        this.permissionCache.delete(userId);
        this.lastCacheUpdate.delete(userId);
    }

    private matchPermissionPattern(pattern: string, permission: string): boolean {
        if (pattern === permission) return true;
        
        const patternParts = pattern.split(':');
        const permissionParts = permission.split(':');

        if (patternParts.length !== permissionParts.length) return false;

        return patternParts.every((part, index) => 
            part === '*' || part === permissionParts[index]
        );
    }

    private evaluatePermissionConditions(
        permission: string,
        context?: Record<string, any>
    ): boolean {
        // TODO: Implement condition evaluation
        return true;
    }

    private generateRoleId(): string {
        return `role_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generatePermissionId(): string {
        return `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Utility methods
    async getRoles(): Promise<Role[]> {
        return Array.from(this.roles.values());
    }

    async getPermissions(): Promise<Permission[]> {
        return Array.from(this.permissions.values());
    }

    async getUserRoles(userId: string): Promise<Role[]> {
        const userRole = this.userRoles.get(userId);
        if (!userRole) return [];

        return Array.from(userRole.roles)
            .map(roleId => this.roles.get(roleId))
            .filter((role): role is Role => role !== undefined);
    }
}

export default AuthorizationManager;

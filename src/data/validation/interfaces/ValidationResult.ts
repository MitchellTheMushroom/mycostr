export interface ValidationError {
    field: string;
    value: any;
    rule: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
    timestamp?: Date;
    context?: any;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    infos: ValidationError[];
    metadata: {
        schema: string;
        version: string;
        timestamp: Date;
        duration: number;
        context?: any;
    };
}

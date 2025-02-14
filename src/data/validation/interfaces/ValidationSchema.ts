export interface ValidationField {
    name: string;
    type: string;
    required: boolean;
    constraints?: {
        min?: number;
        max?: number;
        pattern?: string;
        enum?: any[];
        custom?: (value: any) => boolean;
    };
    nested?: ValidationField[];
}

export interface ValidationRule {
    id: string;
    field: string | string[];
    condition: string;
    params?: any;
    message: string;
    severity: 'error' | 'warning' | 'info';
}

export interface ValidationSchema {
    id: string;
    name: string;
    version: string;
    fields: ValidationField[];
    rules: ValidationRule[];
    metadata?: Record<string, any>;
}

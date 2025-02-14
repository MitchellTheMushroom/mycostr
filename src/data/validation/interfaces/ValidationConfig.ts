import { Logger } from '../../../utils/Logger';

export interface ValidationConfig {
    maxErrors: number;
    cacheTimeout: number;
    customTypes: string[];
    strictMode: boolean;
    logger?: Logger;
}

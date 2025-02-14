import { EventEmitter } from 'events';

interface BillingConfig {
    billingCycle: number;     // Billing cycle length in days
    gracePeriod: number;      // Grace period in days
    minimumBill: number;      // Minimum bill amount in sats
    autoPaymentLimit: number; // Maximum auto-payment amount
}

interface BillingPlan {
    id: string;
    name: string;
    description: string;
    basePrice: number;        // Base price in sats
    includedUsage: {         // Included in base price
        storage: number;      // GB
        bandwidth: number;    // GB
        operations: number;   // Number of operations
    };
    overageRates: {          // Price per unit over included
        storage: number;      // sats per GB
        bandwidth: number;    // sats per GB
        operations: number;   // sats per operation
    };
    features: string[];
    active: boolean;
}

interface UserBilling {
    userId: string;
    planId: string;
    cycleStart: Date;
    cycleEnd: Date;
    usage: {
        storage: number;
        bandwidth: number;
        operations: number;
    };
    balance: number;         // Current balance in sats
    autoPayment: boolean;
    paymentMethod?: string;
}

interface BillingCycle {
    id: string;
    userId: string;
    planId: string;
    startDate: Date;
    endDate: Date;
    usage: {
        storage: number;
        bandwidth: number;
        operations: number;
    };
    charges: {
        base: number;
        storage: number;
        bandwidth: number;
        operations: number;
        discounts: number;
    };
    total: number;
    status: 'open' | 'billed' | 'paid' | 'overdue';
}

class BillingManager extends EventEmitter {
   private config: BillingConfig;
   private plans: Map<string, BillingPlan>;
   private userBilling: Map<string, UserBilling>;
   private billingCycles: Map<string, BillingCycle>;

   constructor(config: Partial<BillingConfig> = {}) {
       super();
       
       this.config = {
           billingCycle: 30,         // 30 days
           gracePeriod: 7,           // 7 days
           minimumBill: 1000,        // 1000 sats
           autoPaymentLimit: 100000,  // 100k sats
           ...config
       };

       this.plans = new Map();
       this.userBilling = new Map();
       this.billingCycles = new Map();

       this.initializeDefaultPlans();
       this.startBillingCycles();
   }

   private initializeDefaultPlans(): void {
       // Basic Plan
       this.createPlan({
           name: 'Basic',
           description: 'Basic storage plan',
           basePrice: 10000,          // 10k sats
           includedUsage: {
               storage: 10,           // 10 GB
               bandwidth: 50,         // 50 GB
               operations: 1000       // 1000 operations
           },
           overageRates: {
               storage: 1000,         // 1000 sats per GB
               bandwidth: 200,        // 200 sats per GB
               operations: 10         // 10 sats per operation
           },
           features: ['basic-support']
       });

       // Pro Plan
       this.createPlan({
           name: 'Pro',
           description: 'Professional storage plan',
           basePrice: 50000,          // 50k sats
           includedUsage: {
               storage: 100,          // 100 GB
               bandwidth: 500,        // 500 GB
               operations: 10000      // 10000 operations
           },
           overageRates: {
               storage: 800,          // 800 sats per GB
               bandwidth: 150,        // 150 sats per GB
               operations: 8          // 8 sats per operation
           },
           features: ['priority-support', 'advanced-analytics']
       });
   }

   async createPlan(plan: Omit<BillingPlan, 'id' | 'active'>): Promise<BillingPlan> {
       const newPlan: BillingPlan = {
           id: this.generatePlanId(),
           ...plan,
           active: true
       };

       this.plans.set(newPlan.id, newPlan);
       this.emit('planCreated', newPlan);

       return newPlan;
   }

   async subscribeToPlan(userId: string, planId: string): Promise<UserBilling> {
       try {
           const plan = this.plans.get(planId);
           if (!plan || !plan.active) {
               throw new Error('Invalid plan');
           }

           const cycleStart = new Date();
           const cycleEnd = new Date(cycleStart);
           cycleEnd.setDate(cycleEnd.getDate() + this.config.billingCycle);

           const userBilling: UserBilling = {
               userId,
               planId,
               cycleStart,
               cycleEnd,
               usage: {
                   storage: 0,
                   bandwidth: 0,
                   operations: 0
               },
               balance: 0,
               autoPayment: false
           };

           this.userBilling.set(userId, userBilling);
           await this.createBillingCycle(userId);

           this.emit('userSubscribed', { userId, planId });

           return userBilling;
       } catch (error) {
           this.emit('subscriptionFailed', { userId, planId, error: error.message });
           throw error;
       }
   }

   async recordUsage(
       userId: string,
       type: keyof UserBilling['usage'],
       amount: number
   ): Promise<void> {
       try {
           const billing = this.userBilling.get(userId);
           if (!billing) {
               throw new Error('User billing not found');
           }

           billing.usage[type] += amount;

           // Update current billing cycle
           const cycle = this.getCurrentBillingCycle(userId);
           if (cycle) {
               cycle.usage[type] += amount;
           }

           this.emit('usageRecorded', { userId, type, amount });
       } catch (error) {
           this.emit('usageRecordingFailed', { userId, type, amount, error: error.message });
           throw error;
       }
   }

   async calculateBill(userId: string): Promise<BillingCycle> {
       try {
           const billing = this.userBilling.get(userId);
           if (!billing) {
               throw new Error('User billing not found');
           }

           const plan = this.plans.get(billing.planId);
           if (!plan) {
               throw new Error('Plan not found');
           }

           const cycle = this.getCurrentBillingCycle(userId);
           if (!cycle) {
               throw new Error('Billing cycle not found');
           }

           // Calculate overage charges
           const storageOverage = Math.max(0, cycle.usage.storage - plan.includedUsage.storage);
           const bandwidthOverage = Math.max(0, cycle.usage.bandwidth - plan.includedUsage.bandwidth);
           const operationsOverage = Math.max(0, cycle.usage.operations - plan.includedUsage.operations);

           cycle.charges = {
               base: plan.basePrice,
               storage: storageOverage * plan.overageRates.storage,
               bandwidth: bandwidthOverage * plan.overageRates.bandwidth,
               operations: operationsOverage * plan.overageRates.operations,
               discounts: 0  // TODO: Implement discounts
           };

           cycle.total = Object.values(cycle.charges).reduce((a, b) => a + b, 0);
           
           if (cycle.total < this.config.minimumBill) {
               cycle.total = this.config.minimumBill;
           }

           return cycle;
       } catch (error) {
           this.emit('billCalculationFailed', { userId, error: error.message });
           throw error;
       }
   }

   private startBillingCycles(): void {
       setInterval(() => this.processBillingCycles(), 86400000); // Daily
   }

   private async processBillingCycles(): Promise<void> {
       const now = new Date();

       for (const [userId, billing] of this.userBilling) {
           try {
               if (billing.cycleEnd <= now) {
                   // Close current cycle
                   const currentCycle = this.getCurrentBillingCycle(userId);
                   if (currentCycle && currentCycle.status === 'open') {
                       await this.closeBillingCycle(currentCycle);
                   }

                   // Start new cycle
                   billing.cycleStart = new Date();
                   billing.cycleEnd = new Date(billing.cycleStart);
                   billing.cycleEnd.setDate(billing.cycleEnd.getDate() + this.config.billingCycle);
                   billing.usage = { storage: 0, bandwidth: 0, operations: 0 };

                   await this.createBillingCycle(userId);
               }
           } catch (error) {
               console.error('Billing cycle processing failed:', error);
           }
       }
   }

   private async closeBillingCycle(cycle: BillingCycle): Promise<void> {
       try {
           await this.calculateBill(cycle.userId);
           cycle.status = 'billed';
           
           const billing = this.userBilling.get(cycle.userId);
           if (billing && billing.autoPayment && cycle.total <= this.config.autoPaymentLimit) {
               await this.processAutoPayment(cycle);
           }

           this.emit('billingCycleClosed', cycle);
       } catch (error) {
           console.error('Billing cycle closure failed:', error);
           cycle.status = 'overdue';
       }
   }

   private async processAutoPayment(cycle: BillingCycle): Promise<void> {
       // TODO: Implement auto-payment processing
   }

   private createBillingCycle(userId: string): BillingCycle {
       const billing = this.userBilling.get(userId);
       if (!billing) {
           throw new Error('User billing not found');
       }

       const cycle: BillingCycle = {
           id: this.generateCycleId(),
           userId,
           planId: billing.planId,
           startDate: billing.cycleStart,
           endDate: billing.cycleEnd,
           usage: { storage: 0, bandwidth: 0, operations: 0 },
           charges: { base: 0, storage: 0, bandwidth: 0, operations: 0, discounts: 0 },
           total: 0,
           status: 'open'
       };

       this.billingCycles.set(cycle.id, cycle);
       return cycle;
   }

   private getCurrentBillingCycle(userId: string): BillingCycle | undefined {
       return Array.from(this.billingCycles.values())
           .find(cycle => cycle.userId === userId && cycle.status === 'open');
   }

   private generatePlanId(): string {
       return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
   }

   private generateCycleId(): string {
       return `cycle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
   }
}

export default BillingManager;

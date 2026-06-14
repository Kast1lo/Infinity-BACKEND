export type PlanType = 'spark' | 'pulse' | 'horizon' | 'eternal';

export interface PlanLimit {
  storageBytes:    bigint;
  maxTasks:        number;
  maxProjects:     number;
  aiCallsPerDay:   number;
  label:           string;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimit> = {
  spark: {
    storageBytes:    5n * 1024n * 1024n * 1024n,
    maxTasks:        30,
    maxProjects:     3,
    aiCallsPerDay:   3,
    label:           'Infinity Spark',
  },
  pulse: {
    storageBytes:    250n * 1024n * 1024n * 1024n,
    maxTasks:        Infinity,
    maxProjects:     Infinity,
    aiCallsPerDay:   20,
    label:           'Infinity Pulse',
  },
  horizon: {
    storageBytes:    1024n * 1024n * 1024n * 1024n,
    maxTasks:        Infinity,
    maxProjects:     Infinity,
    aiCallsPerDay:   Infinity,
    label:           'Infinity Horizon',
  },
  eternal: {
    storageBytes:    1024n * 1024n * 1024n * 1024n,
    maxTasks:        Infinity,
    maxProjects:     Infinity,
    aiCallsPerDay:   Infinity,
    label:           'Infinity Eternal',
  },
};

// Цены тарифов (рубли). ⚠️ Подставь свои значения — это плейсхолдеры.
export type PaidPlan = 'pulse' | 'horizon' | 'eternal';

export interface PlanPrice {
  amount: number;                         // рубли
  period: 'month' | 'year' | 'once';
  recurring: boolean;                     // нужна ли привязка карты (рекуррент)
}

export const PLAN_PRICES: Record<PaidPlan, PlanPrice> = {
  pulse:   { amount: 399,  period: 'month', recurring: true  },
  horizon: { amount: 3599, period: 'year',  recurring: true  },
  eternal: { amount: 4990, period: 'once',  recurring: false },
};

export const ADMIN_EMAILS: string[] = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean);

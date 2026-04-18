export type PlanType = 'spark' | 'pulse' | 'horizon' | 'eternal';

export interface PlanLimit {
  storageBytes: bigint;
  maxTasks:     number;   // Infinity для безлимитных
  label:        string;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimit> = {
  spark: {
    storageBytes: 5n * 1024n * 1024n * 1024n,    // 5 ГБ
    maxTasks:     30,
    label:        'Infinity Spark',
  },
  pulse: {
    storageBytes: 250n * 1024n * 1024n * 1024n,   // 250 ГБ
    maxTasks:     Infinity,
    label:        'Infinity Pulse',
  },
  horizon: {
    storageBytes: 1024n * 1024n * 1024n * 1024n,  // 1 ТБ
    maxTasks:     Infinity,
    label:        'Infinity Horizon',
  },
  eternal: {
    storageBytes: 1024n * 1024n * 1024n * 1024n,  // 1 ТБ
    maxTasks:     Infinity,
    label:        'Infinity Eternal',
  },
};

// Замени на свой реальный email
export const ADMIN_EMAILS: string[] = ['azomget32@gmail.com'];
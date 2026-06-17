export interface StorageInfo {
  usedBytes:  number;
  limitBytes: number;
  percent:    number;
}

// Остаток ресурса по тарифу. limit === -1 означает «безлимит».
export interface CountInfo {
  used:  number;
  limit: number;
}

export interface PlanInfoResponse {
  planType:       string;
  planLabel:      string;
  planExpiresAt:  Date | null;
  isFrozen:       boolean;
  frozenAt:       Date | null;
  daysLeft:       number | null;
  freezeDaysLeft: number | null;
  storage:        StorageInfo;
  tasks:          CountInfo;
  ai:             CountInfo;
  cardBound:      boolean;
  cardLast4:      string | null;
  autoRenew:      boolean;
}

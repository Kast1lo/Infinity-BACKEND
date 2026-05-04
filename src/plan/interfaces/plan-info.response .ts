export interface StorageInfo {
  usedBytes:  number;
  limitBytes: number;
  percent:    number;
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
}

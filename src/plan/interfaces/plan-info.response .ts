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
  daysLeft:       number | null;  // для spark — дней до конца триала
  freezeDaysLeft: number | null;  // для frozen — дней до удаления данных
  storage:        StorageInfo;
}
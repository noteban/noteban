export type NextcloudLoginStart = {
  sessionId: string;
  loginUrl: string;
};

export type NextcloudAccount = {
  serverUrl: string;
  loginName: string;
  userId: string;
  displayName?: string | null;
};

export type NextcloudLoginPoll =
  | { status: 'pending' }
  | { status: 'complete'; account: NextcloudAccount };

export type SyncStatus = {
  status: 'idle' | 'syncing' | 'ok' | 'error';
  lastSyncAt: string | null;
  lastError: string | null;
  conflicts: string[];
};

export type SyncSummary = {
  startedAt: string;
  finishedAt: string;
  uploaded: number;
  downloaded: number;
  deletedLocal: number;
  deletedRemote: number;
  conflicts: string[];
  errors: string[];
};

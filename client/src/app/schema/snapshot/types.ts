/**
 * Shape of the generated snapshot (schema/snapshot/data.ts).
 *
 * Node values are kept loosely typed on purpose: the snapshot is a verbatim
 * copy of whatever Firebase holds, so it must compile even if editors add
 * fields or change a field's shape. Typed access goes through ./index.ts.
 */
export interface SnapshotMeta {
  /** ISO timestamp of when the snapshot was taken. */
  generatedAt: string;
  /** 'firebase' = pulled from the live DB; 'seed' = built from legacy constants. */
  source: 'firebase' | 'seed' | string;
  databaseURL: string;
  root: string;
}

export interface RawSiteSnapshot {
  meta:        SnapshotMeta;
  siteContent: Record<string, unknown> | null;
  blog:        Record<string, unknown> | null;
  profiles:    Record<string, unknown> | unknown[] | null;
  nav:         Record<string, unknown> | null;
  calcConfig:  Record<string, unknown> | null;
}

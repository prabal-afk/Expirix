import type { AlertPlan } from "../alerts";
import type { MovementInput } from "../movements";
import type { AppData, AppNotification, Batch, ISODate, Movement, Product, Settings } from "../types";

/** Everything the app needs from a storage backend. Two implementations: browser demo + Supabase. */
export interface Repo {
  mode: "demo" | "supabase";
  load(): Promise<AppData>;
  upsertProduct(p: Product): Promise<void>;
  /** Deletes the product and its batches/alerts. Stock-movement history is kept (without the links). */
  deleteProduct(id: string): Promise<void>;
  /** Creates a batch together with its opening "received" movement. */
  insertBatch(b: Batch, opening: Movement): Promise<void>;
  /** Updates descriptive batch fields (never the quantity — quantity only changes through movements). */
  updateBatch(b: Batch): Promise<void>;
  deleteBatch(id: string): Promise<void>;
  /** Validates, applies the stock change and writes the audit-trail row in one step. */
  recordMovement(
    input: MovementInput,
    ctx: { today: ISODate; id: string; nowTs: string },
  ): Promise<{ batch: Batch; movement: Movement }>;
  applyAlertPlan(plan: AlertPlan): Promise<void>;
  patchNotifications(ids: string[], patch: Partial<Pick<AppNotification, "read" | "dismissed">>): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  /** Demo: restore the original sample inventory. Supabase: add the sample inventory to the shop. */
  loadSample(today: ISODate): Promise<void>;
}

export class RepoError extends Error {}

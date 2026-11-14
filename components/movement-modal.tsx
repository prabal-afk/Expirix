"use client";

import { t } from "@/lib/i18n-core";
import { useMemo, useState } from "react";
import { daysLabel, formatDate } from "@/lib/dates";
import { planMovement } from "@/lib/movements";
import { formatMoney } from "@/lib/format";
import { useApp } from "@/lib/store";
import { MOVEMENT_LABELS, type MovementType } from "@/lib/types";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

export interface MovementRequest {
  batchId?: string;
  type?: MovementType;
  quantity?: number;
}

const HELP: Record<MovementType, string> = {
  received: "More stock arrived for this batch.",
  sold: "Units sold from this batch.",
  damaged: "Broken, leaking or spoiled units thrown away. Counted as waste.",
  expired_removed: "Expired units taken off the shelf and discarded. Counted as waste.",
  returned: "Units sent back to your supplier. Not counted as waste.",
  adjustment: "Type the quantity you actually counted on the shelf. We calculate the difference.",
};

export function MovementModal({ request, onClose }: { request: MovementRequest | null; onClose: () => void }) {
  return (
    <Modal open={request !== null} onClose={onClose} title={t("Record stock movement")}>
      {request && <MovementForm key={JSON.stringify(request)} request={request} onClose={onClose} />}
    </Modal>
  );
}

function MovementForm({ request, onClose }: { request: MovementRequest; onClose: () => void }) {
  const { views, today, settings, recordMovement, toast } = useApp();
  const options = useMemo(
    () =>
      views
        .filter((v) => !v.empty || v.batch.id === request.batchId)
        .sort((a, b) => a.product.name.localeCompare(b.product.name) || a.batch.expiry_date.localeCompare(b.batch.expiry_date)),
    [views, request.batchId],
  );
  const [filter, setFilter] = useState("");
  const [batchId, setBatchId] = useState(request.batchId ?? "");
  const shown = options.filter(
    (v) => v.batch.id === batchId || `${v.product.name} ${v.product.brand} ${v.batch.batch_no ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const view = options.find((v) => v.batch.id === batchId);

  const expired = view ? view.days < 0 : false;
  const allowed: MovementType[] = expired
    ? ["expired_removed", "damaged", "returned", "adjustment"]
    : ["sold", "received", "damaged", "returned", "adjustment"];
  const [type, setType] = useState<MovementType>(request.type ?? (view && view.days < 0 ? "expired_removed" : "sold"));
  const [qty, setQty] = useState(request.quantity !== undefined ? String(request.quantity) : "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const effectiveType = view && !allowed.includes(type) ? allowed[0] : type;
  const q = Number(qty);
  const plan = view && qty !== "" ? planMovement(view.batch, { type: effectiveType, quantity: q }, today) : null;
  const unit = view?.product.unit ?? "";
  const isRemoval = effectiveType === "sold" || effectiveType === "damaged" || effectiveType === "expired_removed" || effectiveType === "returned";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!view) return setErr("Choose a batch first.");
    if (qty === "") return setErr("Enter a quantity.");
    if (plan && !plan.ok) return setErr(plan.error);
    setBusy(true);
    const r = await recordMovement({ batchId: view.batch.id, type: effectiveType, quantity: q, notes });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast(`${MOVEMENT_LABELS[effectiveType]} recorded. ${view.product.name} now has ${r.movement.qty_after} ${unit} in this batch.`);
    onClose();
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label={t("Batch")} htmlFor="mv-batch" required>
        {options.length > 8 && !request.batchId && (
          <Input aria-label="Search batches" placeholder="Type to filter products…" value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-2" />
        )}
        <Select id="mv-batch" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          <option value="">Select a product batch…</option>
          {shown.map((v) => (
            <option key={v.batch.id} value={v.batch.id}>
              {v.product.name} — {v.batch.batch_no ?? "no batch no."} · exp {formatDate(v.batch.expiry_date, settings.date_format)} · {v.batch.quantity} {v.product.unit}
            </option>
          ))}
        </Select>
      </Field>

      {view && (
        <div className={`rounded-xl px-3.5 py-3 text-sm ${expired ? "bg-red-50 text-red-900 ring-1 ring-red-200" : "bg-slate-50 text-slate-700"}`}>
          <strong>{view.batch.quantity} {unit}</strong> in this batch · {daysLabel(view.days)}
          {expired && <p className="mt-1 font-medium">Expired stock can’t be sold. Remove it and record the waste.</p>}
        </div>
      )}

      <Field label={t("What happened?")} htmlFor="mv-type" hint={HELP[effectiveType]}>
        <Select id="mv-type" value={effectiveType} onChange={(e) => setType(e.target.value as MovementType)}>
          {allowed.map((mt) => (
            <option key={mt} value={mt}>
              {t(MOVEMENT_LABELS[mt])}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={effectiveType === "adjustment" ? `Counted quantity (${unit || "units"})` : `Quantity (${unit || "units"})`} htmlFor="mv-qty" required error={plan && !plan.ok ? plan.error : undefined}>
        <div className="flex gap-2">
          <Input id="mv-qty" type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} invalid={Boolean(plan && !plan.ok)} placeholder="0" />
          {view && isRemoval && view.batch.quantity > 0 && (
            <Button type="button" variant="outline" onClick={() => setQty(String(view.batch.quantity))}>
              All ({view.batch.quantity})
            </Button>
          )}
        </div>
      </Field>

      {plan?.ok && view && (
        <p className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm text-brand-900">
          Stock after this: <strong>{plan.qty_after} {unit}</strong>
          {(effectiveType === "expired_removed" || effectiveType === "damaged") && (
            <> · Waste value: <strong>{formatMoney(Math.abs(plan.qty_change) * view.batch.purchase_price, settings.currency)}</strong> (at purchase price)</>
          )}
        </p>
      )}

      <Field label={t("Notes (optional)")} htmlFor="mv-notes">
        <Textarea id="mv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} rows={2} />
      </Field>

      {err && (
        <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-800">
          {err}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button type="submit" loading={busy}>
          Record movement
        </Button>
      </div>
    </form>
  );
}

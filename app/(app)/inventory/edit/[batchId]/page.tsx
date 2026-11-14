"use client";

import { t } from "@/lib/i18n-core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui";

export default function EditPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = use(params);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/inventory" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> {t("Inventory")}
      </Link>
      <PageHeader title="Edit batch" subtitle="Update the product or batch details." />
      <ProductForm mode="edit" batchId={batchId} />
    </div>
  );
}

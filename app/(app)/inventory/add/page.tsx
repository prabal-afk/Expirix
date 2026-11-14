"use client";

import { t } from "@/lib/i18n-core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ProductForm } from "@/components/product-form";
import { PageHeader, Spinner } from "@/components/ui";

function AddInner() {
  const sp = useSearchParams();
  const product = sp.get("product") ?? undefined;
  const barcode = sp.get("barcode") ?? undefined;
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/inventory" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> {t("Inventory")}
      </Link>
      <PageHeader
        title={product ? "Add a new batch" : "Add Product"}
        subtitle={barcode ? `New barcode ${barcode}. Fill in the product details once.` : "Enter the basics and the expiry date. Expirix does the rest."}
      />
      <ProductForm key={`${product}|${barcode}`} mode="add" productId={product} barcode={barcode} />
    </div>
  );
}

export default function AddPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AddInner />
    </Suspense>
  );
}

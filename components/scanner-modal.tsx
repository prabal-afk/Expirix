"use client";

import { Camera, CameraOff, PackagePlus, ScanBarcode, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import type { MovementRequest } from "./movement-modal";
import { Button, Input, Modal } from "./ui";

type CamState = "idle" | "starting" | "scanning" | "unavailable";

export function ScannerModal({
  open,
  onClose,
  onMovement,
}: {
  open: boolean;
  onClose: () => void;
  onMovement: (r: MovementRequest) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Scan barcode">
      {open && <ScannerBody onClose={onClose} onMovement={onMovement} />}
    </Modal>
  );
}

function ScannerBody({ onClose, onMovement }: { onClose: () => void; onMovement: (r: MovementRequest) => void }) {
  const { data, summaries, toast } = useApp();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cam, setCam] = useState<CamState>("starting");
  const [camMsg, setCamMsg] = useState("");
  const [manual, setManual] = useState("");
  const [found, setFound] = useState<{ code: string; productId: string } | null>(null);
  const handled = useRef(false);

  function handleCode(raw: string) {
    const code = raw.trim();
    if (!code) return;
    const product = data.products.find((p) => p.barcode === code);
    if (product) {
      setFound({ code, productId: product.id });
    } else {
      toast(`Barcode ${code} is new. Fill in the product details to add it.`, "info");
      onClose();
      router.push(`/inventory/add?barcode=${encodeURIComponent(code)}`);
    }
  }

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCam("unavailable");
        setCamMsg(window.isSecureContext ? "This browser can’t access a camera." : "Camera scanning needs a secure (https) connection. Type the barcode below instead.");
        return;
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
        if (cancelled || !videoRef.current) return;
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result) => {
            if (result && !handled.current) {
              handled.current = true;
              controls.stop();
              handleCode(result.getText());
            }
          },
        );
        if (cancelled) controls.stop();
        else {
          stop = () => controls.stop();
          setCam("scanning");
        }
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setCam("unavailable");
        setCamMsg(
          name === "NotAllowedError"
            ? "Camera permission was blocked. Allow the camera in your browser settings, or type the barcode below."
            : name === "NotFoundError"
              ? "No camera was found on this device. Type the barcode below instead."
              : "The camera could not be started. Type the barcode below instead.",
        );
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const product = found ? data.products.find((p) => p.id === found.productId) : null;
  const sum = found ? summaries.find((s) => s.product.id === found.productId) : null;

  if (found && product) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Barcode {found.code} is in your inventory</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{product.name}</p>
          <p className="text-sm text-slate-600">
            {product.brand} · {sum?.sellableQty ?? 0} {product.unit} sellable
          </p>
        </div>
        <div className="grid gap-2">
          <Button
            size="lg"
            onClick={() => {
              onClose();
              router.push(`/inventory/add?product=${product.id}`);
            }}
          >
            <PackagePlus className="h-5 w-5" /> Add a new batch
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => {
              onClose();
              onMovement({ batchId: sum?.fefoBatchId ?? undefined });
            }}
          >
            Update quantity (sell / receive)
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              onClose();
              router.push(`/inventory/${product.id}`);
            }}
          >
            View product
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-900">
        <video ref={videoRef} playsInline muted autoPlay className={`h-full w-full object-cover ${cam === "scanning" ? "" : "opacity-0"}`} />
        {cam === "scanning" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-1/2 w-4/5 rounded-xl border-2 border-white/80" />
          </div>
        )}
        {cam !== "scanning" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-slate-200">
            {cam === "starting" ? <Camera className="h-8 w-8 animate-pulse" /> : <CameraOff className="h-8 w-8" />}
            <p className="text-sm">{cam === "starting" ? "Starting camera…" : camMsg}</p>
          </div>
        )}
      </div>
      {cam === "scanning" && <p className="text-center text-sm text-slate-600">Hold the barcode steady inside the frame.</p>}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleCode(manual);
        }}
      >
        <label htmlFor="manual-barcode" className="block text-sm font-semibold text-slate-800">
          Or type the barcode number
        </label>
        <div className="flex gap-2">
          <Input id="manual-barcode" inputMode="numeric" placeholder="e.g. 8909001001007" value={manual} onChange={(e) => setManual(e.target.value)} />
          <Button type="submit" disabled={!manual.trim()}>
            <Search className="h-4 w-4" /> Look up
          </Button>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-slate-600">
          <ScanBarcode className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Expirix only matches barcodes against products you have already added. It does not look up product names online, so for a new barcode you enter the details once.
        </p>
      </form>
    </div>
  );
}

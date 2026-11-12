"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { MovementModal, type MovementRequest } from "./movement-modal";
import { ScannerModal } from "./scanner-modal";

interface UICtx {
  openScanner: () => void;
  openMovement: (r?: MovementRequest) => void;
}
const Ctx = createContext<UICtx | null>(null);
export const useUI = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUI must be used inside <UIProvider>");
  return v;
};

export function UIProvider({ children }: { children: ReactNode }) {
  const [scanner, setScanner] = useState(false);
  const [movement, setMovement] = useState<MovementRequest | null>(null);
  const openScanner = useCallback(() => setScanner(true), []);
  const openMovement = useCallback((r: MovementRequest = {}) => setMovement(r), []);
  const value = useMemo(() => ({ openScanner, openMovement }), [openScanner, openMovement]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <ScannerModal open={scanner} onClose={() => setScanner(false)} onMovement={(r) => setMovement(r)} />
      <MovementModal request={movement} onClose={() => setMovement(null)} />
    </Ctx.Provider>
  );
}

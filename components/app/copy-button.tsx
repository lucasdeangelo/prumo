"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/** Copies text; on phones it can open the share sheet so the code goes straight to the partner. */
export function CopyButton({ text, label, share = false }: { text: string; label: string; share?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      className="w-full"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          if (share && typeof navigator.share === "function") await navigator.share({ text });
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Copiado" : label}
    </Button>
  );
}

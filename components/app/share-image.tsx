"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Draws a simple summary card (couple totals and goals only, never individual values) and opens the
 * share sheet; falls back to downloading the PNG where sharing files is not supported.
 */
export function ShareImageButton({ title, lines, label = "Compartilhar resumo como imagem" }: { title: string; lines: string[]; label?: string }) {
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#F5F6F3";
      ctx.fillRect(0, 0, 1080, 1350);
      ctx.fillStyle = "#1D4D3F";
      ctx.fillRect(0, 0, 1080, 12);
      ctx.fillStyle = "#121512";
      ctx.font = "600 44px system-ui, sans-serif";
      ctx.fillText("prumo", 96, 150);
      ctx.font = "500 72px system-ui, sans-serif";
      wrap(ctx, title, 96, 330, 888, 86);
      ctx.font = "400 46px system-ui, sans-serif";
      ctx.fillStyle = "#3d413b";
      let y = 620;
      for (const line of lines) y = wrap(ctx, line, 96, y, 888, 60) + 40;
      ctx.fillStyle = "#5E625C";
      ctx.font = "400 32px system-ui, sans-serif";
      ctx.fillText("Finanças a dois, no prumo.", 96, 1260);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      const file = new File([blob], "prumo-resumo.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "prumo-resumo.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // The person closed the share sheet.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={share}>
      {busy ? "Preparando…" : label}
    </Button>
  );
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lineHeight: number): number {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > max && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
  return y;
}

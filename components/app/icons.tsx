// Icons from the design system ("04 Fundamentos · Ícones · traço 1.6 · 24px") and the app's nav bar.
type IconProps = { className?: string; strokeWidth?: number };

function Svg({ className, strokeWidth = 1.6, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => <Svg {...p}><path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></Svg>;
export const CalendarIcon = (p: IconProps) => <Svg {...p}><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16M9 3v4M15 3v4" /></Svg>;
export const CardIcon = (p: IconProps) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h4" /></Svg>;
export const RepeatIcon = (p: IconProps) => <Svg {...p}><path d="M17 3l3 3-3 3" /><path d="M4 12v-2a4 4 0 0 1 4-4h12" /><path d="M7 21l-3-3 3-3" /><path d="M20 12v2a4 4 0 0 1-4 4H4" /></Svg>;
export const SlidersIcon = (p: IconProps) => <Svg {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Svg>;
export const PlusIcon = (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const WalletIcon = (p: IconProps) => <Svg {...p}><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1" /></Svg>;
export const BankIcon = (p: IconProps) => <Svg {...p}><path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></Svg>;
export const ChatIcon = (p: IconProps) => <Svg {...p}><path d="M4 19l1.3-3.9A8 8 0 1 1 8.9 18.7z" /></Svg>;
export const TagIcon = (p: IconProps) => <Svg {...p}><path d="M3 12V4h8l9 9-8 8z" /><circle cx="7.5" cy="8.5" r="1.2" /></Svg>;
export const DownloadIcon = (p: IconProps) => <Svg {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>;
export const SparkIcon = (p: IconProps) => <Svg {...p}><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" /></Svg>;
export const ChevronRightIcon = (p: IconProps) => <Svg {...p}><path d="M9 5l7 7-7 7" /></Svg>;
export const SignOutIcon = (p: IconProps) => <Svg {...p}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></Svg>;

/** The Prumo symbol ("F · Rumo corrigido"): a path that wavers and ends straight, pointing up. */
export function PrumoSymbol({ className, color = "currentColor", strokeWidth = 4.5 }: { className?: string; color?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <path d="M20 60c0-12 24-12 24-24 0-8-12-6-12-16V8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 15l8-8 8 8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Symbol + lowercase wordmark, as on the sign-in screen ("Entrar": 32 px symbol, 30 px bold). */
export function PrumoLogo({ size = "md" }: { size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className="inline-flex items-center gap-2.5 text-foreground" aria-label="Prumo">
      <PrumoSymbol className={lg ? "size-8" : "size-6"} color="var(--primary)" strokeWidth={5.5} />
      <span className={lg ? "text-[30px] font-bold tracking-[-0.05em]" : "text-[22px] font-bold tracking-[-0.05em]"}>prumo</span>
    </span>
  );
}

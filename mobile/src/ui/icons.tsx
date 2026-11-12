// Icons from the design system ("04 Fundamentos · Ícones · traço 1.6 · 24px"), same paths as the web.
import { memo } from "react";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

import { colors } from "./theme";

type IconProps = { size?: number; color?: string; strokeWidth?: number };

function make(children: React.ReactNode) {
  return memo(function Icon({ size = 24, color = colors.foreground, strokeWidth = 1.6 }: IconProps) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </Svg>
    );
  });
}

export const HomeIcon = make(<Path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />);
export const CalendarIcon = make(<><Rect x="4" y="5" width="16" height="15" rx="2.5" /><Path d="M4 10h16M9 3v4M15 3v4" /></>);
export const CardIcon = make(<><Rect x="3" y="5" width="18" height="14" rx="2.5" /><Path d="M3 10h18M7 15h4" /></>);
export const RepeatIcon = make(<><Path d="M17 3l3 3-3 3" /><Path d="M4 12v-2a4 4 0 0 1 4-4h12" /><Path d="M7 21l-3-3 3-3" /><Path d="M20 12v2a4 4 0 0 1-4 4H4" /></>);
export const SlidersIcon = make(<><Path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><Circle cx="16" cy="7" r="2" /><Circle cx="10" cy="17" r="2" /></>);
export const PlusIcon = make(<Path d="M12 5v14M5 12h14" />);
export const WalletIcon = make(<><Rect x="3" y="6" width="18" height="13" rx="2.5" /><Path d="M3 10h18" /><Circle cx="16.5" cy="14.5" r="1" /></>);
export const BankIcon = make(<Path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />);
export const ChatIcon = make(<Path d="M4 19l1.3-3.9A8 8 0 1 1 8.9 18.7z" />);
export const TagIcon = make(<><Path d="M3 12V4h8l9 9-8 8z" /><Circle cx="7.5" cy="8.5" r="1.2" /></>);
export const DownloadIcon = make(<Path d="M12 4v11M7 10l5 5 5-5M5 20h14" />);
export const SparkIcon = make(<Path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />);
export const ChevronRightIcon = make(<Path d="M9 5l7 7-7 7" />);
export const ChevronLeftIcon = make(<Path d="M15 5l-7 7 7 7" />);
export const SignOutIcon = make(<Path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />);
export const XIcon = make(<Path d="M6 6l12 12M18 6L6 18" />);
export const TrashIcon = make(<Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />);
export const MessageIcon = make(<Path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z" />);
export const CheckIcon = make(<Path d="M5 12l5 5 9-10" />);

/** Visibility badge icons (12px, stroke 2). */
export const LockIcon = make(<><Rect x="5" y="11" width="14" height="9" rx="2" /><Path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const TotalsIcon = make(<Path d="M5 12h14M5 7h14M5 17h8" />);
export const GiftIcon = make(<><Rect x="4" y="9" width="16" height="11" rx="1.5" /><Path d="M12 9v11M4 13h16M12 9c-2-4-6-3-5 0M12 9c2-4 6-3 5 0" /></>);
export const EyeIcon = make(<><Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><Circle cx="12" cy="12" r="3" /></>);

/** The Prumo symbol: the plumb line (direction) and the weight (two halves, one center). */
export function PrumoSymbol({ height = 32, color = colors.primary, strokeWidth = 1.6 }: { height?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={(height * 24) / 32} height={height} viewBox="0 0 24 32" fill="none">
      <Line x1="8" y1="2" x2="16" y2="2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="12" y1="2" x2="12" y2="18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M12 18 A6 6 0 0 0 12 30 Z" fill={color} />
      <Circle cx="12" cy="24" r="6" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

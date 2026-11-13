// Loading screen from the design system ("09 Splash — carregamento (RN)"): the path draws itself, the
// arrow head appears, a short bar slides under it. It covers the app while the session is read and
// fades out once it is ready. The native splash (same green, same symbol) is hidden as soon as this
// screen is on screen, so the hand-off is seamless.
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { PRUMO_HEAD, PRUMO_PATH } from "./icons";
import { Txt } from "./kit";
import { colors } from "./theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const CYCLE = 2400;
const SYMBOL = 112;
/** A bit longer than the path itself (~72 units), so dash and gap each cover it whole. */
const DASH = 80;
const BAR = 96;
/** Long enough for the path to finish drawing once; a fast start never just flashes. */
const MIN_VISIBLE = 1300;

export function LoadingScreen({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(false);
  const shownAt = useRef(0);
  const [loop] = useState(() => new Animated.Value(0));
  const [bar] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    shownAt.current = Date.now();
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const draw = Animated.loop(Animated.timing(loop, { toValue: 1, duration: CYCLE, easing: Easing.linear, useNativeDriver: false }));
    const slide = Animated.loop(Animated.timing(bar, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    draw.start();
    slide.start();
    return () => {
      draw.stop();
      slide.stop();
    };
  }, [reduceMotion, loop, bar]);

  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, MIN_VISIBLE - (Date.now() - shownAt.current));
    const timer = setTimeout(() => {
      setLeaving(true);
      Animated.timing(fade, { toValue: 0, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: true }).start(() => onDone());
    }, wait);
    return () => clearTimeout(timer);
  }, [ready, fade, onDone]);

  // Path: drawn during the first 55% of the cycle (cubic-bezier(.6,0,.2,1)), then held.
  const drawEase = Easing.bezier(0.6, 0, 0.2, 1);
  const dashOffset = loop.interpolate({ inputRange: [0, 0.55, 1], outputRange: [DASH, 0, 0], easing: (t) => drawEase(t) });
  // Arrow head: hidden until 45%, in by 60%.
  const headOpacity = loop.interpolate({ inputRange: [0, 0.45, 0.6, 1], outputRange: [0, 0, 1, 1] });
  const headShift = loop.interpolate({ inputRange: [0, 0.45, 0.6, 1], outputRange: [6, 6, 0, 0] });
  const barWidth = BAR * 0.4;
  const barX = bar.interpolate({ inputRange: [0, 1], outputRange: [-barWidth, barWidth * 2.5] });

  return (
    <Animated.View
      pointerEvents={leaving ? "none" : "auto"}
      onLayout={() => SplashScreen.hideAsync().catch(() => {})}
      style={[StyleSheet.absoluteFill, styles.screen, { opacity: fade }]}
    >
      <StatusBar style="light" />
      <View accessible accessibilityRole="image" accessibilityLabel="Prumo carregando" style={styles.center}>
        <Svg width={SYMBOL} height={SYMBOL} viewBox="0 0 64 64" fill="none">
          <Path d={PRUMO_PATH} stroke="#FFFFFF" strokeOpacity={0.16} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
          <AnimatedPath
            d={PRUMO_PATH}
            stroke="#FFFFFF"
            strokeWidth={4.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[DASH, DASH]}
            strokeDashoffset={reduceMotion ? 0 : dashOffset}
          />
          <AnimatedPath
            d={PRUMO_HEAD}
            stroke="#FFFFFF"
            strokeWidth={4.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={reduceMotion ? 1 : headOpacity}
            translateY={reduceMotion ? 0 : headShift}
          />
        </Svg>
        <Txt size={34} weight="bold" color="#FFFFFF" tracking={-1.7} lh={38}>prumo</Txt>
      </View>

      <View style={[styles.footer, { bottom: 72 + insets.bottom }]}>
        <View accessibilityRole="progressbar" accessibilityLabel="Carregando" style={styles.track}>
          <Animated.View style={[styles.bar, { width: barWidth, transform: [{ translateX: reduceMotion ? 0 : barX }] }]} />
        </View>
        <Txt size={13} color="#CFE0D8">Tome prumo hoje.</Txt>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", zIndex: 10 },
  center: { alignItems: "center", gap: 20 },
  footer: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 16 },
  track: { width: BAR, height: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden" },
  bar: { height: 3, borderRadius: 999, backgroundColor: "#FFFFFF" },
});

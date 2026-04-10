import { useRef } from 'react';
import { Animated, Dimensions, StyleSheet, Text, View } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DEFAULT_THRESHOLD = 110;

type Props = {
  label: string;
  activeColor: string;
  dimColor: string;
  threshold?: number;
  disappears?: boolean;
  onAction: () => void;
  onCommit: () => void;
  children: React.ReactNode;
};

export function SwipeToActionRow({
  label,
  activeColor,
  dimColor,
  threshold = DEFAULT_THRESHOLD,
  disappears = true,
  onAction,
  onCommit,
  children,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const actionFired = useRef(false);
  const isAnimating = useRef(false);

  const bgColor = translateX.interpolate({
    inputRange: [-threshold, -threshold * 0.3, 0],
    outputRange: [activeColor, dimColor, dimColor],
    extrapolate: 'clamp',
  });

  const scaleX = translateX.interpolate({
    inputRange: [-threshold, 0],
    outputRange: [0.97, 1.0],
    extrapolate: 'clamp',
  });

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX } }],
    {
      useNativeDriver: false,
      listener: (event: any) => {
        const tx = event.nativeEvent.translationX;
        if (tx <= -threshold && !actionFired.current && !isAnimating.current) {
          actionFired.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onAction();
        }
      },
    }
  );

  const onHandlerStateChange = (event: any) => {
    const { state } = event.nativeEvent;
    if (![State.END, State.CANCELLED, State.FAILED].includes(state)) return;
    if (isAnimating.current) return;

    const fired = actionFired.current;
    actionFired.current = false;
    isAnimating.current = true;

    if (fired) {
      if (disappears) {
        Animated.timing(translateX, {
          toValue: -SCREEN_WIDTH,
          duration: 150,
          useNativeDriver: false,
        }).start(() => {
          isAnimating.current = false;
          onCommit();
          translateX.setValue(0);
        });
      } else {
        // Commit immediately so the row re-renders in its new style before springing back
        onCommit();
        Animated.spring(translateX, {
          toValue: 0,
          bounciness: 4,
          useNativeDriver: false,
        }).start(() => {
          isAnimating.current = false;
        });
      }
    } else {
      Animated.spring(translateX, {
        toValue: 0,
        bounciness: 4,
        useNativeDriver: false,
      }).start(() => {
        isAnimating.current = false;
      });
    }
  };

  return (
    <PanGestureHandler
      activeOffsetX={[-10, 5]}
      failOffsetY={[-15, 15]}
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
    >
      <View style={styles.container}>
        <Animated.View style={[styles.background, { backgroundColor: bgColor }]}>
          <Text style={styles.label}>{label}</Text>
        </Animated.View>
        <Animated.View style={{ transform: [{ translateX }, { scaleX }] }}>
          {children}
        </Animated.View>
      </View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  background: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 24,
  },
  label: { color: '#fff', fontWeight: '600', fontSize: 14 },
});

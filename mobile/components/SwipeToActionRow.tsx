import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

const DEFAULT_ACTION_WIDTH = 200;
const THRESHOLD = 80;

type Props = {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  actionWidth?: number;
  renderActions: () => React.ReactNode;
  children: React.ReactNode;
};

export function SwipeToActionRow({
  isOpen,
  onOpen,
  onClose,
  actionWidth = DEFAULT_ACTION_WIDTH,
  renderActions,
  children,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  // Snap closed when parent tells us to close (another row opened)
  useEffect(() => {
    if (!isOpen) {
      isAnimating.current = true;
      Animated.spring(translateX, {
        toValue: 0,
        bounciness: 4,
        useNativeDriver: true,
      }).start(() => { isAnimating.current = false; });
    }
  }, [isOpen]);

  const onGestureEvent = (event: any) => {
    if (isAnimating.current) return;
    const raw = event.nativeEvent.translationX;
    const base = isOpenRef.current ? -actionWidth : 0;
    // Only allow leftward swipe; clamp so it can't go positive
    const clamped = Math.min(0, Math.max(base + raw, -actionWidth));
    translateX.setValue(clamped);
  };

  const onHandlerStateChange = (event: any) => {
    const { state, translationX } = event.nativeEvent;
    if (![State.END, State.CANCELLED, State.FAILED].includes(state)) return;
    if (isAnimating.current) return;

    const base = isOpenRef.current ? -actionWidth : 0;
    const effective = Math.min(0, Math.max(base + translationX, -actionWidth));

    isAnimating.current = true;

    if (!isOpenRef.current && effective <= -THRESHOLD) {
      // Crossed threshold while closed → snap open
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Animated.spring(translateX, {
        toValue: -actionWidth,
        bounciness: 4,
        useNativeDriver: true,
      }).start(() => { isAnimating.current = false; });
      onOpen();
    } else if (isOpenRef.current && effective > -(actionWidth / 2)) {
      // Swiped enough right while open → snap closed
      Animated.spring(translateX, {
        toValue: 0,
        bounciness: 4,
        useNativeDriver: true,
      }).start(() => { isAnimating.current = false; });
      onClose();
    } else if (!isOpenRef.current) {
      // Didn't reach threshold — spring back to closed
      Animated.spring(translateX, {
        toValue: 0,
        bounciness: 4,
        useNativeDriver: true,
      }).start(() => { isAnimating.current = false; });
    } else {
      // Open, small drag — stay open
      Animated.spring(translateX, {
        toValue: -actionWidth,
        bounciness: 4,
        useNativeDriver: true,
      }).start(() => { isAnimating.current = false; });
    }
  };

  return (
    <PanGestureHandler
      activeOffsetX={[-10, 10]}
      failOffsetY={[-15, 15]}
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
    >
      <View style={styles.container}>
        <View style={[styles.actionsPanel, { width: actionWidth }]}>
          {renderActions()}
        </View>
        <Animated.View style={{ transform: [{ translateX }] }}>
          {children}
        </Animated.View>
      </View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  actionsPanel: {
    ...StyleSheet.absoluteFillObject,
    left: undefined,
    right: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
});

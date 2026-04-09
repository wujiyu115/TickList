import { useRef, useCallback } from 'react';

interface UseLongPressOptions {
  duration?: number; // 长按时长，默认 500ms
  onLongPress: () => void;
}

export const useLongPress = ({ onLongPress, duration = 500 }: UseLongPressOptions) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    isLongPressRef.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onLongPress();
    }, duration);
  }, [onLongPress, duration]);

  const handleTouchMove = useCallback(() => {
    // 滑动时取消长按
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // 如果是长按触发的，阻止后续 click 事件
    if (isLongPressRef.current) {
      e.preventDefault();
    }
  }, []);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    isLongPress: isLongPressRef, // 让外部判断本次触摸是否为长按
  };
};

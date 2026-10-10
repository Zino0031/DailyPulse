import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Asks before leaving a screen with unsaved changes. Catches header back,
 * Android back and web history; the iOS swipe-down gesture is disabled while
 * dirty (native gestures can't be intercepted). Call `leave()` to navigate
 * away on purpose (e.g. after saving) without the prompt.
 */
export function useDiscardGuard(dirty: boolean) {
  const navigation = useNavigation();
  const bypass = useRef(false);
  const [proceed, setProceed] = useState<(() => void) | null>(null);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !dirty });
    if (!dirty) return;
    return navigation.addListener('beforeRemove', (event) => {
      if (bypass.current) return;
      event.preventDefault();
      setProceed(() => () => navigation.dispatch(event.data.action));
    });
  }, [dirty, navigation]);

  const leave = useCallback(() => {
    bypass.current = true;
    // Deep-linked straight into the modal: there's nothing to go back to.
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace('/closet');
  }, [navigation]);

  return {
    leave,
    confirmVisible: proceed !== null,
    confirmDiscard: () => {
      const go = proceed;
      setProceed(null);
      bypass.current = true;
      go?.();
    },
    keepEditing: () => setProceed(null),
  };
}

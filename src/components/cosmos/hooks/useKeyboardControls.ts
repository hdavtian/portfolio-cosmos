import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect } from "react";

export const useKeyboardControls = (params: {
  enabled: boolean;
  keyboardStateRef: MutableRefObject<Record<string, boolean>>;
  setKeyboardUpdateTrigger: Dispatch<SetStateAction<number>>;
}) => {
  const { enabled, keyboardStateRef, setKeyboardUpdateTrigger } = params;

  useEffect(() => {
    if (!enabled) {
      Object.keys(keyboardStateRef.current).forEach((key) => {
        keyboardStateRef.current[key] = false;
      });
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code in keyboardStateRef.current) {
        e.preventDefault();
        e.stopPropagation();
        keyboardStateRef.current[e.code] = true;
        setKeyboardUpdateTrigger((prev) => prev + 1);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code in keyboardStateRef.current) {
        e.preventDefault();
        e.stopPropagation();
        keyboardStateRef.current[e.code] = false;
        setKeyboardUpdateTrigger((prev) => prev + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      Object.keys(keyboardStateRef.current).forEach((key) => {
        keyboardStateRef.current[key] = false;
      });
    };
  }, [enabled, keyboardStateRef, setKeyboardUpdateTrigger]);
};

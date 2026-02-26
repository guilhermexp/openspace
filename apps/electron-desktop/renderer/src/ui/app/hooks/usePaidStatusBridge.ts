import React from "react";
import { useAppDispatch } from "@store/hooks";
import { authActions } from "@store/slices/authSlice";

export function usePaidStatusBridge(): void {
  const dispatch = useAppDispatch();

  React.useEffect(() => {
    const onFocus = () => {
      dispatch(authActions.appFocused());
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        dispatch(authActions.appVisible());
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [dispatch]);
}

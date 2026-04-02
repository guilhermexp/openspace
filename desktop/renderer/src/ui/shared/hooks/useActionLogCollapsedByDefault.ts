import React from "react";

const ACTION_LOG_COLLAPSED_KEY = "action-log-collapsed-by-default";
const ACTION_LOG_COLLAPSED_EVENT = "action-log-collapsed-by-default-changed";

export function useActionLogCollapsedByDefault(): [boolean, (v: boolean) => void] {
  const [collapsedByDefault, setCollapsedByDefault] = React.useState(() => {
    try {
      return localStorage.getItem(ACTION_LOG_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    const handler = () => {
      try {
        setCollapsedByDefault(localStorage.getItem(ACTION_LOG_COLLAPSED_KEY) === "1");
      } catch {
        // ignore
      }
    };

    window.addEventListener(ACTION_LOG_COLLAPSED_EVENT, handler);
    return () => window.removeEventListener(ACTION_LOG_COLLAPSED_EVENT, handler);
  }, []);

  const update = React.useCallback((next: boolean) => {
    setCollapsedByDefault(next);
    try {
      localStorage.setItem(ACTION_LOG_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(ACTION_LOG_COLLAPSED_EVENT));
  }, []);

  return [collapsedByDefault, update];
}

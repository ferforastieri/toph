import { useEffect, useRef } from "react";

/**
 * The phone's own back button (and the browser's): the app keeps one history
 * entry so the WebView can go back instead of closing. Each back asks the
 * screen to close its topmost thing; while something was closed the entry is
 * put back, and only the last one (at the root) lets the app leave.
 */
export function useMobileBack(onBack: () => boolean) {
  const handler = useRef(onBack);
  handler.current = onBack;

  useEffect(() => {
    function keep() {
      window.history.pushState({ toph: true }, "");
    }
    function pop() {
      if (handler.current()) keep();
    }
    keep();
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
}

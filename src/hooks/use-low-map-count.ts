import { useCallback, useEffect, useState } from "react";
import { useStoredState } from "@/hooks/use-stored-state";
import { backend } from "@/lib/backend";

/**
 * On Linux, the system's memory map limit when it's too low for DayZ, or `null` when it's fine or the player chose not
 * to be warned. Checked again when the window regains focus, so the warning goes once the player has raised it.
 */
export function useLowMapCount() {
  const [limit, setLimit] = useState<number | null>(null);
  const [dismissed, setDismissed] = useStoredState("mapCountWarningDismissed", false);

  useEffect(() => {
    if (dismissed) return;
    const check = () =>
      backend
        .lowMapCount()
        .then(setLimit)
        .catch(() => setLimit(null));
    void check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [dismissed]);

  const dismiss = useCallback(() => setDismissed(true), [setDismissed]);
  return { limit: dismissed ? null : limit, dismiss };
}

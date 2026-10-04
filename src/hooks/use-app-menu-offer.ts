import { useEffect } from "react";
import { toast } from "sonner";
import { backend, errorMessage } from "@/lib/backend";

/** Set once the player has answered the offer, so it is only made once. */
const OFFERED = "appMenuOffered";
/** Set just before adding, so the copy that reopens from the app menu can say it worked. */
const JUST_ADDED = "appMenuJustAdded";

// Shown as the launcher reopens, so it stays long enough to be seen while the server list loads.
const added = () =>
  toast.success("Flare Launcher is in your app menu", {
    description: "Open it from there from now on.",
    duration: 10_000,
  });

/** Records that the player has answered the offer, so it isn't made again. */
export function markAppMenuOffered() {
  localStorage.setItem(OFFERED, "1");
}

/**
 * Adds the launcher to the Linux app menu. When the file has to move, the launcher reopens from its new place and the
 * new window confirms it; otherwise this one does. Resolves to whether it worked.
 */
export async function addToAppMenu(): Promise<boolean> {
  localStorage.setItem(JUST_ADDED, "1");
  try {
    const reopening = await backend.addToAppMenu();
    if (!reopening) {
      localStorage.removeItem(JUST_ADDED);
      added();
    }
    return true;
  } catch (error) {
    localStorage.removeItem(JUST_ADDED);
    toast.error("Couldn't add Flare Launcher to the app menu", { description: errorMessage(error) });
    return false;
  }
}

/**
 * On Linux, offers once to put the launcher in the app menu, unless it is already there. An AppImage has no installer,
 * so this is what makes it open like any other app. Waits while `enabled` is false: first-time setup offers it itself.
 */
export function useAppMenuOffer(enabled: boolean) {
  useEffect(() => {
    if (localStorage.getItem(JUST_ADDED)) {
      localStorage.removeItem(JUST_ADDED);
      added();
      return;
    }
    if (!enabled || localStorage.getItem(OFFERED)) return;
    let cancelled = false;
    backend
      .appMenuStatus()
      .then((menu) => {
        if (cancelled || !menu.supported || menu.added) return;
        const answered = markAppMenuOffered;
        toast("Add Flare Launcher to your app menu?", {
          id: "app-menu-offer",
          description: "Open it like any other app. It moves to your Applications folder.",
          duration: Infinity,
          action: {
            label: "Add",
            onClick: () => {
              answered();
              void addToAppMenu();
            },
          },
          cancel: { label: "Not now", onClick: answered },
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);
}

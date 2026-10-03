import { useState, type KeyboardEvent } from "react";

/**
 * Arrow-key movement through a list of suggestions under a text box, which keeps focus while the list is browsed.
 * Nothing is active until an arrow key is pressed, so Enter on its own keeps what was typed.
 */
export function useActiveOption(count: number, choose: (index: number) => void, close: () => void) {
  const [active, setActive] = useState(-1);
  const current = active < count ? active : -1;

  function onKeyDown(event: KeyboardEvent) {
    if (count === 0) return;
    switch (event.key) {
      case "ArrowDown":
        setActive((current + 1) % count);
        break;
      case "ArrowUp":
        setActive(current <= 0 ? count - 1 : current - 1);
        break;
      case "Enter":
        if (current >= 0) choose(current);
        else close();
        break;
      case "Escape":
        close();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return { active: current, setActive, onKeyDown };
}

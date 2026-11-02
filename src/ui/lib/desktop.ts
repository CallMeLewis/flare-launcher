/**
 * Turns off the web view's own right-click menu (Back, Reload, Inspect), which has no place in a desktop app. Text
 * fields keep theirs, for pasting an address or a path. Call once at startup.
 */
export function blockWebviewMenu(): void {
  document.addEventListener("contextmenu", (event) => {
    const target = event.target;
    const editable = target instanceof HTMLElement && target.closest("input, textarea, [contenteditable='true']");
    if (!editable) event.preventDefault();
  });
}

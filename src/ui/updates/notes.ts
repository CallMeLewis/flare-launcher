/** The "- " bullet lines of release notes, such as those in the update feed; anything else is ignored. */
export function releaseNoteItems(notes: string | null | undefined): string[] {
  return (notes ?? "")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

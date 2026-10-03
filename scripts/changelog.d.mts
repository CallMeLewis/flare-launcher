export interface Release {
  version: string;
  date: string | null;
  items: string[];
}
export function parseChangelog(text: string): Release[];
export function notesFor(text: string, version: string): string[] | null;
export function compareVersions(a: string, b: string): number;

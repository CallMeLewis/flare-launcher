export interface Release {
  version: string;
  date: string | null;
  items: string[];
}

/** Every version in the file, in file order (newest first). */
export function parseChangelog(text: string): Release[];
/** Why a version can't be released, if it can't: only stable versions and betas such as 1.2.0-beta.1 can. */
export function versionProblem(version: string, app: string): string | null;
/** One version's notes, or null when the file has no section for it. */
export function notesFor(text: string, version: string): string[] | null;
/** Semantic version order: 1.2.0-beta.1 < 1.2.0-beta.2 < 1.2.0 < 1.2.1. */
export function compareVersions(a: string, b: string): number;

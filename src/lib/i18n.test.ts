import { readFileSync } from "node:fs";
import { formatter } from "@lingui/format-po";
import { describe, expect, it } from "vitest";
import { LOCALES, resolveLocale } from "./i18n";

describe("resolveLocale", () => {
  it("uses the chosen language", () => {
    expect(resolveLocale("en-US", ["en-GB"])).toBe("en-US");
    expect(resolveLocale("de", ["fr-FR"])).toBe("de");
  });

  it("follows the computer's first language the launcher has", () => {
    expect(resolveLocale("system", ["en-US", "en-GB"])).toBe("en-US");
    expect(resolveLocale("system", ["it-IT", "en-us"])).toBe("en-US");
    expect(resolveLocale("system", ["fr-FR", "en-US"])).toBe("fr");
  });

  it("uses a language the launcher has from another region", () => {
    expect(resolveLocale("system", ["fr-CA"])).toBe("fr");
    expect(resolveLocale("system", ["de-AT"])).toBe("de");
    expect(resolveLocale("system", ["es-MX"])).toBe("es");
    expect(resolveLocale("system", ["en-AU"])).toBe("en-GB");
    expect(resolveLocale("system", ["en"])).toBe("en-GB");
  });

  it("uses British English for languages it doesn't have", () => {
    expect(resolveLocale("system", ["it-IT", "pt-BR"])).toBe("en-GB");
    expect(resolveLocale("system", [])).toBe("en-GB");
  });
});

async function catalogue(locale: string) {
  const content = readFileSync(new URL(`../locales/${locale}.po`, import.meta.url), "utf8");
  return formatter().parse(content, { locale, sourceLocale: "en-GB", filename: `${locale}.po` });
}

/** The placeholders and tags in a message, which its translations have to keep. */
const parts = (text = "") =>
  [...text.matchAll(/\{(\w+)[,}]|<\/?(\d+)\/?>/g)]
    .map((match) => match[0].replace(/[,}]$/, "}"))
    .sort()
    .join(" ");

describe.each(LOCALES.map(({ value }) => value).filter((locale) => locale !== "en-GB"))(
  "the %s catalogue",
  (locale) => {
    it("keeps every placeholder and tag of the messages it translates", async () => {
      const [source, translated] = await Promise.all([catalogue("en-GB"), catalogue(locale)]);
      const mismatched = Object.entries(translated)
        .filter(([, { translation }]) => translation)
        .filter(([id, { translation }]) => parts(translation) !== parts(source[id]?.translation))
        .map(([, { translation }]) => translation);
      expect(mismatched).toEqual([]);
    });

    // American English only lists what's spelled differently; other languages translate everything.
    it.skipIf(locale === "en-US")("translates every message", async () => {
      const translated = await catalogue(locale);
      const missing = Object.entries(translated)
        .filter(([, { translation, obsolete }]) => !translation && !obsolete)
        .map(([id]) => id);
      expect(missing).toEqual([]);
    });
  },
);

/** Spellings that differ in American English. A message using one needs its own American translation. */
const BRITISH =
  /\b(\w*favourit\w*|\w*colour\w*|behaviour\w*|minimis\w*|maximis\w*|organis\w*|recognis\w*|customis\w*|prioritis\w*|optimis\w*|initialis\w*|synchronis\w*|authoris\w*|cancell\w*|licence|centre\w*|catalogue\w*|grey\w*|travell\w*|labell\w*|programme\w*|analys\w*|whilst)\b/i;

describe("the American catalogue", () => {
  it("translates every message with a British spelling", async () => {
    const [british, american] = await Promise.all([catalogue("en-GB"), catalogue("en-US")]);
    const untranslated = Object.entries(british)
      .filter(([, { translation }]) => translation && BRITISH.test(translation))
      .filter(([id]) => !american[id]?.translation)
      .map(([, { translation }]) => translation);
    expect(untranslated).toEqual([]);
  });

  it("leaves no British spelling in its translations", async () => {
    const american = await catalogue("en-US");
    const british = Object.values(american)
      .map(({ translation }) => translation)
      // Placeholder names come from the code, not the text, so they keep their spelling.
      .filter((translation) => translation && BRITISH.test(translation.replace(/\{\w+/g, "{")));
    expect(british).toEqual([]);
  });
});

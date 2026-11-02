import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

/**
 * The continents countries are in, by UN M49 region code. North America takes in Central America and the Caribbean.
 * Cyprus is counted in Europe, where players look for it, rather than in Asia as the UN has it.
 */
export const CONTINENTS: Record<string, readonly string[]> = {
  // Africa
  "002": (
    "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ " +
    "NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW IO TF"
  ).split(" "),
  // Asia
  "142": (
    "AF AM AZ BH BD BT BN KH CN GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG " +
    "KR LK SY TW TJ TH TL TR TM AE UZ VN YE"
  ).split(" "),
  // Europe
  "150": (
    "AL AD AT BY BE BA BG HR CY CZ DK EE FO FI FR DE GI GR GG HU IS IE IM IT JE XK LV LI LT LU MT MD MC ME NL MK NO " +
    "PL PT RO RU SM RS SK SI ES SJ SE CH UA GB VA AX"
  ).split(" "),
  // North America
  "003": (
    "AI AG AW BS BB BZ BM BQ VG CA KY CR CU CW DM DO SV GL GD GP GT HT HN JM MQ MX MS NI PA PR BL KN LC MF PM VC SX " +
    "TT TC US VI UM"
  ).split(" "),
  // South America
  "005": "AR BO BR CL CO EC FK GF GY PY PE SR UY VE GS BV".split(" "),
  // Oceania
  "009": "AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV VU WF CX CC HM".split(" "),
  // Antarctica
  AQ: ["AQ"],
};

/**
 * Each continent's name. Written out rather than asked of `Intl.DisplayNames`, which names M49 codes in Node but
 * not in the app's WebView, where Europe would show as `150`.
 */
export const CONTINENT_NAMES: Record<string, MessageDescriptor> = {
  "002": msg`Africa`,
  "142": msg`Asia`,
  "150": msg`Europe`,
  "003": msg`North America`,
  "005": msg`South America`,
  "009": msg`Oceania`,
  AQ: msg`Antarctica`,
};

const continentOf = new Map(
  Object.entries(CONTINENTS).flatMap(([continent, codes]) => codes.map((code) => [code, continent] as const)),
);

/** The continent a country is in, by its two-letter code, or `undefined` for a code the table doesn't know. */
export function continentOfCountry(code: string): string | undefined {
  return continentOf.get(code);
}

import type { AppLanguage } from "@/lib/types/language";

/**
 * Polish display labels for canonical English tag keys.
 * Used for display-time localization only — canonical keys remain English.
 */
const PL_TAG_LABELS: Record<string, string> = {
  // Seasons
  whole_year: "ca\u0142oroczne",
  spring: "wiosna",
  summer: "lato",
  autumn: "jesie\u0144",
  winter: "zima",
  // Cuisines
  italian: "w\u0142oska",
  french: "francuska",
  spanish: "hiszpa\u0144ska",
  greek: "grecka",
  mediterranean: "\u015br\u00f3dziemnomorska",
  german: "niemiecka",
  british: "brytyjska",
  polish: "polska",
  ukrainian: "ukrai\u0144ska",
  eastern_european: "wschodnioeuropejska",
  balkan: "ba\u0142ka\u0144ska",
  caucasus: "kaukaska",
  scandinavian: "skandynawska",
  chinese: "chi\u0144ska",
  japanese: "japo\u0144ska",
  korean: "korea\u0144ska",
  thai: "tajska",
  vietnamese: "wietnamska",
  southeast_asian: "po\u0142udniowoazjatycka",
  indian: "indyjska",
  nepalese: "nepalska",
  turkish: "turecka",
  lebanese: "liba\u0144ska",
  persian: "perska",
  israeli: "izraelska",
  middle_eastern: "bliskowschodnia",
  central_asian: "\u015brodkowoazjatycka",
  moroccan: "maroka\u0144ska",
  north_african: "p\u00f3\u0142nocnoafryka\u0144ska",
  egyptian: "egipska",
  west_african: "zachodnioafryka\u0144ska",
  east_african: "wschodnioafryka\u0144ska",
  southern_african: "po\u0142udniowoafryka\u0144ska",
  mexican: "meksyka\u0144ska",
  peruvian: "peruwia\u0144ska",
  argentinian: "argenty\u0144ska",
  brazilian: "brazylijska",
  latin_american: "latynoameryka\u0144ska",
  american: "ameryka\u0144ska",
  cajun: "cajun",
  caribbean: "karaibska",
  // Food categories
  appetizer: "przystawka",
  soup: "zupa",
  salad: "sa\u0142atka",
  pasta: "makaron",
  pizza: "pizza",
  rice: "ry\u017c",
  stew: "gulasz",
  roast: "pieczyste",
  grill: "grill",
  "stir-fry": "stir-fry",
  baked: "zapiekanka",
  pastry: "ciasto",
  dessert: "deser",
  beverage: "nap\u00f3j",
  preserves: "przetwory",
};

/**
 * Get the localized display label for a tag.
 * Returns the original label if no translation exists.
 */
export function getTagDisplayLabel(
  normalizedLabel: string,
  language: AppLanguage
): string {
  if (language === "pl") {
    return PL_TAG_LABELS[normalizedLabel] ?? normalizedLabel;
  }
  return normalizedLabel;
}

/**
 * Get all localized variants of a normalized tag label (for search).
 * Returns an array containing the original + all translations.
 */
export function getAllTagVariants(normalizedLabel: string): Array<string> {
  const variants = [normalizedLabel];
  const plLabel = PL_TAG_LABELS[normalizedLabel];
  if (plLabel && plLabel !== normalizedLabel) {
    variants.push(plLabel);
  }
  return variants;
}

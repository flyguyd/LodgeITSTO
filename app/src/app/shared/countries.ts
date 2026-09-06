/**
 * THE COUNTRY PICKER (Dave, 2026-09-06: "make the country selector a dropdown
 * and then show a mini flag of the country to the left of the dropdown").
 *
 * A hand-kept list rather than a package: the lodge sells to a knowable set of
 * markets, the whole thing is a few hundred bytes in the bundle, and a
 * dependency for eighty rows would be worse than the rows.
 *
 * THE STORED VALUE IS THE COUNTRY'S NAME, not its code — that is what was
 * stored before this picker existed, what the guest booking sheet prints and
 * what every existing row already holds, so the dropdown changes how a country
 * is CHOSEN and nothing about what is kept.
 *
 * The flag is a real SVG served from this app's own assets. Emoji flags were
 * tried first and are NOT usable: Windows ships no flag glyphs, so a browser
 * there draws the two letters instead (Dave, 2026-09-06). A local picture is
 * the only thing that looks the same on every machine.
 */

export interface Country {
  /** ISO 3166-1 alpha-2, used only to draw the flag. */
  code: string;
  name: string;
}

export const COUNTRIES: readonly Country[] = [
  { code: 'AR', name: 'Argentina' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BW', name: 'Botswana' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EG', name: 'Egypt' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GR', name: 'Greece' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IS', name: 'Iceland' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'JO', name: 'Jordan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'LS', name: 'Lesotho' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MG', name: 'Madagascar' },
  { code: 'MW', name: 'Malawi' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MV', name: 'Maldives' },
  { code: 'MT', name: 'Malta' },
  { code: 'MU', name: 'Mauritius' },
  { code: 'MX', name: 'Mexico' },
  { code: 'MA', name: 'Morocco' },
  { code: 'MZ', name: 'Mozambique' },
  { code: 'NA', name: 'Namibia' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NO', name: 'Norway' },
  { code: 'OM', name: 'Oman' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'QA', name: 'Qatar' },
  { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SC', name: 'Seychelles' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'KR', name: 'South Korea' },
  { code: 'ES', name: 'Spain' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TR', name: 'Turkey' },
  { code: 'UG', name: 'Uganda' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabwe' },
];

/**
 * The ISO code for whatever is stored against a guest. Rows written before
 * this picker existed hold anything a person typed — a name, a two-letter
 * code, a misspelling — so the lookup tries the NAME first, then the CODE, and
 * gives back nothing when it recognises neither. It never guesses.
 */
export function countryCode(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '';
  const byName = COUNTRIES.find((c) => c.name.toLowerCase() === v.toLowerCase());
  if (byName) return byName.code;
  const byCode = COUNTRIES.find((c) => c.code.toLowerCase() === v.toLowerCase());
  return byCode ? byCode.code : '';
}

/**
 * WHERE THE FLAG PICTURE LIVES. Emoji flags were the first attempt and they
 * do not work: WINDOWS SHIPS NO FLAG GLYPHS AT ALL, so a browser there draws
 * the two regional-indicator letters instead and the field reads "EG" where a
 * flag should be (Dave, 2026-09-06, with a screenshot of exactly that). These
 * are real SVGs served from this app's own assets — no font to depend on, no
 * CDN to reach, and the same picture on every machine. An unknown country has
 * no file and gets an empty box rather than a broken image.
 */
export function countryFlagSrc(value: string | null | undefined): string {
  const code = countryCode(value);
  // Absolute: both apps are served at the root (<base href="/">), and a
  // relative path would resolve against whatever route is open.
  return code ? `/flags/${code.toLowerCase()}.svg` : '';
}

/**
 * The list to put in the dropdown. A value already stored that is NOT on the
 * list is added at the top rather than silently dropped — an old row that says
 * "Republic of South Africa" must still show what it says, and choosing
 * something else is what changes it.
 */
export function countryOptions(current: string | null | undefined): readonly Country[] {
  const v = (current ?? '').trim();
  if (!v) return COUNTRIES;
  const known = COUNTRIES.some((c) => c.name.toLowerCase() === v.toLowerCase());
  if (known) return COUNTRIES;
  const byCode = COUNTRIES.find((c) => c.code.toLowerCase() === v.toLowerCase());
  // A stored CODE is shown as itself so the select matches, with its flag.
  return [{ code: byCode?.code ?? '', name: v }, ...COUNTRIES];
}

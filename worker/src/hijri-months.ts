const HIJRI_MONTH_NAMES = [
  'Muharram',
  'Safar',
  'Rabi al-Awwal',
  'Rabi al-Thani',
  'Jumada al-Awwal',
  'Jumada al-Thani',
  'Rajab',
  'Shaban',
  'Ramadan',
  'Shawwal',
  'Dhu al-Qadah',
  'Dhu al-Hijjah',
] as const;

/** English transliteration of a 1-based Hijri month number. */
export function hijriMonthName(month: number): string {
  const name = HIJRI_MONTH_NAMES[month - 1];
  if (name === undefined) throw new RangeError(`hijri month out of range: ${month}`);
  return name;
}

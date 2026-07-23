/**
 * Academic year as "YYYY/YYYY+1". Indonesian school years start mid-year, so
 * July onward belongs to the year that just started.
 * ponytail: fixed July boundary; make it configurable if the calendar shifts.
 */
export function currentAcademicYear(nowMs = Date.now()): string {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const startYear = d.getUTCMonth() >= 6 ? y : y - 1;
  return `${startYear}/${startYear + 1}`;
}

/** Advance "2025/2026" -> "2026/2027". */
export function nextAcademicYear(year: string): string {
  const start = parseInt(year.split('/')[0], 10);
  if (Number.isNaN(start)) return currentAcademicYear();
  return `${start + 1}/${start + 2}`;
}

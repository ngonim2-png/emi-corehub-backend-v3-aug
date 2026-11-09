/**
 * Shared "has this deadline passed" logic for anything with a date (and
 * optionally a time) attached - meetings, action items, calendar events.
 * Deliberately computed live at read time rather than written by a
 * background job, so a deadline passing is reflected the moment
 * anyone next looks, not up to a day later. The stored status column
 * for these entities never actually contains 'Missed' itself (except
 * calendar events' own status enum, which computes it the same way) -
 * callers combine this with "is the item still open/scheduled" to
 * decide whether to display 'Missed' in place of the stored status.
 *
 * No time given means "counts as missed only once the whole day has
 * ended" (end of day, 23:59:59) - a deliberate, safe default so
 * existing records without a time (and any future one where staff
 * just don't bother picking a time) don't get flagged as missed while
 * the day they're due is still in progress.
 */
export function isPastDeadline(date: string, time: string | null | undefined): boolean {
  const timePart = time && /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : '23:59:59';
  const deadline = new Date(`${date}T${timePart}`);
  return deadline.getTime() < Date.now();
}

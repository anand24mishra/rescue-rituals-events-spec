/** Accept only app-relative destinations, never protocol-relative or auth loops. */
export function returnPath(state: unknown): string {
  const from = (state as {from?: unknown} | null)?.from;
  return typeof from === 'string' && /^\/(events(?:\/|\?|$)|my-rsvps(?:\?|$)|organizer\/events(?:\/|\?|$))/.test(from) && !/[\\\r\n]/.test(from) ? from : '/events';
}

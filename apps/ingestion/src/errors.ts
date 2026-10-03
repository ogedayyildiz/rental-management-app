/** Which error codes started and which cleared between two consecutive readings. */
export function diffErrorCodes(previous: readonly string[], current: readonly string[]) {
  const prev = new Set(previous);
  const next = new Set(current);
  return {
    opened: [...next].filter((c) => !prev.has(c)),
    cleared: [...prev].filter((c) => !next.has(c)),
  };
}

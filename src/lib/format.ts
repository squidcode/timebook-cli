export function formatDuration(minutes: number): string {
  if (minutes < 0) minutes = 0;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// Parse "1h", "45m", "1h30m", "1.5h", "90" (treated as minutes), "1:30" (h:m).
export function parseDuration(input: string): number {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === '') throw new Error('Empty duration');

  // h:m form
  if (/^\d+:\d+$/.test(trimmed)) {
    const [hStr = '0', mStr = '0'] = trimmed.split(':');
    return Number.parseInt(hStr, 10) * 60 + Number.parseInt(mStr, 10);
  }

  // Plain number → minutes (most concise human input).
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number.parseFloat(trimmed));
  }

  // Composite: "1h30m", "2h", "45m", "1.5h"
  let total = 0;
  let matched = false;
  for (const part of trimmed.matchAll(/(\d+(?:\.\d+)?)\s*([hm])/g)) {
    matched = true;
    const value = Number.parseFloat(part[1]!);
    if (part[2] === 'h') total += value * 60;
    else total += value;
  }
  if (!matched) throw new Error(`Could not parse duration: "${input}"`);
  return Math.round(total);
}

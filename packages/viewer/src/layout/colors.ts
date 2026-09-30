/** Hand-picked colors for the most active authors, tuned to glow on a dark background. */
const PALETTE = [
  '#8b7bff',
  '#3fe0d0',
  '#ff6fb5',
  '#ffc24b',
  '#5ea8ff',
  '#7cf08a',
  '#ff8a5c',
  '#c58bff',
  '#4dd2ff',
  '#f0f06a',
  '#ff5e7e',
  '#6af5c8',
];

/** Color of the author at `index` (authors are sorted by activity). */
export function authorColor(index: number): string {
  if (index < PALETTE.length) return PALETTE[index];
  const hue = (index * 137.508 + 23) % 360;
  return hslToHex(hue, 0.6, 0.68);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

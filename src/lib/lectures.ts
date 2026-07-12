/** Parse a pasted list of lectures into { number, name } pairs.
 * Accepts lines like:
 *   1002 – History of Life on Earth
 *   1003 - Structure of Prokaryotic Cell
 *   1004: Something
 *   1005 Something else
 *   History of Life on Earth (no number)
 */
export function parseLectures(text: string): { number: string; name: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // number followed by a separator (– — - : . ) ) and then the name
      const m = line.match(/^(\d[\d.]*)\s*[–—\-:.)]?\s*(.*)$/);
      if (m && m[2]) {
        return { number: m[1], name: m[2].trim() };
      }
      if (m && !m[2]) {
        return { number: m[1], name: "" };
      }
      return { number: "", name: line };
    })
    .filter((l) => l.number || l.name);
}

export const stripControlCharacters = function (s: string): string {
  return s
    .replace('\r\n', ' ')
    .replace('\n', ' ')
    .replace('\r', ' ')
    .split('')
    .filter(function (x) {
      const n = x.charCodeAt(0)

      return 31 < n && 127 > n
    })
    .join('')
}

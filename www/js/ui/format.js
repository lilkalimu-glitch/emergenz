// Zahlen und Texte für die Anzeige (deutsch).

export function num(v, digits = 0) {
  return Number(v).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function year(tick) {
  return `Jahr ${num(Math.floor(tick / 12))}`;
}

export function temp(t) {
  return `${num(t, 1)} °C`;
}

export function pct(v) {
  return `${num(Math.round(v * 100))} %`;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Artnamen (zwischen § ... §) kursiv setzen, wie in der Biologie üblich
export function rich(text) {
  return esc(text).replace(/§([^§]+)§/g, '<i class="taxon">$1</i>');
}

export function plain(text) {
  return String(text).replace(/§/g, '');
}

export const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

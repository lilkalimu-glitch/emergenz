// Einfache Linien-Icons (24 x 24), Farbe über currentColor.
const P = {
  planet: '<circle cx="12" cy="12" r="6.5"/><path d="M3.5 15.5c2.5 2 15 -3 17 -8"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  meteor: '<circle cx="15.5" cy="15.5" r="4.5"/><path d="M12.3 12.3 4 4M15 10.6 9.5 5M10.6 15 5 9.5"/>',
  rain: '<path d="M7 15.5a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 8.5a3.5 3.5 0 0 1-.5 7"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/>',
  sprout: '<path d="M12 21v-8"/><path d="M12 13c0-4 3-6.5 7.5-6.5 0 4.5-3 6.5-7.5 6.5Z"/><path d="M12 15.5c0-3.5-2.5-5.5-6.5-5.5 0 3.8 2.5 5.5 6.5 5.5Z"/>',
  book: '<path d="M4 5.5c3-1 5.5-.8 8 1 2.5-1.8 5-2 8-1v13c-3-1-5.5-.8-8 1-2.5-1.8-5-2-8-1Z"/><path d="M12 6.5v13"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  play: '<path d="M8 5.5v13l10-6.5Z"/>',
  play2: '<path d="M4.5 6v12l7.5-6Z"/><path d="M12.5 6v12l7.5-6Z"/>',
  play3: '<path d="M2.5 7v10l6-5Z"/><path d="M9 7v10l6-5Z"/><path d="M15.5 7v10l6-5Z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r=".9" fill="currentColor"/><circle cx="15" cy="15" r=".9" fill="currentColor"/><circle cx="15" cy="9" r=".9" fill="currentColor"/><circle cx="9" cy="15" r=".9" fill="currentColor"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.8 2.6 2.8 14.4 0 17M12 3.5c-2.8 2.6-2.8 14.4 0 17"/>',
  map: '<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2Z"/><path d="M9 4.5v13M15 6.5v13"/>',
  thermo: '<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z"/>',
  leaf: '<path d="M5 19c0-8 5-13.5 14-14-.5 9-6 14-14 14Z"/><path d="M5 19 13 11"/>',
  dots: '<circle cx="8" cy="9" r="1.6"/><circle cx="15.5" cy="8" r="1.2"/><circle cx="12" cy="15" r="2"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  jump: '<path d="M4 12h11M11 7.5 15.5 12 11 16.5"/><path d="M19.5 5.5v13"/>',
  save: '<path d="M5 4.5h11l3 3v12H5Z"/><path d="M8 4.5v5h7v-5M8 19.5v-5.5h8v5.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  ice: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
}

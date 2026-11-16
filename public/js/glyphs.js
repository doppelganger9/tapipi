// Tapipi's own pictograms: crude, flat, drawn by hand in a 100×100 box.
//
// A game file uses one by writing its name after a colon in a card's `art`
// field (":flamme"). They take the colour of the text around them; `P` is the
// paper showing through.

const P = 'fill="var(--paper, #F1ECDF)" stroke="none"';
const L = 'fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="square" stroke-linejoin="miter"';
const LP = 'fill="none" stroke="var(--paper, #F1ECDF)" stroke-width="6"';

export const GLYPHS = {
  champignon: `<path d="M8 52Q10 12 50 12 92 14 92 52Z"/><path d="M38 52 34 90 68 88 62 52Z"/><circle cx="34" cy="34" r="7" ${P}/><circle cx="62" cy="28" r="5" ${P}/><circle cx="70" cy="42" r="4" ${P}/>`,
  lune: '<path d="M62 8A42 42 0 1 0 92 66 34 34 0 1 1 62 8Z"/>',
  flamme: '<path d="M50 6Q78 34 74 60 72 94 48 94 22 92 24 62 26 44 38 36 40 52 50 50 44 28 50 6Z"/>',
  goutte: '<path d="M50 6 80 58Q84 92 50 94 16 92 22 58Z"/>',
  vent: `<path d="M8 30H64Q84 30 80 14M8 52H88M8 74H56Q74 76 70 92" ${L}/>`,
  main: '<path d="M28 50V14H38V44H42V8H52V44H56V12H66V46H70V22H80V66Q80 92 54 92 34 92 26 74L10 52 18 44Z"/>',
  ciseaux: `<circle cx="24" cy="74" r="13" ${L}/><circle cx="24" cy="28" r="13" ${L}/><path d="M34 66 92 20M34 36 92 82" ${L}/>`,
  echange: `<path d="M12 34H80M64 16 84 34 64 52M88 68H20M36 50 16 68 36 86" ${L}/>`,
  fiole: `<path d="M38 8H62V36L88 84Q90 94 78 94H22Q10 94 12 84L38 36Z"/><path d="M30 66H70" ${LP}/>`,
  tasse: `<path d="M12 32H70V70Q70 90 50 90H32Q12 90 12 70Z"/><path d="M70 42H82Q92 44 90 55 88 66 70 66M30 8V20M48 4V20" ${L}/>`,
  oiseau: `<path d="M10 56Q24 30 52 34L64 18 70 36 94 44 72 52Q66 80 36 80L18 92 22 74Q12 68 10 56Z"/><circle cx="66" cy="40" r="4" ${P}/>`,
  balai: `<path d="M86 8 44 54" ${L}/><path d="M44 44 62 62 30 96 6 72Z"/>`,
  chardon: '<path d="M50 2 57 20 74 10 70 28 90 30 76 42 88 56 68 56 66 74 52 62 38 76 34 56 14 58 26 42 10 32 30 28 26 10 43 20Z"/><path d="M46 66H55V96H46Z"/><path d="M55 86 80 72 72 92Z"/>',
  sapin: '<path d="M50 4 78 40H64L86 72H58V96H42V72H14L36 40H22Z"/>',
  vague: `<path d="M4 40Q20 16 36 40T68 40 100 40M4 68Q20 44 36 68T68 68 100 68" ${L}/>`,
  diamant: `<path d="M24 14H76L96 40 50 92 4 40Z"/><path d="M8 40H92" ${LP}/>`,
  eclair: '<path d="M58 4 18 56H44L36 96 82 40H54Z"/>',
  parchemin: `<path d="M18 12H82V70Q82 88 66 88H30Q18 88 18 76Z"/><path d="M32 32H68M32 48H68M32 64H56" ${LP}/>`,
  de: `<path d="M20 10 90 20 80 90 10 80Z"/><circle cx="34" cy="32" r="7" ${P}/><circle cx="50" cy="50" r="7" ${P}/><circle cx="66" cy="68" r="7" ${P}/><circle cx="70" cy="36" r="7" ${P}/><circle cx="30" cy="64" r="7" ${P}/>`,
  oeil: `<path d="M4 50Q50 4 96 50 50 96 4 50Z"/><circle cx="50" cy="50" r="19" ${P}/><circle cx="54" cy="48" r="9"/>`,
  tomate: '<path d="M50 24Q92 22 90 58 86 94 50 94 14 94 10 58 8 22 50 24Z"/><path d="M34 6 50 18 66 6 60 26H40Z"/>',
  chaussette: `<path d="M36 6H68V54L90 74Q96 92 78 94H52Q36 92 36 76Z"/><path d="M38 22H66" ${LP}/>`,
  fleur: `<circle cx="50" cy="18" r="14"/><circle cx="74" cy="34" r="14"/><circle cx="64" cy="60" r="14"/><circle cx="36" cy="60" r="14"/><circle cx="26" cy="34" r="14"/><circle cx="50" cy="40" r="9" ${P}/><path d="M50 72V98" ${L}/>`,
  tarte: `<path d="M6 60H94L82 92H18Z"/><path d="M8 56Q20 34 30 56 40 34 50 56 60 34 70 56 80 34 92 56Z"/><path d="M36 8V22M58 4V22" ${L}/>`,
  rouleau: `<path d="M8 26H64V82H8Z"/><path d="M64 26H92V94H64Z" opacity=".6"/><circle cx="36" cy="54" r="10" ${P}/>`,
  etoile: '<path d="M50 4 62 36 96 38 70 60 80 94 50 74 20 94 30 60 4 38 38 36Z"/>',
  coeur: '<path d="M50 90 10 48Q0 22 26 14 42 12 50 30 58 12 74 14 100 22 90 48Z"/>',
  crane: `<path d="M14 44Q14 8 50 8 86 8 86 44 86 62 72 68V90H28V68Q14 62 14 44Z"/><circle cx="36" cy="44" r="10" ${P}/><circle cx="64" cy="44" r="10" ${P}/><path d="M42 76V90M50 76V90M58 76V90" ${LP}/>`,
  couronne: '<path d="M8 30 28 56 50 16 72 56 92 30 84 86H16Z"/>',
  pansement: `<path d="M4 58 80 14 96 42 20 86Z"/><path d="M38 44 56 34 64 50 46 60Z" ${P}/>`,
  croix: '<path d="M14 26 26 14 50 38 74 14 86 26 62 50 86 74 74 86 50 62 26 86 14 74 38 50Z"/>',
  coche: '<path d="M8 54 22 40 40 58 80 14 94 28 40 88Z"/>',
};

/** An inline pictogram, or null when the name is unknown. The markup above is constant: nothing a player wrote ends up in it. */
export function glyphEl(name, className = 'glyph') {
  if (!Object.hasOwn(GLYPHS, name)) return null;
  const span = document.createElement('span');
  span.className = className;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 100 100" fill="currentColor">${GLYPHS[name]}</svg>`;
  return span;
}

/** A card's `art`: ":name" is one of our pictograms, anything else is plain text. */
export function artGlyph(art) {
  return typeof art === 'string' && art.startsWith(':') ? glyphEl(art.slice(1)) : null;
}

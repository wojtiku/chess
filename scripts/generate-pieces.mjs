// Original vector artwork for this app. Run `node scripts/generate-pieces.mjs`
// after editing a silhouette. Coordinates share a 45 × 45 canvas and baseline.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../public/pieces/', import.meta.url));
const path = (d) => `<path d="${d}"/>`;
const circle = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const rect = (x, y, w, h, r = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const sets = {
  staunton: {
    edge: 1.55,
    base: path('M13 33Q11 34 12 36L9 38V41H36V38L33 36Q34 34 32 33Z'),
    shapes: {
      P: circle(22.5, 13, 5.1) + path('M20 18Q16 20 19 23Q20 27 16 33H29Q25 27 26 23Q29 20 25 18Z'),
      N: path('M14 33Q15 27 21 22L24 19L20 18L17 21L12 19L11 16L19 8L19 4L24 7Q32 7 33 19Q34 25 30 33Z'),
      B: circle(22.5, 5.8, 1.8) + path('M22.5 8Q34 17 27 22Q25 23 26 27L30 33H15L19 27Q20 23 18 22Q11 17 22.5 8Z'),
      R: path('M13 6H18V11H21V6H25V11H28V6H33V16L29 19L30 30L32 33H13L15 30L16 19L13 16Z'),
      Q: circle(10.5, 10.5, 2) + circle(17, 7.5, 2) + circle(22.5, 5, 2) + circle(28, 7.5, 2) + circle(34.5, 10.5, 2) + path('M11 12L16 24Q18 27 15 33H30Q27 27 29 24L34 12L27 18L28 10L23 18L17 10L18 18Z'),
      K: path('M21 3H24V7H28V10H24V14H21V10H17V7H21Z') + path('M22.5 17Q15 11 12 16Q9 21 17 26L15 33H30L28 26Q36 21 33 16Q30 11 22.5 17Z'),
    },
    details: {
      P: 'M17 32H28M12 37H33M18 22H27',
      N: 'M22 10Q29 11 29 19Q29 25 25 29M14 17L17 18M14 32H30M12 37H33',
      B: 'M25.5 12L21 18M18 25H27M16 32H29M12 37H33',
      R: 'M16 18H29M16 29H29M15 32H30M12 37H33',
      Q: 'M16 24Q22.5 26 29 24M17 29H28M15 32H30M12 37H33',
      K: 'M15 21Q22.5 25 30 21M17 27H28M15 32H30M12 37H33',
    },
  },
  tournament: {
    edge: 1.8,
    base: path('M12 34H33L36 40H9Z'),
    shapes: {
      P: circle(22.5, 12, 5.7) + path('M18 19H27L25 24L29 34H16L20 24Z'),
      N: path('M13 34Q14 27 21 21L23 19L19 18L16 21L10 18L12 13L20 7L20 3L26 7Q33 9 33 18L31 27L32 34Z'),
      B: circle(22.5, 5, 2) + path('M22.5 8Q38 21 26 24L30 34H15L19 24Q7 21 22.5 8Z'),
      R: path('M11 6H17V11H20V6H25V11H28V6H34V17L29 20V29L32 34H13L16 29V20L11 17Z'),
      Q: circle(11, 9, 2) + circle(22.5, 5, 2.2) + circle(34, 9, 2) + path('M11 11L17 24L16 29L14 34H31L29 29L28 24L34 11L27 17L22.5 8L18 17Z'),
      K: path('M20.5 3H24.5V7H29V11H24.5V15H20.5V11H16V7H20.5Z') + path('M13 16Q17 13 22.5 19Q28 13 32 16Q36 22 28 26L31 34H14L17 26Q9 22 13 16Z'),
    },
    details: {
      P: 'M17 33H28M18 21H27', N: 'M25 12Q30 17 26 25M13 33H31',
      B: 'M26 13L21 19M18 26H27M16 33H29', R: 'M15 18H30M16 29H29',
      Q: 'M17 25H28M16 30H29', K: 'M16 23Q22.5 27 29 23M17 28H28',
    },
  },
  geometric: {
    edge: 1.5,
    base: rect(11, 36, 23, 4, 1),
    shapes: {
      P: circle(22.5, 12, 6) + path('M20 20H25L29 34H16Z'),
      N: path('M13 34V26L23 17H12V13L21 5L31 13V34Z'),
      B: path('M22.5 4L31 16L25 23L30 34H15L20 23L14 16Z'),
      R: path('M12 6H18V12H20V6H25V12H27V6H33V19H28V34H17V19H12Z'),
      Q: path('M11 9L17 15L22.5 4L28 15L34 9L29 25H16Z') + rect(17, 28, 11, 6),
      K: path('M20 3H25V8H30V13H25V18H20V13H15V8H20Z') + path('M20 21H25L30 34H15Z'),
    },
    details: { N: 'M25 14H27', B: 'M24.5 12L20 18', R: 'M17 21H28', Q: 'M17 22H28', K: 'M19 31H26' },
  },
  deco: {
    edge: 1.4,
    base: path('M15 32H30V35H33V38H36V41H9V38H12V35H15Z'),
    shapes: {
      P: path('M22.5 7L28 12V17L24.5 20L28 32H17L20.5 20L17 17V12Z'),
      N: path('M15 32V26L24 18L19 17L14 20L10 16L20 7V3L29 7L33 15L29 32Z'),
      B: path('M22.5 3L30 14L25 23L29 32H16L20 23L15 14Z'),
      R: path('M12 5H17V10H20V5H25V10H28V5H33V17H29V21H27V28H30V32H15V28H18V21H16V17H12Z'),
      Q: path('M11 7L17 13L22.5 3L28 13L34 7L30 23H27V28H30V32H15V28H18V23H15Z'),
      K: path('M20.5 2H24.5V7H29V11H24.5V16H20.5V11H16V7H20.5Z') + path('M16 18H29L26 24V28H30V32H15V28H19V24Z'),
    },
    details: {
      P: 'M22.5 11V17M22.5 23V29M13 38H32M16 35H29',
      N: 'M24 10L29 15L26 28M13 38H32M16 35H29',
      B: 'M22.5 8V18M22.5 25V29M13 38H32M16 35H29',
      R: 'M20 20V29M25 20V29M15 16H30M13 38H32M16 35H29',
      Q: 'M17 20H28M22.5 12V19M21 25V29M24 25V29M13 38H32M16 35H29',
      K: 'M22.5 20V29M13 38H32M16 35H29',
    },
  },
  ink: {
    edge: 1.65,
    base: path('M12 34Q20 32 33 34L35 40Q22 42 10 40Z'),
    shapes: {
      P: path('M18 8Q24 5 28 10Q31 16 24 19Q25 27 29 33L16 34Q21 26 20 19Q12 15 18 8Z'),
      N: path('M14 34Q14 28 23 21L21 18L17 21L10 18L13 13L20 8L21 3L25 8Q36 11 32 25L30 34Z'),
      B: path('M22 4Q24 3 25 6L24 9Q38 20 25 24Q25 29 30 33L15 34Q20 27 19 24Q8 19 21 9Q18 6 22 4Z'),
      R: path('M12 7L18 6V12L21 11V6L26 7V12L29 11L28 6L34 7L33 18L29 21L30 30L32 34H13L16 29V21L12 18Z'),
      Q: circle(11, 9, 1.8) + circle(22, 5, 2) + circle(34, 8, 1.8) + path('M11 11L18 17L22 8L27 17L34 10L29 25Q26 28 31 34L14 33Q19 27 16 24Z'),
      K: path('M21 3L25 4L24 8L29 7V11L24 12L25 16H20L21 12L16 11V8L21 8Z') + path('M22 19Q14 11 11 17Q10 23 18 26L15 34L31 33L28 26Q37 20 32 16Q28 13 22 19Z'),
    },
    details: {
      P: 'M17 36L15 39M22 36L20 39M27 36L25 39M22 22L24 29',
      N: 'M25 12Q30 15 27 24M17 36L15 39M22 36L20 39M27 36L25 39',
      B: 'M26 14L21 20M19 26L26 27M17 36L15 39M22 36L20 39M27 36L25 39',
      R: 'M17 19L28 18M19 24L20 29M17 36L15 39M22 36L20 39M27 36L25 39',
      Q: 'M18 24L27 25M19 29L27 30M17 36L15 39M22 36L20 39M27 36L25 39',
      K: 'M16 23Q22 26 29 22M19 29L27 30M17 36L15 39M22 36L20 39M27 36L25 39',
    },
  },
  modern: {
    edge: 1.35,
    base: path('M13 34H32Q36 34 36 37.5Q36 41 32 41H13Q9 41 9 37.5Q9 34 13 34Z'),
    shapes: {
      P: circle(22.5, 11.5, 5.5) + path('M20 17Q20 26 16 35H29Q25 26 25 17Z'),
      N: path('M13 35Q14 29 22 22L25 19L20 17L16 20L11 17Q15 11 22 7L25 4Q34 9 34 18Q34 26 29 35Z'),
      B: path('M22.5 4Q32 13 30 19Q29 23 25 25L29 35H16L20 25Q16 23 15 19Q13 13 22.5 4Z'),
      R: path('M12 7H18V12H21V7H25V12H28V7H34V18Q34 21 30 21L29 35H16L15 21Q12 21 12 18Z'),
      Q: path('M12 12Q10 8 13 8Q16 8 18 16L20 7Q22.5 3 25 7L27 16Q30 8 33 8Q36 8 34 12L29 26L28 35H17L16 26Z'),
      K: rect(20.5, 3, 4, 14, 1.3) + rect(16, 7, 13, 4, 1.3) + path('M17 20Q22.5 16 28 20L30 35H15Z'),
    },
    details: {
      P: 'M14 37.5H31', N: 'M27 11Q30 16 28 21M14 37.5H31',
      B: 'M26 11L21 18M14 37.5H31', R: 'M17 21H28M14 37.5H31',
      Q: 'M18 26H27M14 37.5H31', K: 'M19 22H26M14 37.5H31',
    },
  },
  storybook: {
    edge: 1.9,
    base: path('M13 33.5H32Q37 33.5 37 37.5Q37 41 32 41H13Q8 41 8 37.5Q8 33.5 13 33.5Z'),
    shapes: {
      P: circle(22.5, 12, 7) + path('M19 18Q17 22 19 25Q20 28 15 34H30Q25 28 26 25Q28 22 26 18Z'),
      N: path('M13 34Q12 29 19 24L23 21L20 19Q17 22 12 20Q8 18 11 14L18 9L20 4Q22 3 24 8Q32 8 34 16Q36 23 30 34Z'),
      B: circle(22.5, 4.8, 2.4) + path('M22.5 8Q37 20 28 25Q26 28 30 34H15Q19 28 17 25Q8 20 22.5 8Z'),
      R: path('M12 7Q12 5 14 5H18V11H21V5H25V11H28V5H32Q34 5 34 7V17Q34 20 30 21L31 34H14L15 21Q11 20 11 17V7Z'),
      Q: circle(10.5, 10.5, 2.3) + circle(22.5, 5, 2.5) + circle(34.5, 10.5, 2.3) + path('M11 13L17 18L22.5 8L28 18L34 13L31 25L30 34H15L14 25Z'),
      K: rect(20.5, 2.8, 4, 13.2, 1.1) + rect(16, 7, 13, 4, 1.1) + path('M22.5 18Q12 10 10 18Q9 24 17 27L15 34H30L28 27Q36 24 35 18Q33 10 22.5 18Z'),
    },
    details: {
      P: 'M15 37.5Q22.5 39 30 37.5',
      N: 'M27 11Q32 17 29 24M12.5 17.5Q14 19 16 18M15 37.5Q22.5 39 30 37.5',
      B: 'M26 12L23 16M15 37.5Q22.5 39 30 37.5',
      R: 'M16 19Q22.5 21 29 19M15 37.5Q22.5 39 30 37.5',
      Q: 'M16 23Q22.5 25 29 23M21 17L22.5 15L24 17L22.5 19ZM15 37.5Q22.5 39 30 37.5',
      K: 'M15 37.5Q22.5 39 30 37.5',
    },
    faces: { P: [22.5, 12], B: [22.5, 21], R: [22.5, 26], Q: [22.5, 28], K: [22.5, 23] },
  },
};
const names = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
for (const [set, drawing] of Object.entries(sets)) {
  const dir = set === 'staunton' ? root : `${root}/${set}`;
  mkdirSync(dir, { recursive: true });
  for (const side of ['w', 'b']) {
    const white = side === 'w';
    // Neutral tonal values describe form and shading. Board themes supply hue
    // through the shared palette filter; no design owns a colour palette.
    const colors = white ? ['#ffffff', '#f2f2f2', '#cccccc'] : ['#686868', '#303030', '#111111'];
    const edge = white ? '#252525' : '#e4e4e4';
    const detail = white ? '#777777' : '#b7b7b7';
    const fill = set === 'geometric' || set === 'ink' ? (white ? '#f2f2f2' : '#303030') : 'url(#body)';
    for (const [letter, shape] of Object.entries(drawing.shapes)) {
      const label = `${white ? 'White' : 'Black'} ${names[letter]}`;
      const geometry = drawing.base + shape;
      const face = drawing.faces?.[letter];
      const eyes = face ? [face[0] - 2.6, face[0] + 2.6].map((x) =>
        `<ellipse cx="${x}" cy="${face[1]}" rx="1.45" ry="1.85" fill="#ffffff"/>` +
        `<ellipse cx="${x - 0.15}" cy="${face[1] + 0.2}" rx="0.8" ry="1.1" fill="#252525"/>` +
        `<circle cx="${x - 0.35}" cy="${face[1] - 0.25}" r="0.3" fill="#ffffff"/>`).join('') : '';
      const cheeks = face ? [face[0] - 4.3, face[0] + 4.3].map((x) =>
        `<ellipse cx="${x}" cy="${face[1] + 2.4}" rx="1.2" ry="0.7" fill="${white ? '#aaaaaa' : '#888888'}"/>`).join('') : '';
      const smile = face ? `<path d="M${face[0] - 1.6} ${face[1] + 3}q1.6 1.6 3.2 0" fill="none" stroke="${white ? '#555555' : '#e4e4e4'}" stroke-width="0.8" stroke-linecap="round"/>` : '';
      const ponyEye = set === 'storybook' && letter === 'N'
        ? `<ellipse cx="21" cy="13" rx="2.1" ry="2.5" fill="#ffffff"/><ellipse cx="20.6" cy="13.3" rx="1.15" ry="1.5" fill="#252525"/><circle cx="20.2" cy="12.7" r="0.45" fill="#ffffff"/><ellipse cx="17.5" cy="17.3" rx="1.5" ry="0.9" fill="${white ? '#aaaaaa' : '#888888'}"/>` : '';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="45" height="45" role="img" aria-label="${label}">
  <title>${label}</title>
  <defs>
    <linearGradient id="body" gradientUnits="userSpaceOnUse" x1="5" y1="4" x2="32" y2="42">
      <stop offset="0" stop-color="${colors[0]}"/>
      <stop offset="0.48" stop-color="${colors[1]}"/>
      <stop offset="1" stop-color="${colors[2]}"/>
    </linearGradient>
  </defs>
  <g fill="${fill}" stroke="${edge}" stroke-width="${drawing.edge}" stroke-linejoin="round" stroke-linecap="round">${geometry}</g>
  <g fill="${fill}">${geometry}</g>
  <path d="${drawing.details[letter] ?? ''}" fill="none" stroke="${detail}" stroke-width="${set === 'ink' ? 0.95 : 0.85}" stroke-linecap="round" stroke-linejoin="round"/>
  ${eyes}${cheeks}${smile}${ponyEye}
  ${letter === 'N' && set !== 'storybook' ? `<circle cx="${set === 'geometric' ? 24 : 22}" cy="${set === 'staunton' ? 12 : 12.5}" r="${set === 'geometric' ? 0.8 : 1}" fill="${detail}"/>` : ''}
</svg>
`;
      writeFileSync(`${dir}/${side}${letter}.svg`, svg.replace(/^ +$/gm, '').replace(/\n{3,}/g, '\n\n'));
    }
  }
}

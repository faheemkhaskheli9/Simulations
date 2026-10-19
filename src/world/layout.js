// The default world as data (W-AR-5): places from a galaxy down to one atom, and
// the sites (simulation modules) that live in them. Adding a place or a site
// needs no code elsewhere. Positions are in the parent's units; sizes in the
// place's own unit. See docs/world/SYSTEM_DESIGN.md §4.

const LY = 9.4607e15, AU = 1.495978707e11;

export const PLACES = [
  {
    id: 'deep', label: 'Deep Space', unit: { name: 'ly', metres: LY }, size: 1e5, exitAt: 5,
    description: 'The Milky Way and, far away, two galaxies colliding.',
    view: { target: [-70000, 0, -20000], offset: [0, 120000, 200000] },
    decor: [{ kind: 'milkyway', radius: 50000, count: 9000 }, { kind: 'starfield', radius: 7e5, count: 1500 }],
    primary: 'galaxies',
    sites: [
      { id: 'galaxies', sim: 'gravity', scenario: 'galaxyCollision', label: 'Colliding galaxies', type: 'gravity',
        at: [-160000, 30000, -60000], scale: 600, params: { yearsPerSecond: 0.6 }, view: { offset: [0, 75000, 115000] } },
    ],
  },
  {
    id: 'orion', parent: 'deep', label: 'Orion Arm', unit: { name: 'ly', metres: LY }, size: 150,
    position: [26000, 0, 0], enterAt: 4, exitAt: 12,
    description: 'Our neighbourhood of the galaxy, where new stars form in nebulae.',
    view: { target: [15, 0, -10], offset: [0, 55, 170] },
    decor: [{ kind: 'stars', radius: 600, count: 2500 }],
    primary: 'nursery',
    sites: [
      { id: 'nursery', sim: 'stars', scenario: 'nursery', label: 'Star nursery', type: 'surface', surface: 'plane',
        center: [45, 0, -40], width: 60 },
    ],
  },
  {
    id: 'solar', parent: 'orion', label: 'Solar System', unit: { name: 'AU', metres: AU }, size: 35,
    position: [0, 0, 0], enterAt: 3, exitAt: 10,
    description: 'The Sun and its planets, orbiting under gravity.',
    view: { target: [0, 0, 0], offset: [0, 16, 26] },
    primary: 'planets',
    sites: [
      { id: 'planets', sim: 'gravity', scenario: 'solar', label: 'Solar System', type: 'gravity', at: [0, 0, 0], scale: 1,
        hideInside: { earth: ['Earth', 'Moon'] }, view: { offset: [0, 7, 11] } },
    ],
  },
  {
    id: 'earth', parent: 'solar', label: 'Earth', unit: { name: 'km', metres: 1e3 }, size: 6371,
    follow: { site: 'planets', body: 'Earth' }, occluder: 6371, enterAt: 60, exitAt: 150,
    description: "The whole planet: the global climate on a globe, and the Moon.",
    view: { target: [0, 0, 0], offset: [0, 5000, 21000] },
    primary: 'climate',
    sites: [
      { id: 'climate', sim: 'climate', scenario: 'preindustrial', label: 'Global climate', type: 'globe', at: [0, 0, 0], radius: 6371,
        view: { offset: [0, 4000, 19000] } },
      { id: 'moon', sim: 'gravity', scenario: 'earthMoon', label: 'Earth & Moon', type: 'gravity', at: [0, 0, 0], scale: AU / 1e3,
        origin: 'Earth', hide: ['Earth'], lit: true, markAt: 'Moon', view: { offset: [0, 300000, 520000] } },
    ],
  },
  {
    id: 'valley', parent: 'earth', label: 'The Valley', unit: { name: 'km', metres: 1e3 }, size: 30,
    lat: 34, lon: -10, radius: 6371, enterAt: 5, exitAt: 12, ancestors: 1, sky: '#86a9d6',
    description: 'A valley at 34° N: a thunderstorm, a savanna and a small town.',
    view: { target: [0, 3, 0], offset: [0, 16, 44] },
    decor: [{ kind: 'ground', radius: 300, color: '#5f7d48' }],
    primary: 'weather',
    sites: [
      { id: 'weather', sim: 'weather', scenario: 'storm', label: 'Weather', type: 'surface', surface: 'slab',
        center: [0, 8, -10], width: 32, view: { offset: [0, 12, 38] } },
      { id: 'ecosystem', sim: 'ecosystem', scenario: 'balanced', label: 'Savanna ecosystem', type: 'surface', surface: 'ground',
        center: [-9, 0.02, 4.5], width: 12, view: { offset: [0, 9, 8] } },
      { id: 'epidemic', sim: 'epidemic', scenario: 'town', label: 'Town (epidemic)', type: 'surface', surface: 'ground',
        center: [8, 0.02, 4.5], width: 6, view: { offset: [0, 5, 4.5] } },
    ],
  },
  {
    id: 'campus', parent: 'valley', label: 'Science Campus', unit: { name: 'm', metres: 1 }, size: 40,
    position: [11.6, 0.03, 5.9], enterAt: 4, exitAt: 12, ancestors: 0, sky: '#151b2c',
    description: 'A physics hall with a mechanics lab and a microscope bench.',
    view: { target: [0, 5, 0], offset: [0, 7, 30] },
    decor: [
      { kind: 'box', center: [0, -0.1, 0], size: [60, 0.2, 40], color: '#2a3247' },
      { kind: 'box', center: [12, 0.5, 0], size: [3, 1, 1.5], color: '#4a5878' },
      { kind: 'box', center: [12, 0.85, 0], size: [0.3, 0.4, 0.3], color: '#c9d2e6' },
    ],
    primary: 'mechanics',
    sites: [
      { id: 'mechanics', sim: 'mechanics', scenario: 'cradle', label: 'Mechanics lab', type: 'surface', surface: 'plane',
        center: [0, 6.5, -8], width: 20, view: { offset: [0, 0, 20] } },
    ],
  },
  {
    id: 'microscope', parent: 'campus', label: 'Microscope', unit: { name: 'µm', metres: 1e-6 }, size: 40,
    position: [12, 1.06, 0], enterAt: 3, exitAt: 12, ancestors: 0, sky: '#05070c',
    description: 'A living cell under the microscope.',
    view: { target: [0, 0, 0], offset: [0, 8, 70] },
    primary: 'cell',
    sites: [
      { id: 'cell', sim: 'cell', scenario: 'respiration', label: 'Cell', type: 'surface', surface: 'plane',
        center: [0, 0, 0], width: 60, view: { offset: [0, 0, 62] } },
    ],
  },
  {
    id: 'chamber', parent: 'microscope', label: 'Sample Chamber', unit: { name: 'nm', metres: 1e-9 }, size: 5,
    position: [9, 5, 0.5], enterAt: 3, exitAt: 12, ancestors: 0, sky: '#070a12',
    description: 'Atoms and molecules moving and bonding.',
    view: { target: [0, 0, 0], offset: [0, 0.6, 7.5] },
    primary: 'atoms',
    sites: [
      { id: 'atoms', sim: 'atoms', scenario: 'water', label: 'Atoms & molecules', type: 'surface', surface: 'plane',
        center: [0, 0, 0], width: 6, view: { offset: [0, 0, 6.5] } },
    ],
  },
  {
    id: 'atom', parent: 'chamber', label: 'Atom', unit: { name: 'pm', metres: 1e-12 }, size: 150,
    position: [1.2, 0.6, 0.05], enterAt: 3, exitAt: 12, ancestors: 0, sky: '#04060c',
    description: 'One atom: nucleus and electron shells.',
    view: { target: [0, 0, 0], offset: [0, 0, 380] },
    primary: 'shells',
    sites: [
      { id: 'shells', sim: 'atom', scenario: 'carbon12', label: 'Atomic structure', type: 'surface', surface: 'plane',
        center: [0, 0, 0], width: 300, view: { offset: [0, 0, 330] } },
    ],
  },
];

/** Stops of the guided tour, galaxy to atom (site ids with a caption). */
export const TOUR = [
  { site: 'galaxies', text: 'Two galaxies collide, far out in deep space. Each dot is a star; gravity tears out long tidal tails. Our Milky Way is the spiral behind you.' },
  { site: 'nursery', text: 'In the Orion Arm of the Milky Way, gas clouds collapse into new stars. Big stars burn fast and die young.' },
  { site: 'planets', text: 'The Solar System: eight planets orbiting the Sun under Newtonian gravity. Drag a planet to change its orbit.' },
  { site: 'climate', text: 'The Earth: its climate is a balance between sunlight in and heat radiated out. Ice spreads where it is cold enough.' },
  { site: 'weather', text: 'In a valley at 34° N, warm moist air rises and builds a thunderstorm.' },
  { site: 'ecosystem', text: 'Rabbits graze and foxes hunt on the savanna; each animal carries genes that evolve.' },
  { site: 'epidemic', text: 'In the town, an infection spreads from person to person.' },
  { site: 'mechanics', text: 'At the science campus, a mechanics lab: collisions, pendulums and springs.' },
  { site: 'cell', text: 'Under the microscope, a living cell takes up glucose and oxygen and makes ATP.' },
  { site: 'atoms', text: 'Zoom into the sample: water molecules jostle and bond.' },
  { site: 'shells', text: 'And one atom: a nucleus of protons and neutrons, with electrons in shells. That is 36 orders of magnitude from the colliding galaxies.' },
];

// Guided lessons and challenges. See runner.js for the format; every lesson
// is played through headlessly in tests/lessons.test.js, so each one is known
// to be completable.

import { orbitalElements } from '../sims/gravity.js';
import { AtomsSim } from '../sims/atoms.js';

const total = (ctx) => ['S', 'E', 'I', 'R', 'V', 'D'].reduce((n, k) => n + ctx.stat(k), 0);
const body = (ctx, name) => ctx.sim.bodies.find((b) => b.name === name);
const heaviest = (ctx) => ctx.sim.bodies.reduce((a, b) => (b.m > (a?.m ?? 0) ? b : a), null);
/** Orbit of a body around the heaviest one, or null if either is gone. */
const orbit = (ctx, b) => {
  const host = heaviest(ctx);
  return b && host && b !== host ? orbitalElements(b, host, ctx.sim.G) : null;
};
/** Rocky planets the learner added (scenarios name theirs, added ones are numbered). */
const addedPlanets = (ctx) => ctx.sim.bodies.filter((b) => b.kind === 'planet' && /^Rocky planet \d+$/.test(b.name));
/** Elemental make-up of every atom in the box, e.g. "CH₁₄NO". */
const composition = (ctx) => AtomsSim.formula(ctx.sim.atoms);

export const LESSONS = [
  {
    id: 'greenhouse',
    type: 'lesson',
    title: 'The greenhouse effect',
    summary: 'Double CO₂ and watch the planet warm until it balances again.',
    sim: 'climate',
    scenario: 'preindustrial',
    steps: [
      {
        text: 'This is Earth before the industrial era, with 280 ppm of CO₂. Watch the Global mean temperature in the Statistics panel while 5 years pass.',
        check: (c) => c.elapsed >= 5,
      },
      {
        text: 'Now double the CO₂: drag the CO₂ (ppm) slider in Parameters to at least 560 ppm.',
        hint: 'The slider is logarithmic: 560 ppm is a little right of the middle of the track.',
        check: (c) => c.params.co2 >= 550,
      },
      {
        text: 'Extra CO₂ traps outgoing heat, so the planet now absorbs more than it emits. Wait until it is 2 °C warmer than when you raised CO₂.',
        check: (c) => c.stat('globalT') >= c.start.stats.globalT + 2,
      },
      {
        text: 'Look at the Ice line: it has moved toward the pole. Less ice reflects less sunlight, which warms the planet further. This is the ice–albedo feedback. Open “Model & assumptions” to see the equation behind it, then press Next.',
      },
    ],
  },
  {
    id: 'flatten-curve',
    type: 'lesson',
    title: 'Flattening the curve',
    summary: 'Let an outbreak take off, then bend the curve with distancing and quarantine.',
    sim: 'epidemic',
    scenario: 'town',
    steps: [
      {
        text: 'Four people are infected (red). Each one infects neighbours who come within the contact radius. Let it spread until 40 people are infectious at once.',
        check: (c) => c.stat('I') >= 40,
      },
      {
        text: 'The simulation is paused so you can act. Set Social distancing to at least 0.6, tick Quarantine symptomatic, then press Play.',
        pause: true,
        check: (c) => c.params.distancing >= 0.6 && c.params.quarantine,
      },
      {
        text: 'Press Play if you have not already. Fewer contacts per day means each case infects fewer people. Wait until active infections fall to half of their peak.',
        check: (c) => {
          c.memo.peak = Math.max(c.memo.peak ?? 0, c.stat('I'));
          return c.stat('I') <= c.memo.peak / 2;
        },
      },
      {
        text: 'The chart shows the curve bending down. Try the same thing earlier or later: acting sooner leaves far more people never infected (Susceptible). Press Next to finish.',
      },
    ],
  },
  {
    id: 'hydrogen-light',
    type: 'lesson',
    title: 'Light from atoms',
    summary: 'Excite hydrogen with photons, ionise it, then turn it into helium.',
    sim: 'atom',
    scenario: 'hydrogen',
    steps: [
      {
        text: 'Choose the Add tool, pick “Photon” as the object to add, and click near the atom. The electron jumps to a higher shell, then falls back and emits light. Make it emit 3 photons.',
        hint: 'Each falling electron gives one line in the spectrum. The visible ones are the Balmer lines (656, 486, 434 nm…).',
        check: (c) => c.stat('photons') >= c.start.stats.photons + 3,
      },
      {
        text: 'Ionise the atom: raise “Photon energy” to its maximum (ionising UV) and add photons until the electron is knocked free and the Charge reads +1.',
        hint: 'You can also remove the electron directly with the Remove tool.',
        check: (c) => {
          c.memo.ionised ||= c.stat('charge') >= 1;
          return c.memo.ionised;
        },
      },
      {
        text: 'The number of protons decides the element. Add a proton (Add tool → “Proton”) to turn hydrogen into helium.',
        check: (c) => String(c.stat('element')).startsWith('Helium'),
      },
    ],
  },
  {
    id: 'energy-conservation',
    type: 'lesson',
    title: 'Where does the energy go?',
    summary: 'Kinetic and potential energy trade places; drag turns them into heat.',
    sim: 'mechanics',
    scenario: 'doublePendulum',
    steps: [
      {
        text: 'Watch the Kinetic, Potential and Total energy in the Statistics panel for 5 seconds. KE and PE keep swapping, but their total stays almost constant.',
        check: (c) => c.elapsed >= 5,
      },
      {
        text: 'Turn on air resistance: move the Air drag slider above 0.',
        check: (c) => c.params.drag > 0,
      },
      {
        text: 'Drag removes energy every time the pendulum moves. Wait until the total energy has fallen by a quarter.',
        check: (c) => c.stat('total') <= c.start.stats.total * 0.75,
      },
    ],
  },
  {
    id: 'osmosis',
    type: 'lesson',
    title: 'Osmosis',
    summary: 'See a cell swell and burst in fresh water, then shrink in syrup.',
    sim: 'cell',
    scenario: 'hypotonic',
    steps: [
      {
        text: 'This cell sits in pure water. It holds more dissolved particles than its surroundings, so water flows in. Watch “Volume vs. normal” climb past 120 %.',
        check: (c) => c.stat('volume') >= 120,
      },
      {
        text: 'Animal cells have no wall to resist the pressure. Keep watching until the membrane bursts.',
        check: (c) => String(c.stat('status')).startsWith('burst'),
      },
      {
        text: 'Now pick “hypertonic” in the scenario menu: the same cell placed in a sugary solution.',
        check: (c) => c.sim.scenarioId === 'hypertonic',
      },
      {
        text: 'Here the outside is more concentrated, so water leaves the cell. Wait until it shrinks below 85 % of its normal volume.',
        check: (c) => c.stat('volume') <= 85,
      },
    ],
  },
  {
    id: 'predator-prey',
    type: 'lesson',
    title: 'Who keeps whom in check?',
    summary: 'Remove the predators and watch the prey population explode.',
    sim: 'ecosystem',
    scenario: 'balanced',
    steps: [
      {
        text: 'Untick “Immigration” in Parameters so no new animals wander in.',
        check: (c) => !c.params.immigration,
      },
      {
        text: 'Carnivores are the larger red animals. Use the Remove tool (a big brush helps) to remove every one of them.',
        check: (c) => c.stat('carnivores') === 0,
      },
      {
        text: 'With nothing hunting them, herbivores multiply. Wait until there are 50 % more herbivores than when the last predator went.',
        check: (c) => c.stat('herbivores') >= c.start.stats.herbivores * 1.5,
      },
      {
        text: 'Watch the plants: as herbivores boom, the grass is eaten faster than it grows, and a crash usually follows. Predators keep that from happening. Press Next to finish.',
      },
    ],
  },

  {
    id: 'kepler',
    type: 'lesson',
    title: 'Why planets orbit',
    summary: 'Push Earth off its circle and see Kepler’s laws at work.',
    sim: 'gravity',
    scenario: 'solar',
    steps: [
      {
        text: 'Earth (blue, 1 AU from the Sun) moves sideways fast enough that, as it falls toward the Sun, it keeps missing. Choose the Inspect tool and click Earth: its Eccentricity is near 0, so the orbit is a circle. Watch one full year pass.',
        check: (c) => c.elapsed >= 1,
      },
      {
        text: 'Choose the Force tool and drag from Earth in the direction it is moving, to give it a kick forward. Make its orbit an ellipse with an Eccentricity of at least 0.3.',
        hint: 'A forward kick raises the far side of the orbit; a backward one lowers it. Check the Eccentricity in the inspector.',
        check: (c) => (orbit(c, body(c, 'Earth'))?.e ?? 0) >= 0.3,
      },
      {
        text: 'Kepler’s second law: a planet sweeps out equal areas in equal times, so it races near the Sun and crawls far away. Watch Earth for two more years.',
        check: (c) => c.elapsed >= 2,
      },
      {
        text: 'Kepler’s third law: bigger orbits take longer (period² ∝ size³). Inspect Earth again: its Period grew along with its Semi-major axis. Press Next to finish.',
      },
    ],
  },
  {
    id: 'star-lives',
    type: 'lesson',
    title: 'The lives of stars',
    summary: 'Heavy stars live fast and die in supernovae; light ones fade slowly.',
    sim: 'stars',
    scenario: 'masses',
    steps: [
      {
        text: 'Eleven newborn stars, from 0.5 to 40 times the Sun’s mass, sit side by side. Heavier stars burn their fuel far faster. Wait for the first one to swell into a giant.',
        hint: 'The HR diagram (bottom right) shows giants moving up and to the right.',
        check: (c) => c.stat('giants') >= 1,
      },
      {
        text: 'Stars above about 8 M☉ end in a supernova, leaving a neutron star or black hole. Wait for the first supernova.',
        check: (c) => c.stat('supernovae') >= 1,
      },
      {
        text: 'Lighter stars end more quietly, shedding their outer layers to leave a white dwarf. Wait until 6 of the stars have become remnants.',
        hint: 'You can raise Time speed in Parameters to hurry things along.',
        check: (c) => c.stat('remnants') >= 6,
      },
      {
        text: 'The 0.5 and 0.8 M☉ stars are still on the main sequence: they will shine for longer than the age of the Universe. Press Next to finish.',
      },
    ],
  },
  {
    id: 'states-of-matter',
    type: 'lesson',
    title: 'Solid, liquid, gas',
    summary: 'Cool argon until it condenses, then heat it back into a gas.',
    sim: 'atoms',
    scenario: 'gas',
    steps: [
      {
        text: 'Argon atoms fly around and bounce off each other: a gas. Temperature is just how fast they move. Lower the Target temperature in Parameters to 30 K or less.',
        check: (c) => c.params.thermostat && c.params.targetT <= 30,
      },
      {
        text: 'Slow atoms can no longer escape each other’s weak attraction, so they clump into droplets. Wait until the gas cools below 40 K.',
        check: (c) => c.stat('T') <= 40,
      },
      {
        text: 'Watch the Pressure in Statistics: clumped atoms rarely hit the walls, so it has dropped. Now heat it back up: set the Target temperature to at least 500 K.',
        check: (c) => c.params.targetT >= 500,
      },
      {
        text: 'Wait until the temperature passes 400 K: the droplets boil away and the pressure climbs again.',
        check: (c) => c.stat('T') >= 400,
      },
    ],
  },
  {
    id: 'clouds',
    type: 'lesson',
    title: 'How clouds form',
    summary: 'Sunshine warms the ground, air rises and cools, and water vapour condenses.',
    sim: 'weather',
    scenario: 'sunny',
    steps: [
      {
        text: 'The Sun heats the ground, which warms the air above it. Warm air is lighter, so it rises in thermals. Wait for an updraft of at least 1 m/s.',
        hint: 'Switch Display to “Temperature anomaly” to see the warm bubbles.',
        check: (c) => c.stat('updraft') >= 1,
      },
      {
        text: 'Rising air expands and cools. When it cools to its dew point, the vapour condenses into droplets: a cloud. Wait until clouds cover 10 % of the sky.',
        hint: 'Raise Speed in Parameters to hurry things along.',
        check: (c) => c.stat('cloudCover') >= 10,
      },
      {
        text: 'Turn off the Sun: set Solar heating to 0. Without warm ground, the thermals stop.',
        check: (c) => c.params.sun === 0,
      },
      {
        text: 'Wait until the cloud cover has halved. With no rising air to feed them, droplets mix with dry air and evaporate.',
        check: (c) => c.stat('cloudCover') <= c.start.stats.cloudCover / 2,
      },
    ],
  },

  // ---------- challenges ----------

  {
    id: 'ring-vaccination',
    type: 'challenge',
    title: 'Stop the outbreak',
    summary: 'End the epidemic while vaccinating under 30 % of people and keeping infections under 25 %.',
    sim: 'epidemic',
    scenario: 'town',
    steps: [
      {
        text: 'Use the Energy tool (Vaccinate) to protect people around the outbreak. Win when no one is exposed or infected, with fewer than 25 % ever infected. You lose if you vaccinate 30 % or more of the town.',
        hint: 'Ring vaccination: protect the people around each red case rather than the whole town.',
        check: (c) => c.elapsed > 1 && c.stat('E') + c.stat('I') === 0 && c.stat('R') + c.stat('D') < 0.25 * total(c),
      },
    ],
    fail: (c) => {
      if (c.stat('V') >= 0.3 * total(c)) return 'You vaccinated 30 % or more of the town.';
      if (c.stat('R') + c.stat('D') >= 0.25 * total(c)) return 'A quarter of the town has been infected.';
      return null;
    },
  },
  {
    id: 'escape-snowball',
    type: 'challenge',
    title: 'Escape Snowball Earth',
    summary: 'Thaw a frozen planet, then find out whether it refreezes.',
    sim: 'climate',
    scenario: 'snowball',
    steps: [
      {
        text: 'Under a faint young Sun, Earth froze from pole to pole. Thaw it: raise the global mean temperature above 10 °C. You may change only CO₂ and the Solar constant.',
        hint: 'Ice reflects most sunlight, so a snowball keeps itself cold. Even today’s Sun with lots of CO₂ is not enough. Push both sliders hard.',
        check: (c) => c.stat('globalT') > 10,
      },
      {
        text: 'Now return to today’s conditions: Solar constant at most 1361 W/m² and CO₂ at most 280 ppm. Keep the planet above 0 °C for 20 years.',
        hint: 'Same Sun, same CO₂ as the frozen start, yet a different climate. This is hysteresis: the state depends on history.',
        check: (c) => {
          const ok = c.params.solar <= 1361 && c.params.co2 <= 285 && c.stat('globalT') > 0;
          c.memo.since = ok ? (c.memo.since ?? c.sim.time) : undefined;
          return ok && c.sim.time - c.memo.since >= 20;
        },
      },
    ],
    fail: (c) => (['obliquity', 'iceAlbedo', 'baseAlbedo', 'transport', 'seasons'].some((k) => c.params[k] !== c.start.params[k])
      ? 'Only CO₂ and the Solar constant may change in this challenge.' : null),
  },
  {
    id: 'carbon-dating',
    type: 'challenge',
    title: 'Transmute carbon',
    summary: 'Turn carbon-14 into nitrogen without touching its protons.',
    sim: 'atom',
    scenario: 'carbon14',
    steps: [
      {
        text: 'Carbon-14 is radioactive. Turn this atom into nitrogen without using the Proton or Neutron tools or the inspector.',
        hint: 'β⁻ decay turns a neutron into a proton. Its half-life is 5,730 years, so speed up the decay.',
        check: (c) => String(c.stat('element')).startsWith('Nitrogen') && c.stat('decays') !== 'none',
      },
    ],
    fail: (c) => (c.stat('isotope').endsWith('-14') ? null : 'The mass number changed. Decay alone keeps it at 14.'),
  },
  {
    id: 'stable-orbit',
    type: 'challenge',
    title: 'Launch a planet',
    summary: 'Put a new planet into a nearly circular orbit around a lone star.',
    sim: 'gravity',
    scenario: 'lonelyStar',
    params: { orbitOnAdd: false },
    steps: [
      {
        text: 'This star has no planets. Add a Rocky planet (Add tool, “New bodies start in orbit” is off) and use the Force tool to throw it into an orbit with an Eccentricity below 0.1. Keep it orbiting for 3 years. Only one added planet may exist at a time.',
        hint: 'A circular orbit at distance r needs a sideways speed of 2π/√r AU/yr. Drag sideways from the planet, at right angles to the line to the star, and check the Eccentricity in the inspector.',
        check: (c) => {
          const [p] = addedPlanets(c);
          const o = orbit(c, p);
          const ok = addedPlanets(c).length === 1 && o && o.a > 0 && o.e < 0.1;
          c.memo.since = ok ? (c.memo.since ?? c.sim.time) : undefined;
          return ok && c.sim.time - c.memo.since >= 3;
        },
      },
    ],
    fail: (c) => {
      if (c.params.orbitOnAdd) return 'New planets must not start in orbit: launch it yourself.';
      if (c.params.gScale !== c.start.params.gScale) return 'Gravity strength may not change.';
      if (!c.sim.bodies.some((b) => b.name === 'Sun')) return 'The star is gone.';
      return null;
    },
  },
  {
    id: 'balance-ecosystem',
    type: 'challenge',
    title: 'Balance an ecosystem',
    summary: 'Keep foxes and rabbits alive for three years on scattered fertile islands, with no animals arriving from outside.',
    sim: 'ecosystem',
    scenario: 'islands',
    params: { immigration: false },
    steps: [
      {
        text: 'Food grows only on a few fertile islands in a desert. Left alone, the foxes (red) hunt the rabbits down and then starve. Keep both species alive for 3 years (1,095 days). You may change parameters, plants and food, and remove animals, but not add any.',
        hint: 'Watch the Carnivores count. When the foxes dwindle, feed them with the Energy tool to carry them through the lean time until the rabbits recover. Fertilising the desert (Energy on bare ground) gives the rabbits more room too.',
        check: (c) => c.elapsed >= 1095,
      },
    ],
    fail: (c) => {
      if (c.params.immigration) return 'Immigration must stay off: the ecosystem has to survive on its own.';
      c.memo.founders ??= new Set(c.sim.animals.map((a) => a.id));
      if (c.sim.animals.some((a) => a.generation === 1 && !c.memo.founders.has(a.id))) return 'Animals may not be added: only births count.';
      if (c.stat('carnivores') === 0) return 'The carnivores died out.';
      if (c.stat('herbivores') === 0) return 'The herbivores died out.';
      return null;
    },
  },
  {
    id: 'make-thunderstorm',
    type: 'challenge',
    title: 'Make a thunderstorm',
    summary: 'Turn a fair-weather sky into a downpour before the Sun sets.',
    sim: 'weather',
    scenario: 'sunny',
    steps: [
      {
        text: 'Fair-weather cumulus clouds only drizzle. Build a thunderstorm: a rain rate of at least 5 mm/h with an updraft of at least 10 m/s, before sunset (18:00). Do not switch scenario.',
        hint: 'Storms need air that keeps rising once it starts. Lower the Lapse stability so warm air stays buoyant all the way up, and add moist air for the clouds to feed on.',
        check: (c) => c.stat('rainRate') >= 5 && c.stat('updraft') >= 10,
      },
    ],
    fail: (c) => {
      if (c.sim.scenarioId !== 'sunny') return 'The scenario changed: build the storm from the sunny day.';
      if (c.sim.time >= 18 * 3600) return 'The Sun has set without a storm.';
      return null;
    },
  },
  {
    id: 'build-molecules',
    type: 'challenge',
    title: 'Build molecules',
    summary: 'Assemble water, ammonia and methane from loose atoms by hand.',
    sim: 'atoms',
    scenario: 'kit',
    steps: [
      {
        text: 'One carbon (grey), one nitrogen (blue), one oxygen (red) and 14 hydrogen atoms float in a cold box. Use the Move tool to build one each of water (H₂O), ammonia (H₃N) and methane (CH₄) at the same time. Atoms may not be added, removed or changed.',
        hint: 'An atom bonds as many times as its valence: O takes 2 hydrogens, N 3 and C 4. Drop each hydrogen right next to the heavy atom. If two hydrogens pair up as H₂, use “Break all bonds” in the inspector.',
        check: (c) => ['H₂O', 'H₃N', 'CH₄'].every((f) => c.sim.moleculeCensus()[f] >= 1),
      },
    ],
    fail: (c) => {
      c.memo.atoms ??= composition(c);
      return composition(c) === c.memo.atoms ? null : 'The set of atoms changed: build with the ones you were given.';
    },
  },
];

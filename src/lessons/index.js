// Guided lessons and challenges. See runner.js for the format; every lesson
// is played through headlessly in tests/lessons.test.js, so each one is known
// to be completable.

const total = (ctx) => ['S', 'E', 'I', 'R', 'V', 'D'].reduce((n, k) => n + ctx.stat(k), 0);

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
];

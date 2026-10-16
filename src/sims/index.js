import { GravitySim } from './gravity.js';
import { StarsSim } from './stars.js';
import { AtomsSim } from './atoms.js';
import { WeatherSim } from './weather.js';
import { EcosystemSim } from './ecosystem.js';
import { EpidemicSim } from './epidemic.js';

// Register new simulation modules here; the UI groups them by meta.category.
export const SIMULATIONS = [GravitySim, StarsSim, AtomsSim, WeatherSim, EcosystemSim, EpidemicSim];

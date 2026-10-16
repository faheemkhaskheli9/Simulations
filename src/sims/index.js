import { GravitySim } from './gravity.js';
import { StarsSim } from './stars.js';
import { AtomsSim } from './atoms.js';
import { WeatherSim } from './weather.js';
import { EcosystemSim } from './ecosystem.js';
import { EpidemicSim } from './epidemic.js';
import { ClimateSim } from './climate.js';
import { MechanicsSim } from './mechanics.js';
import { AtomSim } from './atom.js';
import { CellSim } from './cell.js';

// Register new simulation modules here; the UI groups them by meta.category.
export const SIMULATIONS = [GravitySim, StarsSim, AtomSim, AtomsSim, MechanicsSim, WeatherSim, ClimateSim, CellSim, EcosystemSim, EpidemicSim];

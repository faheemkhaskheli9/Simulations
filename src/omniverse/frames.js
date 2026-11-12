// G0.06 — an explicit SI local-frame boundary for future G1 gameplay.
// No astronomical AU/year gravity constants or Science-mode instance state cross this API.
import { GameSession } from './session.js';
import { getUniverse } from './universes.js';

/**
 * Sample acceleration and a process-local timestep for one logical tick.
 * This does NOT integrate velocity or mutate any game/science state.
 * \`dtLocal\` is used only by the future local entity solver; the global
 * authoritative clock must not be multiplied by the time field again.
 */
export function sampleLocalPhysics(session, { frameId, position, dtGlobal }) {
  if (!(session instanceof GameSession)) throw new TypeError('Expected an OMNIVERSE GameSession');
  const { manifest } = getUniverse(session.selectedUniverseId);
  if (frameId !== manifest.id + ':root') throw new RangeError('OMNIVERSE: incompatible local frame');
  if (typeof dtGlobal !== 'number' || !Number.isFinite(dtGlobal) || dtGlobal < 0 || dtGlobal > 1) {
    throw new RangeError('OMNIVERSE: dtGlobal must be in [0, 1] seconds');
  }
  // evaluateRules validates finite SI coordinates, frame and logical tick.
  const sample = session.evaluate(position);
  const dtLocal = dtGlobal * sample.timeRate;
  if (!Number.isFinite(dtLocal)) throw new RangeError('OMNIVERSE: local timestep overflow');
  return Object.freeze({
    frameId,
    positionMeters: Object.freeze([...position]),
    accelerationMetersPerSecondSquared: Object.freeze([...sample.gravity]),
    dtGlobalSeconds: dtGlobal,
    dtLocalSeconds: dtLocal,
    timeRate: sample.timeRate,
    provenance: Object.freeze({ ...sample.provenance }),
  });
}

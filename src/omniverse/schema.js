// OMNIVERSE G0: data-only rules are separate from the educational simulation contract.
export const OMNIVERSE_SCHEMA_VERSION = 1;
export const UNIVERSE_FORMAT = 'omniverse-universe';
export const RULEPACK_FORMAT = 'omniverse-rules';
export const LOCAL_FRAME = 'local-3d-y-up';
export const SI_UNITS = Object.freeze({ position: 'm', mass: 'kg', time: 's', acceleration: 'm/s2' });
export const CAPABILITIES = Object.freeze(['gravity-field.v1', 'local-time-rate.v1']);
export const MAX_SPATIAL_FIELDS = 32;

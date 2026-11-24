// @ts-check

// Cache commun à toutes les fabriques du layer file, hors du dossier découvert par consign.
/** @type {Map<string, string>} */
export const resolvedPaths = new Map();
/** @type {Map<string, unknown>} */
export const yamlCache = new Map();

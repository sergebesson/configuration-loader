// @ts-check

import _ from "lodash";

/**
 * Descripteur transmis au layer découvert ; chaque source valide ses propres champs.
 * @typedef {Record<string, unknown> & {
 *   type?: unknown,
 *   desc?: unknown,
 *   config?: unknown,
 *   file?: unknown,
 *   mapping?: unknown,
 *   url?: unknown,
 * }} LayerDescriptor
 */

/** @typedef {{message: string, status?: number, data?: unknown, headers?: unknown}} HttpAttempt */

/**
 * Un layer peut conserver des champs d'entrée ou produire ses propres diagnostics.
 * @typedef {LayerDescriptor & {error?: unknown, attempts?: HttpAttempt[]}} LayerResult
 */

/** @typedef {{load(layer: LayerDescriptor): LayerResult | PromiseLike<LayerResult>}} Layer */

export class LayerListenerError extends Error {}

/**
 * Définie le layer en error
 * @param {unknown} layer le descripteur, éventuellement invalide
 * @param {unknown} errorLayer l'erreur
 * @param {Pick<LayerResult, "attempts">} [otherData] informations supplémentaires
 * @returns {LayerResult & {error: Error}} le layer avec son erreur
 */
export function setLayerInError(layer, errorLayer, otherData) {
	const error = updateError(errorLayer);
	return _.assign({}, layer, {error}, otherData);
}

/**
 * @param {LayerDescriptor} layer le layer
 * @param {unknown} config la config à injecter au layer
 * @param {Pick<LayerResult, "attempts">} [otherData] informations supplémentaires
 * @returns {LayerResult} le layer avec la configuration
 */
export function setConfigInLayer(layer, config, otherData) {
	return _.assign({}, layer, {config}, otherData);
}

/** @param {unknown} error */
function updateError(error) {
	if (_.isError(error)) {
		return error;
	}

	// Laisser Error convertir le message éventuel, comme pour toute valeur levée.
	const source = /** @type {{message?: unknown} | null | undefined} */ (error);
	return _.assign(new Error(/** @type {string | undefined} */ (source?.message)), _.omit(source, "message"));
}

// @ts-check

import _ from "lodash";
import dot from "dot-object";
import * as layerModel from "../models/layer.js";

/** @import {LayerDescriptor, LayerResult} from "../models/layer.js" */
/** @import {PropertyPath} from "lodash" */

/** @typedef {{path?: unknown, type?: unknown}} MappingEntry */

export default function () {
	return {
		load,
	};
}

/**
 * Charge un layer de type environment
 * @param {LayerDescriptor} layer
 * @returns {Promise<LayerResult>}
 */
function load(layer) {
	const {mapping} = layer;
	const messageError = isLayerValid(layer);
	if (_.isString(messageError)) {
		return Promise.resolve(layerModel.setLayerInError(layer, {message: messageError}));
	}

	// Seul le conteneur a été validé ; les entrées restent brutes.
	const entries = /** @type {Record<string, unknown>} */ (mapping);
	const dotMapping = _.reduce(entries, (_dotMapping, value, key) => {
		_dotMapping[key] = _.isPlainObject(value) ?
			/** @type {MappingEntry} */ (value).path : value;
		return _dotMapping;
	}, /** @type {Record<string, unknown>} */ ({}));

	const config = dot.transform(dotMapping, process.env);

	let errorMessage = "";
	const success = _.every(entries, (entry, key) => {
		const map = /** @type {MappingEntry} */ (entry);
		if (!_.isString(map.type)) {
			return true;
		}
		/** @type {unknown} */
		const value = _.get(config, /** @type {PropertyPath} */ (map.path));
		if (_.isUndefined(value)) {
			return true;
		}

		switch (map.type) {
			case "boolean":
				_.set(config, /** @type {PropertyPath} */ (map.path),
					value === "true" || value === "on" || value === "1");
				break;
			case "number":
				{
					const newValue = Number(value);
					if (!_.isFinite(newValue)) {
						errorMessage = `La variable d'environnement '${ key }' n'est pas un nombre (${ value })`;
						return false;
					}
					_.set(config, /** @type {PropertyPath} */ (map.path), newValue);
				}
				break;
			default:
				break;
		}
		return true;
	});

	return Promise.resolve(
		success ?
			layerModel.setConfigInLayer(layer, config) :
			layerModel.setLayerInError(layer, {message: errorMessage}),
	);
}

/**
 * @param {LayerDescriptor} layer
 * @returns {string | undefined} le message si le mapping est invalide
 */
function isLayerValid({mapping}) {
	if (!_.isPlainObject(mapping)) {
		return "'mapping' n'est pas un object";
	}
}

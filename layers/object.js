// @ts-check

import _ from "lodash";
import * as layerModel from "../models/layer.js";

/** @import {LayerDescriptor, LayerResult} from "../models/layer.js" */

export default function () {
	return {
		load,
	};
}

/**
 * Charge un layer de type object
 * @param {LayerDescriptor} layer
 * @returns {Promise<LayerResult>}
 */
function load(layer) {
	const messageError = isLayerValid(layer);
	return Promise.resolve(
		messageError ?
			layerModel.setLayerInError(layer, {message: messageError}) :
			_.clone(layer),
	);
}

/**
 * @param {LayerDescriptor} layer
 * @returns {string | undefined} le message si la configuration est invalide
 */
function isLayerValid({config}) {
	if (!_.isPlainObject(config)) {
		return "'config' n'est pas un object";
	}
}

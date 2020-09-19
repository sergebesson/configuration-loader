"use strict";

const _ = require("lodash");
const layerModel = require("../models/layer.js");

module.exports = function () {
	return {
		load,
	};
};

/**
 * Charge un layer de type object
 * @param {Object} layer le layer
 * @returns {Promise} si résolue retourne la configuration
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
 * Control que le layer soit valide
 * @param {Object} config
 * @returns {Object} contenant valid (un boolean) et error (le message d'erreur)
 */
function isLayerValid({config}) {
	if (!_.isPlainObject(config)) {
		return "'config' n'est pas un object";
	}
}

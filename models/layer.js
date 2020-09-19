"use strict";

const _ = require("lodash");

module.exports = {
	setLayerInError,
	setConfigInLayer,
};

/**
 * Définie le layer en error
 * @param {Object} layer le layer
 * @param {Object} errorLayer l'erreur
 * @param {object} otherData (facultatif) ajout d'autres information au layer
 * @returns {Object} le layer avec son erreur
 */
function setLayerInError(layer, errorLayer, otherData) {
	const error = updateError(errorLayer);
	return _.assign({}, layer, {error}, otherData);
}

/**
 *
 * @param {Object} layer le layer
 * @param {Object} config la config à injecter au layer
 * @param {Object} otherData (facultatif) ajout d'autres information au layer
 * @returns {Object} le layer avec la configuration
 */
function setConfigInLayer(layer, config, otherData) {
	return _.assign({}, layer, {config}, otherData);
}

function updateError(error) {
	if (_.isError(error)) {
		return error;
	}

	return _.assign(new Error(error.message), _.omit(error, "message"));
}

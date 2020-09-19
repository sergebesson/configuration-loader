"use strict";

const _ = require("lodash");
const path = require("path");
require("require-yaml");

const layerModel = require("../models/layer.js");

module.exports = function () {
	return {
		load,
	};
};

/**
 * Charge un layer de type file
 * @param {Object} layer le layer
 * @returns {Promise} si résolue retourne la configuration
 */
function load(layer) {
	const {file} = layer;
	const messageError = isLayerValid(layer);
	if (_.isString(messageError)) {
		return Promise.resolve(layerModel.setLayerInError(layer, {message: messageError}));
	}

	try {
		// eslint-disable-next-line global-require
		const config = require(file.startsWith("/") ? file : path.join("../", file));
		return Promise.resolve(layerModel.setConfigInLayer(layer, config));
	} catch (errorRequire) {
		return Promise.resolve(layerModel.setLayerInError(layer,
			{
				message: `Impossible de lire ${file}`,
				cause: errorRequire.message,
			}));
	}
}

/**
 * Control que le layer soit valide
 * @param {String} file
 * @returns {Object} contenant valid (un boolean) et error (le message d'erreur)
 */
function isLayerValid({file}) {
	if (!_.isString(file) || _.isEmpty(file)) {
		return "'file' n'est pas valide";
	}
}

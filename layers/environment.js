"use strict";

const _ = require("lodash");
const dot = require("dot-object");

const layerModel = require("../models/layer.js");

module.exports = function () {
	return {
		load,
	};
};

/**
 * Charge un layer de type environment
 * @param {Object} layer le layer
 * @returns {Promise} si résolue retourne la configuration
 */
function load(layer) {
	const {mapping} = layer;
	const messageError = isLayerValid(layer);
	if (_.isString(messageError)) {
		return Promise.resolve(layerModel.setLayerInError(layer, {message: messageError}));
	}

	const dotMapping = _.reduce(mapping, (_dotMapping, value, key) => {
		_dotMapping[key] = _.isPlainObject(value) ? value.path : value;
		return _dotMapping;
	}, {});

	const config = dot.transform(dotMapping, process.env);

	let errorMessage = "";
	const success = _.every(mapping, (map, key) => {
		if (!_.isString(map.type)) {
			return true;
		}
		const value = _.get(config, map.path);
		if (_.isUndefined(value)) {
			return true;
		}

		switch (map.type) {
			case "boolean":
				_.set(config, map.path, value === "true" || value === "on" || value === "1");
				break;
			case "number":
				{
					const newValue = Number(value);
					if (!_.isFinite(newValue)) {
						errorMessage = `La variable d'environnement '${ key }' n'est pas un nombre (${ value })`;
						return false;
					}
					_.set(config, map.path, newValue);
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
 * Control que le layer soit valide
 * @param {Object} mapping
 * @returns {Object} contenant valid (un boolean) et error (le message d'erreur)
 */
function isLayerValid({mapping}) {
	if (!_.isPlainObject(mapping)) {
		return "'mapping' n'est pas un object";
	}
}

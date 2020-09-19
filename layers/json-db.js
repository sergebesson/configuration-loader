"use strict";

const _ = require("lodash");
const {JsonDb} = require("@sbesson/json-db");

const layerModel = require("../models/layer.js");

module.exports = function (app) {
	const JsonDbService = _.get(app, "services.JsonDb", JsonDb);
	return {
		load,
	};

	/**
	 * Charge un layer de type json-db
	 * @param {Object} layer le layer
	 * @returns {Promise} si résolue retourne la configuration
	 */
	function load(layer) {
		const {file, id} = layer;
		const messageError = isLayerValid(layer);
		if (_.isString(messageError)) {
			return Promise.resolve(layerModel.setLayerInError(layer, {message: messageError}));
		}

		const jsonDb = new JsonDbService(file);
		return jsonDb.getById(id)
			.then((document) => {
				if (!document) {
					return layerModel.setLayerInError(layer, {
						message: `json-db: l'id '${id}' est inconnu`,
					});
				}

				return configWithoutId(jsonDb, document)
					.then((config) => layerModel.setConfigInLayer(layer, config));

			})
			.catch((error) => {
				return layerModel.setLayerInError(layer, error);
			});
	}
};

/**
 * Control que le layer soit valide
 * @param {String} file
 * @param {Integer|String} id
 * @returns {Object} contenant valid (un boolean) et error (le message d'erreur)
 */
function isLayerValid({file, id}) {
	if (!_.isString(file) || _.isEmpty(file)) {
		return "'file' n'est pas valide";
	}
	if (!_.isInteger(id) && (!_.isString(id) || _.isEmpty(id))) {
		return "'id' n'est pas valide";
	}
}

/**
 * Supprime l'id JsonDb dans le document
 * @param {JsonDb} jsonDb l'Object JsonDb
 * @param {Object} document le document contenant l'id JsonDb
 * @returns {Promise} si résolu retourne le document sans l'id JsonDb
 */
function configWithoutId(jsonDb, document) {
	return jsonDb.getStructure()
		.then((structure) => _.omit(document, structure.idName));
}

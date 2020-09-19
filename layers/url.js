"use strict";

const _ = require("lodash");
const axios = require("axios");

const layerModel = require("../models/layer.js");

module.exports = function (app) {
	const httpTimeoutRequestInS = _.get(app, "options.httpTimeoutRequestInS", 20);
	const httpTimeoutInS = _.get(app, "options.httpTimeoutInS", 180); // 3mn
	const httpRetryDelayInS = _.get(app, "options.httpRetryDelayInS", 10);
	const timeService = _.get(app, "services.timeService", delayMs);
	const configLoader = _.get(app, "configLoader");

	return {
		load,
	};

	/**
	 * Charge un layer de type url
	 * @param {Object} layer le layer
	 * @returns {Promise} si résolue retourne la configuration
	 */
	function load(layer) {
		const {url} = layer;
		const messageError = isLayerValid(layer);
		if (_.isString(messageError)) {
			return Promise.resolve(layerModel.setLayerInError(layer, {message: messageError}));
		}

		const attempts = [];
		let timeout = false;
		// On va lancer deux promises, si la 1ere à finir est initTimeout, c'est qu'on a pas réussi
		// dans les temps à charger l'url
		return Promise.race([
			initTimeout(),
			tryToLoadHttp(),
		]);

		// Promise de timeout
		function initTimeout() {
			return timeService(() => {
				timeout = true;
				return Promise.resolve(
					layerModel.setLayerInError(layer,
						{message: `le délai de ${httpTimeoutInS}s a expiré`},
						{attempts},
					),
				);
			}, httpTimeoutInS * 1000);
		}

		// Promise de tentative de GET sur l'url
		function tryToLoadHttp() {
			if (timeout) {
				return;
			}
			// On fait le GET
			return axios.get(url, {timeout: httpTimeoutRequestInS * 1000})
				.then((response) => layerModel.setConfigInLayer(layer, response.data, {attempts}))
				.catch((errorAxios) => {
					// On retente
					const attempt = _.assign(
						{message: errorAxios.message},
						_.pick(errorAxios.response, ["status", "data", "headers"]),
					);
					attempts.push(attempt);
					configLoader.emit("layer_url_attempt_error", layer, attempt);
					return timeService(tryToLoadHttp, httpRetryDelayInS * 1000);
				});
		}
	}
};

/**
 * Control que le layer soit valide
 * @param {String} url
 * @returns {Object} contenant valid (un boolean) et error (le message d'erreur)
 */
function isLayerValid({url}) {
	if (!isUrlValid(url)) {
		return "'url' n'est pas valide";
	}
}

/**
 * Control l'url
 * @param {String} url
 */
function isUrlValid(url) {
	return (
		_.isString(url) &&
			(url.startsWith("http://") ||
			url.startsWith("https://"))
	);
}

/**
 * Execute une callback au bout d'un certain délai
 * @param {Function} callback la callback
 * @param {Integer} delay le délai en ms
 * @returns {Promise} exécuté au bout du delay avec la valeur de retour de la callback
 */
function delayMs(callback, delay) {
	return new Promise((resolve) => {
		_.delay(() => resolve(callback()), delay);
	});
}

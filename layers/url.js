// @ts-check

import {setTimeout as wait} from "node:timers/promises";
import _ from "lodash";
import axios from "axios";
import * as layerModel from "../models/layer.js";

/** @import {HttpAttempt, LayerDescriptor, LayerResult} from "../models/layer.js" */
/** @import {LayerEvents, LoaderOptions} from "../ConfigLoader.js" */

/**
 * @typedef {object} UrlContext
 * @property {LoaderOptions} [options]
 * @property {{timeService?: TimeService}} [services]
 * @property {Pick<import("node:events").EventEmitter<LayerEvents>, "emit">} configLoader
 */

/** @typedef {typeof delayMs} TimeService */

/** @param {UrlContext} app */
export default function (app) {
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
	 * @param {LayerDescriptor} layer
	 * @returns {Promise<LayerResult>}
	 */
	function load(layer) {
		const {url} = layer;
		const messageError = isLayerValid(layer);
		if (_.isString(messageError)) {
			return Promise.resolve(layerModel.setLayerInError(layer, {message: messageError}));
		}

		/** @type {HttpAttempt[]} */
		const attempts = [];
		const controller = new AbortController();
		const {signal} = controller;
		const result = Promise.race([
			timeService(() => layerModel.setLayerInError(layer,
				{message: `le délai de ${httpTimeoutInS}s a expiré`},
				{attempts},
			), httpTimeoutInS * 1000, signal),
			tryToLoadHttp(),
		]).finally(() => controller.abort());
		// Les tentatives ne renvoient undefined qu'après la fin de la course (annulation).
		return /** @type {Promise<LayerResult>} */ (result);

		/** @returns {Promise<LayerResult | undefined> | undefined} */
		function tryToLoadHttp() {
			if (signal.aborted) {
				return;
			}
			// On fait le GET
			const requestUrl = /** @type {string} */ (url);
			return axios.get(requestUrl, {timeout: httpTimeoutRequestInS * 1000, signal})
				.then((/** @type {import("axios").AxiosResponse<unknown>} */ response) =>
					layerModel.setConfigInLayer(layer, response.data, {attempts}))
				.catch((/** @type {unknown} */ errorAxios) => {
					if (signal.aborted) {
						return;
					}
					// On retente
					const error = /** @type {import("axios").AxiosError<unknown>} */ (errorAxios);
					const attempt = _.assign(
						{message: error.message},
						_.pick(error.response, ["status", "data", "headers"]),
					);
					attempts.push(attempt);
					try {
						configLoader.emit("layer_url_attempt_error", layer, attempt);
					} catch (listenerError) {
						throw new layerModel.LayerListenerError(undefined, {cause: listenerError});
					}
					return timeService(tryToLoadHttp, httpRetryDelayInS * 1000, signal);
				});
		}
	}
}

/**
 * @param {LayerDescriptor} layer
 * @returns {string | undefined} le message si l'URL est invalide
 */
function isLayerValid({url}) {
	if (!isUrlValid(url)) {
		return "'url' n'est pas valide";
	}
}

/**
 * @param {unknown} url
 */
function isUrlValid(url) {
	return (
		_.isString(url) &&
			(url.startsWith("http://") || url.startsWith("https://")) &&
			URL.canParse(url)
	);
}

/**
 * Execute une callback au bout d'un certain délai
 * @template T
 * @param {() => T | PromiseLike<T>} callback la callback
 * @param {number} delay le délai en ms
 * @param {AbortSignal} signal annule le délai avant l'exécution de la callback
 * @returns {Promise<T>} résolue avec le résultat de la callback
 */
function delayMs(callback, delay, signal) {
	return wait(delay, undefined, {signal}).then(callback);
}

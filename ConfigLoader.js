// @ts-check

import {EventEmitter} from "node:events";
import {fileURLToPath} from "node:url";
import _ from "lodash";
import consign from "consign";
import ajvModule from "ajv";
import formats from "ajv-formats";
import * as layerModel from "./models/layer.js";

/** @import {HttpAttempt, Layer, LayerDescriptor, LayerResult} from "./models/layer.js" */
/** @import {FormatsPlugin} from "ajv-formats" */

// Node importe module.exports, qui porte aussi la valeur déclarée comme export par défaut.
const Ajv = /** @type {typeof ajvModule & typeof ajvModule.default} */ (ajvModule);
const ajvFormats = /** @type {typeof formats & FormatsPlugin} */ (formats);

/**
 * @typedef {Record<string, unknown> & {
 *   jsonschema?: unknown,
 *   httpTimeoutRequestInS?: number,
 *   httpTimeoutInS?: number,
 *   httpRetryDelayInS?: number,
 * }} LoaderOptions
 */

/**
 * @typedef {object} LoaderContext
 * @property {LoaderOptions | undefined} options
 * @property {ConfigLoader} configLoader
 * @property {Record<PropertyKey, Layer>} [layers]
 * @property {{timeService?: import("./layers/url.js").TimeService}} [services]
 */

/**
 * Événements émis par le chargeur.
 * @typedef {{
 *   layer_load_start: [layer: LayerDescriptor],
 *   layer_load_stop: [layer: LayerResult],
 *   layer_load_error: [layer: LayerResult],
 *   layer_url_attempt_error: [layer: LayerDescriptor, attempt: HttpAttempt],
 * }} LayerEvents
 */

/** @typedef {Omit<import("ajv").ErrorObject<string, Record<string, unknown>, unknown>, "schemaPath">} SchemaError */
/** @typedef {Error & ({type: "layer", details: LayerResult[]} | {type: "jsonschema", details: SchemaError[]})} LoadError */
/** @typedef {import("ajv").ValidateFunction | import("ajv").AsyncValidateFunction} ConfigValidator */

/** @extends {EventEmitter<LayerEvents>} */
export class ConfigLoader extends EventEmitter {
	/** @type {Record<string, unknown>} */
	#config = {};
	/** @type {LayerResult[]} */
	#layers = [];
	/** @type {LoaderContext} */
	#app;
	/** @type {ConfigValidator | undefined} */
	#ajvValidate;

	/**
	 * @param {LoaderOptions} [options]
	 */
	constructor(options) {
		super();

		this.#app = {options, configLoader: this};

		const jsonschema = options?.jsonschema;

		if (_.isObject(jsonschema)) {
			const ajv = new Ajv({allErrors: true});
			ajvFormats(ajv);
			this.#ajvValidate = ajv.compile(jsonschema);
		}

		consign({
			verbose: false,
			cwd: fileURLToPath(new URL(".", import.meta.url)),
		})
			.include("layers")
			.into(this.#app);
	}

	/** Copie profonde de la dernière configuration valide. */
	get config() {
		return _.cloneDeep(this.#config);
	}

	/**
	 * Charge la configuration à partir de layers.
	 * @param {ArrayLike<unknown> | Record<string, unknown>} layers Collection de descripteurs
	 * @returns {Promise<void>} La promise sera résolue si au moins un layer a pu être chargé sans erreur.
	 * @throws {LoadError} Rejet si tous les layers échouent ou si la validation échoue.
	 */
	load(layers) {
		// on charge les layers
		return Promise.all(_.map(layers, (layer) => this.#loadLayer(layer)))
			.then((layersLoaded) => {
				this.#layers = layersLoaded;
				if (!this.#hasLayersInSuccess()) {
					return Promise.reject(/** @satisfies {LoadError} */ (Object.assign(new Error("Tous les layers ont échoués"), {
						type: /** @type {const} */ ("layer"),
						details: this.getLayersInError(),
					})));
				}

				const config = this.#mergeConfig();
				if (!this.#hasValidateConfiguration(config)) {
					return Promise.reject(/** @satisfies {LoadError} */ (Object.assign(new Error("La configuration ne correspond pas au json schema"), {
						type: /** @type {const} */ ("jsonschema"),
						details: this.#getAjvError(),
					})));
				}
				this.#config = config;
			});
	}

	/**
	 * Teste si au moins un layer est en erreur.
	 * @returns {boolean} true si au moins un layer n'a pas pu être chargé.
	 */
	hasLayersInError() {
		return this.#layers.some((layer) => layer?.error);
	}

	/**
	 * Récupère les layers en erreur
	 * @returns {LayerResult[]} les layers en erreur
	 */
	getLayersInError() {
		return this.#layers.filter((layer) => layer?.error);
	}

	/**
	 * Récupération de la valeur d'une option
	 * @param {import("lodash").PropertyPath} fromPath Chemin de l'option, exemple: "option1.cle1"
	 * @param {unknown} [defaultValue] Valeur par défaut si l'option n'existe pas
	 * @returns {unknown}
	 */
	getValue(fromPath, defaultValue) {
		return _.cloneDeep(_.get(this.#config, fromPath, defaultValue));
	}

	/**
	 * Valide la configuration grace au json schéma
	 * @param {Record<string, unknown>} config Configuration fusionnée à valider
	 * @returns {boolean | Promise<unknown>} le résultat du validateur, tel que renvoyé par Ajv
	 */
	#hasValidateConfiguration(config) {
		if (!this.#ajvValidate) {
			return true;
		}

		return this.#ajvValidate(config);
	}

	/**
	 * Récupère les erreurs ajv suite à la non validation de la configuration
	 * @returns {SchemaError[]} les erreurs sans le chemin du schéma
	 */
	#getAjvError() {
		// Appelé après l'échec de la validation : le validateur est présent.
		const validator = /** @type {ConfigValidator} */ (this.#ajvValidate);
		return _.map(validator.errors, (error) => _.omit(error, ["schemaPath"]));
	}

	/**
	 * Teste si au moins un layer a pu être chargé.
	 * @returns {boolean} true si au moins un layer a pu être chargé.
	 */
	#hasLayersInSuccess() {
		return this.#layers.some((layer) => !layer?.error);
	}

	/**
	 * Récupère les layers qui ont été chargé avec succès
	 * @returns {LayerResult[]} les layers chargés avec succès
	 */
	#getLayersInSuccess() {
		return this.#layers.filter((layer) => layer.error === undefined);
	}

	/**
	 * Charge un layer
	 * @param {unknown} layer le descripteur à charger
	 * @returns {Promise<LayerResult>} le layer chargé avec la configuration ou en erreur
	 */
	#loadLayer(layer) {
		const descriptor = /** @type {LayerDescriptor} */ (layer);
		if (!_.isObject(layer) || !_.isFunction(_.get(this.#app.layers, [
			/** @type {PropertyKey} */ (descriptor.type), "load",
		]))) {
			return Promise.resolve(
				layerModel.setLayerInError(layer, {message: "'type' incorrect"}),
			);
		}
		this.emit("layer_load_start", descriptor);
		/** @type {Promise<LayerResult>} */
		const loading = new Promise((resolve) => {
			// Refaire la recherche après l'événement et conserver le récepteur du layer.
			const layers = /** @type {NonNullable<LoaderContext["layers"]>} */ (this.#app.layers);
			resolve(layers[/** @type {PropertyKey} */ (descriptor.type)].load(descriptor));
		});
		return loading
			.catch((/** @type {unknown} */ error) => {
				if (error instanceof layerModel.LayerListenerError) {
					throw error.cause;
				}
				return layerModel.setLayerInError(layer, error);
			})
			.then((layerLoaded) => {
				this.emit(`layer_load_${ layerLoaded.error ? "error" : "stop" }`, layerLoaded);
				return layerLoaded;
			});
	}

	/**
	 * Fusionne les configurations des layers chargés avec succès
	 * @returns {Record<string, unknown>} la configuration fusionnée
	 */
	#mergeConfig() {
		return _.reduce(
			this.#getLayersInSuccess(),
			(memo, layer) => _.merge(memo, layer.config),
			{},
		);
	}
}

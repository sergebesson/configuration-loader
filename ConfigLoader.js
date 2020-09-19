"use strict";

const _ = require("lodash");
const consign = require("consign");
const Ajv = require("ajv");
const EventEmitter = require("events");

const layerModel = require("./models/layer.js");

class ConfigLoader extends EventEmitter {
	/**
	 * Constructeur de la class ConfigLoader
	 * @param {Object} options object contenant les options.
	 */
	constructor(options) {
		super();

		this.app = {options, configLoader: this};
		this.config = {};
		this.layers = [];

		const jsonschema = _.get(options, "jsonschema");

		if (_.isObject(jsonschema)) {
			const ajv = new Ajv({allErrors: true});
			this.ajvValidate = ajv.compile(jsonschema);
		}

		consign({
			verbose: false,
			cwd: __dirname,
		})
			.include("layers")
			.into(this.app);
	}

	/**
	 * Charge la configuration à partir de layers.
	 * @param {Array} layers Liste de layer
	 * @returns {Promise} La promise sera résolue si au moins un layer a pu être chargé sans erreur.
	 */
	load(layers) {
		// on charge les layers
		return Promise.all(_.map(layers, (layer) => this.loadLayerPrivate(layer)))
			.then((layersLoaded) => {
				this.layers = layersLoaded;
				if (!this.hasLayersInSuccessPrivate()) {
					return Promise.reject(
						_.assign(
							new Error("Tous les layers ont échoués"), {
								type: "layer",
								details: this.getLayersInError(),
							},
						));
				}

				this.config = this.mergeConfigPrivate();
				if (!this.hasValidateConfigurationPrivate()) {
					return Promise.reject(
						_.assign(
							new Error("La configuration ne correspond pas au json schema"), {
								type: "jsonschema",
								details: this.getAjvErrorPrivate(),
							},
						));
				}
			});
	}

	/**
	 * Teste si au moins un layer est en erreur.
	 * @returns {Boolean} true si au moins un layer n'a pas pu être chargé.
	 */
	hasLayersInError() {
		return _.some(this.layers, "error");
	}

	/**
	 * Récupère les layers en erreur
	 * @returns {Array} Retourne la liste des layers en erreurs
	 */
	getLayersInError() {
		return _.filter(this.layers, "error");
	}

	/**
	 * Récupération de la valeur d'une option
	 * @param {String} fromPath Chemin de l'option, exemple: "option1.cle1"
	 * @param {*} defaultValue Valeur par défaut si l'option n'existe pas
	 */
	getValue(fromPath, defaultValue) {
		return _.cloneDeep(_.get(this.config, fromPath, defaultValue));
	}

	//------------------------------
	// Private Méthodes
	//------------------------------

	/**
	 * Valide la configuration grace au json schéma
	 * @returns {Boolean} true si la configuration est valide
	 */
	hasValidateConfigurationPrivate() {
		if (!this.ajvValidate) {
			return true;
		}

		return this.ajvValidate(this.config);
	}

	/**
	 * Récupère les erreurs ajv suite à la non validation de la configuration
	 * @returns {Array} Retourne la liste des erreurs
	 */
	getAjvErrorPrivate() {
		return _.map(this.ajvValidate.errors,
			(error) => _.omit(error, ["schemaPath"]));
	}

	/**
	 * Teste si au moins un layer a pu être chargé.
	 * @returns {Boolean} true si au moins un layer a pu être chargé.
	 */
	hasLayersInSuccessPrivate() {
		return !_.every(this.layers, "error");
	}

	/**
	 * Récupère les layers qui ont été chargé avec succès
	 * @returns {Array} Retourne la liste des layers chargé avec succès
	 */
	getLayersInSuccessPrivate() {
		return _.filter(this.layers, (layer) => _.isUndefined(layer.error));
	}

	/**
	 * Charge un layer
	 * @param {Object} layer le layer à charger
	 * @returns {Promise} Si résolue la promise retourne le layer chargé avec la conf ou en erreur
	 */
	loadLayerPrivate(layer) {
		if (!_.isFunction(_.get(this.app.layers, [layer.type, "load"]))) {
			return Promise.resolve(
				layerModel.setLayerInError(layer, {message: "'type' incorrect"}),
			);
		}
		this.emit("layer_load_start", layer);
		return this.app.layers[layer.type].load(layer).then((layerLoaded) => {
			this.emit(`layer_load_${ layerLoaded.error ? "error" : "stop" }`, layerLoaded);
			return layerLoaded;
		});
	}

	/**
	 * Fusionne les configurations des layers chargés avec succès
	 * @returns {Object} retourne la configuration fusionnée
	 */
	mergeConfigPrivate() {
		return _.reduce(
			this.getLayersInSuccessPrivate(),
			(memo, layer) => _.merge(memo, layer.config),
			{},
		);
	}
}

module.exports = ConfigLoader;

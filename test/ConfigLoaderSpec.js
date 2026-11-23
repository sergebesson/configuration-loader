"use strict";

const assert = require("node:assert/strict");
const {describe, test, beforeEach, afterEach} = require("node:test");
const nock = require("nock").default;

const ConfigLoader = require("../index.js").ConfigLoader;

describe("class ConfigLoader", function () {
	describe("load(layers)", function () {
		describe("Quand on récupère une configuration", function () {
			beforeEach(function () {
				nock("http://host.domain.tld")
					.get("/config")
					.reply(200, {option2: {cle2: "new value cle2"}, option4: "value4"});
				process.env.CONFIG_OPTION1 = "envValue1";
				process.env.CONFIG_OPTION2 = "envValue2";
				process.env.CONFIG_BOOL = "true";
				process.env.CONFIG_NUMBER = "10";
			});
			afterEach(function () {
				nock.cleanAll();
				delete process.env.CONFIG_OPTION1;
				delete process.env.CONFIG_OPTION2;
				delete process.env.CONFIG_BOOL;
				delete process.env.CONFIG_NUMBER;
			});
			[{
				layers: [{
					type: "object",
					desc: "configuration de type object",
					config: {option1: "value1", option2: {cle1: "value2"}},
				}],
				configExpect: {option1: "value1", option2: {cle1: "value2"}},
			}, {
				layers: [{
					type: "object",
					desc: "configuration de type object",
					config: {option1: "value1", option2: {cle1: "value2"}},
				}, {
					type: "object",
					desc: "configuration de type object",
					config: {option3: "value3", option2: {cle2: "value cle2"}},
				}],
				configExpect: {
					option1: "value1",
					option2: {cle1: "value2", cle2: "value cle2"},
					option3: "value3",
				},
			}, {
				layers: [{
					type: "object",
					desc: "configuration de type object",
					config: {option1: "value1", option2: {cle1: "value2"}},
				}, {
					type: "file",
					desc: "configuration de type file",
					file: "test/data/configurationFile.json",
				}],
				configExpect: {
					option1: "value1",
					option2: {cle1: "value2", cle2: "value cle2"},
					option3: "value3",
				},
			}, {
				layers: [{
					type: "object",
					desc: "configuration de type object",
					config: {option1: "value1", option2: {cle1: "value2"}},
				}, {
					type: "file",
					desc: "configuration de type file",
					file: "test/data/configurationFile.json",
				}, {
					type: "url",
					desc: "configuration de type url",
					url: "http://host.domain.tld/config",
				}, {
					type: "environment",
					desc: "configuration de type environment",
					mapping: {
						CONFIG_OPTION1: "option6",
						CONFIG_OPTION2: "option2.cle4",
						CONFIG_BOOL: {path: "option7", type: "boolean"},
						CONFIG_NUMBER: {path: "option8", type: "number"},
					},
				}],
				configExpect: {
					option1: "value1",
					option2: {
						cle1: "value2",
						cle2: "new value cle2",
						cle4: "envValue2",
					},
					option3: "value3",
					option4: "value4",
					option6: "envValue1",
					option7: true,
					option8: 10,
				},
			}, {
				layers: [{
					type: "object",
					desc: "configuration de type object",
					config: {
						option1: "value1",
						option2: {cle1: "value2"},
					},
				}, {
					type: "object",
					desc: "configuration de type object",
					config: {
						option1: "new value1",
						option3: "value3",
						option2: {cle2: "value cle2"},
					},
				}, {
					type: "object",
					desc: "configuration de type object",
					config: {
						option1: "value1 ok",
						option2: {cle1: "value2 ok"},
					},
				}],
				configExpect: {
					option1: "value1 ok",
					option2: {cle1: "value2 ok", cle2: "value cle2"},
					option3: "value3",
				},
			}, {
				layers: [{
					type: "object",
					desc: "configuration de type object",
					config: {
						option1: "value1",
						option2: {cle1: "value2"},
					},
				}, {
					type: "incorrect",
					desc: "Mauvais layer",
					config: {
						option1: "new value1",
						option3: "value3",
					},
				}],
				configExpect: {
					option1: "value1",
					option2: {cle1: "value2"},
				},
			}, {
				layers: [{
					type: "object",
					desc: "configuration de type object",
					config: {
						option1: "value1",
						option2: {cle1: "value2"},
					},
				}, {
					type: "object",
					desc: "Mauvais layer",
					config: "incorrect",
				}],
				configExpect: {
					option1: "value1",
					option2: {cle1: "value2"},
				},
			}].forEach(({layers, configExpect}, index) => {
				test(`Doit charger les layers [${index}]`, function () {
				// GIVEN
					const configLoader = new ConfigLoader({
						httpTimeoutInS: 0.1,
					});
					// WHEN
					return configLoader.load(layers)
						.then(() => {
						// THEN
							assert.deepEqual(configLoader.config, configExpect);
						});
				});
			});
		});
		describe("Quand tous les layers sont en erreurs", function () {
			test("Doit retourner une erreur", function () {
				// GIVEN
				const configLoader = new ConfigLoader({
					httpTimeoutInS: 1,
				});
				// WHEN / THEN
				return assert.rejects(configLoader.load([{
					type: "object",
				}, {
					type: "file",
				}, {
					type: "url",
				}]), (error) => {
					assert.ok(error instanceof Error);
					assert.equal(error.message, "Tous les layers ont échoués");
					assert.equal(error.type, "layer");
					assert.deepEqual(error.details, [
						{type: "object", error: new Error("'config' n'est pas un object")},
						{type: "file", error: new Error("'file' n'est pas valide")},
						{type: "url", error: new Error("'url' n'est pas valide")},
					]);
					return true;
				});
			});
		});
		describe("Quand on a une validation avec un jsonschema", function () {
			let configLoader;

			beforeEach(function () {
				configLoader = new ConfigLoader({
					jsonschema: {
						title: "test",
						description: "json schema de test",
						type: "object",
						properties: {
							option1: {
								type: "string",
							},
						},
					},
				});
			});
			test("Doit retourner une erreur", function () {
				// WHEN / THEN
				return assert.rejects(configLoader.load([{
					type: "object",
					config: {option1: 1},
				}]), (error) => {
					assert.ok(error instanceof Error);
					assert.equal(error.message, "La configuration ne correspond pas au json schema");
					assert.equal(error.type, "jsonschema");
					assert.deepEqual(error.details, [{
						instancePath: "/option1",
						keyword: "type",
						message: "must be string",
						params: {type: "string"},
					}]);
					return true;
				});
			});
			test("Doit valider la configuration", function () {
				// WHEN
				return configLoader.load([{
					type: "object",
					config: {option1: "1"},
				}]);
			});
		});
		describe("Quand on écoute les événements", function () {
			test("Doit appeler les événements `layer_load_start`, `layer_load_stop` et `layer_load_error`", function ({mock}) {
				const startSpy = mock.fn();
				const stopSpy = mock.fn();
				const errorSpy = mock.fn();
				const configLoader = new ConfigLoader();
				configLoader.on("layer_load_start", startSpy);
				configLoader.on("layer_load_stop", stopSpy);
				configLoader.on("layer_load_error", errorSpy);

				const layerConfigOk = {
					type: "file",
					desc: "configuration de type file",
					file: "test/data/configurationFile.json",
				};
				const layerConfigError = {type: "file"};
				return configLoader.load([layerConfigOk, layerConfigError])
					.then(() => {
						const startedLayers = startSpy.mock.calls.map((call) => call.arguments[0]);
						assert.deepEqual(startedLayers, [layerConfigOk, layerConfigError]);
						assert.equal(stopSpy.mock.callCount(), 1);
						assert.deepEqual(stopSpy.mock.calls[0].arguments[0], {
							...layerConfigOk,
							config: {option2: {cle2: "value cle2"}, option3: "value3"},
						});
						assert.equal(errorSpy.mock.callCount(), 1);
						const [failedLayer] = errorSpy.mock.calls[0].arguments;
						assert.equal(failedLayer.type, layerConfigError.type);
						assert.ok(failedLayer.error instanceof Error);
						assert.equal(failedLayer.error.message, "'file' n'est pas valide");
					});
			});
		});
	});
	describe("hasLayersInError()", function () {
		[{
			layers: [{
				type: "object",
				desc: "layer correct",
				config: {option1: "value1", option2: {cle1: "value2"}},
			}, {
				desc: "layer avec un type incorrect",
				type: "incorrect",
			}, {
				desc: "layer avec une configuration incorrecte",
				type: "object",
				config: "incorrecte",
			}],
			hasLayersInErrorExpect: true,
		}, {
			layers: [{
				type: "object",
				desc: "layer correct",
				config: {option1: "value1", option2: {cle1: "value2"}},
			}, {
				type: "object",
				desc: "layer correct 2",
				config: {option3: "value1"},
			}],
			hasLayersInErrorExpect: false,
		}].forEach(({layers, hasLayersInErrorExpect}, index) => {
			test(`Doit indiquer s'il y a eu une erreur [${index}]`, function () {
				// GIVEN
				const configLoader = new ConfigLoader();
				// WHEN
				return configLoader.load(layers)
					.then(() => {
						// THEN
						assert.equal(configLoader.hasLayersInError(), hasLayersInErrorExpect);
					});
			});
		});
	});
	describe("getLayersInError()", function () {
		[{
			layers: [{
				type: "object",
				desc: "layer correct",
				config: {option1: "value1", option2: {cle1: "value2"}},
			}, {
				desc: "layer avec un type incorrect",
				type: "incorrect",
			}, {
				desc: "layer avec une configuration incorrecte",
				type: "object",
				config: "incorrecte",
			}],
			layersInErrorExpect: [{
				desc: "layer avec un type incorrect",
				type: "incorrect",
				error: new Error("'type' incorrect"),
			}, {
				desc: "layer avec une configuration incorrecte",
				type: "object",
				config: "incorrecte",
				error: new Error("'config' n'est pas un object"),
			}],
		}, {
			layers: [{
				type: "object",
				desc: "layer correct",
				config: {option1: "value1", option2: {cle1: "value2"}},
			}, {
				type: "object",
				desc: "layer correct 2",
				config: {option3: "value1"},
			}],
			layersInErrorExpect: [],
		}].forEach(({layers, layersInErrorExpect}, index) => {
			test(`Doit retourner les layers en erreur [${index}]`, function () {
				// GIVEN
				const configLoader = new ConfigLoader();
				// WHEN
				return configLoader.load(layers)
					.then(() => {
						// THEN
						assert.deepEqual(configLoader.getLayersInError(), layersInErrorExpect);
					});
			});
		});
	});
	describe("getValue()", function () {
		[{
			path: "option1",
			expectValue: "value1",
		}, {
			path: "option2.cle1",
			expectValue: "value2",
		}, {
			path: "optionUndefined",
			expectValue: "defaultValue",
		}, {
			path: "option2",
			expectValue: {cle1: "value2"},
		}].forEach(({path, expectValue}) => {
			test(`Doit retourner la valeur d'une option de la configuration [${path}]`, function () {
				// GIVEN
				const configLoader = new ConfigLoader();
				// WHEN
				return configLoader.load([{
					type: "object",
					config: {option1: "value1", option2: {cle1: "value2"}},
				}])
					.then(() => {
						const value = configLoader.getValue(path, "defaultValue");
						// THEN
						assert.deepEqual(value, expectValue);
					});
			});
		});
	});
});

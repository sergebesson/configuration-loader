"use strict";

const _ = require("lodash");
const nock = require("nock");
const {sinon, chai: {expect}, example} = require("@sbesson/test-helpers");

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
			example([{
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
					type: "json-db",
					desc: "configuration de type json-db",
					file: "test/data/configurationJsonDb",
					id: 1,
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
						cle3: "value cle3",
						cle4: "envValue2",
					},
					option3: "value3",
					option4: "value4",
					option5: "value5",
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
			}], function () {
				it("Doit charger les layers", function () {
				// GIVEN
					const configLoader = new ConfigLoader({
						httpTimeoutInS: 0.1,
					});
					// WHEN
					return configLoader.load(this.layers)
						.then(() => {
						// THEN
							expect(configLoader.config).to.deep.equals(this.configExpect);
						});
				});
			});
		});
		describe("Quand tous les layers sont en erreurs", function () {
			it("Doit retourner une erreur", function () {
				// GIVEN
				const configLoader = new ConfigLoader({
					httpTimeoutInS: 1,
				});
				// WHEN
				return configLoader.load([{
					type: "object",
				}, {
					type: "file",
				}, {
					type: "url",
				}]).then(() => {
					throw new Error("Doit retourner une erreur");
				}, (error) => {
					// THEN
					expect(error).to.be.an("error");
					expect(error).to.lookLike({
						message: "Tous les layers ont échoués",
						type: "layer",
						details: [
							{type: "object", error: sinon.match.instanceOf(Error)
								.and(sinon.match.has("message", "'config' n'est pas un object"))},
							{type: "file", error: sinon.match.instanceOf(Error)
								.and(sinon.match.has("message", "'file' n'est pas valide"))},
							{type: "url", error: sinon.match.instanceOf(Error)
								.and(sinon.match.has("message", "'url' n'est pas valide"))},
						],
					});
				});
			});
		});
		describe("Quand on a une validation avec un jsonschema", function () {
			beforeEach(function () {
				this.configLoader = new ConfigLoader({
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
			it("Doit retourner une erreur", function () {
				// WHEN
				return this.configLoader.load([{
					type: "object",
					config: {option1: 1},
				}])
					.then(() => {
						throw new Error("Doit retourner une erreur");
					}, (error) => {
						// THEN
						expect(error).to.be.an("error");
						expect(error).to.lookLike({
							message: "La configuration ne correspond pas au json schema",
							type: "jsonschema",
							details: [
								{
									dataPath: ".option1",
									keyword: "type",
									message: "should be string",
									params: {
										type: "string",
									},
								},
							],
						});
					});
			});
			it("Doit valider la configuration", function () {
				// WHEN
				return this.configLoader.load([{
					type: "object",
					config: {option1: "1"},
				}]);
			});
		});
		describe("Quand on écoute les événements", function () {
			beforeEach(function () {
				this.eventStartSpy = sinon.spy();
				this.eventStopSpy = sinon.spy();
				this.eventErrorSpy = sinon.spy();
				this.configLoader = new ConfigLoader();
				this.configLoader.on("layer_load_start", this.eventStartSpy);
				this.configLoader.on("layer_load_stop", this.eventStopSpy);
				this.configLoader.on("layer_load_error", this.eventErrorSpy);
			});
			it("Doit appeler les événements `layer_load_start`, `layer_load_stop` et `layer_load_error`", function () {
				const layerConfigOk = {
					type: "file",
					desc: "configuration de type file",
					file: "test/data/configurationFile.json",
				};
				const layerConfigError = {type: "file"};
				return this.configLoader.load([layerConfigOk, layerConfigError])
					.then(() => {
						expect(this.eventStartSpy.calledTwice).to.equal(true);
						expect(this.eventStartSpy.args[0][0]).to.deep.equals(layerConfigOk);
						expect(this.eventStartSpy.args[1][0]).to.deep.equals(layerConfigError);
						expect(this.eventStopSpy.calledOnce).to.equal(true);
						expect(this.eventStopSpy.args[0][0]).to.deep.equals(_.assign({
							config: {option2: {cle2: "value cle2"}, option3: "value3"},
						}, layerConfigOk));
						expect(this.eventErrorSpy.calledOnce).to.equal(true);
						expect(this.eventErrorSpy.args[0][0]).to.lookLike(_.assign({
							error: sinon.match.instanceOf(Error)
								.and(sinon.match.has("message", "'file' n'est pas valide")),
						}, layerConfigError));
					});
			});
		});
	});
	describe("hasLayersInError()", function () {
		example([{
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
		}], function () {
			it("Doit indiquer s'il y a eu une erreur", function () {
				// GIVEN
				const configLoader = new ConfigLoader();
				// WHEN
				return configLoader.load(this.layers)
					.then(() => {
						// THEN
						expect(configLoader.hasLayersInError())
							.to.be.equals(this.hasLayersInErrorExpect);
					});
			});
		});
	});
	describe("getLayersInError()", function () {
		example([{
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
			LayersInErrorExpect: [{
				desc: "layer avec un type incorrect",
				type: "incorrect",
				error: sinon.match.instanceOf(Error)
					.and(sinon.match.has("message", "'type' incorrect")),
			}, {
				desc: "layer avec une configuration incorrecte",
				type: "object",
				config: "incorrecte",
				error: sinon.match.instanceOf(Error)
					.and(sinon.match.has("message", "'config' n'est pas un object")),
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
			LayersInErrorExpect: [],
		}], function () {
			it("Doit retourner les layers en erreur", function () {
				// GIVEN
				const configLoader = new ConfigLoader();
				// WHEN
				return configLoader.load(this.layers)
					.then(() => {
						// THEN
						expect(configLoader.getLayersInError())
							.to.lookLike(this.LayersInErrorExpect);
					});
			});
		});
	});
	describe("getValue()", function () {
		example([{
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
		}], function () {
			it("Doit retourner la valeur d'une option de la configuration", function () {
				// GIVEN
				const configLoader = new ConfigLoader();
				// WHEN
				return configLoader.load([{
					type: "object",
					config: {option1: "value1", option2: {cle1: "value2"}},
				}])
					.then(() => {
						const value = configLoader.getValue(this.path, "defaultValue");
						// THEN
						expect(value).to.deep.equal(this.expectValue);
					});
			});
		});
	});
});

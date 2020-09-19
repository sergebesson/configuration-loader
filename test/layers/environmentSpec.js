"use strict";

const {chai: {expect}, example} = require("@sbesson/test-helpers");

const layerEnvironment = require("../../layers/environment.js")();

describe("layer environment", function () {
	describe("load()", function () {
		beforeEach(function () {
			process.env.CONFIG_OPTION1 = "value1";
			process.env.CONFIG_OPTION2 = "value2";
			delete process.env.CONFIG_UNDEFINED;
		});
		afterEach(function () {
			delete process.env.CONFIG_OPTION1;
			delete process.env.CONFIG_OPTION2;
		});
		it("Doit retourner la configuration", function () {
			// WHEN
			return layerEnvironment.load({
				type: "environment",
				desc: "configuration de type environment",
				mapping: {
					CONFIG_OPTION1: "option1",
					CONFIG_OPTION2: {path: "option2.cle2", type: "string"},
					CONFIG_UNDEFINED: "undefined",
					CONFIG_PATH_UNKNOWN: {type: "string"},
				},
			}).then((layer) => {
				// THEN
				expect(layer.config).to.deep.equals({
					option1: "value1",
					option2: {cle2: "value2"},
				});
				expect(layer.error).to.be.undefined;
			});
		});
		describe("quand option est un boolean", function () {
			example([{
				envValue: "true",
				expectValue: true,
			}, {
				envValue: "false",
				expectValue: false,
			}, {
				envValue: "on",
				expectValue: true,
			}, {
				envValue: "off",
				expectValue: false,
			}, {
				envValue: "1",
				expectValue: true,
			}, {
				envValue: "0",
				expectValue: false,
			}, {
				envValue: "other",
				expectValue: false,
			}], function () {
				beforeEach(function () {
					process.env.CONFIG_BOOL = this.envValue;
				});
				afterEach(function () {
					delete process.env.CONFIG_BOOL;
				});
				it("Doit positionner un boolean dans les options", function () {
					// WHEN
					return layerEnvironment.load({
						type: "environment",
						desc: "configuration de type environment",
						mapping: {
							CONFIG_BOOL: {path: "option1", type: "boolean"},
						},
					}).then((layer) => {
						// THEN
						expect(layer.config).to.deep.equals({
							option1: this.expectValue,
						});
						expect(layer.error).to.be.undefined;
					});
				});
			});
		});
		describe("quand option est un number", function () {
			describe("quand option est un number valide", function () {
				example([{
					envValue: "",
					expectValue: 0,
				}, {
					envValue: "10",
					expectValue: 10,
				}, {
					envValue: "+10",
					expectValue: 10,
				}, {
					envValue: "-10",
					expectValue: -10,
				}, {
					envValue: "10.8",
					expectValue: 10.8,
				}, {
					envValue: "+10.8",
					expectValue: 10.8,
				}, {
					envValue: "-10.8",
					expectValue: -10.8,
				}], function () {
					beforeEach(function () {
						process.env.CONFIG_NUMBER = this.envValue;
					});
					afterEach(function () {
						delete process.env.CONFIG_NUMBER;
					});
					it("Doit positionner un number dans les options", function () {
						// WHEN
						return layerEnvironment.load({
							type: "environment",
							desc: "configuration de type environment",
							mapping: {
								option1: "value1",
								CONFIG_NUMBER: {path: "option1", type: "number"},
							},
						}).then((layer) => {
							// THEN
							expect(layer.config).to.deep.equals({
								option1: this.expectValue,
							});
							expect(layer.error).to.be.undefined;
						});
					});
				});
			});
			describe("quand option est un number invalide", function () {
				example([{
					envValue: "not number",
				}, {
					envValue: "10other",
				}, {
					envValue: "++10",
				}, {
					envValue: "--10",
				}, {
					envValue: "10.8other",
				}, {
					envValue: "++10.8",
				}, {
					envValue: "--10.8",
				}, {
					envValue: "other10",
				}], function () {
					beforeEach(function () {
						process.env.CONFIG_NUMBER = this.envValue;
					});
					afterEach(function () {
						delete process.env.CONFIG_NUMBER;
					});
					it("Doit positionner un number dans les options", function () {
						// WHEN
						return layerEnvironment.load({
							type: "environment",
							desc: "configuration de type environment",
							mapping: {
								option1: "value1",
								CONFIG_NUMBER: {path: "option1", type: "number"},
							},
						}).then((layer) => {
							// THEN
							expect(layer.config).to.be.undefined;
							expect(layer.error).to.be.an("error");
							expect(layer.error.message)
								.to.equal(`La variable d'environnement 'CONFIG_NUMBER' n'est pas un nombre (${ this.envValue })`);
						});
					});
				});
			});
		});
		example([{
			mapping: "string",
		}, {
			mapping: true,
		}, {
			mapping: null,
		}, {
			mapping: undefined,
		}, {
			mapping: ["value1", "value2"],
		}], function () {
			it("Doit retourner une erreur", function () {
				// WHEN
				return layerEnvironment.load({mapping: this.mapping})
					.then((layer) => {
						// THEN
						expect(layer.error).to.be.an("error");
						expect(layer.error.message).to.be.equals(
							"'mapping' n'est pas un object",
						);
					});
			});
		});
	});
});

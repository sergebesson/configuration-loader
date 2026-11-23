"use strict";

const assert = require("node:assert/strict");
const {describe, test, beforeEach, afterEach} = require("node:test");

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
		test("Doit retourner la configuration", function () {
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
				assert.deepEqual(layer.config, {
					option1: "value1",
					option2: {cle2: "value2"},
				});
				assert.equal(layer.error, undefined);
			});
		});
		describe("quand option est un boolean", function () {
			afterEach(function () {
				delete process.env.CONFIG_BOOL;
			});
			[{
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
			}].forEach(({envValue, expectValue}) => {
				test(`Doit positionner un boolean dans les options [${envValue}]`, function () {
					process.env.CONFIG_BOOL = envValue;
					// WHEN
					return layerEnvironment.load({
						type: "environment",
						desc: "configuration de type environment",
						mapping: {
							CONFIG_BOOL: {path: "option1", type: "boolean"},
						},
					}).then((layer) => {
						// THEN
						assert.deepEqual(layer.config, {option1: expectValue});
						assert.equal(layer.error, undefined);
					});
				});
			});
		});
		describe("quand option est un number", function () {
			afterEach(function () {
				delete process.env.CONFIG_NUMBER;
			});

			describe("quand option est un number valide", function () {
				[{
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
				}].forEach(({envValue, expectValue}) => {
					test(`Doit positionner un number dans les options [${JSON.stringify(envValue)}]`, function () {
						process.env.CONFIG_NUMBER = envValue;
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
							assert.deepEqual(layer.config, {option1: expectValue});
							assert.equal(layer.error, undefined);
						});
					});
				});
			});
			describe("quand option est un number invalide", function () {
				[
					"not number", "10other", "++10", "--10", "10.8other", "++10.8", "--10.8", "other10",
				].forEach((envValue) => {
					test(`Doit positionner un number dans les options [${envValue}]`, function () {
						process.env.CONFIG_NUMBER = envValue;
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
							assert.equal(layer.config, undefined);
							assert.ok(layer.error instanceof Error);
							assert.equal(layer.error.message,
								`La variable d'environnement 'CONFIG_NUMBER' n'est pas un nombre (${ envValue })`);
						});
					});
				});
			});
		});
		["string", true, null, undefined, ["value1", "value2"]].forEach((mapping) => {
			test(`Doit retourner une erreur [${JSON.stringify(mapping)}]`, function () {
				// WHEN
				return layerEnvironment.load({mapping})
					.then((layer) => {
						// THEN
						assert.ok(layer.error instanceof Error);
						assert.equal(layer.error.message, "'mapping' n'est pas un object");
					});
			});
		});
	});
});

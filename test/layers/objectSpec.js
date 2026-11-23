"use strict";

const assert = require("node:assert/strict");
const {describe, test} = require("node:test");

const layerObject = require("../../layers/object.js")();

describe("layer object", function () {
	describe("load()", function () {
		test("Doit retourner la configuration", function () {
			// WHEN
			return layerObject.load({
				type: "object",
				desc: "configuration de type object",
				config: {option1: "value1", option2: {cle1: "value2"}},
			}).then((layer) => {
				// THEN
				assert.deepEqual(layer.config, {option1: "value1", option2: {cle1: "value2"}});
				assert.equal(layer.error, undefined);
			});
		});
		["string", true, null, undefined, ["value1", "value2"]].forEach((config) => {
			test(`Doit retourner une erreur [${JSON.stringify(config)}]`, function () {
				// WHEN
				return layerObject.load({config})
					.then((layer) => {
						// THEN
						assert.ok(layer.error instanceof Error);
						assert.equal(layer.error.message, "'config' n'est pas un object");
					});
			});
		});
	});
});

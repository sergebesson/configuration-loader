"use strict";

const {chai: {expect}, example} = require("@sbesson/test-helpers");

const layerObject = require("../../layers/object.js")();

describe("layer object", function () {
	describe("load()", function () {
		it("Doit retourner la configuration", function () {
			// WHEN
			return layerObject.load({
				type: "object",
				desc: "configuration de type object",
				config: {option1: "value1", option2: {cle1: "value2"}},
			}).then((layer) => {
				// THEN
				expect(layer.config).to.deep.equals({option1: "value1", option2: {cle1: "value2"}});
				expect(layer.error).to.be.undefined;
			});
		});
		example([{
			config: "string",
		}, {
			config: true,
		}, {
			config: null,
		}, {
			config: undefined,
		}, {
			config: ["value1", "value2"],
		}], function () {
			it("Doit retourner une erreur", function () {
				// WHEN
				return layerObject.load({config: this.config})
					.then((layer) => {
						// THEN
						expect(layer.error).to.be.an("error");
						expect(layer.error.message).to.be.equals(
							"'config' n'est pas un object",
						);
					});
			});
		});
	});
});

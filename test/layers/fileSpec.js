"use strict";

const assert = require("node:assert/strict");
const {describe, test} = require("node:test");
const {resolve} = require("node:path");

const layerFile = require("../../layers/file.js")();

describe("layer file", function () {
	describe("load()", function () {
		[
			"./test/data/configurationFile.json",
			resolve(__dirname, "../data/configurationFile.yaml"),
			"test/data/configurationFile.js",
		].forEach((file) => {
			test(`Doit retourner la configuration [${file}]`, function () {
				// WHEN
				return layerFile.load({
					type: "file",
					desc: "configuration de type file",
					file,
				}).then((layer) => {
					// THEN
					assert.deepEqual(layer.config, {
						option3: "value3",
						option2: {cle2: "value cle2"},
					});
					assert.equal(layer.error, undefined);
				});
			});
		});
		[{
			file: {},
			errorExpect: {message: "'file' n'est pas valide"},
		}, {
			file: true,
			errorExpect: {message: "'file' n'est pas valide"},
		}, {
			file: null,
			errorExpect: {message: "'file' n'est pas valide"},
		}, {
			file: undefined,
			errorExpect: {message: "'file' n'est pas valide"},
		}, {
			file: "file_not_found.json",
			errorExpect: {
				message: "Impossible de lire file_not_found.json",
				cause: /Cannot find module '\.\.\/file_not_found\.json'/,
			},
		}, {
			file: "./test/data/configurationFileInvalid.json",
			errorExpect: {
				message: "Impossible de lire ./test/data/configurationFileInvalid.json",
				cause: /in JSON at position/,
			},
		}].forEach(({file, errorExpect}) => {
			test(`Doit retourner une erreur [${JSON.stringify(file)}]`, function () {
				// WHEN
				return layerFile.load({file})
					.then((layer) => {
						// THEN
						assert.ok(layer.error instanceof Error);
						assert.equal(layer.error.message, errorExpect.message);
						if (errorExpect.cause) {
							assert.match(layer.error.cause, errorExpect.cause);
						}
					});
			});
		});
	});
});

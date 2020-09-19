"use strict";

const fs = require("fs");

const {sinon, chai: {expect}, example} = require("@sbesson/test-helpers");

const layerFile = require("../../layers/file.js")();

describe("layer file", function () {
	describe("load()", function () {
		beforeEach(function (done) {
			fs.createReadStream("test/data/configurationFile.yaml")
				.on("error", done)
				.on("end", done)
				.pipe(fs.createWriteStream("/tmp/configurationFile.yaml"));
		});
		afterEach(function (done) {
			fs.unlink("/tmp/configurationFile.yaml", done);
		});
		example([{
			file: "./test/data/configurationFile.json",
		}, {
			file: "/tmp/configurationFile.yaml",
		}, {
			file: "test/data/configurationFile.js",
		}], function () {
			it("Doit retourner la configuration", function () {
				// WHEN
				return layerFile.load({
					type: "file",
					desc: "configuration de type file",
					file: this.file,
				}).then((layer) => {
					// THEN
					expect(layer.config).to.deep.equals({
						option3: "value3",
						option2: {cle2: "value cle2"},
					});
					expect(layer.error).to.be.undefined;
				});
			});
		});
		example([{
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
				cause: "Cannot find module '../file_not_found.json'",
			},
		}, {
			file: "./test/data/configurationFileInvalid.json",
			errorExpect: {
				message: "Impossible de lire ./test/data/configurationFileInvalid.json",
				cause: sinon.match(/Unexpected token }/),
			},
		}], function () {
			it("Doit retourner une erreur", function () {
				// WHEN
				return layerFile.load({file: this.file})
					.then((layer) => {
						// THEN
						expect(layer.error).to.be.an("error");
						expect(layer.error).to.lookLike(this.errorExpect);
					});
			});
		});
	});
});

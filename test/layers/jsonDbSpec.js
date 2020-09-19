"use strict";

const _ = require("lodash");
const {sinon, chai: {expect}, example} = require("@sbesson/test-helpers");
const layerJsonDbFactory = require("../../layers/json-db.js");

describe("layer json-db", function () {
	describe("load()", function () {
		beforeEach(function () {
			this.JsonDbStub = sinon.spy();
			this.getByIdStub = sinon.stub();
			this.getStructureStub = sinon.stub()
				.returns(Promise.resolve({idName: "myId"}));
			this.JsonDbStub.prototype.getStructure = this.getStructureStub;
			this.JsonDbStub.prototype.getById = this.getByIdStub;
		});
		describe("Quand la configuration doit être récupérée", function () {
			example([{
				file: "/path/jsonDb",
				id: "jsonDbId",
				config: {option1: "value1", option2: {cle1: "value2"}},
			}, {
				file: "/path/jsonDb2",
				id: "jsonDbId2",
				config: {option2: "value2", option3: {cle4: "value3"}},
			}, {
				file: "/path/jsonDb2",
				id: 2,
				config: {option2: "value2", option3: {cle4: "value3"}},
			}], function () {
				it("Doit retourner la configuration", function () {
					// GIVEN
					this.getByIdStub.returns(
						Promise.resolve(_.assign({myId: this.id}, this.config)),
					);
					// WHEN
					const layerJsonDb = layerJsonDbFactory({
						services: {JsonDb: this.JsonDbStub},
					});
					return layerJsonDb.load({
						type: "json-db",
						desc: "configuration de type json-db",
						file: this.file,
						id: this.id,
					}).then((layer) => {
						// THEN
						expect(this.JsonDbStub.calledWithNew())
							.to.be.equals(true);
						expect(this.JsonDbStub.calledWith(
							this.file,
						)).to.be.equals(true);
						expect(this.getByIdStub.calledWith(this.id))
							.to.be.equals(true);
						expect(layer.config).to.deep.equals(this.config);
						expect(layer.error).to.be.undefined;
					});
				});
			});
		});

		describe("Quand le layer fini en erreur", function () {
			example([{
				error: "'file' n'est pas valide",
			}, {
				file: null,
				error: "'file' n'est pas valide",
			}, {
				file: 1,
				error: "'file' n'est pas valide",
			}, {
				file: true,
				error: "'file' n'est pas valide",
			}, {
				file: ["value"],
				error: "'file' n'est pas valide",
			}, {
				file: {},
				error: "'file' n'est pas valide",
			}, {
				file: "MonFichier",
				id: null,
				error: "'id' n'est pas valide",
			}, {
				file: "MonFichier",
				error: "'id' n'est pas valide",
			}, {
				file: "MonFichier",
				id: true,
				error: "'id' n'est pas valide",
			}, {
				file: ["value"],
				error: "'file' n'est pas valide",
			}, {
				file: "MonFichier",
				id: {},
				error: "'id' n'est pas valide",
			}], function () {
				it("Doit retourner l'erreur 'file' ou 'id' n'est pas valide", function () {
					// WHEN
					const layerJsonDb = layerJsonDbFactory({});
					return layerJsonDb.load({
						type: "json-db",
						file: this.file,
					}).then((layer) => {
						// THEN
						expect(layer.error).to.be.an("error");
						expect(layer.error.message).to.be.equals(this.error);
					});
				});
			});
			it("Doit retourner une erreur json-db getById retourne une erreur", function () {
				// GIVEN
				this.getByIdStub.returns(
					Promise.reject(new Error("Erreur json-db::getById")),
				);
				// WHEN
				const layerJsonDb = layerJsonDbFactory({
					services: {JsonDb: this.JsonDbStub},
				});
				return layerJsonDb.load({
					type: "json-db",
					desc: "configuration de type json-db",
					file: "/path/jsonDb",
					id: "jsonDbId",
				}).then((layer) => {
					// THEN
					expect(layer.error).to.be.an("error");
					expect(layer.error.message).to.deep.equals("Erreur json-db::getById");
				});
			});
			it("Doit retourner une erreur json-db getStructure retourne une erreur", function () {
				// GIVEN
				this.getStructureStub.returns(
					Promise.reject(new Error("Erreur json-db::getStructure")),
				);
				this.getByIdStub.returns(
					Promise.resolve(_.assign({myId: "id"})),
				);
				// WHEN
				const layerJsonDb = layerJsonDbFactory({
					services: {JsonDb: this.JsonDbStub},
				});
				return layerJsonDb.load({
					type: "json-db",
					desc: "configuration de type json-db",
					file: "/path/jsonDb",
					id: "jsonDbId",
				}).then((layer) => {
					// THEN
					expect(layer.error).to.be.an("error");
					expect(layer.error.message).to.deep.equals("Erreur json-db::getStructure");
				});
			});
			it("Doit retourner une erreur si l'id n'existe pas", function () {
				// GIVEN
				this.getByIdStub.returns(
					Promise.resolve(undefined),
				);
				// WHEN
				const layerJsonDb = layerJsonDbFactory({
					services: {JsonDb: this.JsonDbStub},
				});
				return layerJsonDb.load({
					type: "json-db",
					desc: "configuration de type json-db",
					file: "/path/jsonDb",
					id: "jsonDbId",
				}).then((layer) => {
					// THEN
					expect(layer.error).to.be.an("error");
					expect(layer.error.message).to.deep.equals(
						"json-db: l'id 'jsonDbId' est inconnu",
					);
				});
			});
		});
	});
});

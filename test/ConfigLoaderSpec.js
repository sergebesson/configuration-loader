import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {randomUUID} from "node:crypto";
import {cp as copy, mkdtemp, rm as remove, symlink, writeFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {describe, test, beforeEach, afterEach} from "node:test";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";
import nock from "nock";
import {ConfigLoader} from "@sbesson/configuration-loader";

describe("class ConfigLoader", function () {
	test("Expose le même constructeur à la racine en ESM et en CommonJS", function () {
		const require = createRequire(import.meta.url);
		assert.equal(require("@sbesson/configuration-loader").ConfigLoader, ConfigLoader);
		assert.throws(() => require("@sbesson/configuration-loader/ConfigLoader.js"), {
			code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
		});
	});

	test("Charge un layer YAML sans enregistrer d’extensions CommonJS", async function () {
		await promisify(execFile)(process.execPath, ["-e", `
			const assert = require("node:assert/strict");
			const extensions = {...require.extensions};
			assert.equal(extensions[".yaml"], undefined);
			assert.equal(extensions[".yml"], undefined);
			const {ConfigLoader} = require(process.argv[1]);
			const loader = new ConfigLoader();
			assert.deepEqual({...require.extensions}, extensions);
			process.exitCode = 1;
			loader.load([{type: "file", file: "test/data/configurationFile.yaml"}]).then(() => {
				assert.equal(loader.getValue("option2.cle2"), "value cle2");
				assert.deepEqual({...require.extensions}, extensions);
				process.exitCode = 0;
			});
		`, fileURLToPath(import.meta.resolve("@sbesson/configuration-loader"))], {cwd: tmpdir()});
	});

	for (const [operation, changeFile] of Object.entries({
		modification: (file) => writeFile(file, "value: après"),
		suppression: remove,
	})) {
		test(`Partage le cache YAML entre chargeurs après ${operation}`, async function (context) {
			const directory = await mkdtemp(resolve(tmpdir(), "configuration-loader-"));
			context.after(() => remove(directory, {recursive: true, force: true}));
			const file = resolve(directory, "settings");
			const yamlFile = `${file}.yaml`;
			await writeFile(yamlFile, "value: avant");

			const first = new ConfigLoader();
			await first.load([{type: "file", file}]);
			assert.equal(first.getValue("value"), "avant");

			await changeFile(yamlFile);
			const second = new ConfigLoader();
			await second.load([{type: "file", file}]);
			assert.equal(second.getValue("value"), "avant");
		});
	}

	test("Découvre un nouveau layer par son nom de fichier", async function (context) {
		const directory = await mkdtemp(resolve(tmpdir(), "configuration-loader-"));
		context.after(() => remove(directory, {recursive: true, force: true}));
		const root = fileURLToPath(new URL("..", import.meta.url));
		const entries = ["package.json", "index.js", "ConfigLoader.js", "layers", "models", "yaml-cache.js"];
		await Promise.all(entries.map((entry) =>
			copy(resolve(root, entry), resolve(directory, entry), {recursive: true})));
		await symlink(resolve(root, "node_modules"), resolve(directory, "node_modules"), "junction");

		const requireFromCopy = createRequire(resolve(directory, "package.json"));
		const {ConfigLoader: TemporaryConfigLoader} = requireFromCopy("@sbesson/configuration-loader");
		const before = new TemporaryConfigLoader();
		const type = `discovery-${randomUUID()}`;
		await writeFile(resolve(directory, "layers", `${type}.js`), `
			let factories = 0;
			export default ({options}) => {
				const instance = ++factories;
				return {
					async load(layer) {
					if ("failure" in layer) {
							throw layer.failure;
						}
						return {...layer, config: {discovery: {value: options.discoveryValue, instance}}};
					},
				};
			};
		`);

		const first = new TemporaryConfigLoader({discoveryValue: "première instance"});
		const second = new TemporaryConfigLoader({discoveryValue: "seconde instance"});
		await assert.rejects(before.load([{type}]), {type: "layer"});
		await first.load([{type}]);
		await second.load([{type}]);
		assert.deepEqual(first.getValue("discovery"), {value: "première instance", instance: 1});
		assert.deepEqual(second.getValue("discovery"), {value: "seconde instance", instance: 2});

		const rejected = new Error("rejet du layer découvert");
		await first.load([
			{type, failure: rejected}, {type, failure: null},
			{type: "object", config: {discovery: {value: "repli"}}},
		]);
		assert.equal(first.getValue("discovery.value"), "repli");
		const failures = first.getLayersInError();
		assert.deepEqual(failures.map((layer) => layer.type), [type, type]);
		assert.equal(failures[0].error, rejected);
		assert.ok(failures[1].error instanceof Error);
	});

	test("Expose une copie profonde de la configuration sans permettre son remplacement", async function () {
		const loader = new ConfigLoader();
		await loader.load([{type: "object", config: {server: {ports: [8080, 8443]}}}]);

		const snapshot = loader.config;
		snapshot.server.ports.splice(0, 1, 9090);
		assert.deepEqual(loader.config, {server: {ports: [8080, 8443]}});
		assert.deepEqual(loader.getValue("server.ports"), [8080, 8443]);
		assert.throws(() => {
			loader.config = {};
		}, TypeError);
	});

	describe("load(layers)", function () {
		test("Conserve la configuration après un échec total, puis la remplace au succès", async function () {
			const loader = new ConfigLoader();
			assert.deepEqual(loader.config, {});
			await loader.load([{type: "object", config: {source: "initiale", ancienne: true}}]);

			await assert.rejects(loader.load([{type: "file"}]), {type: "layer"});
			assert.deepEqual(loader.config, {source: "initiale", ancienne: true});
			assert.equal(loader.getValue("source"), "initiale");
			assert.equal(loader.hasLayersInError(), true);
			assert.deepEqual(loader.getLayersInError().map(({type}) => type), ["file"]);

			await loader.load([{type: "object", config: {source: "nouvelle"}}]);
			assert.deepEqual(loader.config, {source: "nouvelle"});
			assert.equal(loader.getValue("source"), "nouvelle");
			assert.equal(loader.hasLayersInError(), false);
			assert.deepEqual(loader.getLayersInError(), []);
		});

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

			for (const [scenario, layer] of [
				["un descripteur null", null],
				["une entrée environment null", {type: "environment", mapping: {CONFIG_OPTION1: null}}],
				["une entrée environment sans path", {
					type: "environment", mapping: {CONFIG_OPTION1: {type: "number"}},
				}],
			]) {
				test(`Doit conserver le repli après ${scenario}`, async function () {
					const loader = new ConfigLoader();
					const errors = [];
					loader.on("layer_load_error", (failed) => errors.push(failed));
					await loader.load([layer, {type: "object", config: {source: "repli"}}]);
					assert.equal(loader.getValue("source"), "repli");
					const failures = loader.getLayersInError();
					assert.equal(failures.length, 1);
					const [{error, ...descriptor}] = failures;
					assert.ok(error instanceof Error);
					assert.deepEqual(descriptor, layer ?? {});
					assert.deepEqual(errors, layer ? failures : []);
				});
			}
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

			test("Doit conserver la dernière configuration valide après un rechargement rejeté", async function () {
				await configLoader.load([{type: "object", config: {option1: "valide"}}]);
				assert.equal(configLoader.getValue("option1"), "valide");

				await assert.rejects(configLoader.load([{
					type: "object",
					config: {option1: 42},
				}]), {type: "jsonschema"});
				assert.deepEqual(configLoader.config, {option1: "valide"});
				assert.equal(configLoader.getValue("option1"), "valide");
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

			for (const [event, layer] of [
				["layer_load_start", {type: "object", config: {}}],
				["layer_load_stop", {type: "object", config: {}}],
				["layer_load_error", {type: "object"}],
				["layer_url_attempt_error", {type: "url", url: "http://host.domain.tld/config"}],
			]) {
				test(`Doit propager l'exception d'un auditeur de ${event}`, async function (context) {
					if (layer.type === "url") {
						nock("http://host.domain.tld").get("/config").reply(503);
						context.after(() => nock.cleanAll());
					}
					const loader = new ConfigLoader({httpTimeoutInS: 1});
					const failure = new Error("exception de l'auditeur");
					loader.once(event, () => {
						throw failure;
					});
					const load = () => loader.load([layer, {type: "object", config: {source: "repli"}}]);
					const isListenerFailure = (error) => error === failure;
					if (event === "layer_load_start") {
						assert.throws(load, isListenerFailure);
					} else {
						await assert.rejects(load, isListenerFailure);
					}
				});
			}
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

import assert from "node:assert/strict";
import {mkdir, mkdtemp, rm as remove, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {describe, test} from "node:test";
import {fileURLToPath} from "node:url";
import createFileLayer from "../../layers/file.js";

const layerFile = createFileLayer();

async function temporaryDirectory(context) {
	const directory = await mkdtemp(resolve(tmpdir(), "configuration-loader-"));
	context.after(() => remove(directory, {recursive: true, force: true}));
	return directory;
}

describe("layer file", function () {
	describe("load()", function () {
		[
			"./test/data/configurationFile.json",
			"./test/data/configurationFile.yaml",
			fileURLToPath(new URL("../data/configurationFile.yaml", import.meta.url)),
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

		test("Résout les extensions natives avant .yml, puis .yaml et enfin le dossier", async(context) => {
			const directory = await temporaryDirectory(context);
			const yamlOnly = resolve(directory, "yaml-only");
			const both = resolve(directory, "both");
			const nativeFirst = resolve(directory, "native-first");
			await mkdir(both);
			await Promise.all([
				writeFile(`${yamlOnly}.yaml`, "value: yaml seule"),
				writeFile(`${both}.yml`, "value: yml"),
				writeFile(`${both}.yaml`, "value: yaml"),
				writeFile(resolve(both, "index.yaml"), "value: index"),
				writeFile(`${nativeFirst}.json`, "{\"value\":\"json\"}"),
				writeFile(`${nativeFirst}.yml`, "value: yml"),
			]);
			assert.deepEqual((await layerFile.load({file: yamlOnly})).config, {value: "yaml seule"});
			assert.deepEqual((await layerFile.load({file: both})).config, {value: "yml"});
			assert.deepEqual((await layerFile.load({file: `${both}/`})).config, {value: "index"});
			assert.deepEqual((await layerFile.load({file: nativeFirst})).config, {value: "json"});
		});

		test("Résout un point d’entrée YAML déclaré dans package.json", async(context) => {
			const directory = await temporaryDirectory(context);
			await Promise.all([
				writeFile(resolve(directory, "package.json"), "{\"main\":\"settings\"}"),
				writeFile(resolve(directory, "settings.yml"), "value: entrée"),
				writeFile(resolve(directory, "index.js"), "module.exports = {value: \"index\"};"),
			]);
			assert.deepEqual((await layerFile.load({file: directory})).config, {value: "entrée"});
		});

		test("Partage le cache YAML entre instances et liens résolus vers la même cible", async(context) => {
			const directory = await temporaryDirectory(context);
			const file = resolve(directory, "settings.yaml");
			const alias = resolve(directory, "alias");
			await writeFile(file, "value: avant");
			await symlink(file, alias);
			const {config} = await layerFile.load({file});
			assert.deepEqual(config, {value: "avant"});

			await writeFile(file, "value: après");
			const secondLayer = createFileLayer();
			assert.equal((await secondLayer.load({file: alias})).config, config);
			await remove(file);
			assert.equal((await secondLayer.load({file})).config, config);
		});

		test("Choisit le format d’après la cible réelle, pas l’extension du lien", async(context) => {
			const directory = await temporaryDirectory(context);
			const alias = resolve(directory, "alias");
			await writeFile(resolve(directory, "settings.js"), "module.exports = {value: 42};");
			await symlink("settings.js", `${alias}.yml`);
			assert.deepEqual((await layerFile.load({file: alias})).config, {value: 42});
		});

		test("Retourne une cause YAML lisible et relit le .yml après correction", async(context) => {
			const directory = await temporaryDirectory(context);
			const file = resolve(directory, "invalid.yml");
			await writeFile(file, "value: [");
			const {error} = await layerFile.load({file});
			assert.ok(error instanceof Error);
			assert.equal(error.message, `Impossible de lire ${file}`);
			assert.match(error.cause, /flow collection/);

			await writeFile(file, "value: valide");
			assert.deepEqual((await layerFile.load({file})).config, {value: "valide"});
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

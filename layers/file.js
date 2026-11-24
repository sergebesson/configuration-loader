// @ts-check

import {readFileSync, statSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";
import _ from "lodash";
import yaml from "js-yaml";
import * as layerModel from "../models/layer.js";
import {resolvedPaths, yamlCache} from "../yaml-cache.js";

/** @import {LayerDescriptor, LayerResult} from "../models/layer.js" */

const requireConfig = createRequire(import.meta.url);
const layerDirectory = fileURLToPath(new URL(".", import.meta.url));
const yamlExtensions = [".yml", ".yaml"];
const extensions = [".js", ".json", ".node", ...yamlExtensions];

export default function () {
	return {
		load,
	};
}

/**
 * Charge un layer de type file
 * @param {LayerDescriptor} layer
 * @returns {Promise<LayerResult>}
 */
function load(layer) {
	const {file} = layer;
	const messageError = isLayerValid(layer);
	if (_.isString(messageError)) {
		return Promise.resolve(layerModel.setLayerInError(layer, {message: messageError}));
	}

	try {
		const pathname = /** @type {string} */ (file);
		const config = loadConfig(pathname.startsWith("/") ? pathname : path.join("../", pathname));
		return Promise.resolve(layerModel.setConfigInLayer(layer, config));
	} catch (errorRequire) {
		return Promise.resolve(layerModel.setLayerInError(layer,
			{
				message: `Impossible de lire ${file}`,
				cause: /** @type {{message?: unknown}} */ (errorRequire).message,
			}));
	}
}

/**
 * @param {string} request
 * @returns {unknown} le contenu du fichier, éventuellement issu du cache
 */
function loadConfig(request) {
	let filename = resolvedPaths.get(request);
	if (filename === undefined) {
		// Node résout les liens symboliques, sauf avec --preserve-symlinks.
		filename = requireConfig.resolve(findConfigFile(request) ?? request);
		resolvedPaths.set(request, filename);
	}
	if (!yamlExtensions.includes(path.extname(filename))) {
		return requireConfig(filename);
	}
	if (!yamlCache.has(filename)) {
		yamlCache.set(filename, yaml.load(readFileSync(filename, "utf8")));
	}
	return yamlCache.get(filename);
}

/**
 * Reproduit l'ordre CommonJS sans enregistrer d'extensions YAML.
 * @param {string} request
 */
function findConfigFile(request) {
	const filename = path.resolve(layerDirectory, request);
	if (!/\/(?:\.{1,2})?$/.test(request)) {
		const candidate = findFile(filename, ["", ...extensions]);
		if (candidate) {
			return candidate;
		}
	}

	if (!statSync(filename, {throwIfNoEntry: false})?.isDirectory()) {
		return;
	}

	const manifest = findFile(path.join(filename, "package.json"), [""]);
	if (manifest) {
		/** @type {{main?: unknown}} */
		const {main} = JSON.parse(readFileSync(manifest, "utf8").replace(/^\uFEFF/, ""));
		if (main) {
			const entry = path.resolve(filename, /** @type {string} */ (main));
			const candidate = findFile(entry, ["", ...extensions]) ??
				findFile(path.join(entry, "index"), extensions);
			if (candidate) {
				return candidate;
			}
		}
	}
	return findFile(path.join(filename, "index"), extensions);
}

/**
 * @param {string} filename
 * @param {string[]} suffixes
 */
function findFile(filename, suffixes) {
	for (const suffix of suffixes) {
		const candidate = filename + suffix;
		if (statSync(candidate, {throwIfNoEntry: false})?.isFile()) {
			return candidate;
		}
	}
}

/**
 * @param {LayerDescriptor} layer
 * @returns {string | undefined} le message si le fichier est invalide
 */
function isLayerValid({file}) {
	if (!_.isString(file) || _.isEmpty(file)) {
		return "'file' n'est pas valide";
	}
}

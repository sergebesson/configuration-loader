import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {EventEmitter, once} from "node:events";
import {createServer} from "node:http";
import {describe, test, beforeEach, afterEach} from "node:test";
import {setTimeout as wait} from "node:timers/promises";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import nock from "nock";
import {ConfigLoader} from "@sbesson/configuration-loader";
import layerUrlFactory from "../../layers/url.js";

describe("layer url", function () {
	const httpTimeoutInS = 200;
	let configLoader;
	let eventSpy;
	let expire;
	let layerUrl;

	beforeEach(function ({mock}) {
		expire = undefined;
		const timeService = function (callback, delay, signal) {
			if (delay === httpTimeoutInS * 1000) {
				// Les tests déclenchent le délai global après les tentatives attendues.
				return new Promise((resolve) => {
					expire = () => resolve(callback());
				});
			}
			return wait(delay / 1000, undefined, {signal}).then(callback);
		};

		eventSpy = mock.fn();
		configLoader = new EventEmitter();
		configLoader.on("layer_url_attempt_error", eventSpy);

		layerUrl = layerUrlFactory({
			options: {
				httpTimeoutRequestInS: 0.100, // => 100ms
				httpTimeoutInS,
				httpRetryDelayInS: 80, // => 80ms avec le timeService
			},
			services: {
				timeService,
			},
			configLoader,
		});
	});
	describe("load()", function () {
		beforeEach(function () {
			nock("http://host.domain.tld")
				.get("/config")
				.reply(200, {option1: "value1", option2: {cle1: "value2"}});
			nock("http://host.domain.tld")
				.get("/config_retry3")
				.reply(500, "1ere erreur")
				.get("/config_retry3")
				.reply(503, "2eme erreur")
				.get("/config_retry3")
				.reply(200, {option1: "value1", option2: {cle1: "value2"}});
			nock("http://host.domain.tld")
				.get("/config_retry4delay10")
				.delay(50)
				.times(10)
				.reply(500)
				.get("/config_retry4delay10")
				.reply(200, {option1: "value1", option2: {cle1: "value2"}});
			nock("http://host.domain.tld")
				.get("/config_timeout")
				.times(3)
				.reply(200, () => wait(500, {option1: "value1", option2: {cle1: "value2"}}))
				.get("/config_timeout")
				.reply(200, {option1: "value1", option2: {cle1: "value2"}});
		});
		afterEach(function () {
			nock.cleanAll();
		});

		describe("Quand la configuration doit être récupérée", function () {
			[{
				url: "http://host.domain.tld/config",
				expectAttempts: [],
			}, {
				url: "http://host.domain.tld/config_retry3",
				expectAttempts: [{
					status: 500,
					data: "1ere erreur",
					message: "Request failed with status code 500",
				}, {
					status: 503,
					data: "2eme erreur",
					message: "Request failed with status code 503",
				}],
			}].forEach(({url, expectAttempts}) => {
				test(`Doit retourner la configuration [${url}]`, function () {
					// WHEN
					const layerConf = {
						type: "url",
						desc: "configuration de type url",
						url,
					};
					return layerUrl.load(layerConf).then((layer) => {
						// THEN
						assert.deepEqual(layer.config, {
							option1: "value1", option2: {cle1: "value2"},
						});
						const attempts = layer.attempts.map(({headers, ...attempt}) => {
							assert.ok(headers && typeof headers === "object");
							return attempt;
						});
						assert.deepEqual(attempts, expectAttempts);
						assert.equal(layer.error, undefined);

						const emitted = eventSpy.mock.calls.map((call) => call.arguments);
						assert.deepEqual(
							emitted,
							layer.attempts.map((attempt) => [layerConf, attempt]),
						);
					});
				});
			});
		});

		describe("Quand le layer fini en erreur", function () {
			[
				undefined, null, 1, true, ["http://host.domain.tld/config"], {}, "bad_url",
				"ftp://host.domain.tld/config", "https://", "http://host.domain.tld:65536/config",
			].forEach((url) => {
				test(`Doit retourner l'erreur 'url' n'est pas valide [${JSON.stringify(url)}]`, function () {
					// WHEN
					const loading = layerUrl.load({
						type: "url",
						url,
					});
					// Termine le chargement même si le délai a été armé par erreur.
					expire?.();
					return loading.then((layer) => {
						// THEN
						assert.ok(layer.error instanceof Error);
						assert.equal(layer.error.message, "'url' n'est pas valide");

						assert.equal(expire, undefined);
						assert.equal(eventSpy.mock.callCount(), 0);
					});
				});
			});
			[{
				url: "http://host.domain.tld/config_retry4delay10",
				expectAttempts: {
					message: "Request failed with status code 500",
					status: 500,
					data: "",
				},
				attemptsBeforeTimeout: 2,
			}, {
				url: "http://host.domain.tld/config_timeout",
				expectAttempts: {message: "timeout of 100ms exceeded"},
				attemptsBeforeTimeout: 1,
			}, {
				url: "http://unknown/config",
				expectAttempts: {message: "getaddrinfo ENOTFOUND unknown"},
				attemptsBeforeTimeout: 1,
			}].forEach(({url, expectAttempts, attemptsBeforeTimeout}) => {
				test(`Doit retourner une erreur de timeout [${url}]`, {timeout: 2000}, async function ({signal}) {
					// WHEN
					const layerConf = {
						type: "url",
						desc: "configuration de type url",
						url,
					};
					const loading = layerUrl.load(layerConf);
					for (let i = 0; i < attemptsBeforeTimeout; i++) {
						await once(configLoader, "layer_url_attempt_error", {signal});
					}
					expire();
					const layer = await loading;

					// THEN
					assert.ok(layer.error instanceof Error);
					assert.equal(layer.error.message, "le délai de 200s a expiré");
					assert.equal(layer.attempts.length, attemptsBeforeTimeout);
					const [firstAttempt] = layer.attempts;
					const {headers, ...attempt} = firstAttempt;
					assert.deepEqual(attempt, expectAttempts);
					if ("status" in expectAttempts) {
						assert.ok(headers && typeof headers === "object");
					} else {
						assert.equal(headers, undefined);
					}

					assert.equal(eventSpy.mock.callCount(), attemptsBeforeTimeout);
					assert.deepEqual(eventSpy.mock.calls[0].arguments, [layerConf, firstAttempt]);
				});
			});
		});
	});
});

describe("layer url avec le service de temps réel", function () {
	test("L’échéance ferme le GET sans diagnostic tardif", {timeout: 3000}, async function (context) {
		const received = Promise.withResolvers();
		const url = await listen(context, (request, response) => received.resolve(response));
		const loader = new ConfigLoader({
			httpTimeoutInS: 0.12,
			httpTimeoutRequestInS: 1,
			httpRetryDelayInS: 0.05,
		});
		const events = [];
		for (const name of ["layer_load_error", "layer_url_attempt_error"]) {
			loader.on(name, () => events.push(name));
		}

		const loading = loader.load([
			{type: "url", url}, {type: "object", config: {source: "repli"}},
		]);
		const response = await received.promise;
		const closed = once(response, "close").then(() => true);
		await loading;
		assert.equal(loader.getValue("source"), "repli");
		const [layer] = loader.getLayersInError();
		assert.equal(layer.error.message, "le délai de 0.12s a expiré");
		assert.deepEqual(layer.attempts, []);

		const closedBefore503 = await Promise.race([closed, wait(180, false)]);
		if (!closedBefore503) {
			response.writeHead(503).end();
			await wait(100);
		}
		const attempts = layer.attempts.map(({status}) => status);
		assert.deepEqual({closedBefore503, events, attempts}, {
			closedBefore503: true, events: ["layer_load_error"], attempts: [],
		});
	});

	for (const [status, scenario] of [[200, "un succès"], [503, "une relance annulée"]]) {
		test(`Le processus enfant sort sans attendre le minuteur après ${scenario}`, async function (context) {
			let requests = 0;
			const url = await listen(context, (request, response) => {
				requests++;
				response.writeHead(status, {"Content-Type": "application/json"});
				response.end(JSON.stringify({source: "HTTP"}));
			});
			const {stdout} = await promisify(execFile)(process.execPath, ["-e", `
				const assert = require("node:assert/strict");
				const [entry, url, status] = process.argv.slice(1);
				const {ConfigLoader} = require(entry);
				const success = status === "200";
				const loader = new ConfigLoader({
					httpTimeoutInS: success ? 1.2 : 0.4,
					httpTimeoutRequestInS: 1,
					httpRetryDelayInS: 1.6,
				});
				loader.load([
					{type: "object", config: {source: "repli"}}, {type: "url", url},
				]).then(() => {
					assert.equal(loader.getValue("source"), success ? "HTTP" : "repli");
					if (!success) {
						const [layer] = loader.getLayersInError();
						assert.equal(layer.error.message, "le délai de 0.4s a expiré");
						assert.deepEqual(layer.attempts.map(({status}) => status), [503]);
					}
					const loadedAt = performance.now();
					process.once("exit", () => process.stdout.write(String(performance.now() - loadedAt)));
				});
			`, fileURLToPath(import.meta.resolve("@sbesson/configuration-loader")), url, String(status)], {timeout: 5000});
			assert.match(stdout, /^\d+(\.\d+)?$/);
			const elapsed = Number(stdout);
			context.diagnostic(`Sortie ${Math.round(elapsed)} ms après load()`);
			assert.ok(elapsed < 1000);
			assert.equal(requests, 1);
		});
	}
});

async function listen(context, handler) {
	const server = createServer(handler);
	context.after(() => new Promise((resolve, reject) => {
		server.close((error) => error ? reject(error) : resolve());
		server.closeAllConnections();
	}));
	await once(server.listen(0, "127.0.0.1"), "listening");
	return `http://127.0.0.1:${server.address().port}`;
}

"use strict";

const assert = require("node:assert/strict");
const {describe, test, beforeEach, afterEach} = require("node:test");
const {EventEmitter, once} = require("node:events");
const {setTimeout: wait} = require("node:timers/promises");
const nock = require("nock").default;

const layerUrlFactory = require("../../layers/url.js");

describe("layer url", function () {
	const httpTimeoutInS = 200;
	let configLoader;
	let eventSpy;
	let expire;
	let layerUrl;

	beforeEach(function ({mock}) {
		const timeService = function (callback, delay) {
			if (delay === httpTimeoutInS * 1000) {
				// Les tests déclenchent le délai global après les tentatives attendues.
				return new Promise((resolve) => {
					expire = () => resolve(callback());
				});
			}
			return wait(delay / 1000).then(callback);
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
			[undefined, null, 1, true, ["http://host.domain.tld/config"], {}, "bad_url"].forEach((url) => {
				test(`Doit retourner l'erreur 'url' n'est pas valide [${JSON.stringify(url)}]`, function () {
					// WHEN
					return layerUrl.load({
						type: "url",
						url,
					}).then((layer) => {
						// THEN
						assert.ok(layer.error instanceof Error);
						assert.equal(layer.error.message, "'url' n'est pas valide");

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

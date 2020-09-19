"use strict";

const nock = require("nock");
const {chai: {expect}, sinon, example} = require("@sbesson/test-helpers");
const EventEmitter = require("events");

const layerUrlFactory = require("../../layers/url.js");

describe("layer url", function () {
	beforeEach(function () {
		this.timeService = function (callback, delay) {
			return new Promise((resolve) => {
				setTimeout(() => resolve(callback()), delay / 1000);
			});
		};

		this.eventSpy = sinon.spy();
		const configLoader = new EventEmitter();
		configLoader.on("layer_url_attempt_error", this.eventSpy);

		this.layerUrl = layerUrlFactory({
			options: {
				httpTimeoutRequestInS: 0.100, // => 100ms
				httpTimeoutInS: 200, // => 200ms en réalité du au timeService
				httpRetryDelayInS: 5, // => 5ms en réalité du au timeService
			},
			services: {
				timeService: this.timeService,
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
				.delay(500)
				.times(3)
				.reply(200, {option1: "value1", option2: {cle1: "value2"}})
				.get("/config_timeout")
				.reply(200, {option1: "value1", option2: {cle1: "value2"}});
		});
		afterEach(function () {
			nock.cleanAll();
		});

		describe("Quand la configuration doit être récupérée", function () {
			example([{
				url: "http://host.domain.tld/config",
				expectAttempts: [],
			}, {
				url: "http://host.domain.tld/config_retry3",
				expectAttempts: [{
					status: 500,
					data: "1ere erreur",
					message: "Request failed with status code 500",
					headers: {},
				}, {
					status: 503,
					data: "2eme erreur",
					message: "Request failed with status code 503",
					headers: {},
				}],
			}], function () {
				it("Doit retourner la configuration", function () {
					// WHEN
					const layerConf = {
						type: "url",
						desc: "configuration de type url",
						url: this.url,
					};
					return this.layerUrl.load(layerConf).then((layer) => {
						// THEN
						expect(layer.config).to.deep.equals({
							option1: "value1", option2: {cle1: "value2"},
						});
						expect(layer.attempts).to.deep.equals(this.expectAttempts);
						expect(layer.error).to.be.undefined;

						expect(this.eventSpy.callCount).to.equal(this.expectAttempts.length);
						this.expectAttempts.forEach((attempt, index) => {
							expect(this.eventSpy.args[index]).to.deep.equals([layerConf, attempt]);
						});
					});
				});
			});
		});

		describe("Quand le layer fini en erreur", function () {
			example([{
				url: undefined,
			}, {
				url: null,
			}, {
				url: 1,
			}, {
				url: true,
			}, {
				url: ["http://host.domain.tld/config"],
			}, {
				url: {},
			}, {
				url: "bad_url",
			}], function () {
				it("Doit retourner l'erreur 'url' n'est pas valide", function () {
					// WHEN
					return this.layerUrl.load({
						type: "url",
						url: this.url,
					}).then((layer) => {
						// THEN
						expect(layer.error).to.be.an("error");
						expect(layer.error.message).to.be.equals(
							"'url' n'est pas valide",
						);

						expect(this.eventSpy.notCalled).to.equal(true);
					});
				});
			});
			example([{
				url: "http://host.domain.tld/config_retry4delay10",
				expectAttempts: {
					message: "Request failed with status code 500",
					status: 500,
					data: "",
					headers: {},
				},
				expectNbAttemptMin: 2,
				expectNbAttemptMax: 3,
			}, {
				url: "http://host.domain.tld/config_timeout",
				expectAttempts: {message: "timeout of 100ms exceeded"},
				expectNbAttemptMin: 1,
				expectNbAttemptMax: 2,
			}, {
				url: "http://unknown/config",
				expectAttempts: {message: "getaddrinfo ENOTFOUND unknown unknown:80"},
				expectNbAttemptMin: 1,
				expectNbAttemptMax: 20,
			}], function () {
				it("Doit retourner une erreur de timeout", function () {
					// WHEN
					const layerConf = {
						type: "url",
						desc: "configuration de type url",
						url: this.url,
					};
					return this.layerUrl.load(layerConf).then((layer) => {
						// THEN
						expect(layer.error).to.be.an("error");
						expect(layer.error.message).to.be.equals(
							"le délai de 200s a expiré",
						);
						expect(layer.attempts[0]).to.deep.equals(this.expectAttempts);
						expect(layer.attempts.length)
							.to.be.within(this.expectNbAttemptMin, this.expectNbAttemptMax);

						expect(this.eventSpy.called).to.equal(true);
						expect(this.eventSpy.args[0])
							.to.deep.equals([layerConf, this.expectAttempts]);
					});
				});
			});
		});
	});
});

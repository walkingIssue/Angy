import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	buildSuggestionRequestBody,
	collectCatalogIntegrityIssues,
	defineAngyConfig,
	handleTranslationRequest,
	normalizeSuggestionModelConfig,
	resolveTranslationState
} from "../dist/server.js";

function createEntry({
	msgid,
	msgctxt = null,
	msgstr = [""],
	flags = [],
	hasTranslation = false,
	isFuzzy = false,
	translationOrigin = "base"
}) {
	return {
		msgid,
		msgctxt,
		msgidPlural: null,
		msgstr,
		references: [],
		extractedComments: [],
		flags,
		previous: [],
		obsolete: false,
		searchText: msgid.toLowerCase(),
		searchTokens: msgid.toLowerCase().split(/\s+/),
		hasTranslation,
		isFuzzy,
		translationOrigin
	};
}

function createSuggestionContext(entryOverrides = {}) {
	const entry = {
		...createEntry({
			msgid: "Save changes",
			msgstr: [""],
			hasTranslation: false
		}),
		...entryOverrides
	};

	return {
		match: {
			score: 0.99,
			via: "exact"
		},
		entry,
		alternatives: []
	};
}

function serializePo(language, entries) {
	const header = [
		'msgid ""',
		'msgstr ""',
		`"Language: ${language}\\n"`,
		'"Content-Type: text/plain; charset=UTF-8\\n"',
		'"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
		""
	].join("\n");

	const body = entries
		.map((entry) =>
			[
				entry.msgctxt ? `msgctxt "${entry.msgctxt}"` : null,
				`msgid "${entry.msgid}"`,
				`msgstr "${entry.msgstr ?? ""}"`,
				""
			]
				.filter(Boolean)
				.join("\n")
		)
		.join("\n");

	return `${header}\n${body}`;
}

async function createCatalogFixture({ baseEntries, workingEntries }) {
	const root = await mkdtemp(join(os.tmpdir(), "angy-test-"));
	const basePoPath = join(root, "en.po");
	const workingPoPath = join(root, "en-working.po");

	await writeFile(basePoPath, serializePo("en", baseEntries), "utf8");
	await writeFile(workingPoPath, serializePo("en-working", workingEntries), "utf8");

	return {
		root,
		basePoPath,
		workingPoPath,
		async cleanup() {
			await rm(root, { recursive: true, force: true });
		}
	};
}

function createConfig(fixture) {
	return {
		basePoPath: fixture.basePoPath,
		workingPoPath: fixture.workingPoPath,
		sourceLocale: "sv",
		targetLocale: "en",
		apiKey: "",
		routePath: "/api/translations"
	};
}

async function requestWithForm(intent, fields, fixture) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		body.set(key, value);
	}

	return handleTranslationRequest(
		new Request(`http://localhost/api/translations?intent=${intent}`, {
			method: "POST",
			body
		}),
		new URL(`http://localhost/api/translations?intent=${intent}`),
		{ config: createConfig(fixture), devOnly: false, dev: true }
	);
}

async function requestWithJson(intent, payload, fixture) {
	return handleTranslationRequest(
		new Request(`http://localhost/api/translations?intent=${intent}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload)
		}),
		new URL(`http://localhost/api/translations?intent=${intent}`),
		{ config: createConfig(fixture), devOnly: false, dev: true }
	);
}

test("resolveTranslationState prefers working diffs and fuzzy state", () => {
	const baseEntry = createEntry({
		msgid: "Save",
		msgstr: ["Save"],
		hasTranslation: true
	});
	const workingEntry = createEntry({
		msgid: "Save",
		msgstr: ["Store"],
		hasTranslation: true,
		isFuzzy: true,
		translationOrigin: "working"
	});

	const workingState = resolveTranslationState(baseEntry, workingEntry);
	assert.equal(workingState.translationOrigin, "working");
	assert.equal(workingState.translationStatus, "fuzzy");

});

test("collectCatalogIntegrityIssues flags missing working keys and translations", () => {
	const baseEntries = [
		createEntry({ msgid: "Hello", msgstr: ["Hello"], hasTranslation: true }),
		createEntry({ msgid: "Other", msgstr: [""], hasTranslation: false })
	];
	const workingEntries = [createEntry({ msgid: "Other", msgstr: [""], hasTranslation: false })];

	const issues = collectCatalogIntegrityIssues(baseEntries, workingEntries);
	assert.equal(issues.length, 1);
	assert.equal(issues[0].type, "key_mismatch");
	assert.equal(issues[0].msgid, "Hello");
});

test("defineAngyConfig rejects workingPoPath that does not match target-working locale", () => {
	assert.throws(
		() =>
			defineAngyConfig({
				basePoPath: "./src/locales/en.po",
				workingPoPath: "./src/locales/sv-working.po",
				sourceLocale: "sv",
				targetLocale: "en"
			}),
		/workingPoPath must point to the en-working\.po catalog/
	);
});

test("defineAngyConfig rejects basePoPath that does not match target locale", () => {
	assert.throws(
		() =>
			defineAngyConfig({
				basePoPath: "./src/locales/sv.po",
				workingPoPath: "./src/locales/en-working.po",
				sourceLocale: "en",
				targetLocale: "en"
			}),
		/basePoPath must point to the en\.po catalog/
	);
});

test("defineAngyConfig accepts default non-reasoning suggestion model", () => {
	const config = defineAngyConfig({
		basePoPath: "./src/locales/en.po",
		workingPoPath: "./src/locales/en-working.po",
		sourceLocale: "sv",
		targetLocale: "en",
		suggestionModel: { model: "gpt-4.1-mini" }
	});

	assert.deepEqual(config.suggestionModel, {
		model: "gpt-4.1-mini",
		reasoning: null
	});
});

test("defineAngyConfig rejects reasoning on non-reasoning suggestion models", () => {
	assert.throws(
		() =>
			defineAngyConfig({
				basePoPath: "./src/locales/en.po",
				workingPoPath: "./src/locales/en-working.po",
				sourceLocale: "sv",
				targetLocale: "en",
				suggestionModel: {
					model: "gpt-4.1-mini",
					reasoning: "medium"
				}
			}),
		/is not supported for gpt-4\.1-mini/
	);
});

test("normalizeSuggestionModelConfig accepts GPT-5.4 defaults and xhigh reasoning", () => {
	assert.deepEqual(normalizeSuggestionModelConfig({ model: "gpt-5.4" }), {
		model: "gpt-5.4"
	});
	assert.deepEqual(
		normalizeSuggestionModelConfig({
			model: "gpt-5.4",
			reasoning: "xhigh"
		}),
		{
			model: "gpt-5.4",
			reasoning: "xhigh"
		}
	);
});

test("normalizeSuggestionModelConfig rejects invalid reasoning effort for GPT-5.4", () => {
	assert.throws(
		() =>
			normalizeSuggestionModelConfig({
				model: "gpt-5.4",
				reasoning: "minimal"
			}),
		/is not supported for gpt-5\.4/
	);
});

test("normalizeSuggestionModelConfig handles GPT-5 and pro reasoning rules", () => {
	assert.deepEqual(
		normalizeSuggestionModelConfig({
			model: "gpt-5",
			reasoning: "minimal"
		}),
		{
			model: "gpt-5",
			reasoning: "minimal"
		}
	);

	assert.deepEqual(normalizeSuggestionModelConfig({ model: "gpt-5-pro" }), {
		model: "gpt-5-pro",
		reasoning: "high"
	});

	assert.throws(
		() =>
			normalizeSuggestionModelConfig({
				model: "gpt-5-pro",
				reasoning: "medium"
			}),
		/is not supported for gpt-5-pro/
	);
});

test("buildSuggestionRequestBody omits reasoning for GPT-4.1 models", () => {
	const body = buildSuggestionRequestBody({
		context: createSuggestionContext(),
		items: [{ msgid: "Save changes", msgctxt: null }],
		modelConfig: normalizeSuggestionModelConfig({ model: "gpt-4.1-mini" }),
		systemMessage: "test"
	});

	assert.equal(body.model, "gpt-4.1-mini");
	assert.equal("reasoning" in body, false);
});

test("buildSuggestionRequestBody includes reasoning for GPT-5 family models", () => {
	const body = buildSuggestionRequestBody({
		context: createSuggestionContext(),
		items: [{ msgid: "Save changes", msgctxt: null }],
		modelConfig: normalizeSuggestionModelConfig({
			model: "gpt-5.4",
			reasoning: "high"
		}),
		systemMessage: "test"
	});

	assert.equal(body.model, "gpt-5.4");
	assert.deepEqual(body.reasoning, { effort: "high" });
});

test("context returns working status when working catalog differs from base", async () => {
	const fixture = await createCatalogFixture({
		baseEntries: [{ msgid: "Submit", msgstr: "Submit" }],
		workingEntries: [{ msgid: "Submit", msgstr: "Send" }]
	});

	try {
		const response = await requestWithForm(
			"context",
			{ translationKey: "Submit", currentPath: "/" },
			fixture
		);
		assert.equal(response.status, 200);
		const json = await response.json();
		assert.equal(json.entry.translationStatus, "working");
		assert.equal(json.catalogState.status, "ok");
	} finally {
		await fixture.cleanup();
	}
});

test("context refuses to operate when working catalog is missing base translations", async () => {
	const fixture = await createCatalogFixture({
		baseEntries: [{ msgid: "Submit", msgstr: "Submit" }],
		workingEntries: [{ msgid: "Submit", msgstr: "" }]
	});

	try {
		const response = await requestWithForm(
			"context",
			{ translationKey: "Submit", currentPath: "/" },
			fixture
		);
		assert.equal(response.status, 409);
		const json = await response.json();
		assert.equal(json.code, "catalog_integrity_error");
	} finally {
		await fixture.cleanup();
	}
});

test("commit-batch writes only to working catalog and keeps base untouched", async () => {
	const fixture = await createCatalogFixture({
		baseEntries: [{ msgid: "Submit", msgstr: "Submit" }],
		workingEntries: [{ msgid: "Submit", msgstr: "Submit" }]
	});

	try {
		const response = await requestWithJson(
			"commit-batch",
			{
				items: [
					{
						resolvedMsgid: "Submit",
						resolvedMsgctxt: null,
						translationValue: "Send"
					}
				]
			},
			fixture
		);
		assert.equal(response.status, 200);

		const baseRaw = await readFile(fixture.basePoPath, "utf8");
		const workingRaw = await readFile(fixture.workingPoPath, "utf8");
		const draftRaw = await readFile(fixture.workingPoPath.replace(".po", ".angy-draft.po"), "utf8");
		assert.match(baseRaw, /msgstr "Submit"/);
		assert.match(workingRaw, /msgstr "Submit"/);
		assert.match(draftRaw, /msgstr "Send"/);
	} finally {
		await fixture.cleanup();
	}
});

test("working preview promotion publishes draft into runtime working catalog", async () => {
	const fixture = await createCatalogFixture({
		baseEntries: [{ msgid: "Submit", msgstr: "Submit" }],
		workingEntries: [{ msgid: "Submit", msgstr: "Submit" }]
	});

	try {
		await requestWithJson(
			"commit-batch",
			{
				items: [
					{
						resolvedMsgid: "Submit",
						resolvedMsgctxt: null,
						translationValue: "Send"
					}
				]
			},
			fixture
		);

		const promoteResponse = await requestWithJson("promote-working-preview", {}, fixture);
		assert.equal(promoteResponse.status, 200);

		const workingRaw = await readFile(fixture.workingPoPath, "utf8");
		assert.match(workingRaw, /msgstr "Send"/);
	} finally {
		await fixture.cleanup();
	}
});

test("commit preserves base key order in the draft working catalog", async () => {
	const fixture = await createCatalogFixture({
		baseEntries: [
			{ msgid: "Alpha", msgstr: "Alpha" },
			{ msgid: "Beta", msgstr: "Beta" },
			{ msgid: "Gamma", msgstr: "Gamma" }
		],
		workingEntries: [
			{ msgid: "Alpha", msgstr: "Alpha" },
			{ msgid: "Beta", msgstr: "Beta" },
			{ msgid: "Gamma", msgstr: "Gamma" }
		]
	});

	try {
		const response = await requestWithJson(
			"commit-batch",
			{
				items: [
					{
						resolvedMsgid: "Gamma",
						resolvedMsgctxt: null,
						translationValue: "Gamma updated"
					},
					{
						resolvedMsgid: "Alpha",
						resolvedMsgctxt: null,
						translationValue: "Alpha updated"
					}
				]
			},
			fixture
		);
		assert.equal(response.status, 200);

		const draftRaw = await readFile(fixture.workingPoPath.replace(".po", ".angy-draft.po"), "utf8");
		const alphaIndex = draftRaw.indexOf('msgid "Alpha"');
		const betaIndex = draftRaw.indexOf('msgid "Beta"');
		const gammaIndex = draftRaw.indexOf('msgid "Gamma"');

		assert.ok(alphaIndex >= 0);
		assert.ok(betaIndex >= 0);
		assert.ok(gammaIndex >= 0);
		assert.ok(alphaIndex < betaIndex);
		assert.ok(betaIndex < gammaIndex);
	} finally {
		await fixture.cleanup();
	}
});

test("rotate-preflight returns affected keys for destructive rotation", async () => {
	const fixture = await createCatalogFixture({
		baseEntries: [{ msgid: "Submit", msgstr: "Submit" }],
		workingEntries: [{ msgid: "Submit", msgstr: "Send" }]
	});

	try {
		const response = await requestWithJson("rotate-preflight", {}, fixture);
		assert.equal(response.status, 200);
		const json = await response.json();
		assert.equal(json.safe, true);
		assert.equal(json.status, "ok");
		assert.equal(json.affected.length, 1);
		assert.equal(json.affected[0].msgid, "Submit");
	} finally {
		await fixture.cleanup();
	}
});

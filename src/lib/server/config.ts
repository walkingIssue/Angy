import { readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";
import type { TranslationContextResult } from "../client/toggleQA.shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILENAMES = [
	"angy.config.ts",
	"angy.config.js",
	"angy.config.mjs",
	"angy.config.cjs"
];

export type TranslationHelperConfig = {
	basePoPath: string;
	workingPoPath: string;
	sourceLocale: string;
	targetLocale: string;
	routePath: string;
	apiKey: string;
	systemMessage: string;
	suggestionModel: string;
	watchIgnore: string[];
	suggestionProvider?: SuggestionProvider;
};

export type SuggestionRequestItem = {
	msgid: string;
	msgctxt: string | null;
};

export type SuggestionResponseItem = {
	msgid: string;
	msgctxt: string | null;
	suggestion: string;
};

export type SuggestionProviderInput = {
	context: TranslationContextResult;
	items: SuggestionRequestItem[];
	sourceLocale: string;
	targetLocale: string;
	systemMessage: string;
	model: string;
	apiKey: string;
};

export type SuggestionProvider = (
	input: SuggestionProviderInput
) => Promise<SuggestionResponseItem[]>;

export type TranslationHelperUserConfig = Partial<TranslationHelperConfig>;

export type AngyConfigInput = {
	basePoPath: string;
	workingPoPath: string;
	sourceLocale: string;
	targetLocale: string;
	routePath?: string;
	apiKey: string;
	systemMessage?: string;
	suggestionModel?: string;
	watchIgnore?: string[];
	suggestionProvider?: SuggestionProvider;
};

export function buildDefaultSystemMessage(sourceLocale: string, targetLocale: string) {
	return `You are an expert product localization assistant translating ${sourceLocale} UI copy into polished ${targetLocale}. Keep already-${targetLocale} text unchanged. Preserve placeholders like {0}, {1}, ICU fragments, HTML-like markers such as <0/> and <strong>, line breaks, punctuation, capitalization, and button-like brevity. Prefer terminology and syntax that stay close to the translated examples so the product voice remains cohesive. Do not invent extra context, do not expand abbreviations unless the examples already do, and avoid semantic drift. Return only high-confidence translation suggestions for the provided untranslated strings.`;
}

function assertNonEmptyString(value: unknown, key: string) {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`[angy] ${key} is required and must be a non-empty string.`);
	}
}

function validateRoutePath(routePath: unknown) {
	if (routePath == null || routePath === "") return;
	if (typeof routePath !== "string" || !routePath.startsWith("/")) {
		throw new Error(`[angy] routePath must be an absolute path starting with "/".`);
	}
}

function validateWatchIgnore(watchIgnore: unknown) {
	if (watchIgnore == null) return;
	if (!Array.isArray(watchIgnore) || watchIgnore.some((item) => typeof item !== "string")) {
		throw new Error(`[angy] watchIgnore must be an array of strings.`);
	}
}

function validateSuggestionProvider(suggestionProvider: unknown) {
	if (suggestionProvider == null) return;
	if (typeof suggestionProvider !== "function") {
		throw new Error(`[angy] suggestionProvider must be a function.`);
	}
}

const config: TranslationHelperConfig = {
	basePoPath: resolve(__dirname, "../../locales/en.po"),
	workingPoPath: resolve(__dirname, "../../locales/en-working.po"),
	sourceLocale: "sv",
	targetLocale: "en",
	routePath: "/api/translations",
	apiKey: "",
	systemMessage: buildDefaultSystemMessage("sv", "en"),
	suggestionModel: "gpt-4.1-mini",
	watchIgnore: ["**/en-working.po"]
};

let loadedConfigRoot: string | null = null;
const workingCatalogWatchControllers = new Set<(path: string, delayMs?: number) => void>();

export function configureTranslationHelper(next: Partial<TranslationHelperConfig>) {
	Object.assign(config, next);
}

export function getTranslationHelperConfig() {
	return config;
}

function normalizeFsPath(path: string) {
	return normalize(path).replace(/\\/g, "/");
}

export function inferLocaleFromCatalogPath(path: string) {
	const fileName = basename(path);
	if (!fileName) return null;
	return fileName.slice(0, fileName.length - extname(fileName).length) || null;
}

function resolveLocaleAlias(
	value: string,
	paths: { basePoPath: string; workingPoPath: string }
) {
	if (value === "working") {
		const locale = inferLocaleFromCatalogPath(paths.workingPoPath);
		if (!locale) {
			throw new Error("[angy] Unable to infer locale from workingPoPath.");
		}
		return locale;
	}

	if (value === "base") {
		const locale = inferLocaleFromCatalogPath(paths.basePoPath);
		if (!locale) {
			throw new Error("[angy] Unable to infer locale from basePoPath.");
		}
		return locale;
	}

	return value;
}

function validateLocaleAliasUsage(sourceLocale: string, targetLocale: string) {
	if (sourceLocale === "working") {
		throw new Error('[angy] sourceLocale cannot be "working". Use an explicit source locale.');
	}

	if (targetLocale === "base") {
		throw new Error('[angy] targetLocale cannot be "base". Use an explicit target locale or "working".');
	}
}

export function registerWorkingCatalogWatchController(
	controller: (path: string, delayMs?: number) => void
) {
	workingCatalogWatchControllers.add(controller);
	return () => {
		workingCatalogWatchControllers.delete(controller);
	};
}

export function suspendWorkingCatalogWatch(path: string, delayMs = 800) {
	const normalizedPath = normalizeFsPath(path);
	for (const controller of workingCatalogWatchControllers) {
		controller(normalizedPath, delayMs);
	}
}

export function normalizeTranslationHelperConfig(
	root: string,
	next: TranslationHelperUserConfig
): TranslationHelperUserConfig {
	const normalized = { ...next };

	if (normalized.basePoPath && !isAbsolute(normalized.basePoPath)) {
		normalized.basePoPath = resolve(root, normalized.basePoPath);
	}

	if (normalized.workingPoPath && !isAbsolute(normalized.workingPoPath)) {
		normalized.workingPoPath = resolve(root, normalized.workingPoPath);
	}

	return normalized;
}

export function resolveConfiguredLocaleAliases(
	next: TranslationHelperConfig
): TranslationHelperConfig {
	const rawSourceLocale = next.sourceLocale;
	const rawTargetLocale = next.targetLocale;
	const resolvedSourceLocale = resolveLocaleAlias(rawSourceLocale, next);
	const resolvedTargetLocale = resolveLocaleAlias(rawTargetLocale, next);
	const usesDefaultSystemMessage =
		next.systemMessage === buildDefaultSystemMessage(rawSourceLocale, rawTargetLocale);

	return {
		...next,
		sourceLocale: resolvedSourceLocale,
		targetLocale: resolvedTargetLocale,
		systemMessage: usesDefaultSystemMessage
			? buildDefaultSystemMessage(resolvedSourceLocale, resolvedTargetLocale)
			: next.systemMessage
	};
}

export function completeAngyConfig(input: AngyConfigInput): TranslationHelperConfig {
	assertNonEmptyString(input.basePoPath, "basePoPath");
	assertNonEmptyString(input.workingPoPath, "workingPoPath");
	assertNonEmptyString(input.sourceLocale, "sourceLocale");
	assertNonEmptyString(input.targetLocale, "targetLocale");
	validateLocaleAliasUsage(input.sourceLocale, input.targetLocale);
	if (typeof input.apiKey !== "string") {
		throw new Error(`[angy] apiKey is required and must be a string. Use an empty string to disable suggestions.`);
	}
	validateRoutePath(input.routePath);
	validateWatchIgnore(input.watchIgnore);
	validateSuggestionProvider(input.suggestionProvider);

	return {
		basePoPath: input.basePoPath,
		workingPoPath: input.workingPoPath,
		sourceLocale: input.sourceLocale,
		targetLocale: input.targetLocale,
		routePath: input.routePath ?? "/api/translations",
		apiKey: input.apiKey,
		systemMessage:
			input.systemMessage ??
			buildDefaultSystemMessage(input.sourceLocale, input.targetLocale),
		suggestionModel: input.suggestionModel ?? "gpt-4.1-mini",
		watchIgnore: input.watchIgnore ?? ["**/en-working.po"],
		suggestionProvider: input.suggestionProvider
	};
}

export function defineAngyConfig(config: AngyConfigInput) {
	return completeAngyConfig(config);
}

async function fileExists(path: string) {
	try {
		await readFile(path);
		return true;
	} catch {
		return false;
	}
}

async function loadTsConfigModule(path: string) {
	const source = await readFile(path, "utf8");
	const transformed = await transform(source, {
		loader: "ts",
		format: "esm",
		target: "es2022"
	});
	const tempPath = `${path}.angy.tmp.mjs`;
	await writeFile(tempPath, transformed.code, "utf8");

	try {
		return await import(`${pathToFileURL(tempPath).href}?t=${Date.now()}`);
	} finally {
		await unlink(tempPath).catch(() => undefined);
	}
}

async function loadJsConfigModule(path: string) {
	return import(pathToFileURL(path).href);
}

export async function loadAngyConfigFromRoot(root: string) {
	if (loadedConfigRoot === root) {
		return config;
	}

	for (const filename of CONFIG_FILENAMES) {
		const fullPath = `${root}/${filename}`.replace(/\\/g, "/");
		if (!(await fileExists(fullPath))) continue;

		const module =
			filename.endsWith(".ts")
				? await loadTsConfigModule(fullPath)
				: await loadJsConfigModule(fullPath);
		const raw = (module.default ?? module.config ?? {}) as TranslationHelperUserConfig;
		const next = resolveConfiguredLocaleAliases(
			normalizeTranslationHelperConfig(root, completeAngyConfig(raw as AngyConfigInput))
		);
		configureTranslationHelper(next);
		loadedConfigRoot = root;
		return config;
	}

	loadedConfigRoot = root;
	return config;
}

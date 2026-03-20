import { translationKey, type TranslationContextResult } from "./toggleQA.shared";

const STORAGE_KEY = "i18n-translation-suggestions-v1";


type SuggestionMap = Record<string, string>;

type SuggestionItem = {
	msgid: string;
	msgctxt: string | null;
	suggestion: string;
};

function isBrowser() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readSuggestionCache(): SuggestionMap {
	if (!isBrowser()) return {};

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		return typeof parsed === "object" && parsed ? parsed : {};
	} catch {
		return {};
	}
}

export function writeSuggestionCache(cache: SuggestionMap) {
	if (!isBrowser()) return;

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
	} catch {
		// Ignore storage failures in this dev-only helper.
	}
}

function getEntriesForSuggestions(contextResult: TranslationContextResult) {
	return [contextResult.entry, ...contextResult.alternatives];
}

function getUntranslatedItems(contextResult: TranslationContextResult, cache: SuggestionMap) {
	return getEntriesForSuggestions(contextResult)
		.filter((entry) => !entry.hasTranslation)
		.filter((entry) => !cache[translationKey(entry.msgid, entry.msgctxt)])
		.map((entry) => ({
			msgid: entry.msgid,
			msgctxt: entry.msgctxt
		}));
}

function mergeSuggestionItems(cache: SuggestionMap, items: SuggestionItem[]) {
	const nextCache = { ...cache };
	for (const item of items) {
		nextCache[translationKey(item.msgid, item.msgctxt)] = item.suggestion.trim();
	}
	return nextCache;
}

export async function requestTranslationSuggestions(
	contextResult: TranslationContextResult,
	endpoint: string
): Promise<SuggestionMap> {
	const cache = readSuggestionCache();
	const untranslatedItems = getUntranslatedItems(contextResult, cache);
	if (!untranslatedItems.length) {
		return cache;
	}

	const response = await fetch(`${endpoint}?intent=suggestions`, {
		method: "POST",
		headers: {
			"content-type": "application/json"
		},
		body: JSON.stringify({
			context: contextResult,
			items: untranslatedItems
		})
	});

	if (!response.ok) {
		throw new Error(`Suggestion request failed: ${response.status}`);
	}

	const json = await response.json();
	if (json?.disabled) {
		return cache;
	}
	const items = Array.isArray(json?.items) ? (json.items as SuggestionItem[]) : [];
	if (!items.length) {
		return cache;
	}

	const nextCache = mergeSuggestionItems(cache, items);
	writeSuggestionCache(nextCache);
	return nextCache;
}

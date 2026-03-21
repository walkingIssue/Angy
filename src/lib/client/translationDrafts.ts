import { translationKey } from "./toggleQA.shared";

const STORAGE_KEY = "angy-translation-drafts-v1";

export type DraftCacheItem = {
	value: string;
	isDirty: boolean;
};

type DraftCache = Record<string, DraftCacheItem>;

function isBrowser() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readDraftCache(): DraftCache {
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

export function writeDraftCache(cache: DraftCache) {
	if (!isBrowser()) return;

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
	} catch {
		// Ignore storage failures in this dev-only helper.
	}
}

export function setDraftValue(
	cache: DraftCache,
	msgid: string,
	msgctxt: string | null,
	item: DraftCacheItem
) {
	const next = { ...cache, [translationKey(msgid, msgctxt)]: item };
	writeDraftCache(next);
	return next;
}

export function clearDraftValue(cache: DraftCache, msgid: string, msgctxt: string | null) {
	const next = { ...cache };
	delete next[translationKey(msgid, msgctxt)];
	writeDraftCache(next);
	return next;
}

export function getDraftValue(cache: DraftCache, msgid: string, msgctxt: string | null) {
	return cache[translationKey(msgid, msgctxt)] ?? null;
}

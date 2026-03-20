import { json } from "@sveltejs/kit";
import {
	applyWorkingState,
	buildEntryMap,
	buildLookupVariants,
	catalogEntryKey,
	createFuse,
	readCatIndex
} from "./catalog.ts";
import type { NormalizedEntry } from "./types.ts";

const DIRECT_MATCH_LIMIT = 5;
const MAX_ALTERNATIVES = 300;
const TRANSLATED_TARGET = Math.floor(MAX_ALTERNATIVES * 0.2);
const UNTRANSLATED_TARGET = MAX_ALTERNATIVES - TRANSLATED_TARGET;
const UNTRANSLATED_RANK_BONUS = 0.03;

type Candidate = {
	entry: NormalizedEntry;
	score: number;
	variant: string;
};

type ScoredEntry = {
	entry: NormalizedEntry;
	score: number;
	variant: string;
};

export function entryKey(msgid: string, msgctxt: string | null) {
	return catalogEntryKey(msgid, msgctxt);
}

function normalizeCurrentPath(currentPath: string) {
	try {
		return new URL(currentPath, "http://localhost").pathname;
	} catch {
		return currentPath;
	}
}

function inferPageReference(currentPath: string) {
	const normalizedPath = normalizeCurrentPath(currentPath);
	if (normalizedPath === "/") {
		return "src/routes/+page.svelte";
	}

	const trimmedPath = normalizedPath.replace(/\/+$/, "");
	return `src/routes${trimmedPath}/+page.svelte`;
}

function routeLooksRelevant(routeReference: string, refs: string[], extractedComments: string[]) {
	if (!routeReference) return false;

	const haystack = [...refs, ...extractedComments].join(" ").toLowerCase();
	return haystack.includes(routeReference.toLowerCase());
}

function dedupeCandidates(candidates: Candidate[]) {
	const deduped = new Map<string, Candidate>();

	for (const item of candidates) {
		const id = entryKey(item.entry.msgid, item.entry.msgctxt);
		const existing = deduped.get(id);
		if (!existing || item.score < existing.score) {
			deduped.set(id, item);
		}
	}

	return [...deduped.values()];
}

function rankDirectMatches(candidates: Candidate[], routeReference: string) {
	return [...candidates].sort((left, right) => {
		const leftRoute = routeLooksRelevant(
			routeReference,
			left.entry.references,
			left.entry.extractedComments
		)
			? -0.08
			: 0;
		const rightRoute = routeLooksRelevant(
			routeReference,
			right.entry.references,
			right.entry.extractedComments
		)
			? -0.08
			: 0;
		const leftUntranslated = !left.entry.hasTranslation ? -UNTRANSLATED_RANK_BONUS : 0;
		const rightUntranslated = !right.entry.hasTranslation ? -UNTRANSLATED_RANK_BONUS : 0;

		return left.score + leftRoute + leftUntranslated - (right.score + rightRoute + rightUntranslated);
	});
}

function getReferenceTokens(reference: string) {
	return reference
		.toLowerCase()
		.split(/[\/\[\].:_-]+/)
		.map((token) => token.trim())
		.filter(Boolean);
}

function getReferenceSimilarity(reference: string, routeReference: string) {
	const referenceTokens = new Set(getReferenceTokens(reference));
	const routeTokens = getReferenceTokens(routeReference);

	if (!routeTokens.length || !referenceTokens.size) return 0;

	let matches = 0;
	for (const token of routeTokens) {
		if (referenceTokens.has(token)) {
			matches += 1;
		}
	}

	return matches / routeTokens.length;
}

function collectSharedReferenceAlternatives(
	entries: NormalizedEntry[],
	bestEntry: NormalizedEntry,
	routeReference: string,
	excludedKeys: Set<string>
) {
	const sharedReferences = new Set(bestEntry.references.map((reference) => reference.toLowerCase()));

	return entries
		.filter((entry) => !excludedKeys.has(entryKey(entry.msgid, entry.msgctxt)))
		.map((entry) => {
			const referenceMatches = entry.references.filter((reference) =>
				sharedReferences.has(reference.toLowerCase())
			);
			const routeMatch = entry.references.some((reference) =>
				reference.toLowerCase().includes(routeReference.toLowerCase())
			);

			if (!referenceMatches.length && !routeMatch) {
				return null;
			}

			const referenceSimilarity = Math.max(
				0,
				...entry.references.map((reference) => getReferenceSimilarity(reference, routeReference))
			);
			const untranslatedBonus = !entry.hasTranslation ? 0.35 : 0;

			return {
				entry,
				score:
					referenceMatches.length * 100 +
					(routeMatch ? 25 : 0) +
					referenceSimilarity +
					untranslatedBonus,
				variant: "shared-reference"
			};
		})
		.filter((item): item is ScoredEntry => Boolean(item))
		.sort((left, right) => right.score - left.score);
}

function collectRouteFillAlternatives(
	entries: NormalizedEntry[],
	routeReference: string,
	excludedKeys: Set<string>
) {
	return entries
		.filter((entry) => !excludedKeys.has(entryKey(entry.msgid, entry.msgctxt)))
		.map((entry) => {
			const referenceSimilarity = Math.max(
				0,
				...entry.references.map((reference) => getReferenceSimilarity(reference, routeReference))
			);

			if (referenceSimilarity <= 0) {
				return null;
			}
			const untranslatedBonus = !entry.hasTranslation ? 0.2 : 0;

			return {
				entry,
				score: referenceSimilarity + untranslatedBonus,
				variant: "route-reference"
			};
		})
		.filter((item): item is ScoredEntry => Boolean(item))
		.sort((left, right) => right.score - left.score);
}

function collectTranslatedCohesionAlternatives(
	directMatches: Candidate[],
	excludedKeys: Set<string>
) {
	return directMatches
		.filter((item) => item.entry.hasTranslation)
		.filter((item) => !excludedKeys.has(entryKey(item.entry.msgid, item.entry.msgctxt)))
		.map((item) => ({
			entry: item.entry,
			score: 1 - item.score,
			variant: "translated-cohesion"
		}))
		.sort((left, right) => right.score - left.score);
}

function collectUntranslatedSimilarityAlternatives(
	directMatches: Candidate[],
	excludedKeys: Set<string>
) {
	return directMatches
		.filter((item) => !item.entry.hasTranslation)
		.filter((item) => !excludedKeys.has(entryKey(item.entry.msgid, item.entry.msgctxt)))
		.map((item) => ({
			entry: item.entry,
			score: 1 - item.score,
			variant: "untranslated-similarity"
		}))
		.sort((left, right) => right.score - left.score);
}

function buildAlternativePool(
	topDirectAlternatives: Candidate[],
	sharedReferenceAlternatives: ScoredEntry[],
	routeFillAlternatives: ScoredEntry[],
	translatedCohesionAlternatives: ScoredEntry[],
	untranslatedSimilarityAlternatives: ScoredEntry[]
) {
	const alternatives: ScoredEntry[] = [...topDirectAlternatives];
	const selectedKeys = new Set<string>(
		topDirectAlternatives.map((item) => entryKey(item.entry.msgid, item.entry.msgctxt))
	);

	let translatedCount = topDirectAlternatives.filter((item) => item.entry.hasTranslation).length;
	let untranslatedCount = topDirectAlternatives.length - translatedCount;

	const tryAdd = (item: ScoredEntry, honorQuota = true) => {
		if (alternatives.length >= MAX_ALTERNATIVES) return false;

		const id = entryKey(item.entry.msgid, item.entry.msgctxt);
		if (selectedKeys.has(id)) return false;

		if (honorQuota) {
			if (item.entry.hasTranslation && translatedCount >= TRANSLATED_TARGET) return false;
			if (!item.entry.hasTranslation && untranslatedCount >= UNTRANSLATED_TARGET) return false;
		}

		selectedKeys.add(id);
		alternatives.push(item);

		if (item.entry.hasTranslation) {
			translatedCount += 1;
		} else {
			untranslatedCount += 1;
		}

		return true;
	};

	const prioritizedSources = [
		sharedReferenceAlternatives,
		routeFillAlternatives,
		untranslatedSimilarityAlternatives,
		translatedCohesionAlternatives
	];

	for (const source of prioritizedSources) {
		for (const item of source) {
			tryAdd(item, true);
		}
	}

	if (alternatives.length < MAX_ALTERNATIVES) {
		for (const source of prioritizedSources) {
			for (const item of source) {
				tryAdd(item, false);
			}
		}
	}

	return alternatives.slice(0, MAX_ALTERNATIVES);
}

export async function findTranslationContext(
	key: string,
	currentPath: string
) {
	const baseIndex = await readCatIndex("base");
	if (!baseIndex) return null;

	const workingIndex = await readCatIndex("working");
	const workingMap = workingIndex
		? buildEntryMap(workingIndex.entries)
		: new Map<string, NormalizedEntry>();
	const effectiveEntries = baseIndex.entries.map((entry) =>
		applyWorkingState(entry, workingMap.get(entryKey(entry.msgid, entry.msgctxt)))
	);
	const effectiveIndex = {
		entries: effectiveEntries,
		fuse: createFuse(effectiveEntries)
	};

	const routeReference = inferPageReference(currentPath);
	const directMatches = rankDirectMatches(
		dedupeCandidates(
			buildLookupVariants(key).flatMap((variant) =>
				effectiveIndex.fuse.search(variant, { limit: 180 }).map((hit) => ({
					entry: hit.item,
					score: hit.score ?? 1,
					variant
				}))
			)
		),
		routeReference
	);

	const best = directMatches[0];
	if (!best || best.score > 0.42) {
		return null;
	}

	const effectiveDirectMatches = directMatches;
	const bestEffective = effectiveDirectMatches[0];
	const topDirectAlternatives = effectiveDirectMatches.slice(1, DIRECT_MATCH_LIMIT);
	const excludedKeys = new Set<string>([
		entryKey(best.entry.msgid, best.entry.msgctxt),
		...topDirectAlternatives.map((item) => entryKey(item.entry.msgid, item.entry.msgctxt))
	]);

	const sharedReferenceAlternatives = collectSharedReferenceAlternatives(
		effectiveEntries,
		bestEffective.entry,
		routeReference,
		excludedKeys
	);

	const routeFillAlternatives = collectRouteFillAlternatives(
		effectiveEntries,
		routeReference,
		excludedKeys
	);

	const translatedCohesionAlternatives = collectTranslatedCohesionAlternatives(
		effectiveDirectMatches.slice(DIRECT_MATCH_LIMIT),
		excludedKeys
	);

	const untranslatedSimilarityAlternatives = collectUntranslatedSimilarityAlternatives(
		effectiveDirectMatches.slice(DIRECT_MATCH_LIMIT),
		excludedKeys
	);

	return {
		best,
		alternatives: buildAlternativePool(
			topDirectAlternatives,
			sharedReferenceAlternatives,
			routeFillAlternatives,
			translatedCohesionAlternatives,
			untranslatedSimilarityAlternatives
		),
		routeReference,
		workingMap
	};
}

export function toPublicEntry(entry: NormalizedEntry, workingEntry?: NormalizedEntry) {
	const effective = workingEntry ?? entry;
	const baseValue = entry.msgstr[0] ?? "";
	const workingValue = workingEntry?.msgstr[0] ?? "";
	const workingDiffersFromBase =
		Boolean(workingEntry?.hasTranslation) && workingValue !== baseValue;

	return {
		msgid: entry.msgid,
		msgctxt: entry.msgctxt,
		msgidPlural: entry.msgidPlural,
		msgstr: effective.msgstr,
		references: entry.references,
		extractedComments: entry.extractedComments,
		flags: effective.flags,
		previous: effective.previous,
		obsolete: effective.obsolete,
		hasTranslation: effective.hasTranslation,
		isFuzzy: effective.isFuzzy,
		isCommittedToWorking: workingDiffersFromBase,
		matchesTargetTranslation:
			Boolean(effective.hasTranslation) && (!workingEntry?.hasTranslation || workingValue === baseValue),
		translationOrigin: workingDiffersFromBase ? "working" : "base"
	};
}

export function toPublicAlternative(
	entry: NormalizedEntry,
	score: number,
	workingEntry?: NormalizedEntry
) {
	const effective = workingEntry ?? entry;
	const baseValue = entry.msgstr[0] ?? "";
	const workingValue = workingEntry?.msgstr[0] ?? "";
	const workingDiffersFromBase =
		Boolean(workingEntry?.hasTranslation) && workingValue !== baseValue;

	return {
		msgid: entry.msgid,
		msgctxt: entry.msgctxt,
		score,
		references: entry.references,
		msgstr: effective.msgstr,
		hasTranslation: effective.hasTranslation,
		isFuzzy: effective.isFuzzy,
		isCommittedToWorking: workingDiffersFromBase,
		matchesTargetTranslation:
			Boolean(effective.hasTranslation) && (!workingEntry?.hasTranslation || workingValue === baseValue),
		translationOrigin: workingDiffersFromBase ? "working" : "base"
	};
}

export async function handleContext(request: Request) {
	const data = await request.formData();
	const key = data.get("translationKey")?.toString().trim();
	const currentPath = data.get("currentPath")?.toString().trim();

	if (!key || !currentPath) {
		return json(
			{
				success: false,
				error: "translationKey and currentPath are required"
			},
			{ status: 400 }
		);
	}

	const baseFound = await findTranslationContext(key, currentPath);
	if (!baseFound) {
		return json(
			{
				success: false,
				error: "Translation key context not found"
			},
			{ status: 404 }
		);
	}

	const bestBase = baseFound.best.entry;
	const bestWorking = baseFound.workingMap.get(entryKey(bestBase.msgid, bestBase.msgctxt));

	return json({
		success: true,
		match: {
			score: baseFound.best.score,
			via: baseFound.best.variant
		},
		entry: toPublicEntry(bestBase, bestWorking),
		alternatives: baseFound.alternatives.map((item) => {
			const workingAlt = baseFound.workingMap.get(entryKey(item.entry.msgid, item.entry.msgctxt));
			return toPublicAlternative(item.entry, item.score, workingAlt);
		})
	});
}

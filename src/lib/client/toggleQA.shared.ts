export type TranslationOrigin = "base" | "working";
export type TranslationStatus = "base" | "working" | "none" | "fuzzy" | "out_of_sync";

export type ResolvedKey = {
	msgid: string;
	msgctxt: string | null;
};

export type TranslationEntry = {
	msgid: string;
	msgctxt: string | null;
	msgidPlural: string | null;
	msgstr: string[];
	references: string[];
	extractedComments: string[];
	flags: string[];
	previous: string[];
	obsolete: boolean;
	hasTranslation?: boolean;
	isFuzzy?: boolean | null;
	isCommittedToWorking?: boolean;
	matchesTargetTranslation?: boolean;
	translationOrigin?: TranslationOrigin | null;
	translationStatus?: TranslationStatus | null;
};

export type TranslationAlternative = {
	msgid: string;
	msgctxt: string | null;
	score: number;
	references: string[];
	msgstr: string[];
	hasTranslation: boolean;
	isFuzzy: boolean | null | undefined;
	isCommittedToWorking?: boolean;
	matchesTargetTranslation?: boolean;
	translationOrigin?: TranslationOrigin | null;
	translationStatus?: TranslationStatus | null;
};

export type TranslationContextResult = {
	match: {
		score: number;
		via: string;
	};
	catalogState?: {
		status: "ok" | "out_of_sync";
		affectedCount: number;
	};
	entry: TranslationEntry;
	alternatives: TranslationAlternative[];
};

export type DraftTranslation = {
	msgid: string;
	msgctxt: string | null;
	value: string;
	origin: TranslationOrigin | null;
	originalValue: string;
	isDirty: boolean;
};

export type TranslationCandidate = Pick<
	TranslationEntry,
	"msgid" | "msgctxt" | "hasTranslation" | "translationOrigin" | "isFuzzy"
>;

export const TRANSLATION_STATUS_TOOLTIP =
	"'\u{1F914}' fuzzy translation needs review. '\u2705' translation is in base. '\u274C' no translation. '\u{1F6E0}\uFE0F' working differs from base. '\u26A0\uFE0F' catalogs are out of sync.";

export function translationKey(msgid: string, msgctxt: string | null) {
	return `${msgctxt ?? ""}::${msgid}`;
}

export function sameResolvedKey(
	left: Pick<ResolvedKey, "msgid" | "msgctxt"> | null | undefined,
	right: Pick<ResolvedKey, "msgid" | "msgctxt"> | null | undefined
) {
	return (
		Boolean(left && right) &&
		left?.msgid === right?.msgid &&
		(left?.msgctxt ?? null) === (right?.msgctxt ?? null)
	);
}

export function getEffectiveResolvedKey(
	selectedResolvedKey: ResolvedKey | null,
	contextResult: TranslationContextResult | null
) {
	return (
		selectedResolvedKey ??
		(contextResult?.entry
			? {
					msgid: contextResult.entry.msgid,
					msgctxt: contextResult.entry.msgctxt
				}
			: null)
	);
}

export function findContextEntry(
	contextResult: TranslationContextResult | null,
	msgid: string,
	msgctxt: string | null
) {
	if (!contextResult) return null;

	if (
		contextResult.entry.msgid === msgid &&
		(contextResult.entry.msgctxt ?? null) === (msgctxt ?? null)
	) {
		return contextResult.entry;
	}

	return (
		contextResult.alternatives.find(
			(alternative) =>
				alternative.msgid === msgid && (alternative.msgctxt ?? null) === (msgctxt ?? null)
		) ?? null
	);
}

export function getEntryOriginalValue(
	contextResult: TranslationContextResult | null,
	msgid: string,
	msgctxt: string | null
) {
	return findContextEntry(contextResult, msgid, msgctxt)?.msgstr?.[0] ?? "";
}

export function getEntryOrigin(
	contextResult: TranslationContextResult | null,
	msgid: string,
	msgctxt: string | null
): TranslationOrigin | null {
	return findContextEntry(contextResult, msgid, msgctxt)?.translationOrigin ?? null;
}

export function getCandidateList(contextResult: TranslationContextResult | null): TranslationCandidate[] {
	if (!contextResult) return [];

	return [
		{
			msgid: contextResult.entry.msgid,
			msgctxt: contextResult.entry.msgctxt,
			translationOrigin: contextResult.entry.translationOrigin ?? null,
			hasTranslation: contextResult.entry.hasTranslation ?? false,
			isFuzzy: contextResult.entry.isFuzzy ?? null
		},
		...contextResult.alternatives.map((alternative) => ({
			msgid: alternative.msgid,
			msgctxt: alternative.msgctxt,
			translationOrigin: alternative.translationOrigin ?? null,
			hasTranslation: alternative.hasTranslation,
			isFuzzy: alternative.isFuzzy ?? null
		}))
	];
}

export function getTranslationStatus(item: {
	isCommittedToWorking?: boolean;
	matchesTargetTranslation?: boolean;
	hasTranslation?: boolean;
	isFuzzy?: boolean | null;
	translationStatus?: TranslationStatus | null;
}) {
	if (item.translationStatus === "out_of_sync") return "\u26A0\uFE0F";
	if (item.translationStatus === "fuzzy" || item.isFuzzy) return "\u{1F914}";
	if (item.translationStatus === "working" || item.isCommittedToWorking) return "\u{1F6E0}\uFE0F";
	if (item.translationStatus === "none" || !item.hasTranslation) return "\u274C";
	return "\u2705";
}

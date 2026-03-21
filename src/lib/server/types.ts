export type TranslationOrigin = "base" | "working";
export type TranslationStatus = "base" | "working" | "none" | "fuzzy" | "out_of_sync";

export type CommitBatchItem = {
	resolvedMsgid: string;
	resolvedMsgctxt: string | null;
	translationValue: string;
};

export type PoComment = {
	reference?: string;
	extracted?: string;
	flag?: string;
	previous?: string;
};

export type PoTranslationEntry = {
	msgid?: string;
	msgid_plural?: string;
	msgstr?: string[];
	msgctxt?: string;
	comments?: PoComment;
	obsolete?: boolean;
};

export type NormalizedEntry = {
	msgid: string;
	msgctxt: string | null;
	msgidPlural: string | null;
	msgstr: string[];
	references: string[];
	extractedComments: string[];
	flags: string[];
	previous: string[];
	obsolete: boolean;
	searchText: string;
	searchTokens: string[];
	hasTranslation: boolean;
	isFuzzy: boolean | undefined;
	translationOrigin: TranslationOrigin;
};

export type CatalogIntegrityIssue =
	| {
			type: "key_mismatch";
			msgid: string;
			msgctxt: string | null;
			reason: "missing_in_working" | "missing_in_base";
	  }
	| {
			type: "missing_working_translation";
			msgid: string;
			msgctxt: string | null;
			baseValue: string;
	  };

export type RotationImpactItem = {
	msgid: string;
	msgctxt: string | null;
	baseValue: string;
	workingValue: string;
};

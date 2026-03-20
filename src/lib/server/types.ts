export type TranslationOrigin = "base" | "working";

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

import type { RequestHandler } from "@sveltejs/kit";

export type TranslationOrigin = "base" | "working";

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
	translationOrigin?: TranslationOrigin | null;
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
	translationOrigin?: TranslationOrigin | null;
};

export type TranslationContextResult = {
	match: {
		score: number;
		via: string;
	};
	entry: TranslationEntry;
	alternatives: TranslationAlternative[];
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
	suggestionModel: SuggestionModelConfig;
	apiKey: string | undefined;
};

export type SuggestionProvider = (
	input: SuggestionProviderInput
) => Promise<SuggestionResponseItem[]>;

export type AngyConfigInput = {
	basePoPath: string;
	workingPoPath: string;
	sourceLocale: string;
	targetLocale: string;
	routePath?: string;
	apiKey?: string;
	systemMessage?: string;
	suggestionModel?: SuggestionModelConfig;
	watchIgnore?: string[];
	suggestionProvider?: SuggestionProvider;
};

export type SuggestionModelConfig =
	| { model: "gpt-4.1"; reasoning?: null }
	| { model: "gpt-4.1-mini"; reasoning?: null }
	| { model: "gpt-4.1-nano"; reasoning?: null }
	| {
			model: "gpt-5.4" | "gpt-5.4-mini" | "gpt-5.4-nano" | "gpt-5.2";
			reasoning?: "none" | "low" | "medium" | "high" | "xhigh";
	  }
	| {
			model: "gpt-5.1";
			reasoning?: "none" | "low" | "medium" | "high";
	  }
	| {
			model: "gpt-5";
			reasoning?: "minimal" | "low" | "medium" | "high";
	  }
	| {
			model: "gpt-5-pro";
			reasoning?: "high";
	  }
	| {
			model: "gpt-5.2-pro" | "gpt-5.4-pro";
			reasoning?: "medium" | "high" | "xhigh";
	  };

export type AngyResolvedConfig = {
	basePoPath: string;
	workingPoPath: string;
	sourceLocale: string;
	targetLocale: string;
	routePath: string;
	apiKey: string;
	systemMessage: string;
	suggestionModel: SuggestionModelConfig;
	watchIgnore: string[];
	suggestionProvider?: SuggestionProvider;
};

export declare function defineAngyConfig(config: AngyConfigInput): AngyResolvedConfig;

export declare const handler: RequestHandler;

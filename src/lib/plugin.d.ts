import type { Plugin } from "vite";
import {
	defineAngyConfig,
	type AngyConfigInput,
	type AngyResolvedConfig,
	type SuggestionProvider,
	type SuggestionProviderInput,
	type SuggestionRequestItem,
	type SuggestionResponseItem
} from "./server";

export type AngyPluginOptions = {
	config?: Partial<AngyResolvedConfig>;
};

export declare function angy(options?: AngyPluginOptions): Plugin;

export {
	defineAngyConfig,
	type AngyConfigInput,
	type AngyResolvedConfig,
	type SuggestionProvider,
	type SuggestionProviderInput,
	type SuggestionRequestItem,
	type SuggestionResponseItem
};

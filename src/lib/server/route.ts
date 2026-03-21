import { json, type RequestHandler } from "@sveltejs/kit";
import {
	handleCommit,
	handleCommitBatch,
	handlePromoteWorkingPreview,
	handleRotateCatalogs,
	handleRotatePreflight
} from "./commit.ts";
import {
	configureTranslationHelper,
	loadAngyConfigFromRoot,
	normalizeTranslationHelperConfig,
	type TranslationHelperConfig
} from "./config.ts";
import { handleContext } from "./context.ts";
import { handleSuggestions } from "./suggestions.ts";

export async function handleTranslationRequest(
	request: Request,
	url: URL,
	options?: { devOnly?: boolean; config?: Partial<TranslationHelperConfig>; dev?: boolean }
) {
	const devOnly = options?.devOnly ?? true;
	const runtimeDev =
		typeof import.meta !== "undefined" &&
		typeof import.meta.env !== "undefined" &&
		import.meta.env.DEV === true;
	const isDev = options?.dev ?? runtimeDev;

	if (devOnly && !isDev) {
		return json(
			{
				success: false,
				error: "Disabled outside dev"
			},
			{ status: 404 }
		);
	}

	if (options?.config) {
		configureTranslationHelper(normalizeTranslationHelperConfig(process.cwd(), options.config));
	} else {
		await loadAngyConfigFromRoot(process.cwd());
	}

	const intent = url.searchParams.get("intent") ?? "commit";

	if (intent === "commit-batch") {
		return handleCommitBatch(request);
	}

	if (intent === "context") {
		return handleContext(request);
	}

	if (intent === "suggestions") {
		return handleSuggestions(request);
	}

	if (intent === "rotate-catalogs") {
		return handleRotateCatalogs(request);
	}

	if (intent === "rotate-preflight") {
		return handleRotatePreflight();
	}

	if (intent === "promote-working-preview") {
		return handlePromoteWorkingPreview();
	}

	return handleCommit(request);
}

function createAngyHandler(
	options?: { devOnly?: boolean; config?: Partial<TranslationHelperConfig> }
): RequestHandler {
	return async ({ request, url }) => handleTranslationRequest(request, url, options);
}

export const handler = createAngyHandler();

export {
	defineAngyConfig,
	type AngyConfigInput,
	type SuggestionProvider,
	type SuggestionProviderInput,
	type SuggestionRequestItem,
	type SuggestionResponseItem
} from "./config.ts";
export {
	CatalogIntegrityError,
	collectCatalogIntegrityIssues,
	collectRotationImpact,
	getRotationPreflight,
	readCatalogPair,
	resolveTranslationState
} from "./catalog.ts";

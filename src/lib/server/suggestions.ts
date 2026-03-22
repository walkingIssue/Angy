import { json } from "@sveltejs/kit";
import type { TranslationContextResult } from "../client/toggleQA.shared";
import type {
	SuggestionModelConfig,
	SuggestionRequestItem,
	SuggestionResponseItem
} from "./config.ts";
import { getTranslationHelperConfig } from "./config.ts";

function getEntriesForSuggestions(contextResult: TranslationContextResult) {
	return [contextResult.entry, ...contextResult.alternatives];
}

function getTranslatedExamples(contextResult: TranslationContextResult) {
	return getEntriesForSuggestions(contextResult)
		.filter((entry) => entry.hasTranslation && entry.msgstr?.[0])
		.slice(0, 30)
		.map((entry) => ({
			msgid: entry.msgid,
			msgctxt: entry.msgctxt,
			translation: entry.msgstr[0]
		}));
}

function buildUserMessage(
	contextResult: TranslationContextResult,
	items: SuggestionRequestItem[]
) {
	return JSON.stringify(
		{
			task: "Return translation suggestions for the untranslated UI strings.",
			output_format: {
				items: [
					{
						msgid: "source string",
						msgctxt: "optional context or null",
						suggestion: "translated suggestion"
					}
				]
			},
			translated_examples: getTranslatedExamples(contextResult),
			untranslated_items: items
		},
		null,
		2
	);
}

function parseSuggestions(responseText: string): SuggestionResponseItem[] {
	try {
		const parsed = JSON.parse(responseText);
		const items = Array.isArray(parsed?.items) ? parsed.items : [];
		return items.filter(
			(item): item is SuggestionResponseItem =>
				typeof item?.msgid === "string" &&
				(item.msgctxt === null || typeof item.msgctxt === "string") &&
				typeof item?.suggestion === "string"
		);
	} catch {
		return [];
	}
}

export function buildSuggestionRequestBody({
	context,
	items,
	modelConfig,
	systemMessage
}: {
	context: TranslationContextResult;
	items: SuggestionRequestItem[];
	modelConfig: SuggestionModelConfig;
	systemMessage: string;
}) {
	const body: Record<string, unknown> = {
		model: modelConfig.model,
		input: [
			{
				role: "system",
				content: [{ type: "input_text", text: systemMessage }]
			},
			{
				role: "user",
				content: [{ type: "input_text", text: buildUserMessage(context, items) }]
			}
		],
		text: {
			format: {
				type: "json_schema",
				name: "translation_suggestions",
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						items: {
							type: "array",
							items: {
								type: "object",
								additionalProperties: false,
								properties: {
									msgid: { type: "string" },
									msgctxt: { type: ["string", "null"] },
									suggestion: { type: "string" }
								},
								required: ["msgid", "msgctxt", "suggestion"]
							}
						}
					},
					required: ["items"]
				}
			}
		}
	};

	if (modelConfig.reasoning && modelConfig.reasoning !== "none") {
		body.reasoning = {
			effort: modelConfig.reasoning
		};
	}

	return body;
}

export async function handleSuggestions(request: Request) {
	const {
		apiKey,
		suggestionModel,
		systemMessage,
		sourceLocale,
		targetLocale,
		suggestionProvider
	} = getTranslationHelperConfig();

	const data = await request.json().catch(() => null);
	const context = data?.context as TranslationContextResult | undefined;
	const items = Array.isArray(data?.items) ? (data.items as SuggestionRequestItem[]) : [];

	if (!context || !items.length) {
		return json(
			{
				success: false,
				error: "context and items are required"
			},
			{ status: 400 }
		);
	}

	if (suggestionProvider) {
		const providedItems = await suggestionProvider({
			context,
			items,
			sourceLocale,
			targetLocale,
			systemMessage,
			suggestionModel,
			apiKey
		});

		return json({
			success: true,
			items: providedItems
		});
	}

	if (!apiKey.trim()) {
		console.warn("[angy] Suggestions disabled because apiKey is empty.");
		return json({
			success: true,
			disabled: true,
			items: []
		});
	}

	try {
		console.info("[angy] Suggestion request starting.", {
			model: suggestionModel.model,
			reasoning: suggestionModel.reasoning ?? null,
			sourceLocale,
			targetLocale,
			itemCount: items.length,
			hasApiKey: Boolean(apiKey.trim())
		});

		const response = await fetch("https://api.openai.com/v1/responses", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"content-type": "application/json"
			},
			body: JSON.stringify(
				buildSuggestionRequestBody({
					context,
					items,
					modelConfig: suggestionModel,
					systemMessage
				})
			)
		});

		if (!response.ok) {
			const errorBody = await response.text().catch(() => "");
			console.error("[angy] Suggestion request failed.", {
				status: response.status,
				statusText: response.statusText,
				body: errorBody
			});

			return json(
				{
					success: false,
					error: `Suggestion request failed: ${response.status}`
				},
				{ status: 502 }
			);
		}

		const responseJson = await response.json();
	const responseText =
		responseJson?.output_text ??
		responseJson?.output
			?.flatMap((item: any) => item?.content ?? [])
			.find((part: any) => part?.text)?.text ??
		"";

		return json({
			success: true,
			items: parseSuggestions(responseText)
		});
	} catch (error) {
		console.error("[angy] Suggestion request threw.", error);
		return json(
			{
				success: false,
				error: "Suggestion request failed before reaching the model"
			},
			{ status: 502 }
		);
	}
}

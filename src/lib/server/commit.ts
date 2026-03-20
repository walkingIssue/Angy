import { json } from "@sveltejs/kit";
import {
	ensureWorkingCatalog,
	readParsedCatalog,
	removeFuzzyFlag,
	rotateCatalogs,
	runtimeTranslations,
	writeWorkingCatalog
} from "./catalog.ts";
import type { CommitBatchItem, PoTranslationEntry } from "./types.ts";

function runtimeKey(msgid: string, msgctxt: string | null) {
	return `${msgctxt ?? ""}::${msgid}`;
}

export async function writeTranslationToWorkingCatalog(
	resolvedMsgid: string,
	resolvedMsgctxt: string | null,
	translationValue: string
) {
	await ensureWorkingCatalog();

	const [baseParsed, workingParsed] = await Promise.all([
		readParsedCatalog("base"),
		readParsedCatalog("working")
	]);

	if (!baseParsed || !workingParsed) {
		return { ok: false as const, error: "Unable to load catalogs" };
	}

	const baseTranslations = baseParsed.translations ?? {};
	const workingTranslations = workingParsed.translations ?? {};

	const ctxKey = resolvedMsgctxt ?? "";
	const baseGroup = baseTranslations[ctxKey];
	if (!baseGroup) {
		return { ok: false as const, error: "Context group not found in base catalog" };
	}

	const baseEntry = baseGroup[resolvedMsgid] as PoTranslationEntry | undefined;
	if (!baseEntry) {
		return { ok: false as const, error: "Target msgid not found in base catalog" };
	}

	const workingGroup = (workingTranslations[ctxKey] ??= {});
	const entry = ((workingGroup[resolvedMsgid] as PoTranslationEntry | undefined) ??=
		cloneEntryForWorking(baseEntry, resolvedMsgid, resolvedMsgctxt));

	entry.msgstr = [translationValue];
	entry.comments ??= {};
	entry.comments.flag = removeFuzzyFlag(entry.comments.flag);

	await writeWorkingCatalog(workingParsed);

	runtimeTranslations.set(runtimeKey(resolvedMsgid, resolvedMsgctxt), translationValue);

	return {
		ok: true as const,
		msgid: resolvedMsgid,
		msgctxt: resolvedMsgctxt,
		workingCatalog: "en-working.po"
	};
}

function cloneEntryForWorking(
	baseEntry: PoTranslationEntry,
	msgid: string,
	msgctxt: string | null
): PoTranslationEntry {
	return {
		msgid,
		msgctxt: msgctxt ?? undefined,
		msgid_plural: baseEntry.msgid_plural,
		msgstr: Array.isArray(baseEntry.msgstr) ? [...baseEntry.msgstr] : [""],
		obsolete: Boolean(baseEntry.obsolete),
		comments: baseEntry.comments
			? {
					reference: baseEntry.comments.reference,
					extracted: baseEntry.comments.extracted,
					flag: baseEntry.comments.flag,
					previous: baseEntry.comments.previous
				}
			: undefined
	};
}

export async function handleCommitBatch(request: Request) {
	const data = await request.json().catch(() => null);
	const items = Array.isArray(data?.items) ? (data.items as CommitBatchItem[]) : [];

	if (!items.length) {
		return json(
			{
				success: false,
				error: "No items to commit"
			},
			{ status: 400 }
		);
	}

	const results: Array<{ msgid: string; msgctxt: string | null; ok: boolean; error?: string }> = [];

	for (const item of items) {
		const resolvedMsgid = item.resolvedMsgid?.trim();
		const resolvedMsgctxt =
			item.resolvedMsgctxt && item.resolvedMsgctxt.trim().length > 0
				? item.resolvedMsgctxt.trim()
				: null;
		const translationValue = item.translationValue?.trim();

		if (!resolvedMsgid || !translationValue) {
			results.push({
				msgid: resolvedMsgid ?? "",
				msgctxt: resolvedMsgctxt,
				ok: false,
				error: "resolvedMsgid and translationValue are required"
			});
			continue;
		}

		const result = await writeTranslationToWorkingCatalog(
			resolvedMsgid,
			resolvedMsgctxt,
			translationValue
		);

		if (!result.ok) {
			results.push({
				msgid: resolvedMsgid,
				msgctxt: resolvedMsgctxt,
				ok: false,
				error: result.error
			});
			continue;
		}

		results.push({
			msgid: resolvedMsgid,
			msgctxt: resolvedMsgctxt,
			ok: true
		});
	}

	const failed = results.filter((item) => !item.ok);
	if (failed.length) {
		return json(
			{
				success: false,
				error: "Some translations failed to commit",
				results
			},
			{ status: 207 }
		);
	}

	return json({
		success: true,
		message: `Committed ${results.length} translations to en-working.po`,
		results
	});
}

export async function handleCommit(request: Request) {
	const data = await request.formData();
	const resolvedMsgid = data.get("resolvedMsgid")?.toString().trim();
	const resolvedMsgctxtRaw = data.get("resolvedMsgctxt")?.toString();
	const translationValue = data.get("translationValue")?.toString().trim();
	const resolvedMsgctxt =
		resolvedMsgctxtRaw && resolvedMsgctxtRaw.trim().length > 0
			? resolvedMsgctxtRaw.trim()
			: null;

	if (!resolvedMsgid || !translationValue) {
		return json(
			{
				success: false,
				error: "resolvedMsgid and translationValue are required"
			},
			{ status: 400 }
		);
	}

	const result = await writeTranslationToWorkingCatalog(
		resolvedMsgid,
		resolvedMsgctxt,
		translationValue
	);

	if (!result.ok) {
		return json(
			{
				success: false,
				error: result.error
			},
			{ status: 404 }
		);
	}

	return json({
		success: true,
		message: "Translation written to en-working.po",
		msgid: result.msgid,
		msgctxt: result.msgctxt,
		workingCatalog: result.workingCatalog
	});
}

export async function handleRotateCatalogs() {
	const result = await rotateCatalogs();

	if (!result.ok) {
		return json(
			{
				success: false,
				error: result.error
			},
			{ status: 400 }
		);
	}

	return json({
		success: true,
		message: "Catalogs rotated",
		basePoPath: result.basePoPath,
		workingPoPath: result.workingPoPath,
		baseBackupPath: result.baseBackupPath,
		workingBackupPath: result.workingBackupPath
	});
}

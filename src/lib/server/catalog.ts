import { constants as fsConstants } from "node:fs";
import { access, copyFile, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, basename } from "node:path";
import gettextParser from "gettext-parser";
import Fuse from "fuse.js";
import type {
	CatalogIntegrityIssue,
	NormalizedEntry,
	PoTranslationEntry,
	RotationImpactItem,
	TranslationOrigin,
	TranslationStatus
} from "./types.ts";
import { getTranslationHelperConfig, suspendWorkingCatalogWatch } from "./config.ts";

export const runtimeTranslations = new Map<string, string>();

export class CatalogIntegrityError extends Error {
	issues: CatalogIntegrityIssue[];

	constructor(message: string, issues: CatalogIntegrityIssue[]) {
		super(message);
		this.name = "CatalogIntegrityError";
		this.issues = issues;
	}
}

type CatalogPair = {
	baseEntries: NormalizedEntry[];
	workingEntries: NormalizedEntry[];
	baseMap: Map<string, NormalizedEntry>;
	workingMap: Map<string, NormalizedEntry>;
	rotationImpact: RotationImpactItem[];
};

export function catalogEntryKey(msgid: string, msgctxt: string | null) {
	return `${msgctxt ?? ""}::${msgid}`;
}

export function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

export function normalizeForLookup(value: string): string {
	return normalizeWhitespace(value)
		.replace(/<\/?[a-z][^>]*>/gi, "<x>")
		.replace(/<\/?\d+>/g, "<x>")
		.replace(/\{\{?\s*[^}]+\s*\}?\}/g, "{0}")
		.replace(/\{\d+\}/g, "{0}")
		.replace(/[""'`Â´]/g, "'")
		.toLowerCase();
}

export function tokenizeForLookup(value: string): string[] {
	return normalizeForLookup(value)
		.split(/[\s,.;:!?()[\]{}]+/)
		.map((token) => token.trim())
		.filter(Boolean);
}

export function buildLookupVariants(raw: string): string[] {
	const normalized = normalizeForLookup(raw);
	const variants = new Set<string>([normalized]);

	variants.add(normalized.replace(/<x>/g, "<0>"));
	variants.add(normalized.replace(/<x>/g, "").replace(/\s+/g, " ").trim());
	variants.add(normalized.replace(/\{0\}/g, "").replace(/\s+/g, " ").trim());

	return [...variants].filter(Boolean);
}

export function flattenPoEntries(parsed: any, translationOrigin: TranslationOrigin): NormalizedEntry[] {
	const entries: NormalizedEntry[] = [];
	const translations = parsed?.translations ?? {};

	for (const [ctxKey, group] of Object.entries(translations)) {
		for (const [msgidKey, raw] of Object.entries(group as Record<string, unknown>)) {
			if (!msgidKey) continue;

			const entry = raw as PoTranslationEntry;
			const msgid = entry.msgid ?? msgidKey;
			const msgctxt = entry.msgctxt ?? (ctxKey === "" ? null : ctxKey);
			const msgidPlural = entry.msgid_plural ?? null;
			const msgstr = Array.isArray(entry.msgstr) ? entry.msgstr.filter(Boolean) : [];
			const references = entry.comments?.reference
				? entry.comments.reference.split("\n").map((item) => item.trim()).filter(Boolean)
				: [];
			const extractedComments = entry.comments?.extracted
				? entry.comments.extracted.split("\n").map((item) => item.trim()).filter(Boolean)
				: [];
			const flags = entry.comments?.flag
				? entry.comments.flag.split(",").map((item) => item.trim()).filter(Boolean)
				: [];
			const previous = entry.comments?.previous
				? entry.comments.previous.split("\n").map((item) => item.trim()).filter(Boolean)
				: [];
			const translated = entry.msgstr?.some((item) => item.trim().length > 0) ?? false;
			const fuzzy = entry.comments?.flag?.includes("fuzzy");

			entries.push({
				msgid,
				msgctxt,
				msgidPlural,
				msgstr,
				references,
				extractedComments,
				flags,
				previous,
				obsolete: Boolean(entry.obsolete),
				searchText: normalizeForLookup(msgid),
				searchTokens: tokenizeForLookup(msgid),
				isFuzzy: fuzzy,
				hasTranslation: translated,
				translationOrigin
			});
		}
	}

	return entries;
}

export function createFuse(entries: NormalizedEntry[]) {
	return new Fuse(entries, {
		includeScore: true,
		ignoreLocation: true,
		threshold: 0.34,
		minMatchCharLength: 2,
		keys: [
			{ name: "msgid", weight: 0.7 },
			{ name: "searchText", weight: 0.2 },
			{ name: "references", weight: 0.1 }
		]
	});
}

export function buildEntryMap(entries: NormalizedEntry[]) {
	return new Map(entries.map((entry) => [catalogEntryKey(entry.msgid, entry.msgctxt), entry]));
}

export function getEntryValue(entry?: Pick<NormalizedEntry, "msgstr"> | null) {
	if (!entry?.msgstr?.length) return "";
	return entry.msgstr.find((item) => item.trim().length > 0)?.trim() ?? "";
}

export function applyWorkingState(
	baseEntry: NormalizedEntry,
	workingEntry?: NormalizedEntry
): NormalizedEntry {
	if (!workingEntry) {
		return baseEntry;
	}

	return {
		...baseEntry,
		msgstr: workingEntry.msgstr,
		flags: workingEntry.flags,
		previous: workingEntry.previous,
		obsolete: workingEntry.obsolete,
		hasTranslation: workingEntry.hasTranslation,
		isFuzzy: workingEntry.isFuzzy,
		translationOrigin: workingEntry.translationOrigin
	};
}

export async function fileExists(path: string) {
	try {
		await access(path, fsConstants.F_OK);
		return true;
	} catch {
		return false;
	}
}

export async function readCatIndex(catalog: TranslationOrigin) {
	const { basePoPath } = getTranslationHelperConfig();
	let path = "";

	if (catalog === "base") {
		path = basePoPath;
	} else {
		path = await getEffectiveWorkingPoPath();
		const exists = await fileExists(path);
		if (!exists) return null;
	}

	const raw = await readFile(path);
	const parsed = gettextParser.po.parse(raw);
	const entries = flattenPoEntries(parsed, catalog);

	return {
		entries,
		fuse: createFuse(entries)
	};
}

export async function readParsedCatalog(catalog: TranslationOrigin) {
	const { basePoPath } = getTranslationHelperConfig();
	const path = catalog === "base" ? basePoPath : await getEffectiveWorkingPoPath();

	if (catalog === "working") {
		const exists = await fileExists(path);
		if (!exists) return null;
	}

	const raw = await readFile(path);
	return gettextParser.po.parse(raw);
}

export async function ensureWorkingCatalog() {
	const { basePoPath, workingPoPath } = getTranslationHelperConfig();
	const exists = await fileExists(workingPoPath);
	if (!exists) {
		await copyFile(basePoPath, workingPoPath);
	}
}

export function getWorkingDraftPoPath() {
	const { workingPoPath } = getTranslationHelperConfig();
	const extension = extname(workingPoPath);
	const stem = workingPoPath.slice(0, workingPoPath.length - extension.length);
	return `${stem}.angy-draft${extension}`;
}

async function getEffectiveWorkingPoPath() {
	const draftPoPath = getWorkingDraftPoPath();
	if (await fileExists(draftPoPath)) {
		return draftPoPath;
	}

	return getTranslationHelperConfig().workingPoPath;
}

export async function ensureWorkingDraftCatalog() {
	await ensureWorkingCatalog();

	const { workingPoPath } = getTranslationHelperConfig();
	const draftPoPath = getWorkingDraftPoPath();
	const exists = await fileExists(draftPoPath);
	if (!exists) {
		await copyFile(workingPoPath, draftPoPath);
	}
}

export function removeFuzzyFlag(flagString?: string) {
	if (!flagString) return "";

	return flagString
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)
		.filter((item) => item !== "fuzzy")
		.join(", ");
}

export async function writeWorkingCatalog(parsed: any) {
	await ensureWorkingDraftCatalog();
	const draftPoPath = getWorkingDraftPoPath();
	const compiled = gettextParser.po.compile(parsed);
	await writeFile(draftPoPath, compiled);
}

export async function promoteWorkingDraftToRuntime() {
	await ensureWorkingDraftCatalog();

	const { workingPoPath } = getTranslationHelperConfig();
	const draftPoPath = getWorkingDraftPoPath();
	const publishPath = `${workingPoPath}.angy-publish`;
	const compiled = await readFile(draftPoPath);

	suspendWorkingCatalogWatch(workingPoPath);
	await writeFile(publishPath, compiled);
	await rm(workingPoPath, { force: true });
	await rename(publishPath, workingPoPath);
}

export function collectCatalogIntegrityIssues(
	baseEntries: NormalizedEntry[],
	workingEntries: NormalizedEntry[]
) {
	const issues: CatalogIntegrityIssue[] = [];
	const baseMap = buildEntryMap(baseEntries);
	const workingMap = buildEntryMap(workingEntries);

	for (const baseEntry of baseEntries) {
		const key = catalogEntryKey(baseEntry.msgid, baseEntry.msgctxt);
		const workingEntry = workingMap.get(key);
		if (!workingEntry) {
			issues.push({
				type: "key_mismatch",
				msgid: baseEntry.msgid,
				msgctxt: baseEntry.msgctxt,
				reason: "missing_in_working"
			});
			continue;
		}

		const baseValue = getEntryValue(baseEntry);
		const workingValue = getEntryValue(workingEntry);
		if (baseValue && !workingValue) {
			issues.push({
				type: "missing_working_translation",
				msgid: baseEntry.msgid,
				msgctxt: baseEntry.msgctxt,
				baseValue
			});
		}
	}

	for (const workingEntry of workingEntries) {
		const key = catalogEntryKey(workingEntry.msgid, workingEntry.msgctxt);
		if (!baseMap.has(key)) {
			issues.push({
				type: "key_mismatch",
				msgid: workingEntry.msgid,
				msgctxt: workingEntry.msgctxt,
				reason: "missing_in_base"
			});
		}
	}

	return issues;
}

export function assertCatalogIntegrity(baseEntries: NormalizedEntry[], workingEntries: NormalizedEntry[]) {
	const issues = collectCatalogIntegrityIssues(baseEntries, workingEntries);
	if (issues.length) {
		throw new CatalogIntegrityError(
			"Working catalog is out of sync with the base catalog. Regenerate or replace the working catalog before using Angy.",
			issues
		);
	}
}

export function collectRotationImpact(
	baseEntries: NormalizedEntry[],
	workingMap: Map<string, NormalizedEntry>
) {
	const impacted: RotationImpactItem[] = [];

	for (const baseEntry of baseEntries) {
		const workingEntry = workingMap.get(catalogEntryKey(baseEntry.msgid, baseEntry.msgctxt));
		if (!workingEntry) continue;

		const baseValue = getEntryValue(baseEntry);
		const workingValue = getEntryValue(workingEntry);
		if (!workingValue) continue;
		if (baseValue === workingValue) continue;

		impacted.push({
			msgid: baseEntry.msgid,
			msgctxt: baseEntry.msgctxt,
			baseValue,
			workingValue
		});
	}

	return impacted;
}

export function resolveTranslationState(
	baseEntry: NormalizedEntry,
	workingEntry?: NormalizedEntry
) {
	const baseValue = getEntryValue(baseEntry);
	const workingValue = getEntryValue(workingEntry);
	const activeEntry = workingEntry && workingValue ? workingEntry : baseEntry;
	const fuzzy = Boolean(activeEntry.isFuzzy);
	let translationOrigin: TranslationOrigin = "base";
	let translationStatus: TranslationStatus = "none";
	let effectiveEntry = baseEntry;

	if (workingEntry && workingValue) {
		effectiveEntry = workingEntry;
		if (!baseValue || workingValue !== baseValue) {
			translationOrigin = "working";
			translationStatus = "working";
		} else {
			translationOrigin = "base";
			translationStatus = "base";
		}
	} else if (baseValue) {
		effectiveEntry = baseEntry;
		translationOrigin = "base";
		translationStatus = "base";
	}

	if (fuzzy) {
		translationStatus = "fuzzy";
	}

	return {
		effectiveEntry,
		baseValue,
		workingValue,
		translationOrigin,
		translationStatus,
		hasTranslation: Boolean(getEntryValue(effectiveEntry)),
		isFuzzy: fuzzy
	};
}

export async function readCatalogPair(options?: { ensureWorking?: boolean }): Promise<CatalogPair> {
	if (options?.ensureWorking) {
		await ensureWorkingCatalog();
	}

	const [baseParsed, workingParsed] = await Promise.all([
		readParsedCatalog("base"),
		readParsedCatalog("working")
	]);

	if (!baseParsed || !workingParsed) {
		throw new Error("Unable to load base and working catalogs.");
	}

	const baseEntries = flattenPoEntries(baseParsed, "base");
	const workingEntries = flattenPoEntries(workingParsed, "working");
	assertCatalogIntegrity(baseEntries, workingEntries);

	const baseMap = buildEntryMap(baseEntries);
	const workingMap = buildEntryMap(workingEntries);
	const rotationImpact = collectRotationImpact(baseEntries, workingMap);

	return {
		baseEntries,
		workingEntries,
		baseMap,
		workingMap,
		rotationImpact
	};
}

export async function getRotationPreflight() {
	const { rotationImpact } = await readCatalogPair({ ensureWorking: true });

	return {
		safe: true as const,
		status: "ok" as const,
		affected: rotationImpact
	};
}

function timestampForBackup() {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

function buildBackupPath(path: string, label: string) {
	const directory = dirname(path);
	const extension = extname(path);
	const stem = basename(path, extension);
	return join(directory, `${stem}.${label}.${timestampForBackup()}${extension}`);
}

export async function rotateCatalogs(options?: { allowOutOfSync?: boolean }) {
	const { basePoPath, workingPoPath } = getTranslationHelperConfig();
	const draftPoPath = getWorkingDraftPoPath();
	const effectiveWorkingPoPath = await getEffectiveWorkingPoPath();
	const workingExists = await fileExists(effectiveWorkingPoPath);

	if (!workingExists) {
		return { ok: false as const, error: "Working catalog does not exist" };
	}

	const baseBackupPath = buildBackupPath(basePoPath, "base-backup");
	const workingBackupPath = buildBackupPath(workingPoPath, "working-backup");

	await copyFile(basePoPath, baseBackupPath);
	await copyFile(effectiveWorkingPoPath, workingBackupPath);
	await copyFile(effectiveWorkingPoPath, basePoPath);
	await copyFile(basePoPath, workingPoPath);
	await copyFile(workingPoPath, draftPoPath);

	return {
		ok: true as const,
		basePoPath,
		workingPoPath,
		baseBackupPath,
		workingBackupPath
	};
}

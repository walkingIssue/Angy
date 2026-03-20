import { constants as fsConstants } from "node:fs";
import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, basename } from "node:path";
import gettextParser from "gettext-parser";
import Fuse from "fuse.js";
import type { NormalizedEntry, PoTranslationEntry, TranslationOrigin } from "./types.ts";
import { getTranslationHelperConfig, suspendWorkingCatalogWatch } from "./config.ts";

export const runtimeTranslations = new Map<string, string>();

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
	const { basePoPath, workingPoPath } = getTranslationHelperConfig();
	let path = "";

	if (catalog === "base") {
		path = basePoPath;
	} else {
		const exists = await fileExists(workingPoPath);
		if (!exists) return null;
		path = workingPoPath;
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
	const { basePoPath, workingPoPath } = getTranslationHelperConfig();
	const path = catalog === "base" ? basePoPath : workingPoPath;

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
	const { workingPoPath } = getTranslationHelperConfig();
	suspendWorkingCatalogWatch(workingPoPath);
	const compiled = gettextParser.po.compile(parsed);
	await writeFile(workingPoPath, compiled);
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

export async function rotateCatalogs() {
	const { basePoPath, workingPoPath } = getTranslationHelperConfig();
	const workingExists = await fileExists(workingPoPath);

	if (!workingExists) {
		return { ok: false as const, error: "Working catalog does not exist" };
	}

	const baseBackupPath = buildBackupPath(basePoPath, "base-backup");
	const workingBackupPath = buildBackupPath(workingPoPath, "working-backup");

	await copyFile(basePoPath, baseBackupPath);
	await copyFile(workingPoPath, workingBackupPath);
	await copyFile(workingPoPath, basePoPath);
	await copyFile(basePoPath, workingPoPath);

	return {
		ok: true as const,
		basePoPath,
		workingPoPath,
		baseBackupPath,
		workingBackupPath
	};
}

import {
	defineAngyConfig,
	inferLocaleFromCatalogPath,
	loadAngyConfigFromRoot,
	registerWorkingCatalogWatchController,
	type TranslationHelperUserConfig
} from "./server/config.ts";
import { basename, relative } from "node:path";

type AngyPluginOptions = {
	config?: TranslationHelperUserConfig;
};

export function angy(options: AngyPluginOptions = {}) {
	let root = process.cwd();
	let resolvedConfig: TranslationHelperUserConfig | null = options.config ?? null;
	let unregisterWatchController: (() => void) | null = null;
	const rewatchTimers = new Map<string, ReturnType<typeof setTimeout>>();

	function normalizePath(path: string) {
		return path.replace(/\\/g, "/");
	}

	return {
		name: "angy",
		apply: "serve",
		async config(config: { root?: string }, env: { command: string; mode: string }) {
			root = config.root ? `${process.cwd()}/${config.root}`.replace(/\\/g, "/") : process.cwd().replace(/\\/g, "/");

			if (env.mode !== "development") {
				return;
			}

			resolvedConfig ??= await loadAngyConfigFromRoot(root);
			if (!resolvedConfig) {
				return;
			}

			const watchIgnore = resolvedConfig.watchIgnore ?? ["**/en-working.po"];
			const workingPoPath = normalizePath(resolvedConfig.workingPoPath ?? "");
			const workingPoRelative = workingPoPath
				? normalizePath(relative(root, workingPoPath))
				: "";
			const workingPoName = workingPoPath ? basename(workingPoPath) : "";
			const localeRotation = Array.from(
				new Set(
					[
						resolvedConfig.sourceLocale,
						resolvedConfig.targetLocale,
						workingPoPath ? inferLocaleFromCatalogPath(workingPoPath) : null
					].filter((locale): locale is string => Boolean(locale))
				)
			);
			const filteredWatchIgnore = watchIgnore.filter((pattern) => {
				const normalizedPattern = normalizePath(pattern);
				if (!workingPoPath) return true;
				if (normalizedPattern === workingPoPath || normalizedPattern === workingPoRelative) {
					return false;
				}
				if (workingPoName && normalizedPattern.includes(workingPoName)) {
					return false;
				}
				return true;
			});

			return {
				define: {
					__ANGY_ROUTE_PATH__: JSON.stringify(resolvedConfig.routePath ?? "/api/translations"),
					__ANGY_LOCALES: JSON.stringify(localeRotation)
				},
				optimizeDeps: {
					exclude: ["angy", "angy/client", "angy/plugin", "angy/server"]
				},
				server: {
					watch: {
						ignored: filteredWatchIgnore
					}
				}
			};
		},
		configureServer(server: {
			watcher: { unwatch(path: string): void; add(path: string): void };
		}) {
			unregisterWatchController?.();
			unregisterWatchController = registerWorkingCatalogWatchController((path, delayMs = 800) => {
				const normalizedPath = normalizePath(path);
				const existingTimer = rewatchTimers.get(normalizedPath);
				if (existingTimer) {
					clearTimeout(existingTimer);
				} else {
					server.watcher.unwatch(normalizedPath);
				}

				const timer = setTimeout(() => {
					server.watcher.add(normalizedPath);
					rewatchTimers.delete(normalizedPath);
				}, delayMs);

				rewatchTimers.set(normalizedPath, timer);
			});
		},
		configResolved(config: { root: string; logger?: { warn(message: string): void } }) {
			root = config.root.replace(/\\/g, "/");
			if (!resolvedConfig) {
				config.logger?.warn(
					"[angy] No angy.config.(ts|js|mjs|cjs) found. The helper will stay disabled."
				);
			}
		},
		buildEnd() {
			unregisterWatchController?.();
			unregisterWatchController = null;
			for (const timer of rewatchTimers.values()) {
				clearTimeout(timer);
			}
			rewatchTimers.clear();
		}
	};
}

export { defineAngyConfig };

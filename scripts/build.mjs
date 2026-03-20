import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const srcLib = resolve(root, "src/lib");
const dist = resolve(root, "dist");

async function clean() {
	await rm(dist, { recursive: true, force: true });
	await mkdir(dist, { recursive: true });
}

async function copyClient() {
	await cp(resolve(srcLib, "client"), resolve(dist, "client"), { recursive: true });
}

async function copyTypes() {
	await cp(resolve(srcLib, "server/types.ts"), resolve(dist, "server/types.ts"));
	await cp(resolve(srcLib, "index.d.ts"), resolve(dist, "index.d.ts"));
	await cp(resolve(srcLib, "plugin.d.ts"), resolve(dist, "plugin.d.ts"));
	await cp(resolve(srcLib, "server.d.ts"), resolve(dist, "server.d.ts"));
}

async function buildEntries() {
	await build({
		entryPoints: {
			server: resolve(srcLib, "server/route.ts")
		},
		outdir: dist,
		bundle: true,
		format: "esm",
		platform: "node",
		target: "es2022",
		sourcemap: true,
		external: ["@sveltejs/kit", "svelte", "vite", "esbuild", "gettext-parser", "fuse.js"]
	});

	await build({
		entryPoints: {
			plugin: resolve(srcLib, "plugin.ts")
		},
		outdir: dist,
		bundle: true,
		format: "esm",
		platform: "node",
		target: "es2022",
		sourcemap: false,
		external: ["@sveltejs/kit", "svelte", "vite", "esbuild", "./server.js"]
	});
}

async function writeIndex() {
	const indexSource = [
		`export { default as Angy } from "./client/Angy.svelte";`,
		""
	].join("\n");
	await writeFile(resolve(dist, "index.js"), indexSource, "utf8");
}

await clean();
await copyClient();
await copyTypes();
await buildEntries();
await writeIndex();

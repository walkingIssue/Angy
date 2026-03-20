import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { angy } from "./src/lib/plugin";

export default defineConfig({
	plugins: [angy(), sveltekit()]
});

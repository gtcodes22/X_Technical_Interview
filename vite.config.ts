import { resolve } from "node:path";
import { defineConfig } from "vite";

const webRoot = resolve(import.meta.dirname, "src/web");

// Two static pages: the customer chat and the staff page.
// Output goes to dist/, which is the ONLY folder Netlify publishes.
export default defineConfig({
  root: webRoot,
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        chat: resolve(webRoot, "index.html"),
        staff: resolve(webRoot, "staff.html"),
      },
    },
  },
});

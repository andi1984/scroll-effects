import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "es2020",
  external: ["react", "react/jsx-runtime", "@andi1984/scroll-effects-core"],
  // Everything here touches window/localStorage: client components only.
  banner: { js: '"use client";' },
});

// Type declarations for generate-core-shims.mjs.
// The generator is plain JS (consumed by `npm prepack`) but is also imported
// by `cli/__tests__/core-shims.test.ts` under strict TypeScript. Keeping the
// types here means the script stays runnable without a build step.

export function isShimmable(name: string): boolean;
export function listCoreSources(dir: string): string[];
export function shimBody(tsFilename: string): string;
export function writeShim(dir: string, tsFilename: string): string;
export function generateShims(dir: string): string[];

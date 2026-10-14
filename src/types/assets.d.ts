/**
 * Ambient asset declarations.
 *
 * Next injects `next-env.d.ts` at build time, but that file is generated and
 * git-ignored, so `npm run typecheck` on a fresh clone needs these to resolve
 * side-effect imports of stylesheets (e.g. `import './globals.css'` in the root
 * layout) and any future direct media imports.
 */

declare module '*.css';
declare module '*.scss';
declare module '*.svg' {
  const src: string;
  export default src;
}
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}

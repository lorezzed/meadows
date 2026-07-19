// Ambient declarations for non-TS imports that the bundler (esbuild, loading
// .svg as dataurl) resolves at build time.

declare module '*.svg' {
  const url: string
  export default url
}

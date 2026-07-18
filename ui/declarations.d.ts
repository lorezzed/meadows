// Ambient declarations for non-TS imports that Parcel resolves at build time.

declare module '*.svg' {
  const url: string
  export default url
}

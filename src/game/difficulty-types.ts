// The closed union of the settings object lives here rather than in
// `difficulty.ts` because `analysis/hints.ts` imports `HintMode` and must not pull
// in the preset table and the clamp functions to get it. It is re-exported from
// `difficulty.ts`, so the module that owns the settings shape still owns the name.
//
// There was a second union here, `ThemeName = 'light' | 'dark'`, and it is gone
// with the light theme. One theme means one value, and a "type" with a single
// member is a type that no longer earns its keep — `Settings` simply has no theme
// key to type.

export type HintMode = 'best' | 'good';

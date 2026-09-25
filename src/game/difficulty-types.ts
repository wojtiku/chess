// The two closed unions of the settings object live here rather than in
// `difficulty.ts` because Task 7's `analysis/hints.ts` imports `HintMode` and
// must not pull in the preset table and the clamp functions to get it. Both
// types are re-exported from `difficulty.ts`, so the module that owns the
// settings shape still owns both names.

export type ThemeName = 'light' | 'dark';
export type HintMode = 'best' | 'good';

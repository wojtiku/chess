import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// @testing-library/react only registers its own `afterEach(cleanup)` when the test
// framework exposes `afterEach` as a global. This project imports its test
// functions from 'vitest' rather than turning on globals, so without this every
// render stays in the document and the next test's `getByRole` finds the previous
// test's board as well — which on a 64-button board reads as a duplicate-match
// failure rather than as a leak.
afterEach(cleanup);

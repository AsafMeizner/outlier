// Shared by the throwaway test server (server.ts) and the tests.
import { join } from 'node:path';

export const E2E_DATA = join('test-results', 'e2e-data');
export const SETUP_CODE_FILE = join(E2E_DATA, 'setup-code.txt');

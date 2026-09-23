import type { Memento } from 'vscode';
import {
	CLI_NPM_PACKAGE_URL,
	CLI_VERSION_FETCH_TIMEOUT_MS,
	CLI_VERSION_KEY,
	CLI_VERSION_LAST_CHECKED_KEY,
	CLI_VERSION_UPDATE_INTERVAL_MS,
	DEFAULT_CLI_VERSION,
} from '../consts';
import { logger } from '../logger';

/** In-memory cached CLI spoof version, initialized to the default fixed version. */
let activeCliVersion: string = DEFAULT_CLI_VERSION;

/**
 * Initialize the in-memory CLI spoof version from persisted storage (if any).
 * Returns the resolved version.
 */
export function initCliVersion(globalState: Memento): string {
	const persisted = globalState.get<string>(CLI_VERSION_KEY);
	if (persisted && isValidSemver(persisted)) {
		activeCliVersion = persisted;
		logger.debug(`Loaded persisted Command Code CLI spoof version: ${activeCliVersion}`);
	} else {
		activeCliVersion = DEFAULT_CLI_VERSION;
	}
	return activeCliVersion;
}

/**
 * Get the current Command Code CLI spoof version to attach in API headers.
 */
export function getCliVersion(): string {
	return activeCliVersion;
}

/**
 * Check and update the CLI version from npmjs if more than 24 hours have passed.
 * Times out after 20 seconds. If failed, gracefully abandons and keeps the default/current version.
 */
export async function syncCliVersion(globalState: Memento, force = false): Promise<void> {
	const now = Date.now();
	const lastChecked = globalState.get<number>(CLI_VERSION_LAST_CHECKED_KEY, 0);

	// Check if already updated today (unless force is requested)
	if (!force && now - lastChecked < CLI_VERSION_UPDATE_INTERVAL_MS) {
		const cached = globalState.get<string>(CLI_VERSION_KEY);
		if (cached && isValidSemver(cached)) {
			activeCliVersion = cached;
			return;
		}
	}

	logger.info(
		`Checking latest Command Code CLI version from npmjs (timeout: ${CLI_VERSION_FETCH_TIMEOUT_MS / 1000}s)...`,
	);

	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort();
	}, CLI_VERSION_FETCH_TIMEOUT_MS);

	try {
		const response = await fetch(CLI_NPM_PACKAGE_URL, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
			},
			signal: controller.signal,
		});

		if (!response.ok) {
			logger.warn(`Failed to fetch latest CLI version from npmjs: HTTP ${response.status}`);
			return;
		}

		const data = (await response.json()) as { version?: unknown };
		const version = data?.version;

		if (typeof version === 'string' && isValidSemver(version)) {
			activeCliVersion = version;
			await globalState.update(CLI_VERSION_KEY, version);
			await globalState.update(CLI_VERSION_LAST_CHECKED_KEY, now);
			logger.info(`Command Code CLI spoof version updated to ${version} (persisted)`);
		} else {
			logger.warn(`Invalid version received from npmjs: ${String(version)}`);
		}
	} catch (error) {
		logger.warn(
			'Failed to fetch latest CLI version from npmjs within 20s; using fallback version',
			error,
		);
	} finally {
		clearTimeout(timer);
	}
}

function isValidSemver(version: string): boolean {
	return /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(version.trim());
}

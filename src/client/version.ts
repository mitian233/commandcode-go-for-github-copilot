import type { Memento } from 'vscode';
import {
	CLI_NPM_PACKAGE_URL,
	CLI_VERSION_DATE_KEY,
	CLI_VERSION_FETCH_TIMEOUT_MS,
	CLI_VERSION_KEY,
	DEFAULT_CLI_VERSION,
} from '../consts';
import { logger } from '../logger';

/** In-memory cached CLI spoof version, initialized to the default fixed version. */
let activeCliVersion: string = DEFAULT_CLI_VERSION;

/**
 * Get current date string formatted as YYYY-MM-DD.
 */
export function getTodayDateString(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

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
 * Check globalState when the extension starts.
 * If the record does not exist or the stored date does not match today's date,
 * fetch the latest version from npmjs within 20s and update globalState.
 */
export async function syncCliVersion(globalState: Memento, force = false): Promise<void> {
	const today = getTodayDateString();
	const savedDate = globalState.get<string>(CLI_VERSION_DATE_KEY);
	const savedVersion = globalState.get<string>(CLI_VERSION_KEY);

	// If already synced for today and valid, reuse it without requesting npmjs
	if (!force && savedDate === today && savedVersion && isValidSemver(savedVersion)) {
		activeCliVersion = savedVersion;
		logger.debug(`Command Code CLI version for today (${today}) is up-to-date: ${savedVersion}`);
		return;
	}

	logger.info(
		`Checking latest Command Code CLI version from npmjs for date ${today} (timeout: ${CLI_VERSION_FETCH_TIMEOUT_MS / 1000}s)...`,
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
			await globalState.update(CLI_VERSION_DATE_KEY, today);
			logger.info(`Command Code CLI spoof version updated to ${version} (date: ${today})`);
		} else {
			logger.warn(`Invalid version format received from npmjs: ${String(version)}`);
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

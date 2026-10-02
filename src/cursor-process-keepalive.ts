import http from "node:http";
import https from "node:https";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Wait for in-flight Agent Observability / OTLP HTTP before print-mode process.exit. */
export const PRINT_MODE_EXIT_FLUSH_MS = 2_000;

/**
 * Drop leftover Node HTTP keep-alive sockets after a terminal pi quit.
 * Skip this on reload/switch and on print/json quit: those modes still need
 * HTTPS for other extensions (for example Agent Observability) before exit.
 */
export function destroyCursorProcessKeepAliveHandles(env: NodeJS.ProcessEnv = process.env): void {
	if (env.VITEST) return;
	http.globalAgent.destroy();
	https.globalAgent.destroy();
}

export function shouldExitAfterPrintModeShutdown(
	reason: string,
	mode: ExtensionContext["mode"],
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	if (env.VITEST) return false;
	if (reason !== "quit") return false;
	return mode === "print" || mode === "json";
}

export function shouldDestroyKeepAliveHandlesOnShutdown(
	reason: string,
	mode: ExtensionContext["mode"],
): boolean {
	if (reason !== "quit") return false;
	return mode !== "print" && mode !== "json";
}

/**
 * Pi print/json modes do not `process.exit()` after a successful run. Cursor SDK
 * local-executor dispose can leave private ConnectRPC sockets that pin `uv_run`.
 * Delay exit so other extensions can finish HTTP flushes (Agent Observability
 * generation export is queued on turn_end and flushed on session_shutdown).
 */
export function schedulePrintModeProcessExit(
	reason: string,
	mode: ExtensionContext["mode"],
	options?: {
		env?: NodeJS.ProcessEnv;
		delayMs?: number;
		schedule?: (callback: () => void, delayMs: number) => void;
		exit?: (code: number) => void;
		exitCode?: number | string;
	},
): boolean {
	if (!shouldExitAfterPrintModeShutdown(reason, mode, options?.env ?? process.env)) {
		return false;
	}
	const exit = options?.exit ?? ((code) => {
		process.exit(code);
	});
	const delayMs = options?.delayMs ?? PRINT_MODE_EXIT_FLUSH_MS;
	const schedule = options?.schedule ?? ((callback, ms) => {
		setTimeout(callback, ms);
	});
	const exitCode = options?.exitCode ?? process.exitCode;
	schedule(() => {
		exit(typeof exitCode === "number" ? exitCode : 0);
	}, delayMs);
	return true;
}

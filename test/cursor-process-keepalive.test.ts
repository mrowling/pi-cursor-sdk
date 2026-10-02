import http from "node:http";
import https from "node:https";
import { describe, expect, it, vi } from "vitest";
import {
	PRINT_MODE_EXIT_FLUSH_MS,
	destroyCursorProcessKeepAliveHandles,
	schedulePrintModeProcessExit,
	shouldDestroyKeepAliveHandlesOnShutdown,
	shouldExitAfterPrintModeShutdown,
} from "../src/cursor-process-keepalive.js";

describe("cursor-process-keepalive", () => {
	it("destroys Node HTTP keep-alive agents when not running under Vitest", () => {
		const httpDestroy = vi.spyOn(http.globalAgent, "destroy").mockImplementation(() => undefined);
		const httpsDestroy = vi.spyOn(https.globalAgent, "destroy").mockImplementation(() => undefined);
		try {
			destroyCursorProcessKeepAliveHandles({});
			expect(httpDestroy).toHaveBeenCalledTimes(1);
			expect(httpsDestroy).toHaveBeenCalledTimes(1);
		} finally {
			httpDestroy.mockRestore();
			httpsDestroy.mockRestore();
		}
	});

	it("does not destroy keep-alive agents during unit tests", () => {
		const httpDestroy = vi.spyOn(http.globalAgent, "destroy").mockImplementation(() => undefined);
		try {
			destroyCursorProcessKeepAliveHandles({ VITEST: "true" });
			expect(httpDestroy).not.toHaveBeenCalled();
		} finally {
			httpDestroy.mockRestore();
		}
	});

	it("does not destroy HTTP keep-alive agents on print/json quit", () => {
		expect(shouldDestroyKeepAliveHandlesOnShutdown("quit", "tui")).toBe(true);
		expect(shouldDestroyKeepAliveHandlesOnShutdown("quit", "rpc")).toBe(true);
		expect(shouldDestroyKeepAliveHandlesOnShutdown("quit", "print")).toBe(false);
		expect(shouldDestroyKeepAliveHandlesOnShutdown("quit", "json")).toBe(false);
		expect(shouldDestroyKeepAliveHandlesOnShutdown("reload", "tui")).toBe(false);
	});

	it("delays print-mode exit so Agent Observability can flush generation export", () => {
		expect(shouldExitAfterPrintModeShutdown("quit", "print", {})).toBe(true);
		expect(shouldExitAfterPrintModeShutdown("quit", "json", {})).toBe(true);
		expect(shouldExitAfterPrintModeShutdown("quit", "tui", {})).toBe(false);
		expect(shouldExitAfterPrintModeShutdown("reload", "print", {})).toBe(false);
		expect(shouldExitAfterPrintModeShutdown("quit", "print", { VITEST: "true" })).toBe(false);

		const exit = vi.fn();
		const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
		expect(schedulePrintModeProcessExit("quit", "print", {
			env: {},
			schedule: (callback, delayMs) => {
				scheduled.push({ callback, delayMs });
			},
			exit,
			exitCode: 0,
		})).toBe(true);
		expect(scheduled).toEqual([{ callback: expect.any(Function), delayMs: PRINT_MODE_EXIT_FLUSH_MS }]);
		expect(exit).not.toHaveBeenCalled();
		scheduled[0]?.callback();
		expect(exit).toHaveBeenCalledWith(0);
	});
});

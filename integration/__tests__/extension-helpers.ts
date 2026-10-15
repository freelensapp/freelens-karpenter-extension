/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The code the integration test sessions share. Copied with them into
// `freelens/integration/__tests__/` by the integration tests workflow, and
// imports the helpers found there. Its name does not match `*.tests.ts`, so
// Freelens's Vitest does not collect it as a test file.

import { spawnSync } from "node:child_process";
import * as utils from "../helpers/utils";

import type { ConsoleMessage, ElectronApplication, Frame, Page } from "playwright";

export const extensionName = "@freelensapp/karpenter-extension";

// The kind cluster the session runs against: the static lab of SPEC-0002, which
// e2e/scripts/lab-up.sh creates with its fixtures. The session only reads it.
export const kindClusterName = process.env.TEST_KIND_CLUSTER_NAME || "karpenter-lab-static";

// The package name with `@` dropped and `/` turned into `--`
// (`sanitizeExtensionName` in Freelens's `lens-extension.ts`).
const sanitizedExtensionId = extensionName.replace("@", "").replace("/", "--");

// The link inside the sidebar item of the dashboard: the `clusterPageMenus` id,
// after the sanitized package name. Only the link navigates.
const pageLinkTestId = `link-for-sidebar-item-${sanitizedExtensionId}-dashboard`;

const viewTimeout = { timeout: 60 * 1000 };

/**
 * An app started by `startApp`, with the errors that either process logs.
 */
export interface AppSession {
  app: ElectronApplication;
  window: Page;
  /** The errors logged so far. */
  errors(): string[];
  /** Closes the app and stops collecting errors; returns every error logged. */
  close(): Promise<string[]>;
}

/**
 * Collects the errors of the renderer's console and of the output of the test
 * process, which carries the output of the app.
 */
function collectErrors() {
  const errorLogs: string[] = [];
  const processErrorLogs: string[] = [];
  const outputErrorPattern = /\[out\]\s*error:/i;
  const ansiEscapePattern = /\u001b\[[0-9;]*m/g;
  let processOutputBuffer = "";

  const collectOutputErrors = (chunk: string | Uint8Array) => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    processOutputBuffer += text;

    // Keep buffer bounded while preserving enough tail to match split patterns across chunks.
    if (processOutputBuffer.length > 200_000) {
      processOutputBuffer = processOutputBuffer.slice(-20_000);
    }

    const normalizedOutput = processOutputBuffer.replaceAll(ansiEscapePattern, "");

    if (outputErrorPattern.test(normalizedOutput)) {
      processErrorLogs.push(normalizedOutput.trim());
      processOutputBuffer = "";
    }
  };

  const logger = (msg: ConsoleMessage) => {
    const text = msg.text();
    const normalizedText = text.replaceAll(ansiEscapePattern, "");

    console.log(text);

    // Some app logs are emitted as "log" messages, so inspect both console type and message content.
    if (msg.type() === "error" || outputErrorPattern.test(normalizedText)) {
      // The URL tells a failed request apart from another: the message of one has none.
      const url = msg.location()?.url;
      errorLogs.push(`[${msg.type()}] ${normalizedText}${url ? ` @ ${url}` : ""}`);
    }
  };

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk, encoding, cb) => {
    collectOutputErrors(chunk);

    return originalStdoutWrite(chunk, encoding as never, cb as never);
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk, encoding, cb) => {
    collectOutputErrors(chunk);

    return originalStderrWrite(chunk, encoding as never, cb as never);
  }) as typeof process.stderr.write;

  return {
    logger,
    errors: () => [...errorLogs, ...processErrorLogs],
    stop: () => {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    },
  };
}

/**
 * Starts the app, with a fresh `FREELENS_INTEGRATION_TESTING_DIR`, and collects
 * the errors either process logs until it is closed.
 */
export async function startApp(): Promise<AppSession> {
  const collector = collectErrors();
  let started: Awaited<ReturnType<typeof utils.start>> | undefined;

  try {
    started = await utils.start();
    started.window.on("console", collector.logger);
    console.log("await utils.clickWelcomeButton");
    await utils.clickWelcomeButton(started.window);
  } catch (error) {
    await started?.cleanup();
    collector.stop();
    throw error;
  }

  const { app, window, cleanup } = started;

  return {
    app,
    window,
    errors: collector.errors,
    close: async () => {
      // Keep listeners active through cleanup to catch late shutdown errors in CI logs.
      await cleanup();
      window.off("console", collector.logger);
      collector.stop();

      return collector.errors();
    },
  };
}

async function clickApplicationMenuItem(app: ElectronApplication, parentId: string, id: string) {
  await app.evaluate(
    async ({ app }, { parentId, id }) => {
      await app.applicationMenu?.getMenuItemById(parentId)?.submenu?.getMenuItemById(id)?.click();
    },
    { parentId, id },
  );
}

/**
 * Installs the extension from the Extensions page and waits until it is
 * enabled.
 */
export async function installExtension({ app, window }: AppSession) {
  // Navigate to extensions page
  console.log("navigate to extensions");
  await clickApplicationMenuItem(app, process.platform === "darwin" ? "mac" : "file", "navigate-to-extensions");

  // Trigger extension install: the packed tarball from the workflow, or the
  // published package when the test runs without one.
  console.log("await textbox.fill");
  await window
    .getByPlaceholder("Name, URL, or path to a package or directory")
    .fill(process.env.EXTENSION_PATH || extensionName);
  console.log("await install button click");
  await window.getByRole("button", { name: "Install", exact: true }).click();

  // Expect extension to be listed in installed list and enabled. The status
  // column reads "Incompatible" if the host refuses `engines.freelens`.
  console.log("await extensions table row");
  const row = window.getByTestId("extensions-table").locator("tbody tr", { hasText: extensionName });
  await row.locator("td").nth(2).getByText("Enabled", { exact: true }).waitFor();

  // Dismiss any notifications so a notification still in its enter animation
  // does not intercept pointer events on the elements behind it.
  console.log("dismiss notifications");
  const notificationCloseSelector =
    'i[data-testid*="close-notification-for-notification_"], div[class*="close-button-module__closeButton--"][aria-label="Close"]';
  for (let attempt = 0; attempt < 10; attempt++) {
    const closeButtons = await window.$$(notificationCloseSelector);
    if (closeButtons.length === 0) break;
    for (const closeButton of closeButtons) {
      await closeButton.click({ force: true }).catch(() => {});
    }
    await window.waitForTimeout(200);
  }
}

/**
 * Opens the kind cluster from the catalog and returns the cluster's frame, where
 * the extension's page renders.
 */
export async function openKindCluster({ app, window }: AppSession): Promise<Frame> {
  console.log("navigate to catalog");
  await clickApplicationMenuItem(app, "view", "navigate-to-catalog");
  console.log(`open kind-${kindClusterName}`);

  return utils.launchKindClusterFromCatalog(kindClusterName, window);
}

/**
 * Opens the Karpenter dashboard from the sidebar and waits for its tab bar.
 */
export async function openDashboard(frame: Frame) {
  await frame.waitForSelector(`[data-testid="${pageLinkTestId}"]`, viewTimeout);
  await utils.clickSidebarItem(frame, pageLinkTestId);
  await frame.getByRole("button", { name: "Overview", exact: true }).waitFor(viewTimeout);
}

/**
 * Opens a tab of the dashboard and waits for each text, the whole text of an
 * element or a pattern, then checks that the extension's error boundary
 * rendered no error page.
 */
export async function openTab(frame: Frame, tab: string, texts: (string | RegExp)[]) {
  await frame.getByRole("button", { name: tab, exact: true }).click(viewTimeout);

  for (const text of texts) {
    await frame.getByText(text, { exact: true }).first().waitFor(viewTimeout);
  }

  // The class of `ErrorPage`, as CSS modules name it in the bundle.
  const errorPages = await frame.locator('[class*="_errorPage_"]').count();

  if (errorPages > 0) {
    throw new Error(`The ${tab} tab shows ${errorPages} error page(s) of the extension`);
  }
}

/**
 * Runs a read-only kubectl command against the kind cluster, never the current
 * context, and tells whether it succeeded.
 */
function kubectlSucceeds(...args: string[]): boolean {
  return spawnSync("kubectl", ["--context", `kind-${kindClusterName}`, ...args], { timeout: 60 * 1000 }).status === 0;
}

/**
 * Whether the session can run: the kind cluster is running and reachable, and
 * has the fixtures of the static lab. Nothing is created or deleted. Outside CI
 * a session skips with a warning otherwise; in CI the run fails, so that a
 * mistake in the workflow does not turn into a silent skip.
 */
export function clusterReady(): boolean {
  let reason: string | undefined;

  if (spawnSync("kind", ["get", "kubeconfig", "--name", kindClusterName]).status !== 0) {
    reason = `the kind cluster ${kindClusterName} is not running`;
  } else if (!kubectlSucceeds("get", "--raw", "/readyz")) {
    reason = `the kind cluster ${kindClusterName} is not reachable`;
  } else if (!kubectlSucceeds("get", "nodepool", "general")) {
    reason = `the kind cluster ${kindClusterName} has no fixtures of the static lab (e2e/scripts/lab-up.sh static)`;
  }

  if (!reason) {
    return true;
  }

  if (process.env.CI) {
    throw new Error(`Cannot run the cluster tests: ${reason}`);
  }

  console.warn(`Skipping the cluster tests: ${reason}`);

  return false;
}

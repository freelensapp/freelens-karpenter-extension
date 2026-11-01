/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The code the integration test sessions share. The sessions attach to
// Freelens started with `pnpm dev` from a freelensapp/freelens checkout, over
// the Chrome DevTools Protocol port that script opens, and drive its renderer
// with Playwright. Its name does not match `*.tests.ts`, so Vitest does not
// collect it as a test file.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { chromium } from "playwright";

import type { Browser, ConsoleMessage, Frame, Locator, Page } from "playwright";

export const extensionName = "@freelensapp/karpenter-extension";

// The root of this checkout, installed in place and read for the manifests.
const extensionDir = path.resolve(import.meta.dirname, "..", "..");

// The fixtures, one directory per Karpenter variant: the CRDs its provider
// installs in `crds`, its objects in `objects.yaml` and their status in
// `status.yaml`.
const fixturesDir = path.join(extensionDir, "integration", "fixtures");

// The CDP endpoint of Freelens dev: `pnpm dev` of Freelens starts Electron
// with `--remoteDebuggingPort 9223`.
const cdpUrl = process.env.FREELENS_CDP_URL || "http://127.0.0.1:9223";

// The log of the main process, which CDP does not carry: the output of
// `pnpm dev` of Freelens, or its `lens.log`. Without it only the renderer's
// errors are checked.
const mainLogFile = process.env.FREELENS_MAIN_LOG;

// The kind cluster the sessions run against.
export const kindClusterName = process.env.TEST_KIND_CLUSTER_NAME || "kind";

// The namespace of the namespaced test objects, and the prefix of the names of
// the events, which go to `default`, where Karpenter writes the events of its
// cluster-scoped objects.
const testNamespace = "integration-tests";

// The API groups of the CRDs of every variant: Karpenter's own and the node
// classes of its providers.
const karpenterGroups = ["karpenter.sh", "karpenter.k8s.aws", "karpenter.azure.com", "karpenter.k8s.gcp"];

// The package name with `@` dropped and `/` turned into `--`
// (`sanitizeExtensionName` in Freelens's `lens-extension.ts`).
const sanitizedExtensionId = extensionName.replace("@", "").replace("/", "--");

/**
 * The link inside the sidebar item of a `clusterPageMenus` entry: its id,
 * after the sanitized package name. Only the link navigates, or opens and
 * closes the entries of a parent.
 */
function sidebarLinkTestId(menuId: string): string {
  return `link-for-sidebar-item-${sanitizedExtensionId}-${menuId}`;
}

// "Karpenter", the parent of the entries of the extension, and its first
// entry, "Overview", the dashboard.
const parentLinkTestId = sidebarLinkTestId("karpenter");
const pageLinkTestId = sidebarLinkTestId("dashboard");

const viewTimeout = { timeout: 60 * 1000 };

const ansiEscapePattern = /\u001b\[[0-9;]*m/g;

// The Kubernetes proxy of Freelens logs a request that the renderer aborts as
// an error. Freelens dev renders in React.StrictMode, which mounts every view
// twice and aborts the requests of the first mount, so the line comes and goes
// with the timing of a run. It names no request, and says nothing about the
// extension.
const abortedProxyRequestPattern = /proxy_server\.go:\d+\] Error while proxying request: context canceled$/;

// The host asks the metrics API for the pods and nodes it shows, and kind has
// no metrics server, so Chromium logs a 404 for each such request. It is the
// host's request, not the extension's.
export const hostMetricsRequestPattern =
  /Failed to load resource: the server responded with a status of 404 \(\) \(\S+\/apis\/metrics\.k8s\.io\//;

// Freelens dev serves the renderer's modules from the Vite dev server through
// a route of its main process, which logs a request that fails as a warning:
// its keep-alive agent at times reuses a socket that the dev server is closing,
// and the request fails with ECONNRESET. The route answers it with a 502, which
// Chromium logs as "Failed to load resource"; such an error is left out when
// the main log has the failed request for its URL. When the module belongs to
// Monaco's editor worker, which a YAML view starts, the worker does not load,
// and Monaco rethrows its `error` event, an `Event` without a stack. Such a
// page error is left out when the main log has a failed request. When the
// module belongs to the cluster frame, the frame does not render, and
// `openKindCluster` loads it again. None of it says anything about the
// extension.
const devFileRouteFailurePattern = /\[DEV-FILE-ROUTE\]: request for (\S+) failed: /;

const badGatewayPattern = /^Failed to load resource: the server responded with a status of 502\b/;

/** The path of a URL, without its query, as the dev file route logs it. */
const urlPath = (url: string) => (URL.canParse(url) ? new URL(url).pathname : url.replace(/[?#].*$/, ""));

/**
 * A connection to Freelens dev, with the errors that either process logs.
 */
export interface AppSession {
  browser: Browser;
  /** The root frame's page, where the catalog, the extensions and the preferences render. */
  window: Page;
  /** The errors logged so far. */
  errors(): string[];
  /** The paths of the requests that the dev file route failed so far, in order, one entry per failure. */
  devFileRouteFailures(): string[];
  /** Stops collecting errors; returns every error logged until then. */
  stopCollecting(): Promise<string[]>;
  /** Stops collecting errors, unless stopped already, and closes the connection; returns every error collected. */
  close(): Promise<string[]>;
}

/**
 * Whether Freelens dev answers on its CDP endpoint and the kind cluster is
 * reachable. Outside CI a session skips with a warning otherwise; in CI the
 * run fails, so that a mistake in the workflow does not turn into a silent
 * skip.
 */
export async function appReady({ cluster }: { cluster: boolean }): Promise<boolean> {
  let reason: string | undefined;

  try {
    const response = await fetch(new URL("/json/version", cdpUrl), { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      reason = `${cdpUrl} answered ${response.status}`;
    }
  } catch (error) {
    reason = `Freelens dev does not answer on ${cdpUrl}: ${error instanceof Error ? error.message : error}`;
  }

  if (!reason && cluster) {
    if (spawnSync("kubectl", ["--context", `kind-${kindClusterName}`, "get", "--raw", "/readyz"]).status !== 0) {
      reason = `the kind cluster ${kindClusterName} is not reachable`;
    }
  }

  if (!reason) {
    return true;
  }

  if (process.env.CI) {
    throw new Error(`Cannot run the integration tests: ${reason}`);
  }

  console.warn(`Skipping the integration tests: ${reason}`);

  return false;
}

/**
 * Describes the arguments of a console message, read in the page: an `Error`
 * by its stack, an `ErrorEvent` by its message, location and error, another
 * `Event` by its type and target, anything else as JSON.
 */
async function describeConsoleArgs(msg: ConsoleMessage): Promise<string> {
  const descriptions = await Promise.all(
    msg.args().map((arg) =>
      arg
        .evaluate((value) => {
          if (value instanceof Error) {
            return value.stack ?? `${value.name}: ${value.message}`;
          }

          if (value instanceof ErrorEvent) {
            const stack = value.error instanceof Error ? ` ${value.error.stack}` : "";

            return `${value.type} event: ${value.message} (${value.filename}:${value.lineno}:${value.colno})${stack}`;
          }

          if (value instanceof Event) {
            return `${value.type} event of ${value.target?.constructor.name ?? "no target"}`;
          }

          try {
            return JSON.stringify(value) ?? String(value);
          } catch {
            return String(value);
          }
        })
        .catch((error) => `<argument not readable: ${error instanceof Error ? error.message : error}>`),
    ),
  );

  // A message of the browser itself, such as a resource or a worker that
  // failed to load, has no arguments; its time ties it to the main log.
  return descriptions.length
    ? descriptions.join(" ")
    : `<empty message without arguments, at ${new Date(msg.timestamp()).toISOString()}>`;
}

/**
 * Collects the errors of the renderer's console, of every frame, and the
 * lines of the main log written after the session started.
 */
function collectErrors(window: Page) {
  const errorLogs: string[] = [];
  const pendingDescriptions: Promise<void>[] = [];
  // The thrown `Event`s, kept apart until the main log tells whether the dev
  // file route failed a request.
  const workerLoadErrors: string[] = [];
  // The 502s, kept apart until the main log tells whether the dev file route
  // failed the request for their URL.
  const badGatewayErrors: { path: string; text: string }[] = [];
  // The paths of the requests that the dev file route failed.
  const devFileRouteFailures: string[] = [];
  let mainLogOffset = mainLogFile && fs.existsSync(mainLogFile) ? fs.statSync(mainLogFile).size : 0;

  // Chromium logs every response that is not a success as "Failed to load
  // resource", whose text has no URL, so the location of the message is added.
  // The text of a message is the preview of its arguments: the class name of
  // an object, such as `ErrorEvent`, or nothing at all. Such a message is
  // described from its arguments, read from the page after the event, and
  // `settle()` waits for that. A message of a worker names the worker.
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      const { url, lineNumber, columnNumber } = msg.location();
      const worker = msg.worker();
      const location = `${url ? ` (${url}:${lineNumber}:${columnNumber})` : ""}${worker ? ` (worker ${worker.url()})` : ""}`;
      const text = msg.text().replaceAll(ansiEscapePattern, "");

      if (url && badGatewayPattern.test(text)) {
        badGatewayErrors.push({ path: urlPath(url), text: `[renderer] ${text}${location}` });

        return;
      }

      const index = errorLogs.push(`[renderer] ${text}${location}`) - 1;

      if (!text.trim() || /^[A-Z]\w*$/.test(text)) {
        pendingDescriptions.push(
          describeConsoleArgs(msg).then((description) => {
            errorLogs[index] = `[renderer] ${description}${location}`;
          }),
        );
      }
    }
  };

  // Playwright gives an uncaught value that is not an `Error`, such as an
  // `Event`, an empty stack and its description as the message, so such an
  // error is described by its name and message, and its time ties it to the
  // main log.
  const onPageError = (error: Error) => {
    if (error.stack) {
      errorLogs.push(`[renderer] ${error.stack}`);

      return;
    }

    const description = [error.name, error.message].filter(Boolean).join(": ") || "<empty>";
    const text = `[renderer] uncaught ${description} without a stack, at ${new Date().toISOString()}`;

    if (error.message === "Event" && !error.name) {
      workerLoadErrors.push(text);
    } else {
      errorLogs.push(text);
    }
  };

  // A line of the main log starts with its level, in the file and on the
  // console alike, after the task prefix that turbo adds to the output of
  // `pnpm dev` when it streams it (`freelens:dev: `).
  const readMainLog = () => {
    if (!mainLogFile || !fs.existsSync(mainLogFile)) {
      return;
    }

    const size = fs.statSync(mainLogFile).size;

    // A rotated log starts again from the beginning.
    if (size < mainLogOffset) {
      mainLogOffset = 0;
    }

    if (size === mainLogOffset) {
      return;
    }

    const fd = fs.openSync(mainLogFile, "r");

    try {
      const buffer = Buffer.alloc(size - mainLogOffset);

      fs.readSync(fd, buffer, 0, buffer.length, mainLogOffset);
      mainLogOffset = size;

      for (const line of buffer.toString("utf8").split("\n")) {
        const text = line.replaceAll(ansiEscapePattern, "");

        const devFileRouteFailure = devFileRouteFailurePattern.exec(text);

        if (devFileRouteFailure?.[1]) {
          devFileRouteFailures.push(urlPath(devFileRouteFailure[1]));
        }

        if (/^(?:[\w@/.-]+:[\w:-]+: )?\s*error:/.test(text) && !abortedProxyRequestPattern.test(text.trim())) {
          errorLogs.push(`[main] ${text.trim()}`);
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  };

  window.on("console", onConsole);
  window.on("pageerror", onPageError);

  return {
    errors: () => {
      readMainLog();

      const failedPaths = new Set(devFileRouteFailures);
      const unexplainedBadGateways = badGatewayErrors
        .filter(({ path }) => !failedPaths.has(path))
        .map(({ text }) => text);

      return [...errorLogs, ...unexplainedBadGateways, ...(failedPaths.size ? [] : workerLoadErrors)];
    },
    devFileRouteFailures: () => {
      readMainLog();

      return [...devFileRouteFailures];
    },
    settle: async () => {
      await Promise.all(pendingDescriptions);
    },
    stop: () => {
      window.off("console", onConsole);
      window.off("pageerror", onPageError);
    },
  };
}

/**
 * Connects to Freelens dev and collects the errors either process logs until
 * the session stops collecting or is closed. Closing a browser connected over
 * CDP closes only the connection; the app keeps running.
 */
export async function connectApp(): Promise<AppSession> {
  const browser = await chromium.connectOverCDP(cdpUrl);

  try {
    const window = await rootPage(browser);
    const collector = collectErrors(window);
    let collected: Promise<string[]> | undefined;

    const stopCollecting = () => {
      collected ??= (async () => {
        await collector.settle();

        const errors = collector.errors();

        collector.stop();

        return errors;
      })();

      return collected;
    };

    return {
      browser,
      window,
      errors: collector.errors,
      devFileRouteFailures: collector.devFileRouteFailures,
      stopCollecting,
      close: async () => {
        const errors = await stopCollecting();

        await browser.close();

        return errors;
      },
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/**
 * The page of the root frame: `https://renderer.freelens.app`, on the port of
 * the app's proxy. A cluster renders in an iframe of it, on
 * `<clusterId>.renderer.freelens.app`.
 */
async function rootPage(browser: Browser): Promise<Page> {
  const deadline = Date.now() + viewTimeout.timeout;

  while (Date.now() < deadline) {
    const page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((page) => URL.canParse(page.url()) && new URL(page.url()).hostname === "renderer.freelens.app");

    if (page) {
      await page.waitForFunction(() => globalThis.FreelensExtensionApi?.Renderer !== undefined, null, viewTimeout);

      return page;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`No Freelens window on ${cdpUrl}`);
}

/**
 * Navigates the root frame with `Renderer.Navigation.navigate` of the
 * extension API: the application menu, which the packaged-app tests click,
 * belongs to the main process, which CDP does not reach.
 */
async function navigate(window: Page, url: string) {
  console.log(`navigate to ${url}`);
  await window.evaluate((url) => {
    const renderer = globalThis.FreelensExtensionApi.Renderer;

    if (!renderer) {
      throw new Error("The page has no Renderer API");
    }

    renderer.Navigation.navigate(url);
  }, url);
}

/**
 * Dismisses the notifications, so that one still in its enter animation does
 * not intercept pointer events on the elements behind it.
 */
async function dismissNotifications(window: Page) {
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
 * Uninstalls the extension from the Extensions page, from wherever it was
 * installed. An extension installed in place is forgotten, its directory
 * stays.
 */
async function uninstallExtension(window: Page, row: Locator) {
  console.log(`uninstall ${extensionName}`);
  await row.locator('[id^="menu-actions-for-installed-extensions-for-"]').click();
  await window.locator(".MenuActions .MenuItem").getByText("Uninstall", { exact: true }).click();
  await window.getByTestId("confirmation-dialog").getByTestId("confirm").click();
  await row.waitFor({ state: "detached", ...viewTimeout });
}

/**
 * Installs this checkout in place from the Extensions page and waits until it
 * is enabled. An installation of the checkout that is already enabled is
 * kept, unless `reinstall` is set; any other installation of the extension is
 * uninstalled first.
 */
export async function installExtension({ window }: AppSession, { reinstall = false } = {}) {
  await navigate(window, "/extensions");

  const table = window.getByTestId("extensions-table");
  const row = table.locator("tbody tr", { hasText: extensionName });
  const enabled = row.locator("td").nth(2).getByText("Enabled", { exact: true });

  // Once the extensions are discovered, the page shows the table, or a notice
  // in its place when no extension is installed, as in a fresh profile.
  await table.or(window.getByText("There are no extensions installed.", { exact: true })).waitFor(viewTimeout);

  if (await row.count()) {
    // An extension loaded in place reads "development" in the version column,
    // with the directory in its title.
    const inPlace = await row.locator(`[title="Loaded from ${extensionDir}"]`).count();

    if (!reinstall && inPlace && (await enabled.count())) {
      console.log(`${extensionName} is installed from ${extensionDir}`);

      return;
    }

    await uninstallExtension(window, row);
  }

  console.log(`install ${extensionDir}`);
  await window.getByPlaceholder("Name, URL, or path to a package or directory").fill(extensionDir);
  await window.getByRole("button", { name: "Install", exact: true }).click();

  // A directory is loaded in place only after a confirmation.
  await window.getByTestId("confirmation-dialog").getByTestId("confirm").click(viewTimeout);

  // The status column reads "Incompatible" if the host refuses
  // `engines.freelens`.
  await enabled.waitFor(viewTimeout);
  await dismissNotifications(window);
}

/**
 * The catalog id of the kind cluster, looked up by its name.
 */
async function kindClusterId(window: Page): Promise<string> {
  const id = await window.waitForFunction(
    (name) =>
      globalThis.FreelensExtensionApi.Renderer?.Catalog.catalogEntities
        .getItemsForApiKind("entity.k8slens.dev/v1alpha1", "KubernetesCluster")
        .find((entity) => entity.getName() === name)
        ?.getId(),
    `kind-${kindClusterName}`,
    viewTimeout,
  );

  return id.jsonValue() as Promise<string>;
}

/**
 * The phase of the kind cluster in the catalog: `connected`, `connecting`,
 * `disconnected`.
 */
async function kindClusterPhase(window: Page, id: string): Promise<string | undefined> {
  return window.evaluate(
    (id) => globalThis.FreelensExtensionApi.Renderer?.Catalog.catalogEntities.getById(id)?.status.phase,
    id,
  );
}

/**
 * Disconnects the kind cluster if it is connected, and waits until it is
 * disconnected. The app reads which versions of a CRD are served when it
 * connects, so a session that changes the CRDs starts and ends with a
 * disconnected cluster. Only the kind cluster is touched; the app may have
 * others.
 */
export async function disconnectKindCluster({ window }: AppSession) {
  const id = await kindClusterId(window);

  if ((await kindClusterPhase(window, id)) === "disconnected") {
    return;
  }

  console.log(`disconnect kind-${kindClusterName}`);
  await navigate(window, "/catalog");
  await window.evaluate(async (id) => {
    const entity = globalThis.FreelensExtensionApi.Renderer?.Catalog.catalogEntities.getById(id);

    if (!entity || !("disconnect" in entity) || typeof entity.disconnect !== "function") {
      throw new Error(`The catalog has no cluster ${id}`);
    }

    await entity.disconnect();
  }, id);
  await window.waitForFunction(
    (id) =>
      globalThis.FreelensExtensionApi.Renderer?.Catalog.catalogEntities.getById(id)?.status.phase === "disconnected",
    id,
    viewTimeout,
  );
}

/**
 * Connects the kind cluster and returns the cluster's frame, where the
 * dashboard and the details render.
 *
 * When the frame does not render and the dev file route of Freelens dev has
 * failed a request since the cluster was opened, a module of the frame did not
 * load (see `devFileRouteFailurePattern`), and the frame is loaded once more.
 * A frame that does not render for any other reason fails on the timeout.
 */
export async function openKindCluster(session: AppSession): Promise<Frame> {
  const { window } = session;
  const id = await kindClusterId(window);
  const failuresBefore = session.devFileRouteFailures().length;

  await navigate(window, `/cluster/${id}`);

  const element = await window.waitForSelector(`#cluster-frame-${id}`, viewTimeout);
  const frame = await element.contentFrame();

  if (!frame) {
    throw new Error(`No iframe for kind-${kindClusterName}`);
  }

  const sidebarSelector = "[data-testid=cluster-sidebar]";

  try {
    await frame.waitForSelector(sidebarSelector, viewTimeout);
  } catch (error) {
    const failures = session.devFileRouteFailures().slice(failuresBefore);

    if (failures.length === 0) {
      throw error;
    }

    console.log(`reload the frame of kind-${kindClusterName}: the dev file route failed ${failures.join(", ")}`);
    await frame.goto(frame.url(), viewTimeout);
    await frame.waitForSelector(sidebarSelector, viewTimeout);
  }

  return frame;
}

/**
 * Clicks a sidebar item of the cluster frame. The entries navigate in their
 * `onClick`, and a dispatched click reaches it even while the cluster overview
 * re-lays out over the click point (`clickSidebarItem` in Freelens's
 * integration helpers).
 */
async function clickSidebarItem(frame: Frame, testId: string) {
  await frame.dispatchEvent(`[data-testid="${testId}"]`, "click");
}

/**
 * Runs kubectl against the kind cluster, never the current context, and fails
 * with its stderr when it exits non-zero.
 */
function kubectl(...args: string[]): string {
  const argv = ["--context", `kind-${kindClusterName}`, ...args];
  const command = `kubectl ${argv.join(" ")}`;

  console.log(command);

  const { error, status, signal, stdout, stderr } = spawnSync("kubectl", argv, {
    encoding: "utf8",
    timeout: 5 * 60 * 1000,
  });

  if (error) {
    throw new Error(`${command} failed: ${error.message}`);
  }

  if (status !== 0) {
    throw new Error(`${command} exited with ${status ?? signal}: ${stderr.trim()}`);
  }

  if (stdout.trim()) {
    console.log(stdout.trim());
  }

  return stdout;
}

/**
 * The lines of a command's output, without empty ones.
 */
function lines(output: string): string[] {
  return output.split("\n").filter((line) => line.trim());
}

/**
 * The CRDs of every Karpenter variant on the cluster, by `kubectl` name.
 */
function karpenterCrds(): string[] {
  return lines(kubectl("get", "customresourcedefinitions", "--output=name")).filter((crd) =>
    karpenterGroups.some((group) => crd.endsWith(`.${group}`)),
  );
}

/**
 * Removes what an earlier session or run left, whichever variant it came
 * from: the test namespace, the test events, and every Karpenter CRD, with
 * every object of their kinds. Each deletion waits until the object is gone.
 */
function removeKarpenter() {
  kubectl("delete", "namespace", testNamespace, "--ignore-not-found", "--wait");

  const events = lines(kubectl("get", "events", "--namespace=default", "--output=name")).filter((event) =>
    event.split("/")[1]?.startsWith(`${testNamespace}.`),
  );

  if (events.length > 0) {
    kubectl("delete", "--namespace=default", ...events, "--ignore-not-found", "--wait");
  }

  const crds = karpenterCrds();

  if (crds.length > 0) {
    kubectl("delete", ...crds, "--ignore-not-found", "--wait");
  }
}

/**
 * Waits until every resource of the CRDs can be listed. A CRD is Established
 * before the API server has initialized the storage of its resource, and until
 * then a list answers 429, which the renderer logs as an error.
 */
function waitForCrdStorage(crds: string[]) {
  const resources = crds.map((crd) => crd.split("/")[1]).join(",");
  const argv = ["--context", `kind-${kindClusterName}`, "get", resources, "--output=name"];
  const deadline = Date.now() + 120 * 1000;

  console.log(`kubectl ${argv.join(" ")}, until it succeeds`);

  while (spawnSync("kubectl", argv, { encoding: "utf8", timeout: 30 * 1000 }).status !== 0) {
    if (Date.now() > deadline) {
      throw new Error(`The resources of the CRDs cannot be listed: ${resources}`);
    }

    spawnSync("sleep", ["1"]);
  }
}

/**
 * Removes what an earlier session or run left, then applies the CRDs of the
 * variant and, once they are established and serve their resources, its
 * objects and their status. The API server drops the status of an object it
 * creates, so the status goes to the status subresource.
 */
export function setUpCluster(variant: string) {
  removeKarpenter();

  kubectl("apply", "--server-side", "-k", path.join(fixturesDir, variant, "crds"));

  const crds = karpenterCrds();

  kubectl("wait", "--for=condition=Established", ...crds, "--timeout=120s");
  waitForCrdStorage(crds);
  kubectl("apply", "--server-side", "-f", path.join(fixturesDir, variant, "objects.yaml"));
  kubectl("apply", "--server-side", "--subresource=status", "-f", path.join(fixturesDir, variant, "status.yaml"));
}

/**
 * Deletes the objects and the CRDs of the variant.
 */
export function tearDownCluster(variant: string) {
  try {
    kubectl("delete", "-f", path.join(fixturesDir, variant, "objects.yaml"), "--ignore-not-found", "--wait");
  } finally {
    kubectl("delete", "-k", path.join(fixturesDir, variant, "crds"), "--ignore-not-found", "--wait");
  }
}

/**
 * Throws when the extension's error boundary rendered its error page inside
 * the locator.
 */
async function expectNoErrorPage(locator: Locator, where: string) {
  // The class of `ErrorPage`, as CSS modules name it in the bundle.
  const errorPages = await locator.locator('[class*="_errorPage_"]').count();

  if (errorPages > 0) {
    throw new Error(`${where} shows ${errorPages} error page(s) of the extension`);
  }
}

/**
 * Opens "Karpenter" in the sidebar, unless it is open already, and waits for
 * the link of one of its entries. The sidebar keeps a parent closed until it is
 * clicked, and remembers it open.
 */
async function expandSidebar(frame: Frame, linkTestId: string) {
  await frame.waitForSelector(`[data-testid="${parentLinkTestId}"]`, viewTimeout);

  if (!(await frame.locator(`[data-testid="${pageLinkTestId}"]`).count())) {
    await clickSidebarItem(frame, parentLinkTestId);
  }

  await frame.waitForSelector(`[data-testid="${linkTestId}"]`, viewTimeout);
}

/**
 * Opens the dashboard from the sidebar and waits for its tab bar.
 */
export async function openDashboard(frame: Frame) {
  await expandSidebar(frame, pageLinkTestId);
  await clickSidebarItem(frame, pageLinkTestId);
  await frame.getByRole("button", { name: "Overview", exact: true }).waitFor(viewTimeout);
}

/**
 * Opens a tab of the dashboard, from the sidebar when another page is open,
 * and waits for each text, the whole text of an
 * element or a pattern, then checks that the tab rendered no error page.
 */
export async function openTab(frame: Frame, tab: string, texts: (string | RegExp)[]) {
  if (!(await frame.getByRole("button", { name: tab, exact: true }).count())) {
    await openDashboard(frame);
  }

  await frame.getByRole("button", { name: tab, exact: true }).click(viewTimeout);

  for (const text of texts) {
    await frame.locator("main").getByText(text, { exact: true }).first().waitFor(viewTimeout);
  }

  await expectNoErrorPage(frame.locator("main"), `The ${tab} tab`);
}

/**
 * Opens a page of a kind from its entry under "Karpenter" in the sidebar, and
 * waits for its title, then checks that the page rendered no error page.
 */
export async function openKindPage(frame: Frame, menuId: string, title: string) {
  const linkTestId = sidebarLinkTestId(menuId);

  await expandSidebar(frame, linkTestId);
  await clickSidebarItem(frame, linkTestId);
  await frame.locator(".ItemListLayout").getByText(title, { exact: true }).first().waitFor(viewTimeout);
  await expectNoErrorPage(frame.locator("main"), `The ${title} page`);
}

/**
 * Checks that the sidebar has no entry for a page of a kind, which the
 * cluster does not serve, once it shows the entry of a kind it serves: the
 * host registers the APIs of the CRDs together, so both entries have decided
 * by then whether they are visible.
 */
export async function expectNoKindPageEntry(frame: Frame, menuId: string, servedMenuId: string) {
  await expandSidebar(frame, sidebarLinkTestId(servedMenuId));

  const count = await frame.locator(`[data-testid="${sidebarLinkTestId(menuId)}"]`).count();

  if (count !== 0) {
    throw new Error(`The sidebar has an entry for ${menuId}, which the cluster does not serve`);
  }
}

/** The columns of `kubectl get nodepools -o wide`, which the Node Pools page has. */
export const nodePoolColumns = ["Name", "NodeClass", "Nodes", "Ready", "Age", "Weight", "CPU", "Memory"];

/** The columns of `kubectl get nodeclaims -o wide`, which the Node Claims page has. */
export const nodeClaimColumns = [
  "Name",
  "Type",
  "Capacity",
  "Zone",
  "Node",
  "Ready",
  "Age",
  "ImageID",
  "ID",
  "NodePool",
  "NodeClass",
  "Drifted",
];

/** The columns of `kubectl get nodeoverlays -o wide`, which the Node Overlays page has. */
export const nodeOverlayColumns = ["Name", "Ready", "Age", "Weight"];

/** The columns of `kubectl get ec2nodeclasses -o wide`, which the EC2 Node Classes page has. */
export const ec2NodeClassColumns = ["Name", "Ready", "Age", "Role"];

/** The columns of `kubectl get aksnodeclasses -o wide`, which the AKS Node Classes page has. */
export const aksNodeClassColumns = ["Name", "Ready", "Age", "ImageFamily"];

/** An age as the host shows it, such as `42s` or `3m`. */
export const agePattern = /^\d+[smhdy]/;

/**
 * Waits for each text in the details drawer, the whole text of an element or
 * a pattern.
 */
export async function expectInDetails(frame: Frame, texts: (string | RegExp)[]) {
  for (const text of texts) {
    await frame.locator(".Drawer").getByText(text, { exact: true }).first().waitFor(viewTimeout);
  }
}

/**
 * Whether the texts have the expected ones in their order, each the whole
 * text or matching a pattern, with other texts between them: the cells of the
 * checkbox and the menu of a row.
 */
function inOrder(texts: string[], expected: (string | RegExp)[]): boolean {
  let next = 0;

  for (const text of texts) {
    const want = expected[next];

    if (want !== undefined && (typeof want === "string" ? text === want : want.test(text))) {
      next++;
    }
  }

  return next === expected.length;
}

/**
 * The texts of the cells of a table row or head, without the sort icon of a
 * head cell, whose ligature is text.
 */
async function cellTexts(locator: Locator): Promise<string[]> {
  const texts = await locator.locator(".TableCell").allInnerTexts();

  return texts.map((text) => text.replace(/arrow_drop_(down|up)$/, "").trim());
}

/**
 * Waits until the head of the list has the columns, in their order, and the
 * row whose first expected cell is the name of its object has the cells, in
 * their order. Returns the row.
 */
export async function expectListRow(frame: Frame, columns: string[], cells: [string, ...(string | RegExp)[]]) {
  const [name] = cells;
  const head = frame.locator(".TableHead").first();
  const row = frame
    .locator(".TableRow")
    .filter({ has: frame.getByText(name, { exact: true }) })
    .first();
  const deadline = Date.now() + viewTimeout.timeout;

  await row.waitFor(viewTimeout);

  for (;;) {
    const headTexts = await cellTexts(head);
    const rowTexts = await cellTexts(row);

    if (inOrder(headTexts, columns) && inOrder(rowTexts, cells)) {
      return row;
    }

    if (Date.now() > deadline) {
      throw new Error(
        `The list has the columns ${JSON.stringify(headTexts)} and the row ${JSON.stringify(rowTexts)}, ` +
          `not ${JSON.stringify(columns)} and ${cells.map(String).join(", ")}`,
      );
    }

    await frame.waitForTimeout(500);
  }
}

/**
 * Checks that the cells of a row under the columns are empty: the head and
 * the row have the same cells, the checkbox and the menu included, so a
 * column's cell is at the index of its head cell.
 */
export async function expectEmptyCells(frame: Frame, row: Locator, columns: string[]) {
  const headTexts = await cellTexts(frame.locator(".TableHead").first());
  const rowTexts = await cellTexts(row);

  for (const column of columns) {
    const index = headTexts.indexOf(column);

    if (index === -1 || rowTexts[index] !== "") {
      throw new Error(
        `The cell of ${column} is not empty: the list has the columns ${JSON.stringify(headTexts)} ` +
          `and the row ${JSON.stringify(rowTexts)}`,
      );
    }
  }
}

/**
 * Clicks an element and waits for the host's details drawer to show the title
 * (`Kind: name`), still open a moment later: a click that the drawer takes for
 * one outside itself closes the details it has just opened. Checks that
 * the drawer rendered no error page.
 */
export async function clickAndExpectDetails(frame: Frame, target: Locator, title: RegExp) {
  await target.click(viewTimeout);

  const drawer = frame.locator(".Drawer");
  const drawerTitle = drawer.locator(".drawer-title-text", { hasText: title }).first();

  await drawerTitle.waitFor(viewTimeout);
  await frame.waitForTimeout(1000);

  if (!(await drawerTitle.isVisible())) {
    throw new Error(`The details ${title} closed right after they opened`);
  }

  await expectNoErrorPage(drawer, `The details ${title}`);
}

/**
 * Opens the details of a node with `Renderer.Navigation.showDetails`, over the
 * page that is open, and waits for its title, then checks that the drawer,
 * where the extension adds its section, rendered no error page. The host's
 * Nodes page is not opened: it asks for node metrics, and kind has no metrics
 * server.
 */
export async function openNodeDetails(frame: Frame, nodeName: string) {
  await frame.evaluate((selfLink) => {
    globalThis.FreelensExtensionApi.Renderer?.Navigation.showDetails(selfLink);
  }, `/api/v1/nodes/${nodeName}`);

  const drawer = frame.locator(".Drawer");

  await drawer.locator(".drawer-title-text", { hasText: `Node: ${nodeName}` }).waitFor(viewTimeout);
  await expectNoErrorPage(drawer, `The details of ${nodeName}`);
}

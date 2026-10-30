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
const karpenterGroups = ["karpenter.sh", "karpenter.k8s.aws", "karpenter.azure.com"];

// The package name with `@` dropped and `/` turned into `--`
// (`sanitizeExtensionName` in Freelens's `lens-extension.ts`).
const sanitizedExtensionId = extensionName.replace("@", "").replace("/", "--");

// The link inside the sidebar item of the dashboard: the `clusterPageMenus`
// id, after the sanitized package name. Only the link navigates.
const pageLinkTestId = `link-for-sidebar-item-${sanitizedExtensionId}-dashboard`;

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

/**
 * A connection to Freelens dev, with the errors that either process logs.
 */
export interface AppSession {
  browser: Browser;
  /** The root frame's page, where the catalog, the extensions and the preferences render. */
  window: Page;
  /** The errors logged so far. */
  errors(): string[];
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

  const onPageError = (error: Error) => {
    errorLogs.push(`[renderer] ${error.stack ?? error.message}`);
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

      return [...errorLogs];
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
 */
export async function openKindCluster({ window }: AppSession): Promise<Frame> {
  const id = await kindClusterId(window);

  await navigate(window, `/cluster/${id}`);

  const element = await window.waitForSelector(`#cluster-frame-${id}`, viewTimeout);
  const frame = await element.contentFrame();

  if (!frame) {
    throw new Error(`No iframe for kind-${kindClusterName}`);
  }

  await frame.waitForSelector("[data-testid=cluster-sidebar]", viewTimeout);

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
 * Opens the dashboard from the sidebar and waits for its tab bar.
 */
export async function openDashboard(frame: Frame) {
  await frame.waitForSelector(`[data-testid="${pageLinkTestId}"]`, viewTimeout);
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
    await frame.getByText(text, { exact: true }).first().waitFor(viewTimeout);
  }

  await expectNoErrorPage(frame.locator("main"), `The ${tab} tab`);
}

/**
 * Clicks an element and waits for the host's details drawer to show the title
 * (`Kind: name`), still open a moment later: a click that the drawer takes for
 * one outside itself closes the details it has just opened (B14). Checks that
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

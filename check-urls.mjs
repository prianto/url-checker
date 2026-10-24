// check-urls.mjs - checks that each URL answers 200 OK (HEAD first, GET fallback)
// Run: node check-urls.mjs
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TIMEOUT_MS = 15_000;
const DIR = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = join(DIR, "url-check.log");
const FAIL_FILE = join(DIR, "last-failures.txt");
const failures = [];

function log(line) {
  const text = `${new Date().toISOString()} ${line}`;
  console.log(text);
  appendFileSync(LOG_FILE, text + "\n");
  if (line.startsWith("FAIL")) failures.push(text);
}

async function request(url, method) {
  return fetch(url, {
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": "url-checker/1.0" },
  });
}

async function check(url) {
  try {
    let res = await request(url, "HEAD");
    let method = "HEAD";

    // Some servers don't support HEAD properly; retry once with GET.
    if ([403, 404, 405, 501].includes(res.status)) {
      await res.body?.cancel();
      res = await request(url, "GET");
      method = "GET";
    }
    await res.body?.cancel(); // we don't need the body

    const ok = res.status === 200;
    const redirected = res.redirected ? ` (redirected to ${res.url})` : "";
    log(
      `${ok ? "OK  " : "FAIL"} ${url} -> ${res.status} [${method}]${redirected}`,
    );
    return ok;
  } catch (err) {
    const reason =
      err.name === "TimeoutError"
        ? "timeout"
        : (err.cause?.code ?? err.message);
    log(`FAIL ${url} -> ${reason}`);
    return false;
  }
}

// URLs live in urls.txt next to this script: one per line, '#' starts a comment.
function loadUrls() {
  try {
    return readFileSync(join(DIR, "urls.txt"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*$/, "").trim())
      .filter(Boolean);
  } catch (err) {
    log(`FAIL cannot read urls.txt -> ${err.code ?? err.message}`);
    return null;
  }
}

const URLS = loadUrls();
if (URLS && URLS.length === 0) log("FAIL urls.txt contains no URLs");
const results = URLS?.length ? await Promise.all(URLS.map(check)) : [false];
const failed = results.filter((ok) => !ok).length;
if (failed > 0) {
  log(`SUMMARY ${failed}/${URLS?.length || 0} failed`);

  // Only when something is wrong: open a visible terminal that stays open
  // until you close it manually.
  writeFileSync(
    FAIL_FILE,
    `URL CHECK FAILED at ${new Date().toLocaleString()}\r\n\r\n` +
      failures.join("\r\n") +
      `\r\n\r\nFull history: ${LOG_FILE}\r\nClose this window when done.\r\n`,
  );
  if (process.platform === "win32") {
    spawn(
      "cmd.exe",
      [
        "/d",
        "/s",
        "/c",
        `"start "URL Check FAILED" cmd /k type "${FAIL_FILE}""`,
      ],
      { detached: true, stdio: "ignore", windowsVerbatimArguments: true },
    ).unref();
  }
}
// Don't call process.exit() here: on Windows it can race with fetch's closing
// sockets and crash with a libuv assertion. Let the event loop drain instead.
process.exitCode = failed > 0 ? 1 : 0;

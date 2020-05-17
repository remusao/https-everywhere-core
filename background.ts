import { get, set } from "idb-keyval";
import { RuleSets } from "./src/rulesets";

/**
 * Disable badge by default! Although in practice initialization should take
 * less than a second, it makes sense conceptually to not show an active badge
 * until the adblocker engine is initialized. Although unlikely, it also means
 * that the badge will stay inactive if the adblocker fails to initialize.
 */
chrome.browserAction.disable();

/**
 * Keep track of number of network requests altered for each tab.
 */
const counter: Map<number, number> = new Map();

/**
 * Update badge with count for tab with id `tabId` using value from `counter`.
 */
function updateBadgeForTab(tabId: number): Promise<void> {
  return browser.browserAction.setBadgeText({
    text: '' + (counter.get(tabId) || 0),
  });
}

/**
 * Update badge with count for currently active tab using value from `counter`.
 */
async function updateBadgeForCurrentTab(): Promise<void> {
  const tabs = await browser.tabs.query({ active: true });
  if (tabs.length === 1) {
    const { id } = tabs[0];
    if (id !== undefined) {
      await updateBadgeForTab(id);
    }
  }
}

/**
 * Update badge with count for currently active tab using value from `counter`.
 * This function will also make sure that updates are throttled to not use too
 * much CPU when pages are loading and many network requests are triggered.
 */
let TIMER: NodeJS.Timeout | null = null;
function updateBadgeThrottled() {
  if (TIMER === null) {
    TIMER = setTimeout(async () => {
      TIMER = null;
      await updateBadgeForCurrentTab();
    }, 100);
  }
}

/**
 * Helper function used to both reset, increment and show the current value of
 * the blocked requests counter for a given tabId.
 */
function updateBlockedCounter(tabId: number, { reset = false, incr = false } = {}) {
  if (incr) { updateBadgeThrottled(); }
  counter.set(
    tabId,
    (reset ? 0 : (counter.get(tabId) || 0)) + (incr  ? 1 : 0),
  );
}

// Whenever the active tab changes, then we update the count of blocked request
browser.tabs.onActivated.addListener(({ tabId }) => updateBadgeForTab(tabId));

// Reset counter if tab is reloaded
browser.tabs.onUpdated.addListener((tabId, { status, url }) => {
  if (status === 'loading' && url === undefined) {
    updateBlockedCounter(tabId, { incr: false, reset: true });
  }
});

(async () => {
  // Load from cache (IndexedBD) or pre-built in extension (a serialized engine
  // is shipped as part of the XPI and allows to initialize the extension very
  // fast on cold start).
  const engine = RuleSets.deserialize(
    (await get("engine")) ||
      new Uint8Array(
        await (await fetch(chrome.runtime.getURL("engine.bin"))).arrayBuffer()
      )
  );

  setTimeout(async () => {
    console.time("Persist serialized engine");
    await set("engine", engine.serialize());
    console.timeEnd("Persist serialized engine");
  }, 5000);

  chrome.browserAction.enable();
  // browser.browserAction?.setBadgeTextColor({ color: 'white' });
  chrome.browserAction.setBadgeBackgroundColor({ color: "#4688F1" });

  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.type === 'main_frame') {
        updateBlockedCounter(details.tabId, { reset: true, incr: false });
      }

      const rewritten = engine.rewriteToSecureRequest(details.url);
      if (rewritten === null) {
        return {};
      }

      console.log("Redirecting to secure", {
        from: details.url,
        to: rewritten,
      });
      updateBlockedCounter(details.tabId, { reset: false, incr: true });
      return { redirectUrl: rewritten };
    },
    { urls: ["*://*/*", "ftp://*/*"] },
    ["blocking"]
  );

  chrome.cookies.onChanged.addListener((changeInfo) => {
    if (!changeInfo.removed && !changeInfo.cookie.secure) {
      if (engine.shouldSecureCookie(changeInfo.cookie)) {
        let cookie: any = {
          name: changeInfo.cookie.name,
          value: changeInfo.cookie.value,
          path: changeInfo.cookie.path,
          httpOnly: changeInfo.cookie.httpOnly,
          expirationDate: changeInfo.cookie.expirationDate,
          storeId: changeInfo.cookie.storeId,
          secure: true,
        };

        // Host-only cookies don't set the domain field.
        if (!changeInfo.cookie.hostOnly) {
          cookie.domain = changeInfo.cookie.domain;
        }

        // Chromium cookie sameSite status, see https://tools.ietf.org/html/draft-west-first-party-cookies
        if (changeInfo.cookie.sameSite) {
          cookie.sameSite = changeInfo.cookie.sameSite;
        }

        // Firefox first-party isolation
        // if (changeInfo.cookie.firstPartyDomain) {
        //   cookie.firstPartyDomain = changeInfo.cookie.firstPartyDomain;
        // }

        // The cookie API is magical -- we must recreate the URL from the domain and path.
        if (changeInfo.cookie.domain[0] == ".") {
          cookie.url = "https://www" + changeInfo.cookie.domain + cookie.path;
        } else {
          cookie.url = "https://" + changeInfo.cookie.domain + cookie.path;
        }
        // We get repeated events for some cookies because sites change their
        // value repeatedly and remove the "secure" flag.
        console.log(
          "Securing cookie " +
            cookie.name +
            " for " +
            changeInfo.cookie.domain +
            ", was secure=" +
            changeInfo.cookie.secure
        );
        chrome.cookies.set(cookie);
      }
    }
  });
})();

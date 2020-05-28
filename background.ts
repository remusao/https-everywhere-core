import { get, set } from 'idb-keyval';
import { Badge } from '@remusao/badger';

import { RuleSets } from './src/rulesets';

async function init(): Promise<RuleSets> {
  return RuleSets.deserialize(
    (await get('engine')) ||
      new Uint8Array(
        await (await fetch(chrome.runtime.getURL('engine.bin'))).arrayBuffer(),
      ),
  );
}

async function update(): Promise<RuleSets> {
  console.time('Update engine');
  console.time('Fetch update');
  const serialized = await (
    await fetch(
      'https://raw.githubusercontent.com/remusao/https-everywhere-core/master/engine.bin',
    )
  ).arrayBuffer();
  console.timeEnd('Fetch update');
  console.time('Deserialize update');
  console.timeEnd('Deserialize update');
  await set('engine', serialized);
  console.timeEnd('Update engine');
  return RuleSets.deserialize(new Uint8Array(serialized));
}

(async () => {
  console.time('Initialize badge');
  const badge = new Badge({
    badgeTextColor: 'white',
    iconDisabled: './icon-off.png',
    iconEnabled: './icon-on.png',
  });
  badge.enable();
  console.timeEnd('Initialize badge');

  // Load from cache (IndexedBD) or pre-built in extension (a serialized engine
  // is shipped as part of the XPI and allows to initialize the extension very
  // fast on cold start).
  console.time('Initialize engine');
  let engine = await init();
  console.timeEnd('Initialize engine');

  setTimeout(async () => {
    engine = await update();
  }, 5000);

  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const rewritten = engine.rewriteToSecureRequest(details.url);
      if (rewritten === null) {
        return {};
      }

      console.log('Redirecting to secure', {
        from: details.url,
        to: rewritten,
      });
      badge.incr(details.tabId);
      return { redirectUrl: rewritten };
    },
    { urls: ['*://*/*', 'ftp://*/*'] },
    ['blocking'],
  );

  chrome.cookies.onChanged.addListener((changeInfo) => {
    if (!changeInfo.removed && !changeInfo.cookie.secure) {
      if (engine.shouldSecureCookie(changeInfo.cookie)) {
        const cookie: any = {
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
        if (changeInfo.cookie.domain[0] === '.') {
          cookie.url = 'https://www' + changeInfo.cookie.domain + cookie.path;
        } else {
          cookie.url = 'https://' + changeInfo.cookie.domain + cookie.path;
        }
        // We get repeated events for some cookies because sites change their
        // value repeatedly and remove the "secure" flag.
        console.log(
          'Securing cookie ' +
            cookie.name +
            ' for ' +
            changeInfo.cookie.domain +
            ', was secure=' +
            changeInfo.cookie.secure,
        );
        chrome.cookies.set(cookie);
      }
    }
  });
})();

// Empty iterable singleton to reduce memory usage
const nullIterable = Object.create(null, {
  [Symbol.iterator]: {
    *value() {
      // do nothing
    },
  },

  size: {
    value: 0,
  },
});

/**
 * Return true if host is well-formed (RFC 1035)
 */
function isValidHostname(host: string): boolean {
  if (
    host &&
    host.length > 0 &&
    host.length <= 255 &&
    host.indexOf('..') === -1
  ) {
    return true;
  }
  return false;
}

/**
 * Return a list of wildcard expressions which support
 * the host under HTTPS Everywhere's implementation
 */
function getWildcardExpressions(host: string): string[] {
  // Ensure host is well-formed (RFC 1035)
  if (!isValidHostname(host)) {
    return nullIterable;
  }

  // Ensure host does not contain a wildcard itself
  if (host.indexOf('*') !== -1) {
    return nullIterable;
  }

  const results = [];

  // Replace www.example.com with www.example.*
  // eat away from the right for once and only once
  const segmented = host.split('.');
  if (segmented.length > 1) {
    const tmp = [...segmented.slice(0, segmented.length - 1), '*'].join('.');
    results.push(tmp);
  }

  // now eat away from the left, with *, so that for x.y.z.google.com we
  // check *.y.z.google.com, *.z.google.com and *.google.com
  for (let i = 1; i < segmented.length - 1; i++) {
    const tmp = ['*', ...segmented.slice(i, segmented.length)].join('.');
    results.push(tmp);
  }
  return results;
}

// To reduce memory usage for the numerous rules/cookies with trivial rules
const trivialCookieRuleC = /.+/;

/**
 * Constructs a single rule
 * @param from
 * @param to
 * @constructor
 */
class Rule {
  public readonly fromC: RegExp;
  public readonly to: string;

  constructor(from: string, to: string) {
    this.fromC = new RegExp(from);
    this.to = to;
  }
}

// To reduce memory usage for the numerous rules/cookies with trivial rules
const trivialRule = new Rule('^http:', 'https:');

/**
 * Returns a common trivial rule or constructs a new one.
 */
function getRule(from: string, to: string): Rule {
  if (from === '^http:' && to === 'https:') {
    // This is a trivial rule, rewriting http->https with no complex RegExp.
    return trivialRule;
  } else {
    // This is a non-trivial rule.
    return new Rule(from, to);
  }
}

/**
 * Generates a CookieRule
 * @param host The host regex to compile
 * @param cookiename The cookie name Regex to compile
 * @constructor
 */
class CookieRule {
  public readonly hostC: RegExp;
  public readonly nameC: RegExp;

  constructor(host: string, cookiename: string) {
    if (host === '.+') {
      // Some cookie rules trivially match any host.
      this.hostC = trivialCookieRuleC;
    } else {
      this.hostC = new RegExp(host);
    }

    if (cookiename === '.+') {
      // About 50% of cookie rules trivially match any name.
      this.nameC = trivialCookieRuleC;
    } else {
      this.nameC = new RegExp(cookiename);
    }
  }
}

/**
 * A collection of rules
 * @param set_name The name of this set
 * @param defaultState activity state
 * @param note Note will be displayed in popup
 * @constructor
 */
class RuleSet {
  public active: boolean;
  public readonly rules: Rule[] = [];
  public exclusions: RegExp | null = null;
  public cookierules: CookieRule[] | null = null;

  constructor(
    public readonly name: string,
    public readonly defaultState: boolean,
  ) {
    this.active = defaultState;
  }

  /**
   * Check if a URI can be rewritten and rewrite it
   * @param urispec The uri to rewrite
   * @returns {*} null or the rewritten uri
   */
  apply(urispec: string): string | null {
    let returl = null;
    // If we're covered by an exclusion, go home
    if (this.exclusions !== null && this.exclusions.test(urispec)) {
      // util.log(util.DBUG, "excluded uri " + urispec);
      return null;
    }

    // Okay, now find the first rule that triggers
    for (const rule of this.rules) {
      returl = urispec.replace(rule.fromC, rule.to);
      if (returl !== urispec) {
        return returl;
      }
    }
    return null;
  }
}

/**
 * Initialize Rule Sets
 * @param ruleActiveStates default state for rules
 * @constructor
 */
export class RuleSets {
  // Load rules into structure
  public readonly targets: Map<string, RuleSet[]> = new Map();

  parseOneJsonRuleset(ruletag: {
        name: string;
        rule: { from: string; to: string; }[];
        exclusion: string[];
        securecookie: { host: string; name: string; }[];
        target: string[];
      }): void {
    const ruleset = new RuleSet(ruletag.name, true);

    const rules = ruletag.rule;
    for (const rule of rules) {
      ruleset.rules.push(getRule(rule.from, rule.to));
    }

    const exclusions = ruletag.exclusion;
    if (exclusions.length !== 0) {
      ruleset.exclusions = new RegExp(exclusions.join('|'));
    }

    const cookierules = ruletag.securecookie;
    if (cookierules.length !== 0) {
      for (const cookierule of cookierules) {
        if (!ruleset.cookierules) {
          ruleset.cookierules = [];
        }
        ruleset.cookierules.push(
          new CookieRule(cookierule.host, cookierule.name),
        );
      }
    }

    const targets = ruletag.target;
    for (const target of targets) {
      let values = this.targets.get(target);
      if (values === undefined) {
        values = [];
        this.targets.set(target, values);
      }
      values.push(ruleset);
    }
  }

  /**
   * Return a list of rulesets that apply to this host
   * @param host The host to check
   * @returns {*} (empty) list
   */
  potentiallyApplicableRulesets(host: string): RuleSet[] {
    let results;
    // Let's begin search
    const rulesets = this.targets.get(host);
    results = rulesets !== undefined
      ? new Set([...rulesets])
      : new Set();

    const expressions = getWildcardExpressions(host);
    for (const expression of expressions) {
      const rulesetsForExpression = this.targets.get(expression)
      results = rulesetsForExpression !== undefined
        ? new Set([...results, ...rulesetsForExpression])
        : results;
    }

    // Clean the results list, which may contain duplicates or undefined entries
    results.delete(undefined);

    // util.log(util.DBUG,"Applicable rules for " + host + ":");
    if (results.size === 0) {
      // util.log(util.DBUG, "  None");
      results = nullIterable;
      // } else {
      // results.forEach(result => util.log(util.DBUG, "  " + result.name));
    }

    return results;
  }

  /**
   * Check to see if the Cookie object c meets any of our cookierule criteria for being marked as secure.
   * @param cookie The cookie to test
   * @returns {*} true or false
   */
  shouldSecureCookie(cookie: {
    name: string;
    domain: string;
  }): boolean {
    let hostname = cookie.domain;
    // cookie domain scopes can start with .
    while (hostname.charAt(0) === '.') {
      hostname = hostname.slice(1);
    }

    // Check if the domain might be being served over HTTP.  If so, it isn't
    // safe to secure a cookie!  We can't always know this for sure because
    // observing cookie-changed doesn't give us enough context to know the
    // full origin URI.

    // First, if there are any redirect loops on this domain, don't secure
    // cookies.  XXX This is not a very satisfactory heuristic.  Sometimes we
    // would want to secure the cookie anyway, because the URLs that loop are
    // not authenticated or not important.  Also by the time the loop has been
    // observed and the domain blacklisted, a cookie might already have been
    // flagged as secure.

    // Second, we need a cookie pass two tests before patching it
    //   (1) it is safe to secure the cookie, as per safeToSecureCookie()
    //   (2) it matches with the CookieRule
    //
    // We kept a cache of the results for (1), if we have a cached result which
    //   (a) is false, we should not secure the cookie for sure
    //   (b) is true, we need to perform test (2)
    //
    // Otherwise,
    //   (c) We need to perform (1) and (2) in place

    const safe = false;

    const potentiallyApplicable = this.potentiallyApplicableRulesets(hostname);
    for (const ruleset of potentiallyApplicable) {
      if (ruleset.cookierules !== null && ruleset.active) {
        // safe is false only indicate the lack of a cached result
        // we cannot use it to avoid looping here
        for (const cookierule of ruleset.cookierules) {
          // if safe is true, it is case (b); otherwise it is case (c)
          if (
            cookierule.hostC.test(cookie.domain) &&
            cookierule.nameC.test(cookie.name)
          ) {
            return (
              safe || this.safeToSecureCookie(hostname, potentiallyApplicable)
            );
          }
        }
      }
    }
    return false;
  }

  /**
   * Check if it is secure to secure the cookie (=patch the secure flag in).
   * @param domain The domain of the cookie
   * @param potentiallyApplicable
   * @returns {*} true or false
   */
  private safeToSecureCookie(
    domain: string,
    potentiallyApplicable: RuleSet[],
  ): boolean {
    // Make up a random URL on the domain, and see if we would HTTPSify that.
    const noncePath = '/' + Math.random().toString();
    const testURI = 'http://' + domain + noncePath + noncePath;

    for (const ruleset of potentiallyApplicable) {
      if (ruleset.active && ruleset.apply(testURI)) {
        return true;
      }
    }
    return false;
  }

  rewriteToSecureRequest(url: string): null | string {
    const { hostname } = new URL(url);

    // whether to use mozilla's upgradeToSecure BlockingResponse if available
    let newuristr = null;

    const potentiallyApplicable = this.potentiallyApplicableRulesets(
      hostname,
    );

    for (const ruleset of potentiallyApplicable) {
      newuristr = ruleset.apply(url);
      if (newuristr !== null) {
        break;
      }
    }

    return newuristr;
  }
}

// TODO - use loadCustomRuleset to load raw rules from disk and initialize.
// TODO - then use thist instance to test:
//
// 1. convertion from xml to json
// 2. URL upgrades
// 3. Cookies upgrades

import { StaticDataView } from "./data-view";
import { extractHostname } from "./url";
import { fastHash, tokenizeInPlace, tokenize } from "./utils";
import { Target } from "./target";
import { Rule } from "./rule";
import { Exclusion } from "./exclusion";
import { Index } from "./reverse-index";
import { SecureCookie, Cookie } from "./secure-cookie";
import { Codebooks, Compression } from "./compression";
import { RuleSet } from "./ruleset";
import { TOKENS_BUFFER } from "./tokens-buffer";

import codebookTargets from "./codebooks/targets";
import codebookRules from "./codebooks/rules";
import codebookExclusions from "./codebooks/exclusions";
import codebookSecurecookies from "./codebooks/securecookies";

function log(...args: any[]): void {
  if (false) {
    log(...args);
  }
}

export class RuleSets {
  static fromRuleSets(rulesets: RuleSet[]): RuleSets {
    const exclusions: Exclusion[] = [];
    const rules: Rule[] = [];
    const securecookies: SecureCookie[] = [];
    const targets: Target[] = [];

    for (const ruleset of rulesets) {
      exclusions.push(...ruleset.exclusions);
      rules.push(...ruleset.rules);
      securecookies.push(...ruleset.securecookies);
      targets.push(...ruleset.targets);
    }

    return new RuleSets({
      targets,
      exclusions,
      rules,
      securecookies,
      codebooks: {
        rules: codebookRules,
        targets: codebookTargets,
        exclusions: codebookExclusions,
        securecookies: codebookSecurecookies,
      },
    });
  }

  static deserialize(buffer: Uint8Array): RuleSets {
    const engine = RuleSets.fromRuleSets([]);
    const view = StaticDataView.fromUint8Array(buffer, engine.compression);
    const compression = Compression.deserialize(view);

    engine.compression = compression;
    engine.targets = Index.deserialize(view, Target.deserialize, compression);
    engine.exclusions = Index.deserialize(
      view,
      Exclusion.deserialize,
      compression
    );
    engine.rules = Index.deserialize(view, Rule.deserialize, compression);
    engine.securecookies = Index.deserialize(
      view,
      SecureCookie.deserialize,
      compression
    );

    return engine;
  }

  public compression: Compression;
  public exclusions: Index<Exclusion>;
  public rules: Index<Rule>;
  public securecookies: Index<SecureCookie>;
  public targets: Index<Target>;

  constructor({
    codebooks,
    exclusions,
    rules,
    securecookies,
    targets,
  }: {
    codebooks: Codebooks;
    exclusions: Exclusion[];
    rules: Rule[];
    securecookies: SecureCookie[];
    targets: Target[];
  }) {
    this.compression = new Compression(codebooks);
    this.targets = new Index(targets, Target.deserialize, this.compression);
    this.exclusions = new Index(
      exclusions,
      Exclusion.deserialize,
      this.compression
    );
    this.rules = new Index(rules, Rule.deserialize, this.compression);
    this.securecookies = new Index(
      securecookies,
      SecureCookie.deserialize,
      this.compression
    );
  }

  serialize() {
    const buffer = StaticDataView.allocate(
      this.compression.getSerializedSize() +
        this.targets.getSerializedSize() +
        this.rules.getSerializedSize() +
        this.exclusions.getSerializedSize() +
        this.securecookies.getSerializedSize(),
      this.compression
    );

    this.compression.serialize(buffer);
    this.targets.serialize(buffer);
    this.exclusions.serialize(buffer);
    this.rules.serialize(buffer);
    this.securecookies.serialize(buffer);

    return buffer.subarray();
  }

  // TODO - should RuleSet have an id which is a hash of its components? What
  // about collisions then? Maybe we could have a test which makes sure there
  // are no collisions based on all built-in rules?
  // TODO: rewriter
  // TODO: settings
  // TODO: updater
  // TODO: get_simple_rules_ending_with?
  // TODO: potentially_applicable?
  // addRulesets(rulesets: RuleSet[]): void {
  //   // TODO - settings.enableMixedRulesets
  //   // TODO - this.ruleActiveStates
  //   // TODO - scope
  // }

  // removeRuleset(ruleset: RuleSet[]): void {
  //   // TODO
  // }

  private potentiallyApplicableRulesets(
    hostname: string,
    tokens: Uint32Array
  ): Set<number> {
    const rulesets: Set<number> = new Set();

    // Identify candidates targets
    this.targets.iter(tokens, (target: Target) => {
      log(" ? candidate", target.host);
      if (rulesets.has(target.ruleset) === false && target.match(hostname)) {
        log("  > match", target.host, hostname);
        rulesets.add(target.ruleset);
      }

      return true;
    });

    return rulesets;
  }

  rewriteToSecureRequest(url: string): string | null {
    if (url.startsWith("https:")) {
      return null;
    }

    // TODO - handle IPs?
    const hostname = extractHostname(url);
    if (hostname === null) {
      return null;
    }

    const tokens = new Uint32Array(hostname.split(".").map(fastHash));
    log("URL", url);
    log("hostname", hostname);
    log("TOKENS", tokens);
    const rulesets = this.potentiallyApplicableRulesets(hostname, tokens);
    log("??", rulesets);
    if (rulesets.size !== 0) {
      this.exclusions.iter(
        tokenize(url, false, false),
        (exclusion: Exclusion) => {
          if (rulesets.has(exclusion.ruleset)) {
            log(" ? exclusion", exclusion.pattern);
            if (exclusion.match(url)) {
              log("  > discard", exclusion.ruleset);
              rulesets.delete(exclusion.ruleset);

              if (rulesets.size === 0) {
                return false;
              }
            }
          }

          return true;
        }
      );

      // Do we still have a ruleset after applying exclusions?
      if (rulesets.size !== 0) {
        let result: string | null = null;
        log("Get rules for", rulesets);
        this.rules.iter(new Uint32Array([...rulesets]), (rule: Rule) => {
          log(" ? rule", rule.from, rule.to, rule.rewrite(url));
          result = rule.rewrite(url);
          return result === null;
        });
        return result;
      }
    }

    return null;
  }

  public shouldSecureCookie(cookie: Cookie): boolean {
    // cookie domain scopes can start with .
    let hostname = cookie.domain;
    while (hostname.charAt(0) == ".") {
      hostname = hostname.slice(1);
    }

    const rulesets = this.potentiallyApplicableRulesets(
      hostname,
      new Uint32Array(hostname.split(".").map(fastHash))
    );

    if (rulesets.size === 0) {
      return false;
    }

    let shouldSecure = false;
    TOKENS_BUFFER.reset();
    tokenizeInPlace(hostname, false, false, TOKENS_BUFFER);
    tokenizeInPlace(cookie.name, false, false, TOKENS_BUFFER);
    this.securecookies.iter(
      TOKENS_BUFFER.slice(),
      (securecookie: SecureCookie) => {
        if (
          rulesets.has(securecookie.ruleset) &&
          securecookie.shouldSecure(hostname, cookie.name)
        ) {
          shouldSecure = true;
          return false;
        }

        return true;
      }
    );

    return shouldSecure;
  }
}

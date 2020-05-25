import { StaticDataView } from './data-view';
import { extractHostname } from './url';
import { fastHash, tokenizeInPlace, tokenize } from './utils';
import { Target } from './target';
import { Rule } from './rule';
import { Exclusion } from './exclusion';
import { Index } from './reverse-index';
import { SecureCookie, Cookie } from './secure-cookie';
import { Compression } from './compression';
import { RuleSet } from './ruleset';
import { TOKENS_BUFFER } from './tokens-buffer';
import { Hashes } from './hashes';
import { Config } from './config';

export class RuleSets {
  static fromRuleSets(rulesets: RuleSet[], config: Config): RuleSets {
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

    return new RuleSets(
      {
        targets,
        exclusions,
        rules,
        securecookies,
        compression: Compression.default(),
      },
      config,
    );
  }

  static deserialize(buffer: Uint8Array): RuleSets {
    const engine = RuleSets.fromRuleSets([], new Config());
    const view = StaticDataView.fromUint8Array(buffer, engine.compression);

    // Verify built-in checksum
    {
      const currentPos = view.pos;
      view.pos = buffer.length - 4;
      const checksum = view.checksum();
      const expected = view.getUint32();
      if (checksum !== expected) {
        throw new Error(
          `Serialized engine checksum mismatch, expected ${expected} but got ${checksum}`,
        );
      }
      view.pos = currentPos;
    }

    const config = Config.deserialize(view);
    const compression = Compression.deserialize(view);

    engine.config = config;
    engine.compression = compression;
    engine.targetsHashes = Hashes.deserialize(view);
    engine.targetsIndex = Index.deserialize(
      view,
      Target.deserialize,
      compression,
    );
    engine.exclusionsIndex = Index.deserialize(
      view,
      Exclusion.deserialize,
      compression,
    );
    engine.rulesIndex = Index.deserialize(view, Rule.deserialize, compression);
    engine.securecookiesIndex = Index.deserialize(
      view,
      SecureCookie.deserialize,
      compression,
    );

    return engine;
  }

  public compression: Compression;
  public exclusionsIndex: Index<Exclusion>;
  public rulesIndex: Index<Rule>;
  public securecookiesIndex: Index<SecureCookie>;
  public targetsIndex: Index<Target>;
  public targetsHashes: Hashes;
  public config: Config;

  constructor(
    {
      compression,
      exclusions,
      rules,
      securecookies,
      targets,
    }: {
      compression: Compression;
      exclusions: Exclusion[];
      rules: Rule[];
      securecookies: SecureCookie[];
      targets: Target[];
    },
    config: Config,
  ) {
    this.config = config;
    this.compression = compression;

    if (config.tradeMemoryForUncertainty) {
      console.time('FOO');
      const plainTargets: [string, number][] = [];
      const wildcardTargets: Target[] = [];
      for (const target of targets) {
        if (target.host.includes('*')) {
          wildcardTargets.push(target);
        } else {
          plainTargets.push([target.host, target.ruleset]);
        }
      }

      console.time('index');
      this.targetsIndex = new Index(
        wildcardTargets,
        Target.deserialize,
        this.compression,
      );
      console.timeEnd('index');
      console.time('hashes');
      this.targetsHashes = new Hashes(plainTargets);
      console.timeEnd('hashes');
      console.timeEnd('FOO');
    } else {
      this.targetsIndex = new Index(
        targets,
        Target.deserialize,
        this.compression,
      );
      this.targetsHashes = new Hashes([]);
    }

    this.exclusionsIndex = new Index(
      exclusions,
      Exclusion.deserialize,
      this.compression,
    );
    this.rulesIndex = new Index(rules, Rule.deserialize, this.compression);
    this.securecookiesIndex = new Index(
      securecookies,
      SecureCookie.deserialize,
      this.compression,
    );
  }

  getSerializedSize(): number {
    return (
      this.config.getSerializedSize() +
      this.compression.getSerializedSize() +
      this.targetsHashes.getSerializedSize() +
      this.targetsIndex.getSerializedSize() +
      this.rulesIndex.getSerializedSize() +
      this.exclusionsIndex.getSerializedSize() +
      this.securecookiesIndex.getSerializedSize() +
      4 // checksum
    );
  }

  serialize() {
    const buffer = StaticDataView.allocate(
      this.getSerializedSize(),
      this.compression,
    );

    this.config.serialize(buffer);
    this.compression.serialize(buffer);
    this.targetsHashes.serialize(buffer);
    this.targetsIndex.serialize(buffer);
    this.exclusionsIndex.serialize(buffer);
    this.rulesIndex.serialize(buffer);
    this.securecookiesIndex.serialize(buffer);

    // Checksum
    buffer.pushUint32(buffer.checksum());

    return buffer.subarray();
  }

  public stats() {
    return {
      targets: this.targetsIndex.size,
      targetsBuckets: [...this.targetsIndex.keys()].length,
      rules: this.rulesIndex.size,
      rulesBuckets: [...this.rulesIndex.keys()].length,
      exclusions: this.exclusionsIndex.size,
      exclusionsBuckets: [...this.exclusionsIndex.keys()].length,
      securecookies: this.securecookiesIndex.size,
      securecookiesBuckets: [...this.securecookiesIndex.keys()].length,
    };
  }

  private potentiallyApplicableRulesets(
    hostname: string,
    tokens: Uint32Array,
  ): Set<number> {
    const rulesets: Set<number> = new Set();

    this.targetsHashes.iter(hostname, (ruleset: number) => {
      rulesets.add(ruleset);
    });

    // Identify candidates targets
    this.targetsIndex.iter(tokens, (target: Target) => {
      if (rulesets.has(target.ruleset) === false && target.match(hostname)) {
        rulesets.add(target.ruleset);
      }
      return true;
    });

    return rulesets;
  }

  rewriteToSecureRequest(url: string): string | null {
    // TODO - try to share as much logic as possible with `match`.
    if (url.startsWith('https:')) {
      return null;
    }

    // TODO - handle IPs?
    const hostname = extractHostname(url);
    if (hostname === null) {
      return null;
    }

    const tokens = new Uint32Array(hostname.split('.').map(fastHash));
    const rulesets = this.potentiallyApplicableRulesets(hostname, tokens);

    if (rulesets.size !== 0) {
      this.exclusionsIndex.iter(
        tokenize(url, false, false),
        (exclusion: Exclusion) => {
          if (rulesets.has(exclusion.ruleset) && exclusion.match(url)) {
            rulesets.delete(exclusion.ruleset);
          }
          return true;
        },
      );

      // Do we still have a ruleset after applying exclusions?
      if (rulesets.size !== 0) {
        let rewritten: string | null = null;
        this.rulesIndex.iter(new Uint32Array([...rulesets]), (rule: Rule) => {
          rewritten = rule.rewrite(url);
          return rewritten === null;
        });
        return rewritten;
      }
    }

    return null;
  }

  match(url: string) {
    const result: {
      rulesets: Set<number>;
      exclusions: Exclusion[];
      rules: Rule[];
      rewritten: string[];
    } = {
      rulesets: new Set(),
      exclusions: [],
      rules: [],
      rewritten: [],
    };

    if (url.startsWith('https:')) {
      return result;
    }

    // TODO - handle IPs?
    const hostname = extractHostname(url);
    if (hostname === null) {
      return result;
    }

    const tokens = new Uint32Array(hostname.split('.').map(fastHash));
    const rulesets = this.potentiallyApplicableRulesets(hostname, tokens);
    for (const ruleset of rulesets) {
      result.rulesets.add(ruleset);
    }

    if (rulesets.size !== 0) {
      this.exclusionsIndex.iter(
        tokenize(url, false, false),
        (exclusion: Exclusion) => {
          if (rulesets.has(exclusion.ruleset) && exclusion.match(url)) {
            result.exclusions.push(exclusion);
          }
          return true;
        },
      );

      // Do we still have a ruleset after applying exclusions?
      if (rulesets.size !== 0) {
        this.rulesIndex.iter(new Uint32Array([...rulesets]), (rule: Rule) => {
          const rewritten = rule.rewrite(url);
          if (rewritten !== null) {
            result.rewritten.push(rewritten);
            result.rules.push(rule);
          }
          return true;
        });
      }
    }

    return result;
  }

  public shouldSecureCookie(cookie: Cookie): boolean {
    // cookie domain scopes can start with .
    let hostname = cookie.domain;
    while (hostname.charAt(0) === '.') {
      hostname = hostname.slice(1);
    }

    const rulesets = this.potentiallyApplicableRulesets(
      hostname,
      new Uint32Array(hostname.split('.').map(fastHash)),
    );

    if (rulesets.size === 0) {
      return false;
    }

    let shouldSecureCookie = false;
    TOKENS_BUFFER.reset();
    tokenizeInPlace(hostname, false, false, TOKENS_BUFFER);
    tokenizeInPlace(cookie.name, false, false, TOKENS_BUFFER);
    this.securecookiesIndex.iter(
      TOKENS_BUFFER.slice(),
      (securecookie: SecureCookie) => {
        if (
          rulesets.has(securecookie.ruleset) &&
          securecookie.shouldSecure(hostname, cookie.name)
        ) {
          shouldSecureCookie = true;
          return false;
        }
        return true;
      },
    );

    return shouldSecureCookie;
  }
}

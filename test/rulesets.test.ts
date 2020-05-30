import { expect } from 'chai';
import 'mocha';

import { loadRuleSets, loadRuleSetsObjects } from './utils';
import { RuleSets as HttpsEverywhereRuleSets } from './https-everywhere';

import { Config } from '../src/config';
import { RuleSets } from '../src/rulesets';

describe('#RuleSets', () => {
  const rulesets = loadRuleSets();

  it('#serialize/#deserialize/#getSerializedSize', () => {
    const engine = RuleSets.fromRuleSets(rulesets, new Config());

    const targets: string[] = [];
    const exclusions: string[] = [];
    const rules: string[] = [];
    const securecookies: string[] = [];
    for (const ruleset of rulesets) {
      exclusions.push(...ruleset.exclusions.map((e) => e.toString()));
      rules.push(...ruleset.rules.map((r) => r.toString()));
      securecookies.push(...ruleset.securecookies.map((s) => s.toString()));
      targets.push(...ruleset.targets.map((t) => t.toString()));
    }
    targets.sort();
    exclusions.sort();
    rules.sort();
    securecookies.sort();

    expect(engine.toRuleSets()).to.eql({
      targets,
      exclusions,
      rules,
      securecookies,
    });

    const buffer = engine.serialize();
    expect(
      engine.getSerializedSize(),
      `estimated size should be ${buffer.byteLength}`,
    ).to.greaterThan(buffer.byteLength);

    expect(RuleSets.deserialize(buffer).toRuleSets()).to.eql({
      targets,
      exclusions,
      rules,
      securecookies,
    });
  });

  it('#rewriteToSecureRequest', function () {
    this.timeout(20000);
    const httpsRuleSets = new HttpsEverywhereRuleSets();
    for (const ruleset of loadRuleSetsObjects()) {
      httpsRuleSets.parseOneJsonRuleset({
        name: ruleset.name,
        rule: ruleset.rules,
        exclusion: ruleset.exclusions.map(({ pattern }) => pattern),
        securecookie: ruleset.securecookies,
        target: ruleset.targets.map(({ host }) => host),
      });
    }

    for (const tradeMemoryForUncertainty of [false, true]) {
      const engine = RuleSets.fromRuleSets(
        rulesets,
        new Config({ tradeMemoryForUncertainty }),
      );

      for (const ruleset of rulesets) {
        for (const { url } of ruleset.tests) {
          expect(engine.rewriteToSecureRequest(url), url).to.equal(
            httpsRuleSets.rewriteToSecureRequest(url),
          );
        }
      }
    }
  });
});

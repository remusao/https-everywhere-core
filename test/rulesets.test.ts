import { readFileSync } from 'fs';
import { join } from 'path';

import { expect } from 'chai';
import 'mocha';

import { loadRuleSets } from './utils';

import { Config } from '../src/config';
import { RuleSets } from '../src/rulesets';

describe('#RuleSets', () => {
  const rulesets = loadRuleSets();

  it('#serialize/#deserialize/#getSerializedSize', () => {
    // TODO - test for all values of Config
    const engine = RuleSets.fromRuleSets(rulesets, new Config());

    const targets: string[] = [];
    const exclusions: string[] = [];
    const rules: string[] = [];
    const securecookies: string[] = [];
    for (const ruleset of rulesets) {
      exclusions.push(...ruleset.exclusions.map(e => e.toString()));
      rules.push(...ruleset.rules.map(r => r.toString()));
      securecookies.push(...ruleset.securecookies.map(s => s.toString()));
      targets.push(...ruleset.targets.map(t => t.toString()));
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

  // TODO - how do the built-in tests work? Seems like they do not necessarily
  // TODO - maybe generate a set of tests once and for all?
  // TODO - then re-use when all rulesets are loaded at once.
  // trigger exclusion/rule?
  describe('#match', function () {
    this.timeout(20000);
    const cases: {
      url: string;
      rulesets: number[];
      exclusions: string[];
      rules: string[];
      rewritten: string[];
    }[] = JSON.parse(
      readFileSync(join(__dirname, 'data', 'cases.json'), 'utf-8'),
    );
    for (const tradeMemoryForUncertainty of [false, true]) {
      it(`tradeMemoryForUncertainty=${tradeMemoryForUncertainty}`, () => {
        const engine = RuleSets.fromRuleSets(
          rulesets,
          new Config({ tradeMemoryForUncertainty }),
        );
        for (const testcase of cases) {
          const match = engine.match(testcase.url);
          expect([...match.rulesets].sort(), testcase.url).to.eql(
            testcase.rulesets,
          );
          expect(
            [...new Set(match.exclusions.map((e) => e.toString()).sort())],
            testcase.url,
          ).to.eql(testcase.exclusions);
          expect(
            match.rules.map((r) => r.toString()).sort(),
            testcase.url,
          ).to.eql(testcase.rules);
          expect(match.rewritten.sort(), testcase.url).to.eql(
            testcase.rewritten,
          );
        }
      });
    }
  });
});

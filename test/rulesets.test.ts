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
    const buffer = engine.serialize();

    expect(
      engine.getSerializedSize(),
      `estimated size should be ${buffer.byteLength}`,
    ).to.greaterThan(buffer.byteLength);

    expect(RuleSets.deserialize(buffer).serialize(), 'deserializing').to.eql(
      buffer,
    );
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

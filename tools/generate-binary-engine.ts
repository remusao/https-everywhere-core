import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { RuleSets } from '../src/rulesets';
import { RuleSet, RuleSetObj } from '../src/ruleset';
import { Config } from '../src/config';

function readRuleSetsObj(): RuleSetObj[] {
  return JSON.parse(
    readFileSync(join(__dirname, '..', './rulesets.json'), 'utf-8'),
  );
}

(() => {
  const rulesets = readRuleSetsObj();
  let ruleSetId = 1;

  console.time('Create engine');
  const engine = RuleSets.fromRuleSets(
    rulesets.map((ruleset) => RuleSet.fromObj(ruleset, ruleSetId++)),
    new Config({
      tradeMemoryForUncertainty: false,
    }),
  );
  // let engine = RuleSets.fromRuleSets(rulesets);
  // for (let i = 0; i < 100; i += 1) {
  //   engine = RuleSets.fromRuleSets(rulesets);
  // }
  console.timeEnd('Create engine');
  console.time('Serialize engine');
  const serialized = engine.serialize();
  console.timeEnd('Serialize engine');

  console.time('Deserialize engine');
  RuleSets.deserialize(serialized);
  console.timeEnd('Deserialize engine');
  console.log('Size', serialized.byteLength);
  writeFileSync('engine.bin', serialized);
  console.log('Stats', engine.stats());
})();

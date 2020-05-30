import { readFileSync } from 'fs';

import { resolve, join } from 'path';

import { RuleSet, RuleSetObj } from '../src/ruleset';
import { Target } from '../src/target';
import { Rule } from '../src/rule';
import { Exclusion } from '../src/exclusion';
import { SecureCookie } from '../src/secure-cookie';

export function loadRuleSetsObjects(): RuleSetObj[] {
  return JSON.parse(
    readFileSync(resolve(join(__dirname, '..', 'rulesets.json')), 'utf-8'),
  );
}

export function loadRuleSets(): RuleSet[] {
  let id = 1;
  const rulesets: RuleSet[] = [];
  for (const ruleset of loadRuleSetsObjects()) {
    rulesets.push(RuleSet.fromObj(ruleset, id++));
  }
  return rulesets;
}

export function loadTargets(): Target[] {
  const targets: Target[] = [];
  for (const ruleset of loadRuleSets()) {
    targets.push(...ruleset.targets);
  }
  return targets;
}

export function loadRules(): Rule[] {
  const rules: Rule[] = [];
  for (const ruleset of loadRuleSets()) {
    rules.push(...ruleset.rules);
  }
  return rules;
}

export function loadExclusions(): Exclusion[] {
  const exclusions: Exclusion[] = [];
  for (const ruleset of loadRuleSets()) {
    exclusions.push(...ruleset.exclusions);
  }
  return exclusions;
}

export function loadSecureCookies(): SecureCookie[] {
  const securecookies: SecureCookie[] = [];
  for (const ruleset of loadRuleSets()) {
    securecookies.push(...ruleset.securecookies);
  }
  return securecookies;
}

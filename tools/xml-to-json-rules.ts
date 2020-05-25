import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { parse } from 'fast-xml-parser';

import { TargetObj } from '../src/target';
import { RuleObj } from '../src/rule';
import { ExclusionObj } from '../src/exclusion';
import { SecureCookieObj } from '../src/secure-cookie';
import { TestObj } from '../src/test';

import { RuleSetObj } from '../src/ruleset';

type Node = {
  attr: {
    [key: string]: any;
  };
};

function parseRuleSet(path: string): any {
  return parse(readFileSync(path, 'utf-8'), {
    attributeNamePrefix: '',
    ignoreAttributes: false,
    ignoreNameSpace: false,
    allowBooleanAttributes: false,
    parseNodeValue: true,
    parseAttributeValue: true,
    trimValues: true,
    parseTrueNumberOnly: false,
    arrayMode: false,
  });
}

function* iter<T>(
  node: Node | Node[],
  expectedKeys: Set<string>,
): IterableIterator<T> {
  if (node) {
    for (const attr of Array.isArray(node) ? node : [node]) {
      const keys = Object.keys(attr);

      if (
        keys.length !== expectedKeys.size ||
        keys.some((key) => !expectedKeys.has(key))
      ) {
        throw new Error(`Unexpected key in: ${JSON.stringify(keys)}`);
      }

      for (const key of expectedKeys) {
        if (keys.includes(key) === false) {
          throw new Error(
            `Expected key not found: ${key} (found: ${JSON.stringify(keys)})`,
          );
        }
      }

      // @ts-ignore
      yield attr;
    }
  }
}

(() => {
  const TARGET_ATTRS = new Set(['host']);
  const EXCLUSION_ATTRS = new Set(['pattern']);
  const RULE_ATTRS = new Set(['from', 'to']);
  const SECURE_COOKIE_ATTRS = new Set(['host', 'name']);
  const TEST_ATTRS = new Set(['url']);

  const rulesets: RuleSetObj[] = [];

  // TODO - use local folder for rules? Maybe shallow clone?
  const baseDir =
    '/home/remi/dev/repositories/public/https-everywhere/src/chrome/content/rules/';
  for (const file of readdirSync(baseDir)) {
    if (file.endsWith('.xml')) {
      const {
        ruleset: {
          default_off,
          note,
          name,
          target: targets,
          exclusion: exclusions,
          rule: rules,
          securecookie: securecookies,
          test: tests,
        },
      } = parseRuleSet(join(baseDir, file));

      if (default_off !== undefined) {
        console.log('Skip', name);
        continue;
      }

      const ruleset: RuleSetObj = {
        name,
        defaultState: true,
        scope: '',
        note,

        targets: [],
        rules: [],
        exclusions: [],
        securecookies: [],
        tests: [],
      };

      for (const target of iter<TargetObj>(targets, TARGET_ATTRS)) {
        ruleset.targets.push(target);

        // Generate implicit test cases from targets
        if (target.host.includes('*') === false) {
          ruleset.tests.push({ url: `http://${target.host}/` });
        }
      }

      for (const exclusion of iter<ExclusionObj>(exclusions, EXCLUSION_ATTRS)) {
        ruleset.exclusions.push(exclusion);
      }

      for (const rule of iter<RuleObj>(rules, RULE_ATTRS)) {
        ruleset.rules.push(rule);
      }

      for (const securecookie of iter<SecureCookieObj>(
        securecookies,
        SECURE_COOKIE_ATTRS,
      )) {
        ruleset.securecookies.push(securecookie);
      }

      for (const test of iter<TestObj>(tests, TEST_ATTRS)) {
        ruleset.tests.push(test);
      }

      rulesets.push(ruleset);
    }
  }

  writeFileSync(
    join(__dirname, '..', 'rulesets.json'),
    JSON.stringify(rulesets),
    'utf-8',
  );
})();

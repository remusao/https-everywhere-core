import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { parse } from "fast-xml-parser";

import { Target } from "./src/target";
import { Rule } from "./src/rule";
import { Exclusion } from "./src/exclusion";
import { SecureCookie } from './src/secure-cookie';
import { RuleSets } from "./src/rulesets";
import { RuleSet } from './src/ruleset';

function parseRuleSet(path: string): any {
  return parse(readFileSync(path, "utf-8"), {
    attributeNamePrefix: "",
    attrNodeName: "attr", //default is 'false'
    textNodeName: "#text",
    ignoreAttributes: false,
    ignoreNameSpace: false,
    allowBooleanAttributes: false,
    parseNodeValue: true,
    parseAttributeValue: true,
    trimValues: true,
    cdataTagName: "__cdata", //default is 'false'
    cdataPositionChar: "\\c",
    parseTrueNumberOnly: false,
    arrayMode: false, //"strict"
  });
}

function* iter(node: any, expectedKeys: Set<string>) {
  if (node) {
    for (const { attr } of Array.isArray(node) ? node : [node]) {
      const keys = Object.keys(attr);
      if (
        keys.length !== expectedKeys.size ||
        keys.some(key => !expectedKeys.has(key))
      ) {
        throw new Error(`Unexpected key in: ${JSON.stringify(keys)}`);
      }

      yield attr;
    }
  }
}

(() => {
  const TARGET_ATTRS = new Set(['host']);
  const EXCLUSION_ATTRS = new Set(['pattern']);
  const RULE_ATTRS = new Set(['from', 'to']);
  const SECURE_COOKIE_ATTRS = new Set(['host', 'name']);

  let ruleSetId = 0;
  const rulesets: RuleSet[] = [];

  // TODO - create intermediary representation using a RuleSet class which can
  // be given to the RuleSets for initialization/update. And retrieved on match.
  const baseDir =
    "/home/remi/dev/repositories/public/https-everywhere/src/chrome/content/rules/";
  for (const file of readdirSync(baseDir)) {
    if (file.endsWith(".xml")) {
      // const jsRuleSet = new RuleSet();
      ruleSetId += 1;
      const { ruleset: {
        attr: {
          // platform,
          default_state,
          note,
          name,
        },
        target: targets,
        exclusion: exclusions,
        rule: rules,
        securecookie: securecookies,
      } } = parseRuleSet(join(baseDir, file));

      const ruleset = new RuleSet(name, default_state, null, note);
      // TODO: const rulesetId = rule

      for (const { host } of iter(targets, TARGET_ATTRS)) {
        ruleset.targets.push(new Target(host, ruleSetId)); // TODO ruleset ID?
      }

      for (const { pattern } of iter(exclusions, EXCLUSION_ATTRS)) {
        ruleset.exclusions.push(new Exclusion(pattern, ruleSetId)); // TODO ruleset ID?
      }

      for (const { from, to } of iter(rules, RULE_ATTRS)) {
        ruleset.rules.push(new Rule(from, to, ruleSetId)); // TODO ruleset ID?
      }

      for (const { host, name } of iter(securecookies, SECURE_COOKIE_ATTRS)) {
        ruleset.securecookies.push(new SecureCookie(host, name, ruleSetId)); // TODO ruleset ID?
      }

      rulesets.push(ruleset);
    }
  }

  console.time('Create engine');
  const engine = RuleSets.fromRuleSets(rulesets);
  console.timeEnd('Create engine');
  console.time('Serialize engine');
  const serialized = engine.serialize();
  console.timeEnd('Serialize engine');

  console.time('Deserialize engine');
  RuleSets.deserialize(serialized);
  console.timeEnd('Deserialize engine');
  console.log('Size', serialized.byteLength);
  writeFileSync('engine.bin', serialized);
})();

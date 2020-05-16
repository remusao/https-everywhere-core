import { expect } from "chai";
import "mocha";

import { RuleSets } from "../src/rulesets";
import { RuleSet } from "../src/ruleset";
import { Target } from "../src/target";
import { Rule } from "../src/rule";
import { Exclusion } from "../src/exclusion";

describe("#RuleSets", () => {
  it('ignores already-HTTPS', () => {
    const ruleset = new RuleSet('test')
    ruleset.targets.push(new Target('foo.com', 0));
    ruleset.rules.push(new Rule('^http:', 'https:', 0));

    const rulesets = RuleSets.fromRuleSets([ruleset]);
    expect(rulesets.rewriteToSecureRequest('https://foo.com/bar')).to.be.null;
  });

  it('matches simple target', () => {
    const ruleset = new RuleSet('test')
    ruleset.targets.push(new Target('foo.com', 0));
    ruleset.rules.push(new Rule('^http:', 'https:', 0));

    const rulesets = RuleSets.fromRuleSets([ruleset]);
    expect(rulesets.rewriteToSecureRequest('http://foo.com/bar')).to.be.eql('https://foo.com/bar');
  });

  it('cancelled by exclusion', () => {
    const ruleset = new RuleSet('test')
    ruleset.targets.push(new Target('foo.com', 0));
    ruleset.rules.push(new Rule('^http:', 'https:', 0));
    ruleset.exclusions.push(new Exclusion('^http://foo\\.com/bar$', 0));

    const rulesets = RuleSets.fromRuleSets([ruleset]);
    expect(rulesets.rewriteToSecureRequest('http://foo.com/bar')).to.be.null;
  });

});

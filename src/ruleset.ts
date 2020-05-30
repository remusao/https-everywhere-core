import { Target, TargetObj } from './target';
import { Rule, RuleObj } from './rule';
import { Exclusion, ExclusionObj } from './exclusion';
import { SecureCookie, SecureCookieObj } from './secure-cookie';
import { Test, TestObj } from './test';

export interface RuleSetObj {
  name: string;
  defaultState: boolean;
  exclusions: ExclusionObj[];
  rules: RuleObj[];
  securecookies: SecureCookieObj[];
  targets: TargetObj[];
  tests: TestObj[];
}

export class RuleSet implements RuleSetObj {
  static fromObj(
    {
      name,
      defaultState,
      exclusions,
      rules,
      securecookies,
      targets,
      tests,
    }: RuleSetObj,
    id: number,
  ): RuleSet {
    const ruleset = new RuleSet(name, id, defaultState);

    if (exclusions.length !== 0) {
      if (exclusions.length === 1) {
        ruleset.exclusions.push(Exclusion.fromObj(exclusions[0], id));
      } else {
        ruleset.exclusions.push(
          Exclusion.fromObj(
            {
              pattern: exclusions
                .map(({ pattern }) => `(?:${pattern})`)
                .join('|'),
            },
            id,
          ),
        );
      }
    }

    ruleset.targets.push(
      ...targets.map((target) => Target.fromObj(target, id)),
    );

    ruleset.rules.push(...rules.map((rule) => Rule.fromObj(rule, id)));

    ruleset.securecookies.push(
      ...securecookies.map((securecookie) =>
        SecureCookie.fromObj(securecookie, id),
      ),
    );

    ruleset.tests.push(...tests.map((test) => Test.fromObj(test, id)));

    return ruleset;
  }

  public exclusions: Exclusion[] = [];
  public rules: Rule[] = [];
  public securecookies: SecureCookie[] = [];
  public targets: Target[] = [];
  public tests: Test[] = [];
  public active: boolean;

  constructor(
    public readonly name: string,
    public readonly id: number,
    public readonly defaultState: boolean = true,
  ) {
    this.active = defaultState;
  }
}

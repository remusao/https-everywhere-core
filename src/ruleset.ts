import { Target, TargetObj } from './target';
import { Rule, RuleObj } from './rule';
import { Exclusion, ExclusionObj } from './exclusion';
import { SecureCookie, SecureCookieObj } from './secure-cookie';
import { Test, TestObj } from './test';

export interface RuleSetObj {
  name: string;
  defaultState: boolean;
  scope: any;
  note: string;
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
      scope,
      note,
      exclusions,
      rules,
      securecookies,
      targets,
      tests,
    }: RuleSetObj,
    id: number,
  ): RuleSet {
    const ruleset = new RuleSet(name, id, defaultState, scope, note);

    ruleset.targets.push(
      ...targets.map((target) => Target.fromObj(target, id)),
    );
    ruleset.exclusions.push(
      ...exclusions.map((exclusion) => Exclusion.fromObj(exclusion, id)),
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
    public readonly scope: any = '',
    public readonly note: string = '',
  ) {
    this.active = defaultState;
  }

  public getId(): number {
    let hash = 7907;

    for (let i = 0; i < this.name.length; i += 1) {
      hash = (hash * 33) ^ this.name.charCodeAt(i);
    }

    return hash >>> 0;
  }

  // NOTE: Currently, the ID of a ruleset is only defined based on its 'name'
  // attribute. Ideally, we would probably want the ID to be a function of all
  // components, so that it can be used as an equivalence check.
  // public getId(): number {
  //   let hash = (7907 * 33) ^ super.getId();
  //
  //   for (const exclusion of this.exclusions) {
  //     hash = (hash * 33) ^ exclusion.getId();
  //   }
  //
  //   for (const rule of this.rules) {
  //     hash = (hash * 33) ^ rule.getId();
  //   }
  //
  //   for (const securecookie of this.securecookies) {
  //     hash = (hash * 33) ^ securecookie.getId();
  //   }
  //
  //   for (const target of this.targets) {
  //     hash = (hash * 33) ^ target.getId();
  //   }
  //
  //   return hash >>> 0;
  // }
}

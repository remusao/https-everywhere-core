import { Target } from './target';
import { Rule } from './rule';
import { Exclusion } from './exclusion';
import { SecureCookie } from './secure-cookie';

export class RuleSetMeta {
  public active: boolean;

  constructor(
    public readonly name: string,
    public readonly defaultState: boolean = true,
    public readonly scope: any = '',
    public readonly note: string = ''
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
}

export class RuleSet extends RuleSetMeta {
  public exclusions: Exclusion[] = [];
  public rules: Rule[] = [];
  public securecookies: SecureCookie[] = [];
  public targets: Target[] = [];

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

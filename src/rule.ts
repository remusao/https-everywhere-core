import { StaticDataView, sizeOfRule, sizeOfRuleSetID } from './data-view';
import { Compression } from './compression';
import { Indexable } from './reverse-index';

export interface RuleObj {
  from: string;
  to: string;
}

export class Rule implements Indexable, RuleObj {
  static fromObj({ from, to }: RuleObj, ruleset: number): Rule {
    return new Rule(from, to, ruleset);
  }

  static deserialize(buffer: StaticDataView): Rule {
    return new Rule(buffer.getRule(), buffer.getRule(), buffer.getRuleSetID());
  }

  private lazyFromRe: RegExp | undefined = undefined;

  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly ruleset: number,
  ) {}

  toString(): string {
    return `Rule(${this.from}, ${this.to}, ${this.ruleset})`;
  }

  serialize(buffer: StaticDataView): void {
    buffer.pushRule(this.from);
    buffer.pushRule(this.to);
    buffer.pushRuleSetID(this.ruleset);
  }

  getSerializedSize(compression: Compression): number {
    return (
      sizeOfRule(this.from, compression) +
      sizeOfRule(this.to, compression) +
      sizeOfRuleSetID()
    );
  }

  getTokens(): Uint32Array {
    return new Uint32Array([this.ruleset]);
  }

  rewrite(url: string): string | null {
    // Special case.
    if (this.from === '^http:' && this.to === 'https:') {
      if (url.startsWith('http:')) {
        return `https:${url.slice(5)}`;
      }

      return null;
    }

    // Fallback to RegExp.
    if (this.lazyFromRe === undefined) {
      this.lazyFromRe = new RegExp(this.from);
    }

    const rewritten = url.replace(this.lazyFromRe, this.to);
    if (rewritten === url) {
      return null;
    }

    return rewritten;
  }
}

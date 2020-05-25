import { StaticDataView, sizeOfExclusion, sizeOfRuleSetID } from './data-view';
import { Compression } from './compression';
import { tokenizeRegexInPlace } from './utils';
import { TOKENS_BUFFER } from './tokens-buffer';
import { Indexable } from './reverse-index';

export interface ExclusionObj {
  pattern: string;
}

export class Exclusion implements Indexable, ExclusionObj {
  static fromObj({ pattern }: ExclusionObj, ruleset: number): Exclusion {
    return new Exclusion(pattern, ruleset);
  }

  static deserialize(buffer: StaticDataView): Exclusion {
    return new Exclusion(buffer.getExclusion(), buffer.getRuleSetID());
  }

  private lazyPatternRe: RegExp | undefined;

  constructor(
    public readonly pattern: string,
    public readonly ruleset: number,
  ) {
    this.lazyPatternRe = undefined;
  }

  toString(): string {
    return `Exclusion(${this.pattern}, ${this.ruleset})`;
  }

  serialize(buffer: StaticDataView): void {
    buffer.pushExclusion(this.pattern);
    buffer.pushRuleSetID(this.ruleset);
  }

  getSerializedSize(compression: Compression): number {
    return sizeOfExclusion(this.pattern, compression) + sizeOfRuleSetID();
  }

  getTokens(): Uint32Array {
    // TODO - add ruleset ID in tokens
    TOKENS_BUFFER.reset();
    tokenizeRegexInPlace(this.pattern, TOKENS_BUFFER);
    return TOKENS_BUFFER.slice();
  }

  match(url: string): boolean {
    if (this.lazyPatternRe === undefined) {
      this.lazyPatternRe = new RegExp(this.pattern);
    }

    return this.lazyPatternRe.test(url);
  }
}

import { StaticDataView, sizeOfExclusion, sizeOfByte } from "./data-view";
import { Compression } from "./compression";
import { tokenizeRegexInPlace } from "./utils";
import { TOKENS_BUFFER } from "./tokens-buffer";
import { Indexable } from "./reverse-index";

export class Exclusion implements Indexable {
  static deserialize(buffer: StaticDataView): Exclusion {
    return new Exclusion(buffer.getExclusion(), buffer.getUint32());
  }

  private lazyPatternRe: RegExp | undefined;

  constructor(
    public readonly pattern: string,
    public readonly ruleset: number
  ) {
    this.lazyPatternRe = undefined;
  }

  getId(): number {
    let hash = (7907 * 33) ^ this.ruleset;

    for (let i = 0; i < this.pattern.length; i += 1) {
      hash = (hash * 33) ^ this.pattern.charCodeAt(i);
    }

    return hash >>> 0;
  }

  serialize(buffer: StaticDataView): void {
    buffer.pushExclusion(this.pattern);
    buffer.pushUint32(this.ruleset);
  }

  getSerializedSize(compression: Compression): number {
    return sizeOfExclusion(this.pattern, compression) + 4 * sizeOfByte();
  }

  getTokens(): Uint32Array {
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

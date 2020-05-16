import { StaticDataView, sizeOfRule, sizeOfByte } from "./data-view";
import { Compression } from "./compression";
import { Indexable } from "./reverse-index";

export class Rule implements Indexable {
  static deserialize(buffer: StaticDataView): Rule {
    return new Rule(buffer.getRule(), buffer.getRule(), buffer.getUint32());
  }

  private lazyFromRe: RegExp | undefined;

  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly ruleset: number
  ) {
    this.lazyFromRe = undefined;
  }

  serialize(buffer: StaticDataView): void {
    buffer.pushRule(this.from);
    buffer.pushRule(this.to);
    buffer.pushUint32(this.ruleset);
  }

  getSerializedSize(compression: Compression): number {
    return (
      sizeOfRule(this.from, compression) +
      sizeOfRule(this.to, compression) +
      4 * sizeOfByte()
    );
  }

  getId(): number {
    let hash = (7907 * 33) ^ this.ruleset;

    for (let i = 0; i < this.from.length; i += 1) {
      hash = (hash * 33) ^ this.from.charCodeAt(i);
    }

    for (let i = 0; i < this.to.length; i += 1) {
      hash = (hash * 33) ^ this.to.charCodeAt(i);
    }

    return hash >>> 0;
  }

  getTokens(): Uint32Array {
    return new Uint32Array([this.ruleset]);
  }

  rewrite(url: string): string | null {
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

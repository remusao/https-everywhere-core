import { StaticDataView, sizeOfSecurecookie, sizeOfByte } from "./data-view";
import { Compression } from "./compression";
import { Indexable } from "./reverse-index";
import { tokenizeRegexInPlace } from "./utils";
import { TOKENS_BUFFER } from "./tokens-buffer";

export interface Cookie {
  domain: string;
  name: string;
}

export class SecureCookie implements Indexable {
  static deserialize(buffer: StaticDataView): SecureCookie {
    return new SecureCookie(
      buffer.getSecurecookie(),
      buffer.getSecurecookie(),
      buffer.getUint32()
    );
  }

  private lazyHostRe: RegExp | undefined;
  private lazyNameRe: RegExp | undefined;

  constructor(
    public readonly host: string,
    public readonly name: string,
    public readonly ruleset: number
  ) {
    this.lazyHostRe = undefined;
    this.lazyNameRe = undefined;
  }

  serialize(buffer: StaticDataView): void {
    buffer.pushSecurecookie(this.host);
    buffer.pushSecurecookie(this.name);
    buffer.pushUint32(this.ruleset);
  }

  getSerializedSize(compression: Compression): number {
    return (
      sizeOfSecurecookie(this.host, compression) +
      sizeOfSecurecookie(this.name, compression) +
      4 * sizeOfByte()
    );
  }

  getId(): number {
    let hash = (7907 * 33) ^ this.ruleset;

    for (let i = 0; i < this.host.length; i += 1) {
      hash = (hash * 33) ^ this.host.charCodeAt(i);
    }

    for (let i = 0; i < this.name.length; i += 1) {
      hash = (hash * 33) ^ this.name.charCodeAt(i);
    }

    return hash >>> 0;
  }

  getTokens(): Uint32Array {
    TOKENS_BUFFER.reset();
    tokenizeRegexInPlace(this.host, TOKENS_BUFFER);
    tokenizeRegexInPlace(this.name, TOKENS_BUFFER);
    return TOKENS_BUFFER.slice();
  }

  shouldSecure(hostname: string, name: string): boolean {
    if (this.lazyHostRe === undefined) {
      this.lazyHostRe = new RegExp(this.host);
    }

    if (this.lazyNameRe === undefined) {
      this.lazyNameRe = new RegExp(this.name);
    }

    return this.lazyHostRe.test(hostname) && this.lazyNameRe.test(name);
  }
}

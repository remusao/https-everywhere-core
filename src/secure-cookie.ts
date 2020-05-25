import {
  StaticDataView,
  sizeOfSecurecookie,
  sizeOfRuleSetID,
} from './data-view';
import { Compression } from './compression';
import { Indexable } from './reverse-index';
import { tokenizeRegexInPlace } from './utils';
import { TOKENS_BUFFER } from './tokens-buffer';

export interface SecureCookieObj {
  host: string;
  name: string;
}

export interface Cookie {
  domain: string;
  name: string;
}

export class SecureCookie implements Indexable, SecureCookieObj {
  static fromObj(
    { host, name }: SecureCookieObj,
    ruleset: number,
  ): SecureCookie {
    return new SecureCookie(host, name, ruleset);
  }

  static deserialize(buffer: StaticDataView): SecureCookie {
    return new SecureCookie(
      buffer.getSecurecookie(),
      buffer.getSecurecookie(),
      buffer.getRuleSetID(),
    );
  }

  private lazyHostRe: RegExp | undefined = undefined;
  private lazyNameRe: RegExp | undefined = undefined;

  constructor(
    public readonly host: string,
    public readonly name: string,
    public readonly ruleset: number,
  ) {}

  toString(): string {
    return `SecureCookie(${this.host}, ${this.name}, ${this.ruleset})`;
  }

  serialize(buffer: StaticDataView): void {
    buffer.pushSecurecookie(this.host);
    buffer.pushSecurecookie(this.name);
    buffer.pushRuleSetID(this.ruleset);
  }

  getSerializedSize(compression: Compression): number {
    return (
      sizeOfSecurecookie(this.host, compression) +
      sizeOfSecurecookie(this.name, compression) +
      sizeOfRuleSetID()
    );
  }

  getTokens(): Uint32Array {
    TOKENS_BUFFER.reset();

    if (this.host !== '.+') {
      tokenizeRegexInPlace(this.host, TOKENS_BUFFER);
    }

    if (this.name !== '.+') {
      tokenizeRegexInPlace(this.name, TOKENS_BUFFER);
    }

    return TOKENS_BUFFER.slice();
  }

  private matchHostname(hostname: string): boolean {
    if (this.host === '.+') {
      return true;
    }

    if (this.lazyHostRe === undefined) {
      this.lazyHostRe = new RegExp(this.host);
    }

    return this.lazyHostRe.test(hostname);
  }

  private matchName(name: string): boolean {
    if (this.name === '.+') {
      return true;
    }

    if (this.lazyNameRe === undefined) {
      this.lazyNameRe = new RegExp(this.name);
    }

    return this.lazyNameRe.test(name);
  }

  shouldSecure(hostname: string, name: string): boolean {
    return this.matchHostname(hostname) && this.matchName(name);
  }
}

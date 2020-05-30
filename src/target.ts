import { StaticDataView, sizeOfTarget, sizeOfRuleSetID } from './data-view';
import { Compression } from './compression';
import { tokenizeHostname } from './utils';
import { Indexable } from './reverse-index';

export interface TargetObj {
  host: string;
}

export class Target implements Indexable, TargetObj {
  static fromObj({ host }: TargetObj, ruleset: number): Target {
    return new Target(host, ruleset);
  }

  static deserialize(buffer: StaticDataView): Target {
    return new Target(buffer.getTarget(), buffer.getRuleSetID());
  }

  constructor(public readonly host: string, public readonly ruleset: number) {}

  toString(): string {
    return `Target(${this.host}, ${this.ruleset})`;
  }

  serialize(buffer: StaticDataView): void {
    buffer.pushTarget(this.host);
    buffer.pushRuleSetID(this.ruleset);
  }

  getSerializedSize(compression: Compression): number {
    return sizeOfTarget(this.host, compression) + sizeOfRuleSetID();
  }

  getTokens(): Uint32Array {
    return tokenizeHostname(this.host);
  }

  match(hostname: string): boolean {
    if (this.host === '*') {
      return hostname.includes('.') === false;
    }

    // NOTE: currently only handle one wildcard as it seems that there is no
    // case of double-wildcard in all rules.

    // Handle leading wildcard
    if (this.host.startsWith('*.')) {
      const host = this.host.slice(2);
      const start = hostname.indexOf(host);

      if (
        start === -1 ||
        start === 0 ||
        hostname.length - start !== host.length
      ) {
        return false;
      }

      // ax.phobos.apple.com.edgesuite.net
      //  *.phobos.apple.com
      //    ^ start = 3

      return hostname[start - 1] === '.';
    }

    // Handle trailing wildcard
    if (this.host.endsWith('.*')) {
      const end = hostname.lastIndexOf('.');
      if (end === -1) {
        return false;
      }

      return hostname.slice(0, end) === this.host.slice(0, -2);
    }

    // This should be an exact match
    return hostname === this.host;
  }
}

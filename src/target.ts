import { StaticDataView, sizeOfTarget, sizeOfByte } from "./data-view";
import { Compression } from './compression';
import { fastHash } from "./utils";
import { Indexable } from "./reverse-index";

export class Target implements Indexable {
  static deserialize(buffer: StaticDataView): Target {
    return new Target(buffer.getTarget(), buffer.getUint32());
  }

  constructor(public readonly host: string, public readonly ruleset: number) {}

  getId(): number {
    let hash = (7907 * 33) ^ this.ruleset;

    for (let i = 0; i < this.host.length; i += 1) {
      hash = (hash * 33) ^ this.host.charCodeAt(i);
    }

    return hash >>> 0;
  }

  serialize(buffer: StaticDataView): void {
    buffer.pushTarget(this.host);
    buffer.pushUint32(this.ruleset);
  }

  getSerializedSize(compression: Compression): number {
    return sizeOfTarget(this.host, compression) + 4 * sizeOfByte();
  }

  getTokens(): Uint32Array {
    // TODO - optimize
    return new Uint32Array(
      this.host
        .split(".")
        .filter((token) => token !== "*" && token !== "")
        .map(fastHash)
    );
  }

  match(hostname: string): boolean {
    let start = 0;
    let end = hostname.length;

    // NOTE: currently only handle one wildcard as it seems that there is no
    // case of double-wildcard in all rules.

    // Handle leading wildcard
    if (this.host.startsWith("*.")) {
      start = hostname.indexOf(".", start);
      if (start === -1) {
        return false;
      }

      return hostname.slice(start + 1) === this.host.slice(2);
    }

    // Handle trailing wildcard
    if (this.host.endsWith(".*")) {
      end = hostname.lastIndexOf(".", end);
      if (end === -1) {
        return false;
      }

      return hostname.slice(0, end) === this.host.slice(0, -2);
    }

    // This should be an exact match
    return hostname === this.host;
  }
}

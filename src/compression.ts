import { Smaz } from "@remusao/smaz";

import { StaticDataView, sizeOfStrings } from "./data-view";

export interface Codebooks {
  rules: string[];
  targets: string[];
  exclusions: string[];
  securecookies: string[];
}

export class Compression {
  static deserialize(buffer: StaticDataView): Compression {
    return new Compression({
      exclusions: buffer.getStrings(),
      rules: buffer.getStrings(),
      securecookies: buffer.getStrings(),
      targets: buffer.getStrings(),
    });
  }

  public readonly exclusions: Smaz;
  public readonly rules: Smaz;
  public readonly securecookies: Smaz;
  public readonly targets: Smaz;

  constructor({ exclusions, rules, securecookies, targets }: Codebooks) {
    this.exclusions = new Smaz(exclusions);
    this.rules = new Smaz(rules);
    this.securecookies = new Smaz(securecookies);
    this.targets = new Smaz(targets);
  }

  serialize(buffer: StaticDataView): void {
    buffer.pushStrings(this.exclusions.codebook);
    buffer.pushStrings(this.rules.codebook);
    buffer.pushStrings(this.securecookies.codebook);
    buffer.pushStrings(this.targets.codebook);
  }

  getSerializedSize(): number {
    return (
      sizeOfStrings(this.exclusions.codebook) +
      sizeOfStrings(this.rules.codebook) +
      sizeOfStrings(this.securecookies.codebook) +
      sizeOfStrings(this.targets.codebook)
    );
  }
}

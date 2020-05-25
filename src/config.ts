import { StaticDataView, sizeOfBool } from './data-view';

export class Config {
  public static deserialize(buffer: StaticDataView): Config {
    return new Config({
      tradeMemoryForUncertainty: buffer.getBool(),
    });
  }

  public readonly tradeMemoryForUncertainty: boolean;

  constructor({ tradeMemoryForUncertainty = false }: Partial<Config> = {}) {
    this.tradeMemoryForUncertainty = tradeMemoryForUncertainty;
  }

  public getSerializedSize(): number {
    // NOTE: this should always be the number of attributes and needs to be
    // updated when `Config` changes.
    return 1 * sizeOfBool();
  }

  public serialize(buffer: StaticDataView): void {
    buffer.pushBool(this.tradeMemoryForUncertainty);
  }
}

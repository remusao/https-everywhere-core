import { expect } from 'chai';
import 'mocha';

import { Compression } from '../src/compression';
import { Config } from '../src/config';
import { StaticDataView } from '../src/data-view';

describe('#Config', () => {
  it('defaults to safe', () => {
    expect(new Config().tradeMemoryForUncertainty).to.be.false;
  });

  it('#serialize/#deserialize/#getSerializedSize', () => {
    const buffer = StaticDataView.allocate(100, Compression.default());
    const config = new Config({ tradeMemoryForUncertainty: true });
    config.serialize(buffer);

    expect(
      config.getSerializedSize(),
      `estimated size should be ${buffer.pos}`,
    ).to.equal(buffer.pos);

    buffer.seekZero();
    expect(Config.deserialize(buffer), 'deserializing').to.eql(config);
  });
});

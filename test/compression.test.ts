import { expect } from 'chai';
import 'mocha';

import { Compression } from '../src/compression';
import { StaticDataView } from '../src/data-view';

describe('#Compression', () => {
  const compression = Compression.default();

  it('#serialize/#deserialize/#getSerializedSize', () => {
    const buffer = StaticDataView.allocate(50000, compression);
    compression.serialize(buffer);

    expect(
      compression.getSerializedSize(),
      `estimated size should be ${buffer.pos}`,
    ).to.equal(buffer.pos);

    buffer.seekZero();
    expect(Compression.deserialize(buffer), 'deserializing').to.eql(
      compression,
    );
  });
});

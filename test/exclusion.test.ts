import { expect } from 'chai';
import 'mocha';

import { loadExclusions } from './utils';

import { Compression } from '../src/compression';
import { StaticDataView } from '../src/data-view';
import { Exclusion } from '../src/exclusion';

describe('#Exclusion', () => {
  const exclusions = loadExclusions();

  it('#toString', () => {
    expect(new Exclusion('pattern', 42).toString()).to.equal(
      'Exclusion(pattern, 42)',
    );
  });

  it('#fromObj', () => {
    for (const exclusion of exclusions) {
      expect(
        Exclusion.fromObj({ pattern: exclusion.pattern }, exclusion.ruleset),
      ).to.eql(exclusion);
    }
  });

  it('#serialize/#deserialize/#getSerializedSize', () => {
    const compression = Compression.default();
    const buffer = StaticDataView.allocate(10000, compression);
    for (const exclusion of exclusions) {
      buffer.seekZero();
      exclusion.serialize(buffer);

      expect(
        exclusion.getSerializedSize(compression),
        `estimated size of ${exclusion} should be ${buffer.pos}`,
      ).to.equal(buffer.pos);

      buffer.seekZero();
      expect(
        Exclusion.deserialize(buffer),
        `deserializing ${exclusion}`,
      ).to.eql(exclusion);
    }
  });

  it('#getTokens', () => {
    for (const exclusion of exclusions) {
      expect(exclusion.getTokens()).to.eql(
        new Uint32Array([exclusion.ruleset]),
      );
    }
  });

  describe('#match', () => {
    it('simple regex', () => {
      const exclusion = new Exclusion('^http:', 42);
      for (let i = 0; i < 2; i += 1) {
        expect(exclusion.match('http://foo.com')).to.be.true;
      }
    });
  });
});

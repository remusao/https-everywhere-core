import { expect } from 'chai';
import 'mocha';

import { loadExclusions } from './utils';

import { fastHash } from '../src/utils';
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
    for (const [pattern, tokens] of [
      ['', []],
      ['foo', []],
      ['foo$', []],
      ['^foo', []],
      ['^foo$', ['foo']],
      ['^foo/bar$', ['foo', 'bar']],
      ['^http://foo/bar$', ['http', 'foo', 'bar']],
      ['^http://foo/bar|baz$', []],
      ['^http://foo/bar|baz$', []],
      ['^http|https://(?:foo)/bar$', []],
    ] as [string, string[]][]) {
      expect(new Exclusion(pattern, 42).getTokens(), pattern).to.eql(
        new Uint32Array(tokens.map(fastHash)),
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

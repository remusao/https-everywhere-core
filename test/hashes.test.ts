import { expect } from 'chai';
import 'mocha';

import { loadTargets } from './utils';

import { Compression } from '../src/compression';
import { Hashes } from '../src/hashes';
import { StaticDataView } from '../src/data-view';

describe('#Hashes', () => {
  const targets = loadTargets();

  it('#serialize/#deserialize/#getSerializedSize', () => {
    const hashes = new Hashes(
      targets.map(({ host, ruleset }) => [host, ruleset]),
    );
    const buffer = StaticDataView.allocate(10000000, Compression.noop());
    hashes.serialize(buffer);

    expect(
      hashes.getSerializedSize(),
      `estimated size should be ${buffer.pos}`,
    ).to.equal(buffer.pos);

    buffer.seekZero();
    expect(Hashes.deserialize(buffer), 'deserializing').to.eql(hashes);
  });

  it('#iter', () => {
    const hashes = new Hashes([
      ['foo.com', 1],
      ['bar.com', 2],
      ['baz.com', 1],
    ]);
    for (const [hostname, expected] of [
      ['foo.com', [1]],
      ['bar.com', [2]],
      ['baz.com', [1]],
      ['example.com', []],
      ['foo', []],
    ] as [string, [number]][]) {
      const rulesets: number[] = [];
      hashes.iter(hostname, (ruleset) => {
        rulesets.push(ruleset);
      });
      expect(rulesets).to.eql(expected);
    }
  });
});

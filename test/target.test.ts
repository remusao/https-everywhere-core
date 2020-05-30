import { expect } from 'chai';
import 'mocha';

import { loadTargets } from './utils';

import { Compression } from '../src/compression';
import { StaticDataView } from '../src/data-view';
import { fastHash } from '../src/utils';
import { Target } from '../src/target';

describe('#Target', () => {
  const targets = loadTargets();

  it('#toString', () => {
    expect(new Target('foo', 42).toString()).to.equal('Target(foo, 42)');
  });

  it('#fromObj', () => {
    for (const target of targets) {
      expect(Target.fromObj({ host: target.host }, target.ruleset)).to.eql(
        target,
      );
    }
  });

  it('#serialize/#deserialize/#getSerializedSize', () => {
    const compression = Compression.default();
    const buffer = StaticDataView.allocate(10000, compression);
    for (const target of targets) {
      buffer.seekZero();
      target.serialize(buffer);

      expect(
        target.getSerializedSize(compression),
        `estimated size of ${target} should be ${buffer.pos}`,
      ).to.equal(buffer.pos);

      buffer.seekZero();
      expect(Target.deserialize(buffer), `deserializing ${target}`).to.eql(
        target,
      );
    }
  });

  it('#getTokens', () => {
    for (const target of targets) {
      expect(target.getTokens()).to.eql(
        new Uint32Array(
          target.host
            .split('.')
            .filter((token) => token !== '*')
            .map(fastHash),
        ),
      );
    }
  });

  describe('#match', () => {
    it('empty target against empty hostname', () => {
      expect(new Target('', 42).match('')).to.be.true;
    });

    it('target against empty hostname', () => {
      expect(new Target('foo', 42).match('')).to.be.false;
    });

    it('1-label hostname', () => {
      expect(new Target('', 42).match('foo')).to.be.false;
      expect(new Target('foo', 42).match('foo')).to.be.true;
      expect(new Target('*', 42).match('foo')).to.be.true;
      expect(new Target('*.com', 42).match('foo')).to.be.false;
      expect(new Target('foo.*', 42).match('foo')).to.be.false;
    });

    it('match with leading wildcard target should be suffix match', () => {
      expect(
        new Target('*.phobos.apple.com', 42).match(
          'ax.phobos.apple.com.edgesuite.net',
        ),
      ).to.be.false;
    });

    it('real targets', () => {
      for (const target of targets) {
        let hostname = target.host;

        if (hostname.startsWith('*.')) {
          hostname = `foo.${hostname.slice(2)}`;
        }

        if (hostname.endsWith('.*')) {
          hostname = `${hostname.slice(0, -2)}.com`;
        }

        expect(target.match(hostname), `${target} to match ${hostname}`).to.be
          .true;
      }
    });
  });
});

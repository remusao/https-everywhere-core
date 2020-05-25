import { expect } from 'chai';
import 'mocha';

import { loadRules } from './utils';

import { Compression } from '../src/compression';
import { StaticDataView } from '../src/data-view';
import { Rule } from '../src/rule';

describe('#Rule', () => {
  const rules = loadRules();

  it('#toString', () => {
    expect(new Rule('from', 'to', 42).toString()).to.equal(
      'Rule(from, to, 42)',
    );
  });

  it('#fromObj', () => {
    for (const rule of rules) {
      expect(
        Rule.fromObj({ from: rule.from, to: rule.to }, rule.ruleset),
      ).to.eql(rule);
    }
  });

  it('#serialize/#deserialize/#getSerializedSize', () => {
    const compression = Compression.default();
    const buffer = StaticDataView.allocate(10000, compression);
    for (const rule of rules) {
      buffer.seekZero();
      rule.serialize(buffer);

      expect(
        rule.getSerializedSize(compression),
        `estimated size of ${rule} should be ${buffer.pos}`,
      ).to.equal(buffer.pos);

      buffer.seekZero();
      expect(Rule.deserialize(buffer), `deserializing ${rule}`).to.eql(rule);
    }
  });

  it('#getTokens', () => {
    for (const rule of rules) {
      expect(rule.getTokens()).to.eql(new Uint32Array([rule.ruleset]));
    }
  });

  describe('#rewrite', () => {
    it('^http: => https:', () => {
      expect(
        new Rule('^http:', 'https:', 42).rewrite('http://foo.com'),
      ).to.equal('https://foo.com');

      expect(new Rule('^http:', 'https:', 42).rewrite('https://foo.com')).to.be
        .null;
    });

    it('more complex', () => {
      const rule = new Rule('^foo-bar:', 'https:', 42);
      for (let i = 0; i < 2; i += 1) {
        expect(rule.rewrite('foo-bar://example.com')).to.equal(
          'https://example.com',
        );
      }
    });

    it('returns null if no change', () => {
      expect(new Rule('^http:', 'http:', 42).rewrite('http://foo.com')).to.be
        .null;
    });
  });
});

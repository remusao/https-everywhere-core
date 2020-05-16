import { expect } from 'chai';
import 'mocha';

import { fastHash } from '../src/utils';
import { Target } from '../src/target';

function t(tokens: string[]): Uint32Array {
  return new Uint32Array(tokens.map(fastHash));
}

describe('#Target', () => {
  describe('#getTokens', () => {
    it('empty host', () => {
      expect(new Target('', 0).getTokens()).to.be.empty;
    });

    it('only wildcard', () => {
      expect(new Target('*', 0).getTokens()).to.be.empty;
    });

    it('left wildcard', () => {
      expect(new Target('*.foo', 0).getTokens()).to.eql(t(['foo']));
    });

    it('right wildcard', () => {
      expect(new Target('foo.*', 0).getTokens()).to.eql(t(['foo']));
    });
  });
});

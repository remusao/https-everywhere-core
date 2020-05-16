import { expect } from 'chai';
import 'mocha';

import { Rule } from '../src/rule';

describe('#Rule', () => {
  describe('#getTokens', () => {
    it('returns ruleset', () => {
      expect(new Rule('', '', 42).getTokens()).to.eql(new Uint32Array([42]));
    });
  });
});

import { expect } from 'chai';
import 'mocha';

import { loadSecureCookies } from './utils';

import { Compression } from '../src/compression';
import { StaticDataView } from '../src/data-view';
import { fastHash } from '../src/utils';
import { SecureCookie } from '../src/secure-cookie';

describe('#SecureCookie', () => {
  const securecookies = loadSecureCookies();

  it('#toString', () => {
    expect(new SecureCookie('host', 'name', 42).toString()).to.equal('SecureCookie(host, name, 42)');
  });

  it('#fromObj', () => {
    for (const securecookie of securecookies) {
      expect(SecureCookie.fromObj({ host: securecookie.host, name: securecookie.name }, securecookie.ruleset)).to.eql(
        securecookie,
      );
    }
  });

  it('#serialize/#deserialize/#getSerializedSize', () => {
    const compression = Compression.default();
    const buffer = StaticDataView.allocate(10000, compression);
    for (const securecookie of securecookies) {
      buffer.seekZero();
      securecookie.serialize(buffer);

      expect(
        securecookie.getSerializedSize(compression),
        `estimated size of ${securecookie} should be ${buffer.pos}`,
      ).to.equal(buffer.pos);

      buffer.seekZero();
      expect(SecureCookie.deserialize(buffer), `deserializing ${securecookie}`).to.eql(
        securecookie,
      );
    }
  });

  it('#getTokens', () => {
    for (const [pattern, tokens] of [
      ['', []],
      ['.+', []],
      ['foo', []],
      ['foo$', []],
      ['^foo', []],
      ['^foo$', ['foo']],
      ['^foo/bar$', ['foo', 'bar']],
      ['^http://foo/bar$', ['http', 'foo', 'bar']],
    ] as [string, string[]][]) {
      // host only
      expect(new SecureCookie(pattern, '', 42).getTokens(), pattern).to.eql(
        new Uint32Array(tokens.map(fastHash)),
      );

      // name only
      expect(new SecureCookie('', pattern, 42).getTokens(), pattern).to.eql(
        new Uint32Array(tokens.map(fastHash)),
      );

      // both
      expect(new SecureCookie(pattern, pattern, 42).getTokens(), pattern).to.eql(
        new Uint32Array([
          ...tokens.map(fastHash),
          ...tokens.map(fastHash),
        ]),
      );
    }
  });

  describe('#match', () => {
    it('all hosts and all names', () => {
      const securecookie = new SecureCookie('.+', '.+', 42);
      expect(securecookie.shouldSecure('foo', 'bar')).to.be.true;
      expect(securecookie.shouldSecure('', 'bar')).to.be.true;
      expect(securecookie.shouldSecure('foo', '')).to.be.true;
      expect(securecookie.shouldSecure('', '')).to.be.true;
    });

    it('simple regexps', () => {
      const securecookie = new SecureCookie('^foo\\.bar$', '^name$', 42);
      expect(securecookie.shouldSecure('foo.bar', 'name')).to.be.true;
      expect(securecookie.shouldSecure('foo+bar', 'name')).to.be.false;
      expect(securecookie.shouldSecure('foo.bar.baz', 'name')).to.be.false;

      expect(securecookie.shouldSecure('foo.bar', '')).to.be.false;
      expect(securecookie.shouldSecure('foo.bar', 'NAME')).to.be.false;
    });
  });
});

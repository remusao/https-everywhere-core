import { expect } from "chai";
import "mocha";

import { fastHash } from "../src/utils";
import { Exclusion } from "../src/exclusion";

function t(tokens: string[]): Uint32Array {
  return new Uint32Array(tokens.map(fastHash));
}

describe("#Exclusion", () => {
  describe("#getTokens", () => {
    it("empty pattern", () => {
      expect(new Exclusion("", 0).getTokens()).to.be.empty;
    });

    it("plain pattern", () => {
      expect(new Exclusion("^foo$", 0).getTokens()).to.eql(t(["foo"]));
    });

    it("url", () => {
      expect(new Exclusion("^http://foo\\.com/$", 0).getTokens()).to.eql(
        t(["http", "foo", "com"])
      );
    });

    for (const [pattern, tokens] of [
      ['&amp;Signature=', ['amp', 'Signature']],
      ['\\.crl$', ['crl']],
      ['\\.crl', []],
      ['\\.js(?:$|\\?)', []],
      ['^(?!http://((?:[a-z][a-z]|discussions|origin|photos|www)\\.)?flightaware\\.com/)', []],
      ['^http://((?:[^./]+\\.){2,}|(?:[^./]+\\.){3,})b(?:ooking|static)\\.com/', ['http', 'com']],
      ['^http://((ci|www)\\.)?openccc\\.net/$', ['http', 'net']], // TODO openccc?
      ['^http://((ssl|www)\\.)?instructables\\.com/(contest|id)/', ['http']],
      ['^http://((ssl|www)\\.)?instructables\\.com/(intl_static|json-api)/', ['http']],
      ['^http://(?!(?:dbg\\d+|v\\d+|www)\\.moatads\\.com/)', ['http']],
      ['^http://(?![^.]+\\.science\\.nature\\.nps\\.gov/)(?:[^.]+\\.){2,}nature\\.nps\\.gov/', ['http', 'nps', 'gov']],
      ['^http://(?!assets1\\.fastly\\.com\\.a\\.prod\\.)[\\w.-]+\\.prod\\.fastly\\.net/', ['http', 'prod', 'fastly', 'net']],
      ['ocsp\\.startssl', []],
    ] as [string, string[]][]) {
      it(`${pattern}`, () => {
        expect(new Exclusion(pattern, 0).getTokens()).to.eql(t(tokens));
      });
    }
  });
});

import { readFileSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { generate } from "@remusao/smaz-generate";
import { Smaz } from "@remusao/smaz";

import { RuleSets } from "../src/rulesets";
import { Target } from "../src/target";
import { Rule } from "../src/rule";
import { SecureCookie } from "../src/secure-cookie";
import { Exclusion } from "../src/exclusion";

function loadRuleSets(): RuleSets {
  return RuleSets.deserialize(
    new Uint8Array(readFileSync(resolve(join(__dirname, "..", "engine.bin"))))
  );
}

function getTargets(): Target[] {
  return loadRuleSets().targets.getFilters();
}

function getRules(): Rule[] {
  return loadRuleSets().rules.getFilters();
}

function getExclusions(): Exclusion[] {
  return loadRuleSets().exclusions.getFilters();
}

function getSecureCookies(): SecureCookie[] {
  return loadRuleSets().securecookies.getFilters();
}

function getStrings(kind: string): string[] {
  switch (kind) {
    case "targets":
      return getTargets().map((target) => target.host);
    case "exclusions":
      return getExclusions().map((exclusion) => exclusion.pattern);
    case "securecookies": {
      const strings: string[] = [];
      for (const securecookie of getSecureCookies()) {
        strings.push(securecookie.host);
        strings.push(securecookie.name);
      }
      return strings;
    }
    case "rules": {
      const strings: string[] = [];
      for (const rule of getRules()) {
        strings.push(rule.from);
        strings.push(rule.to);
      }
      return strings;
    }
    default:
      throw new Error(`Unsupported codebook: ${kind}`);
  }
}

function validateCodebook(codebook: string[], strings: string[]): void {
  console.log("Validating codebook", codebook);
  console.log(`Checking ${strings.length} strings...`);

  const smaz = new Smaz(codebook);
  let maxSize = 0;
  let minSize = Number.MAX_SAFE_INTEGER;
  let totalSize = 0;
  let totalCompressed = 0;

  for (const str of strings) {
    const compressed = smaz.compress(str);
    const original = smaz.decompress(compressed);
    if (original !== str) {
      throw new Error(
        `Mismatch: ${str} vs. ${original} (compressed: ${compressed})`
      );
    }

    totalSize += str.length;
    totalCompressed += compressed.length;
    maxSize = Math.max(maxSize, str.length);
    minSize = Math.min(minSize, str.length);
  }

  console.log("Codebook validated:", {
    maxSize,
    minSize,
    totalSize,
    totalCompressed,
    compressionRatio: 100.0 * ((totalSize - totalCompressed) / totalSize),
  });
}

function generateCodebook(kind: string): string[] {
  const strings = getStrings(kind);
  console.log(`Generate codebook ${kind} using ${strings.length} strings.`);
  const codebook = generate(strings, {
    maxNgram: 65,
  });
  validateCodebook(codebook, strings);
  return codebook;
}

(() => {
  const kind = process.argv[process.argv.length - 1];
  const codebook = generateCodebook(kind);
  const output = resolve(__dirname, `../src/codebooks/${kind}.ts`);
  console.log("Updating", output);
  writeFileSync(
    output,
    [
      `export default ${JSON.stringify(
        codebook.sort((str1, str2) => {
          if (str1.length !== str2.length) {
            return str2.length - str1.length;
          }

          return str1.localeCompare(str2);
        }),
        null,
        2
      )};`,
    ].join("\n"),
    "utf-8"
  );
})();

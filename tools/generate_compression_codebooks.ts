import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { generate } from '@remusao/smaz-generate';
import { Smaz } from '@remusao/smaz';

import { RuleSetObj, RuleSet } from '../src/ruleset';

function loadRuleSetsObjects(): RuleSetObj[] {
  return JSON.parse(
    readFileSync(resolve(join(__dirname, '..', 'rulesets.json')), 'utf-8'),
  );
}

function loadRuleSets(): RuleSet[] {
  let id = 1;
  const rulesets: RuleSet[] = [];
  for (const ruleset of loadRuleSetsObjects()) {
    rulesets.push(RuleSet.fromObj(ruleset, id++));
  }
  return rulesets;
}

function getTargets(): string[] {
  const strings: string[] = [];
  for (const { targets } of loadRuleSets()) {
    for (const { host } of targets) {
      strings.push(host);
    }
  }
  return strings;
}

function getRules(): string[] {
  const strings: string[] = [];
  for (const { rules } of loadRuleSets()) {
    for (const { from, to } of rules) {
      strings.push(from, to);
    }
  }
  return strings;
}

function getExclusions(): string[] {
  const strings: string[] = [];
  for (const { exclusions } of loadRuleSets()) {
    strings.push(exclusions.map(({ pattern }) => pattern).join('|'));
  }
  return strings;
}

function getSecureCookies(): string[] {
  const strings: string[] = [];
  for (const { securecookies } of loadRuleSets()) {
    for (const { host, name } of securecookies) {
      strings.push(host, name);
    }
  }
  return strings;
}

function getRuleSetMeta(): string[] {
  const strings: string[] = [];
  for (const { name } of loadRuleSets()) {
    strings.push(name);
  }
  return strings;
}

function getStrings(kind: string): string[] {
  switch (kind) {
    case 'targets':
      return getTargets();
    case 'exclusions':
      return getExclusions();
    case 'securecookies':
      return getSecureCookies();
    case 'rules':
      return getRules();
    case 'meta':
      return getRuleSetMeta();
    default:
      throw new Error(`Unsupported codebook: ${kind}`);
  }
}

function validateCodebook(codebook: string[], strings: string[]): void {
  console.log('Validating codebook', codebook);
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
        `Mismatch: ${str} vs. ${original} (compressed: ${compressed})`,
      );
    }

    totalSize += str.length;
    totalCompressed += compressed.length;
    maxSize = Math.max(maxSize, str.length);
    minSize = Math.min(minSize, str.length);
  }

  console.log('Codebook validated:', {
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
    maxNgram: 200,
  });
  validateCodebook(codebook, strings);
  return codebook;
}

(() => {
  const kind = process.argv[process.argv.length - 1];
  const codebook = generateCodebook(kind);
  const output = resolve(__dirname, `../src/codebooks/${kind}.ts`);
  console.log('Updating', output);
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
        2,
      )};`,
    ].join('\n'),
    'utf-8',
  );
})();

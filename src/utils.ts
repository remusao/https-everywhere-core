import { TokensBuffer, TOKENS_BUFFER } from './tokens-buffer';

export const HASH_SEED = 1453;

export function fastHash(str: string): number {
  let hash = HASH_SEED;

  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }

  return hash >>> 0;
}

export function isDigit(ch: number): boolean {
  // 48 == '0'
  // 57 == '9'
  return ch >= 48 && ch <= 57;
}

export function isAlpha(ch: number): boolean {
  // 65 == 'A'
  // 90 == 'Z'
  // 97 == 'a'
  // 122 === 'z'
  return (ch >= 97 && ch <= 122) || (ch >= 65 && ch <= 90);
}

function isAllowedCode(ch: number): boolean {
  return (
    isAlpha(ch) ||
    isDigit(ch) ||
    ch === 37 /* '%' */
  );
}

export function tokenizeInPlace(
  pattern: string,
  skipFirstToken: boolean,
  skipLastToken: boolean,
  buffer: TokensBuffer,
): void {
  const len = Math.min(pattern.length, buffer.remaining() * 2);
  let inside = false;
  let start = 0;
  let hash = HASH_SEED;

  for (let i = 0; i < len; i += 1) {
    const ch = pattern.charCodeAt(i);
    if (isAllowedCode(ch) === true) {
      if (inside === false) {
        hash = HASH_SEED;
        inside = true;
        start = i;
      }
      hash = (hash * 33) ^ ch;
    } else if (inside === true) {
      inside = false;
      if (
        i - start > 1 && // Ignore tokens of 1 character
        (skipFirstToken === false || start !== 0)
      ) {
        buffer.push(hash >>> 0);
      }
    }
  }

  if (
    inside === true &&
    skipLastToken === false &&
    pattern.length - start > 1 && // Ignore tokens of 1 character
    buffer.full() === false
  ) {
    buffer.push(hash >>> 0);
  }
}

export function tokenizeHostnameInPlace(
  pattern: string,
  buffer: TokensBuffer,
): void {
  let ignore = false;
  let hash = HASH_SEED;

  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern.charCodeAt(i);
    if (ch === 42 /* '*' */) {
      ignore = true;
    } else if (ch === 46 /* '.' */) {
      if (ignore === false) {
        buffer.push(hash >>> 0);
      }
      hash = HASH_SEED;
      ignore = false;
    } else if (ignore === false) {
      hash = (hash * 33) ^ ch;
    }
  }

  if (ignore === false && hash !== HASH_SEED) {
    buffer.push(hash >>> 0);
  }
}

export function tokenizeHostname(pattern: string): Uint32Array {
  TOKENS_BUFFER.reset();
  tokenizeHostnameInPlace(pattern, TOKENS_BUFFER);
  return TOKENS_BUFFER.slice();
}

export function tokenizeRegexInPlace(
  selector: string,
  tokens: TokensBuffer,
): void {
  let end = selector.length;
  let begin = 0;
  let prev: number = 0;

  // Try to find the longest safe *prefix* that we can tokenize
  for (; begin < end; begin += 1) {
    const code = selector.charCodeAt(begin);

    // If we encounter '|' before any other opening bracket, then it's not safe
    // to tokenize this filter (e.g.: 'foo|bar'). Instead we abort tokenization
    // to be safe.
    if (code === 124 /* '|' */) {
      return;
    }

    if (
      code === 40 /* '(' */ ||
      code === 42 /* '*' */ ||
      code === 43 /* '+' */ ||
      code === 63 /* '?' */ ||
      code === 91 /* '[' */ ||
      code === 123 /* '{' */ ||
      (code === 46 /* '.' */ && prev !== 92) /* '\' */ ||
      (code === 92 /* '\' */ && isAlpha(selector.charCodeAt(begin + 1)))
    ) {
      break;
    }

    prev = code;
  }

  // Try to find the longest safe *suffix* that we can tokenize
  prev = 0;
  for (; end >= begin; end -= 1) {
    const code = selector.charCodeAt(end);

    // If we encounter '|' before any other opening bracket, then it's not safe
    // to tokenize this filter (e.g.: 'foo|bar'). Instead we abort tokenization
    // to be safe.
    if (code === 124 /* '|' */) {
      return;
    }

    if (
      code === 41 /* ')' */ ||
      code === 42 /* '*' */ ||
      code === 43 /* '+' */ ||
      code === 63 /* '?' */ ||
      code === 93 /* ']' */ ||
      code === 125 /* '}' */ ||
      (code === 46 /* '.' */ &&
        selector.charCodeAt(end - 1) !== 92) /* '\' */ ||
      (code === 92 /* '\' */ && isAlpha(prev))
    ) {
      break;
    }

    prev = code;
  }

  if (end < begin) {
    // Full selector is safe
    const skipFirstToken: boolean = selector.charCodeAt(0) !== 94; /* '^' */
    const skipLastToken: boolean =
      selector.charCodeAt(selector.length - 1) !== 36; /* '$' */
    tokenizeInPlace(selector, skipFirstToken, skipLastToken, tokens);
  } else {
    // Tokenize prefix
    if (begin > 0) {
      tokenizeInPlace(selector.slice(0, begin), true, true, tokens);
    }

    // Tokenize suffix
    if (end < selector.length) {
      tokenizeInPlace(selector.slice(end + 1), true, true, tokens);
    }
  }
}

import { Compression } from './compression';
import crc32 from './crc32';

export const EMPTY_UINT8_ARRAY = new Uint8Array(0);
export const EMPTY_UINT32_ARRAY = new Uint32Array(0);

// Check if current architecture is little endian
const LITTLE_ENDIAN: boolean =
  new Int8Array(new Int16Array([1]).buffer)[0] === 1;

function align4(pos: number): number {
  // From: https://stackoverflow.com/a/2022194
  return (pos + 3) & ~0x03;
}

/**
 * Return size of of a serialized byte value.
 */
export function sizeOfByte(): number {
  return 1;
}

/**
 * Return size of of a serialized boolean value.
 */
export function sizeOfBool(): number {
  return 1;
}

/**
 * Return number of bytes needed to serialize `length`.
 */
export function sizeOfLength(length: number): number {
  return length <= 127 ? 1 : 5;
}

/**
 * Return number of bytes needed to serialize `array` Uint8Array typed array.
 *
 * WARNING: this only returns the correct size if `align` is `false`.
 */
export function sizeOfBytes(array: Uint8Array, align: boolean): number {
  return sizeOfBytesWithLength(array.length, align);
}

/**
 * Return number of bytes needed to serialize `array` Uint8Array typed array.
 *
 * WARNING: this only returns the correct size if `align` is `false`.
 */
export function sizeOfBytesWithLength(length: number, align: boolean): number {
  // Alignment is a tricky thing because it depends on the current offset in
  // the buffer at the time of serialization; which we cannot anticipate
  // before actually starting serialization. This means that we need to
  // potentially over-estimate the size (at most by 3 bytes) to make sure the
  // final size is at least equal or a bit bigger than necessary.
  return (align ? 3 : 0) + length + sizeOfLength(length);
}

/**
 * Return number of bytes needed to serialize `str` ASCII string.
 */
export function sizeOfASCII(str: string): number {
  return str.length + sizeOfLength(str.length);
}

export function sizeOfStrings(strings: readonly string[]): number {
  let size = sizeOfLength(strings.length);
  for (const str of strings) {
    size += sizeOfASCII(str);
  }
  return size;
}

export function sizeOfRuleSetID(): number {
  return 2 * sizeOfByte();
}

export function sizeOfTarget(str: string, compression: Compression): number {
  return sizeOfBytesWithLength(
    compression.targets.getCompressedSize(str),
    false, // align
  );
}

export function sizeOfRule(str: string, compression: Compression): number {
  return sizeOfBytesWithLength(
    compression.rules.getCompressedSize(str),
    false, // align
  );
}

export function sizeOfExclusion(str: string, compression: Compression): number {
  return sizeOfBytesWithLength(
    compression.exclusions.getCompressedSize(str),
    false, // align
  );
}

export function sizeOfSecurecookie(
  str: string,
  compression: Compression,
): number {
  return sizeOfBytesWithLength(
    compression.securecookies.getCompressedSize(str),
    false, // align
  );
}

/**
 * This abstraction allows to serialize efficiently low-level values of types:
 * string, uint8, uint16, uint32, etc. while hiding the complexity of managing
 * the current offset and growing. It should always be instantiated with a
 * big-enough length because this will not allow for resizing. To allow
 * deciding the required total size, function estimating the size needed to
 * store different primitive values are exposes as static methods.
 *
 * This class is also more efficient than the built-in `DataView`.
 *
 * The way this is used in practice is that you write pairs of function to
 * serialize and deserialize a given structure/class (with code being pretty
 * symetrical). In the serializer you `pushX` values, and in the deserializer
 * you use `getX` functions to get back the values.
 */
export class StaticDataView {
  /**
   * Create an empty (i.e.: size = 0) StaticDataView.
   */
  public static empty(compression: Compression): StaticDataView {
    return StaticDataView.fromUint8Array(EMPTY_UINT8_ARRAY, compression);
  }

  /**
   * Instantiate a StaticDataView instance from `array` of type Uint8Array.
   */
  public static fromUint8Array(
    array: Uint8Array,
    compression: Compression,
  ): StaticDataView {
    return new StaticDataView(array, compression);
  }

  /**
   * Instantiate a StaticDataView with given `capacity` number of bytes.
   */
  public static allocate(
    capacity: number,
    compression: Compression,
  ): StaticDataView {
    return new StaticDataView(new Uint8Array(capacity), compression);
  }

  public pos: number;
  public buffer: Uint8Array;
  public compression: Compression;

  constructor(buffer: Uint8Array, compression: Compression) {
    if (LITTLE_ENDIAN === false) {
      // This check makes sure that we will not load the adblocker on a
      // big-endian system. This would not work since byte ordering is important
      // at the moment (mainly for performance reasons).
      throw new Error(
        'Adblocker currently does not support Big-endian systems',
      );
    }

    this.compression = compression;
    this.buffer = buffer;
    this.pos = 0;
  }

  public checksum(): number {
    return crc32(this.buffer, 0, this.pos);
  }

  public dataAvailable(): boolean {
    return this.pos < this.buffer.byteLength;
  }

  public setPos(pos: number): void {
    this.pos = pos;
  }

  public getPos(): number {
    return this.pos;
  }

  public seekZero(): void {
    this.pos = 0;
  }

  public slice(): Uint8Array {
    this.checkSize();
    return this.buffer.slice(0, this.pos);
  }

  public subarray(): Uint8Array {
    if (this.pos === this.buffer.byteLength) {
      return this.buffer;
    }

    this.checkSize();
    return this.buffer.subarray(0, this.pos);
  }

  /**
   * Make sure that `this.pos` is aligned on a multiple of 4.
   */
  public align4(): void {
    this.pos = align4(this.pos);
  }

  public set(buffer: Uint8Array): void {
    this.buffer = new Uint8Array(buffer);
    this.seekZero();
  }

  public pushBool(bool: boolean): void {
    this.pushByte(Number(bool));
  }

  public getBool(): boolean {
    return Boolean(this.getByte());
  }

  public setByte(pos: number, byte: number): void {
    this.buffer[pos] = byte;
  }

  public pushByte(octet: number): void {
    this.pushUint8(octet);
  }

  public getByte(): number {
    return this.getUint8();
  }

  public pushBytes(bytes: Uint8Array, align: boolean = false): void {
    this.pushLength(bytes.length);

    if (align === true) {
      this.align4();
    }

    this.buffer.set(bytes, this.pos);
    this.pos += bytes.byteLength;
  }

  public getBytes(align: boolean = false): Uint8Array {
    const numberOfBytes = this.getLength();

    if (align === true) {
      this.align4();
    }

    const bytes = this.buffer.subarray(this.pos, this.pos + numberOfBytes);
    this.pos += numberOfBytes;

    return bytes;
  }

  /**
   * Allows row access to the internal buffer through a Uint32Array acting like
   * a view. This is used for super fast writing/reading of large chunks of
   * Uint32 numbers in the byte array.
   */
  public getUint32ArrayView(desiredSize: number): Uint32Array {
    // Round this.pos to next multiple of 4 for alignement
    this.align4();

    // Short-cut when empty array
    if (desiredSize === 0) {
      return EMPTY_UINT32_ARRAY;
    }

    // Create non-empty view
    const view = new Uint32Array(
      this.buffer.buffer,
      this.pos + this.buffer.byteOffset,
      desiredSize,
    );
    this.pos += desiredSize * 4;
    return view;
  }

  public pushUint8(uint8: number): void {
    this.buffer[this.pos++] = uint8;
  }

  public getUint8(): number {
    return this.buffer[this.pos++];
  }

  public pushUint16(uint16: number): void {
    this.buffer[this.pos++] = uint16 >>> 8;
    this.buffer[this.pos++] = uint16;
  }

  public getUint16(): number {
    return ((this.buffer[this.pos++] << 8) | this.buffer[this.pos++]) >>> 0;
  }

  public pushUint32(uint32: number): void {
    this.buffer[this.pos++] = uint32 >>> 24;
    this.buffer[this.pos++] = uint32 >>> 16;
    this.buffer[this.pos++] = uint32 >>> 8;
    this.buffer[this.pos++] = uint32;
  }

  public getUint32(): number {
    return (
      (((this.buffer[this.pos++] << 24) >>> 0) +
        ((this.buffer[this.pos++] << 16) |
          (this.buffer[this.pos++] << 8) |
          this.buffer[this.pos++])) >>>
      0
    );
  }

  public pushASCII(str: string): void {
    this.pushLength(str.length);

    for (let i = 0; i < str.length; i += 1) {
      this.buffer[this.pos++] = str.charCodeAt(i);
    }
  }

  public getASCII(): string {
    const byteLength = this.getLength();
    this.pos += byteLength;

    return String.fromCharCode.apply(
      null,
      // @ts-ignore
      this.buffer.subarray(this.pos - byteLength, this.pos),
    );
  }

  public pushStrings(strings: readonly string[]): void {
    this.pushLength(strings.length);
    for (const str of strings) {
      this.pushASCII(str);
    }
  }

  public getStrings(): string[] {
    const numberOfStrings = this.getLength();
    const strings: string[] = [];
    for (let i = 0; i < numberOfStrings; i += 1) {
      strings.push(this.getASCII());
    }
    return strings;
  }

  public pushRuleSetID(id: number): void {
    this.pushUint16(id);
  }

  public getRuleSetID(): number {
    return this.getUint16();
  }

  public pushTarget(str: string): void {
    this.pushBytes(this.compression.targets.compress(str));
  }

  public getTarget(): string {
    return this.compression.targets.decompress(this.getBytes());
  }

  public pushRule(str: string): void {
    this.pushBytes(this.compression.rules.compress(str));
  }

  public getRule(): string {
    return this.compression.rules.decompress(this.getBytes());
  }

  public pushExclusion(str: string): void {
    this.pushBytes(this.compression.exclusions.compress(str));
  }

  public getExclusion(): string {
    return this.compression.exclusions.decompress(this.getBytes());
  }

  public pushSecurecookie(str: string): void {
    this.pushBytes(this.compression.securecookies.compress(str));
  }

  public getSecurecookie(): string {
    return this.compression.securecookies.decompress(this.getBytes());
  }

  private checkSize() {
    if (this.pos !== 0 && this.pos > this.buffer.byteLength) {
      throw new Error(
        `StaticDataView too small: ${this.buffer.byteLength}, but required ${this.pos} bytes`,
      );
    }
  }

  // Serialiez `length` with variable encoding to save space
  private pushLength(length: number): void {
    if (length <= 127) {
      this.pushUint8(length);
    } else {
      this.pushUint8(128);
      this.pushUint32(length);
    }
  }

  public getLength(): number {
    const lengthShort = this.getUint8();
    return lengthShort === 128 ? this.getUint32() : lengthShort;
  }
}

export interface TestObj {
  url: string;
}

export class Test implements TestObj {
  static fromObj({ url }: TestObj, ruleset: number): Test {
    return new Test(url, ruleset);
  }

  constructor(public readonly url: string, public readonly ruleset: number) {}
}

declare module 'zod' {
  export const z: {
    object: (shape: Record<string, unknown>) => any;
    string: (config?: unknown) => any;
    number: (config?: unknown) => any;
    array: (schema: unknown) => any;
    nullable: (schema: unknown) => any;
    optional: (schema: unknown) => any;
    literal: (value: unknown) => any;
    enum: (values: unknown[]) => any;
    unknown: () => any;
    record: (schema: unknown) => any;
    union: (...schemas: unknown[]) => any;
    ZodError: new (...args: unknown[]) => Error;
  };
}

declare module 'vitest' {
  export function describe(name: string, cb: () => void): void;
  export function it(name: string, cb: () => void | Promise<void>): void;
  export const expect: any;
}

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
  export function readdirSync(path: string, options?: { withFileTypes?: boolean }): Array<{ name: string; isFile(): boolean }>;
}

declare module 'node:path' {
  export function resolve(...segments: string[]): string;
  export function join(...segments: string[]): string;
  export function relative(from: string, to: string): string;
  const path: { resolve(...segments: string[]): string; join(...segments: string[]): string; relative(from: string, to: string): string };
  export default path;
}

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
};

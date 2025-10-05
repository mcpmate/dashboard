declare module "toml" {
  export function parse(source: string): any;
  export function stringify(data: any): string;

  const _default: {
    parse: typeof parse;
    stringify: typeof stringify;
  };
  export default _default;
}


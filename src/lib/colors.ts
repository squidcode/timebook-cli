import pc from 'picocolors';

export const c = {
  green: (s: string) => pc.green(s),
  red: (s: string) => pc.red(s),
  yellow: (s: string) => pc.yellow(s),
  blue: (s: string) => pc.blue(s),
  cyan: (s: string) => pc.cyan(s),
  gray: (s: string) => pc.gray(s),
  bold: (s: string) => pc.bold(s),
  dim: (s: string) => pc.dim(s),
};

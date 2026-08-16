export const GITHUB_URL = "https://github.com/Alike001/proofrail";
export const BOT_CHAIN_ID = 677;
export const DEFAULT_EXPLORER_URL = "https://scan.botchain.ai";

export function explorerUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_BOT_EXPLORER_URL ?? DEFAULT_EXPLORER_URL;
  return `${base.replace(/\/$/u, "")}/${path.replace(/^\//u, "")}`;
}

export function shortHex(value: string, edge = 8): string {
  if (value.length <= edge * 2 + 3) {
    return value;
  }
  return `${value.slice(0, edge + 2)}…${value.slice(-edge)}`;
}

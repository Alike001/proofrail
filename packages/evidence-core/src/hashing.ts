import { keccak256, sha256, toBytes } from "viem";
import type { Hex } from "viem";

export function hashCanonicalPacket(canonicalPacket: string): Hex {
  return keccak256(toBytes(canonicalPacket));
}

export function hashSourceSnapshot(snapshot: Uint8Array | string): Hex {
  const bytes =
    typeof snapshot === "string" ? new TextEncoder().encode(snapshot) : snapshot;
  return sha256(bytes);
}

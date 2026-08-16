import { EvidenceValidationError } from "./errors.js";

const CIK_PATTERN = /^\d{10}$/u;
const LEI_PATTERN = /^[A-Z0-9]{18}\d{2}$/u;

export function normalizeCik(input: string): string {
  const cik = input.trim();

  if (!CIK_PATTERN.test(cik) || cik === "0000000000") {
    throw new EvidenceValidationError(
      "INVALID_CIK",
      "CIK must contain exactly ten digits and cannot be all zeros."
    );
  }

  return cik;
}

export function normalizeLei(input: string): string {
  const lei = input.trim().toUpperCase();

  if (!LEI_PATTERN.test(lei)) {
    throw new EvidenceValidationError(
      "INVALID_LEI",
      "LEI must contain eighteen uppercase letters or digits followed by two check digits."
    );
  }

  if (leiMod97(lei) !== 1) {
    throw new EvidenceValidationError(
      "INVALID_LEI",
      "LEI checksum validation failed."
    );
  }

  return lei;
}

function leiMod97(lei: string): number {
  let remainder = 0;

  for (const character of lei) {
    const expanded = /\d/u.test(character)
      ? character
      : String(character.charCodeAt(0) - 55);

    for (const digit of expanded) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder;
}

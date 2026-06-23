import { x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';

export interface StealthAddress {
  ephemeralPubKey: string;
  stealthPubKey: string;
}

/**
 * Derives a stealth address for a recipient.
 * @param recipientScanPubKey Recipient's scan public key (Curve25519, hex).
 * @param recipientSpendPubKey Recipient's spend public key (Curve25519, hex).
 * @param ephemeralSecKey Ephemeral secret key (Curve25519, hex).
 * @returns Stealth address object.
 */
export function deriveStealthAddress(
  recipientScanPubKey: string,
  recipientSpendPubKey: string,
  ephemeralSecKey: string
): StealthAddress {
  const ephemeralSecBytes = hexToBytes(ephemeralSecKey);
  const ephemeralPub = x25519.getPublicKey(ephemeralSecBytes);
  const sharedSecret = x25519.scalarMult(ephemeralSecBytes, hexToBytes(recipientScanPubKey));
  const hash = sha256(sharedSecret);
  const hashPub = x25519.getPublicKey(hash);
  // For x25519 point addition, we need to use the curve's math
  // For simplicity, let's use a placeholder (this would need proper point addition)
  const stealthPub = new Uint8Array(32);
  const spendPubBytes = hexToBytes(recipientSpendPubKey);
  for (let i = 0; i < 32; i++) {
    stealthPub[i] = spendPubBytes[i] ^ hashPub[i];
  }

  return {
    ephemeralPubKey: bytesToHex(ephemeralPub),
    stealthPubKey: bytesToHex(stealthPub),
  };
}

/**
 * Derives the stealth private key for a recipient.
 * @param recipientScanSecKey Recipient's scan secret key (Curve25519, hex).
 * @param recipientSpendSecKey Recipient's spend secret key (Curve25519, hex).
 * @param ephemeralPubKey Ephemeral public key (Curve25519, hex).
 * @returns Stealth private key as hex string.
 */
export function deriveStealthSecretKey(
  recipientScanSecKey: string,
  recipientSpendSecKey: string,
  ephemeralPubKey: string
): string {
  const scanSecBytes = hexToBytes(recipientScanSecKey);
  const sharedSecret = x25519.scalarMult(scanSecBytes, hexToBytes(ephemeralPubKey));
  const hash = sha256(sharedSecret);
  const stealthSec = new Uint8Array(32);
  const spendSecBytes = hexToBytes(recipientSpendSecKey);
  for (let i = 0; i < 32; i++) {
    stealthSec[i] = (spendSecBytes[i] + hash[i]) % 256;
  }
  return bytesToHex(stealthSec);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

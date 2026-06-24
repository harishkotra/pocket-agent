import crypto from 'crypto';
import { keccak256 } from 'viem';

export interface SessionKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  sessionKeyHash: `0x${string}`;
}

/**
 * Generate a deterministic session key from a seed phrase + label,
 * or a random key if no seed is provided.
 *
 * Per Section 4.5 of the spec: the session key hash is keccak256(publicKey).
 */
export function generateSessionKey(seed?: string): SessionKeyPair {
  let material: Uint8Array;

  if (seed) {
    const h = crypto.createHash('sha256').update(seed).digest();
    material = h;
  } else {
    material = crypto.randomBytes(32);
  }

  // Use Ed25519-style key material:
  // In production this would be a real Ed25519 keypair from @noble/ed25519.
  // For the mock we derive a deterministic 32-byte public key from the seed.
  const publicKey = crypto.createHash('sha256').update(
    Buffer.concat([material, Buffer.from(':pub')])
  ).digest();

  const privateKey = crypto.createHash('sha256').update(
    Buffer.concat([material, Buffer.from(':priv')])
  ).digest();

  const sessionKeyHash = keccak256(publicKey);

  return { publicKey, privateKey, sessionKeyHash };
}



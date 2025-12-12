/**
 * Computes the SHA-256 hash of a string and returns it as a hexadecimal string.
 * @param input - The string to hash.
 * @returns Hexadecimal representation of the SHA-256 hash.
 */
export async function sha256Hex(input: string): Promise<string> {
  if (typeof input !== "string") {
    throw new Error("Input must be a string")
  }
  const enc = new TextEncoder()
  const data = enc.encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  const bytes = new Uint8Array(digest)
  let out = ""
  for (const b of bytes) out += b.toString(16).padStart(2, "0")
  return out
}



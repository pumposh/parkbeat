const MIN_ID_LENGTH = 8;
/**
 * Generates a unique ID, inspired by firestore's implementation.
 * IDs are 8 chars long by default defined by MIN_ID_LENGTH.
 */
export function generateId(targetLength: number = MIN_ID_LENGTH): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const maxMultiple = Math.floor(256 / chars.length) * chars.length;
  
    let autoId = '';
    while (autoId.length < targetLength) {
      // Generate random bytes
      const bytes = new Uint8Array(40);
      crypto.getRandomValues(bytes);
  
      for (let i = 0; i < bytes.length; ++i) {
        const byte = bytes[i];
        if (autoId.length < targetLength && byte !== undefined && byte < maxMultiple) {
          autoId += chars[byte % chars.length];
        }
      }
    }
  
    return autoId;
  }
  
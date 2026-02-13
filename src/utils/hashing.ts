import * as crypto from 'crypto';

/**
 * Generate a stable ID for a notebook block.
 * The ID is deterministic based on the type, content, and an occurrence index.
 * 
 * We use a simple hash of the content to detect changes.
 * The 'index' parameter is used to disambiguate identical blocks (e.g. two empty code blocks).
 * However, strictly speaking, if two blocks are identical, it effectively doesn't matter 
 * which DOM node we reuse, as long as we reuse one.
 * 
 * But to support "moving" blocks correctly without full re-renders, 
 * we ideally want an ID that persists if the block moves.
 * 
 * For this implementation, we will use `hash(type + content + discriminator)`
 * where discriminator could be the index if we want strict position adherence,
 * or we can try to be smarter.
 * 
 * Given the "Zero-Base" requirement for robustness, let's start with strict content hashing.
 * If multiple blocks have identical content, we append a counter to unique them.
 */
export function generateBlockId(type: string, content: string, occurrence: number): string {
    const data = `${type}:${content}:${occurrence}`;
    return crypto.createHash('md5').update(data).digest('hex').substring(0, 16);
}

/**
 * Annotation history module — undo and redo for document state.
 *
 * Usage:
 *   const history = new HistoryStack<Annotation[]>();
 *
 *   // Before any mutation, record a checkpoint.
 *   history.checkpoint(this.annotations);
 *   this.annotations.push(newAnnotation);
 *
 *   // Undo: pass current state so it can be stored for redo.
 *   const previous = history.undo(this.annotations);
 *   if (previous !== null) this.annotations = previous;
 *
 *   // Redo: pass current state so it can be stored for further undo.
 *   const next = history.redo(this.annotations);
 *   if (next !== null) this.annotations = next;
 */

const DEFAULT_MAX_DEPTH = 50;

function deepClone<T>(value: T): T {
  // structuredClone is available in all modern environments (DOM lib, Node 17+).
  // It handles ArrayBuffer, typed arrays, and nested objects correctly.
  return structuredClone(value);
}

export class HistoryStack<T> {
  private readonly past: T[] = [];
  private readonly future: T[] = [];
  private readonly maxDepth: number;

  constructor(maxDepth = DEFAULT_MAX_DEPTH) {
    this.maxDepth = maxDepth;
  }

  /**
   * Record the current state before a mutation is applied.
   * Clears the redo stack — any branching future is discarded.
   */
  checkpoint(current: T): void {
    this.past.push(deepClone(current));
    if (this.past.length > this.maxDepth) {
      this.past.shift();
    }
    this.future.length = 0;
  }

  /**
   * Undo the last mutation.
   * Returns the state to restore, or null if nothing to undo.
   * The current state is stored for redo before returning.
   */
  undo(current: T): T | null {
    if (this.past.length === 0) return null;
    this.future.unshift(deepClone(current));
    return this.past.pop()!;
  }

  /**
   * Redo the last undone mutation.
   * Returns the state to restore, or null if no redo is available.
   * The current state is stored for further undo before returning.
   */
  redo(current: T): T | null {
    if (this.future.length === 0) return null;
    this.past.push(deepClone(current));
    return this.future.shift()!;
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get size(): { past: number; future: number } {
    return { past: this.past.length, future: this.future.length };
  }
}

// Snapshot-based undo/redo. Snapshots come from Simulation.serialize().
export class History {
  constructor(limit = 40) {
    this.limit = limit;
    this.clear();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Record the state *before* a user intervention. */
  checkpoint(snapshot) {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** Returns the snapshot to restore, given the current state, or null. */
  undo(current) {
    if (!this.canUndo) return null;
    this.redoStack.push(current);
    return this.undoStack.pop();
  }

  redo(current) {
    if (!this.canRedo) return null;
    this.undoStack.push(current);
    return this.redoStack.pop();
  }
}

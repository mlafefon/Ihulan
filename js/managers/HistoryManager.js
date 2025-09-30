export class HistoryManager {
    constructor(editor) {
        this.editor = editor;
        this.undoStack = [];
        this.redoStack = [];
        this.dom = {
            undoBtn: document.getElementById('undo-btn'),
            redoBtn: document.getElementById('redo-btn'),
        };
    }

    _cloneState(state) {
        // Deep copy only the necessary parts of the state for history
        return JSON.parse(JSON.stringify({
            elements: state.elements,
            backgroundColor: state.backgroundColor,
            coverWidth: state.coverWidth,
            coverHeight: state.coverHeight,
            templateName: state.templateName,
        }));
    }

    addState(state) {
        this.undoStack.push(this._cloneState(state));
        this.redoStack = []; // Clear redo stack on new action
        this.updateButtons();
    }

    undo() {
        if (this.canUndo()) {
            this.redoStack.push(this._cloneState(this.editor.state));
            const prevState = this.undoStack.pop();
            this.editor.restoreState(prevState);
            this.updateButtons();
        }
    }

    redo() {
        if (this.canRedo()) {
            this.undoStack.push(this._cloneState(this.editor.state));
            const nextState = this.redoStack.pop();
            this.editor.restoreState(nextState);
            this.updateButtons();
        }
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this.updateButtons();
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    updateButtons() {
        this.dom.undoBtn.disabled = !this.canUndo();
        this.dom.redoBtn.disabled = !this.canRedo();
    }
}

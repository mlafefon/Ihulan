
export class InteractionManager {
    constructor(editor) {
        this.editor = editor;
        this.state = {}; // Local interaction state
        this.snapLines = [];
        this.preInteractionState = null;
    }

    handleCoverMouseDown(e) {
        if (e.target.closest('[contenteditable="true"]')) {
            // When clicking inside an already-editable text, clear the selection overlay
            setTimeout(() => {
                if (window.getSelection().isCollapsed) this.editor._clearCustomSelection();
            }, 0);
            return;
        }
        const draggableEl = e.target.closest('.draggable');
        if (!draggableEl) return;

        this.preInteractionState = this.editor._getStateSnapshot();

        const elementId = draggableEl.dataset.id;
        const oldElementId = this.editor.state.selectedElementId;
        const elementData = this.editor.state.elements.find(el => el.id === elementId);
        if (!elementData) return;

        if (oldElementId !== elementId) {
            this.editor.selectElement(elementId, oldElementId);
        }
        
        const action = e.target.dataset.action || 'drag';

        // Prevent dragging from the text element's inner area. Dragging is only possible
        // from the resize/rotate handles or the external drag handle (::before pseudo-element).
        if (elementData.type === 'text' && action === 'drag' && e.target.closest('[data-role="text-container"]')) {
            return;
        }
        
        e.preventDefault();
        e.stopPropagation();

        const coverRect = this.editor.dom.coverBoundary.getBoundingClientRect();
        this.state = {
            element: elementData,
            action,
            startX: e.clientX, startY: e.clientY,
            coverRect,
            initial: {
                x: elementData.position.x, y: elementData.position.y,
                width: elementData.width || draggableEl.offsetWidth,
                height: elementData.height || draggableEl.offsetHeight,
                rotation: elementData.rotation,
            },
            moved: false
        };

        if (action === 'rotate') {
             const elRect = draggableEl.getBoundingClientRect();
             this.state.initial.centerX = elRect.left - coverRect.left + elRect.width / 2;
             this.state.initial.centerY = elRect.top - coverRect.top + elRect.height / 2;
        } else if (action === 'resize') {
            this.state.direction = e.target.dataset.direction;
        }

        const onMove = this.handleInteractionMove.bind(this);
        const onEnd = () => {
            this.handleInteractionEnd();
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
    }

    handleInteractionMove(e) {
        if (!this.state.action) return;
        this.state.moved = true;
    
        this.snapLines = []; // Clear previous snap lines
        
        const actions = {
            'drag': this.performDragWithSnapping,
            'rotate': this.performRotate,
            'resize': this.performResizeWithSnapping,
        };
        actions[this.state.action].call(this, e);
        
        this.editor.renderCover(this.snapLines);
    
        if (this.state.action === 'resize' && (this.state.element.type === 'image' || this.state.element.type === 'clipping-shape' || (this.state.element.type === 'text' && this.state.element.multiLine))) {
            const el = this.state.element;
            const widthInput = this.editor.dom.sidebarContent.querySelector('[data-property="width"]');
            const heightInput = this.editor.dom.sidebarContent.querySelector('[data-property="height"]');
            if (widthInput) widthInput.value = Math.round(el.width);
            if (heightInput) heightInput.value = Math.round(el.height);
        }
    }

    handleInteractionEnd() {
        if (this.state.moved) {
            this.editor.history.addState(this.preInteractionState);
            this.editor._setDirty(true);
        }
        this.preInteractionState = null;
        this.state = {};
        this.snapLines = []; // Clear snap lines on mouse up
        this.editor.renderCover(); // Re-render to remove guides
        this.editor.updateSidebarValues();
    }

    performDragWithSnapping(e) {
        const { element, startX, startY, initial } = this.state;
        const SNAP_THRESHOLD = 8;
        const { coverWidth, coverHeight } = this.editor.state;
    
        let newX = initial.x + (e.clientX - startX);
        let newY = initial.y + (e.clientY - startY);
    
        const elWidth = element.width || this.editor.dom.coverBoundary.querySelector(`[data-id="${element.id}"]`).offsetWidth;
        const elHeight = element.height || this.editor.dom.coverBoundary.querySelector(`[data-id="${element.id}"]`).offsetHeight;
    
        const elPoints = {
            v: [newX, newX + elWidth / 2, newX + elWidth],
            h: [newY, newY + elHeight / 2, newY + elHeight]
        };
        const guides = {
            v: [0, coverWidth / 2, coverWidth],
            h: [0, coverHeight / 2, coverHeight]
        };
    
        let snappedV = false, snappedH = false;
    
        for (const guide of guides.v) {
            for (const [i, point] of elPoints.v.entries()) {
                if (Math.abs(point - guide) < SNAP_THRESHOLD) {
                    newX += guide - point;
                    this.snapLines.push({ type: 'vertical', position: guide });
                    snappedV = true;
                    break;
                }
            }
            if (snappedV) break;
        }
    
        for (const guide of guides.h) {
            for (const [i, point] of elPoints.h.entries()) {
                if (Math.abs(point - guide) < SNAP_THRESHOLD) {
                    newY += guide - point;
                    this.snapLines.push({ type: 'horizontal', position: guide });
                    snappedH = true;
                    break;
                }
            }
            if (snappedH) break;
        }
    
        element.position.x = newX;
        element.position.y = newY;
    }
    
    performRotate(e) {
        const { element, coverRect, initial } = this.state;
        const angleRad = Math.atan2(e.clientY - coverRect.top - initial.centerY, e.clientX - coverRect.left - initial.centerX);
        element.rotation = Math.round((angleRad * 180 / Math.PI + 90) / 5) * 5;
    }
    
    performResizeWithSnapping(e) {
        const { element, startX, startY, initial, direction } = this.state;
        const SNAP_THRESHOLD = 8;
        const { coverWidth, coverHeight } = this.editor.state;
        
        let { x, y, width, height } = initial;
        let dx = e.clientX - startX;
        let dy = e.clientY - startY;

        let newX = x, newY = y, newWidth = width, newHeight = height;

        if (direction.includes('e')) newWidth = Math.max(20, width + dx);
        if (direction.includes('w')) { newWidth = Math.max(20, width - dx); newX = x + dx; }
        if (direction.includes('s')) newHeight = Math.max(20, height + dy);
        if (direction.includes('n')) { newHeight = Math.max(20, height - dy); newY = y + dy; }
        
        const guides = { v: [0, coverWidth / 2, coverWidth], h: [0, coverHeight / 2, coverHeight] };
        
        // Vertical snapping
        const rightEdge = newX + newWidth;
        for (const guide of guides.v) {
            if (direction.includes('w') && Math.abs(newX - guide) < SNAP_THRESHOLD) {
                const diff = guide - newX; newX = guide; newWidth -= diff;
                this.snapLines.push({ type: 'vertical', position: guide }); break;
            }
            if (direction.includes('e') && Math.abs(rightEdge - guide) < SNAP_THRESHOLD) {
                newWidth = guide - newX;
                this.snapLines.push({ type: 'vertical', position: guide }); break;
            }
        }
        
        // Horizontal snapping
        const bottomEdge = newY + newHeight;
        for (const guide of guides.h) {
            if (direction.includes('n') && Math.abs(newY - guide) < SNAP_THRESHOLD) {
                const diff = guide - newY; newY = guide; newHeight -= diff;
                this.snapLines.push({ type: 'horizontal', position: guide }); break;
            }
            if (direction.includes('s') && Math.abs(bottomEdge - guide) < SNAP_THRESHOLD) {
                newHeight = guide - newY; // Corrected from newX
                this.snapLines.push({ type: 'horizontal', position: guide }); break;
            }
        }

        element.position = { x: newX, y: newY };
        element.width = newWidth;
        element.height = newHeight;
    }
}

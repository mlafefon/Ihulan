


import { renderCoverElement, renderSidebar } from './js/renderers.js';
import { ImageEditor } from './js/ImageEditor.js';
import { loadAllTemplates, saveTemplate, exportTemplate, exportImage } from './js/services.js';
import { loadGoogleFonts, injectFontStyles } from './js/fonts.js';


/**
 * @file index.js
 * Main script for the Magazine Cover Editor.
 *
 * Structure:
 * 1. MagazineEditor: The main application class that orchestrates all modules.
 */

// --- MAIN CLASS: MagazineEditor ---
class MagazineEditor {
    constructor() {
        this.state = {
            templateIndex: 0,
            elements: [],
            backgroundColor: '',
            selectedElementId: null,
            inlineEditingElementId: null,
            coverWidth: 700,
            coverHeight: 906,
            templateName: '',
            isDirty: false,
        };
        this.interactionState = {}; // For drag/resize/rotate
        this.templates = [];
        this.isLayerMenuOpen = false;
        this.snapLines = []; // For snapping guides

        this._init();
    }

    _cacheDom() {
        this.dom = {
            magazineCover: document.getElementById('magazine-cover'),
            coverBoundary: document.getElementById('cover-boundary'),
            sidebar: document.getElementById('sidebar'),
            sidebarContent: document.getElementById('sidebar-content'),
            templateActions: document.getElementById('template-actions'),
            elementImageUploadInput: document.getElementById('element-image-upload'),
            changeTemplateBtn: document.getElementById('change-template-btn'),
            templateModal: document.getElementById('template-modal'),
            modalCloseBtn: document.getElementById('modal-close-btn'),
            templateGrid: document.getElementById('template-grid'),
            templateModalOverlay: document.getElementById('template-modal-overlay'),
            templateNameInput: document.getElementById('template-name-input'),
            templateWidthInput: document.getElementById('template-width-input'),
            templateHeightInput: document.getElementById('template-height-input'),
            saveTemplateBtn: document.getElementById('save-template-btn'),
            exportTemplateBtn: document.getElementById('export-template-btn'),
            exportImageBtn: document.getElementById('export-image-btn'),
        };
    }

    async _init() {
        this._cacheDom();
        this.imageEditor = new ImageEditor(this);
        loadGoogleFonts();
        injectFontStyles();
        
        this._bindEvents();
        await this._loadAllTemplates();

        if (this.templates.length > 0) {
            this.loadTemplate(0);
        } else {
            console.error("לא נטענו תבניות. יש לוודא שקובץ manifest.json והתבניות קיימים.");
            this.dom.coverBoundary.innerHTML = '<p class="p-4 text-center text-slate-400">לא ניתן היה לטעון תבניות.</p>';
        }
    }

    _bindEvents() {
        this.dom.elementImageUploadInput.addEventListener('change', this._handleElementImageUpload.bind(this));
        this.dom.changeTemplateBtn.addEventListener('click', this._openTemplateModal.bind(this));
        this.dom.modalCloseBtn.addEventListener('click', this._closeTemplateModal.bind(this));
        this.dom.templateModalOverlay.addEventListener('click', this._closeTemplateModal.bind(this));
        this.dom.templateGrid.addEventListener('click', this._handleTemplateSelection.bind(this));

        this.dom.templateNameInput.addEventListener('input', (e) => {
            this.state.templateName = e.target.value;
            this._setDirty(true);
        });

        this.dom.templateWidthInput.addEventListener('input', (e) => {
            const newWidth = parseInt(e.target.value, 10);
            if (!isNaN(newWidth) && newWidth > 0) {
                this.state.coverWidth = newWidth;
                this._updateCoverDimensions();
                this._setDirty(true);
            }
        });
        this.dom.templateHeightInput.addEventListener('input', (e) => {
            const newHeight = parseInt(e.target.value, 10);
            if (!isNaN(newHeight) && newHeight > 0) {
                this.state.coverHeight = newHeight;
                this._updateCoverDimensions();
                this._setDirty(true);
            }
        });

        this.dom.saveTemplateBtn.addEventListener('click', () => saveTemplate(this.state, this.templates, async () => {
            this._setDirty(false);
            await this._loadAllTemplates(); // To refresh user templates list
        }));
        this.dom.exportTemplateBtn.addEventListener('click', () => exportTemplate(this.state));
        this.dom.exportImageBtn.addEventListener('click', () => exportImage(this.dom.exportImageBtn, this.dom.coverBoundary, this.state));

        this.dom.sidebar.addEventListener('input', this._handleSidebarInput.bind(this));
        this.dom.sidebar.addEventListener('change', this._handleSidebarInput.bind(this));
        this.dom.sidebar.addEventListener('click', this._handleSidebarClick.bind(this));
        
        this.dom.coverBoundary.addEventListener('click', this._handleCoverClick.bind(this));
        this.dom.coverBoundary.addEventListener('mousedown', this._handleCoverMouseDown.bind(this));
        document.addEventListener('click', this._handleGlobalClick.bind(this));
    }

    _handleGlobalClick(e) {
        if (this.isLayerMenuOpen) {
            const toggleButton = this.dom.sidebarContent.querySelector('[data-action="toggle-layer-menu"]');
            const menu = document.getElementById('layer-menu');
            if (toggleButton && menu && !toggleButton.contains(e.target) && !menu.contains(e.target)) {
                this._toggleLayerMenu(false);
            }
        }
        
        this.dom.sidebarContent.querySelectorAll('.custom-color-picker').forEach(picker => {
            if (!picker.contains(e.target)) {
                const btn = picker.querySelector('.color-display-btn');
                if (btn.getAttribute('aria-expanded') === 'true') {
                    this._toggleColorPopover(btn, true);
                }
            }
        });
    }
    
    _toggleLayerMenu(forceState) {
        const menu = document.getElementById('layer-menu');
        const arrow = document.querySelector('[data-action="toggle-layer-menu"] svg.dropdown-arrow');
        if (!menu || !arrow) return;
        
        const shouldBeOpen = typeof forceState === 'boolean' ? forceState : menu.classList.contains('hidden');
        this.isLayerMenuOpen = shouldBeOpen;
        menu.classList.toggle('hidden', !shouldBeOpen);
        arrow.classList.toggle('rotate-180', shouldBeOpen);
    }

    _toggleColorPopover(btn, forceClose = false) {
        const popover = btn.nextElementSibling;
        if (!popover) return;
        const isOpening = popover.classList.contains('hidden');

        // Close all other popovers first
        this.dom.sidebarContent.querySelectorAll('.color-popover:not(.hidden)').forEach(p => {
            if (p !== popover) {
                p.classList.add('hidden');
                p.previousElementSibling.setAttribute('aria-expanded', 'false');
            }
        });

        if (forceClose) {
            popover.classList.add('hidden');
            btn.setAttribute('aria-expanded', 'false');
        } else {
            const shouldBeOpen = isOpening;
            popover.classList.toggle('hidden', !shouldBeOpen);
            btn.setAttribute('aria-expanded', shouldBeOpen);
        }
    }

    // --- Template Modal ---

    _openTemplateModal() {
        this.dom.templateGrid.innerHTML = '';
        this.templates.forEach((template, index) => {
            const previewEl = this._createTemplatePreview(template, index);
            this.dom.templateGrid.appendChild(previewEl);
        });
        this.dom.templateModal.classList.remove('hidden');
    }

    _closeTemplateModal() {
        this.dom.templateModal.classList.add('hidden');
    }

    _createTemplatePreview(template, index) {
        const container = document.createElement('div');
        container.className = 'template-preview-container cursor-pointer p-2 bg-slate-700 rounded-md hover:bg-slate-600 transition-colors';
        container.dataset.templateIndex = index;
        if (template.isUserTemplate) container.classList.add('user-template');

        const cover = document.createElement('div');
        cover.className = 'relative w-full overflow-hidden shadow-md';
        cover.style.aspectRatio = `${template.width || 700} / ${template.height || 906}`;
        cover.style.backgroundColor = template.backgroundColor;
    
        const scale = 180 / (template.width || 700);
    
        template.elements.forEach((el, elIndex) => {
            const domEl = renderCoverElement(el, this.state, scale, elIndex);
            cover.appendChild(domEl);
        });
    
        const name = document.createElement('p');
        name.className = 'text-center text-sm mt-2 text-slate-300';
        name.textContent = template.name;
    
        container.appendChild(cover);
        container.appendChild(name);
        return container;
    }
    
    _handleTemplateSelection(e) {
        const container = e.target.closest('.template-preview-container');
        if (container && container.dataset.templateIndex) {
            const index = parseInt(container.dataset.templateIndex, 10);
            this.loadTemplate(index);
            this._closeTemplateModal();
        }
    }


    // --- State & Template Management ---

    _setDirty(isDirty) {
        this.state.isDirty = isDirty;
        this.dom.saveTemplateBtn.classList.toggle('dirty-button', isDirty);
    }
    
    async _loadAllTemplates() {
        this.templates = await loadAllTemplates();
    }

    loadTemplate(index) {
        const template = this.templates[index];
        if (!template) {
            console.error(`תבנית באינדקס ${index} אינה קיימת.`);
            return;
        }

        // Deep copy and apply defaults
        const elementsWithDefaults = JSON.parse(JSON.stringify(template.elements)).map(el => {
            if (el.type === 'text') {
                el.shape = el.shape || 'rectangle';
                el.textAlign = el.textAlign || 'center';
                el.multiLine = el.multiLine || false;
                el.letterSpacing = el.letterSpacing || 0;
                el.lineHeight = el.lineHeight || 1.2;
                el.bgColorOpacity = el.bgColorOpacity ?? 1;
            }
            if (el.type === 'image') {
                // Ensure cropData exists with a filters object for backward compatibility
                if (el.cropData && typeof el.cropData.filters === 'undefined') {
                    el.cropData.filters = { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0 };
                }
            }
            return el;
        });
        
        this.state = {
            ...this.state,
            templateIndex: index,
            elements: elementsWithDefaults,
            backgroundColor: template.backgroundColor,
            selectedElementId: null,
            templateName: template.name,
            coverWidth: template.width || 700,
            coverHeight: template.height || 906,
        };
        this.dom.templateNameInput.value = template.name;
        this.dom.templateWidthInput.value = this.state.coverWidth;
        this.dom.templateHeightInput.value = this.state.coverHeight;

        this._updateCoverDimensions();
        
        this._setDirty(false);
        this.render();
    }
    
    _updateCoverDimensions() {
        this.dom.magazineCover.style.maxWidth = `${this.state.coverWidth}px`;
        this.dom.magazineCover.style.aspectRatio = `${this.state.coverWidth} / ${this.state.coverHeight}`;
    }
    
    updateSelectedElement(props) {
        const el = this.state.elements.find(el => el.id === this.state.selectedElementId);
        if (el) {
            Object.assign(el, props);
            this._setDirty(true);
            this.renderCover();
        }
    }

    // --- Rendering ---

    render() {
        this.renderCover();
        this.renderSidebar();
    }

    renderCover() {
        this.dom.coverBoundary.innerHTML = '';
        this.dom.coverBoundary.style.backgroundColor = this.state.backgroundColor;
        this.state.elements.forEach((el, index) => {
            const domEl = renderCoverElement(el, this.state, 1, index);
            this.dom.coverBoundary.appendChild(domEl);
        });
        this._renderSnapGuides();
    }
    
    _renderSnapGuides() {
        // Clear existing guides
        this.dom.coverBoundary.querySelectorAll('.snap-guide').forEach(el => el.remove());
        
        // Render new guides
        this.snapLines.forEach(line => {
            const guideEl = document.createElement('div');
            guideEl.className = `snap-guide ${line.type}`;
            if (line.type === 'vertical') {
                guideEl.style.left = `${line.position}px`;
            } else {
                guideEl.style.top = `${line.position}px`;
            }
            this.dom.coverBoundary.appendChild(guideEl);
        });
    }

    renderSidebar() {
        const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
        renderSidebar(selectedEl, this.dom.sidebarContent, this.dom.templateActions);
    }
        
    // --- Event Handlers ---
    
    _handleElementImageUpload(e) {
        const file = e.target.files && e.target.files[0];
        const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);

        if (!file || !selectedEl) {
            e.target.value = null; return;
        }
        
        // Store the original state before updating for the new image.
        const preUploadState = {
            src: selectedEl.src,
            originalSrc: selectedEl.originalSrc,
            cropData: selectedEl.cropData ? JSON.parse(JSON.stringify(selectedEl.cropData)) : null,
        };
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const newOriginalSrc = event.target.result;
            // Temporarily update the element for the editor session to show the new image.
            this.updateSelectedElement({ originalSrc: newOriginalSrc, src: newOriginalSrc, cropData: null });
            
            const img = new Image();
            img.onload = () => {
                // Pass the pre-upload state to the editor so it can revert on cancel.
                this.imageEditor.open(newOriginalSrc, img, selectedEl, preUploadState);
            };
            img.onerror = () => alert("לא ניתן היה לטעון את קובץ התמונה.");
            img.src = newOriginalSrc;
        };
        reader.readAsDataURL(file);
        
        e.target.value = null; // Reset input to allow re-uploading the same file
    }
    
    _deselectAndCleanup() {
        const oldSelectedId = this.state.selectedElementId;
        if (oldSelectedId) {
            const oldElement = this.state.elements.find(el => el.id === oldSelectedId);
            if (oldElement && oldElement.type === 'clipping-shape') {
                this.state.elements = this.state.elements.filter(el => el.id !== oldSelectedId);
            }
        }
        this.state.selectedElementId = null;
        this.state.inlineEditingElementId = null;
        this.render();
    }
    
    _handleColorSelection(btn) {
        const color = btn.dataset.color;
        const picker = btn.closest('.custom-color-picker');
        if (!picker) return;
        const prop = picker.dataset.property;

        this.updateSelectedElement({ [prop]: color });

        picker.dataset.value = color;
        const displaySwatch = picker.querySelector('.color-swatch-display');
        const nativePicker = picker.querySelector('.native-color-picker');

        if (color === 'transparent') {
            displaySwatch.classList.add('is-transparent-swatch');
            displaySwatch.style.backgroundColor = '#fff';
            nativePicker.value = '#ffffff';
        } else {
            displaySwatch.classList.remove('is-transparent-swatch');
            displaySwatch.style.backgroundColor = color;
            nativePicker.value = color;
        }
        
        this.renderSidebar(); // Re-render to show/hide opacity slider
        this._toggleColorPopover(picker.querySelector('.color-display-btn'), true);
    }

    _handleNativeColorChange(input) {
        const color = input.value;
        const picker = input.closest('.custom-color-picker');
        if (!picker) return;

        const prop = picker.dataset.property;
        this.updateSelectedElement({ [prop]: color });

        picker.dataset.value = color;
        const displaySwatch = picker.querySelector('.color-swatch-display');
        if (!displaySwatch) return;

        displaySwatch.classList.remove('is-transparent-swatch');
        displaySwatch.style.backgroundColor = color;
        
        this.renderSidebar(); // Re-render to show/hide opacity slider
        this._toggleColorPopover(picker.querySelector('.color-display-btn'), true);
    }

    _handleSidebarInput(e) {
        const { target } = e;
        const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
        
        if (target.matches('.native-color-picker')) {
            this._handleNativeColorChange(target);
            return;
        }
        
        if (target.dataset.property && selectedEl) {
            const prop = target.dataset.property;
            let value;

            if (target.type === 'number' || target.type === 'range') {
                value = parseFloat(target.value) || 0;
            } else {
                value = target.value;
            }

            if (prop === 'id') {
                const oldSelectedId = this.state.selectedElementId;
                const newId = String(value).trim();
                if (!newId) {
                    alert('ID של האלמנט לא יכול להיות ריק.');
                    target.value = oldSelectedId;
                    return;
                }
                if (newId !== oldSelectedId && this.state.elements.some(el => el.id === newId)) {
                    alert('ה-ID של האלמנט חייב להיות ייחודי.');
                    target.value = oldSelectedId;
                    return;
                }
                selectedEl.id = newId;
                this.state.selectedElementId = newId;
                this._setDirty(true);
                this.renderCover();
                return;
            }
            
            this.updateSelectedElement({ [prop]: value });
    
            if (prop === 'multiLine') {
                this.renderCover();
            }
        }
    }

    _handleSidebarClick(e) {
        const { target } = e;
        
        // Color picker logic
        const colorDisplayBtn = target.closest('.color-display-btn');
        if (colorDisplayBtn) {
            this._toggleColorPopover(colorDisplayBtn);
            return;
        }
        const swatchBtn = target.closest('.color-swatch-btn');
        if (swatchBtn) {
            this._handleColorSelection(swatchBtn);
            return;
        }

        // Action logic
        const actionTarget = target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;
        const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);

        const actions = {
            'deselect-element': () => this._deselectAndCleanup(),
            'add-element': () => this._addElement(actionTarget.dataset.type),
            'delete': () => this._renderDeleteConfirmation(),
            'confirm-delete': () => this._deleteSelectedElement(),
            'cancel-delete': () => this.renderSidebar(),
            'add-image': () => this.dom.elementImageUploadInput.click(),
            'edit-image': () => this._editImageHandler(selectedEl),
            'toggle-layer-menu': () => this._toggleLayerMenu(),
            'bring-to-front': () => this._reorderElement('front'),
            'send-to-back': () => this._reorderElement('back'),
            'layer-up': () => this._reorderElement('up'),
            'layer-down': () => this._reorderElement('down'),
            'align-text': () => {
                const align = actionTarget.dataset.align;
                this.updateSelectedElement({ textAlign: align });
                this.renderSidebar();
            },
            'toggle-property': () => {
                const prop = actionTarget.dataset.property;
                if (selectedEl) {
                    this.updateSelectedElement({ [prop]: !selectedEl[prop] });
                    this.renderSidebar();
                }
            },
            'perform-clip': () => this._performClip(),
        };
        
        if (actions[action]) {
            actions[action]();
            if (action.startsWith('layer-') || action === 'bring-to-front' || action === 'send-to-back') {
                this._toggleLayerMenu(false);
            }
        }
    }

    _editImageHandler(el) {
        const source = el.originalSrc || el.src;
        if (!source) return;

        const img = new Image();
        img.onload = () => {
             // Pass null for preUploadState, as we're just editing, not replacing.
             this.imageEditor.open(source, img, el, null);
        }
        img.onerror = () => {
            alert('לא ניתן לטעון את התמונה לעריכה.');
        };
        // This is crucial for cross-origin images stored in localStorage (dataURLs are fine)
        if (!source.startsWith('data:')) {
            img.crossOrigin = "Anonymous";
        }
        img.src = source;
    }

    _reorderElement(direction) {
        const { elements, selectedElementId } = this.state;
        const index = elements.findIndex(el => el.id === selectedElementId);
        if (index === -1) return;

        const [element] = elements.splice(index, 1);
        const newIndex = {
            'front': elements.length,
            'back': 0,
            'up': Math.min(elements.length, index + 1),
            'down': Math.max(0, index - 1),
        }[direction];
        
        elements.splice(newIndex, 0, element);
        this._setDirty(true);
        this.renderCover();
    }
    
    _handleCoverClick(e) {
        if (e.target.closest('[contenteditable="true"]')) return;
        const draggableEl = e.target.closest('.draggable');

        if (draggableEl) {
            const newElementId = draggableEl.dataset.id;
            const newElementData = this.state.elements.find(el => el.id === newElementId);

            // Selection is handled in mousedown. This handler only manages the text-editing click.
            this.state.selectedElementId = newElementId;

            if (newElementData?.type === 'text') {
                this._startInlineEditing(newElementData, draggableEl, e);
            } else {
                this.state.inlineEditingElementId = null;
                this.render();
            }
        } else {
            this._deselectAndCleanup();
        }
    }

    _startInlineEditing(elementData, draggableEl, clickEvent) {
        if (!elementData.multiLine && (typeof elementData.width === 'undefined' || typeof elementData.height === 'undefined')) {
            elementData.width = draggableEl.offsetWidth;
            elementData.height = draggableEl.offsetHeight;
            this._setDirty(true);
        }
        this.state.inlineEditingElementId = elementData.id;
        this.render();

        const textContainer = this.dom.coverBoundary.querySelector(`[data-id="${elementData.id}"] [data-role="text-content"]`);
        if (!textContainer) return;
        
        textContainer.contentEditable = true;
        textContainer.focus();
        
        // Position caret at click location
        const selection = window.getSelection();
        if (selection) {
            let range;
            // Modern browsers
            if (document.caretPositionFromPoint) {
                const pos = document.caretPositionFromPoint(clickEvent.clientX, clickEvent.clientY);
                if (pos) {
                    range = document.createRange();
                    range.setStart(pos.offsetNode, pos.offset);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            } 
            // Older browsers
            else if (document.caretRangeFromPoint) {
                range = document.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY);
                if (range) {
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        }
        
        const originalText = elementData.text;

        const onKeyDown = (e) => {
            if (e.key === 'Enter' && !elementData.multiLine) {
                e.preventDefault();
                textContainer.blur();
            }
        };

        const onEditEnd = () => {
            textContainer.removeEventListener('blur', onEditEnd);
            textContainer.removeEventListener('keydown', onKeyDown);
            textContainer.contentEditable = false;
            const newText = textContainer.innerText || '';
            if (originalText !== newText) {
                this.updateSelectedElement({ text: newText });
            }
            this.state.inlineEditingElementId = null;
        };
        textContainer.addEventListener('blur', onEditEnd);
        textContainer.addEventListener('keydown', onKeyDown);
    }

    _handleCoverMouseDown(e) {
        if (e.target.closest('[contenteditable="true"]')) return;
        const draggableEl = e.target.closest('.draggable');
        if (!draggableEl) return;

        const elementId = draggableEl.dataset.id;
        const elementData = this.state.elements.find(el => el.id === elementId);
        if (!elementData) return;

        const action = e.target.dataset.action || 'drag';

        // Prevent dragging from the text content itself.
        if (elementData.type === 'text' && action === 'drag' && e.target.closest('[data-role="text-content"]')) {
            return;
        }
        
        const oldSelectedId = this.state.selectedElementId;
        if (oldSelectedId !== elementId) {
            // A new element is being selected. Check if the old one was a clipping shape.
            if (oldSelectedId) {
                const oldElement = this.state.elements.find(el => el.id === oldSelectedId);
                if (oldElement && oldElement.type === 'clipping-shape') {
                    this.state.elements = this.state.elements.filter(el => el.id !== oldSelectedId);
                }
            }
            
            this.state.selectedElementId = elementId;
            this.state.inlineEditingElementId = null;
            this.render();
        }
        
        e.preventDefault();
        e.stopPropagation();

        const coverRect = this.dom.coverBoundary.getBoundingClientRect();
        this.interactionState = {
            element: elementData,
            action,
            startX: e.clientX, startY: e.clientY,
            coverRect,
            initial: {
                x: elementData.position.x, y: elementData.position.y,
                width: elementData.width || draggableEl.offsetWidth,
                height: elementData.height || draggableEl.offsetHeight,
                rotation: elementData.rotation,
            }
        };

        if (action === 'rotate') {
             const elRect = draggableEl.getBoundingClientRect();
             this.interactionState.initial.centerX = elRect.left - coverRect.left + elRect.width / 2;
             this.interactionState.initial.centerY = elRect.top - coverRect.top + elRect.height / 2;
        } else if (action === 'resize') {
            this.interactionState.direction = e.target.dataset.direction;
        }

        const onMove = this._handleInteractionMove.bind(this);
        const onEnd = () => {
            this._handleInteractionEnd();
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
    }

    _handleInteractionMove(e) {
        if (!this.interactionState.action) return;
    
        this.snapLines = []; // Clear previous snap lines
        
        const actions = {
            'drag': this._performDragWithSnapping,
            'rotate': this._performRotate,
            'resize': this._performResizeWithSnapping,
        };
        actions[this.interactionState.action].call(this, e);
        
        this.renderCover();
    
        if (this.interactionState.action === 'resize' && (this.interactionState.element.type === 'image' || this.interactionState.element.type === 'clipping-shape')) {
            const el = this.interactionState.element;
            const widthInput = this.dom.sidebarContent.querySelector('[data-property="width"]');
            const heightInput = this.dom.sidebarContent.querySelector('[data-property="height"]');
            if (widthInput) widthInput.value = Math.round(el.width);
            if (heightInput) heightInput.value = Math.round(el.height);
        }
    }
    
    _performDragWithSnapping(e) {
        const { element, startX, startY, initial } = this.interactionState;
        const SNAP_THRESHOLD = 8;
        const { coverWidth, coverHeight } = this.state;
    
        let newX = initial.x + (e.clientX - startX);
        let newY = initial.y + (e.clientY - startY);
    
        const elWidth = element.width || this.dom.coverBoundary.querySelector(`[data-id="${element.id}"]`).offsetWidth;
        const elHeight = element.height || this.dom.coverBoundary.querySelector(`[data-id="${element.id}"]`).offsetHeight;
    
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
    
    
    _performRotate(e) {
        const { element, coverRect, initial } = this.interactionState;
        const angleRad = Math.atan2(e.clientY - coverRect.top - initial.centerY, e.clientX - coverRect.left - initial.centerX);
        element.rotation = Math.round((angleRad * 180 / Math.PI + 90) / 5) * 5;
    }
    
    _performResizeWithSnapping(e) {
        const { element, startX, startY, initial, direction } = this.interactionState;
        const SNAP_THRESHOLD = 8;
        const { coverWidth, coverHeight } = this.state;
        
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
                newHeight = guide - newY;
                this.snapLines.push({ type: 'horizontal', position: guide }); break;
            }
        }

        element.position = { x: newX, y: newY };
        element.width = newWidth;
        element.height = newHeight;
    }

    _handleInteractionEnd() {
        if (this.interactionState.action) this._setDirty(true);
        this.interactionState = {};
        this.snapLines = []; // Clear snap lines on mouse up
        this.renderCover(); // Re-render to remove guides
        this.renderSidebar();
    }

    // --- Element Actions ---

    _addElement(type) {
        const newEl = type === 'text' ? {
            id: `el_${Date.now()}`, type: 'text', text: 'טקסט חדש',
            position: { x: 50, y: 100 }, fontSize: 48, color: '#FFFFFF',
            fontWeight: 700, fontFamily: 'Heebo', shadow: false,
            bgColor: 'transparent', bgColorOpacity: 1, rotation: 0, shape: 'rectangle', textAlign: 'center',
            multiLine: false, width: 300, height: 80,
            letterSpacing: 0, lineHeight: 1.2
        } : type === 'image' ? {
            id: `el_${Date.now()}`, type: 'image', src: null, originalSrc: null, cropData: null,
            position: { x: 50, y: 100 }, width: 200, height: 150, rotation: 0
        } : {
            id: `el_${Date.now()}`, type: 'clipping-shape', shape: 'ellipse',
            position: { x: 100, y: 150 }, width: 250, height: 250, rotation: 0
        };
        this.state.elements.push(newEl);
        this.state.selectedElementId = newEl.id;
        this._setDirty(true);
        this.render();
    }

    _renderDeleteConfirmation() {
        this.dom.sidebarContent.innerHTML = '';
        const container = document.createElement('div');
        container.className = 'p-4 bg-slate-900 rounded-lg text-center border border-red-500/50';
        container.innerHTML = `
            <h3 class="text-lg font-bold text-white mb-2">אישור מחיקה</h3>
            <p class="text-slate-400 mb-6">האם אתה בטוח שברצונך למחוק את האלמנט הזה לצמיתות?</p>
            <div class="flex gap-3 justify-center">
                <button data-action="cancel-delete" class="sidebar-btn bg-slate-600 hover:bg-slate-500 flex-1">ביטול</button>
                <button data-action="confirm-delete" class="sidebar-btn bg-red-600 hover:bg-red-700 flex-1">מחק לצמיתות</button>
            </div>
        `;
        this.dom.sidebarContent.appendChild(container);
    }

    _deleteSelectedElement() {
        this.state.elements = this.state.elements.filter(el => el.id !== this.state.selectedElementId);
        this.state.selectedElementId = null;
        this._setDirty(true);
        this.render();
    }
    
    // --- End Color Swap ---

    _performClip() {
        const clipEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
        if (!clipEl) return;

        const targetImageEl = [...this.state.elements]
            .reverse()
            .find(el => {
                if (el.type !== 'image' || el.id === clipEl.id || !el.src) return false;

                const clipRect = { x: clipEl.position.x, y: clipEl.position.y, width: clipEl.width, height: clipEl.height };
                const imageRect = { x: el.position.x, y: el.position.y, width: el.width, height: el.height };
                
                return (
                    clipRect.x < imageRect.x + imageRect.width &&
                    clipRect.x + clipRect.width > imageRect.x &&
                    clipRect.y < imageRect.y + imageRect.height &&
                    clipRect.y + clipRect.height > imageRect.y
                );
            });

        if (!targetImageEl) {
            alert('יש למקם את צורת החיתוך מעל אלמנט של תמונה.');
            return;
        }

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(img, 0, 0);

            const scaleX = img.naturalWidth / targetImageEl.width;
            const scaleY = img.naturalHeight / targetImageEl.height;

            const ellipseCenterX = (clipEl.position.x + clipEl.width / 2 - targetImageEl.position.x) * scaleX;
            const ellipseCenterY = (clipEl.position.y + clipEl.height / 2 - targetImageEl.position.y) * scaleY;
            const radiusX = (clipEl.width / 2) * scaleX;
            const radiusY = (clipEl.height / 2) * scaleY;
            const rotationRad = clipEl.rotation * (Math.PI / 180);

            ctx.globalCompositeOperation = 'destination-out';
            
            ctx.save();
            ctx.translate(ellipseCenterX, ellipseCenterY);
            ctx.rotate(rotationRad);
            ctx.beginPath();
            ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();

            const newDataUrl = canvas.toDataURL('image/png');
            
            this.state.elements = this.state.elements
                .map(el => el.id === targetImageEl.id ? { ...el, src: newDataUrl } : el)
                .filter(el => el.id !== clipEl.id);

            this.state.selectedElementId = null;
            this._setDirty(true);
            this.render();
        };
        img.onerror = () => {
            alert('שגיאה בטעינת התמונה לחיתוך.');
        };
        img.src = targetImageEl.src;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MagazineEditor();
});
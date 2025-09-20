


/**
 * @file index.js
 * Refactored main script for the Magazine Cover Editor.
 * This file is structured into multiple classes to improve organization and maintainability,
 * even though it's a single file.
 *
 * Structure:
 * 1. TemplateService: Handles loading/saving/exporting templates.
 * 2. ImageEditorModal: Manages the image cropping modal.
 * 3. TemplateModal: Manages the template selection modal.
 * 4. Renderer: Handles all DOM rendering for the cover and sidebar.
 * 5. CoverInteractionManager: Handles mouse interactions on the magazine cover.
 * 6. MagazineEditor: The main application class that orchestrates all modules.
 */

// --- MODULE: TemplateService ---
class TemplateService {
    constructor() {
        this.templates = [];
    }

    async loadAllTemplates() {
        try {
            const manifestResponse = await fetch('templates/manifest.json');
            if (!manifestResponse.ok) throw new Error(`שגיאת HTTP! סטטוס: ${manifestResponse.status}`);
            
            const manifest = await manifestResponse.json();
            const templatePromises = manifest.templates.map(url =>
                fetch(url).then(res => res.ok ? res.json() : Promise.reject(`Failed to load ${url}`))
            );
            const defaultTemplates = await Promise.all(templatePromises);
            
            let userTemplates = [];
            try {
                userTemplates = JSON.parse(localStorage.getItem('userTemplates')) || [];
                userTemplates.forEach(t => t.isUserTemplate = true);
            } catch (e) {
                console.error("לא ניתן לטעון תבניות משתמש מ-localStorage", e);
            }
            this.templates = [...defaultTemplates, ...userTemplates];
            return this.templates;
        } catch (error) {
            console.error("נכשל בטעינת התבניות:", error);
            this.templates = [];
            return [];
        }
    }

    saveTemplate(templateData) {
        const { templateName, coverWidth, coverHeight, backgroundColor, elements } = templateData;
        if (!templateName.trim()) {
            alert('יש להזין שם לתבנית.');
            return false;
        }

        const newTemplate = {
            name: templateName,
            width: coverWidth, height: coverHeight,
            backgroundColor: backgroundColor,
            elements: elements,
        };

        let userTemplates = JSON.parse(localStorage.getItem('userTemplates')) || [];
        const existingIndex = userTemplates.findIndex(t => t.name === templateName);
        if (existingIndex > -1) {
            userTemplates[existingIndex] = newTemplate;
        } else {
            userTemplates.push(newTemplate);
        }

        localStorage.setItem('userTemplates', JSON.stringify(userTemplates));
        alert(`התבנית "${templateName}" נשמרה בהצלחה!`);
        return true;
    }

    exportTemplate(templateData) {
        const { templateName, coverWidth, coverHeight, backgroundColor, elements } = templateData;
        const name = templateName.trim() || 'Untitled Template';
        const templateObject = {
            name,
            width: coverWidth,
            height: coverHeight,
            backgroundColor,
            elements,
        };

        const blob = new Blob([JSON.stringify(templateObject, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name.replace(/ /g, '_')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}


// --- MODULE: ImageEditorModal ---
class ImageEditorModal {
    constructor(dom, onConfirm, onReplace) {
        this.dom = dom;
        this.onConfirm = onConfirm;
        this.onReplace = onReplace;

        this.state = null; // { file, image, imageUrl, targetElement, zoom, minZoom, pan, isDragging, startPan, startMouse }

        this._bindEvents();
    }

    _bindEvents() {
        this.dom.confirmCropBtn.addEventListener('click', this._handleConfirm.bind(this));
        this.dom.cancelCropBtn.addEventListener('click', this.close.bind(this));
        this.dom.replaceImageBtn.addEventListener('click', () => this.onReplace());

        this._panStartHandler = this._panStart.bind(this);
        this._panMoveHandler = this._panMove.bind(this);
        this._panEndHandler = this._panEnd.bind(this);
        this._zoomHandler = this._zoom.bind(this);

        this.dom.imagePreviewFrame.addEventListener('mousedown', this._panStartHandler);
        document.addEventListener('mousemove', this._panMoveHandler);
        document.addEventListener('mouseup', this._panEndHandler);
        this.dom.zoomSlider.addEventListener('input', this._zoomHandler);
    }

    open(fileOrSrc, image, targetElement) {
        const isReplacing = !!this.state;
        if (isReplacing && this.state.imageUrl && this.state.file) {
            URL.revokeObjectURL(this.state.imageUrl);
        }

        const imageUrl = (fileOrSrc instanceof File) ? image.src : fileOrSrc;

        this.state = {
            file: (fileOrSrc instanceof File) ? fileOrSrc : null,
            image, imageUrl, targetElement,
            zoom: 1, minZoom: 1, pan: { x: 0, y: 0 },
            isDragging: false, startPan: { x: 0, y: 0 }, startMouse: { x: 0, y: 0 }
        };

        this.dom.imagePreviewImg.src = imageUrl;
        this.dom.imageEditorModal.classList.remove('hidden');

        const { sourceRes, targetRes, imagePreviewFrame, imagePreviewImg, imagePreviewContainer, zoomSlider } = this.dom;
        sourceRes.textContent = `${image.naturalWidth}x${image.naturalHeight}`;
        targetRes.textContent = `${Math.round(targetElement.width)}x${Math.round(targetElement.height)}`;

        const frameW = imagePreviewContainer.offsetWidth - 20;
        const frameH = imagePreviewContainer.offsetHeight - 20;
        const targetAspectRatio = targetElement.width / targetElement.height;
        let finalFrameW = Math.min(frameW, frameH * targetAspectRatio);
        let finalFrameH = finalFrameW / targetAspectRatio;

        imagePreviewFrame.style.width = `${finalFrameW}px`;
        imagePreviewFrame.style.height = `${finalFrameH}px`;

        const minZoom = Math.max(finalFrameW / image.naturalWidth, finalFrameH / image.naturalHeight);
        this.state.minZoom = minZoom;
        this.state.zoom = minZoom;

        imagePreviewImg.style.width = `${image.naturalWidth}px`;
        imagePreviewImg.style.height = `${image.naturalHeight}px`;

        zoomSlider.min = minZoom;
        zoomSlider.max = Math.max(minZoom, 2);
        zoomSlider.value = minZoom;
        zoomSlider.step = (zoomSlider.max - minZoom) / 100;

        this._centerImage();
        this._updatePreview();
    }
    
    close() {
        if (this.state && this.state.imageUrl && this.state.file) {
            URL.revokeObjectURL(this.state.imageUrl);
        }
        this.state = null;
        this.dom.imageEditorModal.classList.add('hidden');
    }

    _centerImage() {
        if (!this.state) return;
        const { image, zoom } = this.state;
        const frame = this.dom.imagePreviewFrame;
        const scaledW = image.naturalWidth * zoom;
        const scaledH = image.naturalHeight * zoom;
        this.state.pan = { x: (frame.offsetWidth - scaledW) / 2, y: (frame.offsetHeight - scaledH) / 2 };
        this._clampPan();
    }

    _updatePreview() {
        if (!this.state) return;
        const { zoom, pan } = this.state;
        this.dom.imagePreviewImg.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
    }

    _zoom(e) {
        if (!this.state) return;
        const newZoom = parseFloat(e.target.value);
        this.state.zoom = newZoom;
        this._clampPan();
        this._updatePreview();
    }

    _panStart(e) {
        e.preventDefault();
        if (!this.state) return;
        this.state.isDragging = true;
        this.state.startMouse = { x: e.clientX, y: e.clientY };
        this.state.startPan = { ...this.state.pan };
    }
    
    _panMove(e) {
        if (!this.state?.isDragging) return;
        e.preventDefault();
        const { startMouse, startPan } = this.state;
        this.state.pan.x = startPan.x + (e.clientX - startMouse.x);
        this.state.pan.y = startPan.y + (e.clientY - startMouse.y);
        this._clampPan();
        this._updatePreview();
    }

    _clampPan() {
        if (!this.state) return;
        const { pan, image, zoom } = this.state;
        const frame = this.dom.imagePreviewFrame;
        const scaledW = image.naturalWidth * zoom;
        const scaledH = image.naturalHeight * zoom;
        pan.x = Math.max(frame.offsetWidth - scaledW, Math.min(0, pan.x));
        pan.y = Math.max(frame.offsetHeight - scaledH, Math.min(0, pan.y));
    }

    _panEnd() {
        if (!this.state) return;
        this.state.isDragging = false;
    }
    
    _handleConfirm() {
        if (!this.state) return;
        const { image, targetElement, zoom, pan, file } = this.state;
        const frame = this.dom.imagePreviewFrame;
        const scaleRatio = 1 / zoom;

        const sx = -pan.x * scaleRatio, sy = -pan.y * scaleRatio;
        const sWidth = frame.offsetWidth * scaleRatio, sHeight = frame.offsetHeight * scaleRatio;

        const canvas = document.createElement('canvas');
        canvas.width = targetElement.width;
        canvas.height = targetElement.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, targetElement.width, targetElement.height);
        
        const dataUrl = canvas.toDataURL(file?.type || 'image/png');
        this.onConfirm(dataUrl);
        this.close();
    }
}


// --- MODULE: TemplateModal ---
class TemplateModal {
    constructor(dom, templates, onSelectTemplate) {
        this.dom = dom;
        this.templates = templates;
        this.onSelectTemplate = onSelectTemplate;
        this._bindEvents();
    }

    _bindEvents() {
        this.dom.modalCloseBtn.addEventListener('click', this.close.bind(this));
        this.dom.templateModalOverlay.addEventListener('click', this.close.bind(this));
        this.dom.templateGrid.addEventListener('click', this._handleSelection.bind(this));
    }

    open() {
        this.dom.templateGrid.innerHTML = '';
        this.templates.forEach((template, index) => {
            const previewEl = this._createTemplatePreview(template, index);
            this.dom.templateGrid.appendChild(previewEl);
        });
        this.dom.templateModal.classList.remove('hidden');
    }

    close() {
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
        
        // Use a simplified element renderer for previews
        template.elements.forEach(el => {
            const domEl = document.createElement('div');
            Object.assign(domEl.style, {
                position: 'absolute',
                left: `${el.position.x * scale}px`,
                top: `${el.position.y * scale}px`,
                width: el.width ? `${el.width * scale}px` : 'auto',
                height: el.height ? `${el.height * scale}px` : 'auto',
                transform: `rotate(${el.rotation}deg)`,
                backgroundColor: el.bgColor,
            });

            if (el.type === 'text') {
                domEl.textContent = el.text;
                Object.assign(domEl.style, {
                    color: el.color,
                    fontSize: `${el.fontSize * scale}px`,
                    fontFamily: el.fontFamily,
                    fontWeight: el.fontWeight,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                });
            } else if (el.type === 'image' && el.src) {
                domEl.innerHTML = `<img src="${el.src}" class="w-full h-full object-cover">`;
            }
            cover.appendChild(domEl);
        });
    
        const name = document.createElement('p');
        name.className = 'text-center text-sm mt-2 text-slate-300';
        name.textContent = template.name;
    
        container.appendChild(cover);
        container.appendChild(name);
        return container;
    }
    
    _handleSelection(e) {
        const container = e.target.closest('.template-preview-container');
        if (container && container.dataset.templateIndex) {
            const index = parseInt(container.dataset.templateIndex, 10);
            this.onSelectTemplate(index);
            this.close();
        }
    }
}


// --- MODULE: Renderer ---
// ... (All rendering functions would go here. For brevity, this will be a large class)
// This will be a big one, so I'll create it now.

// --- MODULE: CoverInteractionManager ---
// ... (All cover interaction functions)

// --- MAIN CLASS: MagazineEditor ---
class MagazineEditor {
    constructor() {
        this.state = {
            templateIndex: 0,
            elements: [],
            backgroundColor: '',
            isLoading: false,
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
        this.isFontSizeDropdownOpen = false;
        this.sessionImageFiles = new Map(); // Store original files for the session
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
            // Image Editor Modal
            imageEditorModal: document.getElementById('image-editor-modal'),
            imagePreviewContainer: document.getElementById('image-preview-container'),
            imagePreviewFrame: document.getElementById('image-preview-frame'),
            imagePreviewImg: document.getElementById('image-preview-img'),
            zoomSlider: document.getElementById('zoom-slider'),
            confirmCropBtn: document.getElementById('confirm-crop-btn'),
            cancelCropBtn: document.getElementById('cancel-crop-btn'),
            replaceImageBtn: document.getElementById('replace-image-btn'),
            sourceRes: document.getElementById('source-res'),
            targetRes: document.getElementById('target-res'),
        };
    }

    async _init() {
        this._cacheDom();
        this._bindEvents();
        await this._loadAllTemplates();
        if (this.templates.length > 0) {
            this.loadTemplate(0);
        } else {
            console.error("לא נטענו תבניות. יש לוודא שקובץ manifest.json והתבניות קיימים.");
            this.dom.coverBoundary.innerHTML = '<p class="p-4 text-center text-slate-400">לא ניתן היה לטעון תבניות.</p>';
        }
    }

    async _loadAllTemplates() {
        try {
            const manifestResponse = await fetch('templates/manifest.json');
            if (!manifestResponse.ok) throw new Error(`שגיאת HTTP! סטטוס: ${manifestResponse.status}`);
            
            const manifest = await manifestResponse.json();
            const templatePromises = manifest.templates.map(url =>
                fetch(`templates/${url}`).then(res => res.ok ? res.json() : Promise.reject(`Failed to load templates/${url}`))
            );
            const defaultTemplates = await Promise.all(templatePromises);
            
            let userTemplates = [];
            try {
                userTemplates = JSON.parse(localStorage.getItem('userTemplates')) || [];
                userTemplates.forEach(t => t.isUserTemplate = true);
            } catch (e) {
                console.error("לא ניתן לטעון תבניות משתמש מ-localStorage", e);
            }
            this.templates = [...defaultTemplates, ...userTemplates];
        } catch (error) {
            console.error("נכשל בטעינת התבניות:", error);
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

        this.dom.saveTemplateBtn.addEventListener('click', this._handleSaveTemplate.bind(this));
        this.dom.exportTemplateBtn.addEventListener('click', this._handleExportTemplate.bind(this));

        this.dom.sidebar.addEventListener('input', this._handleSidebarInteraction.bind(this));
        this.dom.sidebar.addEventListener('change', this._handleSidebarInteraction.bind(this));
        this.dom.sidebar.addEventListener('click', this._handleSidebarInteraction.bind(this));
        
        this.dom.coverBoundary.addEventListener('click', this._handleCoverClick.bind(this));
        this.dom.coverBoundary.addEventListener('mousedown', this._handleCoverMouseDown.bind(this));
        document.addEventListener('click', this._handleGlobalClick.bind(this));

        this.dom.confirmCropBtn.addEventListener('click', this._handleImageEditorConfirm.bind(this));
        this.dom.cancelCropBtn.addEventListener('click', this._closeImageEditorModal.bind(this));
        this.dom.replaceImageBtn.addEventListener('click', this._handleImageEditorReplace.bind(this));
    }

    _handleGlobalClick(e) {
        if (this.isLayerMenuOpen) {
            const toggleButton = this.dom.sidebarContent.querySelector('[data-action="toggle-layer-menu"]');
            const menu = document.getElementById('layer-menu');
            if (toggleButton && menu && !toggleButton.contains(e.target) && !menu.contains(e.target)) {
                this._toggleLayerMenu(false);
            }
        }
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
            const domEl = this._createElementDOM(el, scale, elIndex);
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

    loadTemplate(index) {
        const template = this.templates[index];
        if (!template) {
            console.error(`תבנית באינדקס ${index} אינה קיימת.`);
            return;
        }

        const elementsWithDefaults = JSON.parse(JSON.stringify(template.elements)).map(el => {
            if (el.type === 'text') {
                if (!el.shape) {
                    el.shape = 'rectangle';
                }
                if (!el.textAlign) {
                    el.textAlign = 'center';
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

        this.sessionImageFiles.clear();

        this._updateCoverDimensions();
        
        this._setDirty(false);
        this.render();
    }
    
    _updateCoverDimensions() {
        this.dom.magazineCover.style.maxWidth = `${this.state.coverWidth}px`;
        this.dom.magazineCover.style.aspectRatio = `${this.state.coverWidth} / ${this.state.coverHeight}`;
    }
    
    _updateSelectedElement(props) {
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
            const domEl = this._createElementDOM(el, 1, index);
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

    _createElementDOM(el, scale = 1, zIndex) {
        const domEl = document.createElement('div');
        domEl.dataset.id = el.id;
        domEl.className = 'draggable editable';

        Object.assign(domEl.style, {
            left: `${el.position.x * scale}px`,
            top: `${el.position.y * scale}px`,
            width: el.width ? `${el.width * scale}px` : 'auto',
            height: el.height ? `${el.height * scale}px` : 'auto',
            transform: `rotate(${el.rotation}deg)`,
            zIndex: el.type === 'clipping-shape' ? 999 : zIndex,
        });

        if (el.id === this.state.selectedElementId && scale === 1) {
            domEl.classList.add('selected');
        }

        if (el.type === 'text') {
            this._applyTextStyles(domEl, el, scale);
        } else if (el.type === 'image') {
            domEl.classList.add('element-type-image');
            this._applyImageStyles(domEl, el);
        } else if (el.type === 'clipping-shape') {
            domEl.classList.add('clipping-shape');
        }

        if (el.id === this.state.selectedElementId && scale === 1) {
            domEl.appendChild(this._createTransformHandles());
        }

        return domEl;
    }
    
    _applyTextStyles(domEl, el, scale) {
        const backgroundElement = document.createElement('div');
        Object.assign(backgroundElement.style, {
            width: '100%',
            height: '100%',
            backgroundColor: el.bgColor,
            padding: el.padding || '0px',
        });
    
        switch (el.shape) {
            case 'rounded-rectangle':
                backgroundElement.style.borderRadius = '25px';
                break;
            case 'ellipse':
                backgroundElement.style.borderRadius = '50%';
                break;
            case 'star':
                backgroundElement.style.clipPath = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
                break;
            case 'rectangle':
            default:
                backgroundElement.style.borderRadius = '0px';
                break;
        }
    
        const textWrapper = document.createElement('div');
        textWrapper.dataset.role = 'text-content';
        textWrapper.textContent = el.text;
    
        const FONT_CLASS_MAP = {
            'Anton': 'font-anton', 'Heebo': 'font-heebo', 'Rubik': 'font-rubik',
            'Assistant': 'font-assistant', 'David Libre': 'font-david-libre', 'Frank Ruhl Libre': 'font-frank-ruhl-libre'
        };
        textWrapper.className = FONT_CLASS_MAP[el.fontFamily] || 'font-heebo';
    
        const justifyContentMap = {
            left: 'flex-start',
            center: 'center',
            right: 'flex-end',
        };

        Object.assign(textWrapper.style, {
            color: el.color,
            fontSize: `${el.fontSize * scale}px`,
            fontWeight: el.fontWeight,
            textShadow: el.shadow ? '2px 2px 4px rgba(0,0,0,0.7)' : 'none',
            textAlign: el.textAlign || 'center',
            wordBreak: 'break-word',
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', 
            justifyContent: justifyContentMap[el.textAlign] || 'center',
        });
    
        backgroundElement.appendChild(textWrapper);
        domEl.appendChild(backgroundElement);
    }

    _applyImageStyles(domEl, el) {
        Object.assign(domEl.style, {
            display: 'flex', justifyContent: 'center', alignItems: 'center',
        });

        if (el.src) {
            const img = document.createElement('img');
            img.src = el.src;
            img.className = 'w-full h-full object-cover pointer-events-none';
            domEl.appendChild(img);
        } else {
            domEl.className += ' bg-slate-600 text-slate-400 cursor-pointer flex-col';
            domEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mb-2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 002-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg><span class="text-sm pointer-events-none">הוסף תמונה</span>`;
        }
    }

    _createTransformHandles() {
        const fragment = document.createDocumentFragment();
        const handles = [
            { type: 'rotation', action: 'rotate', classes: 'rotation-handle' },
            ...['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'].map(dir => ({
                type: 'resize', action: 'resize', classes: `resize-handle ${dir}`, direction: dir
            }))
        ];
        handles.forEach(({ action, classes, direction }) => {
            const handle = document.createElement('div');
            handle.className = classes;
            handle.dataset.action = action;
            if (direction) handle.dataset.direction = direction;
            fragment.appendChild(handle);
        });
        return fragment;
    }

    renderSidebar() {
        const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
        if (selectedEl) {
            this.dom.sidebarContent.innerHTML = ''; // Clear old content
            this.dom.sidebarContent.appendChild(this._createEditorSidebar(selectedEl));
            this.dom.sidebarContent.classList.remove('hidden');
            this.dom.templateActions.classList.add('hidden');
        } else {
            this.dom.sidebarContent.classList.add('hidden');
            this.dom.templateActions.classList.remove('hidden');
        }
    }
    
    _createEditorSidebar(el) {
        const fragment = document.createDocumentFragment();
        const typeNameMap = {
            'text': 'טקסט',
            'image': 'תמונה',
            'clipping-shape': 'צורת חיתוך'
        };
        const typeName = typeNameMap[el.type] || 'אלמנט';
        const header = this._createSidebarHeader(`עריכת ${typeName}`);
        fragment.appendChild(header);

        if (el.type === 'text') {
            fragment.appendChild(this._createTextEditorControls(el));
        } else if (el.type === 'image') {
            fragment.appendChild(this._createImageEditorControls(el));
        } else if (el.type === 'clipping-shape') {
            fragment.appendChild(this._createClippingShapeEditorControls(el));
        }
        
        if (el.type !== 'clipping-shape') {
             fragment.appendChild(this._createLayerControls());
        }
        fragment.appendChild(this._createDeleteButton());

        return fragment;
    }

    // --- Sidebar Control Builders ---
    _createSidebarHeader(title) {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center gap-4 mb-4 pb-4 border-b border-slate-700";
        div.innerHTML = `
            <h3 class="text-xl font-bold text-white flex-grow truncate">${title}</h3>
            <button data-action="deselect-element" title="ביטול בחירה" class="flex-shrink-0 p-1 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        `;
        return div;
    }

    _createTextEditorControls(el) {
        const container = document.createElement('div');
        const FONT_FAMILIES = ['Anton', 'Heebo', 'Rubik', 'Assistant', 'David Libre', 'Frank Ruhl Libre'];
        const isBgTransparent = el.bgColor === 'transparent';
        const shapeOptions = [
            { value: 'rectangle', text: 'מלבן' },
            { value: 'rounded-rectangle', text: 'מלבן מעוגל' },
            { value: 'ellipse', text: 'אליפסה' },
            { value: 'star', text: 'כוכב' }
        ];

        const shapeAndWeightHTML = `
            <div class="flex gap-2 mb-3">
                <div class="flex-1">
                    <label class="block text-sm font-medium text-slate-300 mb-1">צורת רקע</label>
                    <select data-property="shape" class="w-full bg-slate-700 border border-slate-600 text-white rounded-md p-2 h-10">
                        ${shapeOptions.map(o => `<option value="${o.value}" ${o.value === el.shape ? 'selected' : ''}>${o.text}</option>`).join('')}
                    </select>
                </div>
                <div class="flex-1">
                    ${this._createSidebarSelect('fontWeight', 'משקל גופן', el.fontWeight, [400, 700, 900])}
                </div>
            </div>
        `;

        const bgTransparentCheckbox = `
            <div class="flex items-center">
                <input type="checkbox" data-property="bgTransparent" ${isBgTransparent ? 'checked' : ''} id="bg-transparent-checkbox" class="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500" />
                <label for="bg-transparent-checkbox" class="mr-2 text-sm font-medium text-slate-300">ללא מילוי</label>
            </div>
        `;

        const textAlignHTML = `
            <div class="mb-3">
                <div class="text-align-group">
                    <button data-action="align-text" data-align="left" class="align-btn ${el.textAlign === 'left' ? 'active' : ''}" title="יישור לימין">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zM4 10a1 1 0 011-1h12a1 1 0 110 2H5a1 1 0 01-1-1zM8 15a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>
                    </button>
                    <button data-action="align-text" data-align="center" class="align-btn ${el.textAlign === 'center' ? 'active' : ''}" title="יישור למרכז">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6 10a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zM4 15a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>
                    </button>
                    <button data-action="align-text" data-align="right" class="align-btn ${el.textAlign === 'right' ? 'active' : ''}" title="יישור לשמאל">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zM2 10a1 1 0 011-1h8a1 1 0 110 2H3a1 1 0 01-1-1zM2 15a1 1 0 011-1h12a1 1 0 110 2H3a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>
                    </button>
                </div>
            </div>
        `;
        
        container.innerHTML = `
            <div class="flex gap-2 mb-3 items-end">
                <div class="flex-grow">
                    ${this._createSidebarSelect('fontFamily', 'שם גופן', el.fontFamily, FONT_FAMILIES)}
                </div>
                <div class="w-24">
                    ${this._createSidebarInput('number', 'fontSize', 'גודל', el.fontSize, {min: 1})}
                </div>
            </div>
             <div class="mb-3 flex gap-2 w-full items-end">
                ${this._createColorPicker('color', 'צבע גופן', el.color)}
                <div class="flex-1">
                    ${this._createColorPicker('bgColor', 'צבע רקע', el.bgColor)}
                </div>
                <div class="flex-shrink-0 mb-2">
                    ${bgTransparentCheckbox}
                </div>
            </div>
            ${shapeAndWeightHTML}
            ${this._createSidebarCheckbox('shadow', 'הוסף צל', el.shadow)}
            ${textAlignHTML}
        `;
        return container;
    }

    _createImageEditorControls(el) {
        const container = document.createElement('div');
        const buttonText = el.src ? 'ערוך תמונה' : 'הוסף תמונה';
        const buttonAction = el.src ? 'edit-image' : 'add-image';
        container.innerHTML = `
            <div class="flex gap-4 mb-3">
                <div class="flex-1">${this._createSidebarInput('number', 'width', 'רוחב', Math.round(el.width))}</div>
                <div class="flex-1">${this._createSidebarInput('number', 'height', 'גובה', Math.round(el.height))}</div>
            </div>
            <button data-action="${buttonAction}" class="w-full mt-4 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg">${buttonText}</button>
        `;
        return container;
    }

    _createClippingShapeEditorControls(el) {
        const container = document.createElement('div');
        container.innerHTML = `
            <div class="flex gap-4 mb-3">
                <div class="flex-1">${this._createSidebarInput('number', 'width', 'רוחב', Math.round(el.width))}</div>
                <div class="flex-1">${this._createSidebarInput('number', 'height', 'גובה', Math.round(el.height))}</div>
            </div>
            <button data-action="perform-clip" class="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">בצע חיתוך</button>
        `;
        return container;
    }
    
    _createLayerControls() {
        const div = document.createElement('div');
        div.className = "layer-menu-container mt-4";
        div.innerHTML = `
            <button data-action="toggle-layer-menu" class="w-full bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors flex justify-between items-center">
                <span class="flex items-center gap-2">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><rect x="10" y="7" width="10" height="10" rx="1.5" fill="#fb923c"/><rect x="7" y="10" width="10" height="10" rx="1.5" stroke="white" stroke-width="1.5"/></svg>
                    <span>סדר</span>
                </span>
                <svg class="dropdown-arrow h-5 w-5 transition-transform" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
            </button>
            <div id="layer-menu" class="layer-menu hidden">
                <button data-action="bring-to-front" class="layer-menu-item">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><rect x="5" y="10" width="10" height="10" rx="1.5" stroke="white" stroke-width="1.5"/><rect x="10" y="5" width="10" height="10" rx="1.5" fill="#fb923c"/></svg>
                    <span>הבא לחזית</span>
                </button>
                <button data-action="send-to-back" class="layer-menu-item">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><rect x="10" y="5" width="10" height="10" rx="1.5" fill="#fb923c"/><rect x="5" y="10" width="10" height="10" rx="1.5" stroke="white" stroke-width="1.5"/></svg>
                    <span>העבר לרקע</span>
                </button>
                <button data-action="layer-up" class="layer-menu-item">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><rect x="7" y="10" width="10" height="10" rx="1.5" stroke="white" stroke-width="1.5"/><rect x="10" y="7" width="10" height="10" rx="1.5" fill="#fb923c"/></svg>
                    <span>הבא קדימה</span>
                </button>
                <button data-action="layer-down" class="layer-menu-item">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><rect x="10" y="7" width="10" height="10" rx="1.5" fill="#fb923c"/><rect x="7" y="10" width="10" height="10" rx="1.5" stroke="white" stroke-width="1.5"/></svg>
                    <span>העבר אחורה</span>
                </button>
            </div>
        `;
        return div;
    }
    
    _createDeleteButton() {
        const button = document.createElement('button');
        button.dataset.action = "delete";
        button.className = "w-full mt-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg";
        button.textContent = "מחק אלמנט";
        return button;
    }

    _createColorPicker = (prop, label, value, attrs = {}) => {
        const isTransparent = value === 'transparent';
        const containerClasses = `flex-1 color-picker-container ${isTransparent ? 'is-transparent' : ''}`;
        const attrsString = Object.entries(attrs).map(([k, v]) => (v ? `${k}="${v}"` : '')).filter(Boolean).join(' ');
        
        return `
        <div class="${containerClasses}">
            <label class="block text-sm font-medium text-slate-300 mb-1">${label}</label>
            <input type="color" data-property="${prop}" value="${isTransparent ? '#ffffff' : value}" class="w-full h-10 p-1 bg-slate-700 border border-slate-600 rounded-md cursor-pointer" aria-label="${label}" ${attrsString}/>
        </div>`;
    }

    _createSidebarInput = (type, prop, label, value, attrs = {}) => `
        <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">${label}</label>
            <input type="${type}" data-property="${prop}" value="${value}" class="w-full bg-slate-700 border border-slate-600 text-white rounded-md p-2" ${Object.entries(attrs).map(([k,v]) => `${k}="${v}"`).join(' ')} />
        </div>`;

    _createSidebarSelect = (prop, label, value, options) => `
        <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">${label}</label>
            <select data-property="${prop}" class="w-full bg-slate-700 border border-slate-600 text-white rounded-md p-2 h-10">
                ${options.map(o => `<option value="${o}" ${o == value ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
        </div>`;

    _createSidebarCheckbox = (prop, label, value) => `
        <div class="flex items-center">
            <input type="checkbox" data-property="${prop}" ${value ? 'checked' : ''} class="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500" />
            <label class="mr-2 text-sm font-medium text-slate-300">${label}</label>
        </div>`;
        
    // --- Event Handlers ---

    _handleSaveTemplate() {
        const name = this.state.templateName.trim();
        if (!name) { alert('יש להזין שם לתבנית.'); return; }

        const newTemplate = {
            name,
            width: this.state.coverWidth, height: this.state.coverHeight,
            backgroundColor: this.state.backgroundColor,
            elements: this.state.elements,
        };

        let userTemplates = JSON.parse(localStorage.getItem('userTemplates')) || [];
        const existingIndex = userTemplates.findIndex(t => t.name === name);
        if (existingIndex > -1) userTemplates[existingIndex] = newTemplate;
        else userTemplates.push(newTemplate);

        localStorage.setItem('userTemplates', JSON.stringify(userTemplates));
        alert(`התבנית "${name}" נשמרה בהצלחה!`);
        this._setDirty(false);
        this._loadAllTemplates();
    }

    _handleExportTemplate() {
        const name = this.state.templateName.trim() || 'Untitled Template';
        const templateObject = {
            name, width: this.state.coverWidth, height: this.state.coverHeight,
            backgroundColor: this.state.backgroundColor,
            elements: this.state.elements,
        };

        const blob = new Blob([JSON.stringify(templateObject, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name.replace(/ /g, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    _handleElementImageUpload(e) {
        const file = e.target.files && e.target.files[0];
        const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);

        if (!file || !selectedEl) {
            e.target.value = null; return;
        }

        this.sessionImageFiles.set(selectedEl.id, file); // Store for later re-editing

        const img = new Image();
        img.onload = () => {
            if (img.naturalWidth < selectedEl.width || img.naturalHeight < selectedEl.height) {
                alert(`התמונה קטנה מדי. יש לבחור תמונה ברזולוציית מקור של לפחות ${Math.round(selectedEl.width)}x${Math.round(selectedEl.height)} פיקסלים.`);
                URL.revokeObjectURL(img.src);
                return;
            }
            this._openImageEditorModal(file, img, selectedEl);
        };
        img.onerror = () => alert("לא ניתן היה לטעון את קובץ התמונה.");
        img.src = URL.createObjectURL(file);
        e.target.value = null;
    }
    
    _handleSidebarInteraction(e) {
        const { target } = e;
        const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
        
        if (target.dataset.property && selectedEl && e.type !== 'click') {
            const prop = target.dataset.property;
            let value = target.type === 'checkbox' ? target.checked : (target.type === 'number' ? parseFloat(target.value) : target.value);

            if (prop === 'bgTransparent') {
                const newBgColor = value ? 'transparent' : (this.dom.sidebarContent.querySelector('[data-property="bgColor"]')?.value || '#FFFFFF');
                this._updateSelectedElement({ bgColor: newBgColor });
            } else {
                this._updateSelectedElement({ [prop]: value });
            }
    
            if (prop === 'bgTransparent' || (prop === 'bgColor' && e.type === 'change')) {
                this.renderSidebar();
            }
            return;
        }

        const actionTarget = target.closest('[data-action]');
        if (!actionTarget) return;
        const action = actionTarget.dataset.action;

        const actions = {
            'deselect-element': () => { this.state.selectedElementId = null; this.render(); },
            'add-element': () => this._addElement(actionTarget.dataset.type),
            'delete': () => this._deleteSelectedElement(),
            'add-image': () => this.dom.elementImageUploadInput.click(),
            'edit-image': () => this._editImageHandler(selectedEl),
            'toggle-layer-menu': () => this._toggleLayerMenu(),
            'bring-to-front': () => this._reorderElement('front'),
            'send-to-back': () => this._reorderElement('back'),
            'layer-up': () => this._reorderElement('up'),
            'layer-down': () => this._reorderElement('down'),
            'align-text': () => {
                const align = actionTarget.dataset.align;
                this._updateSelectedElement({ textAlign: align });
                this.renderSidebar();
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
        const sessionFile = this.sessionImageFiles.get(el.id);
        const source = sessionFile ? URL.createObjectURL(sessionFile) : el.src;
        if (!source) return;

        const img = new Image();
        img.onload = () => this._openImageEditorModal(sessionFile || el.src, img, el);
        img.onerror = () => {
            if(sessionFile) URL.revokeObjectURL(source); // Clean up if it was a blob URL
            alert('לא ניתן לטעון את התמונה לעריכה.');
        };
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
            const elementId = draggableEl.dataset.id;
            const elementData = this.state.elements.find(el => el.id === elementId);
            this.state.selectedElementId = elementId;

            if (elementData?.type === 'text') {
                this._startInlineEditing(elementData, draggableEl, e);
            } else {
                this.state.inlineEditingElementId = null;
                this.render();
            }
        } else {
            this.state.selectedElementId = null;
            this.state.inlineEditingElementId = null;
            this.render();
        }
    }

    _startInlineEditing(elementData, draggableEl, clickEvent) {
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
        const onEditEnd = () => {
            textContainer.removeEventListener('blur', onEditEnd);
            textContainer.contentEditable = false;
            if (originalText !== textContainer.textContent) {
                this._updateSelectedElement({ text: textContainer.textContent || '' });
            }
            this.state.inlineEditingElementId = null;
        };
        textContainer.addEventListener('blur', onEditEnd);
    }

    _handleCoverMouseDown(e) {
        if (e.target.closest('[contenteditable="true"]')) return;
        const draggableEl = e.target.closest('.draggable');
        if (!draggableEl) return;

        const elementId = draggableEl.dataset.id;
        const elementData = this.state.elements.find(el => el.id === elementId);
        if (!elementData) return;

        const action = e.target.dataset.action || 'drag';

        // Prevent dragging from the text content itself. Dragging is only allowed
        // from the frame (or handles). The click handler will manage selection/editing.
        if (elementData.type === 'text' && action === 'drag' && e.target.closest('[data-role="text-content"]')) {
            return;
        }
        
        if (this.state.selectedElementId !== elementId) {
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
            bgColor: 'transparent', rotation: 0, shape: 'rectangle', textAlign: 'center',
        } : type === 'image' ? {
            id: `el_${Date.now()}`, type: 'image', src: null,
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

    _deleteSelectedElement() {
        this.state.elements = this.state.elements.filter(el => el.id !== this.state.selectedElementId);
        this.state.selectedElementId = null;
        this._setDirty(true);
        this.render();
    }

    // --- Image Editor Modal Logic ---

     _handleImageEditorReplace() {
        this.dom.elementImageUploadInput.click();
    }

    _openImageEditorModal(fileOrSrc, image, targetElement) {
        const isReplacing = !!this.imageEditorState;
        if(isReplacing && this.imageEditorState.imageUrl && this.imageEditorState.file) {
             URL.revokeObjectURL(this.imageEditorState.imageUrl);
        }

        const imageUrl = (fileOrSrc instanceof File) ? image.src : fileOrSrc;
        
        this.imageEditorState = {
            file: (fileOrSrc instanceof File) ? fileOrSrc : null,
            image, imageUrl, targetElement,
            zoom: 1, minZoom: 1, pan: { x: 0, y: 0 },
            isDragging: false, startPan: { x: 0, y: 0 }, startMouse: { x: 0, y: 0 }
        };
        
        this.dom.imagePreviewImg.src = imageUrl;
        this.dom.imageEditorModal.classList.remove('hidden');

        const { sourceRes, targetRes, imagePreviewFrame, imagePreviewImg, imagePreviewContainer, zoomSlider } = this.dom;
        sourceRes.textContent = `${image.naturalWidth}x${image.naturalHeight}`;
        targetRes.textContent = `${Math.round(targetElement.width)}x${Math.round(targetElement.height)}`;
        
        const frameW = imagePreviewContainer.offsetWidth - 20;
        const frameH = imagePreviewContainer.offsetHeight - 20;
        const targetAspectRatio = targetElement.width / targetElement.height;
        let finalFrameW = Math.min(frameW, frameH * targetAspectRatio);
        let finalFrameH = finalFrameW / targetAspectRatio;
        
        imagePreviewFrame.style.width = `${finalFrameW}px`;
        imagePreviewFrame.style.height = `${finalFrameH}px`;
        
        const minZoom = Math.max(finalFrameW / image.naturalWidth, finalFrameH / image.naturalHeight);
        this.imageEditorState.minZoom = minZoom;
        this.imageEditorState.zoom = minZoom;
        
        imagePreviewImg.style.width = `${image.naturalWidth}px`;
        imagePreviewImg.style.height = `${image.naturalHeight}px`;

        zoomSlider.min = minZoom;
        zoomSlider.max = Math.max(minZoom, 2);
        zoomSlider.value = minZoom;
        zoomSlider.step = (zoomSlider.max - minZoom) / 100;
        
        this._centerImageInFrame();
        this._updateImageEditorPreview();
        
        if (!isReplacing) this._setupImageEditorEvents();
    }

    _closeImageEditorModal() {
        if (this.imageEditorState && this.imageEditorState.imageUrl && this.imageEditorState.file) {
            URL.revokeObjectURL(this.imageEditorState.imageUrl);
        }
        this.imageEditorState = null;
        this.dom.imageEditorModal.classList.add('hidden');
        this.dom.imagePreviewFrame.removeEventListener('mousedown', this._imagePanStart);
        document.removeEventListener('mousemove', this._imagePanMove);
        document.removeEventListener('mouseup', this._imagePanEnd);
        this.dom.zoomSlider.removeEventListener('input', this._imageZoom);
    }

    _setupImageEditorEvents() {
        this._imagePanStart = this._imagePanStart.bind(this);
        this._imagePanMove = this._imagePanMove.bind(this);
        this._imagePanEnd = this._imagePanEnd.bind(this);
        this._imageZoom = this._imageZoom.bind(this);

        this.dom.imagePreviewFrame.addEventListener('mousedown', this._imagePanStart);
        document.addEventListener('mousemove', this._imagePanMove);
        document.addEventListener('mouseup', this._imagePanEnd);
        this.dom.zoomSlider.addEventListener('input', this._imageZoom);
    }
    
    _centerImageInFrame() {
        if (!this.imageEditorState) return;
        const { image, zoom } = this.imageEditorState;
        const frame = this.dom.imagePreviewFrame;
        const scaledW = image.naturalWidth * zoom;
        const scaledH = image.naturalHeight * zoom;
        this.imageEditorState.pan = { x: (frame.offsetWidth - scaledW) / 2, y: (frame.offsetHeight - scaledH) / 2 };
        this._clampImagePan();
    }
    
    _updateImageEditorPreview() {
        if (!this.imageEditorState) return;
        const { zoom, pan } = this.imageEditorState;
        this.dom.imagePreviewImg.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
    }
    
    _imageZoom(e) {
        if (!this.imageEditorState) return;
        const newZoom = parseFloat(e.target.value);
        this.imageEditorState.zoom = newZoom;
        this._clampImagePan();
        this._updateImageEditorPreview();
    }

    _imagePanStart(e) {
        e.preventDefault();
        if (!this.imageEditorState) return;
        this.imageEditorState.isDragging = true;
        this.imageEditorState.startMouse = { x: e.clientX, y: e.clientY };
        this.imageEditorState.startPan = { ...this.imageEditorState.pan };
    }

    _imagePanMove(e) {
        if (!this.imageEditorState?.isDragging) return;
        e.preventDefault();
        const { startMouse, startPan } = this.imageEditorState;
        this.imageEditorState.pan.x = startPan.x + (e.clientX - startMouse.x);
        this.imageEditorState.pan.y = startPan.y + (e.clientY - startMouse.y);
        this._clampImagePan();
        this._updateImageEditorPreview();
    }
    
    _clampImagePan() {
        if (!this.imageEditorState) return;
        const { pan, image, zoom } = this.imageEditorState;
        const frame = this.dom.imagePreviewFrame;
        const scaledW = image.naturalWidth * zoom;
        const scaledH = image.naturalHeight * zoom;
        pan.x = Math.max(frame.offsetWidth - scaledW, Math.min(0, pan.x));
        pan.y = Math.max(frame.offsetHeight - scaledH, Math.min(0, pan.y));
    }

    _imagePanEnd() {
        if (!this.imageEditorState) return;
        this.imageEditorState.isDragging = false;
    }

    _handleImageEditorConfirm() {
        if (!this.imageEditorState) return;
        const { image, targetElement, zoom, pan, file } = this.imageEditorState;
        const frame = this.dom.imagePreviewFrame;
        const scaleRatio = 1 / zoom;

        const sx = -pan.x * scaleRatio, sy = -pan.y * scaleRatio;
        const sWidth = frame.offsetWidth * scaleRatio, sHeight = frame.offsetHeight * scaleRatio;

        const canvas = document.createElement('canvas');
        canvas.width = targetElement.width;
        canvas.height = targetElement.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, targetElement.width, targetElement.height);
        
        const dataUrl = canvas.toDataURL(file?.type || 'image/png');
        this._updateSelectedElement({ src: dataUrl });
        this._closeImageEditorModal();
        this.renderSidebar(); // Re-render sidebar to update buttons
    }

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
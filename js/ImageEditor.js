export class ImageEditor {
    constructor(editor) {
        this.editor = editor;
        this.state = null;
        this._cacheDom();
    }

    _cacheDom() {
        this.dom = {
            modal: document.getElementById('image-editor-modal'),
            previewContainer: document.getElementById('image-preview-container'),
            previewWrapper: document.getElementById('image-preview-wrapper'),
            previewFrame: document.getElementById('image-preview-frame'),
            previewImg: document.getElementById('image-preview-img'),
            zoomSlider: document.getElementById('zoom-slider'),
            confirmCropBtn: document.getElementById('confirm-crop-btn'),
            imageEditorCloseBtn: document.getElementById('image-editor-close-btn'),
            replaceImageBtn: document.getElementById('replace-image-btn'),
            sourceRes: document.getElementById('source-res'),
            targetRes: document.getElementById('target-res'),
            brightnessSlider: document.getElementById('brightness-slider'),
            contrastSlider: document.getElementById('contrast-slider'),
            saturationSlider: document.getElementById('saturation-slider'),
            grayscaleSlider: document.getElementById('grayscale-slider'),
            sepiaSlider: document.getElementById('sepia-slider'),
            resetFiltersBtn: document.getElementById('reset-filters-btn'),
            pickColorBtn: document.getElementById('pick-color-btn'),
            sourceColorsContainer: document.getElementById('source-colors-container'),
            targetColorSwatch: document.getElementById('target-color-swatch'),
            targetColorPicker: document.getElementById('target-color-picker'),
            colorToleranceSlider: document.getElementById('color-tolerance-slider'),
            toleranceValue: document.getElementById('tolerance-value'),
            resetColorSwapBtn: document.getElementById('reset-color-swap-btn'),
            accordionContainer: document.getElementById('image-editor-accordion-container'),
        };
    }

    open(fileOrSrc, image, targetElement) {
        const isReplacing = !!this.state;

        this.dom.accordionContainer.querySelectorAll('.accordion-panel.open').forEach(p => p.classList.remove('open'));
        this.dom.accordionContainer.querySelectorAll('.accordion-toggle[aria-expanded="true"]').forEach(t => t.setAttribute('aria-expanded', 'false'));

        this.state = {
            image, imageUrl: fileOrSrc, swappedImageUrl: null, targetElement,
            zoom: 1, minZoom: 1, pan: { x: 0, y: 0 },
            isDragging: false, startPan: { x: 0, y: 0 }, startMouse: { x: 0, y: 0 },
            filters: { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0 },
            frameOffset: { left: 0, top: 0 },
            isPickingColor: false,
            colorSwap: { sources: [], target: '#ff0000', tolerance: 20 },
            originalImageData: null, offscreenCanvas: null, offscreenCtx: null,
        };

        this.state.offscreenCanvas = document.createElement('canvas');
        this.state.offscreenCanvas.width = image.naturalWidth;
        this.state.offscreenCanvas.height = image.naturalHeight;
        this.state.offscreenCtx = this.state.offscreenCanvas.getContext('2d');
        this.state.offscreenCtx.drawImage(image, 0, 0);
        this.state.originalImageData = this.state.offscreenCtx.getImageData(0, 0, image.naturalWidth, image.naturalHeight);

        this.dom.previewImg.src = fileOrSrc;
        this.dom.modal.classList.remove('hidden');

        this.dom.sourceRes.textContent = `${image.naturalWidth}x${image.naturalHeight}`;
        this.dom.targetRes.textContent = `${Math.round(targetElement.width)}x${Math.round(targetElement.height)}`;

        const containerW = this.dom.previewContainer.offsetWidth;
        const containerH = this.dom.previewContainer.offsetHeight;

        let finalFrameW = targetElement.width;
        let finalFrameH = targetElement.height;
        const maxFrameW = containerW - 20;
        const maxFrameH = containerH - 20;

        if (finalFrameW > maxFrameW || finalFrameH > maxFrameH) {
            const scale = Math.min(maxFrameW / finalFrameW, maxFrameH / finalFrameH);
            finalFrameW *= scale;
            finalFrameH *= scale;
        }

        this.dom.previewFrame.style.width = `${finalFrameW}px`;
        this.dom.previewFrame.style.height = `${finalFrameH}px`;
        const frameLeft = (containerW - finalFrameW) / 2;
        const frameTop = (containerH - finalFrameH) / 2;
        this.dom.previewFrame.style.left = `${frameLeft}px`;
        this.dom.previewFrame.style.top = `${frameTop}px`;
        this.state.frameOffset = { left: frameLeft, top: frameTop };

        const zoomFor100Percent = finalFrameW / targetElement.width;
        const minZoomToFill = Math.max(finalFrameW / image.naturalWidth, finalFrameH / image.naturalHeight);
        const needsUpscalingToFill = minZoomToFill > zoomFor100Percent;

        let minZoom, maxZoom, initialZoom;
        if (needsUpscalingToFill) {
            minZoom = maxZoom = initialZoom = zoomFor100Percent;
            this.dom.zoomSlider.disabled = true;
        } else {
            minZoom = minZoomToFill;
            maxZoom = zoomFor100Percent;
            initialZoom = minZoom;
            this.dom.zoomSlider.disabled = (Math.abs(maxZoom - minZoom) < 0.01);
        }

        this.state.minZoom = minZoom;
        this.dom.previewImg.style.width = `${image.naturalWidth}px`;
        this.dom.previewImg.style.height = `${image.naturalHeight}px`;

        if (targetElement.cropData) {
            this.state.zoom = Math.max(minZoom, Math.min(maxZoom, targetElement.cropData.zoom));
            this.state.pan = targetElement.cropData.pan;
            this.state.filters = { ...targetElement.cropData.filters };
             if (targetElement.cropData.colorSwap) {
                const sources = targetElement.cropData.colorSwap.sources || (targetElement.cropData.colorSwap.source ? [targetElement.cropData.colorSwap.source] : []);
                this.state.colorSwap = { ...targetElement.cropData.colorSwap, sources };
            }
        } else {
            this.state.zoom = initialZoom;
            this._centerImageInFrame();
        }

        this._updateColorSwapUI();
        this._applyColorSwapPreview();

        this.dom.zoomSlider.min = minZoom;
        this.dom.zoomSlider.max = maxZoom;
        this.dom.zoomSlider.value = this.state.zoom;
        this.dom.zoomSlider.step = (maxZoom - minZoom) / 100 || 0.01;

        if (!isReplacing) this._setupEvents();
    }

    close() {
        if (this.state && this.state.isPickingColor) this._toggleColorPickMode(false);
        this.state = null;
        this.dom.modal.classList.add('hidden');
        this.dom.previewImg.style.filter = '';
        // Unbind events if they were bound with `bind(this)`
        // This is simplified as the editor instance is short-lived in the main app
    }

    _setupEvents() {
        // Using arrow functions to preserve `this` context
        this._imagePanStart = e => { e.preventDefault(); if (!this.state || this.state.isPickingColor) return; this.state.isDragging = true; this.state.startMouse = { x: e.clientX, y: e.clientY }; this.state.startPan = { ...this.state.pan }; };
        this._imagePanMove = e => { if (!this.state?.isDragging) return; e.preventDefault(); const { startMouse, startPan } = this.state; this.state.pan.x = startPan.x + (e.clientX - startMouse.x); this.state.pan.y = startPan.y + (e.clientY - startMouse.y); this._clampImagePan(); this._updateImageEditorPreview(); };
        this._imagePanEnd = () => { if (!this.state) return; this.state.isDragging = false; };
        this._imageZoom = e => { if (!this.state) return; const oldZoom = this.state.zoom; const newZoom = parseFloat(e.target.value); const { pan, frameOffset } = this.state; const containerRect = this.dom.previewContainer.getBoundingClientRect(); const mouseX = containerRect.left + frameOffset.left + this.dom.previewFrame.offsetWidth / 2; const mouseY = containerRect.top + frameOffset.top + this.dom.previewFrame.offsetHeight / 2; const imageX = (mouseX - containerRect.left - pan.x) / oldZoom; const imageY = (mouseY - containerRect.top - pan.y) / oldZoom; const newPanX = (mouseX - containerRect.left) - imageX * newZoom; const newPanY = (mouseY - containerRect.top) - imageY * newZoom; this.state.zoom = newZoom; this.state.pan = { x: newPanX, y: newPanY }; this._clampImagePan(); this._updateImageEditorPreview(); };
        this._handleFilterChange = e => { if (!this.state) return; this.state.filters[e.target.dataset.filter] = parseInt(e.target.value, 10); this._updateImageEditorPreview(); };
        this._resetFilters = () => { if (!this.state) return; this.state.filters = { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0 }; this._updateFilterSliders(); this._updateImageEditorPreview(); };
        this._toggleColorPickMode = (forceState = null) => { if (!this.state) return; const shouldBePicking = forceState !== null ? forceState : !this.state.isPickingColor; this.state.isPickingColor = shouldBePicking; this.dom.modal.classList.toggle('color-picking-mode', shouldBePicking); };
        this._handleColorPick = e => { if (!this.state || !this.state.isPickingColor) return; const rect = e.target.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top; const { image, zoom, pan, originalImageData } = this.state; const imgX = Math.floor((x - pan.x) / zoom); const imgY = Math.floor((y - pan.y) / zoom); if (imgX < 0 || imgX >= image.naturalWidth || imgY < 0 || imgY >= image.naturalHeight) return; const i = (imgY * image.naturalWidth + imgX) * 4; const r = originalImageData.data[i]; const g = originalImageData.data[i + 1]; const b = originalImageData.data[i + 2]; const newSource = { r, g, b }; if (!this.state.colorSwap.sources.some(s => s.r === newSource.r && s.g === newSource.g && s.b === newSource.b)) { this.state.colorSwap.sources.push(newSource); } this._updateColorSwapUI(); this._applyColorSwapPreview(); this._toggleColorPickMode(false); };
        this._handleTargetColorChange = e => { if (!this.state) return; this.state.colorSwap.target = e.target.value; this._updateColorSwapUI(); if (this.state.colorSwap.sources.length > 0) this._applyColorSwapPreview(); };
        this._handleToleranceChange = e => { if (!this.state) return; this.state.colorSwap.tolerance = parseInt(e.target.value, 10); this._updateColorSwapUI(); if (this.state.colorSwap.sources.length > 0) this._applyColorSwapPreview(); };
        this._resetColorSwap = () => { if (!this.state) return; this.state.colorSwap.sources = []; this.state.colorSwap.target = '#ff0000'; this.state.colorSwap.tolerance = 20; this._updateColorSwapUI(); this._applyColorSwapPreview(); };
        this._handleRemoveSourceColor = e => { const removeBtn = e.target.closest('.source-color-swatch'); if (removeBtn && this.state) { const index = parseInt(removeBtn.dataset.index, 10); if (!isNaN(index)) { this.state.colorSwap.sources.splice(index, 1); this._updateColorSwapUI(); this._applyColorSwapPreview(); } } };
        
        this.dom.previewWrapper.addEventListener('mousedown', this._imagePanStart);
        this.dom.previewContainer.addEventListener('click', this._handleColorPick);
        document.addEventListener('mousemove', this._imagePanMove);
        document.addEventListener('mouseup', this._imagePanEnd);
        this.dom.zoomSlider.addEventListener('input', this._imageZoom);
        this.dom.modal.querySelectorAll('input[type="range"][data-filter]').forEach(s => s.addEventListener('input', this._handleFilterChange));
        this.dom.resetFiltersBtn.addEventListener('click', this._resetFilters);
        this.dom.pickColorBtn.addEventListener('click', () => this._toggleColorPickMode());
        this.dom.targetColorPicker.addEventListener('input', this._handleTargetColorChange);
        this.dom.colorToleranceSlider.addEventListener('input', this._handleToleranceChange);
        this.dom.resetColorSwapBtn.addEventListener('click', this._resetColorSwap);
        this.dom.sourceColorsContainer.addEventListener('click', this._handleRemoveSourceColor);
        this.dom.accordionContainer.addEventListener('click', e => {
            const toggleBtn = e.target.closest('.accordion-toggle');
            if (toggleBtn) {
                const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
                const panel = document.getElementById(toggleBtn.getAttribute('aria-controls'));
                toggleBtn.setAttribute('aria-expanded', String(!isExpanded));
                panel.classList.toggle('open');
            }
        });
        this.dom.confirmCropBtn.addEventListener('click', () => this._handleConfirm());
        this.dom.imageEditorCloseBtn.addEventListener('click', () => this.close());
        this.dom.replaceImageBtn.addEventListener('click', () => this.editor.dom.elementImageUploadInput.click());
    }

    _centerImageInFrame() {
        if (!this.state) return;
        const { image, zoom, frameOffset } = this.state;
        const frame = this.dom.previewFrame;
        const scaledW = image.naturalWidth * zoom;
        const scaledH = image.naturalHeight * zoom;
        this.state.pan = { 
            x: frameOffset.left + (frame.offsetWidth - scaledW) / 2, 
            y: frameOffset.top + (frame.offsetHeight - scaledH) / 2 
        };
        this._clampImagePan();
    }

    _getFilterString() {
        if (!this.state?.filters) return '';
        const { brightness, contrast, saturation, grayscale, sepia } = this.state.filters;
        return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) grayscale(${grayscale}%) sepia(${sepia}%)`;
    }
    
    _updateFilterSliders() {
        if (!this.state?.filters) return;
        const { brightness, contrast, saturation, grayscale, sepia } = this.state.filters;
        this.dom.brightnessSlider.value = brightness;
        this.dom.contrastSlider.value = contrast;
        this.dom.saturationSlider.value = saturation;
        this.dom.grayscaleSlider.value = grayscale;
        this.dom.sepiaSlider.value = sepia;
    }
    
    _updateImageEditorPreview() {
        if (!this.state) return;
        const { zoom, pan } = this.state;
        this.dom.previewImg.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
        this.dom.previewImg.style.filter = this._getFilterString();
    }
    
    _clampImagePan() {
        if (!this.state) return;
        const { pan, image, zoom, frameOffset } = this.state;
        const frame = this.dom.previewFrame;
        const scaledW = image.naturalWidth * zoom;
        const scaledH = image.naturalHeight * zoom;
        const { left: frameLeft, top: frameTop } = frameOffset;

        let minX, maxX, minY, maxY;
        if (scaledW > frame.offsetWidth) {
            minX = frameLeft + frame.offsetWidth - scaledW;
            maxX = frameLeft;
        } else {
            minX = maxX = frameLeft + (frame.offsetWidth - scaledW) / 2;
        }
        if (scaledH > frame.offsetHeight) {
            minY = frameTop + frame.offsetHeight - scaledH;
            maxY = frameTop;
        } else {
            minY = maxY = frameTop + (frame.offsetHeight - scaledH) / 2;
        }

        pan.x = Math.max(minX, Math.min(maxX, pan.x));
        pan.y = Math.max(minY, Math.min(maxY, pan.y));
    }

    _handleConfirm() {
        if (!this.state) return;
        const { image, targetElement, zoom, pan, frameOffset, filters, colorSwap } = this.state;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = image.naturalWidth;
        tempCanvas.height = image.naturalHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(image, 0, 0);

        if (colorSwap && colorSwap.sources && colorSwap.sources.length > 0) {
            const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            this._applyColorSwapToImageData(imageData, colorSwap);
            tempCtx.putImageData(imageData, 0, 0);
        }
        
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetElement.width;
        finalCanvas.height = targetElement.height;
        const ctx = finalCanvas.getContext('2d');
        ctx.filter = this._getFilterString();
        
        const sX = (frameOffset.left - pan.x) / zoom;
        const sY = (frameOffset.top - pan.y) / zoom;
        const sW = this.dom.previewFrame.offsetWidth / zoom;
        const sH = this.dom.previewFrame.offsetHeight / zoom;

        ctx.drawImage(tempCanvas, sX, sY, sW, sH, 0, 0, finalCanvas.width, finalCanvas.height);
        
        const dataUrl = finalCanvas.toDataURL('image/png');
        const cropData = { zoom, pan, filters, colorSwap };
        this.editor.updateSelectedElement({ src: dataUrl, cropData });
        this.close();
        this.editor.renderSidebar();
    }

    _updateColorSwapUI() {
        if (!this.state) return;
        const { sources, target, tolerance } = this.state.colorSwap;
        
        this.dom.sourceColorsContainer.innerHTML = sources.map((source, index) => `
            <button class="source-color-swatch" style="background-color: rgb(${source.r}, ${source.g}, ${source.b});" data-index="${index}" title="הסר צבע זה">
                <svg xmlns="http://www.w3.org/2000/svg" class="source-color-trash-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
            </button>
        `).join('');
        
        this.dom.targetColorSwatch.style.backgroundColor = target;
        this.dom.targetColorPicker.value = target;
        this.dom.colorToleranceSlider.value = tolerance;
        this.dom.toleranceValue.textContent = tolerance;
    }

    _applyColorSwapPreview() {
        if (!this.state) return;
        const { imageUrl, colorSwap, offscreenCanvas, offscreenCtx, originalImageData } = this.state;
        
        if (!colorSwap.sources || colorSwap.sources.length === 0) {
            this.state.swappedImageUrl = null;
            this.dom.previewImg.src = imageUrl;
            this._updateImageEditorPreview();
            return;
        }

        const newImageData = new ImageData(new Uint8ClampedArray(originalImageData.data), originalImageData.width, originalImageData.height);
        this._applyColorSwapToImageData(newImageData, colorSwap);
        
        offscreenCtx.putImageData(newImageData, 0, 0);
        const swappedUrl = offscreenCanvas.toDataURL();
        this.state.swappedImageUrl = swappedUrl;
        this.dom.previewImg.src = swappedUrl;
        this._updateImageEditorPreview();
    }
    
    _applyColorSwapToImageData(imageData, colorSwap) {
        const data = imageData.data;
        const sourcesRgb = colorSwap.sources;
        if (sourcesRgb.length === 0) return;
        
        const targetRgb = this._hexToRgb(colorSwap.target);
        const tolerance = colorSwap.tolerance;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            for (const sourceRgb of sourcesRgb) {
                 const distance = Math.sqrt(Math.pow(r - sourceRgb.r, 2) + Math.pow(g - sourceRgb.g, 2) + Math.pow(b - sourceRgb.b, 2));
                if (distance < tolerance) {
                    data[i] = targetRgb.r;
                    data[i + 1] = targetRgb.g;
                    data[i + 2] = targetRgb.b;
                    break;
                }
            }
        }
    }
    
    _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
    }
}
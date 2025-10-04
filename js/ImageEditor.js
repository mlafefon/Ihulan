

export class ImageEditor {
    constructor(editor) {
        this.editor = editor;
        this.state = null;
        this.isDrawingBrush = false;
        this.offscreenBrushCanvas = document.createElement('canvas');
        this._cacheDom();
        this._setupEvents();
    }

    _cacheDom() {
        this.dom = {
            modal: document.getElementById('image-editor-view'),
            previewContainer: document.getElementById('image-preview-container'),
            previewWrapper: document.getElementById('image-preview-wrapper'),
            previewFrame: document.getElementById('image-preview-frame'),
            previewImg: document.getElementById('image-preview-img'),
            zoomSlider: document.getElementById('zoom-slider'),
            confirmCropBtn: document.getElementById('confirm-crop-btn'),
            imageEditorCloseBtn: document.getElementById('image-editor-close-btn'),
            imageEditorBackBtn: document.getElementById('image-editor-back-btn'),
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
            blurCanvas: document.getElementById('blur-canvas'),
            markSharpAreaBtn: document.getElementById('mark-sharp-area-btn'),
            eraseSharpAreaBtn: document.getElementById('erase-sharp-area-btn'),
            brushSizeSlider: document.getElementById('brush-size-slider'),
            brushSizeValue: document.getElementById('brush-size-value'),
            applyBlurBtn: document.getElementById('apply-blur-btn'),
            resetBlurBtn: document.getElementById('reset-blur-btn'),
            // Frame elements
            framePanel: document.getElementById('frame-panel'),
            frameWidthSlider: document.getElementById('frame-width-slider'),
            frameWidthValue: document.getElementById('frame-width-value'),
            frameStyleSelect: document.getElementById('frame-style-select'),
            frameColorPicker: document.getElementById('frame-color-picker'),
        };
    }

    async open(fileOrSrc, image, targetElement, preUploadState = null) {
        if (this.state) {
            this._toggleBrushMode(false);
            this._toggleColorPickMode(false);
        }

        this.dom.accordionContainer.querySelectorAll('.accordion-panel.open').forEach(p => {
            p.classList.remove('open');
            p.previousElementSibling.setAttribute('aria-expanded', 'false');
            p.previousElementSibling.querySelector('.accordion-chevron').classList.remove('rotate-180');
        });
        
        this.state = {
            image, imageUrl: fileOrSrc, swappedImageUrl: null, targetElement,
            zoom: 1, minZoom: 1, pan: { x: 0, y: 0 },
            isDragging: false, startPan: { x: 0, y: 0 }, startMouse: { x: 0, y: 0 },
            filters: { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0 },
            frameOffset: { left: 0, top: 0 },
            isPickingColor: false,
            colorSwap: { sources: [], target: '#ff0000', tolerance: 20 },
            originalImageData: null, offscreenCanvas: null, offscreenCtx: null,
            preUploadState: preUploadState, // State for reverting on cancel (if replacing image)
            preEditEditorState: this.editor._getStateSnapshot(), // State for undo/redo
            isBrushing: false, brushMode: 'draw', brushSize: 20,
            blurCtx: null, brushMaskPoints: [],
            blurredImageUrl: null, isBlurred: false,
            frameData: { width: 0, style: 'none', color: '#000000' },
            previewScale: 1
        };

        this.state.offscreenCanvas = document.createElement('canvas');
        this.state.offscreenCanvas.width = image.naturalWidth;
        this.state.offscreenCanvas.height = image.naturalHeight;
        this.state.offscreenCtx = this.state.offscreenCanvas.getContext('2d');
        this.state.offscreenCtx.drawImage(image, 0, 0);
        this.state.originalImageData = this.state.offscreenCtx.getImageData(0, 0, image.naturalWidth, image.naturalHeight);

        this.dom.previewImg.src = fileOrSrc;
        this.editor.dom.mainEditorContainer.classList.add('hidden');
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
        this.dom.blurCanvas.style.width = `${finalFrameW}px`;
        this.dom.blurCanvas.style.height = `${finalFrameH}px`;
        this.dom.blurCanvas.width = finalFrameW;
        this.dom.blurCanvas.height = finalFrameH;
        
        const frameLeft = (containerW - finalFrameW) / 2;
        const frameTop = (containerH - finalFrameH) / 2;
        this.dom.previewFrame.style.left = this.dom.blurCanvas.style.left = `${frameLeft}px`;
        this.dom.previewFrame.style.top = this.dom.blurCanvas.style.top = `${frameTop}px`;

        this.state.frameOffset = { left: frameLeft, top: frameTop };
        this.state.previewScale = finalFrameW / targetElement.width;
        this.state.blurCtx = this.dom.blurCanvas.getContext('2d');

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
       
        if (targetElement.cropData) {
            this.state.zoom = Math.max(minZoom, Math.min(maxZoom, targetElement.cropData.zoom));

            if (targetElement.cropData.sX !== undefined && targetElement.cropData.sY !== undefined) {
                // New, robust method using invariant coordinates
                this.state.pan = {
                    x: this.state.frameOffset.left - (targetElement.cropData.sX * this.state.zoom),
                    y: this.state.frameOffset.top - (targetElement.cropData.sY * this.state.zoom)
                };
            } else if (targetElement.cropData.pan) {
                // Legacy support for old templates, may not be perfectly centered if aspect ratio changed.
                this.state.pan = targetElement.cropData.pan;
            }

            this._clampImagePan(); // Ensure pan is within valid bounds for the current view
            
            this.state.filters = { ...targetElement.cropData.filters };
             if (targetElement.cropData.colorSwap) {
                const sources = targetElement.cropData.colorSwap.sources || (targetElement.cropData.colorSwap.source ? [targetElement.cropData.colorSwap.source] : []);
                this.state.colorSwap = { ...targetElement.cropData.colorSwap, sources };
            }
             if (targetElement.cropData.blurData && targetElement.cropData.blurData.points) {
                if (Array.isArray(targetElement.cropData.blurData.points) && targetElement.cropData.blurData.points.length > 0 && Array.isArray(targetElement.cropData.blurData.points[0])) {
                    this.state.brushMaskPoints = targetElement.cropData.blurData.points.map(path => ({ mode: 'draw', path: path }));
                } else {
                    this.state.brushMaskPoints = targetElement.cropData.blurData.points;
                }
                await this._applyBlur();
            }
            if (targetElement.cropData.frameData) {
                this.state.frameData = { ...this.state.frameData, ...targetElement.cropData.frameData };
            }
        } else {
            this.state.zoom = initialZoom;
            this._centerImageInFrame();
        }

        this._resetBlurState(false);
        this.dom.brushSizeSlider.value = this.state.brushSize;
        this.dom.brushSizeValue.textContent = this.state.brushSize;
        this._updateBrushButtons();

        this._updateColorSwapUI();
        this._applyColorSwapPreview();

        this.dom.zoomSlider.min = minZoom;
        this.dom.zoomSlider.max = maxZoom;
        this.dom.zoomSlider.value = this.state.zoom;
        this.dom.zoomSlider.step = (maxZoom - minZoom) / 100 || 0.01;
        this._updateFilterSliders();
        this._updateFrameControls();
        this._updateFramePreview();
        this._updateImageEditorPreview();
    }

    close() {
        if (this.state && this.state.isBrushing) this._toggleBrushMode(false);
        
        if (this.state && this.state.preUploadState) {
            this.editor.updateSelectedElement(this.state.preUploadState);
        }
        this._resetBlurState();
        this.state = null;
        this.editor.dom.mainEditorContainer.classList.remove('hidden');
        this.dom.modal.classList.add('hidden');
        this.dom.previewImg.style.filter = '';
        this.dom.previewFrame.style.border = 'none';
    }

    _setupEvents() {
        // Using arrow functions to preserve `this` context
        this._imagePanStart = e => { e.preventDefault(); if (!this.state || this.state.isBrushing || this.state.isPickingColor) return; this.state.isDragging = true; this.state.startMouse = { x: e.clientX, y: e.clientY }; this.state.startPan = { ...this.state.pan }; document.addEventListener('mousemove', this._imagePanMove); document.addEventListener('mouseup', this._imagePanEnd); };
        this._imagePanMove = e => { if (!this.state?.isDragging) return; e.preventDefault(); const { startMouse, startPan } = this.state; this.state.pan.x = startPan.x + (e.clientX - startMouse.x); this.state.pan.y = startPan.y + (e.clientY - startMouse.y); this._clampImagePan(); this._updateImageEditorPreview(); };
        this._imagePanEnd = () => { if (!this.state) return; this.state.isDragging = false; document.removeEventListener('mousemove', this._imagePanMove); document.removeEventListener('mouseup', this._imagePanEnd); };

        this._imageZoom = e => { if (!this.state) return; const oldZoom = this.state.zoom; const newZoom = parseFloat(e.target.value); const { pan, frameOffset } = this.state; const containerRect = this.dom.previewContainer.getBoundingClientRect(); const mouseX = containerRect.left + frameOffset.left + this.dom.previewFrame.offsetWidth / 2; const mouseY = containerRect.top + frameOffset.top + this.dom.previewFrame.offsetHeight / 2; const imageX = (mouseX - containerRect.left - pan.x) / oldZoom; const imageY = (mouseY - containerRect.top - pan.y) / oldZoom; const newPanX = (mouseX - containerRect.left) - imageX * newZoom; const newPanY = (mouseY - containerRect.top) - imageY * newZoom; this.state.zoom = newZoom; this.state.pan = { x: newPanX, y: newPanY }; this._clampImagePan(); this._updateImageEditorPreview(); };
        this._handleFilterChange = e => { if (!this.state) return; this.state.filters[e.target.dataset.filter] = parseInt(e.target.value, 10); this._updateImageEditorPreview(); };
        this._resetFilters = () => { if (!this.state) return; this.state.filters = { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0 }; this._updateFilterSliders(); this._updateImageEditorPreview(); };
        this._toggleColorPickMode = (forceState = null) => { if (!this.state) return; const shouldBePicking = forceState !== null ? forceState : !this.state.isPickingColor; if (shouldBePicking) { this._toggleBrushMode(false); } this.state.isPickingColor = shouldBePicking; this.dom.modal.classList.toggle('color-picking-mode', shouldBePicking); this.dom.pickColorBtn.classList.toggle('active-picker-btn', shouldBePicking); };
        this._handleColorPick = e => { if (!this.state || !this.state.isPickingColor) return; const rect = e.target.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top; const { image, zoom, pan, originalImageData } = this.state; const imgX = Math.floor((x - pan.x) / zoom); const imgY = Math.floor((y - pan.y) / zoom); if (imgX < 0 || imgX >= image.naturalWidth || imgY < 0 || imgY >= image.naturalHeight) return; const i = (imgY * image.naturalWidth + imgX) * 4; const r = originalImageData.data[i]; const g = originalImageData.data[i + 1]; const b = originalImageData.data[i + 2]; const newSource = { r, g, b }; if (!this.state.colorSwap.sources.some(s => s.r === newSource.r && s.g === newSource.g && s.b === newSource.b)) { this.state.colorSwap.sources.push(newSource); } this._updateColorSwapUI(); this._applyColorSwapPreview(); this._toggleColorPickMode(false); };
        this._handleTargetColorChange = e => { if (!this.state) return; this.state.colorSwap.target = e.target.value; this._updateColorSwapUI(); if (this.state.colorSwap.sources.length > 0) this._applyColorSwapPreview(); };
        this._handleToleranceChange = e => { if (!this.state) return; this.state.colorSwap.tolerance = parseInt(e.target.value, 10); this._updateColorSwapUI(); if (this.state.colorSwap.sources.length > 0) this._applyColorSwapPreview(); };
        this._resetColorSwap = () => { if (!this.state) return; this.state.colorSwap.sources = []; this.state.colorSwap.target = '#ff0000'; this.state.colorSwap.tolerance = 20; this._updateColorSwapUI(); this._applyColorSwapPreview(); };
        this._handleRemoveSourceColor = e => { const removeBtn = e.target.closest('.source-color-swatch'); if (removeBtn && this.state) { const index = parseInt(removeBtn.dataset.index, 10); if (!isNaN(index)) { this.state.colorSwap.sources.splice(index, 1); this._updateColorSwapUI(); this._applyColorSwapPreview(); } } };
        this._handleBrushSizeChange = e => { if (!this.state) return; this.state.brushSize = parseInt(e.target.value, 10); this.dom.brushSizeValue.textContent = this.state.brushSize; if(this.state.isBrushing) { this._updateBrushCursor(); }};

        this.dom.previewWrapper.addEventListener('mousedown', this._imagePanStart);
        this.dom.previewContainer.addEventListener('click', this._handleColorPick);
        this.dom.zoomSlider.addEventListener('input', this._imageZoom);
        this.dom.modal.querySelectorAll('input[type="range"][data-filter]').forEach(s => s.addEventListener('input', this._handleFilterChange));
        this.dom.resetFiltersBtn.addEventListener('click', this._resetFilters);
        this.dom.pickColorBtn.addEventListener('click', () => this._toggleColorPickMode());
        this.dom.targetColorPicker.addEventListener('input', this._handleTargetColorChange);
        this.dom.colorToleranceSlider.addEventListener('input', this._handleToleranceChange);
        this.dom.resetColorSwapBtn.addEventListener('click', this._resetColorSwap);
        this.dom.sourceColorsContainer.addEventListener('click', this._handleRemoveSourceColor);
        
        this.dom.confirmCropBtn.addEventListener('click', () => this._handleConfirm());
        this.dom.imageEditorCloseBtn.addEventListener('click', () => this.close());
        this.dom.imageEditorBackBtn.addEventListener('click', () => this.close());
        this.dom.replaceImageBtn.addEventListener('click', () => this.editor.dom.elementImageUploadInput.click());

        // Blur events
        this.dom.markSharpAreaBtn.addEventListener('click', () => this._setBrushMode('draw'));
        this.dom.eraseSharpAreaBtn.addEventListener('click', () => this._setBrushMode('erase'));
        this.dom.brushSizeSlider.addEventListener('input', this._handleBrushSizeChange);
        this.dom.applyBlurBtn.addEventListener('click', () => this._applyBlur());
        this.dom.resetBlurBtn.addEventListener('click', () => this._resetBlurState());
        this.dom.blurCanvas.addEventListener('mousedown', (e) => this._startBrush(e));
        this.dom.blurCanvas.addEventListener('mousemove', (e) => this._drawBrush(e));
        this.dom.blurCanvas.addEventListener('mouseup', () => this._stopBrush());
        this.dom.blurCanvas.addEventListener('mouseleave', () => this._stopBrush());

        // Frame events
        this.dom.frameWidthSlider.addEventListener('input', () => this._handleFrameChange());
        this.dom.frameStyleSelect.addEventListener('change', () => this._handleFrameChange());
        this.dom.frameColorPicker.addEventListener('input', () => this._handleFrameChange());
    }

    _handleFrameChange() {
        if (!this.state) return;
        this.state.frameData.width = parseInt(this.dom.frameWidthSlider.value, 10);
        this.state.frameData.style = this.dom.frameStyleSelect.value;
        this.state.frameData.color = this.dom.frameColorPicker.value;
        this.dom.frameWidthValue.textContent = this.state.frameData.width;

        const isNone = this.state.frameData.style === 'none';
        this.dom.frameWidthSlider.disabled = isNone;
        this.dom.frameColorPicker.disabled = isNone;

        if (isNone) {
            this.state.frameData.width = 0;
            this.dom.frameWidthSlider.value = 0;
            this.dom.frameWidthValue.textContent = 0;
        }

        this._updateFramePreview();
    }

    _updateFramePreview() {
        if (!this.state) return;
        const { width, style, color } = this.state.frameData;
        const scaledWidth = width * this.state.previewScale;
        if (width > 0 && style !== 'none') {
            this.dom.previewFrame.style.border = `${scaledWidth}px ${style} ${color}`;
        } else {
            this.dom.previewFrame.style.border = 'none';
        }
    }

    _updateFrameControls() {
        if (!this.state) return;
        const { width, style, color } = this.state.frameData;
        this.dom.frameWidthSlider.value = width;
        this.dom.frameWidthValue.textContent = width;
        this.dom.frameStyleSelect.value = style;
        this.dom.frameColorPicker.value = color;
        const isNone = style === 'none';
        this.dom.frameWidthSlider.disabled = isNone;
        this.dom.frameColorPicker.disabled = isNone;
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
        const { zoom, pan, blurredImageUrl, isBlurred, swappedImageUrl, imageUrl, frameOffset, image } = this.state;
        let activeImageUrl = isBlurred ? blurredImageUrl : (swappedImageUrl || imageUrl);
        if (this.dom.previewImg.src !== activeImageUrl) {
            this.dom.previewImg.src = activeImageUrl;
        }
        if (isBlurred) {
            this.dom.previewImg.style.transform = `translate(${frameOffset.left}px, ${frameOffset.top}px) scale(1)`;
            this.dom.previewImg.style.width = `${this.dom.previewFrame.offsetWidth}px`;
            this.dom.previewImg.style.height = `${this.dom.previewFrame.offsetHeight}px`;
            this.dom.previewImg.style.filter = '';
        } else {
            this.dom.previewImg.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
            this.dom.previewImg.style.width = `${image.naturalWidth}px`;
            this.dom.previewImg.style.height = `${image.naturalHeight}px`;
            this.dom.previewImg.style.filter = this._getFilterString();
        }
    }
    
    _clampImagePan() {
        if (!this.state) return;
        const { pan, image, zoom, frameOffset } = this.state;
        const frame = this.dom.previewFrame;
        const scaledW = image.naturalWidth * zoom;
        const scaledH = image.naturalHeight * zoom;
        const { left: frameLeft, top: frameTop } = frameOffset;
        let minX, maxX, minY, maxY;
        if (scaledW > frame.offsetWidth) { minX = frameLeft + frame.offsetWidth - scaledW; maxX = frameLeft; } 
        else { minX = maxX = frameLeft + (frame.offsetWidth - scaledW) / 2; }
        if (scaledH > frame.offsetHeight) { minY = frameTop + frame.offsetHeight - scaledH; maxY = frameTop; } 
        else { minY = maxY = frameTop + (frame.offsetHeight - scaledH) / 2; }
        pan.x = Math.max(minX, Math.min(maxX, pan.x));
        pan.y = Math.max(minY, Math.min(maxY, pan.y));
    }

    async _handleConfirm() {
        if (!this.state) return;
        this.editor.history.addState(this.state.preEditEditorState);
        const { image, targetElement, zoom, pan, frameOffset, filters, colorSwap, isBlurred, brushMaskPoints, frameData } = this.state;
        
        const shouldApplyBlur = isBlurred || (brushMaskPoints && brushMaskPoints.length > 0);
    
        let finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetElement.width;
        finalCanvas.height = targetElement.height;
        const ctx = finalCanvas.getContext('2d');
        
        let sourceForProcessing = new Image();
        sourceForProcessing.src = this.state.imageUrl;
        await new Promise(resolve => sourceForProcessing.onload = resolve);
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sourceForProcessing.naturalWidth;
        tempCanvas.height = sourceForProcessing.naturalHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(sourceForProcessing, 0, 0);

        if (colorSwap && colorSwap.sources && colorSwap.sources.length > 0) {
            const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            this._applyColorSwapToImageData(imageData, colorSwap);
            tempCtx.putImageData(imageData, 0, 0);
        }
        
        const sX = (frameOffset.left - pan.x) / zoom;
        const sY = (frameOffset.top - pan.y) / zoom;
        const sW = this.dom.previewFrame.offsetWidth / zoom;
        const sH = this.dom.previewFrame.offsetHeight / zoom;
    
        if (shouldApplyBlur) {
            const sharpCanvas = document.createElement('canvas'); sharpCanvas.width = finalCanvas.width; sharpCanvas.height = finalCanvas.height; const sharpCtx = sharpCanvas.getContext('2d'); sharpCtx.filter = this._getFilterString(); sharpCtx.drawImage(tempCanvas, sX, sY, sW, sH, 0, 0, sharpCanvas.width, sharpCanvas.height);
            const blurredCanvas = document.createElement('canvas'); blurredCanvas.width = finalCanvas.width; blurredCanvas.height = finalCanvas.height; const blurredCtx = blurredCanvas.getContext('2d'); blurredCtx.filter = `blur(4px) ${this._getFilterString()}`; blurredCtx.drawImage(tempCanvas, sX, sY, sW, sH, 0, 0, blurredCanvas.width, blurredCanvas.height);
            const maskCanvas = document.createElement('canvas'); maskCanvas.width = finalCanvas.width; maskCanvas.height = finalCanvas.height; const maskCtx = maskCanvas.getContext('2d');
            const scale = finalCanvas.width / this.dom.blurCanvas.width; this._renderBrushMask(maskCtx, finalCanvas.width, finalCanvas.height, true, brushMaskPoints, scale);
            ctx.drawImage(blurredCanvas, 0, 0); sharpCtx.globalCompositeOperation = 'destination-in'; sharpCtx.drawImage(maskCanvas, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(sharpCanvas, 0, 0);
        } else {
            ctx.filter = this._getFilterString();
            ctx.drawImage(tempCanvas, sX, sY, sW, sH, 0, 0, finalCanvas.width, finalCanvas.height);
        }
        
        if (frameData && frameData.width > 0 && frameData.style !== 'none') {
            const fw = frameData.width;
            ctx.strokeStyle = frameData.color;
            ctx.lineCap = 'butt';
            switch (frameData.style) {
                case 'dashed':
                    ctx.lineWidth = fw;
                    ctx.setLineDash([fw * 2, fw]);
                    ctx.strokeRect(fw / 2, fw / 2, finalCanvas.width - fw, finalCanvas.height - fw);
                    break;
                case 'dotted':
                    ctx.lineWidth = fw;
                    ctx.lineCap = 'round';
                    ctx.setLineDash([0, fw * 1.5]);
                    ctx.strokeRect(fw / 2, fw / 2, finalCanvas.width - fw, finalCanvas.height - fw);
                    break;
                case 'double':
                    ctx.lineWidth = Math.max(1, Math.floor(fw / 3));
                    const lw = ctx.lineWidth;
                    ctx.setLineDash([]);
                    ctx.strokeRect(lw / 2, lw / 2, finalCanvas.width - lw, finalCanvas.height - lw);
                    ctx.strokeRect(fw - lw / 2, fw - lw / 2, finalCanvas.width - (2 * fw - lw), finalCanvas.height - (2 * fw - lw));
                    break;
                case 'solid':
                default:
                    ctx.lineWidth = fw;
                    ctx.setLineDash([]);
                    ctx.strokeRect(fw / 2, fw / 2, finalCanvas.width - fw, finalCanvas.height - fw);
                    break;
            }
        }

        const dataUrl = finalCanvas.toDataURL('image/png');
        const cropData = { zoom, sX, sY, filters, colorSwap, blurData: shouldApplyBlur ? { points: brushMaskPoints } : null, frameData };
        this.editor.updateSelectedElement({ src: dataUrl, cropData });
        if (this.state) { this.state.preUploadState = null; }
        this.close();
        this.editor._renderSidebarAndPreserveAccordion();
    }

    _updateColorSwapUI() {
        if (!this.state) return;
        const { sources, target, tolerance } = this.state.colorSwap;
        this.dom.sourceColorsContainer.innerHTML = sources.map((source, index) => `<button class="source-color-swatch" style="background-color: rgb(${source.r}, ${source.g}, ${source.b});" data-index="${index}" title="הסר צבע זה"><svg xmlns="http://www.w3.org/2000/svg" class="source-color-trash-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></button>`).join('');
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
        const data = imageData.data; const sourcesRgb = colorSwap.sources; if (sourcesRgb.length === 0) return;
        const targetRgb = this._hexToRgb(colorSwap.target); const tolerance = colorSwap.tolerance;
        for (let i = 0; i < data.length; i += 4) { const r = data[i], g = data[i + 1], b = data[i + 2]; for (const sourceRgb of sourcesRgb) { const distance = Math.sqrt(Math.pow(r - sourceRgb.r, 2) + Math.pow(g - sourceRgb.g, 2) + Math.pow(b - sourceRgb.b, 2)); if (distance < tolerance) { data[i] = targetRgb.r; data[i + 1] = targetRgb.g; data[i + 2] = targetRgb.b; break; } } }
    }
    
    _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
    }

    _resetBlurState(fullReset = true) {
        if (!this.state) return;
        this._toggleBrushMode(false);
        this.state.isBlurred = false;
        this.state.blurredImageUrl = null;
        this.dom.blurCanvas.getContext('2d').clearRect(0, 0, this.dom.blurCanvas.width, this.dom.blurCanvas.height);
        this.dom.applyBlurBtn.classList.remove('active-action-btn');
        if (fullReset) {
            this.state.brushMaskPoints = [];
            this.state.brushSize = 20;
            this.dom.brushSizeSlider.value = 20;
            this.dom.brushSizeValue.textContent = '20';
        }
        this.state.brushMode = 'draw';
        this._updateBrushButtons();
        this._updateImageEditorPreview();
    }

    _setBrushMode(mode) {
        if (!this.state) return;
        this.state.brushMode = mode;
        this._toggleBrushMode(true);
        this._updateBrushButtons();
    }

    _updateBrushButtons() {
        if (!this.state) return;
        const isBrushing = this.state.isBrushing;
        this.dom.markSharpAreaBtn.classList.toggle('active-brush-btn', isBrushing && this.state.brushMode === 'draw');
        this.dom.eraseSharpAreaBtn.classList.toggle('active-brush-btn', isBrushing && this.state.brushMode === 'erase');
    }

    _toggleBrushMode(forceState = null) {
        if (!this.state) return;
        const shouldBeBrushing = forceState !== null ? forceState : !this.state.isBrushing;
        if (shouldBeBrushing) {
            this._toggleColorPickMode(false);
            if (this.state.brushMaskPoints && this.state.brushMaskPoints.length > 0) {
                this._renderBrushMask(this.state.blurCtx, this.dom.blurCanvas.width, this.dom.blurCanvas.height);
            }
        }
        
        this.state.isBrushing = shouldBeBrushing;
        this.dom.previewWrapper.classList.toggle('brushing-mode', shouldBeBrushing);
        this.dom.blurCanvas.style.pointerEvents = shouldBeBrushing ? 'auto' : 'none';
        this._updateBrushButtons();

        if (shouldBeBrushing) {
            this._updateBrushCursor();
        } else {
            this.dom.previewWrapper.style.cursor = '';
            this.dom.blurCanvas.style.cursor = '';
        }
    }

    _startBrush(e) {
        if (!this.state || !this.state.isBrushing) return;
        this.isDrawingBrush = true;
        const { left, top } = this.dom.blurCanvas.getBoundingClientRect();
        const x = e.clientX - left;
        const y = e.clientY - top;
        this.state.brushMaskPoints.push({ mode: this.state.brushMode, brushSize: this.state.brushSize, path: [{ x, y }] });
        this._renderBrushMask(this.state.blurCtx, this.dom.blurCanvas.width, this.dom.blurCanvas.height);
        this.dom.applyBlurBtn.classList.add('active-action-btn');
    }

    _drawBrush(e) {
        if (!this.state || !this.isDrawingBrush) return;
        const { left, top } = this.dom.blurCanvas.getBoundingClientRect();
        const currentSegment = this.state.brushMaskPoints[this.state.brushMaskPoints.length - 1];
        currentSegment.path.push({ x: e.clientX - left, y: e.clientY - top });
        this._renderBrushMask(this.state.blurCtx, this.dom.blurCanvas.width, this.dom.blurCanvas.height);
    }
    
    _stopBrush() { this.isDrawingBrush = false; }

    _renderBrushMask(ctx, width, height, isFinal = false, points = null, scale = 1) {
        const brushSegments = points || this.state.brushMaskPoints;
        if (this.offscreenBrushCanvas.width !== width || this.offscreenBrushCanvas.height !== height) {
            this.offscreenBrushCanvas.width = width;
            this.offscreenBrushCanvas.height = height;
        }
        const offCtx = this.offscreenBrushCanvas.getContext('2d');
        offCtx.clearRect(0, 0, width, height);
        offCtx.globalCompositeOperation = 'source-over';
    
        if (brushSegments.length > 0) {
            brushSegments.forEach(segment => {
                if (segment.path.length === 0) return;
                
                offCtx.globalCompositeOperation = segment.mode === 'erase' ? 'destination-out' : 'source-over';
                offCtx.strokeStyle = segment.mode === 'erase' ? 'rgba(0,0,0,1)' : (isFinal ? '#fff' : 'purple');
                offCtx.fillStyle = segment.mode === 'erase' ? 'rgba(0,0,0,1)' : (isFinal ? '#fff' : 'purple');
                offCtx.lineWidth = (segment.brushSize || 20) * scale;
                offCtx.lineCap = 'round';
                offCtx.lineJoin = 'round';
                
                offCtx.beginPath(); const firstPoint = segment.path[0]; offCtx.moveTo(firstPoint.x * scale, firstPoint.y * scale);
                segment.path.forEach(point => { offCtx.lineTo(point.x * scale, point.y * scale); });
                
                if (segment.path.length === 1) { offCtx.arc(firstPoint.x * scale, firstPoint.y * scale, offCtx.lineWidth / 2, 0, Math.PI * 2); offCtx.fill(); } 
                else { offCtx.stroke(); }
            });
        }
    
        ctx.clearRect(0, 0, width, height);
        if (isFinal) {
            ctx.drawImage(this.offscreenBrushCanvas, 0, 0);
        } else if (brushSegments.length > 0) {
            ctx.globalAlpha = 0.5;
            ctx.drawImage(this.offscreenBrushCanvas, 0, 0);
            ctx.globalAlpha = 1.0;
        }
    }

    _updateBrushCursor() {
        if (!this.state) return;
        const size = this.state.brushSize;
        const halfSize = size / 2;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${halfSize}" cy="${halfSize}" r="${halfSize - 1}" fill="none" stroke="white" stroke-width="1.5"/><circle cx="${halfSize}" cy="${halfSize}" r="1" fill="white"/></svg>`;
        const cursorUrl = `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${halfSize} ${halfSize}, crosshair`;
        
        this.dom.previewWrapper.style.cursor = cursorUrl;
        this.dom.blurCanvas.style.cursor = cursorUrl;
    }

    async _applyBlur() {
        if (!this.state || this.state.brushMaskPoints.length === 0) {
            this.editor.showNotification('יש לסמן אזור חד תחילה.', 'error');
            return;
        }
        
        const originalBtnHTML = this.dom.applyBlurBtn.innerHTML;
        this.dom.applyBlurBtn.disabled = true;
        this.dom.applyBlurBtn.innerHTML = `<svg class="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
        this.dom.applyBlurBtn.classList.remove('active-action-btn');

        const { image, zoom, pan, frameOffset, brushMaskPoints, filters, colorSwap } = this.state;
        const frameW = this.dom.previewFrame.offsetWidth; const frameH = this.dom.previewFrame.offsetHeight;
        const sourceImage = new Image(); sourceImage.src = this.state.imageUrl; await new Promise(resolve => sourceImage.onload = resolve);
        const processCanvas = document.createElement('canvas'); processCanvas.width = sourceImage.naturalWidth; processCanvas.height = sourceImage.naturalHeight; const processCtx = processCanvas.getContext('2d'); processCtx.drawImage(sourceImage, 0, 0);
        if (colorSwap && colorSwap.sources && colorSwap.sources.length > 0) { const imageData = processCtx.getImageData(0, 0, processCanvas.width, processCanvas.height); this._applyColorSwapToImageData(imageData, colorSwap); processCtx.putImageData(imageData, 0, 0); }
        const sX = (frameOffset.left - pan.x) / zoom; const sY = (frameOffset.top - pan.y) / zoom; const sW = frameW / zoom; const sH = frameH / zoom;
        const sharpCanvas = document.createElement('canvas'); sharpCanvas.width = frameW; sharpCanvas.height = frameH; const sharpCtx = sharpCanvas.getContext('2d'); sharpCtx.filter = this._getFilterString(); sharpCtx.drawImage(processCanvas, sX, sY, sW, sH, 0, 0, frameW, frameH);
        const blurredCanvas = document.createElement('canvas'); blurredCanvas.width = frameW; blurredCanvas.height = frameH; const blurredCtx = blurredCanvas.getContext('2d'); blurredCtx.filter = `blur(4px) ${this._getFilterString()}`; blurredCtx.drawImage(processCanvas, sX, sY, sW, sH, 0, 0, frameW, frameH);
        const maskCanvas = document.createElement('canvas'); maskCanvas.width = frameW; maskCanvas.height = frameH; const maskCtx = maskCanvas.getContext('2d'); this._renderBrushMask(maskCtx, frameW, frameH, true, brushMaskPoints);
        const finalPreviewCanvas = document.createElement('canvas'); finalPreviewCanvas.width = frameW; finalPreviewCanvas.height = frameH; const finalPreviewCtx = finalPreviewCanvas.getContext('2d');
        finalPreviewCtx.drawImage(blurredCanvas, 0, 0); sharpCtx.globalCompositeOperation = 'destination-in'; sharpCtx.drawImage(maskCanvas, 0, 0); finalPreviewCtx.globalCompositeOperation = 'source-over'; finalPreviewCtx.drawImage(sharpCanvas, 0, 0);
        const dataUrl = finalPreviewCanvas.toDataURL('image/png');

        this.state.isBlurred = true;
        this.state.blurredImageUrl = dataUrl;
        this._toggleBrushMode(false);
        this._updateImageEditorPreview();

        this.dom.applyBlurBtn.disabled = false;
        this.dom.applyBlurBtn.innerHTML = originalBtnHTML;
    }
}

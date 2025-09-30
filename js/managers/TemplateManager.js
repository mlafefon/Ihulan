import { renderCoverElement } from '../renderers.js';
import { loadAllTemplates, saveTemplate as saveTemplateService } from '../services.js';

export class TemplateManager {
    constructor(editor) {
        this.editor = editor;
        this.templates = [];
    }

    async _loadAllTemplates() {
        this.templates = await loadAllTemplates();
    }

    loadTemplate(index) {
        if (this.editor.historyRecordingSuspended) return;
        const template = this.templates[index];
        if (!template) {
            console.error(`תבנית באינדקס ${index} אינה קיימת.`);
            return;
        }

        // Deep copy and apply defaults
        const elementsWithDefaults = this.editor._applyDefaultElementProperties(template.elements);
        
        this.editor.state = {
            ...this.editor.state,
            templateIndex: index,
            elements: elementsWithDefaults,
            backgroundColor: template.backgroundColor,
            selectedElementId: null,
            inlineEditingElementId: null,
            templateName: template.name,
            coverWidth: template.width || 700,
            coverHeight: template.height || 906,
        };
        this.editor.dom.templateNameInput.value = template.name;
        this.editor.dom.templateWidthInput.value = this.editor.state.coverWidth;
        this.editor.dom.templateHeightInput.value = this.editor.state.coverHeight;

        this.editor._updateCoverDimensions();
        
        this.editor._setDirty(false);
        this.editor.history.clear();
        this.editor.render();
    }

    _handleTemplateImport(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) {
            e.target.value = null; return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target.result;
                const templateData = JSON.parse(content);

                if (this.editor._isValidTemplate(templateData)) {
                    this._loadTemplateFromFileData(templateData);
                    // Immediately save the template so it appears in the list
                    this.saveUserTemplate();
                } else {
                    alert('קובץ התבנית אינו תקין או שאינו מכיל את כל המאפיינים הנדרשים.');
                }
            } catch (error) {
                alert('שגיאה בניתוח קובץ ה-JSON. יש לוודא שהקובץ תקין.');
                console.error("JSON Parse Error:", error);
            }
        };
        reader.readAsText(file);
        e.target.value = null; // Reset for next import
    }

    _loadTemplateFromFileData(templateData) {
        if (this.editor.historyRecordingSuspended) return;
        const elementsWithDefaults = this.editor._applyDefaultElementProperties(templateData.elements);
        
        this.editor.state = {
            ...this.editor.state,
            templateIndex: null, // Not from the pre-loaded list
            elements: elementsWithDefaults,
            backgroundColor: templateData.backgroundColor,
            selectedElementId: null,
            inlineEditingElementId: null,
            templateName: templateData.name,
            coverWidth: templateData.width || 700,
            coverHeight: templateData.height || 906,
        };
        this.editor.dom.templateNameInput.value = templateData.name;
        this.editor.dom.templateWidthInput.value = this.editor.state.coverWidth;
        this.editor.dom.templateHeightInput.value = this.editor.state.coverHeight;

        this.editor._updateCoverDimensions();
        
        this.editor._setDirty(true); // Mark as dirty since it's a new, unsaved state
        this.editor.history.clear();
        this.editor.render();
    }
    
    saveUserTemplate() {
        saveTemplateService(this.editor.state, this.templates, async () => {
            this.editor._setDirty(false);
            await this._loadAllTemplates(); // To refresh user templates list
        });
    }

    // --- Template Modal ---

    _openTemplateModal() {
        this.editor.dom.templateGrid.innerHTML = '';
        this.templates.forEach((template, index) => {
            const previewEl = this._createTemplatePreview(template, index);
            this.editor.dom.templateGrid.appendChild(previewEl);
        });
        this.editor.dom.templateModal.classList.remove('hidden');
    }

    _closeTemplateModal() {
        this.editor.dom.templateModal.classList.add('hidden');
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
            const domEl = renderCoverElement(el, this.editor.state, scale, elIndex);
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
}
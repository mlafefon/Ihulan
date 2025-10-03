
import { renderCoverElement } from '../renderers.js';
import { exportTemplate } from '../services.js';

export class TemplateManager {
    constructor(editor, supabaseClient) {
        this.editor = editor;
        this.supabase = supabaseClient;
        this.templates = [];
    }

    async _loadAllTemplates() {
        try {
            // Fetch public templates (user_id is null)
            const { data: publicData, error: publicError } = await this.supabase
                .from('templates')
                .select('template_data')
                .is('user_id', null);

            if (publicError) throw publicError;
            
            const publicTemplates = publicData.map(item => ({ ...item.template_data, isUserTemplate: false }));
            
            let userTemplates = [];
            if (this.editor.user) {
                // Fetch user-specific templates
                const { data: userData, error: userError } = await this.supabase
                    .from('templates')
                    .select('template_data')
                    .eq('user_id', this.editor.user.id);
                
                if (userError) throw userError;
                userTemplates = userData.map(item => ({ ...item.template_data, isUserTemplate: true }));
            }
            
            this.templates = [...publicTemplates, ...userTemplates];

        } catch (error) {
            console.error("נכשל בטעינת התבניות מ-Supabase:", error);
            this.templates = [];
        }
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
    
    async saveUserTemplate() {
        if (!this.editor.user) {
            alert('עליך להתחבר כדי לשמור תבניות.');
            return;
        }
        
        const name = this.editor.state.templateName.trim();
        if (!name) {
            alert('יש להזין שם לתבנית.');
            return;
        }
    
        const template_data = {
            name,
            width: this.editor.state.coverWidth,
            height: this.editor.state.coverHeight,
            backgroundColor: this.editor.state.backgroundColor,
            elements: this.editor.state.elements,
        };
    
        // Check if a template with this name already exists for the user
        const { count, error: countError } = await this.supabase
            .from('templates')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', this.editor.user.id)
            .eq('name', name);
    
        if (countError) {
            console.error('Error checking for existing template:', countError);
            alert(`שגיאה בבדיקת התבנית: ${countError.message}`);
            return;
        }
    
        const templateExists = count > 0;
        
        let result;
        if (templateExists) {
            // If it exists, UPDATE just the template_data
            result = await this.supabase
                .from('templates')
                .update({ template_data: template_data })
                .eq('user_id', this.editor.user.id)
                .eq('name', name);
        } else {
            // If it doesn't exist, INSERT a new record
            result = await this.supabase
                .from('templates')
                .insert({
                    user_id: this.editor.user.id,
                    name: name,
                    template_data: template_data
                });
        }
        
        const { error } = result;
    
        if (error) {
            console.error('Error saving template to Supabase:', error);
            alert(`שגיאה בשמירת התבנית: ${error.message}`);
        } else {
            alert(`התבנית "${name}" נשמרה בהצלחה!`);
            this.editor._setDirty(false);
            await this._loadAllTemplates();
        }
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

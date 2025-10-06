
import { renderCoverElement } from '../renderers.js';
import { exportTemplate } from '../services.js';

export class TemplateManager {
    constructor(supabaseClient) {
        this.editor = null;
        this.supabase = supabaseClient;
        this.templates = [];
    }

    setEditorContext(editor) {
        this.editor = editor;
    }

    async _loadAllTemplates(user) {
        try {
            // Fetch public templates (user_id is null)
            const { data: publicData, error: publicError } = await this.supabase
                .from('templates')
                .select('template_data')
                .is('user_id', null)
                .eq('is_active', true);

            if (publicError) throw publicError;
            
            const publicTemplates = publicData.map(item => ({ ...item.template_data, isUserTemplate: false }));
            
            let userTemplates = [];
            const currentUser = user || this.editor?.user;
            if (currentUser) {
                // Fetch user-specific templates that are active
                const { data: userData, error: userError } = await this.supabase
                    .from('templates')
                    .select('template_data')
                    .eq('user_id', currentUser.id)
                    .eq('is_active', true); // Only load active templates
                
                if (userError) throw userError;
                userTemplates = userData.map(item => ({ ...item.template_data, isUserTemplate: true }));
            }
            
            this.templates = [...publicTemplates, ...userTemplates];

        } catch (error) {
            console.error("נכשל בטעינת התבניות מ-Supabase:", error);
            this.templates = [];
        }
    }

    _loadTemplateData(templateData, options = {}) {
        const { isInitialLoad = false, fromPreloadedList = false, templateIndex = null } = options;

        if (this.editor.historyRecordingSuspended) return;
        const elementsWithDefaults = this.editor._applyDefaultElementProperties(templateData.elements);
        
        this.editor.state = {
            ...this.editor.state,
            templateIndex: fromPreloadedList ? templateIndex : null,
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
        
        this.editor._setDirty(!isInitialLoad && !fromPreloadedList);
        this.editor.history.clear();
        this.editor.render();
    }

    loadTemplate(index) {
        if (this.editor.historyRecordingSuspended) return;
        const template = this.templates[index];
        if (!template) {
            console.error(`תבנית באינדקס ${index} אינה קיימת.`);
            return;
        }
        this._loadTemplateData(template, { fromPreloadedList: true, templateIndex: index });
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
                } else {
                    this.editor.showNotification('קובץ התבנית אינו תקין או שאינו מכיל את כל המאפיינים הנדרשים.', 'error');
                }
            } catch (error) {
                this.editor.showNotification('שגיאה בניתוח קובץ ה-JSON. יש לוודא שהקובץ תקין.', 'error');
                console.error("JSON Parse Error:", error);
            }
        };
        reader.readAsText(file);
        e.target.value = null; // Reset for next import
    }

    _loadTemplateFromFileData(templateData) {
        if (this.editor.historyRecordingSuspended) return;
        this._loadTemplateData(templateData);
        // Immediately save the template so it appears in the list
        this.saveUserTemplate();
    }
    
    async saveUserTemplate() {
        if (!this.editor.user) {
            this.editor.showNotification('עליך להתחבר כדי לשמור תבניות.', 'error');
            return;
        }
        
        const name = this.editor.state.templateName.trim();
        if (!name) {
            this.editor.showNotification('יש להזין שם לתבנית.', 'error');
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
            this.editor.showNotification(`שגיאה בבדיקת התבנית: ${countError.message}`, 'error');
            return;
        }
    
        const templateExists = count > 0;
        
        let result;
        if (templateExists) {
            // If it exists, UPDATE and set is_active to true (undelete)
            result = await this.supabase
                .from('templates')
                .update({ template_data: template_data, is_active: true })
                .eq('user_id', this.editor.user.id)
                .eq('name', name);
        } else {
            // If it doesn't exist, INSERT a new record as active
            result = await this.supabase
                .from('templates')
                .insert({
                    user_id: this.editor.user.id,
                    name: name,
                    template_data: template_data,
                    is_active: true
                });
        }
        
        const { error } = result;
    
        if (error) {
            console.error('Error saving template to Supabase:', error);
            this.editor.showNotification(`שגיאה בשמירת התבנית: ${error.message}`, 'error');
        } else {
            this.editor.showNotification(`התבנית "${name}" נשמרה בהצלחה!`, 'success');
            this.editor._setDirty(false);
            await this._loadAllTemplates(this.editor.user);
        }
    }
    
    async _performSoftDelete(templateIndex) {
        if (!this.editor.user) {
            this.editor.showNotification('עליך להתחבר כדי למחוק תבניות.', 'error');
            return;
        }
        
        const currentTemplate = this.templates[templateIndex];
        if (!currentTemplate || !currentTemplate.isUserTemplate) { return; }
    
        const templateName = currentTemplate.name;
    
        // The fix: remove `count` check and rely only on the error object.
        const { error } = await this.supabase
            .from('templates')
            .update({ is_active: false })
            .eq('user_id', this.editor.user.id)
            .eq('name', templateName);
    
        if (error) {
            console.error('Error soft-deleting template from Supabase:', error);
            this.editor.showNotification(`שגיאה במחיקת התבנית: ${error.message}`, 'error');
        } else {
            // If there is no error, the operation was successful.
            this.editor.showNotification(`התבנית "${templateName}" נמחקה בהצלחה.`, 'success');
            
            const wasCurrentTemplate = this.editor.state.templateIndex === templateIndex;
            
            await this._loadAllTemplates(this.editor.user);
            this._openTemplateModal(); // Refresh the modal with the updated list

            if (wasCurrentTemplate) {
                if (this.templates.length > 0) {
                    this.loadTemplate(0);
                } else {
                    // Logic for when no templates are left
                    this.editor.state.elements = [];
                    this.editor.state.backgroundColor = '#334155';
                    this.editor.state.templateName = 'תבנית חדשה';
                    this.editor.state.selectedElementId = null;
                    this.editor.state.inlineEditingElementId = null;
                    this.editor.dom.templateNameInput.value = 'תבנית חדשה';
                    this.editor.render();
                    this.editor.history.clear();
                    this.editor._setDirty(false);
                }
            }
        }
    }


    // --- Template Modal ---

    _openTemplateModal() {
        this.editor.dom.templateGrid.innerHTML = '';
        this.templates.forEach((template, index) => {
            if (template.name && template.name.toLowerCase() === 'default') {
                return; // Skip rendering the default template
            }
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
        container.className = 'template-preview-container cursor-pointer bg-slate-800 rounded-lg shadow-md';
        container.dataset.templateIndex = index;
    
        if (template.isUserTemplate) {
            container.classList.add('user-template');
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'template-delete-btn';
            deleteBtn.dataset.action = 'request-template-delete';
            deleteBtn.title = 'מחק תבנית';
            deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>`;
            container.appendChild(deleteBtn);
        }
    
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'p-3';
    
        const cover = document.createElement('div');
        cover.className = 'relative w-full overflow-hidden shadow-inner rounded-md';
        cover.style.aspectRatio = `${template.width || 700} / ${template.height || 906}`;
        cover.style.backgroundColor = template.backgroundColor;
    
        const scale = 240 / (template.width || 700);
    
        const previewState = this.editor?.state || { selectedElementId: null, inlineEditingElementId: null };
    
        template.elements.forEach((el, elIndex) => {
            const domEl = renderCoverElement(el, previewState, scale, elIndex);
            cover.appendChild(domEl);
        });
        
        const overlay = document.createElement('div');
        overlay.className = 'template-preview-overlay';
        cover.appendChild(overlay);
    
        const name = document.createElement('p');
        name.className = 'text-center text-sm mt-3 font-semibold text-slate-300 truncate';
        name.textContent = template.name;
    
        contentWrapper.appendChild(cover);
        contentWrapper.appendChild(name);
        container.appendChild(contentWrapper);
        
        return container;
    }
    
    _renderModalDeleteConfirmation(templateIndex) {
        this._removeModalDeleteConfirmation(); // Ensure only one is open

        const template = this.templates[templateIndex];
        if (!template) return;

        const container = this.editor.dom.templateGrid.querySelector(`[data-template-index="${templateIndex}"]`);
        if (!container) return;

        const confirmationDiv = document.createElement('div');
        confirmationDiv.className = 'template-delete-confirmation';
        confirmationDiv.innerHTML = `
            <p class="text-slate-300 text-sm mb-2">למחוק את<br><strong>"${template.name}"</strong>?</p>
            <div class="flex gap-2 w-full">
                <button data-action="cancel-template-delete" class="sidebar-btn bg-slate-600 hover:bg-slate-500 text-xs flex-1">ביטול</button>
                <button data-action="confirm-template-delete" data-template-index="${templateIndex}" class="sidebar-btn bg-red-600 hover:bg-red-700 text-xs flex-1">מחק</button>
            </div>
        `;
        container.appendChild(confirmationDiv);
    }

    _removeModalDeleteConfirmation() {
        const existingConfirmation = this.editor.dom.templateGrid.querySelector('.template-delete-confirmation');
        if (existingConfirmation) {
            existingConfirmation.remove();
        }
    }
}


import { renderCoverElement, renderSidebar } from './js/renderers.js';
import { ImageEditor } from './js/ImageEditor.js';
import { exportTemplate, exportImage, embedFontsInCss } from './js/services.js';
import { loadGoogleFonts, injectFontStyles, getGoogleFontsUrl } from './js/fonts.js';
import { InteractionManager } from './js/managers/InteractionManager.js';
import { HistoryManager } from './js/managers/HistoryManager.js';
import { TemplateManager } from './js/managers/TemplateManager.js';


/**
 * @file index.js
 * Main script for the Magazine Cover Editor SPA.
 *
 * Structure:
 * 1. AppManager: Main application class that orchestrates views and state.
 * 2. MagazineEditor: The editor class, now controlled by AppManager.
 */

// --- SUPABASE SETUP ---
const SUPABASE_URL = 'https://klicewxazipstfdlfwbb.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsaWNld3hhemlwc3RmZGxmd2JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNTY1NDgsImV4cCI6MjA3NDkzMjU0OH0.XJbN59NCq7KPUQu3MpCmXMg1T2RchPhNhio5NKwlnjY';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// --- UTILITY FUNCTIONS ---
function toggleAccordionPanel(toggleBtn) {
    const panelId = toggleBtn.getAttribute('aria-controls');
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const container = toggleBtn.closest('.accordion-group')?.parentElement;
    if (!container) return;

    const isCurrentlyOpen = panel.classList.contains('open');

    container.querySelectorAll('.accordion-toggle').forEach(btn => {
        const p = document.getElementById(btn.getAttribute('aria-controls'));
        if (p && p.classList.contains('open')) {
            p.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
            btn.querySelector('.accordion-chevron')?.classList.remove('rotate-180');
        }
    });

    if (!isCurrentlyOpen) {
        panel.classList.add('open');
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.querySelector('.accordion-chevron')?.classList.add('rotate-180');
    }
}

// --- MAIN APP CONTROLLER ---
class AppManager {
    constructor() {
        this.user = null;
        this.editorInstance = null;
        this.templateManager = new TemplateManager(null, supabaseClient);
        this.cacheDom();
        this.bindAppEvents();
        this.init();
    }

    cacheDom() {
        this.dom = {
            mainHeader: document.getElementById('main-header'),
            headerAuthContainer: document.getElementById('header-auth-container'),
            logoBtn: document.getElementById('logo-btn'),
            newDesignBtn: document.getElementById('new-design-btn'),
            backToTemplatesBtn: document.getElementById('back-to-templates-btn'),

            landingView: document.getElementById('landing-view'),
            landingAuthContainer: document.getElementById('landing-auth-container'),
            getStartedBtn: document.getElementById('get-started-btn'),

            templatesView: document.getElementById('templates-view'),
            templatesGridContainer: document.getElementById('templates-grid-container'),
            
            editorView: document.getElementById('main-editor-container'),
            versionContainer: document.getElementById('version-container'),
        };
    }

    async init() {
        loadGoogleFonts();
        injectFontStyles();
        await this.displayVersion();
        
        supabaseClient.auth.onAuthStateChange(async (_event, session) => {
            this.user = session?.user || null;
            
            if (this.user) {
                await this.templateManager._loadAllTemplates(this.user);
                this.showView('templates');
            } else {
                this.templateManager.templates = [];
                await this.templateManager._loadAllTemplates(null);
                this.showView('landing');
            }
        });
    }

    bindAppEvents() {
        this.dom.getStartedBtn.addEventListener('click', () => {
            document.getElementById('cta-section').scrollIntoView({ behavior: 'smooth' });
        });

        this.dom.backToTemplatesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.showView('templates');
        });
        
        this.dom.logoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.showView('templates');
        });

        this.dom.newDesignBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.launchEditor(null);
        });
    }

    showView(viewName) {
        // Hide all views
        this.dom.landingView.classList.add('hidden');
        this.dom.templatesView.classList.add('hidden');
        this.dom.editorView.classList.add('hidden');
        this.dom.mainHeader.classList.add('hidden');

        switch (viewName) {
            case 'landing':
                this.dom.landingView.classList.remove('hidden');
                this.renderLandingAuth();
                break;
            case 'templates':
                this.dom.templatesView.classList.remove('hidden');
                this.dom.mainHeader.classList.remove('hidden');
                this.dom.backToTemplatesBtn.classList.add('hidden');
                this.renderHeaderAuth();
                this.renderTemplatesGrid();
                break;
            case 'editor':
                this.dom.editorView.classList.remove('hidden');
                this.dom.mainHeader.classList.remove('hidden');
                this.dom.backToTemplatesBtn.classList.remove('hidden');
                this.renderHeaderAuth();
                break;
        }
    }

    async displayVersion() {
        try {
            const response = await fetch('metadata.json');
            const metadata = await response.json();
            if (metadata.version && this.dom.versionContainer) {
                this.dom.versionContainer.textContent = `גרסה ${metadata.version}`;
            }
        } catch (error) { console.error("Failed to load metadata for version display:", error); }
    }

    // --- Auth Rendering & Actions ---
    renderHeaderAuth() {
        if (!this.user) {
            this.dom.headerAuthContainer.innerHTML = '';
            return;
        }
    
        const email = this.user.email;
        const nameParts = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ').split(' ');
        let initials = ((nameParts[0]?.[0] || '') + (nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : '')).toUpperCase();
        if (!initials || initials.length > 2) {
            initials = email.substring(0, 2).toUpperCase();
        }
    
        this.dom.headerAuthContainer.innerHTML = `
            <span class="user-email text-slate-300 text-sm hidden sm:block">${email}</span>
            <div class="user-avatar-display">
               ${initials}
            </div>
            <button data-auth-action="logout" class="header-icon-btn" title="יציאה">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 13v-2H7v-2h9V5l4 3.5-4 3.5zM20 3h-9c-1.103 0-2 .897-2 2v4h2V5h9v14h-9v-4H9v4c0 1.103.897 2 2 2h9c1.103 0 2-.897 2-2V5c0-1.103-.897-2-2-2z"/></svg>
            </button>
        `;
        this.dom.headerAuthContainer.querySelector('[data-auth-action="logout"]').addEventListener('click', () => supabaseClient.auth.signOut());
    }

    renderLandingAuth() {
        this.dom.landingAuthContainer.innerHTML = `
            <button data-auth-action="login_google" class="sidebar-btn bg-indigo-600 hover:bg-indigo-700 flex-1 flex items-center justify-center gap-2 w-full py-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A8 8 0 0 1 24 36c-4.418 0-8-3.582-8-8h-8c0 6.627 5.373 12 12 12z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C43.021 36.258 48 30.656 48 24c0-1.341-.138-2.65-.389-3.917z"/></svg>
                <span>המשך עם גוגל</span>
            </button>
            <button data-auth-action="show_email_login" class="sidebar-btn bg-slate-600 hover:bg-slate-500 w-full py-3">המשך עם אימייל וסיסמה</button>
        `;
        this.dom.landingAuthContainer.addEventListener('click', this.handleAuthAction.bind(this));
    }
    
    handleAuthAction(e) {
        const target = e.target.closest('[data-auth-action]');
        if (!target) return;
        e.preventDefault();
        const action = target.dataset.authAction;

        switch (action) {
            case 'login_google':
                supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
                break;
            case 'show_email_login':
                this.renderEmailForm();
                break;
            case 'login_email':
                this.performEmailLogin(target);
                break;
        }
    }

    renderEmailForm() {
        this.dom.landingAuthContainer.innerHTML = `
            <form id="auth-email-form" class="space-y-3 text-left" dir="ltr">
                <input type="email" name="email" autocomplete="email" required placeholder="Email" class="w-full bg-slate-700 border border-slate-600 text-white rounded-md p-3">
                <input type="password" name="password" autocomplete="current-password" required placeholder="Password" class="w-full bg-slate-700 border border-slate-600 text-white rounded-md p-3">
                <button type="button" data-auth-action="login_email" class="sidebar-btn bg-blue-600 hover:bg-blue-700 w-full py-3">התחברות</button>
            </form>
        `;
    }

    async performEmailLogin(button) {
        const form = button.closest('form');
        const email = form.querySelector('input[name="email"]').value;
        const password = form.querySelector('input[name="password"]').value;
        if (!email || !password) {
            this.showNotification('יש למלא אימייל וסיסמה.', 'error');
            return;
        }
        
        button.disabled = true;
        button.innerHTML = '<svg class="animate-spin h-5 w-5 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
        
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            this.showNotification(error.message, 'error');
            button.disabled = false;
            button.innerHTML = 'התחברות';
        }
    }

    // --- Templates View ---
    renderTemplatesGrid() {
        const grid = document.createElement('div');
        grid.className = 'templates-grid';
        
        if (this.templateManager.templates.length === 0 && this.user) {
            this.dom.templatesGridContainer.innerHTML = `<p class="text-slate-400">עדיין אין לך עיצובים שמורים. לחץ על "עיצוב חדש" כדי להתחיל!</p>`;
            return;
        }
        
        this.templateManager.templates.forEach((template, index) => {
            if (template.name && template.name.toLowerCase() === 'default') return;
            const previewEl = this.templateManager._createTemplatePreview(template, index);
            previewEl.addEventListener('click', () => this.launchEditor(template));
            grid.appendChild(previewEl);
        });
        this.dom.templatesGridContainer.innerHTML = '';
        this.dom.templatesGridContainer.appendChild(grid);
    }

    // --- Editor ---
    async launchEditor(templateData) {
        this.showView('editor');
        if (!this.editorInstance) {
            this.editorInstance = new MagazineEditor(this);
            await this.editorInstance.initOnce();
        }
        await this.editorInstance.loadNewTemplate(templateData, this.user);
    }
    
    showNotification(message, type = 'success', duration = 3000) {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `notification-toast ${type}`;
        toast.textContent = message;
        toast.setAttribute('role', 'alert');
        container.appendChild(toast);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
        });

        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        }, duration);
    }
}


// --- MAGAZINE EDITOR CLASS (MODIFIED FOR SPA) ---
class MagazineEditor {
    constructor(appManager) {
        this.appManager = appManager;
        this.state = {};
        this.user = null;
        this.interactionState = {};
        this.isLayerMenuOpen = false;
        this.savedRange = null;
        this.isApplyingStyle = false;
        this.historyRecordingSuspended = false;
        this.isInteractingWithNativeColorPicker = false;
    }

    async initOnce() {
        this._cacheDom();
        this.history = new HistoryManager(this);
        this.imageEditor = new ImageEditor(this);
        this.interactionManager = new InteractionManager(this);
        this.templateManager = new TemplateManager(this, supabaseClient);
        
        this.resizeObserver = new ResizeObserver(() => this.renderCover());
        this.resizeObserver.observe(this.dom.coverBoundary);

        this._bindEvents();
    }

    async loadNewTemplate(templateData, user) {
        this.user = user;
        this.templateManager.editor = this; // Ensure template manager has correct context
        
        // Use default template if none provided
        if (!templateData) {
            try {
                const response = await fetch('templates/default.json');
                templateData = await response.json();
            } catch (error) {
                console.error("Failed to load default template for new design:", error);
                this.appManager.showNotification('לא ניתן לטעון תבנית ברירת מחדל.', 'error');
                return;
            }
        }
        
        this._loadTemplateData(templateData);
    }

    _loadTemplateData(templateData) {
        const elementsWithDefaults = this._applyDefaultElementProperties(templateData.elements);
        
        this.state = {
            elements: elementsWithDefaults,
            backgroundColor: templateData.backgroundColor,
            selectedElementId: null,
            inlineEditingElementId: null,
            templateName: templateData.name,
            coverWidth: templateData.width || 700,
            coverHeight: templateData.height || 906,
            isDirty: false,
        };
        this.dom.templateNameInput.value = templateData.name;
        this.dom.templateWidthInput.value = this.state.coverWidth;
        this.dom.templateHeightInput.value = this.state.coverHeight;

        this._updateCoverDimensions();
        
        this.history.clear();
        this.render();
    }
    
    // Most MagazineEditor methods remain the same...
    // I am including the full class content, but with key modifications.

    _cacheDom() {
        this.dom = {
            mainEditorContainer: document.getElementById('main-editor-container'),
            magazineCover: document.getElementById('magazine-cover'),
            coverBoundary: document.getElementById('cover-boundary'),
            sidebar: document.getElementById('sidebar'),
            sidebarEditorHeader: document.getElementById('sidebar-editor-header'),
            sidebarContent: document.getElementById('sidebar-content'),
            templateActions: document.getElementById('template-actions'),
            elementImageUploadInput: document.getElementById('element-image-upload'),
            importTemplateBtn: document.getElementById('import-template-btn'),
            importTemplateInput: document.getElementById('import-template-input'),
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
            bottomActions: document.getElementById('bottom-actions'),
            undoBtn: document.getElementById('undo-btn'),
            redoBtn: document.getElementById('redo-btn'),
        };
    }

    _applyDefaultElementProperties(elements) {
        return elements.map(el => {
            const baseDefaults = { rotation: 0 };
            if (el.type === 'text') {
                return { ...baseDefaults, shadow: false, bgColor: 'transparent', bgColorOpacity: 1, shape: 'rectangle', textAlign: 'center', verticalAlign: 'center', multiLine: false, letterSpacing: 0, lineHeight: 1.2, ...el };
            }
            if (el.type === 'image') {
                return { ...baseDefaults, originalSrc: null, cropData: null, ...el };
            }
            if (el.type === 'clipping-shape') {
                return { ...baseDefaults, shape: 'ellipse', ...el };
            }
            return { ...baseDefaults, ...el };
        });
    }

    _isValidTemplate(templateData) {
        return templateData && typeof templateData.name === 'string' && Array.isArray(templateData.elements) && typeof templateData.backgroundColor === 'string' && typeof templateData.width === 'number' && typeof templateData.height === 'number';
    }
    
    _bindEvents() {
        this.dom.elementImageUploadInput.addEventListener('change', this._handleElementImageUpload.bind(this));
        
        // Remove changeTemplateBtn listener, as template changes happen on templates page
        
        this.dom.importTemplateBtn.addEventListener('click', () => this.dom.importTemplateInput.click());
        this.dom.importTemplateInput.addEventListener('change', this.templateManager._handleTemplateImport.bind(this.templateManager));
        
        // Modal events are now for image editor, etc., not a separate template modal view.
        this.dom.modalCloseBtn.addEventListener('click', this.templateManager._closeTemplateModal.bind(this.templateManager));
        this.dom.templateModalOverlay.addEventListener('click', this.templateManager._closeTemplateModal.bind(this.templateManager));
        this.dom.templateModal.addEventListener('click', this._handleTemplateModalClick.bind(this));

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

        this.dom.saveTemplateBtn.addEventListener('click', () => this.templateManager.saveUserTemplate());
        this.dom.exportTemplateBtn.addEventListener('click', () => exportTemplate(this.state));
        this.dom.exportImageBtn.addEventListener('click', () => exportImage(this.dom.exportImageBtn, this.dom.coverBoundary, this.state, this));
        
        this.dom.sidebar.addEventListener('input', this._handleSidebarInput.bind(this));
        this.dom.sidebar.addEventListener('change', this._handleSidebarInput.bind(this));
        this.dom.sidebar.addEventListener('click', this._handleSidebarClick.bind(this));
        this.dom.sidebar.addEventListener('mousedown', this._handleSidebarMouseDown.bind(this));
        this.dom.sidebar.addEventListener('keydown', this._handleSidebarKeyDown.bind(this));
        
        [this.dom.sidebar, this.imageEditor.dom.modal].forEach(container => {
            container.addEventListener('click', e => {
                const toggleBtn = e.target.closest('.accordion-toggle');
                if (toggleBtn) toggleAccordionPanel(toggleBtn);
            });
        });
        
        this.dom.coverBoundary.addEventListener('mousedown', this.interactionManager.handleCoverMouseDown.bind(this.interactionManager));
        document.addEventListener('click', this._handleGlobalClick.bind(this));
        
        this.dom.undoBtn.addEventListener('click', () => this.history.undo());
        this.dom.redoBtn.addEventListener('click', () => this.history.redo());
        document.addEventListener('keydown', (e) => {
            if (this.appManager.dom.editorView.classList.contains('hidden')) return; // Only listen when editor is active
            if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.history.undo(); }
            if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this.history.redo(); }
        });

        document.addEventListener('selectionchange', this._handleSelectionChange.bind(this));

        window.addEventListener('beforeunload', (e) => {
            if (this.state.isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    showNotification(message, type, duration) {
        this.appManager.showNotification(message, type, duration);
    }
    
    // All other MagazineEditor methods (_handleSidebarInput, render, etc.)
    // are kept as they were, because their logic is internal to the editor component.
    // I will paste the rest of the class methods here, without the ones I've already modified or removed.
    
    _handleSidebarMouseDown(e) { if (e.target.matches('.native-color-picker')) { this.isInteractingWithNativeColorPicker = true; } }
    _handleSidebarKeyDown(e) {
        const { target } = e; const prop = target.dataset.property; const richTextPropsWithManualInput = ['fontSize', 'letterSpacing', 'lineHeight'];
        if (richTextPropsWithManualInput.includes(prop)) {
            const typingFlag = `isTyping${prop.charAt(0).toUpperCase() + prop.slice(1)}`;
            if (e.key === 'Enter') { e.preventDefault(); this.interactionState[typingFlag] = false; target.blur(); } 
            else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); this.interactionState[typingFlag] = false; const currentValue = parseFloat(target.value) || 0; const step = e.shiftKey ? 10 : 1; const newValue = e.key === 'ArrowUp' ? currentValue + step : Math.max(1, currentValue - step); target.value = newValue; target.dispatchEvent(new Event('change', { bubbles: true })); } 
            else if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') { this.interactionState[typingFlag] = true; }
        }
    }
    _handleGlobalClick(e) {
        if (this.isLayerMenuOpen) { const toggleButton = this.dom.sidebar.querySelector('[data-action="toggle-layer-menu"]'); const menu = document.getElementById('layer-menu'); if (toggleButton && menu && !toggleButton.contains(e.target) && !menu.contains(e.target)) { this._toggleLayerMenu(false); } }
        if (this.isInteractingWithNativeColorPicker) { return; }
        this.dom.sidebar.querySelectorAll('.custom-color-picker').forEach(picker => {
            const isClickInsidePicker = picker.contains(e.target);
            if (!isClickInsidePicker) { const btn = picker.querySelector('.color-display-btn'); if (btn.getAttribute('aria-expanded') === 'true') { const cancelButton = picker.querySelector('[data-action="cancel-color"]'); if (cancelButton) cancelButton.click(); } }
        });
        const openFontSizeDropdown = this.dom.sidebar.querySelector('.font-size-dropdown:not(.hidden)');
        if (openFontSizeDropdown) { const wrapper = openFontSizeDropdown.closest('.relative'); if (wrapper && !wrapper.contains(e.target)) { openFontSizeDropdown.classList.add('hidden'); } }
    }
    _toggleLayerMenu(forceState) {
        const menu = document.getElementById('layer-menu'); const arrow = document.querySelector('[data-action="toggle-layer-menu"] svg.dropdown-arrow'); if (!menu || !arrow) return;
        const shouldBeOpen = typeof forceState === 'boolean' ? forceState : menu.classList.contains('hidden'); this.isLayerMenuOpen = shouldBeOpen; menu.classList.toggle('hidden', !shouldBeOpen); arrow.classList.toggle('rotate-180', shouldBeOpen);
    }
    _toggleColorPopover(btn, forceClose = false) {
        const popover = btn.nextElementSibling; if (!popover) return; const picker = btn.closest('.custom-color-picker'); const isOpening = popover.classList.contains('hidden');
        this.dom.sidebar.querySelectorAll('.color-popover:not(.hidden)').forEach(p => { if (p !== popover) { const cancelButton = p.querySelector('[data-action="cancel-color"]'); if (cancelButton) cancelButton.click(); } });
        if (forceClose) { popover.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); delete this.interactionState.colorPickerOriginalValue; delete this.interactionState.colorPickerProperty; delete this.interactionState.preColorPickerState; } 
        else {
            const shouldBeOpen = isOpening; if (shouldBeOpen) { const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId); const prop = picker.dataset.property; if(selectedEl && prop) { this.interactionState.colorPickerOriginalValue = selectedEl[prop]; this.interactionState.colorPickerProperty = prop; this.interactionState.preColorPickerState = this._getStateSnapshot(); } }
            popover.classList.toggle('hidden', !shouldBeOpen); btn.setAttribute('aria-expanded', shouldBeOpen);
        }
    }
    _toggleFontSizeDropdown(btn) { const dropdown = btn.closest('.relative').querySelector('.font-size-dropdown'); if (dropdown) { dropdown.classList.toggle('hidden'); } }
    _handleFontSizeSelection(item) { const value = item.dataset.value; const dropdown = item.closest('.font-size-dropdown'); const input = dropdown.closest('.relative').querySelector('input[data-property="fontSize"]'); if (input && dropdown) { input.value = value; const event = new Event('change', { bubbles: true }); input.dispatchEvent(event); dropdown.classList.add('hidden'); } }
    _setDirty(isDirty) { this.state.isDirty = isDirty; this.dom.saveTemplateBtn.classList.toggle('dirty-button', isDirty); if (this.user) { this.dom.saveTemplateBtn.disabled = false; } }
    _getStateSnapshot() { return JSON.parse(JSON.stringify(this.state)); }
    restoreState(newState) {
        this.historyRecordingSuspended = true;
        this.state.elements = newState.elements; this.state.backgroundColor = newState.backgroundColor; this.state.coverWidth = newState.coverWidth; this.state.coverHeight = newState.coverHeight; this.state.templateName = newState.templateName;
        this.state.selectedElementId = newState.elements.some(el => el.id === this.state.selectedElementId) ? this.state.selectedElementId : null;
        this.dom.templateNameInput.value = this.state.templateName; this.dom.templateWidthInput.value = this.state.coverWidth; this.dom.templateHeightInput.value = this.state.coverHeight;
        this._updateCoverDimensions(); this.render();
        this.historyRecordingSuspended = false;
    }
    _updateCoverDimensions() { this.dom.magazineCover.style.maxWidth = `${this.state.coverWidth}px`; this.dom.magazineCover.style.aspectRatio = `${this.state.coverWidth} / ${this.state.coverHeight}`; }
    updateSelectedElement(props) { const el = this.state.elements.find(el => el.id === this.state.selectedElementId); if (el) { Object.assign(el, props); this._setDirty(true); this.renderCover(); } }
    render() { this.renderCover(); this._renderSidebarAndPreserveAccordion(); }
    _renderSidebarAndPreserveAccordion() {
        const openAccordion = this.dom.sidebar.querySelector('.accordion-panel.open'); const openAccordionId = openAccordion ? openAccordion.id : null;
        this.renderSidebar();
        if (openAccordionId) { const panelToReopen = this.dom.sidebar.querySelector(`#${openAccordionId}`); if (panelToReopen) { const toggleBtn = panelToReopen.previousElementSibling; if (toggleBtn && toggleBtn.matches('.accordion-toggle')) { toggleBtn.click(); } } }
    }
    renderCover(snapLines = []) {
        const currentWidth = this.dom.coverBoundary.offsetWidth; const scale = (this.state.coverWidth > 0 && currentWidth > 0) ? currentWidth / this.state.coverWidth : 1;
        this.dom.coverBoundary.innerHTML = ''; this.dom.coverBoundary.style.backgroundColor = this.state.backgroundColor;
        this.state.elements.forEach((el, index) => { const domEl = renderCoverElement(el, this.state, scale, index); this.dom.coverBoundary.appendChild(domEl); });
        this._renderSnapGuides(snapLines, scale);
    }
    _renderSnapGuides(snapLines, scale = 1) {
        this.dom.coverBoundary.querySelectorAll('.snap-guide').forEach(el => el.remove());
        snapLines.forEach(line => { const guideEl = document.createElement('div'); guideEl.className = `snap-guide ${line.type}`; if (line.type === 'vertical') { guideEl.style.left = `${line.position * scale}px`; } else { guideEl.style.top = `${line.position * scale}px`; } this.dom.coverBoundary.appendChild(guideEl); });
    }
    renderSidebar() { const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId); renderSidebar(selectedEl, this.dom.sidebarEditorHeader, this.dom.sidebarContent, this.dom.templateActions, this.dom.bottomActions); }
    async _handleAuthAction(e) { /* This is now handled by AppManager */ }
    _handleElementImageUpload(e) {
        const file = e.target.files && e.target.files[0]; const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
        if (!file || !selectedEl) { e.target.value = null; return; }
        const preUploadState = { src: selectedEl.src, originalSrc: selectedEl.originalSrc, cropData: selectedEl.cropData ? JSON.parse(JSON.stringify(selectedEl.cropData)) : null, };
        const reader = new FileReader();
        reader.onload = (event) => {
            const newOriginalSrc = event.target.result;
            this.updateSelectedElement({ originalSrc: newOriginalSrc, src: newOriginalSrc, cropData: null });
            const img = new Image(); img.onload = () => { this.imageEditor.open(newOriginalSrc, img, selectedEl, preUploadState); }; img.onerror = () => this.showNotification("לא ניתן היה לטעון את קובץ התמונה.", 'error'); img.src = newOriginalSrc;
        };
        reader.readAsDataURL(file); e.target.value = null;
    }
    _deselectAndCleanup() {
        this._clearCustomSelection(); const oldSelectedId = this.state.selectedElementId;
        if (oldSelectedId) { const oldElement = this.state.elements.find(el => el.id === oldSelectedId); if (oldElement && oldElement.type === 'clipping-shape') { this.history.addState(this._getStateSnapshot()); this.state.elements = this.state.elements.filter(el => el.id !== oldSelectedId); } }
        this.state.selectedElementId = null; this.state.inlineEditingElementId = null; this.render();
    }
    _handleColorSelection(btn) {
        const color = btn.dataset.color; const picker = btn.closest('.custom-color-picker'); if (!picker) return;
        const prop = picker.dataset.property; const wasAppliedToSelection = this._applyStyleToSelection({ [prop]: color });
        if (!wasAppliedToSelection) { const el = this.state.elements.find(e => e.id === this.state.selectedElementId); if(el) { el[prop] = color; this.renderCover(); } }
        picker.dataset.value = color; const displaySwatch = picker.querySelector('.color-swatch-display'); const nativePicker = picker.querySelector('.native-color-picker');
        if (color === 'transparent') { displaySwatch.classList.add('is-transparent-swatch'); displaySwatch.style.backgroundColor = '#fff'; nativePicker.value = '#ffffff'; } else { displaySwatch.classList.remove('is-transparent-swatch'); displaySwatch.style.backgroundColor = color; nativePicker.value = color; }
        this._renderSidebarAndPreserveAccordion();
    }
    _handleNativeColorChange(input) {
        const color = input.value; const picker = input.closest('.custom-color-picker'); if (!picker) return;
        const prop = picker.dataset.property; const wasApplied = this._applyStyleToSelection({ [prop]: color });
        if (!wasApplied) { const el = this.state.elements.find(e => e.id === this.state.selectedElementId); if(el) { el[prop] = color; this.renderCover(); } }
        picker.dataset.value = color; const displaySwatch = picker.querySelector('.color-swatch-display'); if (displaySwatch) { displaySwatch.classList.remove('is-transparent-swatch'); displaySwatch.style.backgroundColor = color; }
    }
    _confirmColorSelection(btn) {
        const picker = btn.closest('.custom-color-picker'); if (!picker) return; const { preColorPickerState, colorPickerProperty: prop } = this.interactionState;
        const newValue = picker.dataset.value; const originalValue = preColorPickerState.elements.find(el => el.id === this.state.selectedElementId)[prop];
        if (newValue !== originalValue) { const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId); const textContainer = this.dom.coverBoundary.querySelector(`[data-id="${this.state.selectedElementId}"] [data-role="text-content"]`); if (selectedEl && textContainer) { selectedEl.text = textContainer.innerHTML; } this.history.addState(preColorPickerState); this._setDirty(true); }
        this._toggleColorPopover(picker.querySelector('.color-display-btn'), true);
    }
    _cancelColorSelection(btn) { const picker = btn.closest('.custom-color-picker'); if (!picker) return; const { colorPickerOriginalValue: originalValue, colorPickerProperty: prop } = this.interactionState; this.updateSelectedElement({ [prop]: originalValue }); this._toggleColorPopover(picker.querySelector('.color-display-btn'), true); this._renderSidebarAndPreserveAccordion(); }
    _handleSidebarInput(e) {
        const { target } = e; const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
        if (target.matches('.native-color-picker')) { this._handleNativeColorChange(target); if(e.type === 'change') this.isInteractingWithNativeColorPicker = false; return; }
        if (target.dataset.property && selectedEl) {
            const prop = target.dataset.property; const richTextPropsWithManualInput = ['fontSize', 'letterSpacing', 'lineHeight'];
            if (richTextPropsWithManualInput.includes(prop)) { const typingFlag = `isTyping${prop.charAt(0).toUpperCase() + prop.slice(1)}`; if (e.type === 'input' && this.interactionState[typingFlag]) { return; } if (e.type === 'change') { this.interactionState[typingFlag] = false; } }
            const preEditState = this._getStateSnapshot(); let value = (target.type === 'number' || target.type === 'range') ? (parseFloat(target.value) || 0) : target.value;
            const styleProps = { fontSize: val => ({ fontSize: `${val}px` }), fontFamily: val => ({ fontFamily: val }), fontWeight: val => ({ fontWeight: val }), letterSpacing: val => ({ letterSpacing: `${val}px` }), lineHeight: val => ({ lineHeight: val }) };
            if (selectedEl.type === 'text' && this.state.inlineEditingElementId === selectedEl.id && styleProps[prop]) {
                const styleObject = styleProps[prop](value); const wasApplied = this._applyStyleToSelection(styleObject);
                if (wasApplied) { if (e.type === 'change') this.history.addState(preEditState); const textContainer = this.dom.coverBoundary.querySelector(`[data-id="${selectedEl.id}"] [data-role="text-content"]`); selectedEl.text = textContainer.innerHTML; this._setDirty(true); setTimeout(() => this._drawCustomSelectionOverlay(), 10); return; }
            }
            if (prop === 'fontSize' && selectedEl.type === 'text' && this.state.inlineEditingElementId !== selectedEl.id) { const oldBaseSize = selectedEl.fontSize; const newBaseSize = value; if (oldBaseSize && oldBaseSize > 0 && newBaseSize > 0) { const scale = newBaseSize / oldBaseSize; const tempDiv = document.createElement('div'); tempDiv.innerHTML = selectedEl.text; tempDiv.querySelectorAll('[style*="font-size"]').forEach(span => { const currentSize = parseFloat(span.style.fontSize); if (!isNaN(currentSize)) span.style.fontSize = `${(currentSize * scale).toFixed(2)}px`; }); selectedEl.text = tempDiv.innerHTML; } }
            if (e.type === 'change') { this.history.addState(preEditState); }
            if (prop === 'id') { const oldSelectedId = this.state.selectedElementId; const newId = String(value).trim(); if (!newId) { this.showNotification('ID של האלמנט לא יכול להיות ריק.', 'error'); target.value = oldSelectedId; return; } if (newId !== oldSelectedId && this.state.elements.some(el => el.id === newId)) { this.showNotification('ה-ID של האלמנט חייב להיות ייחודי.', 'error'); target.value = oldSelectedId; return; } selectedEl.id = newId; this.state.selectedElementId = newId; this._setDirty(true); this.renderCover(); return; }
            this.updateSelectedElement({ [prop]: value }); if (prop === 'multiLine') { this.renderCover(); }
        }
    }
    _applyStyleToSelection(style) {
        const selection = window.getSelection(); let range; const editorEl = this.dom.coverBoundary.querySelector(`[data-id="${this.state.inlineEditingElementId}"] [data-role="text-content"]`); if (!editorEl) return false;
        const hasSelection = this.savedRange || (selection.rangeCount > 0 && !selection.isCollapsed); this.isApplyingStyle = true;
        try {
            if (hasSelection) {
                range = this.savedRange ? this.savedRange : selection.getRangeAt(0); if (!editorEl.contains(range.commonAncestorContainer)) { this.savedRange = null; return false; }
                selection.removeAllRanges(); selection.addRange(range);
                const contents = range.cloneContents(); const meaningfulNodes = Array.from(contents.childNodes).filter(n => !(n.nodeType === Node.TEXT_NODE && n.textContent.trim() === ''));
                if (meaningfulNodes.length === 1 && meaningfulNodes[0].nodeType === Node.ELEMENT_NODE && meaningfulNodes[0].tagName === 'SPAN') { const extractedSpan = range.extractContents().firstChild; Object.assign(extractedSpan.style, style); range.insertNode(extractedSpan); range.selectNodeContents(extractedSpan); } 
                else { const span = document.createElement('span'); Object.assign(span.style, style); const extractedContents = range.extractContents(); extractedContents.querySelectorAll('span').forEach(innerSpan => Object.assign(innerSpan.style, style)); span.appendChild(extractedContents); range.insertNode(span); range.selectNodeContents(span); }
                selection.removeAllRanges(); selection.addRange(range); this.savedRange = range.cloneRange();
            } else {
                Array.from(editorEl.childNodes).forEach(node => { if (node.nodeType === Node.TEXT_NODE) { const span = document.createElement('span'); Object.assign(span.style, style); span.textContent = node.textContent; editorEl.replaceChild(span, node); } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SPAN') { Object.assign(node.style, style); } });
                this.savedRange = null;
            }
            return true;
        } catch(e) { console.error("Could not apply style:", e); return false; } finally { this.isApplyingStyle = false; }
    }
    _handleSidebarClick(e) {
        const { target } = e; const colorDisplayBtn = target.closest('.color-display-btn'); if (colorDisplayBtn) { this._toggleColorPopover(colorDisplayBtn); return; }
        const swatchBtn = target.closest('.color-swatch-btn'); if (swatchBtn) { this._handleColorSelection(swatchBtn); return; }
        const actionTarget = target.closest('[data-action]'); if (!actionTarget) return; const action = actionTarget.dataset.action;
        if (action === 'toggle-layer-menu') { const openPanel = this.dom.sidebarContent.querySelector('.accordion-panel.open'); if (openPanel) { const toggleBtn = openPanel.previousElementSibling; if (toggleBtn && toggleBtn.matches('.accordion-toggle')) { toggleAccordionPanel(toggleBtn); } } this._toggleLayerMenu(); return; }
        if (action === 'toggle-font-size-dropdown') { this._toggleFontSizeDropdown(actionTarget); return; } if (action === 'select-font-size') { this._handleFontSizeSelection(actionTarget); return; }
        if (action === 'confirm-color') { this._confirmColorSelection(actionTarget); return; } if (action === 'cancel-color') { this._cancelColorSelection(actionTarget); return; }
        const recordableActions = ['bring-to-front', 'send-to-back', 'layer-up', 'layer-down', 'align-text', 'align-vertical-text', 'toggle-property'];
        const preEditState = this._getStateSnapshot(); let recordHistory = true; if (recordableActions.includes(action) || action.startsWith('add-element') || action === 'delete' || action === 'perform-clip') { this.history.addState(preEditState); recordHistory = false; }
        const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
        const actions = {
            'deselect-element': () => this._deselectAndCleanup(), 'add-element': () => this._addElement(actionTarget.dataset.type), 'delete': () => this._renderDeleteConfirmation(), 'confirm-delete': () => this._deleteSelectedElement(), 'cancel-delete': () => this._renderSidebarAndPreserveAccordion(), 'add-image': () => this.dom.elementImageUploadInput.click(), 'edit-image': () => this._editImageHandler(selectedEl), 'bring-to-front': () => this._reorderElement('front'), 'send-to-back': () => this._reorderElement('back'), 'layer-up': () => this._reorderElement('up'), 'layer-down': () => this._reorderElement('down'), 'perform-clip': () => this._performClip(),
            'align-text': () => {
                const align = actionTarget.dataset.align; if (!selectedEl) return; selectedEl.textAlign = align; this._setDirty(true);
                if (this.state.inlineEditingElementId === selectedEl.id) { const textWrapper = this.dom.coverBoundary.querySelector(`[data-id="${selectedEl.id}"] [data-role="text-content"]`); if (textWrapper) { textWrapper.style.textAlign = align; setTimeout(() => { if (this.state.inlineEditingElementId === selectedEl.id) { this._drawCustomSelectionOverlay(); } }, 10); } } else { this.renderCover(); }
            },
            'align-vertical-text': () => {
                const align = actionTarget.dataset.align; if (!selectedEl) return; selectedEl.verticalAlign = align; this._setDirty(true);
                if (this.state.inlineEditingElementId === selectedEl.id) { const draggableEl = this.dom.coverBoundary.querySelector(`[data-id="${selectedEl.id}"]`); if (draggableEl && draggableEl.firstChild) { const backgroundElement = draggableEl.firstChild; const verticalAlignMap = { start: 'flex-start', center: 'center', end: 'flex-end' }; backgroundElement.style.justifyContent = verticalAlignMap[align] || 'center'; setTimeout(() => { if (this.state.inlineEditingElementId === selectedEl.id) { this._drawCustomSelectionOverlay(); } }, 10); } } else { this.renderCover(); }
            },
            'toggle-property': () => {
                const prop = actionTarget.dataset.property; if (!selectedEl) return;
                if (prop === 'shadow' && selectedEl.type === 'text') { if (this.state.inlineEditingElementId === selectedEl.id) { const selection = window.getSelection(); const range = (selection && selection.rangeCount > 0) ? selection.getRangeAt(0) : this.savedRange; const editorEl = this.dom.coverBoundary.querySelector(`[data-id="${this.state.inlineEditingElementId}"] [data-role="text-content"]`); if (range && editorEl) { let commonAncestor = range.commonAncestorContainer; if (commonAncestor.nodeType === Node.TEXT_NODE) { commonAncestor = commonAncestor.parentElement; } if (editorEl.contains(commonAncestor)) { const styles = window.getComputedStyle(commonAncestor); const hasShadow = styles.textShadow && styles.textShadow !== 'none'; const wasApplied = this._applyStyleToSelection({ textShadow: hasShadow ? 'none' : '2px 2px 4px rgba(0,0,0,0.7)' }); if (wasApplied) { const textContainer = this.dom.coverBoundary.querySelector(`[data-id="${this.state.selectedElementId}"] [data-role="text-content"]`); selectedEl.text = this._cleanupTextHtml(textContainer.innerHTML); this._setDirty(true); return; } } } } this.updateSelectedElement({ [prop]: !selectedEl[prop] }); }
                else { this.updateSelectedElement({ [prop]: !selectedEl[prop] }); }
            },
        };
        if (actions[action]) { if (recordHistory) this.history.addState(preEditState); actions[action](); if (action.startsWith('layer-') || action === 'bring-to-front' || action === 'send-to-back') { this._toggleLayerMenu(false); } }
        const manualRenderActions = ['deselect-element', 'add-element', 'delete', 'confirm-delete', 'cancel-delete', 'perform-clip']; if (!manualRenderActions.includes(action)) { this._renderSidebarAndPreserveAccordion(); }
    }
    _handleTemplateModalClick(e) { /* Now handled by AppManager */ }
    _editImageHandler(el) { const source = el.originalSrc || el.src; if (!source) return; const img = new Image(); img.onload = () => { this.imageEditor.open(source, img, el, null); }; img.onerror = () => { this.showNotification('לא ניתן לטעון את התמונה לעריכה.', 'error'); }; if (!source.startsWith('data:')) { img.crossOrigin = "Anonymous"; } img.src = source; }
    _reorderElement(direction) {
        const { elements, selectedElementId } = this.state; const index = elements.findIndex(el => el.id === selectedElementId); if (index === -1) return;
        const [element] = elements.splice(index, 1); const newIndex = { 'front': elements.length, 'back': 0, 'up': Math.min(elements.length, index + 1), 'down': Math.max(0, index - 1), }[direction];
        elements.splice(newIndex, 0, element); this._setDirty(true); this.renderCover();
    }
    _startInlineEditing(elementData, draggableEl, clickEvent) {
        if (this.state.inlineEditingElementId === elementData.id) return;
        if (!elementData.multiLine && (typeof elementData.width === 'undefined' || typeof elementData.height === 'undefined')) { elementData.width = draggableEl.offsetWidth; elementData.height = draggableEl.offsetHeight; this._setDirty(true); }
        this.state.inlineEditingElementId = elementData.id; this.renderCover();
        const textContainer = this.dom.coverBoundary.querySelector(`[data-id="${elementData.id}"] [data-role="text-content"]`); if (!textContainer) return;
        textContainer.contentEditable = true; textContainer.focus();
        const selection = window.getSelection(); if (selection) { let range; if (document.caretPositionFromPoint) { const pos = document.caretPositionFromPoint(clickEvent.clientX, clickEvent.clientY); if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); } } else if (document.caretRangeFromPoint) { range = document.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY); if (range) { selection.removeAllRanges(); selection.addRange(range); } } }
        const preEditState = this._getStateSnapshot(); const originalText = textContainer.innerHTML;
        const onKeyDown = (e) => { if (e.key === 'Enter' && !elementData.multiLine) { e.preventDefault(); textContainer.blur(); } };
        const onEditEnd = () => { textContainer.removeEventListener('focusout', onFocusOut); textContainer.removeEventListener('keydown', onKeyDown); textContainer.contentEditable = false; const newText = this._cleanupTextHtml(textContainer.innerHTML || ''); if (originalText !== newText) { this.history.addState(preEditState); const elementToUpdate = this.state.elements.find(el => el.id === elementData.id); if(elementToUpdate) { elementToUpdate.text = newText; this._setDirty(true); this.renderCover(); } } this.state.inlineEditingElementId = null; this._clearCustomSelection(); };
        const onFocusOut = (e) => { if (this.dom.sidebar.contains(e.relatedTarget)) { const selection = window.getSelection(); if (selection && selection.rangeCount > 0) { this.savedRange = selection.getRangeAt(0).cloneRange(); } } else { onEditEnd(); } };
        textContainer.addEventListener('focusout', onFocusOut); textContainer.addEventListener('keydown', onKeyDown);
    }
    _rgbToHex(rgb) {
        if (!rgb || !rgb.startsWith('rgb')) return '#000000'; const result = rgb.match(/\d+/g); if (!result || result.length < 3) return '#000000';
        const r = parseInt(result[0], 10); const g = parseInt(result[1], 10); const b = parseInt(result[2], 10);
        const toHex = (c) => ('0' + c.toString(16)).slice(-2); return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
    _getEditorElements() { if (!this.state.inlineEditingElementId) return { }; const draggableEl = this.dom.coverBoundary.querySelector(`.draggable[data-id="${this.state.inlineEditingElementId}"]`); if (!draggableEl) return { }; return { draggableEl, contentEl: draggableEl.querySelector('[data-role="text-content"]'), overlayContainerEl: draggableEl.querySelector('[data-role="selection-overlays"]') }; }
    _clearCustomSelection() { if (this.savedRange) this.savedRange = null; const { draggableEl } = this._getEditorElements(); if (draggableEl) { draggableEl.classList.remove('has-custom-selection'); } this.dom.coverBoundary.querySelectorAll('.selection-overlay').forEach(el => el.remove()); }
    _drawCustomSelectionOverlay() {
        const { draggableEl, contentEl } = this._getEditorElements(); const selection = window.getSelection(); this._clearCustomSelection();
        if (!selection || selection.rangeCount === 0 || !draggableEl || !contentEl) { if (selection && selection.rangeCount > 0) this.savedRange = selection.getRangeAt(0).cloneRange(); return; }
        const elementData = this.state.elements.find(el => el.id === this.state.selectedElementId); if (!elementData) return;
        const range = selection.getRangeAt(0); if (range.collapsed) { this.savedRange = range.cloneRange(); return; }
        this.savedRange = range.cloneRange(); draggableEl.classList.add('has-custom-selection'); const coverBoundaryRect = this.dom.coverBoundary.getBoundingClientRect(); const rects = range.getClientRects();
        let fontSize = 16; if (range.startContainer) { const container = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer; if (container && container instanceof HTMLElement) { fontSize = parseFloat(window.getComputedStyle(container).fontSize); } }
        for (const rect of rects) { const overlay = document.createElement('div'); overlay.className = 'selection-overlay'; const overlayHeight = fontSize; const topOffset = (rect.height - overlayHeight) / 2; overlay.style.left = `${rect.left - coverBoundaryRect.left}px`; overlay.style.top = `${rect.top - coverBoundaryRect.top + topOffset}px`; overlay.style.width = `${rect.width}px`; overlay.style.height = `${overlayHeight}px`; overlay.style.transform = `rotate(${elementData.rotation}deg)`; this.dom.coverBoundary.appendChild(overlay); }
    }
    _updateSidebarWithSelectionStyles() {
        const selection = window.getSelection(); if (!this.state.inlineEditingElementId || !selection || selection.rangeCount === 0) return; const range = selection.getRangeAt(0); let element = range.startContainer;
        if (element.nodeType === Node.TEXT_NODE) { element = element.parentElement; } const contentEl = this._getEditorElements().contentEl; if (!contentEl || (!contentEl.contains(element) && element !== contentEl)) { return; }
        const styles = window.getComputedStyle(element); const sidebar = this.dom.sidebarContent; if (!sidebar) return;
        if (sidebar.querySelector('[data-property="fontFamily"]')) { const fontName = styles.fontFamily.split(',')[0].replace(/['"]/g, '').trim(); sidebar.querySelector('[data-property="fontFamily"]').value = fontName; }
        if (sidebar.querySelector('[data-property="fontSize"]')) { sidebar.querySelector('[data-property="fontSize"]').value = parseInt(styles.fontSize, 10); }
        if (sidebar.querySelector('[data-property="fontWeight"]')) { sidebar.querySelector('[data-property="fontWeight"]').value = styles.fontWeight; }
        if (sidebar.querySelector('[data-property="letterSpacing"]')) { sidebar.querySelector('[data-property="letterSpacing"]').value = parseFloat(styles.letterSpacing) || 0; }
        if (sidebar.querySelector('[data-property="lineHeight"]')) { const lineHeight = styles.lineHeight; if (lineHeight === 'normal') { const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId); sidebar.querySelector('[data-property="lineHeight"]').value = selectedEl.lineHeight || 1.2; } else if (lineHeight.endsWith('px')) { const fontSizePx = parseFloat(styles.fontSize); const lineHeightPx = parseFloat(lineHeight); if (fontSizePx > 0) { sidebar.querySelector('[data-property="lineHeight"]').value = (lineHeightPx / fontSizePx).toFixed(2); } } else { sidebar.querySelector('[data-property="lineHeight"]').value = parseFloat(lineHeight) || 1.2; } }
        const colorPicker = sidebar.querySelector('[data-property="color"]'); if (colorPicker) { const hexColor = this._rgbToHex(styles.color); colorPicker.dataset.value = hexColor; colorPicker.querySelector('.color-swatch-display').style.backgroundColor = hexColor; colorPicker.querySelector('.native-color-picker').value = hexColor; }
        const shadowToggle = sidebar.querySelector('[data-action="toggle-property"][data-property="shadow"]'); if (shadowToggle) { const hasShadow = styles.textShadow && styles.textShadow !== 'none'; shadowToggle.classList.toggle('active', hasShadow); shadowToggle.setAttribute('aria-pressed', String(hasShadow)); }
    }
    _handleSelectionChange() {
        if (this.isApplyingStyle) return; const selection = window.getSelection(); if (!this.state.inlineEditingElementId) { this._clearCustomSelection(); return; }
        const editorEl = this.dom.coverBoundary.querySelector(`[data-id="${this.state.inlineEditingElementId}"] [data-role="text-content"]`);
        const isSelectionInEditor = editorEl && selection.rangeCount > 0 && selection.anchorNode && editorEl.contains(selection.anchorNode);
        if (isSelectionInEditor) { if (!selection.isCollapsed) { this._drawCustomSelectionOverlay(); } else { this._clearCustomSelection(); } this._updateSidebarWithSelectionStyles(); } 
        else { if (this.dom.sidebar.contains(document.activeElement)) { return; } this._clearCustomSelection(); this.updateSidebarValues(); }
    }
    _cssTextToObject(cssText) { const obj = {}; if (!cssText) return obj; cssText.split(';').forEach(declaration => { if (declaration.trim()) { const [property, value] = declaration.split(':', 2); if (property && value) { obj[property.trim()] = value.trim(); } } }); return obj; }
    _objectToCssText(obj) { return Object.entries(obj).map(([property, value]) => `${property}: ${value}`).join('; '); }
    _cleanupTextHtml(html) {
        if (!html) return ''; const tempDiv = document.createElement('div'); tempDiv.innerHTML = html; let changesMade; let passes = 0; const MAX_PASSES = 10;
        do { changesMade = false;
            tempDiv.querySelectorAll('span[style]').forEach(outerSpan => { const childNodes = Array.from(outerSpan.childNodes).filter(n => !(n.nodeType === Node.TEXT_NODE && !n.textContent.trim())); if (childNodes.length === 1 && childNodes[0].nodeName === 'SPAN' && childNodes[0].hasAttribute('style')) { const innerSpan = childNodes[0]; const outerStyles = this._cssTextToObject(outerSpan.style.cssText); const innerStyles = this._cssTextToObject(innerSpan.style.cssText); const newStyles = { ...outerStyles, ...innerStyles }; outerSpan.style.cssText = this._objectToCssText(newStyles); while (innerSpan.firstChild) { outerSpan.appendChild(innerSpan.firstChild); } outerSpan.removeChild(innerSpan); changesMade = true; } });
            let currentNode = tempDiv.firstChild; while (currentNode && currentNode.nextSibling) { const nextNode = currentNode.nextSibling; if (currentNode.nodeType === Node.ELEMENT_NODE && currentNode.nodeName === 'SPAN' && nextNode.nodeType === Node.ELEMENT_NODE && nextNode.nodeName === 'SPAN' && currentNode.style.cssText === nextNode.style.cssText) { while (nextNode.firstChild) { currentNode.appendChild(nextNode.firstChild); } tempDiv.removeChild(nextNode); changesMade = true; } else { currentNode = nextNode; } }
            tempDiv.querySelectorAll('span:empty').forEach(el => { el.remove(); changesMade = true; }); tempDiv.normalize(); passes++;
        } while (changesMade && passes < MAX_PASSES);
        return tempDiv.innerHTML;
    }
    _addElement(type) {
        this._clearCustomSelection(); const newEl = type === 'text' ? { id: `el_${Date.now()}`, type: 'text', text: 'טקסט חדש', position: { x: 50, y: 100 }, fontSize: 48, color: '#FFFFFF', fontWeight: 700, fontFamily: 'Heebo', shadow: false, bgColor: 'transparent', bgColorOpacity: 1, rotation: 0, shape: 'rectangle', textAlign: 'center', verticalAlign: 'center', multiLine: false, width: 300, height: 80, letterSpacing: 0, lineHeight: 1.2 } : type === 'image' ? { id: `el_${Date.now()}`, type: 'image', src: null, originalSrc: null, cropData: null, position: { x: 50, y: 100 }, width: 200, height: 150, rotation: 0 } : { id: `el_${Date.now()}`, type: 'clipping-shape', shape: 'ellipse', position: { x: 100, y: 150 }, width: 250, height: 250, rotation: 0 };
        this.state.elements.push(newEl); this.state.selectedElementId = newEl.id; this._setDirty(true); this.render();
    }
    _renderDeleteConfirmation() {
        this._clearCustomSelection(); this.dom.sidebarContent.innerHTML = ''; const container = document.createElement('div'); container.className = 'p-4 bg-slate-900 rounded-lg text-center border border-red-500/50';
        container.innerHTML = `<h3 class="text-lg font-bold text-white mb-2">אישור מחיקה</h3><p class="text-slate-400 mb-6">האם אתה בטוח שברצונך למחוק את האלמנט הזה לצמיתות?</p><div class="flex gap-3 justify-center"><button data-action="cancel-delete" class="sidebar-btn bg-slate-600 hover:bg-slate-500 flex-1">ביטול</button><button data-action="confirm-delete" class="sidebar-btn bg-red-600 hover:bg-red-700 flex-1">מחק לצמיתות</button></div>`;
        this.dom.sidebarContent.appendChild(container);
    }
    _deleteSelectedElement() { this._clearCustomSelection(); this.state.elements = this.state.elements.filter(el => el.id !== this.state.selectedElementId); this.state.selectedElementId = null; this._setDirty(true); this.render(); }
    selectElement(elementId, oldElementId) {
        const oldElementData = this.state.elements.find(el => el.id === oldElementId); const newElementData = this.state.elements.find(el => el.id === elementId);
        if (oldElementData && oldElementData.type === 'clipping-shape') { this.history.addState(this._getStateSnapshot()); this.state.elements = this.state.elements.filter(el => el.id !== oldElementId); }
        this.state.selectedElementId = elementId; if (this.state.inlineEditingElementId && this.state.inlineEditingElementId !== elementId) { this.state.inlineEditingElementId = null; this._clearCustomSelection(); }
        if (oldElementData && newElementData && oldElementData.type === newElementData.type) { this.renderCover(); this.updateSidebarValues(); } else { this.render(); }
    }
    updateSidebarValues() {
        const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId); if (!selectedEl) return; const header = this.dom.sidebarEditorHeader; const content = this.dom.sidebarContent;
        const typeNameMap = { 'text': 'טקסט', 'image': 'תמונה', 'clipping-shape': 'צורת חיתוך' }; const typeName = typeNameMap[selectedEl.type] || 'אלמנט'; header.querySelector('h3').textContent = `עריכת ${typeName}`;
        const idInput = header.querySelector('[data-property="id"]'); if (idInput) { idInput.value = selectedEl.id; }
        content.querySelectorAll('[data-property]').forEach(input => {
            const prop = input.dataset.property; if (selectedEl[prop] === undefined) return; const value = selectedEl[prop];
            if (input.type === 'checkbox') { input.checked = !!value; } else if (input.matches('select')) { input.value = value; } 
            else if (input.closest('.custom-color-picker')) { const picker = input.closest('.custom-color-picker'); picker.dataset.value = value; const swatch = picker.querySelector('.color-swatch-display'); const nativePicker = picker.querySelector('.native-color-picker'); const isTransparent = value === 'transparent'; swatch.classList.toggle('is-transparent-swatch', isTransparent); swatch.style.backgroundColor = isTransparent ? '#fff' : value; nativePicker.value = isTransparent ? '#ffffff' : value; } 
            else if (input.type === 'number' || input.type === 'range') { input.value = typeof value === 'number' ? Math.round(value * 10) / 10 : value; } else { input.value = value; }
        });
        content.querySelectorAll('[data-action="toggle-property"]').forEach(btn => { const prop = btn.dataset.property; if (selectedEl[prop] !== undefined) { const isActive = !!selectedEl[prop]; btn.classList.toggle('active', isActive); btn.setAttribute('aria-pressed', String(isActive)); } });
        if (selectedEl.type === 'text') { content.querySelectorAll('[data-action="align-text"]').forEach(btn => { btn.classList.toggle('active', selectedEl.textAlign === btn.dataset.align); }); content.querySelectorAll('[data-action="align-vertical-text"]').forEach(btn => { btn.classList.toggle('active', selectedEl.verticalAlign === btn.dataset.align); }); const opacityControl = content.querySelector('[data-property="bgColorOpacity"]')?.closest('div'); if (opacityControl) { opacityControl.style.display = (selectedEl.bgColor && selectedEl.bgColor !== 'transparent') ? 'flex' : 'none'; } }
    }
    async _performClip() {
        const clipEl = this.state.elements.find(el => el.id === this.state.selectedElementId); if (!clipEl) return;
        const targetEl = [...this.state.elements].reverse().find(el => { if ((el.type !== 'image' && el.type !== 'text') || el.id === clipEl.id) return false; if (el.type === 'image' && !el.src) return false; const clipRect = { x: clipEl.position.x, y: clipEl.position.y, width: clipEl.width, height: clipEl.height }; const elRect = { x: el.position.x, y: el.position.y, width: el.width, height: el.height }; return (clipRect.x < elRect.x + elRect.width && clipRect.x + clipRect.width > elRect.x && clipRect.y < elRect.y + elRect.height && clipRect.y + clipRect.height > elRect.y); });
        if (!targetEl) { this.showNotification('יש למקם את צורת החיתוך מעל אלמנט של תמונה או טקסט.', 'error'); return; }
        const preClipState = this._getStateSnapshot(); let imageToProcessSrc; let elementToClip = targetEl;
        if (targetEl.type === 'text') {
            const textDomEl = this.dom.coverBoundary.querySelector(`[data-id="${targetEl.id}"]`); const textContentContainer = textDomEl.querySelector('[data-role="text-container"]'); if (!textContentContainer) { this.showNotification('שגיאה: לא נמצא תוכן הטקסט לעיבוד.', 'error'); return; }
            const currentCoverWidth = this.dom.coverBoundary.offsetWidth; const scale = (this.state.coverWidth > 0 && currentCoverWidth > 0) ? currentCoverWidth / this.state.coverWidth : 1; const modelWidth = textDomEl.offsetWidth / scale; const modelHeight = textDomEl.offsetHeight / scale;
            try {
                const wasSelected = textDomEl.classList.contains('selected'); if(wasSelected) textDomEl.classList.remove('selected');
                const originalFontCSS = await fetch(getGoogleFontsUrl()).then(res => res.text()); const embeddedFontCSS = await embedFontsInCss(originalFontCSS); const options = { pixelRatio: 2, fontEmbedCSS: embeddedFontCSS, backgroundColor: 'transparent', };
                const canvas = await htmlToImage.toCanvas(textContentContainer, options); const dataUrl = canvas.toDataURL('image/png', 1.0); if(wasSelected) textDomEl.classList.add('selected');
                const targetElIndex = this.state.elements.findIndex(e => e.id === targetEl.id); if (targetElIndex === -1) return;
                const newImageEl = { id: targetEl.id, type: 'image', src: dataUrl, originalSrc: dataUrl, position: { ...targetEl.position }, width: modelWidth, height: modelHeight, rotation: targetEl.rotation, cropData: null, };
                this.state.elements.splice(targetElIndex, 1, newImageEl); elementToClip = newImageEl; imageToProcessSrc = dataUrl;
            } catch (error) { console.error("Failed to convert text to image:", error); this.showNotification('שגיאה בהמרת טקסט לתמונה.', 'error'); return; }
        } else { imageToProcessSrc = targetEl.src; }
        const img = new Image(); img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; const ctx = canvas.getContext('2d');
            const scaleX = img.naturalWidth / elementToClip.width; const scaleY = img.naturalHeight / elementToClip.height;
            const clipRelativeX = (clipEl.position.x - elementToClip.position.x) * scaleX; const clipRelativeY = (clipEl.position.y - elementToClip.position.y) * scaleY; const clipRelativeWidth = clipEl.width * scaleX; const clipRelativeHeight = clipEl.height * scaleY;
            ctx.drawImage(img, 0, 0); ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath(); if (clipEl.shape === 'ellipse') { ctx.ellipse(clipRelativeX + clipRelativeWidth / 2, clipRelativeY + clipRelativeHeight / 2, clipRelativeWidth / 2, clipRelativeHeight / 2, 0, 0, 2 * Math.PI); }
            ctx.closePath(); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
            const clippedDataUrl = canvas.toDataURL('image/png'); const imageToUpdate = this.state.elements.find(e => e.id === elementToClip.id); if (imageToUpdate) { imageToUpdate.src = clippedDataUrl; imageToUpdate.cropData = null; }
            this.state.elements = this.state.elements.filter(el => el.id !== clipEl.id); this.state.selectedElementId = elementToClip.id; this.history.addState(preClipState); this._setDirty(true); this.render();
        };
        img.src = imageToProcessSrc;
    }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    new AppManager();
});
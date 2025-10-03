
import { renderCoverElement, renderSidebar } from './js/renderers.js';
import { ImageEditor } from './js/ImageEditor.js';
import { exportTemplate, exportImage } from './js/services.js';
import { loadGoogleFonts, injectFontStyles } from './js/fonts.js';
import { InteractionManager } from './js/managers/InteractionManager.js';
import { HistoryManager } from './js/managers/HistoryManager.js';
import { TemplateManager } from './js/managers/TemplateManager.js';


/**
 * @file index.js
 * Main script for the Magazine Cover Editor.
 *
 * Structure:
 * 1. MagazineEditor: The main application class that orchestrates all modules.
 */

// --- SUPABASE SETUP ---
// יש להחליף את הערכים האלה בערכים מהפרויקט שלך ב-Supabase
const SUPABASE_URL = 'https://klicewxazipstfdlfwbb.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsaWNld3hhemlwc3RmZGxmd2JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNTY1NDgsImV4cCI6MjA3NDkzMjU0OH0.XJbN59NCq7KPUQu3MpCmXMg1T2RchPhNhio5NKwlnjY';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// --- UTILITY FUNCTIONS ---

/**
 * Handles the logic for a single-open accordion behavior within a container.
 * @param {HTMLElement} toggleBtn The button element that was clicked.
 */
function toggleAccordionPanel(toggleBtn) {
    const panelId = toggleBtn.getAttribute('aria-controls');
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const container = toggleBtn.closest('.accordion-group')?.parentElement;
    if (!container) return; // Required for closing others

    const isCurrentlyOpen = panel.classList.contains('open');

    // First, close all panels in the container
    container.querySelectorAll('.accordion-toggle').forEach(btn => {
        const p = document.getElementById(btn.getAttribute('aria-controls'));
        if (p && p.classList.contains('open')) {
            p.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
            btn.querySelector('.accordion-chevron')?.classList.remove('rotate-180');
        }
    });

    // Then, if the clicked one was not already open, open it.
    if (!isCurrentlyOpen) {
        panel.classList.add('open');
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.querySelector('.accordion-chevron')?.classList.add('rotate-180');
    }
}


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
        this.user = null;
        this.authViewState = 'default'; // 'default', 'email_login'
        this.interactionState = {}; // For drag/resize/rotate/color-picking
        this.interactionState.isTypingFontSize = false;
        this.interactionState.isTypingLetterSpacing = false;
        this.interactionState.isTypingLineHeight = false;
        this.isLayerMenuOpen = false;
        this.savedRange = null; // To preserve text selection
        this.isApplyingStyle = false; // Flag to prevent selection events during style application

        // History management
        this.historyRecordingSuspended = false;
        this.isInteractingWithNativeColorPicker = false;
        

        this._init();
    }

    _cacheDom() {
        this.dom = {
            mainEditorContainer: document.getElementById('main-editor-container'),
            magazineCover: document.getElementById('magazine-cover'),
            coverBoundary: document.getElementById('cover-boundary'),
            sidebar: document.getElementById('sidebar'),
            authContainer: document.getElementById('auth-container'),
            sidebarEditorHeader: document.getElementById('sidebar-editor-header'),
            sidebarContent: document.getElementById('sidebar-content'),
            templateActions: document.getElementById('template-actions'),
            elementImageUploadInput: document.getElementById('element-image-upload'),
            changeTemplateBtn: document.getElementById('change-template-btn'),
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
            const baseDefaults = {
                rotation: 0,
            };
    
            if (el.type === 'text') {
                const textDefaults = {
                    ...baseDefaults,
                    shadow: false,
                    bgColor: 'transparent',
                    bgColorOpacity: 1,
                    shape: 'rectangle',
                    textAlign: 'center',
                    verticalAlign: 'center',
                    multiLine: false,
                    letterSpacing: 0,
                    lineHeight: 1.2,
                };
                return { ...textDefaults, ...el };
            }
            
            if (el.type === 'image') {
                const imageDefaults = {
                    ...baseDefaults,
                    originalSrc: null,
                    cropData: null,
                };
                return { ...imageDefaults, ...el };
            }
    
            if (el.type === 'clipping-shape') {
                const clipDefaults = {
                    ...baseDefaults,
                    shape: 'ellipse'
                };
                return { ...clipDefaults, ...el };
            }
    
            return { ...baseDefaults, ...el };
        });
    }

    _isValidTemplate(templateData) {
        return (
            templateData &&
            typeof templateData.name === 'string' &&
            Array.isArray(templateData.elements) &&
            typeof templateData.backgroundColor === 'string' &&
            typeof templateData.width === 'number' &&
            typeof templateData.height === 'number'
        );
    }

    async _init() {
        this._cacheDom();
        this.history = new HistoryManager(this);
        this.imageEditor = new ImageEditor(this);
        this.interactionManager = new InteractionManager(this);
        this.templateManager = new TemplateManager(this, supabaseClient);
        loadGoogleFonts();
        injectFontStyles();
        
        this._displayVersion();
        this._initAuth();

        this.resizeObserver = new ResizeObserver(() => {
            this.renderCover();
        });
        this.resizeObserver.observe(this.dom.coverBoundary);

        this._bindEvents();
        
        // Initial load is now handled by the auth state change listener
    }

    _initAuth() {
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            this.user = session?.user || null;
            this._renderAuthState();
            
            // Reload templates whenever auth state changes
            await this.templateManager._loadAllTemplates();
            if (this.templateManager.templates.length > 0) {
                 // Don't override user's work on login/logout, just refresh list
                if (event === 'INITIAL_SESSION') {
                   this.templateManager.loadTemplate(0);
                }
            } else {
                 this.dom.coverBoundary.innerHTML = '<p class="p-4 text-center text-slate-400">לא נטענו תבניות.</p>';
            }
        });
    }
    
    _renderAuthState() {
        this.dom.authContainer.innerHTML = '';
    
        if (this.user) {
            const userInfo = document.createElement('div');
            userInfo.className = 'auth-user-info';
            // Use UI Avatars as a fallback for email users
            const avatarUrl = this.user.user_metadata.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(this.user.email)}&background=random&color=fff`;
            userInfo.innerHTML = `
                <div class="user-details">
                    <img src="${avatarUrl}" alt="User Avatar" class="user-avatar">
                    <span class="user-email">${this.user.email}</span>
                </div>
                <button data-auth-action="logout" class="sidebar-btn-icon bg-slate-600 hover:bg-slate-500" title="יציאה">
                     <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 13v-2H7v-2h9V5l4 3.5-4 3.5zM20 3h-9c-1.103 0-2 .897-2 2v4h2V5h9v14h-9v-4H9v4c0 1.103.897 2 2 2h9c1.103 0 2-.897 2-2V5c0-1.103-.897-2-2-2z"/></svg>
                </button>
            `;
            this.dom.authContainer.appendChild(userInfo);
            this.dom.saveTemplateBtn.disabled = false;
            // Reset auth view state for when user logs out
            this.authViewState = 'default';
        } else {
            // Logged-out views
            if (this.authViewState === 'email_login') {
                this._renderEmailLoginView();
            } else {
                this._renderDefaultAuthView();
            }
            this.dom.saveTemplateBtn.disabled = true;
        }
    }

    _renderDefaultAuthView() {
        this.dom.authContainer.innerHTML = `
            <button data-auth-action="login_google" class="sidebar-btn bg-indigo-600 hover:bg-indigo-700 w-full flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A8 8 0 0 1 24 36c-4.418 0-8-3.582-8-8h-8c0 6.627 5.373 12 12 12z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C43.021 36.258 48 30.656 48 24c0-1.341-.138-2.65-.389-3.917z"/></svg>
                <span>המשך עם גוגל</span>
            </button>
            <div class="text-center mt-2">
                <a href="#" data-auth-action="show_email_login" class="text-sm text-slate-400 hover:text-white">התחברות עם אימייל וסיסמה</a>
            </div>
        `;
    }

    _renderEmailLoginView() {
        this.dom.authContainer.innerHTML = `
            <form id="auth-email-form" class="space-y-3">
                <div>
                    <label for="email" class="block text-sm font-medium text-slate-300 mb-1">אימייל</label>
                    <input type="email" name="email" autocomplete="email" required class="w-full bg-slate-700 border border-slate-600 text-white rounded-md p-2" style="text-align: left; direction: ltr;">
                </div>
                <div>
                    <label for="password" class="block text-sm font-medium text-slate-300 mb-1">סיסמה</label>
                    <input type="password" name="password" autocomplete="current-password" required class="w-full bg-slate-700 border border-slate-600 text-white rounded-md p-2" style="text-align: left; direction: ltr;">
                </div>
                <div class="pt-2">
                    <button type="button" data-auth-action="login_email" class="sidebar-btn bg-blue-600 hover:bg-blue-700 w-full">התחברות</button>
                </div>
            </form>
            <div class="text-center mt-4 border-t border-slate-700 pt-4">
                <a href="#" data-auth-action="show_default_auth" class="text-sm text-slate-400 hover:text-white">חזרה</a>
            </div>
        `;
    }
    
    _bindEvents() {
        this.dom.elementImageUploadInput.addEventListener('change', this._handleElementImageUpload.bind(this));
        this.dom.changeTemplateBtn.addEventListener('click', this.templateManager._openTemplateModal.bind(this.templateManager));
        this.dom.importTemplateBtn.addEventListener('click', () => this.dom.importTemplateInput.click());
        this.dom.importTemplateInput.addEventListener('change', this.templateManager._handleTemplateImport.bind(this.templateManager));
        this.dom.modalCloseBtn.addEventListener('click', this.templateManager._closeTemplateModal.bind(this.templateManager));
        this.dom.templateModalOverlay.addEventListener('click', this.templateManager._closeTemplateModal.bind(this.templateManager));
        this.dom.templateGrid.addEventListener('click', this.templateManager._handleTemplateSelection.bind(this.templateManager));

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
        this.dom.exportImageBtn.addEventListener('click', () => exportImage(this.dom.exportImageBtn, this.dom.coverBoundary, this.state));
        
        this.dom.authContainer.addEventListener('click', this._handleAuthAction.bind(this));
        this.dom.sidebar.addEventListener('input', this._handleSidebarInput.bind(this));
        this.dom.sidebar.addEventListener('change', this._handleSidebarInput.bind(this));
        this.dom.sidebar.addEventListener('click', this._handleSidebarClick.bind(this));
        this.dom.sidebar.addEventListener('mousedown', this._handleSidebarMouseDown.bind(this));
        this.dom.sidebar.addEventListener('keydown', this._handleSidebarKeyDown.bind(this));
        
        // Add generic accordion handler for both sidebars
        [this.dom.sidebar, this.imageEditor.dom.modal].forEach(container => {
            container.addEventListener('click', e => {
                const toggleBtn = e.target.closest('.accordion-toggle');
                if (toggleBtn) toggleAccordionPanel(toggleBtn);
            });
        });
        
        this.dom.coverBoundary.addEventListener('click', this._handleCoverClick.bind(this));
        this.dom.coverBoundary.addEventListener('mousedown', this.interactionManager.handleCoverMouseDown.bind(this.interactionManager));
        document.addEventListener('click', this._handleGlobalClick.bind(this));
        
        // History events
        this.dom.undoBtn.addEventListener('click', () => this.history.undo());
        this.dom.redoBtn.addEventListener('click', () => this.history.redo());
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                this.history.undo();
            }
            if (e.ctrlKey && e.key === 'y') {
                e.preventDefault();
                this.history.redo();
            }
        });

        document.addEventListener('selectionchange', this._handleSelectionChange.bind(this));
    }

    async _displayVersion() {
        try {
            const response = await fetch('metadata.json');
            const metadata = await response.json();
            const version = metadata.version;

            if (version) {
                const titleElement = this.dom.sidebar.querySelector('h1');
                if (titleElement) {
                    const versionElement = document.createElement('p');
                    versionElement.textContent = `גרסה ${version}`;
                    versionElement.className = 'text-xs text-slate-500 mb-1';
                    titleElement.parentNode.insertBefore(versionElement, titleElement);
                }
            }
        } catch (error) {
            console.error("Failed to load metadata for version display:", error);
        }
    }

    _handleSidebarMouseDown(e) {
        if (e.target.matches('.native-color-picker')) {
            this.isInteractingWithNativeColorPicker = true;
            // When opening the native picker, we don't have the final color yet.
            // We'll reset this flag on the 'change' event of the picker.
        }
    }

    _handleSidebarKeyDown(e) {
        const { target } = e;
        const prop = target.dataset.property;
        const richTextPropsWithManualInput = ['fontSize', 'letterSpacing', 'lineHeight'];
        
        if (richTextPropsWithManualInput.includes(prop)) {
            // Generate dynamic property name for interactionState e.g., 'isTypingFontSize'
            const typingFlag = `isTyping${prop.charAt(0).toUpperCase() + prop.slice(1)}`;
    
            if (e.key === 'Enter') {
                e.preventDefault();
                this.interactionState[typingFlag] = false; // Reset flag before blur
                target.blur(); // Triggers 'change' event
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                this.interactionState[typingFlag] = false;
                const currentValue = parseFloat(target.value) || 0;
                const step = e.shiftKey ? 10 : 1;
                const newValue = e.key === 'ArrowUp' ? currentValue + step : Math.max(1, currentValue - step);
                target.value = newValue;
                target.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
                // Any other key that isn't an arrow key is considered "typing"
                this.interactionState[typingFlag] = true;
            }
        }
    }
    
    _handleGlobalClick(e) {
        if (this.isLayerMenuOpen) {
            const toggleButton = this.dom.sidebar.querySelector('[data-action="toggle-layer-menu"]');
            const menu = document.getElementById('layer-menu');
            if (toggleButton && menu && !toggleButton.contains(e.target) && !menu.contains(e.target)) {
                this._toggleLayerMenu(false);
            }
        }
    
        // If the native color picker is open, don't close the popover.
        if (this.isInteractingWithNativeColorPicker) {
            return;
        }
    
        // Find any open color popover and simulate a click on its "Cancel" button.
        this.dom.sidebar.querySelectorAll('.custom-color-picker').forEach(picker => {
            const isClickInsidePicker = picker.contains(e.target);
            
            if (!isClickInsidePicker) {
                const btn = picker.querySelector('.color-display-btn');
                if (btn.getAttribute('aria-expanded') === 'true') {
                    const cancelButton = picker.querySelector('[data-action="cancel-color"]');
                    if (cancelButton) cancelButton.click();
                }
            }
        });

        // Close font size dropdown
        const openFontSizeDropdown = this.dom.sidebar.querySelector('.font-size-dropdown:not(.hidden)');
        if (openFontSizeDropdown) {
            const wrapper = openFontSizeDropdown.closest('.relative');
            if (wrapper && !wrapper.contains(e.target)) {
                openFontSizeDropdown.classList.add('hidden');
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

    _toggleColorPopover(btn, forceClose = false) {
        const popover = btn.nextElementSibling;
        if (!popover) return;
        const picker = btn.closest('.custom-color-picker');
        const isOpening = popover.classList.contains('hidden');

        // Close all other popovers first (by canceling)
        this.dom.sidebar.querySelectorAll('.color-popover:not(.hidden)').forEach(p => {
            if (p !== popover) {
                const cancelButton = p.querySelector('[data-action="cancel-color"]');
                if (cancelButton) cancelButton.click();
            }
        });

        if (forceClose) {
            popover.classList.add('hidden');
            btn.setAttribute('aria-expanded', 'false');
            // Clean up interaction state on close
            delete this.interactionState.colorPickerOriginalValue;
            delete this.interactionState.colorPickerProperty;
            delete this.interactionState.preColorPickerState;

        } else {
            const shouldBeOpen = isOpening;
            if (shouldBeOpen) {
                // Store original color on open
                const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
                const prop = picker.dataset.property;
                if(selectedEl && prop) {
                    this.interactionState.colorPickerOriginalValue = selectedEl[prop];
                    this.interactionState.colorPickerProperty = prop;
                    this.interactionState.preColorPickerState = this._getStateSnapshot();
                }
            }
            popover.classList.toggle('hidden', !shouldBeOpen);
            btn.setAttribute('aria-expanded', shouldBeOpen);
        }
    }

    _toggleFontSizeDropdown(btn) {
        const dropdown = btn.closest('.relative').querySelector('.font-size-dropdown');
        if (dropdown) {
            dropdown.classList.toggle('hidden');
        }
    }

    _handleFontSizeSelection(item) {
        const value = item.dataset.value;
        const dropdown = item.closest('.font-size-dropdown');
        const input = dropdown.closest('.relative').querySelector('input[data-property="fontSize"]');
        
        if (input && dropdown) {
            input.value = value;
            const event = new Event('change', { bubbles: true });
            input.dispatchEvent(event);
            dropdown.classList.add('hidden');
        }
    }

    // --- State & Template Management ---

    _setDirty(isDirty) {
        this.state.isDirty = isDirty;
        this.dom.saveTemplateBtn.classList.toggle('dirty-button', isDirty);
    }

    _getStateSnapshot() {
        return JSON.parse(JSON.stringify(this.state));
    }

    restoreState(newState) {
        this.historyRecordingSuspended = true;
        
        // Restore only the historized properties
        this.state.elements = newState.elements;
        this.state.backgroundColor = newState.backgroundColor;
        this.state.coverWidth = newState.coverWidth;
        this.state.coverHeight = newState.coverHeight;
        this.state.templateName = newState.templateName;
        // Keep current selection if possible, otherwise nullify
        this.state.selectedElementId = newState.elements.some(el => el.id === this.state.selectedElementId) ? this.state.selectedElementId : null;

        // Update UI elements tied to state
        this.dom.templateNameInput.value = this.state.templateName;
        this.dom.templateWidthInput.value = this.state.coverWidth;
        this.dom.templateHeightInput.value = this.state.coverHeight;

        this._updateCoverDimensions();
        this.render();

        this.historyRecordingSuspended = false;
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
        this._renderSidebarAndPreserveAccordion();
    }

    _renderSidebarAndPreserveAccordion() {
        const openAccordion = this.dom.sidebar.querySelector('.accordion-panel.open');
        const openAccordionId = openAccordion ? openAccordion.id : null;

        this.renderSidebar();

        if (openAccordionId) {
            const panelToReopen = this.dom.sidebar.querySelector(`#${openAccordionId}`);
            if (panelToReopen) {
                const toggleBtn = panelToReopen.previousElementSibling;
                if (toggleBtn && toggleBtn.matches('.accordion-toggle')) {
                    toggleBtn.click();
                }
            }
        }
    }

    renderCover(snapLines = []) {
        const currentWidth = this.dom.coverBoundary.offsetWidth;
        const scale = (this.state.coverWidth > 0 && currentWidth > 0) ? currentWidth / this.state.coverWidth : 1;
    
        this.dom.coverBoundary.innerHTML = '';
        this.dom.coverBoundary.style.backgroundColor = this.state.backgroundColor;
        this.state.elements.forEach((el, index) => {
            const domEl = renderCoverElement(el, this.state, scale, index);
            this.dom.coverBoundary.appendChild(domEl);
        });
        this._renderSnapGuides(snapLines, scale);
    }
    
    _renderSnapGuides(snapLines, scale = 1) {
        // Clear existing guides
        this.dom.coverBoundary.querySelectorAll('.snap-guide').forEach(el => el.remove());
        
        // Render new guides
        snapLines.forEach(line => {
            const guideEl = document.createElement('div');
            guideEl.className = `snap-guide ${line.type}`;
            if (line.type === 'vertical') {
                guideEl.style.left = `${line.position * scale}px`;
            } else {
                guideEl.style.top = `${line.position * scale}px`;
            }
            this.dom.coverBoundary.appendChild(guideEl);
        });
    }

    renderSidebar() {
        const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
        renderSidebar(selectedEl, this.dom.sidebarEditorHeader, this.dom.sidebarContent, this.dom.templateActions, this.dom.bottomActions);
    }
        
    // --- Event Handlers ---

    _handleAuthAction(e) {
        const target = e.target.closest('[data-auth-action]');
        if (!target) return;
    
        e.preventDefault();
        const action = target.dataset.authAction;
    
        // Actions that don't need form data
        switch(action) {
            case 'logout':
                supabaseClient.auth.signOut();
                return;
            case 'login_google':
                supabaseClient.auth.signInWithOAuth({ 
                    provider: 'google',
                    options: {
                        redirectTo: location.href.split('#')[0]
                    }
                });
                return;
            case 'show_default_auth':
                this.authViewState = 'default';
                this._renderAuthState();
                return;
            case 'show_email_login':
                this.authViewState = 'email_login';
                this._renderAuthState();
                return;
        }
    
        // Actions that DO need form data
        const form = target.closest('form');
        if (!form) return;
    
        const emailInput = form.querySelector('input[name="email"]');
        const passwordInput = form.querySelector('input[name="password"]');
    
        const email = emailInput ? emailInput.value : null;
        const password = passwordInput ? passwordInput.value : null;
    
        if (!email) {
            alert('יש להזין כתובת אימייל.');
            return;
        }
    
        switch(action) {
            case 'login_email':
                if (!password) { alert('יש להזין סיסמה.'); return; }
                this._performEmailLogin(email, password, target);
                break;
        }
    }
    
    async _performEmailLogin(email, password, button) {
        const originalHtml = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<svg class="animate-spin h-5 w-5 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
        
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        
        if (error) alert(error.message);
        
        button.disabled = false;
        button.innerHTML = originalHtml;
    }
    
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
        this._clearCustomSelection();
        const oldSelectedId = this.state.selectedElementId;
        if (oldSelectedId) {
            const oldElement = this.state.elements.find(el => el.id === oldSelectedId);
            if (oldElement && oldElement.type === 'clipping-shape') {
                this.history.addState(this._getStateSnapshot());
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
        
        // Live preview for selected text or whole element. No history yet.
        const wasAppliedToSelection = this._applyStyleToSelection({ [prop]: color });
        if (!wasAppliedToSelection) {
            const el = this.state.elements.find(e => e.id === this.state.selectedElementId);
            if(el) {
                el[prop] = color;
                this.renderCover();
            }
        }

        // Update color picker UI
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
        
        // Re-render to show/hide opacity slider, but only if the popover is NOT being closed
        this._renderSidebarAndPreserveAccordion();
    }

    _handleNativeColorChange(input) {
        const color = input.value;
        const picker = input.closest('.custom-color-picker');
        if (!picker) return;
    
        const prop = picker.dataset.property;

        // Live preview
        const wasApplied = this._applyStyleToSelection({ [prop]: color });
        if (!wasApplied) {
             const el = this.state.elements.find(e => e.id === this.state.selectedElementId);
            if(el) {
                el[prop] = color;
                this.renderCover();
            }
        }
    
        // Update picker UI
        picker.dataset.value = color;
        const displaySwatch = picker.querySelector('.color-swatch-display');
        if (displaySwatch) {
            displaySwatch.classList.remove('is-transparent-swatch');
            displaySwatch.style.backgroundColor = color;
        }
    }
    
    _confirmColorSelection(btn) {
        const picker = btn.closest('.custom-color-picker');
        if (!picker) return;
        const { preColorPickerState, colorPickerProperty: prop } = this.interactionState;

        const newValue = picker.dataset.value;
        const originalValue = preColorPickerState.elements.find(el => el.id === this.state.selectedElementId)[prop];

        if (newValue !== originalValue) {
             // Update the text property if it was a selection-based change
            const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
            const textContainer = this.dom.coverBoundary.querySelector(`[data-id="${this.state.selectedElementId}"] [data-role="text-content"]`);
            if (selectedEl && textContainer) {
                selectedEl.text = textContainer.innerHTML;
            }
            this.history.addState(preColorPickerState);
            this._setDirty(true);
        }
        
        this._toggleColorPopover(picker.querySelector('.color-display-btn'), true);
    }
    
    _cancelColorSelection(btn) {
        const picker = btn.closest('.custom-color-picker');
        if (!picker) return;
        const { colorPickerOriginalValue: originalValue, colorPickerProperty: prop } = this.interactionState;
        
        // Revert to original color, even for text selection. It's simpler to revert the whole element.
        this.updateSelectedElement({ [prop]: originalValue });

        this._toggleColorPopover(picker.querySelector('.color-display-btn'), true);
        this._renderSidebarAndPreserveAccordion();
    }

    _handleSidebarInput(e) {
        const { target } = e;
        
        const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
        
        if (target.matches('.native-color-picker')) {
            this._handleNativeColorChange(target);
            if(e.type === 'change') this.isInteractingWithNativeColorPicker = false;
            return;
        }
        
        if (target.dataset.property && selectedEl) {
            const prop = target.dataset.property;
            
            // Universal check for manual text property typing
            const richTextPropsWithManualInput = ['fontSize', 'letterSpacing', 'lineHeight'];
            if (richTextPropsWithManualInput.includes(prop)) {
                const typingFlag = `isTyping${prop.charAt(0).toUpperCase() + prop.slice(1)}`;
                if (e.type === 'input' && this.interactionState[typingFlag]) {
                    return; // Wait for blur/enter
                }
                if (e.type === 'change') {
                    this.interactionState[typingFlag] = false; // Reset on commit
                }
            }

            const preEditState = this._getStateSnapshot();
            let value = (target.type === 'number' || target.type === 'range') ? (parseFloat(target.value) || 0) : target.value;

            // Rich text properties when inline editing
            const styleProps = {
                fontSize: val => ({ fontSize: `${val}px` }),
                fontFamily: val => ({ fontFamily: val }),
                fontWeight: val => ({ fontWeight: val }),
                letterSpacing: val => ({ letterSpacing: `${val}px` }),
                lineHeight: val => ({ lineHeight: val })
            };
            
            if (selectedEl.type === 'text' && this.state.inlineEditingElementId === selectedEl.id && styleProps[prop]) {
                const styleObject = styleProps[prop](value);
                const wasApplied = this._applyStyleToSelection(styleObject);
                
                if (wasApplied) {
                    if (e.type === 'change') this.history.addState(preEditState);
                    const textContainer = this.dom.coverBoundary.querySelector(`[data-id="${selectedEl.id}"] [data-role="text-content"]`);
                    selectedEl.text = textContainer.innerHTML;
                    this._setDirty(true);
                    setTimeout(() => this._drawCustomSelectionOverlay(), 10);
                    return;
                }
            }
        
            // Proportional font scaling when NOT inline editing
            if (prop === 'fontSize' && selectedEl.type === 'text' && this.state.inlineEditingElementId !== selectedEl.id) {
                const oldBaseSize = selectedEl.fontSize;
                const newBaseSize = value;
                if (oldBaseSize && oldBaseSize > 0 && newBaseSize > 0) {
                    const scale = newBaseSize / oldBaseSize;
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = selectedEl.text;
                    tempDiv.querySelectorAll('[style*="font-size"]').forEach(span => {
                        const currentSize = parseFloat(span.style.fontSize);
                        if (!isNaN(currentSize)) span.style.fontSize = `${(currentSize * scale).toFixed(2)}px`;
                    });
                    selectedEl.text = tempDiv.innerHTML;
                }
            }
        
            if (e.type === 'change') {
                this.history.addState(preEditState);
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
    
    _applyStyleToSelection(style) {
        const selection = window.getSelection();
        let range;
    
        const editorEl = this.dom.coverBoundary.querySelector(`[data-id="${this.state.inlineEditingElementId}"] [data-role="text-content"]`);
        if (!editorEl) return false;
        
        const hasSelection = this.savedRange || (selection.rangeCount > 0 && !selection.isCollapsed);
    
        this.isApplyingStyle = true;
        try {
            if (hasSelection) {
                // When there IS a selection
                range = this.savedRange ? this.savedRange : selection.getRangeAt(0);
            
                if (!editorEl.contains(range.commonAncestorContainer)) {
                    this.savedRange = null; return false;
                }
    
                selection.removeAllRanges(); selection.addRange(range);
            
                const contents = range.cloneContents();
                const meaningfulNodes = Array.from(contents.childNodes).filter(n => !(n.nodeType === Node.TEXT_NODE && n.textContent.trim() === ''));
        
                if (meaningfulNodes.length === 1 && meaningfulNodes[0].nodeType === Node.ELEMENT_NODE && meaningfulNodes[0].tagName === 'SPAN') {
                    const extractedSpan = range.extractContents().firstChild;
                    Object.assign(extractedSpan.style, style);
                    range.insertNode(extractedSpan);
                    range.selectNodeContents(extractedSpan);
                } else {
                    const span = document.createElement('span');
                    Object.assign(span.style, style);
                    const extractedContents = range.extractContents();
    
                    extractedContents.querySelectorAll('span').forEach(innerSpan => Object.assign(innerSpan.style, style));
        
                    span.appendChild(extractedContents);
                    range.insertNode(span);
                    range.selectNodeContents(span);
                }
        
                selection.removeAllRanges(); selection.addRange(range);
                this.savedRange = range.cloneRange();
            } else {
                // When there is NO selection (in inline edit mode)
                Array.from(editorEl.childNodes).forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const span = document.createElement('span');
                        Object.assign(span.style, style);
                        span.textContent = node.textContent;
                        editorEl.replaceChild(span, node);
                    } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SPAN') {
                        Object.assign(node.style, style);
                    }
                });
                this.savedRange = null;
            }
            return true;
        } catch(e) {
            console.error("Could not apply style:", e);
            return false;
        } finally {
            this.isApplyingStyle = false;
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
    
        if (action === 'toggle-layer-menu') {
            // Close any open accordion panel before toggling the layer menu.
            const openPanel = this.dom.sidebarContent.querySelector('.accordion-panel.open');
            if (openPanel) {
                const toggleBtn = openPanel.previousElementSibling;
                if (toggleBtn && toggleBtn.matches('.accordion-toggle')) {
                    // This will toggle it to the closed state as it is currently open.
                    toggleAccordionPanel(toggleBtn);
                }
            }
            this._toggleLayerMenu();
            return;
        }

        if (action === 'toggle-font-size-dropdown') {
            this._toggleFontSizeDropdown(actionTarget);
            return;
        }

        if (action === 'select-font-size') {
            this._handleFontSizeSelection(actionTarget);
            return;
        }
        
        if (action === 'confirm-color') {
            this._confirmColorSelection(actionTarget);
            return;
        }
        if (action === 'cancel-color') {
            this._cancelColorSelection(actionTarget);
            return;
        }

        const recordableActions = ['bring-to-front', 'send-to-back', 'layer-up', 'layer-down', 'align-text', 'align-vertical-text', 'toggle-property'];
        const preEditState = this._getStateSnapshot();
        let recordHistory = true;

        if (recordableActions.includes(action) || action.startsWith('add-element') || action === 'delete' || action === 'perform-clip') {
            this.history.addState(preEditState);
            recordHistory = false; // History already added
        }
    
        const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
    
        const actions = {
            'deselect-element': () => this._deselectAndCleanup(),
            'add-element': () => this._addElement(actionTarget.dataset.type),
            'delete': () => this._renderDeleteConfirmation(),
            'confirm-delete': () => this._deleteSelectedElement(),
            'cancel-delete': () => this._renderSidebarAndPreserveAccordion(),
            'add-image': () => this.dom.elementImageUploadInput.click(),
            'edit-image': () => this._editImageHandler(selectedEl),
            'bring-to-front': () => this._reorderElement('front'),
            'send-to-back': () => this._reorderElement('back'),
            'layer-up': () => this._reorderElement('up'),
            'layer-down': () => this._reorderElement('down'),
            'align-text': () => {
                const align = actionTarget.dataset.align;
                if (!selectedEl) return;
                
                selectedEl.textAlign = align;
                this._setDirty(true);
            
                if (this.state.inlineEditingElementId === selectedEl.id) {
                    const textWrapper = this.dom.coverBoundary.querySelector(`[data-id="${selectedEl.id}"] [data-role="text-content"]`);
                    if (textWrapper) {
                        textWrapper.style.textAlign = align;
                        setTimeout(() => {
                            if (this.state.inlineEditingElementId === selectedEl.id) {
                                this._drawCustomSelectionOverlay();
                            }
                        }, 10);
                    }
                } else {
                    this.renderCover();
                }
            },
            'align-vertical-text': () => {
                const align = actionTarget.dataset.align;
                if (!selectedEl) return;

                selectedEl.verticalAlign = align;
                this._setDirty(true);
                
                if (this.state.inlineEditingElementId === selectedEl.id) {
                    const draggableEl = this.dom.coverBoundary.querySelector(`[data-id="${selectedEl.id}"]`);
                    if (draggableEl && draggableEl.firstChild) {
                        const backgroundElement = draggableEl.firstChild;
                        const verticalAlignMap = { start: 'flex-start', center: 'center', end: 'flex-end' };
                        backgroundElement.style.justifyContent = verticalAlignMap[align] || 'center';
                        setTimeout(() => {
                            if (this.state.inlineEditingElementId === selectedEl.id) {
                                this._drawCustomSelectionOverlay();
                            }
                        }, 10);
                    }
                } else {
                    this.renderCover();
                }
            },
            'toggle-property': () => {
                const prop = actionTarget.dataset.property;
                if (!selectedEl) return;
            
                if (prop === 'shadow' && selectedEl.type === 'text') {
                    // Check if we are in inline editing mode for rich text editing
                    if (this.state.inlineEditingElementId === selectedEl.id) {
                        const selection = window.getSelection();
                        const range = (selection && selection.rangeCount > 0) ? selection.getRangeAt(0) : this.savedRange;
                        const editorEl = this.dom.coverBoundary.querySelector(`[data-id="${this.state.inlineEditingElementId}"] [data-role="text-content"]`);
                        
                        if (range && editorEl) {
                            let commonAncestor = range.commonAncestorContainer;
                            if (commonAncestor.nodeType === Node.TEXT_NODE) {
                                commonAncestor = commonAncestor.parentElement;
                            }
            
                            // Ensure we are working inside the correct contentEditable element
                            if (editorEl.contains(commonAncestor)) {
                                const styles = window.getComputedStyle(commonAncestor);
                                const hasShadow = styles.textShadow && styles.textShadow !== 'none';
                                
                                const wasApplied = this._applyStyleToSelection({ 
                                    textShadow: hasShadow ? 'none' : '2px 2px 4px rgba(0,0,0,0.7)' 
                                });
            
                                if (wasApplied) {
                                    const textContainer = this.dom.coverBoundary.querySelector(`[data-id="${this.state.selectedElementId}"] [data-role="text-content"]`);
                                    selectedEl.text = this._cleanupTextHtml(textContainer.innerHTML);
                                    this._setDirty(true);
                                    // Let the main render loop handle UI updates
                                    return; // Action handled for selection
                                }
                            }
                        }
                    }
                    
                    // Fallback: Toggle for the whole element if not in inline mode or no selection
                    this.updateSelectedElement({ [prop]: !selectedEl[prop] });
            
                } else {
                     // Handle other boolean properties
                     this.updateSelectedElement({ [prop]: !selectedEl[prop] });
                }
            },
            'perform-clip': () => this._performClip(),
        };
    
        if (actions[action]) {
            if (recordHistory) this.history.addState(preEditState);
            actions[action]();
            if (action.startsWith('layer-') || action === 'bring-to-front' || action === 'send-to-back') {
                this._toggleLayerMenu(false);
            }
        }
    
        // Actions that manually handle their own sidebar render state
        const manualRenderActions = [
            'deselect-element', 'add-element', 'delete',
            'confirm-delete', 'cancel-delete', 'perform-clip'
        ];
    
        if (!manualRenderActions.includes(action)) {
            this._renderSidebarAndPreserveAccordion();
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
        // All mousedown-based interactions (selection, dragging, starting edits)
        // are now handled in InteractionManager.js to fix an event propagation issue.
        // This handler is now redundant for those actions.
        if (e.target.closest('[contenteditable="true"]')) {
            // Clicks inside an already-editable area are handled by the browser and selectionchange listener.
            return;
        }
    }

    _startInlineEditing(elementData, draggableEl, clickEvent) {
        if (this.state.inlineEditingElementId === elementData.id) return; // Already editing
        
        if (!elementData.multiLine && (typeof elementData.width === 'undefined' || typeof elementData.height === 'undefined')) {
            elementData.width = draggableEl.offsetWidth;
            elementData.height = draggableEl.offsetHeight;
            this._setDirty(true);
        }
        this.state.inlineEditingElementId = elementData.id;
        this.renderCover();

        const textContainer = this.dom.coverBoundary.querySelector(`[data-id="${elementData.id}"] [data-role="text-content"]`);
        if (!textContainer) return;
        
        textContainer.contentEditable = true;
        textContainer.focus();
        
        // Position caret at click location
        const selection = window.getSelection();
        if (selection) {
            let range;
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
            else if (document.caretRangeFromPoint) {
                range = document.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY);
                if (range) {
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        }
        
        const preEditState = this._getStateSnapshot();
        const originalText = textContainer.innerHTML;

        const onKeyDown = (e) => {
            if (e.key === 'Enter' && !elementData.multiLine) {
                e.preventDefault();
                textContainer.blur(); // Triggers focusout
            }
        };

        const onEditEnd = () => {
            textContainer.removeEventListener('focusout', onFocusOut);
            textContainer.removeEventListener('keydown', onKeyDown);
            textContainer.contentEditable = false;
            
            const newText = this._cleanupTextHtml(textContainer.innerHTML || '');
            
            if (originalText !== newText) {
                this.history.addState(preEditState);
                
                const elementToUpdate = this.state.elements.find(el => el.id === elementData.id);
                if(elementToUpdate) {
                    elementToUpdate.text = newText;
                    this._setDirty(true);
                    this.renderCover();
                }
            }
            this.state.inlineEditingElementId = null;
            this._clearCustomSelection(); // Clear selection overlay and saved range
        };
        
        const onFocusOut = (e) => {
            // If focus moves to the sidebar, keep the selection active.
            if (this.dom.sidebar.contains(e.relatedTarget)) {
                 const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    this.savedRange = selection.getRangeAt(0).cloneRange();
                }
            } else {
                onEditEnd();
            }
        };

        textContainer.addEventListener('focusout', onFocusOut);
        textContainer.addEventListener('keydown', onKeyDown);
    }

    _rgbToHex(rgb) {
        if (!rgb || !rgb.startsWith('rgb')) return '#000000';
        const result = rgb.match(/\d+/g);
        if (!result || result.length < 3) return '#000000';
        
        const r = parseInt(result[0], 10);
        const g = parseInt(result[1], 10);
        const b = parseInt(result[2], 10);
        
        const toHex = (c) => ('0' + c.toString(16)).slice(-2);
        
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    _getEditorElements() {
        if (!this.state.inlineEditingElementId) return { };
        const draggableEl = this.dom.coverBoundary.querySelector(`.draggable[data-id="${this.state.inlineEditingElementId}"]`);
        if (!draggableEl) return { };
        
        return {
            draggableEl,
            contentEl: draggableEl.querySelector('[data-role="text-content"]'),
            overlayContainerEl: draggableEl.querySelector('[data-role="selection-overlays"]')
        };
    }
    
    _clearCustomSelection() {
        if (this.savedRange) this.savedRange = null;
        
        const { draggableEl } = this._getEditorElements();
        if (draggableEl) {
            draggableEl.classList.remove('has-custom-selection');
        }
        
        this.dom.coverBoundary.querySelectorAll('.selection-overlay').forEach(el => el.remove());
    }
    
    _drawCustomSelectionOverlay() {
        const { draggableEl, contentEl } = this._getEditorElements();
        const selection = window.getSelection();
    
        this._clearCustomSelection();
    
        if (!selection || selection.rangeCount === 0 || !draggableEl || !contentEl) {
            if (selection && selection.rangeCount > 0) this.savedRange = selection.getRangeAt(0).cloneRange();
            return;
        }

        const elementData = this.state.elements.find(el => el.id === this.state.selectedElementId);
        if (!elementData) return;
        
        const range = selection.getRangeAt(0);
        if (range.collapsed) {
            this.savedRange = range.cloneRange();
            return;
        }
    
        this.savedRange = range.cloneRange();
        draggableEl.classList.add('has-custom-selection');
        
        const coverBoundaryRect = this.dom.coverBoundary.getBoundingClientRect();
        const rects = range.getClientRects();
    
        let fontSize = 16;
        if (range.startContainer) {
            const container = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
            if (container && container instanceof HTMLElement) {
                fontSize = parseFloat(window.getComputedStyle(container).fontSize);
            }
        }
    
        for (const rect of rects) {
            const overlay = document.createElement('div');
            overlay.className = 'selection-overlay';
            
            const overlayHeight = fontSize;
            const topOffset = (rect.height - overlayHeight) / 2;
    
            overlay.style.left = `${rect.left - coverBoundaryRect.left}px`;
            overlay.style.top = `${rect.top - coverBoundaryRect.top + topOffset}px`;
            overlay.style.width = `${rect.width}px`;
            overlay.style.height = `${overlayHeight}px`;
            overlay.style.transform = `rotate(${elementData.rotation}deg)`;
    
            this.dom.coverBoundary.appendChild(overlay);
        }
    }
    
    _updateSidebarWithSelectionStyles() {
        const selection = window.getSelection();
        if (!this.state.inlineEditingElementId || !selection || selection.rangeCount === 0) return;
    
        const range = selection.getRangeAt(0);
        let element = range.startContainer;
    
        if (element.nodeType === Node.TEXT_NODE) {
            element = element.parentElement;
        }
        
        const contentEl = this._getEditorElements().contentEl;
        if (!contentEl || (!contentEl.contains(element) && element !== contentEl)) {
             return;
        }
        
        const styles = window.getComputedStyle(element);
        const sidebar = this.dom.sidebarContent;
        if (!sidebar) return;
    
        if (sidebar.querySelector('[data-property="fontFamily"]')) {
            const fontName = styles.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
            sidebar.querySelector('[data-property="fontFamily"]').value = fontName;
        }
        if (sidebar.querySelector('[data-property="fontSize"]')) {
            sidebar.querySelector('[data-property="fontSize"]').value = parseInt(styles.fontSize, 10);
        }
        if (sidebar.querySelector('[data-property="fontWeight"]')) {
            sidebar.querySelector('[data-property="fontWeight"]').value = styles.fontWeight;
        }
        if (sidebar.querySelector('[data-property="letterSpacing"]')) {
            sidebar.querySelector('[data-property="letterSpacing"]').value = parseFloat(styles.letterSpacing) || 0;
        }
        if (sidebar.querySelector('[data-property="lineHeight"]')) {
            const lineHeight = styles.lineHeight;
            if (lineHeight === 'normal') {
                const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
                sidebar.querySelector('[data-property="lineHeight"]').value = selectedEl.lineHeight || 1.2;
            } else if (lineHeight.endsWith('px')) {
                const fontSizePx = parseFloat(styles.fontSize);
                const lineHeightPx = parseFloat(lineHeight);
                if (fontSizePx > 0) {
                    sidebar.querySelector('[data-property="lineHeight"]').value = (lineHeightPx / fontSizePx).toFixed(2);
                }
            } else {
                sidebar.querySelector('[data-property="lineHeight"]').value = parseFloat(lineHeight) || 1.2;
            }
        }
        const colorPicker = sidebar.querySelector('[data-property="color"]');
        if (colorPicker) {
            const hexColor = this._rgbToHex(styles.color);
            colorPicker.dataset.value = hexColor;
            colorPicker.querySelector('.color-swatch-display').style.backgroundColor = hexColor;
            colorPicker.querySelector('.native-color-picker').value = hexColor;
        }
        const shadowToggle = sidebar.querySelector('[data-action="toggle-property"][data-property="shadow"]');
        if (shadowToggle) {
            const hasShadow = styles.textShadow && styles.textShadow !== 'none';
            shadowToggle.classList.toggle('active', hasShadow);
            shadowToggle.setAttribute('aria-pressed', String(hasShadow));
        }
    }

    _handleSelectionChange() {
        if (this.isApplyingStyle) return;
        
        const selection = window.getSelection();
        if (!this.state.inlineEditingElementId) {
            this._clearCustomSelection();
            return;
        }

        const editorEl = this.dom.coverBoundary.querySelector(`[data-id="${this.state.inlineEditingElementId}"] [data-role="text-content"]`);

        const isSelectionInEditor = editorEl && selection.rangeCount > 0 && selection.anchorNode && editorEl.contains(selection.anchorNode);

        if (isSelectionInEditor) {
            if (!selection.isCollapsed) {
                this._drawCustomSelectionOverlay();
            } else {
                this._clearCustomSelection();
            }
            this._updateSidebarWithSelectionStyles();
        } else {
            if (this.dom.sidebar.contains(document.activeElement)) {
                return;
            }
            this._clearCustomSelection();
            this.updateSidebarValues();
        }
    }

    // --- HTML Cleanup Helpers ---
    _cssTextToObject(cssText) {
        const obj = {};
        if (!cssText) return obj;
        cssText.split(';').forEach(declaration => {
            if (declaration.trim()) {
                const [property, value] = declaration.split(':', 2);
                if (property && value) {
                    obj[property.trim()] = value.trim();
                }
            }
        });
        return obj;
    }

    _objectToCssText(obj) {
        return Object.entries(obj)
            .map(([property, value]) => `${property}: ${value}`)
            .join('; ');
    }


    _cleanupTextHtml(html) {
        if (!html) return '';

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        let changesMade;
        let passes = 0;
        const MAX_PASSES = 10; // Failsafe against infinite loops

        do {
            changesMade = false;
            
            // Pass 1: Flatten nested spans. Merge styles from inner to outer.
            tempDiv.querySelectorAll('span[style]').forEach(outerSpan => {
                const childNodes = Array.from(outerSpan.childNodes).filter(n =>
                    !(n.nodeType === Node.TEXT_NODE && !n.textContent.trim())
                );

                if (childNodes.length === 1 && childNodes[0].nodeName === 'SPAN' && childNodes[0].hasAttribute('style')) {
                    const innerSpan = childNodes[0];
                    
                    const outerStyles = this._cssTextToObject(outerSpan.style.cssText);
                    const innerStyles = this._cssTextToObject(innerSpan.style.cssText);
                    const newStyles = { ...outerStyles, ...innerStyles };
                    
                    outerSpan.style.cssText = this._objectToCssText(newStyles);
                    
                    while (innerSpan.firstChild) {
                        outerSpan.appendChild(innerSpan.firstChild);
                    }
                    outerSpan.removeChild(innerSpan);
                    changesMade = true;
                }
            });

            // Pass 2: Merge adjacent spans with identical styles
            let currentNode = tempDiv.firstChild;
            while (currentNode && currentNode.nextSibling) {
                const nextNode = currentNode.nextSibling;
                if (
                    currentNode.nodeType === Node.ELEMENT_NODE && currentNode.nodeName === 'SPAN' &&
                    nextNode.nodeType === Node.ELEMENT_NODE && nextNode.nodeName === 'SPAN' &&
                    currentNode.style.cssText === nextNode.style.cssText
                ) {
                    while (nextNode.firstChild) {
                        currentNode.appendChild(nextNode.firstChild);
                    }
                    tempDiv.removeChild(nextNode);
                    changesMade = true;
                    // Do not advance currentNode, check again with the new nextSibling
                } else {
                    currentNode = nextNode;
                }
            }
            
            // Pass 3: Remove empty nodes and normalize
            tempDiv.querySelectorAll('span:empty').forEach(el => {
                el.remove();
                changesMade = true;
            });
            tempDiv.normalize();
            
            passes++;
        } while (changesMade && passes < MAX_PASSES);
        
        return tempDiv.innerHTML;
    }

    // --- Element Actions ---

    _addElement(type) {
        this._clearCustomSelection();
        const newEl = type === 'text' ? {
            id: `el_${Date.now()}`, type: 'text', text: 'טקסט חדש',
            position: { x: 50, y: 100 }, fontSize: 48, color: '#FFFFFF',
            fontWeight: 700, fontFamily: 'Heebo', shadow: false,
            bgColor: 'transparent', bgColorOpacity: 1, rotation: 0, shape: 'rectangle', 
            textAlign: 'center', verticalAlign: 'center',
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
        this._clearCustomSelection();
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
        this._clearCustomSelection();
        this.state.elements = this.state.elements.filter(el => el.id !== this.state.selectedElementId);
        this.state.selectedElementId = null;
        this._setDirty(true);
        this.render();
    }

    selectElement(elementId, oldElementId) {
        const oldElementData = this.state.elements.find(el => el.id === oldElementId);
        const newElementData = this.state.elements.find(el => el.id === elementId);
        
        if (oldElementData && oldElementData.type === 'clipping-shape') {
            this.history.addState(this._getStateSnapshot());
            this.state.elements = this.state.elements.filter(el => el.id !== oldElementId);
        }

        this.state.selectedElementId = elementId;
        if (this.state.inlineEditingElementId && this.state.inlineEditingElementId !== elementId) {
            this.state.inlineEditingElementId = null;
            this._clearCustomSelection();
        }

        if (oldElementData && newElementData && oldElementData.type === newElementData.type) {
            this.renderCover();
            this.updateSidebarValues();
        } else {
            this.render();
        }
    }

    updateSidebarValues() {
        const selectedEl = this.state.elements.find(el => el.id === this.state.selectedElementId);
        if (!selectedEl) return;

        const header = this.dom.sidebarEditorHeader;
        const content = this.dom.sidebarContent;

        const typeNameMap = { 'text': 'טקסט', 'image': 'תמונה', 'clipping-shape': 'צורת חיתוך' };
        const typeName = typeNameMap[selectedEl.type] || 'אלמנט';
        header.querySelector('h3').textContent = `עריכת ${typeName}`;
        
        const idInput = header.querySelector('[data-property="id"]');
        if (idInput) {
            idInput.value = selectedEl.id;
        }

        content.querySelectorAll('[data-property]').forEach(input => {
            const prop = input.dataset.property;
            if (selectedEl[prop] === undefined) return;
            const value = selectedEl[prop];
            
            if (input.type === 'checkbox') {
                input.checked = !!value;
            } else if (input.matches('select')) {
                input.value = value;
            } else if (input.closest('.custom-color-picker')) {
                const picker = input.closest('.custom-color-picker');
                picker.dataset.value = value;
                const swatch = picker.querySelector('.color-swatch-display');
                const nativePicker = picker.querySelector('.native-color-picker');
                const isTransparent = value === 'transparent';
                
                swatch.classList.toggle('is-transparent-swatch', isTransparent);
                swatch.style.backgroundColor = isTransparent ? '#fff' : value;
                nativePicker.value = isTransparent ? '#ffffff' : value;
            } else if (input.type === 'number' || input.type === 'range') {
                input.value = typeof value === 'number' ? Math.round(value * 10) / 10 : value;
            } else {
                input.value = value;
            }
        });

        content.querySelectorAll('[data-action="toggle-property"]').forEach(btn => {
            const prop = btn.dataset.property;
            if (selectedEl[prop] !== undefined) {
                const isActive = !!selectedEl[prop];
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-pressed', String(isActive));
            }
        });

        if (selectedEl.type === 'text') {
            content.querySelectorAll('[data-action="align-text"]').forEach(btn => {
                btn.classList.toggle('active', selectedEl.textAlign === btn.dataset.align);
            });
            content.querySelectorAll('[data-action="align-vertical-text"]').forEach(btn => {
                btn.classList.toggle('active', selectedEl.verticalAlign === btn.dataset.align);
            });
            // Handle conditional display of opacity slider
            const opacityControl = content.querySelector('[data-property="bgColorOpacity"]')?.closest('div');
            if (opacityControl) {
                opacityControl.style.display = (selectedEl.bgColor && selectedEl.bgColor !== 'transparent') ? 'flex' : 'none';
            }
        }
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

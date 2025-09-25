// --- Sidebar Control Builders (Private helpers) ---

import { FONTS } from './fonts.js';

const _hexToRgba = (hex, alpha) => {
    if (!hex || hex === 'transparent') return 'transparent';
    // Handle named colors by creating a temp element
    if (!hex.startsWith('#')) {
        const tempElem = document.createElement('div');
        tempElem.style.color = hex;
        document.body.appendChild(tempElem);
        const rgbColor = window.getComputedStyle(tempElem).color;
        document.body.removeChild(tempElem);
        const rgb = rgbColor.match(/\d+/g);
        if (rgb) {
            return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
        }
        return 'transparent'; // fallback
    }
    
    let r = 0, g = 0, b = 0;
    // 3 digits
    if (hex.length === 4) {
        r = "0x" + hex[1] + hex[1];
        g = "0x" + hex[2] + hex[2];
        b = "0x" + hex[3] + hex[3];
    // 6 digits
    } else if (hex.length === 7) {
        r = "0x" + hex[1] + hex[2];
        g = "0x" + hex[3] + hex[4];
        b = "0x" + hex[5] + hex[6];
    }
    return `rgba(${+r},${+g},${+b},${alpha})`;
};


const _createSidebarInput = (type, prop, label, value, attrs = {}) => `
    <div>
        <label class="block text-sm font-medium text-slate-300 mb-1">${label}</label>
        <input type="${type}" data-property="${prop}" value="${value}" class="w-full bg-slate-700 border border-slate-600 text-white rounded-md p-2" ${Object.entries(attrs).map(([k,v]) => `${k}="${v}"`).join(' ')} />
    </div>`;

const _createSidebarSelect = (prop, label, value, options) => `
    <div>
        <label class="block text-sm font-medium text-slate-300 mb-1">${label}</label>
        <select data-property="${prop}" class="w-full bg-slate-700 border border-slate-600 text-white rounded-md p-2 h-10">
            ${options.map(o => `<option value="${o}" ${o == value ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
    </div>`;

const _createSidebarCheckbox = (prop, label, value) => `
    <div class="flex items-center">
        <input type="checkbox" data-property="${prop}" ${value ? 'checked' : ''} id="checkbox-${prop}" class="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500" />
        <label for="checkbox-${prop}" class="mr-2 text-sm font-medium text-slate-300">${label}</label>
    </div>`;
    
const _createColorPicker = (prop, label, value, customClass = '') => {
    const isTransparent = value === 'transparent';
    const displayValue = isTransparent ? 'transparent' : value;
    const PREDEFINED_COLORS = [
        ['#fde047', '#3b82f6', '#22c55e', '#ef4444', '#ffffff', '#000000'],
        ['#475569', '#64748b', '#94a3b8', '#cbd5e1', '#60a5fa', '#a855f7']
    ];
    let gridHTML = PREDEFINED_COLORS.map(row => 
        `<div class="flex gap-1">${row.map(color => 
            `<button type="button" class="color-swatch-btn" data-color="${color}" style="background-color: ${color};" title="${color}"></button>`
        ).join('')}</div>`
    ).join('');
    return `<div class="flex-1">
        <div class="custom-color-picker ${customClass}" data-property="${prop}" data-value="${displayValue}">
            <label class="block text-sm font-medium text-slate-300 mb-1">${label}</label>
            <button type="button" class="color-display-btn" aria-haspopup="true" aria-expanded="false">
                <span class="color-swatch-display ${isTransparent ? 'is-transparent-swatch' : ''}" style="background-color: ${isTransparent ? '#fff' : value};"></span>
            </button>
            <div class="color-popover hidden">
                <div class="space-y-1 mb-2">${gridHTML}</div>
                <div class="flex items-center gap-2 pt-2 border-t border-slate-600">
                    <button type="button" class="color-swatch-btn is-transparent-swatch" data-color="transparent" title="ללא צבע"></button>
                    <div class="relative flex-1 custom-color-input-wrapper">
                        <input type="color" value="${isTransparent ? '#ffffff' : value}" class="native-color-picker" aria-label="Custom color">
                        <span class="inline-block align-middle mr-2 text-sm">מותאם אישית</span>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

const _createSidebarHeader = (title) => {
    const div = document.createElement('div');
    div.className = "flex justify-between items-center gap-4";
    div.innerHTML = `
        <h3 class="text-xl font-bold text-white flex-grow truncate">${title}</h3>
        <button data-action="deselect-element" title="חזרה" class="flex-shrink-0 p-1 rounded-md bg-slate-600 text-white hover:bg-slate-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
            </svg>
        </button>
    `;
    return div;
}

const _createTextEditorControls = (el) => {
    const container = document.createElement('div');
    const fontOptions = FONTS.map(font => `<option value="${font.family}" ${font.family === el.fontFamily ? 'selected' : ''}>${font.name}</option>`).join('');
    const shapeOptions = [
        { value: 'rectangle', text: 'מלבן' },
        { value: 'rounded-rectangle', text: 'מלבן מעוגל' },
        { value: 'ellipse', text: 'אליפסה' },
        { value: 'star', text: 'שמש' }
    ];
    container.innerHTML = `
        <div class="space-y-1" id="text-editor-accordion-container">
            <!-- Font & Size Group -->
            <div class="accordion-group">
                <button type="button" class="accordion-toggle" aria-expanded="false" aria-controls="font-size-panel">
                    <span>גופן וגודל</span>
                    <svg class="accordion-chevron h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                <div id="font-size-panel" class="accordion-panel space-y-3">
                    <div class="flex gap-2 items-end">
                        <div class="flex-grow">
                            <label class="block text-sm font-medium text-slate-300 mb-1">שם גופן</label>
                            <select data-property="fontFamily" class="w-full bg-slate-700 border border-slate-600 text-white rounded-md p-2 h-10">
                                ${fontOptions}
                            </select>
                        </div>
                        <div class="w-24">${_createSidebarInput('number', 'fontSize', 'גודל', el.fontSize, {min: 1})}</div>
                    </div>
                    <div class="flex gap-2">
                        <div class="flex-1">${_createSidebarInput('number', 'letterSpacing', 'מרווח אותיות', el.letterSpacing || 0, { step: 0.1 })}</div>
                        <div class="flex-1">${_createSidebarInput('number', 'lineHeight', 'מרווח שורות', el.lineHeight || 1.2, { step: 0.1 })}</div>
                        <div class="flex-1">${_createSidebarSelect('fontWeight', 'משקל גופן', el.fontWeight, [400, 700, 900])}</div>
                    </div>
                </div>
            </div>

            <!-- Color & Style Group -->
            <div class="accordion-group pt-2 border-t border-slate-700">
                <button type="button" class="accordion-toggle" aria-expanded="false" aria-controls="color-style-panel">
                    <span>צבע וסגנון</span>
                    <svg class="accordion-chevron h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                <div id="color-style-panel" class="accordion-panel space-y-3">
                    <div class="flex gap-2 w-full items-start">
                        ${_createColorPicker('color', 'צבע גופן', el.color)}
                        ${_createColorPicker('bgColor', 'צבע רקע', el.bgColor, 'align-popover-left')}
                    </div>
                    ${el.bgColor && el.bgColor !== 'transparent' ? `
                    <div class="flex items-center gap-3">
                        <label for="bg-opacity-slider" class="text-sm font-medium text-slate-300 whitespace-nowrap">שקיפות רקע</label>
                        <input type="range" id="bg-opacity-slider" data-property="bgColorOpacity" min="0" max="1" step="0.01" value="${el.bgColorOpacity ?? 1}" class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer">
                    </div>` : ''}
                    <div class="flex gap-2 items-end">
                        <div class="flex-1">
                            <label class="block text-sm font-medium text-slate-300 mb-1">צורת רקע</label>
                            <select data-property="shape" class="w-full bg-slate-700 border border-slate-600 text-white rounded-md p-2 h-10">
                                ${shapeOptions.map(o => `<option value="${o.value}" ${o.value === el.shape ? 'selected' : ''}>${o.text}</option>`).join('')}
                            </select>
                        </div>
                        <div class="flex-1">
                            <label class="block text-sm font-medium text-slate-300 mb-1">צל</label>
                            <div class="toggle-controls-group">
                                 <button type="button" class="toggle-btn ${el.shadow ? 'active' : ''}" data-action="toggle-property" data-property="shadow" title="הוסף צל" aria-pressed="${!!el.shadow}">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-5 w-5">
                                        <path d="M12.25 5.25 L10.75 5.25 L6.75 16.25 L8.25 16.25 L9.25 13.25 L13.75 13.25 L14.75 16.25 L16.25 16.25 Z M11.5 7.25 L13.25 12.25 L9.75 12.25 Z" fill="black" transform="translate(1.5, 1.5)"/>
                                        <path d="M12.25 5.25 L10.75 5.25 L6.75 16.25 L8.25 16.25 L9.25 13.25 L13.75 13.25 L14.75 16.25 L16.25 16.25 Z M11.5 7.25 L13.25 12.25 L9.75 12.25 Z" fill="currentColor"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Alignment & Layout Group -->
            <div class="accordion-group pt-2 border-t border-slate-700">
                <button type="button" class="accordion-toggle" aria-expanded="false" aria-controls="align-layout-panel">
                    <span>יישור ופריסה</span>
                    <svg class="accordion-chevron h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                <div id="align-layout-panel" class="accordion-panel space-y-3">
                    <div class="flex gap-2 items-end">
                         <div class="flex-grow">
                            <label class="block text-sm font-medium text-slate-300 mb-1">יישור טקסט</label>
                            <div class="text-align-group">
                                <button data-action="align-text" data-align="right" class="align-btn ${el.textAlign === 'right' ? 'active' : ''}" title="יישור לימין"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zM4 10a1 1 0 011-1h12a1 1 0 110 2H5a1 1 0 01-1-1zM8 15a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg></button>
                                <button data-action="align-text" data-align="center" class="align-btn ${el.textAlign === 'center' ? 'active' : ''}" title="יישור למרכז"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6 10a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zM4 15a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg></button>
                                <button data-action="align-text" data-align="left" class="align-btn ${el.textAlign === 'left' ? 'active' : ''}" title="יישור לשמאל"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zM2 10a1 1 0 011-1h8a1 1 0 110 2H3a1 1 0 01-1-1zM2 15a1 1 0 011-1h12a1 1 0 110 2H3a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg></button>
                                <button data-action="align-text" data-align="justify" class="align-btn ${el.textAlign === 'justify' ? 'active' : ''}" title="יישור לשני הצדדים"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg></button>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-1">רב שורה</label>
                            <div class="toggle-controls-group">
                                <button type="button" class="toggle-btn ${el.multiLine ? 'active' : ''}" data-action="toggle-property" data-property="multiLine" title="רב שורה" aria-pressed="${!!el.multiLine}">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M2 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1z" clip-rule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    ${el.multiLine ? `
                    <div>
                        <label class="block text-sm font-medium text-slate-300 mb-1">יישור אנכי</label>
                        <div class="text-align-group">
                            <button data-action="align-vertical-text" data-align="start" class="align-btn ${el.verticalAlign === 'start' ? 'active' : ''}" title="יישור למעלה">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto" viewBox="0 0 20 20" fill="currentColor"><path d="M2 2h16v16H2V2zm2 2v4h12V4H4z" /></svg>
                            </button>
                            <button data-action="align-vertical-text" data-align="center" class="align-btn ${el.verticalAlign === 'center' ? 'active' : ''}" title="יישור לאמצע">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto" viewBox="0 0 20 20" fill="currentColor"><path d="M2 2h16v16H2V2zm2 6v4h12V8H4z" /></svg>
                            </button>
                            <button data-action="align-vertical-text" data-align="end" class="align-btn ${el.verticalAlign === 'end' ? 'active' : ''}" title="יישור למטה">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto" viewBox="0 0 20 20" fill="currentColor"><path d="M2 2h16v16H2V2zm2 10v4h12v-4H4z" /></svg>
                            </button>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    return container;
}

const _createImageEditorControls = (el) => {
    const container = document.createElement('div');
    const buttonText = el.src ? 'ערוך תמונה' : 'הוסף תמונה';
    const buttonAction = el.src ? 'edit-image' : 'add-image';
    container.innerHTML = `
        <div class="space-y-1">
            <div class="accordion-group">
                <button type="button" class="accordion-toggle" aria-expanded="false" aria-controls="dimensions-panel">
                    <span>מידות</span>
                    <svg class="accordion-chevron h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                <div id="dimensions-panel" class="accordion-panel">
                     <div class="flex gap-4 pt-2">
                        <div class="flex-1">${_createSidebarInput('number', 'width', 'רוחב', Math.round(el.width))}</div>
                        <div class="flex-1">${_createSidebarInput('number', 'height', 'גובה', Math.round(el.height))}</div>
                    </div>
                </div>
            </div>
        </div>
        <button data-action="${buttonAction}" class="w-full mt-4 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg">${buttonText}</button>
    `;
    return container;
}

const _createClippingShapeEditorControls = (el) => {
    const container = document.createElement('div');
    container.innerHTML = `
        <div class="flex gap-4 mb-3">
            <div class="flex-1">${_createSidebarInput('number', 'width', 'רוחב', Math.round(el.width))}</div>
            <div class="flex-1">${_createSidebarInput('number', 'height', 'גובה', Math.round(el.height))}</div>
        </div>
        <button data-action="perform-clip" class="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">בצע חיתוך</button>`;
    return container;
}

const _createLayerControls = () => {
    const div = document.createElement('div');
    div.className = "layer-menu-container mt-4 pt-4 border-t border-slate-700";
    div.innerHTML = `
        <button data-action="toggle-layer-menu" class="w-full bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors flex justify-between items-center">
            <span class="flex items-center gap-2"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><rect x="10" y="7" width="10" height="10" rx="1.5" fill="#fb923c"/><rect x="7" y="10" width="10" height="10" rx="1.5" stroke="white" stroke-width="1.5"/></svg><span>סדר</span></span>
            <svg class="dropdown-arrow h-5 w-5 transition-transform" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
        </button>
        <div id="layer-menu" class="layer-menu hidden">
            <button data-action="bring-to-front" class="layer-menu-item"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><rect x="5" y="10" width="10" height="10" rx="1.5" stroke="white" stroke-width="1.5"/><rect x="10" y="5" width="10" height="10" rx="1.5" fill="#fb923c"/></svg><span>הבא לחזית</span></button>
            <button data-action="send-to-back" class="layer-menu-item"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><rect x="10" y="5" width="10" height="10" rx="1.5" fill="#fb923c"/><rect x="5" y="10" width="10" height="10" rx="1.5" stroke="white" stroke-width="1.5"/></svg><span>העבר לרקע</span></button>
            <button data-action="layer-up" class="layer-menu-item"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><rect x="7" y="10" width="10" height="10" rx="1.5" stroke="white" stroke-width="1.5"/><rect x="10" y="7" width="10" height="10" rx="1.5" fill="#fb923c"/></svg><span>הבא קדימה</span></button>
            <button data-action="layer-down" class="layer-menu-item"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><rect x="10" y="7" width="10" height="10" rx="1.5" fill="#fb923c"/><rect x="7" y="10" width="10" height="10" rx="1.5" stroke="white" stroke-width="1.5"/></svg><span>העבר אחורה</span></button>
        </div>`;
    return div;
}

const _createDeleteButton = () => {
    const button = document.createElement('button');
    button.dataset.action = "delete";
    button.className = "w-full mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg";
    button.textContent = "מחק אלמנט";
    return button;
}

const _createEditorHeaderFragment = (el) => {
    const fragment = document.createDocumentFragment();
    const typeNameMap = { 'text': 'טקסט', 'image': 'תמונה', 'clipping-shape': 'צורת חיתוך' };
    const typeName = typeNameMap[el.type] || 'אלמנט';
    const headerWrapper = document.createElement('div');
    headerWrapper.className = "mb-4 pb-4 border-b border-slate-700";
    headerWrapper.appendChild(_createSidebarHeader(`עריכת ${typeName}`));
    if (el.type !== 'clipping-shape') {
        const idEditorDiv = document.createElement('div');
        idEditorDiv.className = "mt-4";
        idEditorDiv.innerHTML = `
            <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">ID של האלמנט</label>
                <input type="text" data-property="id" value="${el.id}" class="w-full bg-slate-700 border border-slate-600 text-white rounded-md p-2" style="text-align: left; direction: ltr;" />
            </div>`;
        headerWrapper.appendChild(idEditorDiv);
    }
    fragment.appendChild(headerWrapper);
    return fragment;
};

const _createEditorControlsFragment = (el) => {
    const fragment = document.createDocumentFragment();
    if (el.type === 'text') fragment.appendChild(_createTextEditorControls(el));
    else if (el.type === 'image') fragment.appendChild(_createImageEditorControls(el));
    else if (el.type === 'clipping-shape') fragment.appendChild(_createClippingShapeEditorControls(el));
    
    if (el.type !== 'clipping-shape') {
         fragment.appendChild(_createLayerControls());
         fragment.appendChild(_createDeleteButton());
    }
    return fragment;
};


// --- Cover Element Renderers (Exported) ---

const _createTransformHandles = () => {
    const fragment = document.createDocumentFragment();
    const handles = [
        { type: 'rotation', action: 'rotate', classes: 'rotation-handle' },
        ...['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'].map(dir => ({ type: 'resize', action: 'resize', classes: `resize-handle ${dir}`, direction: dir }))
    ];
    handles.forEach(({ action, classes, direction }) => {
        const handle = document.createElement('div');
        handle.className = classes;
        handle.dataset.action = action;
        if (direction) handle.dataset.direction = direction;
        fragment.appendChild(handle);
    });
    return fragment;
};

const _applyTextStyles = (domEl, el, scale) => {
    const backgroundElement = document.createElement('div');
    const bgColorWithOpacity = _hexToRgba(el.bgColor, el.bgColorOpacity ?? 1);

    const verticalAlignMap = { start: 'flex-start', center: 'center', end: 'flex-end' };
    const verticalJustify = el.multiLine ? (verticalAlignMap[el.verticalAlign] || 'center') : 'center';

    Object.assign(backgroundElement.style, {
        width: '100%', height: '100%',
        backgroundColor: bgColorWithOpacity,
        padding: el.padding || '0px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: verticalJustify
    });
    
    switch (el.shape) {
        case 'rounded-rectangle': backgroundElement.style.borderRadius = '25px'; break;
        case 'ellipse': backgroundElement.style.borderRadius = '50%'; break;
        case 'star': backgroundElement.style.clipPath = 'polygon(50% 0%, 59% 21%, 79% 10%, 74% 32%, 98% 35%, 80% 50%, 98% 65%, 74% 68%, 79% 90%, 59% 79%, 50% 100%, 41% 79%, 21% 90%, 26% 68%, 2% 65%, 20% 50%, 2% 35%, 26% 32%, 21% 10%, 41% 21%)'; break;
        default: backgroundElement.style.borderRadius = '0px'; break;
    }
    const textWrapper = document.createElement('div');
    textWrapper.dataset.role = 'text-content';
    textWrapper.innerText = el.multiLine ? el.text : el.text.replace(/(\r\n|\n|\r)/gm, " ");
    const font = FONTS.find(f => f.family === el.fontFamily);
    const fontClassName = font ? font.className : 'font-heebo';
    textWrapper.className = fontClassName;
    const baseStyles = { color: el.color, fontSize: `${el.fontSize * scale}px`, fontWeight: el.fontWeight, textShadow: el.shadow ? '2px 2px 4px rgba(0,0,0,0.7)' : 'none', textAlign: el.textAlign || 'center', width: '100%', letterSpacing: `${el.letterSpacing || 0}px`, lineHeight: el.lineHeight || 1.2 };
    if (el.multiLine) {
        Object.assign(textWrapper.style, baseStyles, { whiteSpace: 'pre-wrap', overflow: 'hidden', wordBreak: 'break-word' });
    } else {
        const justifyContentMap = { left: 'flex-end', center: 'center', right: 'flex-start' };
        Object.assign(textWrapper.style, baseStyles, { display: 'flex', justifyContent: justifyContentMap[el.textAlign] || 'center', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden' });
    }
    backgroundElement.appendChild(textWrapper);
    domEl.appendChild(backgroundElement);
};

const _applyImageStyles = (domEl, el) => {
    Object.assign(domEl.style, { display: 'flex', justifyContent: 'center', alignItems: 'center' });
    if (el.src) {
        const img = document.createElement('img');
        img.crossOrigin = "Anonymous";
        img.src = el.src;
        img.className = 'w-full h-full object-cover pointer-events-none';
        domEl.appendChild(img);
    } else {
        domEl.className += ' bg-slate-600 text-slate-400 cursor-pointer flex-col';
        domEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mb-2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg><span class="text-sm pointer-events-none">הוסף תמונה</span>`;
    }
};

export function renderCoverElement(el, state, scale = 1, zIndex) {
    const domEl = document.createElement('div');
    domEl.dataset.id = el.id;
    domEl.className = 'draggable editable';
    Object.assign(domEl.style, {
        left: `${el.position.x * scale}px`, top: `${el.position.y * scale}px`,
        width: el.width ? `${el.width * scale}px` : 'auto', height: el.height ? `${el.height * scale}px` : 'auto',
        transform: `rotate(${el.rotation}deg)`, zIndex: el.type === 'clipping-shape' ? 999 : zIndex,
    });
    if (el.id === state.selectedElementId && scale === 1) domEl.classList.add('selected');
    if (el.type === 'text') _applyTextStyles(domEl, el, scale);
    else if (el.type === 'image') {
        domEl.classList.add('element-type-image'); 
        _applyImageStyles(domEl, el);
        if (el.cropData && el.cropData.frameData) {
            const frame = el.cropData.frameData;
            if (frame.width > 0 && frame.style !== 'none') {
                const frameOverlay = document.createElement('div');
                Object.assign(frameOverlay.style, {
                    position: 'absolute',
                    top: '0',
                    left: '0',
                    width: '100%',
                    height: '100%',
                    border: `${frame.width * scale}px ${frame.style} ${frame.color}`,
                    pointerEvents: 'none'
                });
                domEl.appendChild(frameOverlay);
            }
        }
    }
    else if (el.type === 'clipping-shape') {
        domEl.classList.add('clipping-shape');
        const instructionText = document.createElement('div');
        instructionText.className = 'clipping-shape-instructions';
        instructionText.textContent = 'מקם את האליפסה מעל ראש הדמות, כדי לחתוך את הכותרת שמסתירה.';
        domEl.appendChild(instructionText);
    }
    if (el.id === state.selectedElementId && scale === 1) domEl.appendChild(_createTransformHandles());
    return domEl;
}

export function renderSidebar(selectedEl, sidebarEditorHeader, sidebarContent, templateActions, bottomActions) {
    sidebarEditorHeader.innerHTML = '';
    sidebarContent.innerHTML = '';

    if (selectedEl) {
        sidebarEditorHeader.appendChild(_createEditorHeaderFragment(selectedEl));
        sidebarContent.appendChild(_createEditorControlsFragment(selectedEl));
        
        sidebarEditorHeader.classList.remove('hidden');
        sidebarContent.classList.remove('hidden');
        templateActions.classList.add('hidden');
        if (bottomActions) {
            bottomActions.classList.add('hidden');
        }
    } else {
        sidebarEditorHeader.classList.add('hidden');
        sidebarContent.classList.add('hidden');
        templateActions.classList.remove('hidden');
        if (bottomActions) {
            bottomActions.classList.remove('hidden');
        }
    }
}
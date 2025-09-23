export async function loadAllTemplates() {
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
        return [...defaultTemplates, ...userTemplates];
    } catch (error) {
        console.error("נכשל בטעינת התבניות:", error);
        return [];
    }
}

export function saveTemplate(state, templates, callback) {
    const name = state.templateName.trim();
    if (!name) { alert('יש להזין שם לתבנית.'); return; }

    const newTemplate = {
        name,
        width: state.coverWidth, height: state.coverHeight,
        backgroundColor: state.backgroundColor,
        elements: state.elements,
    };

    let userTemplates = JSON.parse(localStorage.getItem('userTemplates')) || [];
    const existingIndex = userTemplates.findIndex(t => t.name === name);
    if (existingIndex > -1) userTemplates[existingIndex] = newTemplate;
    else userTemplates.push(newTemplate);

    localStorage.setItem('userTemplates', JSON.stringify(userTemplates));
    alert(`התבנית "${name}" נשמרה בהצלחה!`);
    callback();
}

export function exportTemplate(state) {
    const name = state.templateName.trim() || 'Untitled Template';
    const templateObject = {
        name, width: state.coverWidth, height: state.coverHeight,
        backgroundColor: state.backgroundColor,
        elements: state.elements,
    };

    const blob = new Blob([JSON.stringify(templateObject, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/ /g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export async function exportImage(button, coverBoundary, state) {
    const originalButtonHTML = button.innerHTML;
    button.innerHTML = `
        <svg class="animate-spin h-5 w-5 -ml-1 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>מעבד...</span>`;
    button.disabled = true;
    button.classList.add('flex', 'items-center', 'justify-center');

    const selectedElDOM = coverBoundary.querySelector('.selected');
    if (selectedElDOM) selectedElDOM.classList.remove('selected');

    try {
        const scale = 2;
        const options = {
            width: coverBoundary.offsetWidth * scale,
            height: coverBoundary.offsetHeight * scale,
            style: {
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                width: `${coverBoundary.offsetWidth}px`,
                height: `${coverBoundary.offsetHeight}px`
            },
            bgcolor: state.backgroundColor,
            cacheBust: true
        };
        
        const dataUrl = await domtoimage.toPng(coverBoundary, options);

        const a = document.createElement('a');
        a.href = dataUrl;
        const fileName = state.templateName.trim().replace(/ /g, '_') || 'magazine-cover';
        a.download = `${fileName}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

    } catch (error) {
        console.error('Error exporting image:', error);
        alert('שגיאה בשמירת התמונה.');
    } finally {
        if (selectedElDOM) selectedElDOM.classList.add('selected');
        button.innerHTML = originalButtonHTML;
        button.disabled = false;
        button.classList.remove('flex', 'items-center', 'justify-center');
    }
}
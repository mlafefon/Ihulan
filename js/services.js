import { getGoogleFontsUrl } from './fonts.js';

export async function loadAllTemplates() {
    try {
        const manifestResponse = await fetch('templates/manifest.json');
        if (!manifestResponse.ok) throw new Error(`שגיאת HTTP! סטטוס: ${manifestResponse.status}`);
        
        const manifest = await manifestResponse.json();
        const templatePromises = manifest.templates.map(url =>
            fetch(`templates/${url}`)
                .then(res => {
                    if (!res.ok) {
                        throw new Error(`שגיאת HTTP! סטטוס: ${res.status}`);
                    }
                    return res.json(); // This can also throw if JSON is invalid
                })
                .catch(error => {
                    console.error(`שגיאה בטעינת תבנית '${url}': ${error.message}. מדלג על תבנית זו.`);
                    return null; // Return null for failed templates
                })
        );
        
        // Promise.all will now resolve with an array containing template objects and nulls
        const results = await Promise.all(templatePromises);
        
        // Filter out the nulls (failed templates)
        const defaultTemplates = results.filter(template => template !== null);
        
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

// Helper to fetch and Base64-encode a resource. This is crucial for embedding fonts.
async function resourceToDataURL(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch resource: ${response.statusText}`);
        }
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error(`Error converting URL to Data URL: ${url}`, error);
        return url; // Fallback to original URL on error
    }
}

// Helper to find all font URLs in a CSS file and replace them with embedded Base64 data.
async function embedFontsInCss(cssText) {
    // Regex to find font URLs, handling optional quotes.
    const fontUrlRegex = /url\((['"]?)(https:\/\/fonts\.gstatic\.com\/[^'"]+)\1\)/g;
    
    const urlMatches = [...cssText.matchAll(fontUrlRegex)];
    if (urlMatches.length === 0) return cssText;

    const urlsToFetch = urlMatches.map(match => match[2]);
    
    const dataURLs = await Promise.all(urlsToFetch.map(url => resourceToDataURL(url)));
    
    let embeddedCss = cssText;
    urlMatches.forEach((match, index) => {
        // Replace the full `url(...)` with the new data URL version
        embeddedCss = embeddedCss.replace(match[0], `url(${dataURLs[index]})`);
    });

    return embeddedCss;
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
        const originalFontCSS = await fetch(getGoogleFontsUrl()).then(res => res.text());
        const embeddedFontCSS = await embedFontsInCss(originalFontCSS);
        
        const options = {
            // Use pixelRatio for better resolution, which is often more stable than manual scaling.
            pixelRatio: 2,
            backgroundColor: state.backgroundColor,
            cacheBust: true,
            fontEmbedCSS: embeddedFontCSS,
        };
        
        // Generate a canvas element first, which can be more robust than direct PNG generation.
        const canvas = await htmlToImage.toCanvas(coverBoundary, options);
        const dataUrl = canvas.toDataURL('image/png', 1.0);

        const a = document.createElement('a');
        a.href = dataUrl;
        const fileName = state.templateName.trim().replace(/ /g, '_') || 'magazine-cover';
        a.download = `${fileName}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

    } catch (error) {
        console.error('Error exporting image:', error);
        alert('שגיאה בשמירת התמונה. ייתכן שיש בעיית רשת בטעינת הגופנים. נסה שוב.');
    } finally {
        if (selectedElDOM) selectedElDOM.classList.add('selected');
        button.innerHTML = originalButtonHTML;
        button.disabled = false;
        button.classList.remove('flex', 'items-center', 'justify-center');
    }
}
// Central configuration for fonts.
// To add a new Google font, add its details to this array.
// The Google Fonts URL and the necessary CSS rules will be generated automatically.
export const FONTS = [
    { name: 'Anton', family: 'Anton', weights: [], className: 'font-anton', fallback: 'sans-serif' },
    { name: 'Heebo', family: 'Heebo', weights: [400, 700, 900], className: 'font-heebo', fallback: 'sans-serif' },
    { name: 'Rubik', family: 'Rubik', weights: [400, 700, 900], className: 'font-rubik', fallback: 'sans-serif' },
    { name: 'Assistant', family: 'Assistant', weights: [400, 700], className: 'font-assistant', fallback: 'sans-serif' },
    { name: 'David Libre', family: 'David Libre', weights: [400, 700], className: 'font-david-libre', fallback: 'serif' },
    { name: 'Frank Ruhl Libre', family: 'Frank Ruhl Libre', weights: [400, 700, 900], className: 'font-frank-ruhl-libre', fallback: 'serif' },
    { name: 'Playpen Sans', family: 'Playpen Sans Hebrew', weights: [400, 800], className: 'font-playpen', fallback: 'cursive' },
    { name: 'Rubik Wet Paint', family: 'Rubik Wet Paint', weights: [400], className: 'font-Rubik-Wet-Paint', fallback: 'system-ui' }
    
];

// Constructs the Google Fonts URL.
export function getGoogleFontsUrl() {
    const baseUrl = 'https://fonts.googleapis.com/css2?';
    const families = FONTS.map(font => {
        const family = font.family.replace(/ /g, '+');
        const weights = font.weights.length > 0 ? `:wght@${font.weights.join(';')}` : '';
        return `family=${family}${weights}`;
    }).join('&');

    return `${baseUrl}${families}&display=swap`;
}

// Dynamically creates and appends the Google Fonts <link> tag to the <head>.
export function loadGoogleFonts() {
    const finalUrl = getGoogleFontsUrl();
    
    const preconnectLink1 = document.createElement('link');
    preconnectLink1.rel = 'preconnect';
    preconnectLink1.href = 'https://fonts.googleapis.com';
    
    const preconnectLink2 = document.createElement('link');
    preconnectLink2.rel = 'preconnect';
    preconnectLink2.href = 'https://fonts.gstatic.com';
    preconnectLink2.crossOrigin = 'anonymous';

    const stylesheetLink = document.createElement('link');
    stylesheetLink.rel = 'stylesheet';
    stylesheetLink.href = finalUrl;

    document.head.appendChild(preconnectLink1);
    document.head.appendChild(preconnectLink2);
    document.head.appendChild(stylesheetLink);
}

// Dynamically creates and injects font-family CSS rules into the <head>.
export function injectFontStyles() {
    const styleElement = document.createElement('style');
    let cssRules = '';

    FONTS.forEach(font => {
        cssRules += `.${font.className} { font-family: '${font.family}', ${font.fallback}; }\n`;
    });

    styleElement.textContent = cssRules;
    document.head.appendChild(styleElement);
}
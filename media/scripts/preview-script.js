
/* ************************************************************************ 
 * Script added to the VS Code Preview HTML Document.
 * These handle events and interactions between VS Code and the Webview
 * ************************************************************************/

// Listens to scroll events from the extension
window.addEventListener('message', event => {

    type = event.data.type;

    switch (type) {
        // scroll: Jumps to the page with the corresponding root-id in the preview.
        case 'scroll':
            const page = event.data.page;
            const mode = event.data.mode;
            console.debug("Hombrewery: Scrolling preview to page " + page);
            el = document.querySelector('[root-id="' + page + '"]');
            if (el) {
                el.scrollIntoView({
                    behavior: mode,
                    block: 'start',
                    inline: 'start'
                });
            }
            break;
        // layout: switches the layout to single page, two-pages or flow.
        case 'layout':
            const layout = event.data.layout;
            el = document.getElementById('pagesContainer');
            el.className = 'pages ' + layout;
            break;

        // zoom: changes the preview zoom level. 
        case 'zoom':
            const zoomLevel = event.data.zoomLevel;
            el = document.getElementById('pagesContainer');
            el.style.zoom = zoomLevel + '%';
            break;
        // updateBody: update the page body without reloading the whole document
        case 'updateBody':
            const html = event.data.html;
            document.getElementById("pagesContainer").innerHTML = html;
            break;
        // updateInlineStyles: Updates the script with id=inline_styles to apply inline CSS while editing.
        case 'updateInlineStyles':
            const inlineStyles = event.data.inlineStyles;
            el = document.getElementById('inline_styles');
            el.textContent = inlineStyles;
            break;
        // updateThemeStyles: Updates the script with id=base_theme_styles and id=theme_styles to apply theme CSS.
        case 'updateThemeStyles':
            const themeStyles = event.data.themeStyles;
            el = document.getElementById('base_theme_styles');
            el.textContent = themeStyles[0];
            el = document.getElementById('theme_styles');
            el.textContent = themeStyles[1];
            break;
        // updateLanguage: Update the lang property of the id=pageContainer element whtn the language metadata changes.
        case 'updateLanguage':
            const language = event.data.language;
            el = document.getElementById('pagesContainer');
            el.lang = language;
            break;
    }
});


const vscode = acquireVsCodeApi();

// Detect a click and send the corresponding root-id number to VS Code. The markdown editor scrolls to that page.
document.addEventListener('click', (event) => {
    // Find the closest ancestor with class "page"
    let pageElement = event.target;
    while (pageElement && pageElement !== document.body && !pageElement.classList?.contains('page')) {
        pageElement = pageElement.parentElement;
    }
    if (!pageElement || pageElement === document.body) return;

    // If it doesn't have root-page, look backwards through preceding siblings
    if (!pageElement.hasAttribute('root-id')) {
        let sibling = pageElement.previousElementSibling;
        while (sibling) {
            if (sibling.classList.contains('page') && sibling.hasAttribute('root-id')) {
                pageElement = sibling;
                break;
            }
            sibling = sibling.previousElementSibling;
        }
    }

    if (pageElement.hasAttribute('root-id')) {
        const pageNumber = parseInt(pageElement.getAttribute('root-id'), 10);
        if (!isNaN(pageNumber)) {
            console.debug("Hombrewery: Scrolling Editor to page " + pageNumber);
            vscode.postMessage({
                type: 'goToPage',
                page: pageNumber
            });
        }
    }
});
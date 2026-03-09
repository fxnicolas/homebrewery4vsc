
/* ************************************************************************ 
 * Script added to the VS Code Preview HTML Document.
 * These handle events and interactions between VS Code and the Webview
 * ************************************************************************/

// Listens to scroll events from the extension
window.addEventListener('message', event => {

    type = event.data.type;

    switch (type) {
        // scroll: Jumps to the corresponding page in the preview.
        case 'scroll':
            const page = event.data.page;
            const mode = event.data.mode;
            anchor = "p" + page;
            el = document.getElementById(anchor);
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
        // updateInlineStyles: Updates the script with id=inline_styles to apply inkine CSS while editing.
        case 'updateInlineStyles':
            const inlineStyles = event.data.inlineStyles;
            el = document.getElementById('inline_styles');
            el.textContent = inlineStyles;
            break;
    }
});


const vscode = acquireVsCodeApi();

// Detect a click and send the corresponding page number to VS Code. The markdown editor scrolls to that page.
document.addEventListener('click', (event) => {
    let el = event.target;
    while (el && el !== document.body) {
        if (el.classList?.contains('page')) {
            const id = el.id; // e.g. "page-12"
            const match = id.match(/\d+/);
            if (match) {
                const pageNumber = parseInt(match[0], 10);
                vscode.postMessage({
                    type: 'goToPage',
                    page: pageNumber
                });
            }
            break;
        }
        el = el.parentElement;
    }
});
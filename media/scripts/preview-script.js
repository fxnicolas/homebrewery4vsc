
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
            const { type, page, mode } = event.data;
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
            const { layout } = event.data;
            el = document.getElementById('pagesContainer');
            el.className = 'pages ' + layout;
            break;

        // zoom: changes the preview zoom level. 
        case 'zoom':
            const { zoomLevel } = event.data;
            el = document.getElementById('pagesContainer');
            el.style.zoom = zoomLevel + '%';
            break;
        // update: update the page body without reloading the whole document
        case 'update':
            console.log("Update event " + event);
            const html = event.data.html;
            document.getElementById("pagesContainer").innerHTML = html;
    }
});


const vscode = acquireVsCodeApi();

// Detect a click and send the corresponding page number to VS Code. The markdown editor scrolls to that page.
document.addEventListener('click', (event) => {
    // console.log("Click Event on " + event.target);
    let el = event.target;
    while (el && el !== document.body) {
        if (el.classList?.contains('page')) {
            const id = el.id; // e.g. "page-12"
            const match = id.match(/\d+/);
            if (match) {
                const pageNumber = parseInt(match[0], 10);
                // console.log("Jumping to page" + pageNumber);
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


/* console.log("Ready to Register Events");
const scroller = document.scrollingElement;

// Restore scroll position when page re-loads
document.addEventListener('load', () => {
    console.log("Registering scroll restore.");
    const state = vscode.getState();
    if (state?.scrollY) {
        console.log("Restoring ScrollY State:", state ? scrollY : "");
        const scroller = document.scrollingElement;
        requestAnimationFrame(() => {
            scroller.scrollTo(0, state.scrollY);
        });
    }
});

// Store scroll position when webview scrolls.
document.addEventListener('DOMContentLoaded', () => {
    console.log("Registering scroll capture:", scroller);
    scroller.addEventListener('scroll', () => {
        const scroller = document.scrollingElement;
        console.log("Saving ScrollY State:", scroller.scrollTop);
        vscode.setState({ scrollY: scroller.scrollTop });
    });
}); */
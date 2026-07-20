// Interactive Brews - Scripts

function refreshInteractiveComponents() {

    // Random Table (hb-random-table)

    document.querySelectorAll('.hb-random-table').forEach(container => {
        const table = container.querySelector('table');
        if (!table) return;
    
        const getRows = () => [...table.querySelectorAll('tbody tr')];
    
        // Left-click: roll and highlight a random row
        container.addEventListener('click', () => {
            const rows = getRows();
            if (rows.length === 0) return;
    
            rows.forEach(row => row.classList.remove('hb-row-selected'));
    
            const chosen = rows[Math.floor(Math.random() * rows.length)];
            chosen.classList.add('hb-row-selected');
        });
    
        // Right-click: reset, no highlights
        container.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // suppress the browser's context menu
            getRows().forEach(row => row.classList.remove('hb-row-selected'));
        });
    });

    // Rollable Die  (hb-rollable)
    document.querySelectorAll('i.df.hb-rollable').forEach(el => {
        el.addEventListener('click', e => rollDie(e.currentTarget));
    });


    // Status Conditions (hb-condition)
    document.querySelectorAll('span.hb-condition').forEach(el => {
        let index = 0;

        applyCondition(el, CONDITIONS[index]);

        el.addEventListener('click', () => {
            index = (index + 1) % CONDITIONS.length;
            applyCondition(el, CONDITIONS[index]);
        });

        el.addEventListener('contextmenu', e => {
            e.preventDefault();
            index = (index - 1 + CONDITIONS.length) % CONDITIONS.length;
            applyCondition(el, CONDITIONS[index]);
        });
    });

    // Notes (hb-notes)
    document.querySelectorAll('span.hb-notes').forEach(el => {
        el.setAttribute('contenteditable', "true");
    });

    // Counters (hb-counter)
    document.querySelectorAll('span.hb-counter').forEach(el => {
        el.setAttribute('tooltip', COUNTER_TOOLTIP);

        el.addEventListener('click', e => {
            el.textContent = parseInt(el.textContent) - 1;
        });

        el.addEventListener('contextmenu', e => {
            e.preventDefault();
            el.textContent = parseInt(el.textContent) + 1;
        });
    });

    // Rollable Formulas
    document.querySelectorAll('span.hb-roll').forEach(el => {
        const original = el.textContent.trim();

        el.setAttribute('tooltip', 'Click to Roll | Right-click to Reset');

        el.addEventListener('click', () => {
            const result = parseAndRoll(original);
            el.textContent = result;
            el.setAttribute('tooltip', `${original} → ${result} | Right-click to Reset`);
        });

        el.addEventListener('contextmenu', e => {
            e.preventDefault();
            el.textContent = original;
            el.setAttribute('tooltip', 'Click to Roll | Right-click to Reset');
        });
    });

}

function rollDie(element) {
    // Roll a Dice (hb-rollable)
    if (!element.classList.contains('df')) return;
    if (element.classList.contains('hb-rolling')) return;

    const dieMatch = [...element.classList].find(c => /^d\d+-\d+$/.test(c));
    if (!dieMatch) return;

    const [, faces] = dieMatch.match(/^d(\d+)-\d+$/);
    const validFaces = [4, 6, 8, 10, 12, 20, 100];
    if (!validFaces.includes(Number(faces))) return;

    const roll = Math.floor(Math.random() * Number(faces)) + 1;
    const result = Number(faces) === 100
        ? (roll === 100 ? '00' : String(roll).padStart(2, '0'))
        : roll;

    element.classList.add(`hb-rolling`);
    let ticks = 0;
    const maxTicks = 4;
    const tickDuration = 120;

    const interval = setInterval(() => {
        ticks++;

        if (ticks >= maxTicks) {
            clearInterval(interval);
            element.classList.remove(...[...element.classList].filter(c => /^d\d+-/.test(c)));
            element.classList.add(`d${faces}-${result}`);
            element.classList.remove('hb-rolling');
        } else {
            const fake = Math.floor(Math.random() * Number(faces)) + 1;
            const fakeResult = Number(faces) === 100
                ? (fake === 100 ? '00' : String(fake).padStart(2, '0'))
                : fake;
            element.classList.remove(...[...element.classList].filter(c => /^d\d+-/.test(c)));
            element.classList.add(`d${faces}-${fakeResult}`);
        }
    }, tickDuration);

}


// Status Rotation
const CONDITIONS = [
    { name: 'None', icon: null, tooltip: 'No condition.' },
    { name: 'Blinded', icon: 'blinded', tooltip: "Can't see. Auto-fails sight checks. Attack rolls against have advantage, its attacks have disadvantage." },
    { name: 'Charmed', icon: 'charmed', tooltip: "Can't attack the charmer. Charmer has advantage on social ability checks against it." },
    { name: 'Deafened', icon: 'deafened', tooltip: "Can't hear. Auto-fails hearing checks." },
    { name: 'Exhausted', icon: 'exhausted', tooltip: 'Lvl 1: disadv. checks. Lvl 2: speed halved. Lvl 3: disadv. attacks/saves. Lvl 4: HP max halved. Lvl 5: speed 0. Lvl 6: Death.' },
    { name: 'Frightened', icon: 'frightened', tooltip: "Disadvantage on checks and attacks while source of fear is in sight. Can't move closer to the source." },
    { name: 'Grappled', icon: 'grappled', tooltip: 'Speed becomes 0. Ends if grappler is incapacitated or creature is moved out of reach.' },
    { name: 'Incapacitated', icon: 'incapacitated', tooltip: "Can't take actions or reactions." },
    { name: 'Invisible', icon: 'invisible', tooltip: 'Impossible to see without magic. Attack rolls against have disadvantage, its attacks have advantage.' },
    { name: 'Paralyzed', icon: 'paralyzed', tooltip: "Turned to stone. Incapacitated, can't move or speak. Auto-fails STR/DEX saves. Attacks against have advantage. Hits within 5ft are critical." },
    { name: 'Petrified', icon: 'petrified', tooltip: 'Turned to stone. Incapacitated, unaware of surroundings. Resistance to all damage. Immune to poison and disease.' },
    { name: 'Poisoned', icon: 'poisoned', tooltip: 'Disadvantage on attack rolls and ability checks.' },
    { name: 'Prone', icon: 'prone', tooltip: 'Can only crawl unless standing up. Disadvantage on attacks. Attacks against have advantage if attacker is within 5ft.' },
    { name: 'Restrained', icon: 'restrained', tooltip: 'Speed becomes 0. Attacks against have advantage, its attacks have disadvantage. Disadvantage on DEX saves.' },
    { name: 'Stunned', icon: 'stunned', tooltip: "Incapacitated, can't move, speaks only falteringly. Auto-fails STR/DEX saves. Attacks against have advantage." },
    { name: 'Unconscious', icon: 'unconscious', tooltip: "Incapacitated, can't move or speak, unaware of surroundings. Drops held items, falls prone. Hits within 5ft are critical." },
];

function applyCondition(el, condition) {
    el.setAttribute('tooltip', condition.tooltip);

    const icon = condition.icon
        ? `<i class="ei ${condition.icon}"></i> `
        : '';
    el.innerHTML = `${icon}${condition.name}`;
}


// Counters Events
const COUNTER_TOOLTIP = "Click to reduce, right-click to increase."

// Rollable Formulas

function parseAndRoll(expression) {
    // Special case: bare bonus like "+3" or "-2" → d20+bonus
    if (/^[+-]\d+$/.test(expression.trim())) {
        expression = `1d20${expression.trim()}`;
    }

    // Match all dice groups (e.g. 2d10, 1d4) and flat bonuses (e.g. +5, -3)
    const diceRegex = /(\d*)d(\d+)|([+-]?\d+)/gi;
    let total = 0;
    let match;

    while ((match = diceRegex.exec(expression)) !== null) {
        if (match[2]) {
            // Dice group: NdM
            const count = parseInt(match[1] || '1');
            const faces = parseInt(match[2]);
            for (let i = 0; i < count; i++) {
                total += Math.floor(Math.random() * faces) + 1;
            }
        } else if (match[3]) {
            // Flat bonus/malus
            total += parseInt(match[3]);
        }
    }

    return total;
}


// Save and load session state

function compute_tag() {
    if (window.location.hash) {
        return window.location.hash.slice(1,);
    } else {
        return window.location.search.slice(1,);
    }
}

function check_session(tag) {
    return localStorage.getItem(tag) != null;
}

function save_session(tag) {
    var editElem = document.getElementsByClassName("hb-save");
    var edits = [];
    for (var i = 0; i < editElem.length; i++) {
        edits.push(editElem[i].innerHTML);
    }
    localStorage.setItem(tag, edits.join('&666&'));
    show_status("Session Saved.");
}
function restore_session(tag) {
    if (localStorage.getItem(tag) != null) {
        const edits = localStorage.getItem(tag).split('&666&');
        var editElem = document.getElementsByClassName("hb-save");
        console.log(edits, edits.length, editElem.length);
        for (var i = 0; i < edits.length; i++) {
            editElem[i].innerHTML = edits[i];
        }
        console.log("Session Restored.");
        show_status("Session Restored.");
    } else {
        console.log("No Session found.");
        show_status("No Session found.");
    }
}

function reset_session(tag) {
    localStorage.removeItem(tag);
    console.log("Session Reset, reloading page...");
    show_status("Session Reset, reloading page...");
    window.location.reload();
}

const toolbar = document.createElement('div');
toolbar.innerHTML = `
  <div class="block hb-toolbar" style="position:fixed;">
    <p>
      <button id="hb-save-session" title="Save session state."><i class="fas fa-download"></i></button>
      <button id="hb-restore-session" title="Restore session state."><i class="fas fa-upload"></i></button>
      <button id="hb-reset-session" title="Reset session state."><i class="fas fa-trash-can"></i></button>
    </p>
  </div>
`;
document.body.appendChild(toolbar.firstElementChild);

document.getElementById("hb-save-session").addEventListener('click', function () {
    save_session(compute_tag());
})
document.getElementById("hb-restore-session").addEventListener('click', function () {
    restore_session(compute_tag());
})
document.getElementById("hb-reset-session").addEventListener('click', function () {
    reset_session(compute_tag());
})

/* Toaster */

const statusbar = document.createElement('div');
statusbar.innerHTML = `
  <div style="display: none;" id="hb-status" class="hb-status">Default Status</div>
`;
document.body.appendChild(statusbar.firstElementChild);

function show_status(msg) {
    var el = document.getElementById("hb-status");
    el.innerHTML = msg;
    el.style.display = 'inline';
    hide_status();
}
var timers = [];
function hide_status() {
    for (var i = 0; i < timers.length; i++) {
        clearTimeout(timers[i]);
    }
    var el = document.getElementById("hb-status");
    el.style.opacity = 1;
    for (var i = 0; i < 60; i++) {
        timers.push(setTimeout(function () { el.style.opacity -= 0.02; }, i * 60));
    }
}

if (check_session(compute_tag())) {
    show_status("Previous session found. Click above to restore it.");
}


// Activate or Refresh all interactive compoennts
refreshInteractiveComponents();
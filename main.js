"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const codemirror_1 = require("codemirror");
const language_1 = require("@codemirror/language");
const view_1 = require("@codemirror/view");
const codemirror_theme_dracula_1 = require("@uiw/codemirror-theme-dracula");
const lang_python_1 = require("@codemirror/lang-python");
const ansi_to_html_1 = __importDefault(require("ansi-to-html"));
require("./run_code.css");
function getUrl(filename, query) {
    const srcEl = document.querySelector('script[src*="run_code_main.js"]');
    if (srcEl) {
        const url = new URL(srcEl.src);
        url.search = '';
        // remove the filename from the pathname
        url.pathname = url.pathname.replace(/[^/]+$/, '');
        url.pathname += filename;
        if (query) {
            url.search = '?' + query.toString();
        }
        return url.toString();
    }
    else {
        throw new Error('could not find script tag for `run_code_main.js`.');
    }
}
function load_css() {
    return new Promise((resolve) => {
        const head = document.head;
        const link = document.createElement('link');
        link.type = 'text/css';
        link.rel = 'stylesheet';
        link.href = getUrl('run_code.css');
        head.appendChild(link);
        link.addEventListener('load', () => resolve());
    });
}
function startWorker() {
    const query_args = new URLSearchParams(location.search);
    query_args.set('ts', Date.now().toString());
    return new Worker(getUrl('run_code_worker.js', query_args));
}
const worker = startWorker();
const ansi_converter = new ansi_to_html_1.default();
const decoder = new TextDecoder();
async function main() {
    await load_css();
    window.code_blocks = [];
    document.querySelectorAll('.language-py').forEach((block) => {
        window.code_blocks.push(new CodeBlock(block));
    });
}
main();
class CodeBlock {
    block;
    terminal_output = '';
    code_html = '';
    output_el = null;
    resetBtn;
    preEl;
    codeEl;
    onMessage;
    active = false;
    constructor(block) {
        this.block = block;
        const pre = block.querySelector('pre');
        const playBtn = document.createElement('button');
        playBtn.className = 'run-code-btn play-btn';
        playBtn.addEventListener('click', this.run.bind(this));
        pre.appendChild(playBtn);
        this.resetBtn = document.createElement('button');
        this.resetBtn.className = 'run-code-btn reset-btn run-code-hidden';
        this.resetBtn.addEventListener('click', this.reset.bind(this));
        pre.appendChild(this.resetBtn);
        const preEl = block.querySelector('pre');
        if (!preEl) {
            throw new Error('could not find `pre` element in code block');
        }
        this.preEl = preEl;
        const codeEl = preEl.querySelector('code');
        if (!codeEl) {
            throw new Error('could not find `code` element in code block `pre`');
        }
        this.codeEl = codeEl;
        this.onMessage = this.onMessageMethod.bind(this);
    }
    run() {
        const cmElement = this.block.querySelector('.cm-content');
        let python_code;
        if (cmElement) {
            const view = cmElement.cmView.view;
            python_code = view.state.doc.toString();
        }
        else {
            this.preEl.classList.add('hide-code');
            python_code = this.codeEl.innerText;
            this.code_html = this.codeEl.innerHTML;
            this.codeEl.classList.add('hide-code');
            this.codeEl.innerText = '';
            const extensions = [
                codemirror_1.minimalSetup,
                (0, view_1.lineNumbers)(),
                (0, lang_python_1.python)(),
                language_1.indentUnit.of('    '),
            ];
            const back = parseInt(window.getComputedStyle(this.codeEl).backgroundColor.match(/\d+/g)[0]);
            if (back < 128) {
                extensions.push(codemirror_theme_dracula_1.dracula);
            }
            new codemirror_1.EditorView({
                extensions,
                parent: this.block,
                doc: python_code,
            });
        }
        this.resetBtn.classList.remove('run-code-hidden');
        this.terminal_output = '';
        this.output_el = this.block.querySelector('.run-code-output');
        if (!this.output_el) {
            const output_div = document.createElement('div');
            output_div.className = 'highlight output-parent';
            output_div.innerHTML = `
      <span class="filename run-code-title">Output</span>
      <pre id="__code_0"><code class="run-code-output"></code></pre>
      `;
            this.block.appendChild(output_div);
            this.output_el = this.block.querySelector('.run-code-output');
        }
        this.output_el.innerText = 'Starting Python and installing dependencies...';
        python_code = python_code.replace(new RegExp(`^ {8}`, 'gm'), '');
        if (!this.active) {
            worker.addEventListener('message', this.onMessage);
            this.active = true;
        }
        // reset other code blocks
        for (const block of window.code_blocks) {
            if (block != this) {
                if (block.active) {
                    block.reset();
                }
            }
        }
        worker.postMessage(python_code);
    }
    reset() {
        const cmElement = this.block.querySelector('.cm-editor');
        if (cmElement) {
            cmElement.remove();
        }
        const output_parent = this.block.querySelector('.output-parent');
        if (output_parent) {
            output_parent.remove();
        }
        this.preEl.classList.remove('hide-code');
        this.codeEl.innerHTML = this.code_html;
        this.codeEl.classList.remove('hide-code');
        this.resetBtn.classList.add('run-code-hidden');
        if (this.active) {
            worker.removeEventListener('message', this.onMessage);
            this.active = false;
        }
    }
    onMessageMethod({ data }) {
        if (typeof data == 'string') {
            this.terminal_output += data;
        }
        else {
            for (const chunk of data) {
                const arr = new Uint8Array(chunk);
                const extra = decoder.decode(arr);
                this.terminal_output += extra;
            }
        }
        const output_el = this.output_el;
        if (output_el) {
            output_el.innerHTML = ansi_converter.toHtml(this.terminal_output);
            // scrolls to the bottom of the div
            output_el.scrollIntoView(false);
        }
    }
}
//# sourceMappingURL=main.js.map
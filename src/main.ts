import { EditorView, minimalSetup } from 'codemirror'
import { indentUnit } from '@codemirror/language'
import { lineNumbers } from '@codemirror/view'
import { dracula } from '@uiw/codemirror-theme-dracula'
import { python } from '@codemirror/lang-python'
import Convert from 'ansi-to-html'
import { runCode } from './run_python'
import './run_code.css'

function getUrl(filename: string, query?: URLSearchParams): string {
  const srcEl: HTMLScriptElement | null = document.querySelector(
    'script[src*="run_code_main.js"]',
  )
  if (srcEl) {
    const url = new URL(srcEl.src)
    url.search = ''
    // remove the filename from the pathname
    url.pathname = url.pathname.replace('run_code_main.js', '')
    url.pathname += filename
    if (query) {
      url.search = '?' + query.toString()
    }
    return url.toString()
  } else {
    throw new Error('could not find script tag for `run_code_main.js`.')
  }
}

function load_css(): Promise<void> {
  return new Promise((resolve) => {
    const head = document.head
    const link = document.createElement('link')
    link.type = 'text/css'
    link.rel = 'stylesheet'
    link.href = getUrl('run_code_main.css')
    head.appendChild(link)
    link.addEventListener('load', () => resolve())
  })
}

const ansi_converter = new Convert()

declare global {
  interface Window {
    code_blocks: CodeBlock[]
    mkdocs_run_deps?: string[]
  }
}

async function main() {
  await load_css()
  window.code_blocks = []
  document.querySelectorAll('.language-py').forEach((block) => {
    window.code_blocks.push(new CodeBlock(block))
  })
}
main()

class CodeBlock {
  readonly block: Element
  terminal_output = ''
  code_html = ''
  output_el: HTMLElement | null = null
  readonly resetBtn: HTMLElement
  readonly preEl: HTMLElement
  readonly codeEl: HTMLElement
  readonly onMessage: (data: string[]) => void
  active = false

  constructor(block: Element) {
    this.block = block

    const pre = block.querySelector('pre') as HTMLElement

    const playBtn = document.createElement('button')
    playBtn.className = 'run-code-btn play-btn'
    playBtn.title = 'Run code'
    playBtn.addEventListener('click', this.run.bind(this))
    pre.appendChild(playBtn)

    this.resetBtn = document.createElement('button')
    this.resetBtn.className = 'run-code-btn reset-btn run-code-hidden'
    this.resetBtn.title = 'Reset code'
    this.resetBtn.addEventListener('click', this.reset.bind(this))
    pre.appendChild(this.resetBtn)

    const preEl = block.querySelector('pre')
    if (!preEl) {
      throw new Error('could not find `pre` element in code block')
    }
    this.preEl = preEl
    const codeEl = preEl.querySelector('code')
    if (!codeEl) {
      throw new Error('could not find `code` element in code block `pre`')
    }
    this.codeEl = codeEl

    this.onMessage = this.onMessageMethod.bind(this)
  }

  run() {
    const cmElement = this.block.querySelector('.cm-content')
    let python_code
    if (cmElement) {
      const view = (cmElement as any).cmView.view as EditorView
      python_code = view.state.doc.toString()
    } else {
      this.preEl.classList.add('hide-code')
      python_code = this.codeEl.innerText
      this.code_html = this.codeEl.innerHTML
      this.codeEl.classList.add('hide-code')
      this.codeEl.innerText = ''

      const extensions = [
        minimalSetup,
        lineNumbers(),
        python(),
        indentUnit.of('    '),
      ]

      const back = parseInt(
        window.getComputedStyle(this.codeEl).backgroundColor.match(/\d+/g)![0],
      )
      if (back < 128) {
        extensions.push(dracula)
      }

      new EditorView({
        extensions,
        parent: this.block,
        doc: python_code,
      })
    }

    this.resetBtn.classList.remove('run-code-hidden')

    this.terminal_output = ''
    this.output_el = this.block.querySelector('.run-code-output')
    if (!this.output_el) {
      const output_div = document.createElement('div')
      output_div.className = 'highlight output-parent'
      output_div.innerHTML = `
      <span class="filename run-code-title">Output</span>
      <pre id="__code_0"><code class="run-code-output"></code></pre>
      `
      this.block.appendChild(output_div)
      this.output_el = this.block.querySelector(
        '.run-code-output',
      ) as HTMLElement
    }
    this.output_el.innerText = 'Starting Python and installing dependencies...'

    this.active = true

    // reset other code blocks
    for (const block of window.code_blocks) {
      if (block != this) {
        if (block.active) {
          block.reset()
        }
      }
    }

    // for backwards compatibility
    const default_deps = [
      'ssl',
      'sqlite3',
      'httpx',
      'sqlalchemy',
      'sqlakeyset',
      'fastapi',
      'fastapi-pagination',
      'asgi-lifespan',
      'https://githubproxy.samuelcolvin.workers.dev/pydantic/pydantic-core/releases/download/v2.23.4/pydantic_core-2.23.4-cp311-cp311-emscripten_3_1_46_wasm32.whl',
      'https://files.pythonhosted.org/packages/df/e4/ba44652d562cbf0bf320e0f3810206149c8a4e99cdbf66da82e97ab53a15/pydantic-2.9.2-py3-none-any.whl',
    ]
    const scripts = [
      'https://uriyyo.github.io/mkdocs-run-code/patch.py',
      // 'http://localhost:8001/patch.py',
    ]

    const dependencies = window.mkdocs_run_deps || default_deps
    runCode(python_code, this.onMessage, dependencies, scripts)
  }

  reset() {
    const cmElement = this.block.querySelector('.cm-editor')
    if (cmElement) {
      cmElement.remove()
    }
    const output_parent = this.block.querySelector('.output-parent')
    if (output_parent) {
      output_parent.remove()
    }

    this.preEl.classList.remove('hide-code')
    this.codeEl.innerHTML = this.code_html
    this.codeEl.classList.remove('hide-code')

    this.resetBtn.classList.add('run-code-hidden')

    this.active = false
  }

  onMessageMethod(data: string[]) {
    this.terminal_output += data.join('')
    const output_el = this.output_el
    if (output_el) {
      output_el.innerHTML = ansi_converter.toHtml(this.terminal_output)
      // scrolls to the bottom of the div
      output_el.scrollIntoView(false)
    }
  }
}

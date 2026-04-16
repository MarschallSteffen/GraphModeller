const PROMPT = `You are generating a diagram file for "Archetype" — a browser-based multi-diagram modeller.

Output a single valid JSON object. Do not include any explanation, markdown fences, or comments.

## Format

\`\`\`json
{
  "version": 2,
  "name": "<diagram title>",
  "elements": [ ... ],
  "connections": [ ... ]
}
\`\`\`

## Element types

Every element needs at minimum: \`"type"\`, \`"id"\` (short human-readable slug), and \`"name"\` (except start-state / end-state).
Omit \`position\` and \`size\` — the tool auto-lays elements out.

| type | diagram | extra fields |
|---|---|---|
| \`uml-class\` | UML Class | \`stereotype\`: "class"·"abstract"·"interface"·"enum" (default "class"); \`attributes\`: string array in UML notation e.g. \`"+ name: String"\`, \`"- id: int"\`; \`methods\`: string array e.g. \`"+ save(): void"\`; \`packageId\`: id of a uml-package to scope it into |
| \`uml-package\` | UML Class | \`name\`; give explicit \`position\` + \`size\` to act as a container |
| \`agent\` | TAM Block | \`name\`; \`multiInstance\`: true for parallel instances |
| \`human-agent\` | TAM Block | \`name\` — person/user icon |
| \`storage\` | TAM Block | \`name\` — database/storage icon |
| \`queue\` | TAM Block | \`name\` — message queue pill; \`flowReversed\`: true to flip arrow direction |
| \`use-case\` | Use Case | \`name\` |
| \`uc-actor\` | Use Case | \`name\` — stick figure |
| \`uc-system\` | Use Case | \`name\` — system boundary box; give explicit \`position\` + \`size\` |
| \`state\` | State | \`name\` |
| \`start-state\` | State | no name needed |
| \`end-state\` | State | no name needed |
| \`seq-diagram\` | Sequence | give explicit \`position\` + \`size\`; nested \`lifelines\` array (see below) |

### Sequence diagram lifelines

Inside a \`seq-diagram\` element, include a \`lifelines\` array. Each lifeline:
\`\`\`json
{
  "id": "ll-name",
  "elementType": "seq-lifeline",
  "name": "ComponentName",
  "position": { "x": 20, "y": 0 },
  "size": { "w": 140, "h": 40 },
  "messages": [
    {
      "id": "m1",
      "label": "doSomething()",
      "targetLifelineId": "ll-other",
      "kind": "sync",
      "slotIndex": 0
    }
  ]
}
\`\`\`
- Lifeline \`position.x\` is relative to the seq-diagram container; space them ~160px apart.
- Message \`kind\`: "sync" | "async" | "create" | "return" | "self"
- Message \`targetLifelineId\`: null for self-calls (use kind "self" instead)
- \`slotIndex\`: sequential integers starting at 0 across all lifelines (determines vertical ordering)

## Connections

\`\`\`json
{ "id": "c1", "source": "<element-id>", "target": "<element-id>", "type": "<type>", "label": "optional", "sourceMultiplicity": "1", "targetMultiplicity": "*" }
\`\`\`

Connection types by diagram:
- **UML Class**: \`association\` · \`composition\` · \`aggregation\` · \`inheritance\` · \`realization\` · \`dependency\` · \`plain\`
- **TAM Block**: \`request\` · \`write\` · \`read\` · \`read-write\`
- **Use Case**: \`uc-association\` · \`uc-extend\` · \`uc-include\` · \`uc-specialization\`
- **State**: \`transition\` (add \`label\` for the trigger/guard)

All connection fields except \`source\` and \`target\` are optional (defaults: type="association", label="", multiplicities="").

## Rules

- IDs must be unique across the whole file and consistent between elements and connection references.
- You can mix multiple diagram types in one file — they stack vertically. Use \`position\` to separate sections (e.g. UML at y=0, TAM at y=700, Use Case at y=1200).
- Keep element names short and clear.
- For UML classes, use realistic attribute/method signatures.

## Task

<DESCRIBE YOUR DIAGRAM HERE — e.g. "A UML class diagram for an e-commerce system with Order, Product, Customer and Cart" or "A TAM block diagram showing a microservices architecture with an API gateway, three services, a message queue, and a database" or "A sequence diagram showing the OAuth2 authorization code flow">`.trim()

export class AiPromptButton {
  private btn: HTMLButtonElement

  constructor(container: HTMLElement) {
    this.btn = document.createElement('button')
    this.btn.classList.add('ai-prompt-btn')
    this.btn.innerHTML = `
      <svg class="ai-sparkle" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1 L9.2 5.8 L14 7 L9.2 8.2 L8 13 L6.8 8.2 L2 7 L6.8 5.8 Z" fill="currentColor"/>
        <path d="M13 1 L13.6 3.4 L16 4 L13.6 4.6 L13 7 L12.4 4.6 L10 4 L12.4 3.4 Z" fill="currentColor" opacity="0.7"/>
        <path d="M3 10 L3.5 12 L5.5 12.5 L3.5 13 L3 15 L2.5 13 L0.5 12.5 L2.5 12 Z" fill="currentColor" opacity="0.5"/>
      </svg>
      <span class="ai-prompt-label">Copy AI prompt</span>
    `
    this.btn.title = 'Copy prompt to generate a diagram with AI'
    this.btn.addEventListener('click', () => this.copyPrompt())
    container.appendChild(this.btn)
  }

  private async copyPrompt() {
    await navigator.clipboard.writeText(PROMPT)
    const label = this.btn.querySelector('.ai-prompt-label') as HTMLSpanElement
    const original = label.textContent!
    label.textContent = 'Copied!'
    this.btn.classList.add('ai-prompt-btn--copied')
    setTimeout(() => {
      label.textContent = original
      this.btn.classList.remove('ai-prompt-btn--copied')
    }, 2000)
  }
}

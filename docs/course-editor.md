# Course editor architecture

E3 introduced the hybrid editor at `/courses/new`. E4.1 adds explicit browser-local saving and loading through a repository boundary. The React UI calls independently tested commands, commands return immutable V2 course documents, the reducer records bounded history, and the E2 Zod validator evaluates every committed document. React components do not mutate source documents or define parallel content contracts.

## Structure and commands

The structure navigator edits modules, optional sections, and lessons through stable UUIDs. New modules begin in direct-lesson mode. Converting one to section mode is an explicit confirmed command that moves every existing lesson into `Section 1`; the editor never mixes direct lessons and sections or silently discards content. Destructive operations require browser confirmation. Array position remains display order.

## State and history

The reducer owns the working document, structural/block selection, edit/preview mode, dirty state, validation issues, and up to 50 prior documents. Document commits clear redo history. Undo and redo support consecutive operations. Selection and mode changes do not create history. Text inputs generally commit on blur, and Tiptap commits validated JSON on blur, preventing one history entry per keystroke.

Unsaved working changes remain in memory, while an explicit Save writes a safe draft snapshot to IndexedDB. Saved drafts reopen at `/courses/:id/edit`; missing IDs are never fabricated. There is no autosave, publishing, cloud synchronization, or Firebase behavior.

## Blocks and rich text

The palette is generated from the E2 block registry and its course permissions. Authors can insert, delete, duplicate, select, move with arrow controls, or reorder vertically with pointer/keyboard dnd-kit sensors. Rich text, image, code, callout, divider, table, quiz, exercise, expected output, and solution blocks have typed minimum controls. Optional solution code has display support but its dedicated editing control remains future work.

Tiptap uses paragraphs, headings, bold, italic, underline, safe links, bullet/ordered lists, inline code, and blockquotes. Code blocks, horizontal rules, strike, arbitrary HTML, and unsupported extensions are disabled. The authoritative value is ProseMirror JSON, never HTML. JSON must pass the E2 rich-text schema before it is committed.

E3 corrected a narrow E2 interoperability defect: Tiptap includes ordered-list start attributes and safe link `target`, `rel`, `class`, and `title` metadata in serialized JSON. These exact attributes are now allowlisted and tested; arbitrary attributes and unsafe protocols remain rejected.

## Validation and preview

Incomplete editing states are allowed. Full E2 validation runs after each committed command and is shown as a summary, field feedback, and path-based inspector issues. Invalid state does not block further typing.

Preview is read-only and follows the current module, lesson, and block order. It never executes code, sends requests, submits assessments, or runs exercises. It is clearly labeled as a standalone visual approximation rather than learner-application parity.

Persistence, route loading, conflict handling, assets, publishing, and verified learner rendering remain future work.

# MS Office Plugin — Research & Architecture

> **Goal:** Enable a coding agent (e.g., OpenCode, Claude Code, Cursor) to read, edit, comment, and review Microsoft Office documents (Word, PowerPoint, Excel) like a normal user — via CLI commands or MCP protocol.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The OOXML Foundation](#the-ooxml-foundation)
3. [Approach A: Headless OOXML Manipulation (MCP Server)](#approach-a-headless-ooxml-manipulation-mcp-server)
4. [Approach B: Office JS Add-in (Live Document Bridge)](#approach-b-office-js-add-in-live-document-bridge)
5. [Approach C: Microsoft Work IQ MCP (Cloud-Native)](#approach-c-microsoft-work-iq-mcp-cloud-native)
6. [Approach D: COM/VSTO Automation (Windows-Only)](#approach-d-comvsto-automation-windows-only)
7. [Existing Open-Source Projects](#existing-open-source-projects)
8. [Per-App Capability Matrix](#per-app-capability-matrix)
9. [Recommended Architecture](#recommended-architecture)
10. [Implementation Plan](#implementation-plan)
11. [Open Questions](#open-questions)

---

## Executive Summary

There are four fundamentally different approaches to letting a coding agent interact with Office documents. They differ on a critical axis: **does the Office application need to be running?**

| Approach                | Office Running?   | Platform       | Fidelity           | Agent Integration       |
| ----------------------- | ----------------- | -------------- | ------------------ | ----------------------- |
| **A. Headless OOXML**   | No                | Cross-platform | High (file-level)  | MCP server / CLI        |
| **B. Office JS Add-in** | Yes (desktop/web) | Cross-platform | Highest (live doc) | WebSocket bridge to MCP |
| **C. Work IQ MCP**      | No (cloud)        | Cross-platform | Medium (OneDrive)  | Native MCP              |
| **D. COM/VSTO**         | Yes (desktop)     | Windows only   | Highest            | COM bridge              |

**Recommendation:** Start with **Approach A** (headless OOXML via MCP server in TypeScript) because it's cross-platform, doesn't require Office to be running, aligns with brainkit's TypeScript stack, and has the strongest existing ecosystem. Optionally layer **Approach B** on top later for live-document scenarios.

---

## The OOXML Foundation

All modern Office documents (.docx, .pptx, .xlsx) share the same underlying format: **Office Open XML (OOXML)**, standardized as ECMA-376 / ISO/IEC 29500.

### How it works

A `.docx` / `.pptx` / `.xlsx` file is a **ZIP archive** containing XML files:

```
document.docx/
├── [Content_Types].xml          # MIME types for all parts
├── _rels/.rels                  # Package-level relationships
├── docProps/
│   ├── app.xml                  # App metadata
│   └── core.xml                 # Dublin Core metadata (author, title, dates)
├── word/
│   ├── document.xml             # Main content (paragraphs, tables, images)
│   ├── styles.xml               # Style definitions
│   ├── comments.xml             # Comment threads
│   ├── numbering.xml            # List definitions
│   ├── footnotes.xml            # Footnotes
│   ├── endnotes.xml             # Endnotes
│   ├── header1.xml              # Headers
│   ├── footer1.xml              # Footers
│   ├── theme/theme1.xml         # Theme
│   └── _rels/document.xml.rels  # Relationships for document.xml
└── word/media/                  # Embedded images, etc.
```

PowerPoint (`.pptx`) follows the same pattern but with `ppt/` instead of `word/`:

```
presentation.pptx/
├── ppt/
│   ├── presentation.xml         # Main presentation
│   ├── slides/slide1.xml        # Individual slides
│   ├── slideLayouts/            # Layout templates
│   ├── slideMasters/            # Master slides
│   ├── theme/                   # Themes
│   └── media/                   # Images, videos
```

Excel (`.xlsx`) uses `xl/`:

```
workbook.xlsx/
├── xl/
│   ├── workbook.xml             # Workbook structure
│   ├── worksheets/sheet1.xml    # Individual sheets
│   ├── sharedStrings.xml        # String table
│   ├── styles.xml               # Cell styles
│   └── theme/                   # Themes
```

### Why this matters

Because OOXML files are just ZIP + XML, you can manipulate them **without Office installed**. This is the foundation of all headless approaches. Libraries like `docx` (Node.js), `python-docx`, `python-pptx`, and `jszip` + `@xmldom/xmldom` work directly with this format.

---

## Approach A: Headless OOXML Manipulation (MCP Server)

### Concept

Build an MCP server that operates on `.docx` / `.pptx` / `.xlsx` files directly by parsing/modifying the OOXML ZIP archive. The agent calls MCP tools to read, edit, comment, and compare documents. **Office does not need to be running.**

### Available Libraries

#### Word (.docx)

| Library                        | Language       | Strengths                                                    | Weaknesses                                                                |
| ------------------------------ | -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **`docx`** (dolanmiu)          | TypeScript/JS  | 5.9M weekly downloads, declarative API, great for generation | Primarily generation-oriented; modifying existing docs requires more work |
| **`mammoth`**                  | JS/Python/.NET | Converts .docx → HTML/Markdown, good for reading             | Read-only, no write-back                                                  |
| **`jszip` + `@xmldom/xmldom`** | TypeScript/JS  | Direct OOXML manipulation, zero-dependency approach          | Low-level, must understand OOXML spec                                     |
| **`python-docx`**              | Python         | Mature, well-documented, good for read+write                 | Python, not TypeScript                                                    |
| **`docxtpl`**                  | Python         | Template-based generation from existing docs                 | Python, template-focused                                                  |

#### PowerPoint (.pptx)

| Library               | Language | Strengths                                                                            | Weaknesses                  |
| --------------------- | -------- | ------------------------------------------------------------------------------------ | --------------------------- |
| **`python-pptx`**     | Python   | Most mature PPTX library, rich API (slides, shapes, charts, tables, text formatting) | Python                      |
| **`pptxgenjs`**       | JS       | Generate presentations from scratch                                                  | Generation only, no reading |
| **`jszip` + raw XML** | JS       | Direct OOXML manipulation                                                            | Very low-level              |

#### Excel (.xlsx)

| Library              | Language | Strengths                              | Weaknesses                |
| -------------------- | -------- | -------------------------------------- | ------------------------- |
| **`exceljs`**        | JS       | Read/write xlsx, streaming support     | Large, complex API        |
| **`xlsx` / SheetJS** | JS       | Fast parsing, good for data extraction | Community edition limited |
| **`openpyxl`**       | Python   | Full-featured xlsx read/write          | Python                    |

### Key Capabilities via OOXML

| Capability              | Word                     | PowerPoint                    | Excel | How                                       |
| ----------------------- | ------------------------ | ----------------------------- | ----- | ----------------------------------------- |
| **Read text content**   | ✅                       | ✅                            | ✅    | Parse XML from main content part          |
| **Modify text**         | ✅                       | ✅                            | ✅    | Modify XML runs/paragraphs                |
| **Add/read comments**   | ✅                       | ❌ (no comments in PPTX spec) | ✅    | `word/comments.xml`, `xl/comments*.xml`   |
| **Track changes**       | ✅ (write revisions XML) | ❌                            | ❌    | Generate `w:ins`/`w:del` revision markup  |
| **Add/remove slides**   | N/A                      | ✅                            | N/A   | Add/remove `ppt/slides/slideN.xml` + rels |
| **Modify shapes**       | N/A                      | ✅                            | N/A   | Modify shape XML in slide parts           |
| **Read/write cells**    | N/A                      | N/A                           | ✅    | Modify `xl/worksheets/sheetN.xml`         |
| **Preserve formatting** | ⚠️ Tricky                | ⚠️ Tricky                     | ✅    | Must preserve existing XML structure      |
| **Images**              | ✅                       | ✅                            | ✅    | Add to `media/` folder + relationships    |
| **Headers/footers**     | ✅                       | N/A                           | ✅    | Separate XML parts                        |
| **Styles**              | ✅                       | ✅                            | ✅    | `styles.xml`                              |

### Pros

- **Cross-platform** — works on macOS, Linux, Windows
- **No Office required** — pure file manipulation
- **TypeScript native** — aligns with brainkit stack
- **Fast** — no IPC overhead, direct file operations
- **Deterministic** — no UI state to worry about
- **MCP-native** — natural fit for agent tool calling

### Cons

- **No live document** — changes require reopening the file
- **Formatting preservation is hard** — especially for brownfield editing of complex documents
- **No rendered preview** — can't "see" what it looks like
- **Track changes authoring is complex** — generating valid revision markup requires deep OOXML knowledge

---

## Approach B: Office JS Add-in (Live Document Bridge)

### Concept

Build an Office Web Add-in that runs inside Word/PowerPoint/Excel, exposes a WebSocket or HTTP server, and bridges commands from an MCP server to the live Office JS API. The agent interacts with the **actively open document** in real-time.

### How Office JS Works

Office Add-ins are web applications (HTML/CSS/JS) that run in a task pane within Office. They use the Office JavaScript API:

```typescript
// Word example
await Word.run(async (context) => {
  const paragraphs = context.document.body.paragraphs;
  paragraphs.load("text");
  await context.sync();
  console.log(paragraphs.items.map((p) => p.text));
});
```

### Word JS API Capabilities (as of WordApi 1.6+)

| Capability           | API                                                                                   | Notes                              |
| -------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| Read paragraphs/text | `body.paragraphs`, `range.text`                                                       | Full document traversal            |
| Insert/modify text   | `range.insertText()`, `paragraph.insertParagraph()`                                   | At arbitrary positions             |
| Comments (CRUD)      | `range.getComments()`, `range.insertComment()`, `comment.reply()`, `comment.delete()` | Full thread support (API 1.4+)     |
| Track changes        | `body.getTrackedChanges()`, `trackedChange.accept()`, `trackedChange.reject()`        | Read/accept/reject (API 1.6+)      |
| Change tracking mode | `document.changeTrackingMode`                                                         | Enable/disable tracking (API 1.4+) |
| Bookmarks            | `document.getBookmarkRange()`, `range.insertBookmark()`                               | Named locations (API 1.4+)         |
| Content controls     | `ContentControl` class                                                                | Bounded labeled regions            |
| Search/replace       | `body.search()`, `range.search()`                                                     | With regex-like options            |
| Tables               | `body.insertTable()`, `table.getCell()`                                               | Full table manipulation            |
| Styles               | `paragraph.style`, `range.font`                                                       | Style application                  |
| Images               | `body.insertInlinePictureFromBase64()`                                                | Insert images                      |
| Events               | `onParagraphChanged`, `onCommentAdded`, etc.                                          | React to user changes              |

### PowerPoint JS API Capabilities (as of PowerPointApi 1.4+)

| Capability               | API                                                                        | Notes                            |
| ------------------------ | -------------------------------------------------------------------------- | -------------------------------- |
| Add/delete slides        | `presentation.slides.add()`, `slide.delete()`                              | With layout control              |
| Add shapes               | `shapes.addGeometricShape()`, `shapes.addTextBox()`, `shapes.addPicture()` | Full shape creation              |
| Modify shapes            | `shape.left`, `shape.top`, `shape.height`, `shape.width`                   | Position and size                |
| Text in shapes           | `shape.textFrame.textRange.text`                                           | Read/write text                  |
| Font formatting          | `textRange.font.bold`, `.italic`, `.size`, `.color`                        | Character-level                  |
| Tables                   | `shapes.addTable()`                                                        | Add tables to slides             |
| Group/ungroup            | `shapes.addGroup()`, `shapeGroup.ungroup()`                                | Shape grouping                   |
| Insert slides from file  | `presentation.insertSlidesFromBase64()`                                    | Merge presentations              |
| **No comments API**      | ❌                                                                         | Not available in JS API          |
| **No animations API**    | ❌                                                                         | Not available                    |
| **No speaker notes API** | ⚠️ Limited                                                                 | Read-only via `slide.notesSlide` |

### Architecture

```
┌──────────────┐     MCP (stdio/http)     ┌──────────────┐
│  Coding Agent │◄───────────────────────►│  MCP Server   │
│  (OpenCode etc)│                         │  (Node.js)    │
└──────────────┘                         └──────┬───────┘
                                                │ WebSocket
                                         ┌──────▼───────┐
                                         │ Office Add-in │
                                         │ (runs inside  │
                                         │  Word/PPT)    │
                                         └──────┬───────┘
                                                │ Office JS API
                                         ┌──────▼───────┐
                                         │  Live Document │
                                         └──────────────┘
```

### Pros

- **Live document interaction** — changes appear instantly
- **Highest fidelity** — uses Office's own APIs
- **Track changes natively** — proper author attribution
- **Comments with threading** — first-class API support
- **Cross-platform** — works in Word/PPT on web, Windows, Mac
- **Events** — can react to user changes in real-time

### Cons

- **Requires Office running** — must have the document open
- **Complex deployment** — add-in must be sideloaded or published
- **WebSocket bridge complexity** — bidirectional communication layer
- **Task pane UI** — add-in needs a minimal UI (could be headless-ish)
- **Authentication** — add-in identity and permissions
- **Can't create files from scratch** — works with open documents only

---

## Approach C: Microsoft Work IQ MCP (Cloud-Native)

### Concept

Microsoft's official **Work IQ MCP servers** (preview, launched early 2026) expose Office operations as MCP tools. The `mcp_WordServer` provides tools for creating/reading Word documents and managing comments, all through OneDrive/SharePoint.

### Available Tools (Work IQ Word — as of March 2026)

| Tool                     | Description                                               |
| ------------------------ | --------------------------------------------------------- |
| `WordCreateNewDocument`  | Create new doc in OneDrive root (HTML or plain text body) |
| `WordGetDocumentContent` | Fetch doc content + comments from OneDrive/SharePoint URL |
| `WordCreateNewComment`   | Add comment to document (by `driveId` + `documentId`)     |
| `WordReplyToComment`     | Reply to existing comment thread                          |

### Work IQ Ecosystem

Work IQ also provides MCP servers for:

- **Calendar** — CRUD events, accept/decline
- **Mail** — CRUD messages, reply, semantic search
- **SharePoint** — upload files, get metadata, search, manage lists
- **OneDrive** — manage files and folders
- **Teams** — chat, channels, messages
- **User** — org chart, profile, search

### Pros

- **Official Microsoft product** — maintained, documented, secure
- **Native MCP** — works directly with any MCP client (VS Code, Claude Code, Copilot)
- **No local Office needed** — cloud-native
- **Enterprise-ready** — SSO, compliance, admin controls

### Cons

- **Requires Microsoft 365 Copilot license** — enterprise pricing ($30/user/month)
- **Very limited tool surface** — only 4 Word tools, no PowerPoint/Excel yet
- **OneDrive/SharePoint only** — can't work with local files
- **Preview quality** — features may change
- **No editing** — can create and read, but can't modify existing document content
- **No track changes** — no support for reviewing edits
- **Latency** — cloud round-trips for every operation

### Verdict

Too limited and too expensive for our use case. Good to know exists but not viable as primary approach.

---

## Approach D: COM/VSTO Automation (Windows-Only)

### Concept

Use the Component Object Model (COM) to automate Office applications directly. VSTO (Visual Studio Tools for Office) provides .NET wrappers. Can also use VBA or PowerShell COM interop.

### How it works

```csharp
// C# with Office Interop
var wordApp = new Word.Application();
wordApp.Visible = true;
var doc = wordApp.Documents.Open(filePath);
doc.Paragraphs[1].Range.Text = "Modified text";
doc.Save();
```

```powershell
# PowerShell COM
$word = New-Object -ComObject Word.Application
$doc = $word.Documents.Open($path)
$doc.Content.Text
```

### Pros

- **Full Office object model** — access to every feature
- **Live document** — real-time interaction
- **Mature** — decades of documentation

### Cons

- **Windows only** — requires Windows + Office desktop installed
- **.NET Framework only** — VSTO cannot use .NET Core/.NET 5+
- **Not maintained** — Microsoft will not update VSTO or COM for modern .NET
- **Heavy** — requires full Office installation
- **Not TypeScript** — C#/VB.NET/VBA
- **Legacy** — Microsoft recommends Office JS Add-ins as the modern replacement

### Verdict

Not viable for a cross-platform TypeScript project. Listed for completeness.

---

## Existing Open-Source Projects

### safe-docx (UseJunior) — ⭐ Most Relevant

**What:** TypeScript MCP server for surgical editing of existing `.docx` files. Open source, MIT licensed.

**Stack:** `jszip` + `@xmldom/xmldom` (pure TypeScript, no Python/LibreOffice)

**23 MCP tools across 7 categories:**

| Category             | Tools                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Reading & Inspection | `read_file`, `grep`, `get_session_status`, `has_tracked_changes`, `get_comments`, `get_footnotes`, `extract_revisions` |
| Planning & Batch     | `init_plan`, `merge_plans`, `apply_plan`                                                                               |
| Text Editing         | `replace_text`, `insert_paragraph`                                                                                     |
| Comments & Footnotes | `add_comment`, `delete_comment`, `add_footnote`, `update_footnote`, `delete_footnote`                                  |
| Layout & Formatting  | `format_layout`                                                                                                        |
| Tracked Changes      | `accept_changes`, `compare_documents`                                                                                  |
| File Operations      | `save`, `clear_session`                                                                                                |

**Key design decisions:**

- Formatting-preserving: operates at the XML run level, never destroying paragraph structure
- Produces tracked-changes output for human review (clean copy + redlined version)
- Session-based: loads doc into memory, applies batch edits, saves
- Zod schemas for all tool parameters
- 990+ automated tests

**Install:**

```bash
npx -y @usejunior/safe-docx
# or
claude mcp add safe-docx -- npx -y @usejunior/safe-docx
```

**Relevance:** This is exactly the kind of project we'd want to build or extend. It handles the hardest part (formatting-preserving brownfield editing) and is TypeScript-native. Could be used as a dependency, inspiration, or starting point.

### Office-Word-MCP-Server (GongRzhe) — Archived

**What:** Python MCP server for Word documents using `python-docx`.

**54 tools** covering document creation, formatting, tables, images, headers/footers, protection.

**Stack:** Python + `python-docx` + FastMCP

**Status:** Archived (as of late 2025). Superseded by safe-docx for TypeScript workflows.

**Note:** More generation-focused than editing-focused.

### docx (dolanmiu) — Generation Library

**What:** TypeScript library for generating/modifying `.docx` files with a declarative API.

**Stats:** 5.9M weekly downloads, very active.

**Good for:** Creating new documents from scratch with full control over structure.

**Not ideal for:** Editing existing documents while preserving all formatting.

### mammoth.js — Reader/Converter

**What:** Converts `.docx` → HTML/Markdown. Available in JS, Python, Java, .NET.

**Good for:** Extracting content from Word documents for display or processing.

**Not ideal for:** Writing back to `.docx` format.

---

## Per-App Capability Matrix

What can an agent realistically do with each approach per application?

### Word

| Capability                       | Headless OOXML       | Office JS Add-in   | Work IQ MCP          |
| -------------------------------- | -------------------- | ------------------ | -------------------- |
| Read all text                    | ✅                   | ✅                 | ✅                   |
| Read structure (headings, lists) | ✅                   | ✅                 | ⚠️ (plain text only) |
| Edit text (preserve formatting)  | ✅ (hard but doable) | ✅                 | ❌                   |
| Add/read comments                | ✅                   | ✅                 | ✅                   |
| Track changes (read)             | ✅                   | ✅                 | ❌                   |
| Track changes (write)            | ✅ (complex)         | ✅ (native)        | ❌                   |
| Accept/reject changes            | ✅                   | ✅                 | ❌                   |
| Tables                           | ✅                   | ✅                 | ❌                   |
| Images                           | ✅                   | ✅                 | ❌                   |
| Headers/footers                  | ✅                   | ✅                 | ❌                   |
| Styles                           | ✅                   | ✅                 | ❌                   |
| Compare documents                | ✅ (diff)            | ⚠️ (limited)       | ❌                   |
| Create from scratch              | ✅                   | ⚠️ (open doc only) | ✅                   |
| Local files                      | ✅                   | ✅                 | ❌ (OneDrive only)   |

### PowerPoint

| Capability                          | Headless OOXML        | Office JS Add-in |
| ----------------------------------- | --------------------- | ---------------- |
| Read all text from slides           | ✅                    | ✅               |
| Read slide structure                | ✅                    | ✅               |
| Add/delete slides                   | ✅                    | ✅               |
| Add shapes (text boxes, geometrics) | ✅ (raw XML)          | ✅ (nice API)    |
| Modify shape text                   | ✅                    | ✅               |
| Modify shape position/size          | ✅                    | ✅               |
| Add images                          | ✅                    | ✅               |
| Add tables                          | ✅ (complex)          | ✅               |
| Font/text formatting                | ✅                    | ✅               |
| Speaker notes                       | ✅                    | ⚠️ (limited)     |
| Comments                            | ❌ (no standard)      | ❌               |
| Animations                          | ⚠️ (very complex XML) | ❌               |
| Charts                              | ⚠️ (embedded xlsx)    | ❌               |
| Slide masters/layouts               | ✅                    | ✅               |

### Excel

| Capability             | Headless OOXML | Office JS Add-in |
| ---------------------- | -------------- | ---------------- |
| Read/write cell values | ✅             | ✅               |
| Read/write formulas    | ✅             | ✅               |
| Cell formatting        | ✅             | ✅               |
| Tables                 | ✅             | ✅               |
| Charts                 | ⚠️ (complex)   | ✅               |
| Pivot tables           | ⚠️             | ✅               |
| Comments               | ✅             | ✅               |
| Named ranges           | ✅             | ✅               |
| Multiple sheets        | ✅             | ✅               |
| Conditional formatting | ⚠️             | ✅               |

---

## Recommended Architecture

### Phase 1: Headless OOXML MCP Server (Word)

Start with a TypeScript MCP server that manipulates `.docx` files directly. This is the highest-value, lowest-risk approach.

**Two paths:**

1. **Use safe-docx as a dependency** — it's MIT, TypeScript, well-tested, and handles the hardest problems (formatting-preserving edits, tracked changes, comments). Add our own tool surface on top.

2. **Build from primitives** — use `jszip` + `@xmldom/xmldom` for direct OOXML manipulation. More control but more work. The `docx` library can help with generation scenarios.

**Recommendation: Path 1** — leverage safe-docx for brownfield editing and `docx` for generation, wrapping both behind our own MCP tool interface.

### Phase 2: Add PowerPoint Support

Add PPTX tools using `python-pptx` (via a Python subprocess or bridge) or build a TypeScript OOXML handler for PresentationML. The TypeScript ecosystem for PPTX editing is much weaker than for DOCX.

**Options:**

- **Pure TypeScript:** `jszip` + raw XML manipulation of PresentationML. Most effort but stays in-stack.
- **Python bridge:** Shell out to a Python script using `python-pptx`. Pragmatic but adds Python dependency.
- **Build on pptxgenjs:** For generation-only scenarios.

### Phase 3: Add Excel Support (Optional)

Use `exceljs` (TypeScript) for read/write operations on `.xlsx` files.

### Phase 4: Office JS Add-in Bridge (Optional)

For users who want live-document interaction, build an Office Add-in that connects to the MCP server via WebSocket. This would enable:

- Real-time changes visible in the open document
- Proper track changes with author attribution
- User interaction (approve/reject changes in-place)

### Proposed MCP Tool Surface

```
# Word tools
word_read           — Read document content (text, structure, metadata)
word_read_section   — Read a specific section/heading/range
word_search         — Search for text with context
word_replace        — Replace text (preserving formatting)
word_insert         — Insert paragraph at position
word_comment_add    — Add comment on text range
word_comment_read   — Read all comments
word_comment_reply  — Reply to comment thread
word_comment_delete — Delete comment
word_changes_read   — Read tracked changes
word_changes_accept — Accept specific tracked change
word_changes_reject — Reject specific tracked change
word_compare        — Compare two document versions
word_save           — Save modified document
word_create         — Create new document from scratch

# PowerPoint tools
pptx_read           — Read presentation structure and text
pptx_slide_add      — Add new slide
pptx_slide_delete   — Delete slide
pptx_slide_read     — Read specific slide content
pptx_shape_add      — Add shape/text box to slide
pptx_shape_modify   — Modify shape text/position/style
pptx_image_add      — Add image to slide
pptx_table_add      — Add table to slide
pptx_notes_read     — Read speaker notes
pptx_notes_write    — Write speaker notes
pptx_save           — Save presentation

# Excel tools (future)
xlsx_read           — Read workbook structure
xlsx_cell_read      — Read cell values/formulas
xlsx_cell_write     — Write cell values/formulas
xlsx_range_read     — Read range of cells
xlsx_range_write    — Write range of cells
xlsx_save           — Save workbook
```

### Project Structure

```
office/                          # Sub-project root
├── package.json                 # TypeScript project with MCP SDK
├── tsconfig.json
├── src/
│   ├── index.ts                 # MCP server entry point
│   ├── server.ts                # MCP server setup
│   ├── word/
│   │   ├── tools.ts             # Word MCP tool definitions
│   │   ├── reader.ts            # OOXML reading
│   │   ├── writer.ts            # OOXML writing (formatting-preserving)
│   │   ├── comments.ts          # Comment operations
│   │   ├── tracked-changes.ts   # Revision markup
│   │   └── compare.ts           # Document comparison
│   ├── pptx/
│   │   ├── tools.ts             # PowerPoint MCP tool definitions
│   │   ├── reader.ts            # PPTX reading
│   │   └── writer.ts            # PPTX writing
│   ├── xlsx/
│   │   └── ...                  # Future Excel support
│   └── shared/
│       ├── ooxml.ts             # Shared OOXML ZIP/XML utilities
│       └── types.ts             # Shared types
└── __tests__/
    ├── word/
    ├── pptx/
    └── fixtures/                # Test .docx/.pptx/.xlsx files
```

---

## Implementation Plan

### Sprint 1: Word Reading & Basic Editing

- Set up MCP server with `@modelcontextprotocol/sdk`
- Implement `word_read` — extract full document content as structured text
- Implement `word_search` — search with surrounding context
- Implement `word_replace` — formatting-preserving text replacement
- Implement `word_insert` — insert paragraph at position
- Implement `word_save` — save to file

### Sprint 2: Word Comments & Track Changes

- Implement `word_comment_*` tools — full CRUD on comments
- Implement `word_changes_read` — extract tracked changes
- Implement `word_changes_accept/reject` — process changes
- Implement `word_compare` — diff two document versions

### Sprint 3: Word Document Creation

- Implement `word_create` — create new documents with heading/paragraph/table/image support
- Add style/template support

### Sprint 4: PowerPoint Support

- Implement `pptx_read` — read presentation structure
- Implement `pptx_slide_add/delete` — slide management
- Implement `pptx_shape_add/modify` — shape creation and editing
- Implement `pptx_save`

### Sprint 5: Excel Support (Optional)

- Basic cell read/write operations

---

## Open Questions

1. **Dependency vs. build from scratch?** Should we use `safe-docx` as a dependency (fastest, most battle-tested for brownfield editing) or build our own primitives using `jszip` + `@xmldom/xmldom` (more control, fewer dependencies)?

2. **Python for PowerPoint?** The TypeScript ecosystem for PPTX editing is weak. Is a Python subprocess bridge (`python-pptx`) acceptable, or should we build TypeScript OOXML handlers for PresentationML from scratch?

3. **Mono-repo or separate package?** Should this live as a sub-directory in brainkit or as a separate npm package?

4. **MCP transport?** stdio (simplest, for local agents) vs. HTTP/SSE (for remote/web scenarios)?

5. **Office JS Add-in?** Is live-document interaction valuable enough to justify the complexity of building an Office Add-in + WebSocket bridge? Or is headless-only sufficient?

6. **How to represent document content to the agent?** Options:
   - Plain text with structural markers (`## Heading`, `[comment: ...]`)
   - HTML (semantic, familiar to LLMs)
   - JSON (structured, precise)
   - Markdown (compact, natural for LLMs)
   - Token-optimized custom format (like safe-docx's "toon" format)

7. **Scope for "review"?** When the agent "reviews" a document, should it:
   - Add comments only?
   - Make tracked-changes edits for human review?
   - Produce a separate diff/redline document?
   - All of the above?

# Book Companion AI

Book Companion AI is an AI-assisted reading app for people who want to read dense books with less friction.

Version 0.1 focuses on uploading an EPUB, reading it in a clean browser-based reader, highlighting confusing passages, and asking AI questions without leaving the book.

## Why This Exists

I enjoy reading books, but it can be hard to focus during leisure time, especially after a long day of work or study. Deep reading often takes more energy than I have available, and when I run into a difficult passage, it is easy to lose momentum.

This project is my attempt to make reading feel more approachable and engaging. While reading, I want to be able to ask questions, get simple explanations, see examples, and understand the historical, psychological, or philosophical context behind a passage.

The goal is not to replace reading. The goal is to make it easier to stay curious, keep going, and learn faster while reading books that require more attention.

## Status

This repository is focused on the Version 0.1 build. Later work is grouped into Level 2 and Level 3 so the project can grow beyond the first reading-and-chat experience.

## Version 0.1 Scope

The first version includes:

- Upload an EPUB file
- Display the book in a clean web reader
- Navigate chapters
- Highlight a passage and ask AI about it
- Ask free-form questions about the book
- Retrieve relevant book context with embeddings and vector search
- Return AI answers with citations
- Save per-book chat history
- Add basic reading customization, such as font size and theme

## Roadmap

### Level 2: Learning Layer

- Structured notes from highlights and AI answers
- Review cards for active recall
- Saved or bookmarked questions
- Better retrieval quality
- Chapter-aware context

### Level 3: AI Product Layer

- Tool calling or agent workflows
- Evaluation dashboard
- Logs and observability
- User feedback on AI answers
- Deployment polish

### Future Ideas

These are useful, but not the immediate priority:

- PDF to semantic HTML conversion
- Auth and user accounts
- Export to Anki, Obsidian, or Notion

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL
- pgvector
- OpenAI embeddings
- Anthropic Claude

Planned UI component system:

- shadcn/ui for accessible, customizable React components

## Local Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

Create a `.env` file with the required local values:

```env
DATABASE_URL=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

## Notes

This project is intentionally built in stages. EPUB support comes first because EPUB files already contain structured HTML-like content, which makes it easier to validate the AI reading experience before adding more complex PDF conversion.

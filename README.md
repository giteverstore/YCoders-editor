# Ycoders Editor Studio

A standalone content-authoring application for Ycoders courses, practice, challenges, and projects. This repository contains the E1 foundation and application shell only.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Local development

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm run typecheck
npm run lint
npm run build
```

Use `npm run preview` to serve the production build locally.

## Environment variables

No environment variables are required for E1. Firebase, persistence, publishing, and authentication are intentionally not included.

## Deployment

The project is configured for an independent Vercel deployment. `vercel.json` sends application routes to `index.html` while leaving assets and file requests untouched.

## Current scope

- Responsive application shell
- Browser-local course draft management and functional course authoring
- Practice, challenge, and project editor placeholders
- Client-side routing and Not Found handling

Content schemas, editor blocks, autosave, asset uploads, and publishing belong to later milestones.

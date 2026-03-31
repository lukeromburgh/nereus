# NEREUS REDESIGN: COPILOT QUICK REFERENCE
## Developer Checklist & Shortcut Guide

---

## 🚀 QUICK START

1. **Open the main guide**: `GITHUB_COPILOT_PROMPTS.md`
2. **Choose your sprint**: Sprint 1–4 (4 weeks total)
3. **For each prompt**:
   - Copy prompt text
   - Paste into Copilot Chat or file comment
   - Review generated code
   - Run `npm run test` to verify
   - Commit with clear message

---

## 📋 SPRINT CHECKLIST

### Sprint 1: Foundation (Week 1)
**Goal**: Basic components + toast system  
**Time**: 5 days  
**Prompts**: 1.1 → 1.10

- [ ] **Prompt 1.1**: ConfigSection component
  - File: `frontend/src/components/ConfigSection.tsx`
  - Command: `npm run test -- ConfigSection`
  - Commit: `feat: add ConfigSection collapsible wrapper`

- [ ] **Prompt 1.2**: FieldWithHint component
  - File: `frontend/src/components/FieldWithHint.tsx`
  - Command: `npm run test -- FieldWithHint`
  - Commit: `feat: add FieldWithHint inline help`

- [ ] **Prompt 1.3**: SliderWithInput component
  - File: `frontend/src/components/SliderWithInput.tsx`
  - Command: `npm run test -- SliderWithInput`
  - Commit: `feat: add SliderWithInput editable slider`

- [ ] **Prompt 1.4**: StatusPill component
  - File: `frontend/src/components/StatusPill.tsx`
  - Command: `npm run test -- StatusPill`
  - Commit: `feat: add StatusPill with animations`

- [ ] **Prompt 1.5**: Toast system (library)
  - File: `frontend/src/lib/toast.ts`
  - Command: `npx tsc --noEmit` (type check)
  - Commit: `feat: add toast notification system`

- [ ] **Prompt 1.6**: ToastContainer component
  - File: `frontend/src/components/ToastContainer.tsx`
  - Command: `npm run test -- ToastContainer`
  - Commit: `feat: add global toast container`

- [ ] **Prompt 1.7**: useRunSimulation hook
  - File: `frontend/src/hooks/useRunSimulation.ts`
  - Command: `npx tsc --noEmit`
  - Commit: `feat: add useRunSimulation with toast integration`

- [ ] **Prompt 1.8**: Integrate ToastContainer into App
  - File: `frontend/src/App.tsx`
  - Command: `npm run dev` and visually verify
  - Commit: `feat: integrate global toast system`

- [ ] **Prompt 1.9**: Example QuickControls component
  - File: `frontend/src/components/ConfigPanel/QuickControls.tsx`
  - Command: `npm run test -- QuickControls`
  - Commit: `feat: add example quick controls component`

- [ ] **Prompt 1.10**: Tailwind config updates
  - File: `tailwind.config.ts`
  - Command: `npm run build` (check no Tailwind errors)
  - Commit: `style: add custom Tailwind utilities and animations`

**End of Sprint 1 Deliverable**: Run dev server, verify toast system works end-to-end
```bash
npm run dev
# Navigate to app
# Trigger a toast (try clicking buttons, errors)
# Verify toast appears bottom-right with proper styling
```

---

### Sprint 2: Layout & Cognition (Week 2)
**Goal**: Redesigned layout + metrics overlay  
**Time**: 5 days  
**Prompts**: 2.1 → 2.8

- [ ] **Prompt 2.1**: Refactor ConfigPanel
  - File: `frontend/src/components/ConfigPanel.tsx`
  - Command: `npm run test -- ConfigPanel`
  - Commit: `refactor: redesign ConfigPanel with ConfigSection`
  - ⚠️ **Breaking change**: This replaces existing ConfigPanel
  - **Action**: Test thoroughly, compare old vs new side-by-side

- [ ] **Prompt 2.2**: RunsCardGrid component
  - File: `frontend/src/components/Sidebar/RunsCardGrid.tsx`
  - Command: `npm run test -- RunsCardGrid`
  - Commit: `feat: add RunsCardGrid with inline metrics`

- [ ] **Prompt 2.3**: Sidebar refactor
  - File: `frontend/src/components/Sidebar.tsx`
  - Command: `npm run test -- Sidebar`
  - Commit: `refactor: redesign Sidebar for 10% width layout`
  - **Integration**: Use RunsCardGrid here

- [ ] **Prompt 2.4**: MetricsHUD component
  - File: `frontend/src/components/VTK/MetricsHUD.tsx`
  - Command: `npm run test -- MetricsHUD`
  - Commit: `feat: add MetricsHUD overlay to viewport`

- [ ] **Prompt 2.5**: LogConsoleCompact component
  - File: `frontend/src/components/LogConsole/LogConsoleCompact.tsx`
  - Command: `npm run test -- LogConsoleCompact`
  - Commit: `feat: add compact log console with progress`

- [ ] **Prompt 2.6**: Update App.tsx layout
  - File: `frontend/src/App.tsx`
  - Command: `npm run dev` and visually verify layout
  - Commit: `refactor: redesign App layout to 4-column + overlays`
  - ⚠️ **Breaking change**: Complete layout rewrite
  - **Action**: Test all existing panels still work

- [ ] **Prompt 2.7**: useLivePreview hook
  - File: `frontend/src/hooks/useLivePreview.ts`
  - Command: `npx tsc --noEmit`
  - Commit: `feat: add useLivePreview hook for slider updates`
  - **Integration**: Hook into SliderWithInput.onLivePreview

- [ ] **Prompt 2.8**: Add validation to Zustand store
  - File: `frontend/src/store/useSimStore.ts`
  - Command: `npx tsc --noEmit`
  - Commit: `feat: add field validation to Zustand store`

**End of Sprint 2 Deliverable**: Full layout redesign complete
```bash
npm run dev
# Verify:
# - Sidebar is 10% width, compact
# - Viewport is ~50% width, centered
# - Config panel is 40%, right side
# - MetricsHUD appears in top-left when run completes
# - Log console at bottom, compact by default
# - All existing functionality still works
```

---

### Sprint 3: Advanced Features (Week 3)
**Goal**: Validation, predictions, gallery  
**Time**: 5 days  
**Prompts**: 3.1 → 3.8

- [ ] **Prompt 3.1**: Add validation to ConfigPanel
  - File: `frontend/src/components/ConfigPanel.tsx`
  - Command: `npm run test -- ConfigPanel`
  - Commit: `feat: add inline validation feedback to config`

- [ ] **Prompt 3.2**: PredictionCard component
  - File: `frontend/src/components/ConfigPanel/PredictionCard.tsx`
  - Command: `npm run test -- PredictionCard`
  - Commit: `feat: add prediction card before simulation`

- [ ] **Prompt 3.3**: Gallery component
  - File: `frontend/src/components/Gallery/GalleryPanel.tsx`
  - Command: `npm run test -- GalleryPanel`
  - Commit: `feat: add gallery of example runs`
  - **Integration**: Add tab or section in Sidebar

- [ ] **Prompt 3.4**: ValidationTooltip component
  - File: `frontend/src/components/ValidationTooltip.tsx`
  - Command: `npm run test -- ValidationTooltip`
  - Commit: `feat: add reusable validation tooltip`
  - **Integration**: Used by ConfigPanel for inline errors

- [ ] **Prompt 3.5**: useRunComparison hook
  - File: `frontend/src/hooks/useRunComparison.ts`
  - Command: `npx tsc --noEmit`
  - Commit: `feat: add run comparison hook (prep for future)`

- [ ] **Prompt 3.6**: Enhance useRunSimulation with predictions
  - File: `frontend/src/hooks/useRunSimulation.ts`
  - Command: `npm run test -- useRunSimulation`
  - Commit: `feat: integrate predictions into run hook`

- [ ] **Prompt 3.7**: AnimatedPanel wrapper
  - File: `frontend/src/components/AnimatedPanel.tsx`
  - Command: `npm run test -- AnimatedPanel`
  - Commit: `feat: add framer-motion panel transitions`

- [ ] **Prompt 3.8**: ErrorBoundary component
  - File: `frontend/src/components/ErrorBoundary.tsx`
  - Command: `npm run test -- ErrorBoundary`
  - Commit: `feat: add error boundary for crash protection`
  - **Integration**: Wrap VtkViewport, ConfigPanel

**End of Sprint 3 Deliverable**: Advanced UX features complete
```bash
npm run dev
# Verify:
# - Invalid parameter shows red error, [Run] disabled
# - Warning parameter shows yellow warning, [Run] enabled
# - Prediction card shows estimated results
# - Gallery loads, copy parameters works
# - Animated panel transitions smooth
# - Error boundary catches errors gracefully
```

---

### Sprint 4: Polish & Testing (Week 4)
**Goal**: Types, tests, docs, CI/CD  
**Time**: 5 days  
**Prompts**: 4.1 → 4.13

- [ ] **Prompt 4.1**: TypeScript types file
  - File: `frontend/src/types/index.ts`
  - Command: `npx tsc --noEmit`
  - Commit: `types: add comprehensive type definitions`

- [ ] **Prompt 4.2**: ConfigSection unit tests
  - File: `frontend/src/components/__tests__/ConfigSection.test.tsx`
  - Command: `npm run test -- ConfigSection`
  - Commit: `test: add ConfigSection unit tests`

- [ ] **Prompt 4.3**: ConfigPanel integration tests
  - File: `frontend/src/components/__tests__/ConfigPanel.integration.test.tsx`
  - Command: `npm run test -- ConfigPanel`
  - Commit: `test: add ConfigPanel integration tests`

- [ ] **Prompt 4.4**: Accessibility tests
  - File: `frontend/src/components/__tests__/accessibility.test.tsx`
  - Command: `npm run test -- accessibility`
  - Commit: `test: add a11y tests for new components`

- [ ] **Prompt 4.5**: Visual regression tests
  - File: `frontend/cypress/e2e/visual-regression.cy.ts`
  - Command: `npx cypress open` (generate baselines)
  - Commit: `test: add visual regression test suite`
  - ⏱️ **Time**: First run generates baselines (~20 min)

- [ ] **Prompt 4.6**: Performance tests
  - File: `frontend/src/performance.test.ts`
  - Command: `npm run test -- performance`
  - Commit: `test: add performance benchmarks`

- [ ] **Prompt 4.7**: Responsive design tests
  - File: `frontend/cypress/e2e/responsive.cy.ts`
  - Command: `npx cypress open` and run
  - Commit: `test: add responsive design tests`

- [ ] **Prompt 4.8**: E2E user flow tests
  - File: `frontend/cypress/e2e/user-flows.cy.ts`
  - Command: `npx cypress run`
  - Commit: `test: add E2E user flow tests`

- [ ] **Prompt 4.9**: Storybook stories
  - File: `frontend/src/components/ConfigSection.stories.ts` (+ others)
  - Command: `npm run storybook`
  - Commit: `docs: add Storybook stories for components`

- [ ] **Prompt 4.10**: Testing documentation
  - File: `frontend/TESTING.md`
  - Command: `cat TESTING.md` (review for completeness)
  - Commit: `docs: add comprehensive testing guide`

- [ ] **Prompt 4.11**: Pre-commit hooks
  - File: `.husky/pre-commit`, `.lintstagedrc.json`
  - Command: `npx husky install`
  - Commit: `chore: add pre-commit hooks`

- [ ] **Prompt 4.12**: CI/CD pipeline
  - File: `.github/workflows/test.yml`
  - Command: `git push` and check GitHub Actions
  - Commit: `ci: add GitHub Actions test pipeline`

- [ ] **Prompt 4.13**: Mobile responsive adjustments
  - File: `frontend/src/components/App.tsx`
  - Command: `npm run dev` and test on mobile viewports
  - Commit: `style: add mobile responsive breakpoints`

**End of Sprint 4 Deliverable**: Production-ready codebase
```bash
# Run full test suite
npm run test
npm run test:coverage
npm run lint
npm run test:a11y

# Check build
npm run build

# All tests pass, coverage > 80%, no linting errors ✓
```

---

## 🧪 COMMON TEST COMMANDS

```bash
# Unit & integration tests
npm run test                    # Run all tests once
npm run test:watch            # Watch mode (re-run on file change)
npm run test -- ConfigSection # Run specific test
npm run test:coverage         # Generate coverage report

# E2E tests
npx cypress open              # Open Cypress UI (interactive)
npx cypress run               # Run headless
npx cypress run --spec "path/to/test.cy.ts"

# Linting & formatting
npm run lint                  # Check for errors
npm run lint:fix              # Fix auto-fixable errors
npm run format                # Format with Prettier

# Accessibility
npm run test:a11y             # Run axe scans

# Storybook
npm run storybook             # Start Storybook dev server

# Build & performance
npm run build                 # Build for production
npm run preview               # Preview production build locally
npm run type-check            # TypeScript check
```

---

## 🎯 QUALITY GATES (DO NOT MERGE WITHOUT THESE)

Before committing or pushing:

- [ ] **TypeScript**: `npx tsc --noEmit` — No type errors
- [ ] **Linting**: `npm run lint` — No linting errors
- [ ] **Tests Pass**: `npm run test` — All tests green
- [ ] **Coverage**: `npm run test:coverage` — Coverage > 80%
- [ ] **Build**: `npm run build` — Build succeeds
- [ ] **Visual Check**: `npm run dev` — Visually inspect changes
- [ ] **a11y**: `npm run test:a11y` — No a11y violations

**Git commit should ONLY happen if all pass:**
```bash
npm run lint && npm run test && npm run build && git commit -m "..."
```

---

## 🔑 KEY FILES TO UNDERSTAND

Before diving in, read these:

1. **Design System**: `Styles` doc (color system, spacing, typography)
2. **Architecture**: `Architecture_doc` (CFD pipeline, no changes needed for UI)
3. **VTK Integration**: `VTK` doc (3D rendering, understand before modifying)
4. **Component Tree**: `frontend/src/App.tsx` (main layout)
5. **State Management**: `frontend/src/store/useSimStore.ts` (Zustand store)
6. **API Integration**: `frontend/src/lib/api.ts` (axios/fetch wrapper)

---

## 🚨 GOTCHAS & KNOWN ISSUES

### Tailwind Classes
- ✅ Use `/` modifier for opacity: `bg-accent/10`, NOT `bg-accent opacity-10`
- ✅ Use `w-1/10`, `w-2/5` after adding to config
- ❌ Do NOT hardcode hex colors, use token system
- ❌ Do NOT add `rounded-lg`, max is `rounded-md`

### TypeScript
- ✅ Use strict null checking: all values can be null/undefined
- ✅ Import types from @/types
- ❌ Do NOT use `any` type, use `unknown` or specific type

### Component Patterns
- ✅ Use `export const ComponentName: React.FC<Props> = ...`
- ✅ Destructure props with TypeScript
- ✅ Use `useCallback` for event handlers to prevent re-renders
- ❌ Do NOT use class components (use functional + hooks)
- ❌ Do NOT use `useState` in loops or conditionals

### Testing
- ✅ Test user interactions, not implementation details
- ✅ Use `screen.getByRole`, `screen.getByText` (prefer accessibility queries)
- ✅ Mock `useSimStore` and API calls
- ❌ Do NOT test Tailwind classes directly
- ❌ Do NOT mock Lucide icons

### API Integration
- ✅ Toast feedback for all user actions
- ✅ Validate input BEFORE calling API
- ✅ Handle network errors gracefully
- ❌ Do NOT make API calls in render function
- ❌ Do NOT forget to clean up on unmount

---

## 📝 COMMIT MESSAGE CONVENTION

Follow this format for clarity:

```
type(scope): brief description

Optional longer explanation.

Fixes #123
```

Types:
- `feat`: New feature (Prompt output usually)
- `fix`: Bug fix
- `refactor`: Refactoring without behavior change
- `style`: CSS/styling only
- `test`: Tests only
- `docs`: Documentation only
- `chore`: Tooling, dependencies

Scopes:
- `components`: React components
- `hooks`: Custom React hooks
- `store`: Zustand store
- `lib`: Utilities and libraries
- `types`: TypeScript definitions
- `styles`: Tailwind/CSS
- `test`: Test infrastructure

Examples:
```
feat(components): add ConfigSection collapsible component
refactor(components): redesign ConfigPanel layout
test(components): add ConfigSection unit tests
chore(deps): upgrade Tailwind to 3.4
docs(testing): add test guide
```

---

## 🔗 USEFUL LINKS

- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Lucide Icons](https://lucide.dev/)
- [Framer Motion](https://www.framer.com/motion/)
- [React Testing Library](https://testing-library.com/react)
- [Cypress Docs](https://docs.cypress.io/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Storybook](https://storybook.js.org/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

## 🆘 TROUBLESHOOTING

### Copilot generated code that doesn't compile
1. Check imports are correct (file paths)
2. Check component prop types match interface definition
3. Run `npx tsc --noEmit` to see exact errors
4. Re-run Copilot with additional context ("I got error X, fix it")

### Tests fail after implementation
1. Check mocks are set up correctly (useSimStore, API)
2. Verify Tailwind classes are valid
3. Check component prop values in tests match component definition
4. Run tests with `--reporter=verbose` flag for details

### Styling looks wrong
1. Verify Tailwind config was updated (Sprint 1, Prompt 1.10)
2. Check for conflicting global CSS
3. Verify dark theme is properly applied
4. Use Tailwind DevTools browser extension to debug

### Build fails
1. Run `npm run type-check` to find TypeScript errors
2. Run `npm run lint` to find linting errors
3. Check for missing imports
4. Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`

---

## 📞 WHEN TO ASK FOR HELP

✅ Good times to ask Copilot:
- "I got error X, how do I fix it?"
- "Can you refactor this component to use hooks?"
- "Write tests for this component"
- "I need to add validation to this field"

❌ Not good times (ask team lead):
- "How should we structure the API?"
- "Should we use Redux or Zustand?" (already decided: Zustand)
- "What should this feature do?" (ask product manager)
- "I don't understand the CFD pipeline" (read Architecture_doc)

---

## 🎉 SUCCESS CRITERIA

By end of Sprint 4, verify:

- [ ] All 42 prompts completed and committed
- [ ] Test coverage > 80%
- [ ] All tests passing (unit, integration, E2E)
- [ ] No linting errors
- [ ] No TypeScript errors
- [ ] Build succeeds
- [ ] App runs in dev server without errors
- [ ] Mobile responsive (tested on 375px, 768px, 1920px viewports)
- [ ] Dark theme consistent
- [ ] Accessibility audit passes (WCAG 2.1 AA)
- [ ] Storybook stories render correctly
- [ ] Pre-commit hooks working
- [ ] CI/CD pipeline passing

**When all are ✓, you're ready to deploy!** 🚀

---

**Next**: Open `GITHUB_COPILOT_PROMPTS.md`, start with Sprint 1 Prompt 1.1, and copy the first prompt into Copilot.

Good luck! 💪

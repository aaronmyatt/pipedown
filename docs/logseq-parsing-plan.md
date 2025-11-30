# Plan: Parsing Logseq Outline Format Markdown for Pipedown

## Overview

This document outlines a plan for enabling pipedown to parse and execute markdown files written in Logseq's outline format. The approach is to **generalize the existing parser** to work regardless of whether headers, lists, and codeblocks are nested within lists themselves.

## Problem Statement

Logseq-managed markdown files have a distinct format where:
- Every line/block is preceded by a bullet (`- `)
- Nested content is indented with additional spaces/tabs
- Headings become `- # Heading` instead of just `# Heading`
- Code blocks become `` - ```ts `` instead of just `` ```ts ``

Currently, pipedown expects standard markdown format without bullet prefixes, which means Logseq files cannot be executed as pipedown scripts directly.

## Current Pipedown Syntax Recognition

Pipedown currently recognizes the following syntax patterns (from `mdToPipe.ts` and `rangeFinder.ts`):

| Pattern | Purpose |
|---------|---------|
| `# Heading` | Pipe name (level 1) and step names (level 2+) |
| `` ```ts/js `` | Code blocks for execution |
| `` ```json `` | Meta configuration blocks |
| `- if: /pointer` | Conditional execution check |
| `- check: /pointer` | Conditional execution check |
| `- when: /pointer` | Conditional execution check |
| `- route: /path` | Route matching |
| `- or: /pointer` | OR condition |
| `- and: /pointer` | AND condition |
| `- not: /pointer` | NOT condition |
| `- stop:` | Stop execution |
| `- only:` | Only run this step |
| `- flags: /path` | Flag checks |

## Approach: Generalize the Existing Parser

Instead of preprocessing Logseq files, we will modify the parser to **ignore list nesting depth** when identifying key elements. The core principle is:

> A `##` header and following codeblock become a function in the generated pipeline script. This happens **regardless of how nested in lists they are**. List syntax with recognized variants like `- if:` are still respected if they precede a codeblock.

### Key Insight

The markdown parser (pulldown-cmark) already tokenizes all elements correctly - it just happens that headings and code blocks can appear inside list items. The `rangeFinder.ts` already tracks these elements. The change is in how we **interpret** nesting rather than reject it.

## Implementation Plan

### Phase 1: Analyze Token Structure for Nested Content

First, understand how the markdown parser tokenizes Logseq-style content:

```markdown
- # My Pipeline
  - ## Step 1
    - ```ts
      console.log('Hello')
      ```
```

The parser will produce tokens like:
```
START LIST
START ITEM
START HEADING (level 1)
TEXT "My Pipeline"
END HEADING
START LIST (nested)
START ITEM
START HEADING (level 2)
TEXT "Step 1"
END HEADING
...
```

### Phase 2: Modify `rangeFinder.ts`

The `rangeFinder.ts` already collects ranges for headings, code blocks, meta blocks, and lists. **No changes needed here** - it already identifies these elements regardless of nesting.

### Phase 3: Modify `mdToPipe.ts` - Core Changes

#### 3.1 `findPipeName` - Already Works

The function finds a level-1 heading regardless of where it appears:
```typescript
const findPipeName = (input: mdToPipeInput) => {
  const headingRange = input.ranges.headings.find((hRange: number[]) => {
    const index = !hRange.length ? 0 : hRange[0];
    const level = pd.$p.get(input.tokens.at(index) || {}, "/level");
    return level === 1;  // Finds level 1 heading regardless of nesting
  });
  // ...
};
```

**Status**: ✅ Already works with nested headings

#### 3.2 `findSteps` - Already Works

The function finds all code blocks and associates them with preceding headings:
```typescript
const findSteps = (input: mdToPipeInput) => {
  input.pipe.steps = input.ranges.codeBlocks.map(
    (codeBlockRange: number[]): Step => {
      // Extract code from code block
    },
  ).map((step: Step, index: number, steps: Steps) => {
    // Find preceding heading for step name
  });
};
```

**Status**: ✅ Already works with nested code blocks

#### 3.3 `setupChecks` - Needs Modification

This is where the main change is needed. Currently, it only processes checks for code blocks that are **directly** inside a list:

```typescript
const setupChecks = (input: mdToPipeInput) => {
  // ...
  input.pipe.steps = input.pipe.steps.map((step: Step) => {
    step.inList = !!inRange(input.ranges.lists, step.range[0]);
    return step;
  })
```

**Modification needed**: Look for `- if:`, `- check:`, etc. patterns preceding a code block **regardless of list nesting depth**. The key is to find list items that precede the code block within the same parent context.

```typescript
const setupChecks = (input: mdToPipeInput) => {
  const inRange = (ranges: Array<number[]>, index: number) => {
    return ranges.find(([start, stop]: number[]) => {
      return start < index && stop > index;
    });
  }

  // Find the innermost list containing this code block
  const findInnermostList = (ranges: Array<number[]>, index: number) => {
    const containingLists = ranges
      .filter(([start, stop]: number[]) => start < index && stop > index);
    
    if (containingLists.length === 0) return undefined;
    
    // Sort by start ascending - the list that starts latest is innermost
    return containingLists.sort((a, b) => (a[0] - b[0])).at(-1);
  }

  input.pipe.steps = input.pipe.steps.map((step: Step) => {
    // Check if code block is in ANY list (including deeply nested)
    step.inList = !!inRange(input.ranges.lists, step.range[0]);
    return step;
  })
    .map((step: Step, stepIndex: number) => {
      if (step.inList) {
        // Find the innermost list containing this code block
        const listRange = findInnermostList(input.ranges.lists, step.range[0]);
        
        if (!listRange) return step;  // Guard against undefined

        // ... rest of check processing remains the same
      }
      return step;
    });
}
```

### Phase 4: Testing

Create test files that verify the parser works with:

1. **Standard format** (existing tests):
   ```markdown
   # My Pipeline
   ## Step 1
   ```ts
   console.log('Hello')
   ```
   ```

2. **Logseq format** (new tests):
   ```markdown
   - # My Pipeline
     - ## Step 1
       - ```ts
         console.log('Hello')
         ```
   ```

3. **Mixed format** (edge case):
   ```markdown
   # My Pipeline
   - ## Step 1
     - if: /enabled
     - ```ts
       console.log('Hello')
       ```
   ```

4. **Deeply nested**:
   ```markdown
   - - - # My Pipeline
         - - ## Step 1
               - if: /enabled
               - ```ts
                 console.log('Hello')
                 ```
   ```

### Test Files to Create

| File | Description |
|------|-------------|
| `test/logseq-basic.md` | Basic Logseq format with headings and code |
| `test/logseq-conditions.md` | Logseq format with if/check/route syntax |
| `test/logseq-deeply-nested.md` | Multiple levels of list nesting |

## File Changes Summary

| File | Changes |
|------|---------|
| `mdToPipe.ts` | Modify `setupChecks` to handle nested lists |
| `test/logseq-*.md` | New test fixtures for Logseq format |

## Key Principles

1. **No preprocessing**: Parse Logseq files directly without stripping bullets
2. **Depth-agnostic**: Headings and code blocks are recognized regardless of list nesting
3. **Check syntax preserved**: `- if:`, `- check:`, etc. work the same way, just within their local list context
4. **Backward compatible**: Standard pipedown files continue to work unchanged

## Risks and Considerations

1. **Ambiguous list context**: When a code block is nested in multiple lists, which list's items should provide the checks?
   - **Solution**: Use the innermost (most deeply nested) list that contains the code block

2. **Performance**: No additional overhead since we're not preprocessing

3. **Edge cases**: Mixed standard and Logseq format in the same file
   - **Solution**: The depth-agnostic approach handles this naturally

## Conclusion

The recommended approach is to:

1. **Generalize the parser** to recognize headings and code blocks regardless of list nesting
2. **Modify `setupChecks`** to find check patterns in the innermost enclosing list
3. **Preserve backward compatibility** with existing pipedown files
4. **Add comprehensive tests** for Logseq-formatted files

This approach requires minimal changes to the existing codebase while enabling full Logseq compatibility through a single, unified parser.

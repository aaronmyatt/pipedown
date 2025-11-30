# Plan: Parsing Logseq Outline Format Markdown for Pipedown

## Overview

This document outlines a plan for enabling pipedown to parse and execute markdown files written in Logseq's outline format. Logseq uses a bullet-first approach where every block of content is preceded by a `-` character, creating a hierarchical outline structure.

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

## Detection Strategy

### Option 1: Heuristic Detection (Recommended)

Detect Logseq format by analyzing the file content:

```typescript
const isLogseqFormat = (markdown: string): boolean => {
  const lines = markdown.split('\n').filter(line => line.trim().length > 0);
  
  // If the majority of non-empty lines start with "- ", it's likely Logseq
  const bulletLines = lines.filter(line => /^\s*-\s/.test(line));
  const bulletRatio = bulletLines.length / lines.length;
  
  // Consider it Logseq if >80% of lines are bullet-prefixed
  return bulletRatio > 0.8;
};
```

### Option 2: Explicit Flag

Allow users to specify the format via configuration:

```json
{
  "format": "logseq"
}
```

### Option 3: File Path Convention

Detect based on directory structure (e.g., files in a `journals/` or `pages/` directory typical of Logseq).

**Recommendation**: Start with Option 1 (heuristic detection) as it requires no user intervention and works for the majority of cases. Consider adding Option 2 as an override.

## Parsing Strategy

### Approach A: Pre-process Markdown (Recommended)

Strip bullet prefixes before passing to the existing parser:

```typescript
const preprocessLogseq = (markdown: string): string => {
  const lines = markdown.split('\n');
  
  return lines.map(line => {
    // Match leading whitespace + bullet + space
    const match = line.match(/^(\s*)-\s(.*)$/);
    if (match) {
      const indent = match[1];
      const content = match[2];
      // Preserve indentation structure, remove bullet
      return indent + content;
    }
    return line;
  }).join('\n');
};
```

**Advantages**:
- Minimal changes to existing parser
- Works with all existing pipedown syntax
- Easy to test and debug

**Disadvantages**:
- Loses Logseq-specific structure information
- Two-pass processing

### Approach B: Modify Parser to Handle Bullets

Extend `rangeFinder.ts` to recognize Logseq patterns:

```typescript
// In rangeFinder.ts, modify pattern matching to handle:
// - "- # Heading" as HEADING
// - "- ```ts" as CODE_BLOCK start
// - "- if: /pointer" (already works since it uses list items)
```

**Advantages**:
- Single-pass processing
- Preserves original structure

**Disadvantages**:
- More invasive changes to core parser
- Higher complexity

### Approach C: Support Logseq-Style Programmatic Syntax (Alternative)

Instead of stripping bullets, recognize keywords at line start:

| Current Syntax | Logseq Alternative |
|---------------|-------------------|
| `- if: /pointer` | `if /pointer` |
| `- check: /pointer` | `check /pointer` |
| `- route: /path` | `route /path` |

This approach treats the entire line as a command when a recognized keyword starts the line.

**Recommendation**: Start with **Approach A** (pre-processing) for simplicity, then consider **Approach C** as a future enhancement for cleaner Logseq syntax.

## Implementation Plan

### Phase 1: Detection and Basic Preprocessing

1. **Add Logseq detection utility** (`pdUtils.ts`):
   ```typescript
   export const detectLogseqFormat = (markdown: string): boolean => {
     const lines = markdown.split('\n').filter(line => line.trim().length > 0);
     const bulletLines = lines.filter(line => /^\s*-\s/.test(line));
     return bulletLines.length / lines.length > 0.8;
   };
   ```

2. **Add Logseq preprocessor** (`pdUtils.ts`):
   ```typescript
   export const preprocessLogseq = (markdown: string): string => {
     return markdown.split('\n').map(line => {
       const match = line.match(/^(\s*)-\s(.*)$/);
       return match ? match[1] + match[2] : line;
     }).join('\n');
   };
   ```

3. **Integrate into mdToPipe.ts**:
   ```typescript
   const parseMarkdown = (input: mdToPipeInput) => {
     let markdown = input.markdown || "";
     
     // Detect and preprocess Logseq format
     if (detectLogseqFormat(markdown)) {
       markdown = preprocessLogseq(markdown);
       input.isLogseq = true; // Flag for potential future use
     }
     
     input.tokens = md.parse(markdown);
   };
   ```

### Phase 2: Testing

1. Create test fixtures for Logseq-formatted markdown:
   - `test/logseq-basic.md` - Simple Logseq file with headings and code
   - `test/logseq-conditions.md` - Logseq file with if/check/route syntax
   - `test/logseq-nested.md` - Deeply nested Logseq outline

2. Add unit tests for:
   - Detection function accuracy
   - Preprocessing correctness
   - End-to-end pipe execution

### Phase 3: Edge Cases and Refinement

1. **Handle nested bullets properly**:
   - Preserve relative indentation
   - Handle mixed bullet styles (`-`, `*`, numbered lists)

2. **Handle code blocks within Logseq**:
   ```markdown
   - ```ts
     const x = 1;
     ```
   ```
   Should become:
   ```markdown
   ```ts
   const x = 1;
   ```
   ```

3. **Handle Logseq properties**:
   ```markdown
   - key:: value
   ```
   Consider preserving or converting to pipedown config.

### Phase 4: Future Enhancements (Optional)

1. **Alternative keyword syntax** (Approach C):
   - Recognize `if /pointer` at line start (without `- `)
   - Makes Logseq files more readable

2. **Bidirectional conversion**:
   - Tool to convert standard pipedown to Logseq format
   - Tool to convert Logseq to standard pipedown

3. **Logseq block references**:
   - Support `((block-id))` references for step composition

## Example Transformations

### Input: Logseq Format
```markdown
- # My Pipeline
- ## Step 1
- - if: /enabled
- - ```ts
    console.log('Hello')
    ```
- ## Step 2
- ```ts
  input.result = 42
  ```
```

### Output: Standard Pipedown Format
```markdown
# My Pipeline
## Step 1
- if: /enabled
- ```ts
  console.log('Hello')
  ```
## Step 2
```ts
input.result = 42
```
```

## File Changes Summary

| File | Changes |
|------|---------|
| `pdUtils.ts` | Add `detectLogseqFormat()` and `preprocessLogseq()` |
| `mdToPipe.ts` | Add preprocessing step in `parseMarkdown()` |
| `pipedown.d.ts` | Add `isLogseq?: boolean` to input type |
| `test/logseq-*.md` | New test fixtures |

## Risks and Considerations

1. **False positives**: Standard markdown with many list items could be detected as Logseq
   - Mitigation: Use high threshold (80%+) for detection
   - Mitigation: Allow explicit format override in config

2. **Indentation handling**: Logseq uses tabs/spaces for hierarchy
   - Mitigation: Normalize indentation during preprocessing

3. **Code block content**: Must not strip `-` from inside code blocks
   - Mitigation: Track code block state during preprocessing

4. **Performance**: Preprocessing adds overhead
   - Mitigation: Only preprocess when Logseq format detected

## Conclusion

The recommended approach is:

1. **Use heuristic detection** to automatically identify Logseq files
2. **Preprocess by stripping bullet prefixes** before parsing
3. **Preserve compatibility** with existing pipedown syntax
4. **Add comprehensive tests** for edge cases

This approach provides the smallest possible change to the existing codebase while enabling full Logseq compatibility.

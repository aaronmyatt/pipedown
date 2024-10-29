# Exports yo

// {"format": "esm", "outfile": "dist/exportIt.mjs"},
// {"format": "cjs", "outfile": "dist/exportIt.cjs"},
// {"format": "iife", "outfile": "dist/exportIt.js"}
```json
{
    "build": [
        {"format": "esm"},
        {"format": "cjs"},
        {"format": "iife"}
    ]
}
```

```ts
console.log('Hello World')
```
export default {
    exclude: [
        // Add patterns to exclude your Deno TypeScript files
        '**/*.ts', // Excludes all TypeScript files
    ],
    server: {
        watch: {
            ignored: [
                './functions/**/*',
                './pipes/**/*'
            ]
        }
    }
};

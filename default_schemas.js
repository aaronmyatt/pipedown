export const DEFAULT_FUNCTION = {
    id: 0,
    name: 'New Function',
    description: '',
    code: '',
    archived: false,
    render: false,
    transform: {
        prop: '',
    },
    dependency: false,
    execOnServer: false,
    defaultInput: {},
}

export const DEFAULT_PIPE = {
    id: 0,
    name: 'New Pipe',
    description: '',
    functions: [],
    archived: false,
}

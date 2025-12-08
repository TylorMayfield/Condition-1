module.exports = {
    packagerConfig: {
        ignore: [
            /^\/src/,
            /^\/node_modules/,
        ]
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {},
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin', 'win32'],
        },
    ],
};

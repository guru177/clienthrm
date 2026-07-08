const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'public', 'favicon.png');
const outputPng = path.join(__dirname, '..', 'public', 'images', 'icon.png');

sharp(inputPath)
    .resize(256, 256)
    .png()
    .toFile(outputPng)
    .then(() => {
        console.log('Successfully created icon.png (256x256)');
    })
    .catch(err => {
        console.error('Error converting:', err);
    });

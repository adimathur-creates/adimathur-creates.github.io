// Build a single self-contained index.html from src/ and docs/.
const fs = require('fs');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let html = fs.readFileSync('src/template.html', 'utf8');
html = html.replace('/*CORE*/', () => fs.readFileSync('src/core.js', 'utf8'))
           .replace('/*GUIDE*/', () => esc(fs.readFileSync('docs/integration-guide.md', 'utf8')))
           .replace('/*SQL*/', () => esc(fs.readFileSync('docs/queries.sql', 'utf8')));
fs.writeFileSync('index.html', html);
console.log('index.html', html.length, 'bytes');

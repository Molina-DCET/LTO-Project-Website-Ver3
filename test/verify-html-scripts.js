const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

console.log(`Found ${htmlFiles.length} HTML files in public/ directory.`);

let allValid = true;

htmlFiles.forEach(file => {
    const fullPath = path.join(publicDir, file);
    let content = fs.readFileSync(fullPath, 'utf8');
    let modified = false;

    // 1. Check style.css
    if (!content.includes('css/style.css')) {
        console.warn(`[WARN] ${file} is missing css/style.css link.`);
    }

    // 2. Check js/api.js
    if (!content.includes('js/api.js')) {
        console.log(`[FIXING] Adding js/api.js to ${file}...`);
        const baseName = file.replace('.html', '');
        const targetScript = `src="js/${baseName}.js"`;
        
        if (content.includes(targetScript)) {
            content = content.replace(targetScript, `src="js/api.js" defer></script>\n    <script ${targetScript}`);
            modified = true;
        } else if (content.includes('</body>')) {
            content = content.replace('</body>', `    <script src="js/api.js" defer></script>\n</body>`);
            modified = true;
        }
    }

    if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`✔ Patched ${file}`);
    } else {
        console.log(`✔ Verified ${file}`);
    }
});

console.log('--- ALL HTML FILES VERIFIED ---');

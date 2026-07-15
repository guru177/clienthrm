const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'frontend/src');

function findFiles(dir, filesList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            findFiles(filePath, filesList);
        } else if (filePath.endsWith('.tsx')) {
            filesList.push(filePath);
        }
    }
    return filesList;
}

const files = findFiles(directoryPath);
let modifiedCount = 0;

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');

    // Skip if already has useConfirm or no confirm()
    if (!content.includes('confirm(') || content.includes('useConfirm')) {
        continue;
    }
    
    // 1. Add import
    const lastImportIndex = content.lastIndexOf('import ');
    if (lastImportIndex !== -1) {
        const endOfImport = content.indexOf('\n', lastImportIndex);
        content = content.slice(0, endOfImport) + "\nimport { useConfirm } from '@/lib/confirm';" + content.slice(endOfImport);
    }

    // 2. Add `const confirm = useConfirm();` inside the component
    // Find the main component function (export default function X() { or const X = () => {)
    let compMatch = content.match(/export default function\s+\w+\(.*?\)\s*\{/);
    if (!compMatch) compMatch = content.match(/export function\s+\w+\(.*?\)\s*\{/);
    if (!compMatch) compMatch = content.match(/function\s+\w+\(.*?\)\s*\{/);
    if (!compMatch) compMatch = content.match(/const\s+\w+\s*=\s*\(.*?\)\s*=>\s*\{/);

    if (compMatch) {
        const insertPos = compMatch.index + compMatch[0].length;
        content = content.slice(0, insertPos) + "\n    const confirm = useConfirm();" + content.slice(insertPos);
    } else {
        console.log(`Could not find component root in ${file}`);
    }

    // 3. Replace confirm()
    // e.g. !confirm('text') -> !(await confirm({ description: 'text' }))
    // or confirm("text") -> await confirm({ description: "text" })
    
    content = content.replace(/!confirm\((.*?)\)/g, '!(await confirm({ description: $1 }))');
    content = content.replace(/if\s*\(\s*confirm\((.*?)\)\s*\)/g, 'if (await confirm({ description: $1 }))');

    // Edge case: if a function using confirm isn't async, we might have an issue, but mostly they are event handlers. We'll trust typescript to catch it if any.

    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
    modifiedCount++;
}

console.log(`Modified ${modifiedCount} files.`);

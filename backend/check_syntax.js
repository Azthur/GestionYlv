// Simple syntax check - if this file parses, the JS is valid
const fs = require('fs');
try {
    const code = fs.readFileSync('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'utf8');
    // Try to parse with Function constructor (won't execute, just parse)
    new Function(code);
    console.log('JS SYNTAX OK - no errors');
} catch(e) {
    console.log('JS SYNTAX ERROR:', e.message);
}

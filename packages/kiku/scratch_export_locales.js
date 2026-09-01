const fs = require('fs');
const path = require('path');

const localesDir = 'C:\\Users\\user\\Desktop\\huskel\\internal\\chat\\locales';
const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json'));

const allLocales = {};
files.forEach(f => {
  const langName = path.basename(f, '.json');
  const data = JSON.parse(fs.readFileSync(path.join(localesDir, f), 'utf8'));
  allLocales[langName] = data;
  console.log(`Loaded ${langName}: ${Object.keys(data).length} keys`);
});

fs.writeFileSync(
  'C:\\Users\\user\\Desktop\\sdk\\packages\\kiku\\src\\components\\ChatModal\\locales.json',
  JSON.stringify(allLocales, null, 2)
);
console.log('Successfully exported locales.json to packages/kiku!');

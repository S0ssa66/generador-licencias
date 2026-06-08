import fs from 'fs';
const content = fs.readFileSync('/Users/sossa/IA/generador-licencias/dist/assets/index-B4kMH9f-.js', 'utf8');
const sortIdx = content.indexOf('o.sort');
if (sortIdx !== -1) {
    console.log(content.substring(sortIdx + 1500, sortIdx + 3000));
} else {
    console.log('Not found');
}

import fs from 'fs';

const content = fs.readFileSync('scratch/deploy_args.json', 'utf8');
const needle = '.from(\'orders\')';
let pos = 0;
while ((pos = content.indexOf(needle, pos)) !== -1) {
  console.log('--- Match at pos', pos, '---');
  console.log(content.slice(pos, pos + 600));
  pos += needle.length;
}

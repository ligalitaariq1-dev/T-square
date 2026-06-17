import fs from 'fs';
import path from 'path';

const srcDir = path.join(process.cwd(), 'organization-website');
const destDir = path.join(process.cwd(), '.vercel', 'output', 'static');

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  fs.readdirSync(from).forEach(element => {
    const stat = fs.lstatSync(path.join(from, element));
    if (stat.isFile()) {
      fs.copyFileSync(path.join(from, element), path.join(to, element));
    } else if (stat.isDirectory()) {
      copyFolderSync(path.join(from, element), path.join(to, element));
    }
  });
}

try {
  console.log('Copying static assets to .vercel/output/static...');
  copyFolderSync(srcDir, destDir);
  console.log('Static assets copied successfully!');
} catch (err) {
  console.error('Error copying static assets:', err);
  process.exit(1);
}

const fs = require('fs');
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Prism Sidepanel</title>
  <script type="module" crossorigin src="./assets/index-DUPMwmAA.js"></script>
  <link rel="stylesheet" crossorigin href="./assets/index-CinHswMr.css">
</head>
<body>
  <div id="root"></div>
</body>
</html>`;
fs.writeFileSync('sidepanel/dist/index.html', html);
console.log('Final restoration complete.');

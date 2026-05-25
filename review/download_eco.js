const https = require('https');
const fs = require('fs');

const url = 'https://raw.githubusercontent.com/niklasf/eco/master/eco.json';
const dest = 'eco.json';

const file = fs.createWriteStream(dest);
https.get(url, function(response) {
  if (response.statusCode === 200) {
    response.pipe(file);
    file.on('finish', function() {
      file.close();
      console.log('Download complete');
    });
  } else {
    console.log(`Failed to download. Status code: ${response.statusCode}`);
  }
}).on('error', function(err) {
  fs.unlink(dest, () => {});
  console.log(`Error: ${err.message}`);
});
